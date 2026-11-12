-- Atualização atômica de perfil e equipes, acessível apenas pela Edge Function com service_role.
create function public.save_managed_user(
  p_user_id uuid, p_full_name text, p_email text, p_whatsapp text,
  p_role public.user_role, p_active boolean, p_team_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from public.profiles where id = p_user_id) then raise exception 'Usuário não encontrado'; end if;
  if exists(select 1 from unnest(p_team_ids) team_id where team_id is null or not exists(select 1 from public.teams where id = team_id)) then
    raise exception 'Equipe inválida';
  end if;
  update public.profiles set full_name = p_full_name, email = p_email,
    whatsapp = p_whatsapp, role = p_role, active = p_active where id = p_user_id;
  update public.team_members set active = false, is_manager = false
    where user_id = p_user_id and not (team_id = any(p_team_ids));
  insert into public.team_members(team_id,user_id,is_manager,active)
    select distinct team_id,p_user_id,p_role = 'gestor',true from unnest(p_team_ids) team_id
    on conflict (team_id,user_id) do update set active = true, is_manager = excluded.is_manager;
end $$;
revoke all on function public.save_managed_user(uuid,text,text,text,public.user_role,boolean,uuid[]) from public, authenticated;
grant execute on function public.save_managed_user(uuid,text,text,text,public.user_role,boolean,uuid[]) to service_role;
