-- Cada usuário ativo pode atualizar apenas o próprio nome e WhatsApp.
-- A função não aceita alterações em role, active, email ou id.
create function public.update_my_profile(p_full_name text, p_whatsapp text)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_name text; clean_whatsapp text;
begin
  if not public.is_active_user(auth.uid()) then
    raise exception 'Conta sem acesso';
  end if;
  clean_name := btrim(coalesce(p_full_name, ''));
  clean_whatsapp := nullif(btrim(coalesce(p_whatsapp, '')), '');
  if length(clean_name) not between 2 and 120 then
    raise exception 'O nome deve ter entre 2 e 120 caracteres';
  end if;
  if clean_whatsapp is not null and clean_whatsapp !~ '^\+[0-9]{10,15}$' then
    raise exception 'WhatsApp inválido';
  end if;
  update public.profiles
    set full_name = clean_name, whatsapp = clean_whatsapp
    where id = auth.uid();
  if not found then
    raise exception 'Perfil não encontrado';
  end if;
end $$;
revoke all on function public.update_my_profile(text,text) from public;
grant execute on function public.update_my_profile(text,text) to authenticated;
