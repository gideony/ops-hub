-- Migration: Adicionar group_name a task_checklist e suporte a templates agrupados
-- Adiciona a coluna group_name para identificar o template de origem da subtarefa
alter table public.task_checklist add column if not exists group_name text;

-- Atualiza create_task_with_templates para registrar o nome do template no group_name
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
  p_template_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.is_team_member(p_team_id, auth.uid()) then
    raise exception 'Sem acesso à equipe';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), auth.uid())
    returning id into created_id;

  insert into public.task_checklist(task_id, title, position, group_name)
    select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
    from public.checklist_template_items item
    join public.checklist_template_groups template on template.id = item.group_id
    where item.group_id = any(coalesce(p_template_ids,'{}'))
      and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);

  return created_id;
end $$;

-- Atualiza log_task_movement para salvar o nome da etapa como group_name ao inserir subtarefas automáticas
create or replace function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by)
      values (new.id, case when tg_op = 'INSERT' then null else old.stage_id end, new.stage_id, coalesce(auth.uid(), new.created_by));

    insert into public.task_checklist(task_id, title, position, group_name)
      select new.id, template.title, template.position, stage.name
      from public.subtask_templates template
      join public.stages stage on stage.id = template.stage_id
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end $$;

-- Cria função para aplicar templates diretamente em tarefas existentes
create or replace function public.apply_template_to_task(
  p_task_id uuid,
  p_template_id uuid
) returns int language plpgsql security definer set search_path = '' as $$
declare
  inserted_count int;
  t_name text;
begin
  if not public.can_access_task(p_task_id, auth.uid()) then
    raise exception 'Sem permissão para alterar esta tarefa';
  end if;

  select name into t_name from public.checklist_template_groups where id = p_template_id;
  if t_name is null then
    raise exception 'Template não encontrado';
  end if;

  with inserted as (
    insert into public.task_checklist(task_id, title, position, group_name)
    select p_task_id, item.title, 1000 + row_number() over (order by item.position, item.id), t_name
    from public.checklist_template_items item
    where item.group_id = p_template_id
      and not exists (
        select 1 from public.task_checklist existing
        where existing.task_id = p_task_id and existing.title = item.title
      )
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end $$;

revoke all on function public.apply_template_to_task(uuid, uuid) from public;
grant execute on function public.apply_template_to_task(uuid, uuid) to authenticated;

-- Preenche group_name para subtarefas já cadastradas existentes
update public.task_checklist tc
set group_name = g.name
from public.checklist_template_items ti
join public.checklist_template_groups g on g.id = ti.group_id
where tc.group_name is null and lower(trim(tc.title)) = lower(trim(ti.title));

update public.task_checklist tc
set group_name = s.name
from public.subtask_templates st
join public.stages s on s.id = st.stage_id
where tc.group_name is null and lower(trim(tc.title)) = lower(trim(st.title));
