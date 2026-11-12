-- Migration: RPC Canônica para Métricas e Concordância de Relatórios por Quadro
-- 202611110002_reports_board_concordance.sql
-- Regra 1: SECURITY INVOKER (respeita estritamente o RLS do usuário chamador, impedindo vazamento de dados de outras equipes)
-- Regra 3: Fuso horário America/Fortaleza e comparação estrita de data (prazo hoje NÃO é atrasada)
-- Regra 4: Backlog de Scrum mutuamente exclusivo de tarefas ativas

create or replace function public.get_board_report_metrics(
  p_board_id text default 'all',
  p_from date default null,
  p_to date default null,
  p_date_field text default 'created',
  p_team_id uuid default null,
  p_assignee_id uuid default null,
  p_client_id uuid default null,
  p_scrum_scope text default 'all'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Fuso horário oficial da Somax (America/Fortaleza)
  v_today := (timezone('America/Fortaleza', now()))::date;

  with active_sprints as (
    select id, board_id from public.sprints where status = 'active'
  ),
  classified_tasks as (
    select
      t.id as task_id,
      t.title,
      t.team_id,
      t.assignee_id,
      t.client_id,
      t.stage_id,
      t.priority,
      t.due_at,
      t.created_at,
      t.completed_at,
      coalesce(t.board_id, '00000000-0000-0000-0000-000000000000'::uuid) as resolved_board_id,
      t.board_id as original_board_id,
      t.sprint_id,
      b.name as board_name,
      b.type as board_type,
      b.methodology as board_methodology,
      -- Resolução de Etapa e Flags
      case
        when t.board_id is not null then coalesce(bs.name, 'Etapa sem identificação')
        else coalesce(s.name, 'Etapa sem identificação')
      end as stage_name,
      case
        when t.board_id is not null then coalesce(bs.color, '#94a3b8')
        else coalesce(s.color, '#94a3b8')
      end as stage_color,
      case
        when t.board_id is not null then coalesce(bs.is_final, false)
        else coalesce(s.is_final, false)
      end as is_final,
      case
        when t.board_id is null then coalesce(s.is_pause, false)
        else false
      end as is_pause,
      -- Data relevante para o filtro
      case
        when p_date_field = 'completed' then (coalesce(t.completed_at, t.updated_at) at time zone 'America/Fortaleza')::date
        when p_date_field = 'due' then t.due_at
        else (t.created_at at time zone 'America/Fortaleza')::date
      end as filter_date,
      -- Status Mutuamente Exclusivo
      case
        when (case when t.board_id is not null then coalesce(bs.is_final, false) else coalesce(s.is_final, false) end) then 'done'
        when (case when t.board_id is null then coalesce(s.is_pause, false) else false end) then 'blocked'
        when b.methodology = 'scrum' and (t.sprint_id is null or asp.id is null) then 'backlog'
        else 'active'
      end as canonical_status,
      -- Indicador de Atraso (Estritamente menor que hoje, excluindo concluídas)
      case
        when (case when t.board_id is not null then coalesce(bs.is_final, false) else coalesce(s.is_final, false) end) = false
          and t.due_at is not null
          and t.due_at < v_today
        then true
        else false
      end as is_overdue
    from public.tasks t
    left join public.boards b on b.id = t.board_id
    left join public.board_stages bs on bs.id = t.stage_id and t.board_id is not null
    left join public.stages s on s.id = t.stage_id and t.board_id is null
    left join active_sprints asp on asp.id = t.sprint_id
  ),
  filtered_tasks as (
    select ct.*
    from classified_tasks ct
    left join public.boards b_sel on (
      p_board_id is not null
      and p_board_id != 'all'
      and p_board_id != 'board-geral'
      and b_sel.id::text = p_board_id
    )
    where
      -- Filtro de período
      (p_from is null or ct.filter_date >= p_from)
      and (p_to is null or ct.filter_date <= p_to)
      -- Filtros relacionais
      and (p_team_id is null or ct.team_id = p_team_id)
      and (p_assignee_id is null or ct.assignee_id = p_assignee_id)
      and (p_client_id is null or ct.client_id = p_client_id)
      -- Filtro de escopo Scrum
      and (
        p_scrum_scope = 'all'
        or ct.board_methodology != 'scrum'
        or ct.canonical_status != 'backlog'
      )
      -- Filtro por dimensão Quadro / Visão
      and (
        p_board_id = 'all'
        or (p_board_id = 'board-geral' and ct.original_board_id is null)
        or (
          b_sel.type = 'sector_view'
          and ct.original_board_id is null
          and ct.stage_id = any(b_sel.stage_ids)
        )
        or (
          b_sel.type = 'custom'
          and ct.original_board_id = b_sel.id
        )
      )
  ),
  totals_agg as (
    select
      count(*) as total,
      count(*) filter (where canonical_status = 'active') as active,
      count(*) filter (where canonical_status = 'done') as done,
      count(*) filter (where canonical_status = 'blocked') as blocked,
      count(*) filter (where canonical_status = 'backlog') as backlog,
      count(*) filter (where is_overdue = true) as overdue
    from filtered_tasks
  ),
  boards_agg as (
    select
      coalesce(b.id::text, 'board-geral') as board_id,
      coalesce(b.name, 'Geral') as board_name,
      coalesce(b.type, 'general') as board_type,
      coalesce(b.methodology, 'kanban') as methodology,
      count(*) as total,
      count(*) filter (where canonical_status = 'active') as active,
      count(*) filter (where canonical_status = 'done') as done,
      count(*) filter (where canonical_status = 'blocked') as blocked,
      count(*) filter (where canonical_status = 'backlog') as backlog,
      count(*) filter (where is_overdue = true) as overdue
    from filtered_tasks ft
    left join public.boards b on b.id = ft.original_board_id
    group by b.id, b.name, b.type, b.methodology
  ),
  stages_agg as (
    select
      stage_name,
      stage_color,
      count(*) as count
    from filtered_tasks
    group by stage_name, stage_color
  ),
  teams_agg as (
    select
      tm.id as team_id,
      tm.name as team_name,
      tm.color as team_color,
      count(ft.task_id) as count
    from filtered_tasks ft
    join public.teams tm on tm.id = ft.team_id
    group by tm.id, tm.name, tm.color
  )
  select jsonb_build_object(
    'today', v_today,
    'totals', (select to_jsonb(t) from totals_agg t),
    'boards', coalesce((select jsonb_agg(to_jsonb(b)) from boards_agg b), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(s)) from stages_agg s), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(tm)) from teams_agg tm), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.get_board_report_metrics from public;
grant execute on function public.get_board_report_metrics to authenticated;
