-- Ordena as colunas iniciais do Kanban sem alterar as transições do fluxo.
do $$
declare v_offset integer;
begin
  select max(position) - min(position) + count(*) + 1 into v_offset from public.stages;
  update public.stages set position = position + v_offset;
  with ordered as (
    select id, row_number() over (order by
      case name
        when 'Negociação' then 0
        when 'Pausado' then 1
        when 'Backlog' then 2
        when 'Contrato' then 3
        when 'Kick-off' then 4
        when 'Criação de Imagens' then 5
        when 'Desenvolvimento' then 6
        when 'Integração' then 7
        when 'Homologação' then 8
        when 'Criação de Telas' then 9
        when 'Deploy' then 10
        when 'Aprovação' then 11
        when 'Entrega' then 12
        when 'Faturamento' then 13
        when 'Concluído' then 14
        else 100 + position
      end, position) - 1 as new_position
    from public.stages
  )
  update public.stages stage set position = ordered.new_position
  from ordered where stage.id = ordered.id;
end $$;

create function public.reorder_stages(p_stage_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_offset integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem ordenar etapas'; end if;
  lock table public.stages in share row exclusive mode;
  select count(*), max(position) - min(position) + count(*) + 1 into v_count, v_offset from public.stages;
  if cardinality(p_stage_ids) <> v_count
    or (select count(distinct id) from unnest(p_stage_ids) as item(id)) <> v_count
    or exists (select stage.id from public.stages stage except select id from unnest(p_stage_ids) as item(id))
  then raise exception 'A lista deve conter todas as etapas uma vez'; end if;
  update public.stages set position = position + v_offset;
  update public.stages stage set position = ordered.position
  from (select id, ordinality::integer - 1 as position from unnest(p_stage_ids) with ordinality as item(id,ordinality)) ordered
  where stage.id = ordered.id;
end $$;
revoke all on function public.reorder_stages(uuid[]) from public;
grant execute on function public.reorder_stages(uuid[]) to authenticated;

create function public.guard_stage_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.tasks where stage_id = old.id)
    or exists(select 1 from public.stage_transitions where from_stage_id = old.id or to_stage_id = old.id)
    or exists(select 1 from public.subtask_templates where stage_id = old.id)
  then raise exception 'Remova as tarefas, os fluxos e os itens padrão desta etapa antes de excluí-la'; end if;
  if old.is_final and (select count(*) from public.stages where is_final) <= 1
  then raise exception 'Mantenha ao menos uma etapa final'; end if;
  return old;
end $$;
create trigger stage_delete_guard before delete on public.stages
for each row execute function public.guard_stage_delete();
