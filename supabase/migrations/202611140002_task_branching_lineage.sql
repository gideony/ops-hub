-- Migration: 202611140002_task_branching_lineage.sql
-- Objetivo: Suporte a encaminhamento de tarefa concluída com ramificação, prevenção de ciclos,
--           travamento no servidor da tarefa original e linha do tempo imutável com mascaramento de privacidade.

-- 1. Campos de ramificação na tabela public.tasks
alter table public.tasks
  add column if not exists origin_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists root_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists forwarded_at timestamptz default null,
  add column if not exists forwarded_by uuid references public.profiles(id) on delete set null;

-- Inicializar root_task_id para tarefas existentes que ainda não tenham
update public.tasks
   set root_task_id = id
 where root_task_id is null;

-- Restrição de unicidade parcial: garante que UMA tarefa original só pode ter UMA ramificação
create unique index if not exists tasks_single_branch_idx
  on public.tasks (origin_task_id)
  where origin_task_id is not null;

create index if not exists tasks_root_task_idx
  on public.tasks (root_task_id);

create index if not exists tasks_origin_task_idx
  on public.tasks (origin_task_id);

-- 2. Configurações por quadro na tabela public.boards ("Ao concluir")
alter table public.boards
  add column if not exists on_completion_action text not null default 'ask'
    check (on_completion_action in ('ask', 'suggest_default', 'none')),
  add column if not exists default_forward_board_id uuid references public.boards(id) on delete set null,
  add column if not exists default_forward_stage_id uuid default null;

