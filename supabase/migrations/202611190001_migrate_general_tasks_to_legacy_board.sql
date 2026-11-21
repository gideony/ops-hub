-- ==============================================================================
-- Migration: 202611190001_migrate_general_tasks_to_legacy_board.sql
-- Demanda: Correção de Modelo — Aba Geral como Agregação Pura e Resgate de Tarefas
-- ==============================================================================
-- 1. Adiciona coluna is_active em public.boards para suportar desativação sem deleção.
-- 2. Cria o quadro corporativo real "Geral (legado)" com as 15 etapas copiadas.
-- 3. Migra todas as tarefas de board_id nulo/geral para o quadro legado, preservando
--    rigorosamente histórico, datas, vínculos e conclusão (completed_at).
-- 4. Marca visões de setor (espelhos) e o quadro canônico anterior como desativados.
-- 5. Totalmente IDEMPOTENTE (pode ser executada múltiplas vezes com segurança).
-- ==============================================================================

do $$
declare
  v_admin_id uuid;
  v_legacy_board_id uuid;
  v_stage record;
  v_new_stage_id uuid;
  v_migrated_count integer := 0;
begin
  -- 1. Garantir existência da coluna is_active em public.boards
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'boards' and column_name = 'is_active'
  ) then
    alter table public.boards add column is_active boolean not null default true;
  end if;

  -- 2. Localizar usuário administrador para ser o criador do quadro corporativo
  select id into v_admin_id
  from public.profiles
  where role = 'administrador'
  order by created_at asc
  limit 1;

  if v_admin_id is null then
    select id into v_admin_id
    from public.profiles
    order by created_at asc
    limit 1;
  end if;

  -- 3. Obter ou criar o quadro corporativo "Geral (legado)"
  select id into v_legacy_board_id
  from public.boards
  where name = 'Geral (legado)' and type = 'custom'
  limit 1;

  if v_legacy_board_id is null then
    insert into public.boards (
      name,
      description,
      type,
      methodology,
      team_id,
      is_shared,
      is_active,
      position,
      color,
      created_by
    ) values (
      'Geral (legado)',
      'Quadro corporativo criado automaticamente para abrigar as tarefas históricas do antigo fluxo Geral canônico, garantindo que nada se perca.',
      'custom',
      'kanban',
      null,
      true,
      true,
      999,
      '#6366f1',
      v_admin_id
    ) returning id into v_legacy_board_id;
  else
    -- Garante que o quadro legado esteja ativo e corporativo
    update public.boards
    set is_active = true, is_shared = true, type = 'custom'
    where id = v_legacy_board_id;
  end if;

  -- 4. Replicar as etapas globais de public.stages para public.board_stages no quadro legado
  for v_stage in (select * from public.stages order by position asc) loop
    select id into v_new_stage_id
    from public.board_stages
    where board_id = v_legacy_board_id and name = v_stage.name
    limit 1;

    if v_new_stage_id is null then
      insert into public.board_stages (
        board_id,
        name,
        color,
        position,
        wip_limit,
        is_final
      ) values (
        v_legacy_board_id,
        v_stage.name,
        coalesce(v_stage.color, '#64748b'),
        v_stage.position,
        null,
        coalesce(v_stage.is_final, false)
      );
    else
      -- Atualiza atributos caso já existisse
      update public.board_stages
      set
        color = coalesce(v_stage.color, board_stages.color),
        position = v_stage.position,
        is_final = coalesce(v_stage.is_final, board_stages.is_final)
      where id = v_new_stage_id;
    end if;
  end loop;

  -- 5. Migrar tarefas com board_id nulo ou apontando para quadro do tipo 'general'
  -- Mapeia cada tarefa para o board_stage equivalente no quadro legado pelo nome da etapa
  for v_stage in (
    select
      s.id as old_stage_id,
      bs.id as new_stage_id,
      s.name as stage_name
    from public.stages s
    join public.board_stages bs on bs.board_id = v_legacy_board_id and bs.name = s.name
  ) loop
    update public.tasks
    set
      board_id = v_legacy_board_id,
      stage_id = v_stage.new_stage_id
    where (board_id is null or board_id in (select id from public.boards where type = 'general'))
      and stage_id = v_stage.old_stage_id;

    get diagnostics v_migrated_count = row_count;
  end loop;

  -- Fallback de segurança: tarefas cuja etapa antiga não foi mapeada recebem a primeira etapa do quadro legado
  select id into v_new_stage_id
  from public.board_stages
  where board_id = v_legacy_board_id
  order by position asc
  limit 1;

  if v_new_stage_id is not null then
    update public.tasks
    set
      board_id = v_legacy_board_id,
      stage_id = v_new_stage_id
    where (board_id is null or board_id in (select id from public.boards where type = 'general'));
  end if;

  -- 6. Atualizar referências de linhagem (task_lineage_events) para o quadro legado
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'task_lineage_events'
  ) then
    update public.task_lineage_events
    set
      board_id = v_legacy_board_id,
      board_name = 'Geral (legado)',
      board_color = '#6366f1'
    where board_id is null or board_id in (select id from public.boards where type = 'general');
  end if;

  -- 7. Desativar visões de setor (espelhos) e o quadro canônico anterior sem apagar dados
  update public.boards
  set is_active = false
  where type in ('general', 'sector_view') and id <> v_legacy_board_id;

end $$;
