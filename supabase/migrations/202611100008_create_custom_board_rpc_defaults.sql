-- Migration: 202611100008_create_custom_board_rpc_defaults.sql
-- Objetivo: Garantir parâmetros padrão na RPC create_custom_board para compatibilidade total com PostgREST e chamadas do cliente.

create or replace function public.create_custom_board(
  p_name text,
  p_description text default null,
  p_type text default 'custom',
  p_methodology text default 'kanban',
  p_team_id uuid default null,
  p_is_shared boolean default false,
  p_stage_ids uuid[] default array[]::uuid[],
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
    p_name,
    p_description,
    coalesce(p_type, 'custom'),
    coalesce(p_methodology, 'kanban'),
    p_team_id,
    coalesce(p_is_shared, false),
    coalesce(p_stage_ids, array[]::uuid[]),
    auth.uid()
  )
  returning id into v_board_id;

  if coalesce(p_type, 'custom') = 'custom' and p_stages is not null and jsonb_array_length(p_stages) > 0 then
    for v_stage in select * from jsonb_array_elements(p_stages) loop
      insert into public.board_stages(board_id, name, color, position, wip_limit, is_final)
      values (
        v_board_id,
        coalesce(v_stage->>'name', 'Etapa ' || (v_pos + 1)),
        coalesce(v_stage->>'color', '#3b82f6'),
        coalesce((v_stage->>'position')::int, v_pos),
        (v_stage->>'wip_limit')::int,
        coalesce((v_stage->>'is_final')::boolean, false)
      );
      v_pos := v_pos + 1;
    end loop;
  end if;

  return v_board_id;
end;
$$;

grant execute on function public.create_custom_board(text, text, text, text, uuid, boolean, uuid[], jsonb) to authenticated;

notify pgrst, 'reload schema';
