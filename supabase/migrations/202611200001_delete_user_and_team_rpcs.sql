-- ==============================================================================
-- Migration: 202611200001_delete_user_and_team_rpcs.sql
-- Demanda: Exclusão Segura de Usuários e Equipes com Integridade Referencial
-- ==============================================================================

-- 1. RPC para exclusão segura de equipe
create or replace function public.delete_team(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task_count integer;
  v_team_name text;
begin
  -- Valida autorização: apenas administradores ativos ou service_role
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão. Apenas administradores podem excluir equipes.';
  end if;

  select name into v_team_name from public.teams where id = p_team_id;
  if v_team_name is null then
    raise exception 'Equipe não encontrada.';
  end if;

  -- 1.1 Bloqueio de integridade: equipes com tarefas vinculadas não podem ser apagadas diretamente
  select count(*) into v_task_count from public.tasks where team_id = p_team_id;
  if v_task_count > 0 then
    raise exception 'Não é possível excluir a equipe "%" pois existem % tarefa(s) vinculada(s) a ela. Reatribua as tarefas antes de excluir.', v_team_name, v_task_count;
  end if;

  -- 1.2 Desvincula links de autocadastro da equipe
  update public.client_registration_links set team_id = null where team_id = p_team_id;

  -- 1.3 Remove canais da equipe
  delete from public.channels where team_id = p_team_id;

  -- 1.4 Remove quadros customizados da equipe
  delete from public.boards where team_id = p_team_id and type = 'custom';

  -- 1.5 Remove associações de membros
  delete from public.team_members where team_id = p_team_id;

  -- 1.6 Remove a equipe
  delete from public.teams where id = p_team_id;

  return jsonb_build_object('success', true, 'team_id', p_team_id);
end $$;

grant execute on function public.delete_team(uuid) to authenticated, service_role;


-- 2. RPC para exclusão segura de usuário (gerenciamento atômico)
create or replace function public.delete_managed_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_is_master boolean;
  v_caller_role public.user_role;
  v_target_role public.user_role;
  v_has_tasks boolean;
  v_has_messages boolean;
begin
  -- Valida autorização
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão. Apenas administradores podem excluir usuários.';
  end if;

  -- Impede auto-exclusão
  if auth.uid() = p_user_id then
    raise exception 'Você não pode excluir seu próprio usuário logado.';
  end if;

  select is_master, role into v_is_master, v_target_role from public.profiles where id = p_user_id;
  if v_is_master then
    raise exception 'Não é permitido excluir o administrador master da organização.';
  end if;

  -- Se o alvo for administrador, somente o master ou service_role pode excluir
  if v_target_role = 'administrador' and auth.role() <> 'service_role' then
    if not public.is_master_admin(auth.uid()) then
      raise exception 'Apenas o Administrador Master pode excluir outro administrador.';
    end if;
  end if;

  -- 2.1 Remove vínculos com equipes e status de leitura
  delete from public.team_members where user_id = p_user_id;
  delete from public.message_reads where user_id = p_user_id;

  -- 2.2 Desvincula tarefas em que o usuário seja o responsável
  update public.tasks set assignee_id = null where assignee_id = p_user_id;

  -- 2.3 Tenta exclusão física ou fallback para desativação com anonimização
  begin
    delete from public.profiles where id = p_user_id;
    return jsonb_build_object('success', true, 'mode', 'hard_delete');
  exception when foreign_key_violation then
    -- Se houver FKs obrigatórias em histórico (ex: created_by de tarefas antigas, mensagens arquivadas)
    update public.profiles
    set active = false,
        full_name = full_name || ' (Excluído)',
        email = null,
        whatsapp = null
    where id = p_user_id;
    return jsonb_build_object('success', true, 'mode', 'soft_delete_anonymized');
  end;
end $$;

grant execute on function public.delete_managed_user(uuid) to authenticated, service_role;
