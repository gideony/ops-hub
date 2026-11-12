-- Migration: Quadros Kanban personalizados, visões de setor e Scrum
-- 202611100007_custom_boards_scrum.sql

-- 1. Tabela de Quadros
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null default 'custom' check (type in ('general', 'sector_view', 'custom')),
  methodology text not null default 'kanban' check (methodology in ('kanban', 'scrum')),
  team_id uuid references public.teams(id) on delete cascade,
  is_shared boolean not null default false,
  stage_ids uuid[] default '{}',
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Tabela de Etapas dos Quadros Personalizados
create table if not exists public.board_stages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  position integer not null default 0,
  wip_limit integer default null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Tabela de Sprints (Scrum)
create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  goal text,
  start_date date,
  end_date date,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Adicionar board_id e sprint_id em public.tasks
alter table public.tasks add column if not exists board_id uuid references public.boards(id) on delete cascade;
alter table public.tasks add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

-- Índices de performance
create index if not exists idx_tasks_board_id on public.tasks(board_id);
create index if not exists idx_tasks_sprint_id on public.tasks(sprint_id);
create index if not exists idx_boards_team_id on public.boards(team_id);
create index if not exists idx_board_stages_board on public.board_stages(board_id, position);
create index if not exists idx_sprints_board on public.sprints(board_id, status);

-- 5. Funções de auxílio para RLS
create or replace function public.can_access_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        public.is_admin(p_user_id)
        or b.is_shared
        or (b.team_id is not null and public.is_team_member(b.team_id, p_user_id))
      )
  );
$$;

create or replace function public.can_manage_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        public.is_admin(p_user_id)
        or (b.type = 'custom' and b.team_id is not null and public.is_team_manager(b.team_id, p_user_id))
        or (b.type = 'custom' and b.created_by = p_user_id)
      )
  );
$$;

-- 6. Habilitar RLS
alter table public.boards enable row level security;
alter table public.board_stages enable row level security;
alter table public.sprints enable row level security;

-- Políticas de RLS em boards
drop policy if exists boards_read on public.boards;
create policy boards_read on public.boards
  for select to authenticated
  using (public.can_access_board(id, auth.uid()));

drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards
  for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or (
      type = 'custom'
      and (
        (team_id is not null and public.is_team_manager(team_id, auth.uid()))
        or created_by = auth.uid()
      )
    )
  );

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards
  for update to authenticated
  using (public.can_manage_board(id, auth.uid()))
  with check (public.can_manage_board(id, auth.uid()));

drop policy if exists boards_delete on public.boards;
create policy boards_delete on public.boards
  for delete to authenticated
  using (public.can_manage_board(id, auth.uid()));

-- Políticas de RLS em board_stages
drop policy if exists board_stages_read on public.board_stages;
create policy board_stages_read on public.board_stages
  for select to authenticated
  using (public.can_access_board(board_id, auth.uid()));

drop policy if exists board_stages_write on public.board_stages;
create policy board_stages_write on public.board_stages
  for all to authenticated
  using (public.can_manage_board(board_id, auth.uid()))
  with check (public.can_manage_board(board_id, auth.uid()));

-- Políticas de RLS em sprints
drop policy if exists sprints_read on public.sprints;
create policy sprints_read on public.sprints
  for select to authenticated
  using (public.can_access_board(board_id, auth.uid()));

drop policy if exists sprints_write on public.sprints;
create policy sprints_write on public.sprints
  for all to authenticated
  using (public.can_manage_board(board_id, auth.uid()))
  with check (public.can_manage_board(board_id, auth.uid()));

-- Atualização na política de leitura de tarefas para permitir acesso a tarefas do quadro
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (board_id is null and public.is_team_member(team_id, auth.uid()))
    or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  );

-- 7. RPC atômica para criar quadro com etapas
create or replace function public.create_custom_board(
  p_name text,
  p_description text,
  p_type text,
  p_methodology text,
  p_team_id uuid,
  p_is_shared boolean,
  p_stage_ids uuid[],
  p_stages jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_stage jsonb;
  v_pos int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_type = 'sector_view' and not public.is_admin(auth.uid()) then
    raise exception 'Apenas administradores podem criar visões de setor';
  end if;
  if p_type = 'custom' and not (
    public.is_admin(auth.uid()) or
    (p_team_id is not null and public.is_team_manager(p_team_id, auth.uid()))
  ) then
    raise exception 'Sem permissão para criar quadro personalizado para esta equipe';
  end if;

  insert into public.boards(name, description, type, methodology, team_id, is_shared, stage_ids, created_by)
  values (
    trim(p_name),
    p_description,
    p_type,
    p_methodology,
    case when p_is_shared then null else p_team_id end,
    p_is_shared,
    coalesce(p_stage_ids, '{}'),
    auth.uid()
  )
  returning id into v_board_id;

  if p_type = 'custom' and jsonb_array_length(p_stages) > 0 then
    for v_stage in select * from jsonb_array_elements(p_stages) loop
      v_pos := v_pos + 1;
      insert into public.board_stages(board_id, name, color, position, wip_limit, is_final)
      values (
        v_board_id,
        trim(coalesce(v_stage->>'name', 'Etapa ' || v_pos)),
        coalesce(v_stage->>'color', '#64748b'),
        v_pos,
        nullif((v_stage->>'wip_limit')::int, 0),
        coalesce((v_stage->>'is_final')::boolean, false)
      );
    end loop;
  end if;

  return v_board_id;
end $$;

revoke all on function public.create_custom_board(text, text, text, text, uuid, boolean, uuid[], jsonb) from public;
grant execute on function public.create_custom_board(text, text, text, text, uuid, boolean, uuid[], jsonb) to authenticated;
