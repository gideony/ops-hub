-- Migration: 202611110004_reorder_stages_fix.sql
-- Correção da procedure de reordenação de etapas do Kanban

create or replace function public.reorder_stages(p_stage_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_offset integer;
  v_user_id uuid;
  v_is_authorized boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  -- Permite Administradores e Gestores de equipe ativos
  if public.is_admin(v_user_id) then
    v_is_authorized := true;
  elsif exists (
    select 1 from public.team_members
    where user_id = v_user_id and is_manager = true and active = true
  ) then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Somente administradores e gestores podem ordenar etapas';
  end if;

  lock table public.stages in share row exclusive mode;

  select count(*), max(position) - min(position) + count(*) + 1
    into v_count, v_offset
    from public.stages;

  if cardinality(p_stage_ids) <> v_count
    or (select count(distinct id) from unnest(p_stage_ids) as item(id)) <> v_count
    or exists (select stage.id from public.stages stage except select id from unnest(p_stage_ids) as item(id))
  then
    raise exception 'A lista deve conter todas as etapas uma vez';
  end if;

  -- Cláusula WHERE explícita para compatibilidade com safeupdate do PostgreSQL
  update public.stages
     set position = position + v_offset
   where true;

  update public.stages stage
     set position = ordered.position
    from (
      select id, ordinality::integer - 1 as position
        from unnest(p_stage_ids) with ordinality as item(id, ordinality)
    ) ordered
   where stage.id = ordered.id;
end $$;

revoke all on function public.reorder_stages(uuid[]) from public;
grant execute on function public.reorder_stages(uuid[]) to authenticated;
