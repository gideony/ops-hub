-- Migration 202611150001_task_movements_snapshot_names.sql
-- Adiciona colunas de snapshot textual para etapas em task_movements, garantindo
-- que o histórico sobreviva a exclusões e resolva nomes de etapas em quadros personalizados.

alter table public.task_movements
  add column if not exists from_stage_name text,
  add column if not exists to_stage_name text;

-- Preenche retrospectivamente os nomes das etapas com base nas tabelas atuais
update public.task_movements m
set to_stage_name = coalesce(
  (select name from public.stages s where s.id = m.to_stage_id),
  (select name from public.board_stages bs where bs.id = m.to_stage_id),
  'Etapa inicial'
)
where m.to_stage_name is null;

update public.task_movements m
set from_stage_name = coalesce(
  (select name from public.stages s where s.id = m.from_stage_id),
  (select name from public.board_stages bs where bs.id = m.from_stage_id)
)
where m.from_stage_id is not null and m.from_stage_name is null;

-- Atualiza a trigger para gravar os nomes das etapas tanto de stages quanto de board_stages
create or replace function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from_name text;
  v_to_name text;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    -- Resolve nome da etapa de origem
    if tg_op = 'UPDATE' and old.stage_id is not null then
      select name into v_from_name from public.stages where id = old.stage_id;
      if v_from_name is null then
        select name into v_from_name from public.board_stages where id = old.stage_id;
      end if;
    end if;

    -- Resolve nome da etapa de destino
    select name into v_to_name from public.stages where id = new.stage_id;
    if v_to_name is null then
      select name into v_to_name from public.board_stages where id = new.stage_id;
    end if;

    insert into public.task_movements(
      task_id,
      from_stage_id,
      to_stage_id,
      moved_by,
      from_stage_name,
      to_stage_name
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.stage_id end,
      new.stage_id,
      coalesce(auth.uid(), new.created_by),
      v_from_name,
      v_to_name
    );

    -- Insere subtarefas automáticas se houver template de etapa correspondente
    insert into public.task_checklist(task_id, title, position, group_name)
      select new.id, template.title, template.position, stage.name
      from public.subtask_templates template
      join public.stages stage on stage.id = template.stage_id
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end;
$$;
