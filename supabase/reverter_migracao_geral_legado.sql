-- ==============================================================================
-- Script de Reversão (Rollback): Migração de Tarefas de "Geral (legado)"
-- ==============================================================================
-- ATENÇÃO: Use este script apenas caso precise reverter as tarefas migradas
-- de volta para o estado anterior com board_id nulo e etapas globais de public.stages.
-- ==============================================================================

do $$
declare
  v_legacy_board_id uuid;
  v_stage record;
begin
  -- 1. Localizar o quadro "Geral (legado)"
  select id into v_legacy_board_id
  from public.boards
  where name = 'Geral (legado)'
  limit 1;

  if v_legacy_board_id is not null then
    -- 2. Reverter tarefas de board_stages para public.stages correspondente pelo nome
    for v_stage in (
      select
        bs.id as legacy_stage_id,
        s.id as global_stage_id,
        s.name as stage_name
      from public.board_stages bs
      join public.stages s on s.name = bs.name
      where bs.board_id = v_legacy_board_id
    ) loop
      update public.tasks
      set
        board_id = null,
        stage_id = v_stage.global_stage_id
      where board_id = v_legacy_board_id
        and stage_id = v_stage.legacy_stage_id;
    end loop;

    -- 3. Reativar o quadro geral canônico e visões de setor caso existissem
    update public.boards
    set is_active = true
    where type in ('general', 'sector_view');

    raise notice 'Rollback concluído: tarefas do quadro legado retornadas para board_id = null.';
  else
    raise notice 'Quadro "Geral (legado)" não encontrado. Nenhuma alteração realizada.';
  end if;
end $$;
