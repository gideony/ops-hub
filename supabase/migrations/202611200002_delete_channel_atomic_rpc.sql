-- ==============================================================================
-- Migration: 202611200002_delete_channel_atomic_rpc.sql
-- Demanda: RPC Atômica para Exclusão Definitiva de Canais do Chat
-- ==============================================================================

create or replace function public.delete_channel_atomic(
  p_channel_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_profile record;
  v_channel record;
  v_msg_count integer := 0;
  v_att_count integer := 0;
  v_team_name text := 'Equipe';
begin
  -- 1. Validar autenticação
  if v_caller is null and auth.role() <> 'service_role' then
    raise exception 'Não autenticado.';
  end if;

  -- 2. Validar que o chamador é administrador ativo
  if auth.role() <> 'service_role' then
    select id, full_name, role, active into v_caller_profile
      from public.profiles
     where id = v_caller;

    if v_caller_profile.id is null or not coalesce(v_caller_profile.active, false) then
      raise exception 'Acesso negado: perfil inativo ou inexistente.';
    end if;

    if v_caller_profile.role <> 'administrador' and not public.is_admin(v_caller) then
      raise exception 'Apenas administradores podem excluir canais definitivamente.';
    end if;
  end if;

  -- 3. Buscar canal e equipe
  select c.id, c.name, c.team_id, t.name as team_name
    into v_channel
    from public.channels c
    left join public.teams t on t.id = c.team_id
   where c.id = p_channel_id;

  if v_channel.id is null then
    raise exception 'Canal não encontrado.';
  end if;

  -- 4. Validar proteção do canal "Geral"
  if lower(trim(v_channel.name)) = 'geral' then
    raise exception 'O canal Geral é protegido e não pode ser excluído.';
  end if;

  -- 5. Validar nome de confirmação
  if lower(trim(v_channel.name)) <> lower(trim(coalesce(p_confirmation_name, ''))) then
    raise exception 'O nome de confirmação digitado não confere com o nome do canal.';
  end if;

  if v_channel.team_name is not null then
    v_team_name := v_channel.team_name;
  end if;

  -- 6. Contabilizar mensagens e anexos para auditoria
  select count(*) into v_msg_count
    from public.messages
   where channel_id = p_channel_id;

  select count(*) into v_att_count
    from public.attachments a
    join public.messages m on m.id = a.message_id
   where m.channel_id = p_channel_id;

  -- 7. Registrar auditoria se a tabela existir
  begin
    insert into public.channel_deletion_audit (
      channel_id,
      channel_name,
      team_id,
      team_name,
      deleted_by,
      deleted_by_name,
      messages_count,
      attachments_count,
      deleted_at
    ) values (
      v_channel.id,
      v_channel.name,
      v_channel.team_id,
      v_team_name,
      coalesce(v_caller, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(v_caller_profile.full_name, 'Administrador'),
      v_msg_count,
      v_att_count,
      now()
    );
  exception when others then
    -- Não aborta a exclusão caso a tabela de auditoria não esteja pronta
    null;
  end;

  -- 8. Excluir o canal (cascateia para messages, attachments, message_reads)
  delete from public.channels
   where id = p_channel_id;

  return jsonb_build_object(
    'success', true,
    'channel_id', p_channel_id,
    'channel_name', v_channel.name,
    'messages_purged', v_msg_count,
    'attachments_purged', v_att_count
  );
end;
$$;

grant execute on function public.delete_channel_atomic(uuid, text) to authenticated, service_role;
