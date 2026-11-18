-- Migration: 202611170001_fix_board_color_and_forwarding.sql
-- Objetivo:
-- 1. Adicionar a coluna color na tabela public.boards com valor padrão '#2563eb'
--    evitando o erro fatal "column b.color does not exist" na RPC forward_completed_task.
-- 2. Recriar a função forward_completed_task com tratamento defensivo em b.color e target_board.color.
-- 3. Garantir que o encaminhamento crie atomicamente a ramificação da tarefa e seus eventos de linhagem.

-- 1. Adicionar coluna color na tabela public.boards se ainda não existir
alter table public.boards
  add column if not exists color text default '#2563eb';

-- Preencher quadros existentes que estejam sem cor definida
update public.boards
   set color = '#2563eb'
 where color is null;

-- 2. Recriar RPC forward_completed_task com total conformidade de schema e segurança
create or replace function public.forward_completed_task(
  p_task_id uuid,
  p_target_board_id uuid,
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_orig public.tasks%rowtype;
  v_orig_board_name text := 'Quadro Geral';
  v_orig_board_color text := '#2563eb';
  v_orig_stage_name text := 'Concluído';
  v_orig_is_final boolean := false;
  v_target_board record;
  v_target_board_name text := 'Quadro Geral';
  v_target_board_color text := '#2563eb';
  v_target_stage_name text;
  v_target_is_final boolean := false;
  v_resolved_team_id uuid;
  v_resolved_assignee_id uuid := null;
  v_resolved_root_id uuid;
  v_new_task_id uuid;
  v_existing_branch public.tasks%rowtype;
  v_target_board_id_norm uuid;
begin
  -- 1. Autenticação estrita
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  select coalesce(full_name, 'Usuário') into v_actor_name
    from public.profiles where id = v_actor_id;

  -- 2. Trava da tarefa de origem com SELECT ... FOR UPDATE para evitar corridas
  select * into v_orig
    from public.tasks
   where id = p_task_id
     for update;

  if not found then
    raise exception 'Tarefa original não encontrada';
  end if;

  -- Idempotência: se já foi encaminhada, retorna a ramificação existente
  if v_orig.forwarded_at is not null then
    select * into v_existing_branch
      from public.tasks
     where origin_task_id = p_task_id
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'already_forwarded', true,
        'branch_task_id', v_existing_branch.id,
        'origin_task_id', p_task_id,
        'target_board_id', v_existing_branch.board_id,
        'target_stage_id', v_existing_branch.stage_id,
        'message', 'Esta tarefa já foi encaminhada anteriormente.'
      );
    end if;
  end if;

  -- 3. Validar se a tarefa original está na etapa final
  if v_orig.board_id is not null then
    select bs.name, bs.is_final into v_orig_stage_name, v_orig_is_final
      from public.board_stages bs
     where bs.id = v_orig.stage_id and bs.board_id = v_orig.board_id;
    if not found then
      select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
        from public.stages s where s.id = v_orig.stage_id;
    end if;

    select b.name, coalesce(b.color, '#2563eb') into v_orig_board_name, v_orig_board_color
      from public.boards b where b.id = v_orig.board_id;
  else
    select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
      from public.stages s where s.id = v_orig.stage_id;
  end if;

  if not coalesce(v_orig_is_final, false) and v_orig.completed_at is null then
    raise exception 'Apenas tarefas na etapa final podem ser encaminhadas para outro quadro.';
  end if;

  -- 4. Validar permissão na tarefa de origem
  if not (
    public.is_admin(v_actor_id)
    or (v_orig.board_id is null and public.is_team_member(v_orig.team_id, v_actor_id))
    or (v_orig.board_id is not null and public.can_access_board(v_orig.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para encaminhar esta tarefa';
  end if;

  -- 5. Validar quadro de destino e permissões
  v_target_board_id_norm := p_target_board_id;
  if v_target_board_id_norm is not null then
    select * into v_target_board from public.boards where id = v_target_board_id_norm;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    v_target_board_name := v_target_board.name;
    v_target_board_color := coalesce(v_target_board.color, '#2563eb');

    -- Quadro privado de outra equipe nunca pode ser destino
    if not public.can_create_task_in_board(v_target_board_id_norm, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    -- Não permitir ramificação no mesmo quadro de origem
    if v_orig.board_id is not distinct from v_target_board_id_norm then
      raise exception 'A ramificação não pode ser criada no mesmo quadro de origem.';
    end if;

    -- Prevenção de ciclos na linhagem
    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if exists (
      select 1 from public.task_lineage_events
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) or exists (
      select 1 from public.tasks
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) then
      raise exception 'Não é permitido encaminhar para um quadro que já faz parte da jornada desta tarefa (ciclo detectado).';
    end if;

    -- Equipe do quadro de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    end if;

    -- Validação da etapa no quadro de destino
    if v_target_board.type = 'custom' then
      select bs.name, bs.is_final into v_target_stage_name, v_target_is_final
        from public.board_stages bs
       where bs.id = p_target_stage_id and bs.board_id = v_target_board_id_norm;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select s.name, s.is_final into v_target_stage_name, v_target_is_final
        from public.stages s where s.id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    -- Destino é o Quadro Geral canônico
    v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if v_orig.board_id is null then
      raise exception 'A tarefa já pertence ao Quadro Geral e não pode ser ramificada para o mesmo quadro.';
    end if;

    select s.name, s.is_final into v_target_stage_name, v_target_is_final
      from public.stages s where s.id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  -- 6. Manter responsável apenas se pertencer à equipe de destino
  if v_orig.assignee_id is not null then
    if exists (
      select 1 from public.team_members m
       where m.team_id = v_resolved_team_id
         and m.user_id = v_orig.assignee_id
         and m.active
    ) then
      v_resolved_assignee_id := v_orig.assignee_id;
    else
      v_resolved_assignee_id := null;
    end if;
  end if;

  -- 7. Criar a nova tarefa ramificada no destino
  insert into public.tasks (
    title,
    description,
    team_id,
    assignee_id,
    client_id,
    stage_id,
    priority,
    due_at,
    tags,
    created_by,
    board_id,
    sprint_id,
    origin_task_id,
    root_task_id,
    completed_at,
    created_at,
    updated_at
  ) values (
    v_orig.title,
    v_orig.description,
    v_resolved_team_id,
    v_resolved_assignee_id,
    v_orig.client_id,
    p_target_stage_id,
    v_orig.priority,
    null,
    coalesce(v_orig.tags, '{}'),
    v_actor_id,
    v_target_board_id_norm,
    null,
    p_task_id,
    v_resolved_root_id,
    null,
    now(),
    now()
  ) returning id into v_new_task_id;

  -- 8. Clonar subtarefas não concluídas se existirem na original (limpas para novo ciclo)
  insert into public.task_checklist (
    task_id,
    title,
    done,
    position
  )
  select
    v_new_task_id,
    tc.title,
    false,
    tc.position
  from public.task_checklist tc
  where tc.task_id = p_task_id
  order by tc.position;

  -- 9. Marcar a tarefa de origem como encaminhada e concluída
  update public.tasks
     set forwarded_at = now(),
         forwarded_by = v_actor_id,
         completed_at = coalesce(completed_at, now()),
         root_task_id = v_resolved_root_id,
         updated_at = now()
   where id = p_task_id;

  -- 10. Registrar eventos imutáveis de linhagem
  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    p_task_id,
    v_resolved_root_id,
    v_orig.board_id,
    v_orig_board_name,
    v_orig_board_color,
    v_orig.stage_id,
    v_orig_stage_name,
    'forwarded',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'target_board_id', v_target_board_id_norm,
      'target_board_name', v_target_board_name,
      'target_task_id', v_new_task_id
    ),
    now()
  );

  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    v_new_task_id,
    v_resolved_root_id,
    v_target_board_id_norm,
    v_target_board_name,
    v_target_board_color,
    p_target_stage_id,
    v_target_stage_name,
    'created',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'origin_task_id', p_task_id,
      'from_board_name', v_orig_board_name
    ),
    now() + interval '1 millisecond'
  );

  return jsonb_build_object(
    'success', true,
    'branch_task_id', v_new_task_id,
    'origin_task_id', p_task_id,
    'target_board_id', v_target_board_id_norm,
    'target_stage_id', p_target_stage_id,
    'message', 'Tarefa encaminhada com sucesso gerando ramificação vinculada.'
  );
end;
$$;

revoke all on function public.forward_completed_task(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_completed_task(uuid, uuid, uuid, uuid) to authenticated;
