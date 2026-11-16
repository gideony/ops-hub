-- Migration: 202611140001_board_permissions_forwarding_rls.sql
-- Objetivo: Garantir conformidade estrita de permissões e RLS:
-- 1. O usuário só pode encaminhar para quadros que enxerga e onde pode criar tarefas.
-- 2. Quadro privado de outra equipe nunca pode ser destino nem acessado.
-- 3. Funções com validação rigorosa de auth.uid(), search_path seguro e blindagem contra escalonamento.

-- 1. Função auxiliar: Verifica se o usuário tem permissão para criar ou encaminhar tarefas para um quadro
create or replace function public.can_create_task_in_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_user_id is null then false
    when p_board_id is null then true -- Quadro Geral / canônico
    else exists (
      select 1 from public.boards b
      where b.id = p_board_id
        and (
          public.is_admin(p_user_id)
          or b.is_shared
          or (b.team_id is not null and public.is_team_member(b.team_id, p_user_id))
          or (b.team_id is null and b.created_by = p_user_id)
        )
    )
  end;
$$;

revoke all on function public.can_create_task_in_board(uuid, uuid) from public;
grant execute on function public.can_create_task_in_board(uuid, uuid) to authenticated;

-- 2. Atualizar políticas de INSERT e UPDATE em public.tasks para blindar board_id
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and created_by = auth.uid()
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_admin(auth.uid())
  or (board_id is null and public.is_team_member(team_id, auth.uid()))
  or (board_id is not null and public.can_access_board(board_id, auth.uid()))
) with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

-- 3. Atualizar create_task_with_templates com validação estrita de board_id
create or replace function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}',
  p_board_id uuid default null,
  p_sprint_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_id uuid;
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'Não autenticado'; end if;
  if not (public.is_admin(v_actor_id) or public.is_team_member(p_team_id, v_actor_id)) then
    raise exception 'Sem acesso à equipe da tarefa';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;

  -- Validação estrita de quadro de destino: não permite criar em quadro privado de outra equipe
  if p_board_id is not null then
    if not public.can_create_task_in_board(p_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode criar tarefas em um quadro privado de outra equipe';
    end if;
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), v_actor_id, p_board_id, p_sprint_id)
    returning id into created_id;

  if p_template_ids is not null and array_length(p_template_ids, 1) > 0 then
    insert into public.task_checklist(task_id, title, position, group_name)
      select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
      from public.checklist_template_items item
      join public.checklist_template_groups template on template.id = item.group_id
      where item.group_id = any(coalesce(p_template_ids,'{}'))
        and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);
  end if;

  return created_id;
end $$;

revoke all on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) from public;
grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;

-- 4. Nova RPC atômica: Encaminhar tarefa para outro quadro com validação de permissões
create or replace function public.forward_task_to_board(
  p_task_id uuid,
  p_target_board_id uuid, -- se null, encaminha para o Quadro Geral
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_task record;
  v_target_board record;
  v_from_stage_id uuid;
  v_resolved_team_id uuid;
  v_is_target_final boolean := false;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Obter tarefa e validar existência
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  -- 2. Validar permissão de alteração na tarefa de origem
  if not (
    public.is_admin(v_actor_id)
    or (v_task.board_id is null and public.is_team_member(v_task.team_id, v_actor_id))
    or (v_task.board_id is not null and public.can_access_board(v_task.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para alterar esta tarefa';
  end if;

  -- 3. Validar se o usuário pode encaminhar para o quadro de destino
  if p_target_board_id is not null then
    select * into v_target_board from public.boards where id = p_target_board_id;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    -- Quadro privado de outra equipe nunca pode ser destino
    if not public.can_create_task_in_board(p_target_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    -- Resolver equipe de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    end if;

    -- Validar etapa de destino
    if v_target_board.type = 'custom' then
      select is_final into v_is_target_final
        from public.board_stages
       where id = p_target_stage_id and board_id = p_target_board_id;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select is_final into v_is_target_final
        from public.stages
       where id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    -- Destino: Quadro Geral / canônico
    v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    select is_final into v_is_target_final
      from public.stages
     where id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  -- 4. Gravação de auditoria em task_movements
  v_from_stage_id := v_task.stage_id;
  insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by, moved_at)
  values (p_task_id, v_from_stage_id, p_target_stage_id, v_actor_id, now());

  -- 5. Atualização atômica da tarefa
  update public.tasks
     set board_id = p_target_board_id,
         stage_id = p_target_stage_id,
         team_id = v_resolved_team_id,
         sprint_id = null, -- Reseta sprint se mudar de quadro
         completed_at = case when v_is_target_final then coalesce(completed_at, now()) else null end,
         updated_at = now()
   where id = p_task_id;

  return jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'board_id', p_target_board_id,
    'stage_id', p_target_stage_id,
    'team_id', v_resolved_team_id
  );
end $$;

revoke all on function public.forward_task_to_board(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_task_to_board(uuid, uuid, uuid, uuid) to authenticated;
