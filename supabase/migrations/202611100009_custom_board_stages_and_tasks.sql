-- Migration: 202611100009_custom_board_stages_and_tasks.sql
-- Objetivo: Suporte completo para criação de tarefas em quadros novos e edição dinâmica de etapas de quadros personalizados e visões de setor.

-- 1. Desvincular FKs diretas que impediam stage_id em board_stages
alter table public.tasks drop constraint if exists tasks_stage_id_fkey;
alter table public.task_movements drop constraint if exists task_movements_from_stage_id_fkey;
alter table public.task_movements drop constraint if exists task_movements_to_stage_id_fkey;

-- 2. Atualizar gatilho on_task_write para validar tanto etapas canônicas quanto etapas customizadas
create or replace function public.on_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_final boolean;
  allowed boolean;
  v_board_type text := 'general';
begin
  if new.board_id is not null then
    select type into v_board_type from public.boards where id = new.board_id;
  end if;

  if v_board_type = 'custom' then
    select is_final into target_final from public.board_stages where id = new.stage_id and board_id = new.board_id;
    if target_final is null then
      raise exception 'Etapa inválida para este quadro personalizado';
    end if;

    if tg_op = 'INSERT' then
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    else
      if new.created_by is distinct from old.created_by then
        raise exception 'Criador não pode ser alterado';
      end if;
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    end if;
  else
    -- Quadro Geral ou Visão de Setor
    select is_final into target_final from public.stages where id = new.stage_id;
    if target_final is null then
      raise exception 'Etapa inválida';
    end if;

    if tg_op = 'INSERT' then
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    else
      if new.created_by is distinct from old.created_by then
        raise exception 'Criador não pode ser alterado';
      end if;
      if new.stage_id is distinct from old.stage_id then
        if not public.is_admin(auth.uid()) then
          select exists(
            select 1 from public.stage_transitions
            where from_stage_id = old.stage_id and to_stage_id = new.stage_id
          ) into allowed;
          if not allowed then
            raise exception 'Transição não permitida: siga o fluxo guiado da equipe';
          end if;
        end if;
        new.completed_at := case when target_final then now() else null end;
      else
        new.completed_at := old.completed_at;
      end if;
      new.updated_at := now();
    end if;
  end if;

  return new;
end $$;

-- 3. Atualizar create_task_with_templates para suportar board_id e sprint_id
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
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not (public.is_admin(auth.uid()) or public.is_team_member(p_team_id, auth.uid())) then
    raise exception 'Sem acesso à equipe';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), auth.uid(), p_board_id, p_sprint_id)
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

grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;

-- 4. RPC para atualizar quadros e gerenciar etapas dinamicamente
create or replace function public.update_custom_board(
  p_board_id uuid,
  p_name text,
  p_description text default null,
  p_methodology text default 'kanban',
  p_team_id uuid default null,
  p_is_shared boolean default false,
  p_stage_ids uuid[] default array[]::uuid[],
  p_stages jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stage jsonb;
  v_pos int := 0;
  v_board_type text;
  v_stage_id uuid;
  v_kept_stage_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.can_manage_board(p_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar este quadro';
  end if;

  select type into v_board_type from public.boards where id = p_board_id;
  if v_board_type is null then raise exception 'Quadro não encontrado'; end if;

  update public.boards
  set name = p_name,
      description = p_description,
      methodology = coalesce(p_methodology, methodology),
      team_id = p_team_id,
      is_shared = coalesce(p_is_shared, false),
      stage_ids = case when v_board_type = 'sector_view' then coalesce(p_stage_ids, array[]::uuid[]) else stage_ids end,
      updated_at = now()
  where id = p_board_id;

  if v_board_type = 'custom' and p_stages is not null then
    for v_stage in select * from jsonb_array_elements(p_stages) loop
      v_stage_id := (v_stage->>'id')::uuid;
      if v_stage_id is not null and exists (select 1 from public.board_stages where id = v_stage_id and board_id = p_board_id) then
        update public.board_stages
        set name = coalesce(v_stage->>'name', name),
            color = coalesce(v_stage->>'color', color),
            position = v_pos,
            wip_limit = (v_stage->>'wip_limit')::int,
            is_final = coalesce((v_stage->>'is_final')::boolean, is_final)
        where id = v_stage_id and board_id = p_board_id;
        v_kept_stage_ids := array_append(v_kept_stage_ids, v_stage_id);
      else
        insert into public.board_stages(board_id, name, color, position, wip_limit, is_final)
        values (
          p_board_id,
          coalesce(v_stage->>'name', 'Etapa ' || (v_pos + 1)),
          coalesce(v_stage->>'color', '#3b82f6'),
          v_pos,
          (v_stage->>'wip_limit')::int,
          coalesce((v_stage->>'is_final')::boolean, false)
        )
        returning id into v_stage_id;
        v_kept_stage_ids := array_append(v_kept_stage_ids, v_stage_id);
      end if;
      v_pos := v_pos + 1;
    end loop;

    -- Se alguma etapa foi excluída, move as tarefas dela para a primeira etapa restante
    if array_length(v_kept_stage_ids, 1) > 0 then
      update public.tasks
      set stage_id = v_kept_stage_ids[1]
      where board_id = p_board_id and stage_id not in (select unnest(v_kept_stage_ids));

      delete from public.board_stages
      where board_id = p_board_id and id not in (select unnest(v_kept_stage_ids));
    end if;
  end if;
end;
$$;

grant execute on function public.update_custom_board(uuid, text, text, text, uuid, boolean, uuid[], jsonb) to authenticated;

notify pgrst, 'reload schema';