-- 3. Tabela de linha do tempo e eventos imutáveis da jornada
create table if not exists public.task_lineage_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  root_task_id uuid not null,
  board_id uuid references public.boards(id) on delete set null,
  board_name text not null,
  board_color text,
  stage_id uuid,
  stage_name text not null,
  event_type text not null check (event_type in ('created', 'moved', 'completed', 'forwarded')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_lineage_events enable row level security;

create index if not exists task_lineage_events_root_idx
  on public.task_lineage_events (root_task_id, created_at asc);

create index if not exists task_lineage_events_task_idx
  on public.task_lineage_events (task_id, created_at asc);

-- RLS para task_lineage_events: usuários autenticados podem consultar
drop policy if exists task_lineage_events_select on public.task_lineage_events;
create policy task_lineage_events_select on public.task_lineage_events
  for select to authenticated using (true);

drop policy if exists task_lineage_events_insert on public.task_lineage_events;
create policy task_lineage_events_insert on public.task_lineage_events
  for insert to authenticated with check (true);

-- 4. Trigger de integridade: Travamento no servidor da tarefa concluída que já foi encaminhada
create or replace function public.check_forwarded_task_immutable()
returns trigger language plpgsql as $$
begin
  -- Se a tarefa já foi encaminhada, ela fica travada na etapa final
  if OLD.forwarded_at is not null then
    if NEW.stage_id <> OLD.stage_id then
      raise exception 'Esta tarefa já foi concluída e encaminhada para outro quadro e não pode ser reaberta ou movida.';
    end if;
    if NEW.completed_at is distinct from OLD.completed_at and NEW.completed_at is null then
      raise exception 'Esta tarefa já foi concluída e encaminhada e não pode ter seu status de conclusão removido.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_forwarded_task_immutable on public.tasks;
create trigger trg_check_forwarded_task_immutable
  before update on public.tasks
  for each row execute function public.check_forwarded_task_immutable();

-- 5. RPC Atômica para encaminhar tarefa concluída gerando ramificação
create or replace function public.forward_completed_task(
  p_task_id uuid,
  p_target_board_id uuid,     -- se null, encaminha para o Quadro Geral
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
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  -- Obter nome do operador
  select coalesce(full_name, 'Usuário') into v_actor_name
    from public.profiles where id = v_actor_id;

  -- 1. Trava pessimista na tarefa original para concorrência e duplo clique
  select * into v_orig
    from public.tasks
   where id = p_task_id
     for update;

  if not found then
    raise exception 'Tarefa original não encontrada';
  end if;

  -- 2. Idempotência estrita: se já foi encaminhada, retorna a ramificação existente
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

    select b.name, b.color into v_orig_board_name, v_orig_board_color
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

    -- Prevenção de ciclos: o destino não pode coincidir com o quadro de origem
    if v_orig.board_id is not distinct from v_target_board_id_norm then
      raise exception 'A ramificação não pode ser criada no mesmo quadro de origem.';
    end if;

    -- Prevenção de ciclos na linhagem ancestral
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

    -- Resolver equipe do quadro de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    end if;

    -- Validar etapa de destino
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
    -- Destino: Quadro Geral canônico
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

  -- 6. Resolver responsável (apenas se for membro ativo da equipe de destino)
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

  -- 7. Criar a nova tarefa (ramificação) no quadro de destino
  insert into public.tasks (
    title,
    description,
    team_id,
    assignee_id,
    client_id,
    stage_id,
    priority,
    due_at,            -- Prazo começa vazio
    tags,
    created_by,
    board_id,
    sprint_id,          -- Sprint começa vazio (vai para o backlog se Scrum)
    origin_task_id,     -- Aponta para a tarefa original
    root_task_id,       -- Preserva o início da cadeia
    completed_at,       -- Nulo
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

  -- 8. Atualizar a tarefa original: marca como encaminhada e trava
  update public.tasks
     set forwarded_at = now(),
         forwarded_by = v_actor_id,
         completed_at = coalesce(completed_at, now()),
         root_task_id = v_resolved_root_id,
         updated_at = now()
   where id = p_task_id;

  -- 9. Registrar eventos na linha do tempo imutável (task_lineage_events)
  -- Se for a primeira ramificação e ainda não existia evento de criação inicial, registra
  if not exists (select 1 from public.task_lineage_events where root_task_id = v_resolved_root_id and event_type = 'created') then
    insert into public.task_lineage_events (
      task_id, root_task_id, board_id, board_name, board_color,
      stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
    ) values (
      v_orig.id, v_resolved_root_id, v_orig.board_id, v_orig_board_name, v_orig_board_color,
      v_orig.stage_id, v_orig_stage_name, 'created', v_orig.created_by, 'Criador original', v_orig.created_at,
      jsonb_build_object('initial_task', true)
    );
  end if;

  -- Evento de conclusão/encaminhamento da original
  insert into public.task_lineage_events (
    task_id, root_task_id, board_id, board_name, board_color,
    stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
  ) values (
    v_orig.id, v_resolved_root_id, v_orig.board_id, v_orig_board_name, v_orig_board_color,
    v_orig.stage_id, v_orig_stage_name, 'forwarded', v_actor_id, v_actor_name, now(),
    jsonb_build_object(
      'target_board_id', v_target_board_id_norm,
      'target_board_name', v_target_board_name,
      'target_task_id', v_new_task_id
    )
  );

  -- Evento de entrada no novo quadro (ramificação)
  insert into public.task_lineage_events (
    task_id, root_task_id, board_id, board_name, board_color,
    stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
  ) values (
    v_new_task_id, v_resolved_root_id, v_target_board_id_norm, v_target_board_name, v_target_board_color,
    p_target_stage_id, v_target_stage_name, 'created', v_actor_id, v_actor_name, now(),
    jsonb_build_object(
      'branch_from_task_id', p_task_id,
      'from_board_name', v_orig_board_name
    )
  );

  return jsonb_build_object(
    'success', true,
    'branch_task_id', v_new_task_id,
    'origin_task_id', p_task_id,
    'target_board_id', v_target_board_id_norm,
    'target_stage_id', p_target_stage_id,
    'target_team_id', v_resolved_team_id,
    'message', 'Tarefa concluída e encaminhada com sucesso.'
  );
end;
$$;

revoke all on function public.forward_completed_task(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_completed_task(uuid, uuid, uuid, uuid) to authenticated;

-- 6. RPC para consultar a linha do tempo com mascaramento de segurança
create or replace function public.get_task_lineage(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_task public.tasks%rowtype;
  v_root_id uuid;
  v_events jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  v_root_id := coalesce(v_task.root_task_id, v_task.id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'task_id', e.task_id,
      'root_task_id', e.root_task_id,
      'event_type', e.event_type,
      'created_at', e.created_at,
      'actor_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.actor_name
        else 'Colaborador'
      end,
      'board_id', e.board_id,
      'board_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.board_name
        else 'Quadro Restrito'
      end,
      'board_color', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.board_color
        else '#64748b'
      end,
      'stage_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.stage_name
        else 'Etapa Restrita'
      end,
      'is_masked', not (e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)),
      'metadata', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.metadata
        else '{}'::jsonb
      end
    ) order by e.created_at asc
  ), '[]'::jsonb)
  into v_events
  from public.task_lineage_events e
  where e.root_task_id = v_root_id;

  return v_events;
end;
$$;

revoke all on function public.get_task_lineage(uuid) from public;
grant execute on function public.get_task_lineage(uuid) to authenticated;
