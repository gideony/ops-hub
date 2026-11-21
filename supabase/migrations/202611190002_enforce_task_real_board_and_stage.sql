-- ==============================================================================
-- Migration: 202611190002_enforce_task_real_board_and_stage.sql
-- Demanda: Regra no Servidor — Toda tarefa deve pertencer a um quadro real e
--          a uma etapa válida desse quadro.
-- ==============================================================================
-- 1. Trigger de validação em public.tasks (BEFORE INSERT OR UPDATE) que rejeita:
--    - Tarefa sem quadro (board_id IS NULL);
--    - Tarefa no quadro Geral (type = 'general');
--    - Tarefa com etapa de outro quadro (stage_id não pertence a board_stages do board_id).
-- 2. Atualização da RPC create_task_with_templates com validações antecipadas.
-- 3. Atualização da trigger guard_task_movement para simplificar transições já que
--    todos os quadros operacionais possuem etapas em board_stages.
-- ==============================================================================

-- 1. Função da trigger de validação estrita de integridade de quadro e etapa
create or replace function public.validate_task_board_and_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_board record;
  v_stage_exists boolean;
begin
  -- 1.1 board_id não pode ser nulo
  if new.board_id is null then
    raise exception 'Toda tarefa deve pertencer a um quadro real. O quadro Geral é apenas uma visão de agregação.';
  end if;

  -- 1.2 Localizar quadro e validar tipo e estado
  select * into v_board from public.boards where id = new.board_id;
  if not found then
    raise exception 'O quadro selecionado não existe.';
  end if;

  if v_board.type = 'general' then
    raise exception 'Não é permitido criar ou manter tarefas no quadro Geral. Escolha um quadro real (como Comercial, Implantação, Suporte ou Geral (legado)).';
  end if;

  if v_board.type = 'sector_view' then
    raise exception 'Não é permitido vincular tarefas diretamente a uma visão de setor legada.';
  end if;

  -- 1.3 Validar que a etapa pertence estritamente ao quadro escolhido
  select exists (
    select 1 from public.board_stages
    where board_id = new.board_id and id = new.stage_id
  ) into v_stage_exists;

  if not v_stage_exists then
    raise exception 'A etapa selecionada não pertence ao quadro escolhido.';
  end if;

  return new;
end $$;

drop trigger if exists trg_validate_task_board_and_stage on public.tasks;
create trigger trg_validate_task_board_and_stage
  before insert or update on public.tasks
  for each row execute function public.validate_task_board_and_stage();

-- 2. Atualizar RPC create_task_with_templates para validação antecipada e mensagens claras
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
  v_actor_id uuid;
  v_board record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'Não autenticado'; end if;

  if not (public.is_admin(v_actor_id) or public.is_team_member(p_team_id, v_actor_id)) then
    raise exception 'Sem acesso à equipe da tarefa';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;

  -- Validação obrigatória de quadro real
  if p_board_id is null then
    raise exception 'Toda tarefa deve pertencer a um quadro real. O quadro Geral é apenas uma visão de agregação.';
  end if;

  select * into v_board from public.boards where id = p_board_id;
  if not found then
    raise exception 'O quadro selecionado não existe.';
  end if;

  if v_board.type = 'general' then
    raise exception 'Não é permitido criar tarefas no quadro Geral. Escolha um quadro real (como Comercial, Implantação, Suporte ou Geral (legado)).';
  end if;

  if not public.can_create_task_in_board(p_board_id, v_actor_id) then
    raise exception 'Sem permissão: você não pode criar tarefas em um quadro privado de outra equipe';
  end if;

  if not exists (
    select 1 from public.board_stages
    where board_id = p_board_id and id = p_stage_id
  ) then
    raise exception 'A etapa selecionada não pertence ao quadro escolhido.';
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), v_actor_id, p_board_id, p_sprint_id)
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

revoke all on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) from public;
grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;
