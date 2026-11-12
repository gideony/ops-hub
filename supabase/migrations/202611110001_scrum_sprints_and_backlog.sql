-- Migration: Fase 2 - Scrum, Sprints, Backlog e Burndown
-- 202611110001_scrum_sprints_and_backlog.sql

-- 1. Novas colunas em public.tasks para story points e ordenação no backlog
alter table public.tasks add column if not exists story_points integer not null default 0;
alter table public.tasks add column if not exists backlog_order integer not null default 0;

-- 2. Índice único parcial para garantir rigorosamente no máximo 1 sprint ativa por quadro
create unique index if not exists idx_unique_active_sprint_per_board
  on public.sprints(board_id)
  where status = 'active';

-- Índices de suporte para backlog e sprints
create index if not exists idx_tasks_scrum_backlog
  on public.tasks(board_id, backlog_order)
  where sprint_id is null;

create index if not exists idx_tasks_sprint_active
  on public.tasks(sprint_id)
  where sprint_id is not null;

-- 3. RPC atômica: Iniciar Sprint
create or replace function public.start_sprint(
  p_sprint_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_status text;
  v_start_date date;
  v_end_date date;
  v_task_count int;
  v_active_count int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id, status, start_date, end_date
    into v_board_id, v_status, v_start_date, v_end_date
    from public.sprints
   where id = p_sprint_id;

  if v_board_id is null then
    raise exception 'Sprint não encontrada';
  end if;

  if not public.can_manage_board(v_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar sprints deste quadro';
  end if;

  if v_status != 'planning' then
    raise exception 'Apenas sprints planejadas podem ser iniciadas (status atual: %)', v_status;
  end if;

  -- Validação de datas
  if v_start_date is null or v_end_date is null then
    raise exception 'A sprint deve conter data de início e término definidas';
  end if;

  if v_end_date < v_start_date then
    raise exception 'A data de término não pode ser anterior à data de início';
  end if;

  -- Validação de tarefas alocadas
  select count(*) into v_task_count
    from public.tasks
   where sprint_id = p_sprint_id;

  if v_task_count = 0 then
    raise exception 'A sprint deve conter ao menos uma tarefa para ser iniciada';
  end if;

  -- Validação de sprint ativa concorrente no mesmo quadro
  select count(*) into v_active_count
    from public.sprints
   where board_id = v_board_id and status = 'active';

  if v_active_count > 0 then
    raise exception 'Já existe uma sprint ativa neste quadro. Encerre-a antes de iniciar uma nova.';
  end if;

  -- Ativação atômica
  update public.sprints
     set status = 'active',
         updated_at = now()
   where id = p_sprint_id;

  return jsonb_build_object('success', true, 'sprint_id', p_sprint_id, 'status', 'active');
end $$;

revoke all on function public.start_sprint(uuid) from public;
grant execute on function public.start_sprint(uuid) to authenticated;

-- 4. RPC atômica: Mover tarefa entre Backlog e Sprint
create or replace function public.move_task_sprint(
  p_task_id uuid,
  p_sprint_id uuid, -- se null, volta ao backlog
  p_backlog_order int default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task_board_id uuid;
  v_sprint_board_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id into v_task_board_id
    from public.tasks
   where id = p_task_id;

  if v_task_board_id is null then
    raise exception 'Tarefa não encontrada ou não pertence a um quadro';
  end if;

  if not public.can_access_board(v_task_board_id, auth.uid()) then
    raise exception 'Sem permissão para alterar tarefas deste quadro';
  end if;

  if p_sprint_id is not null then
    select board_id into v_sprint_board_id
      from public.sprints
     where id = p_sprint_id;

    if v_sprint_board_id is null or v_sprint_board_id != v_task_board_id then
      raise exception 'A sprint especificada não pertence ao mesmo quadro da tarefa';
    end if;
  end if;

  update public.tasks
     set sprint_id = p_sprint_id,
         backlog_order = coalesce(p_backlog_order, 0),
         updated_at = now()
   where id = p_task_id;

  return jsonb_build_object('success', true, 'task_id', p_task_id, 'sprint_id', p_sprint_id);
end $$;

revoke all on function public.move_task_sprint(uuid, uuid, int) from public;
grant execute on function public.move_task_sprint(uuid, uuid, int) to authenticated;

-- 5. RPC atômica: Encerrar Sprint
create or replace function public.complete_sprint(
  p_sprint_id uuid,
  p_action_for_pending text default 'backlog', -- 'backlog' ou 'next_sprint'
  p_next_sprint_name text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_status text;
  v_next_sprint_id uuid;
  v_completed_count int := 0;
  v_pending_count int := 0;
  v_final_stage_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id, status
    into v_board_id, v_status
    from public.sprints
   where id = p_sprint_id;

  if v_board_id is null then
    raise exception 'Sprint não encontrada';
  end if;

  if not public.can_manage_board(v_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar sprints deste quadro';
  end if;

  if v_status != 'active' then
    raise exception 'Apenas sprints ativas podem ser encerradas (status atual: %)', v_status;
  end if;

  -- Coleta os IDs das etapas finais deste quadro
  select coalesce(array_agg(id), '{}')
    into v_final_stage_ids
    from public.board_stages
   where board_id = v_board_id and is_final = true;

  -- Conta tarefas concluídas e pendentes
  select count(*) filter (where stage_id = any(v_final_stage_ids)),
         count(*) filter (where not (stage_id = any(v_final_stage_ids)))
    into v_completed_count, v_pending_count
    from public.tasks
   where sprint_id = p_sprint_id;

  -- Tratamento das tarefas pendentes
  if v_pending_count > 0 then
    if p_action_for_pending = 'next_sprint' then
      -- Busca sprint planejada existente no mesmo quadro
      select id into v_next_sprint_id
        from public.sprints
       where board_id = v_board_id and status = 'planning'
       order by created_at asc
       limit 1;

      -- Se não existir, cria a próxima sprint planejada
      if v_next_sprint_id is null then
        insert into public.sprints(board_id, name, goal, status)
        values (
          v_board_id,
          coalesce(nullif(trim(p_next_sprint_name), ''), 'Sprint Seguinte'),
          'Sprint criada automaticamente para tarefas pendentes.',
          'planning'
        )
        returning id into v_next_sprint_id;
      end if;

      -- Move tarefas pendentes para a próxima sprint
      update public.tasks
         set sprint_id = v_next_sprint_id,
             updated_at = now()
       where sprint_id = p_sprint_id
         and not (stage_id = any(v_final_stage_ids));

    else
      -- Retorna ao backlog (sprint_id = null)
      update public.tasks
         set sprint_id = null,
             updated_at = now()
       where sprint_id = p_sprint_id
         and not (stage_id = any(v_final_stage_ids));
    end if;
  end if;

  -- Conclui a sprint atual
  update public.sprints
     set status = 'completed',
         updated_at = now()
   where id = p_sprint_id;

  return jsonb_build_object(
    'success', true,
    'sprint_id', p_sprint_id,
    'completed_tasks', v_completed_count,
    'pending_tasks', v_pending_count,
    'next_sprint_id', v_next_sprint_id
  );
end $$;

revoke all on function public.complete_sprint(uuid, text, text) from public;
grant execute on function public.complete_sprint(uuid, text, text) to authenticated;
