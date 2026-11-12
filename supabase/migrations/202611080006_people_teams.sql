alter table public.profiles
  add column email text,
  add column whatsapp text check (whatsapp is null or whatsapp ~ '^\+[0-9]{10,15}$');

update public.profiles profile set email = auth_user.email
from auth.users auth_user where profile.id = auth_user.id;

create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email, whatsapp)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'whatsapp', '')
  );
  return new;
end $$;

create function public.save_team(p_team_id uuid, p_name text, p_color text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; clean_name text;
begin
  clean_name := btrim(coalesce(p_name,''));
  if length(clean_name) not between 1 and 80 then raise exception 'O nome deve ter entre 1 e 80 caracteres'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida'; end if;

  if p_team_id is null then
    if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem criar equipes'; end if;
    insert into public.teams(name,color) values(clean_name,p_color) returning id into saved_id;
    insert into public.team_members(team_id,user_id,is_manager,active)
      values(saved_id,auth.uid(),true,true);
    insert into public.channels(team_id,name,created_by)
      values(saved_id,'Geral',auth.uid());
  else
    if not public.is_team_manager(p_team_id,auth.uid()) then raise exception 'Sem permissão para editar esta equipe'; end if;
    update public.teams set name=clean_name,color=p_color where id=p_team_id returning id into saved_id;
    if saved_id is null then raise exception 'Equipe não encontrada'; end if;
  end if;
  return saved_id;
end $$;
revoke all on function public.save_team(uuid,text,text) from public;
grant execute on function public.save_team(uuid,text,text) to authenticated;
