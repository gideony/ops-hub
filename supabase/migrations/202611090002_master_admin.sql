-- Um único administrador master, promovido pelo SQL Editor após criar a conta no Auth.
alter table public.profiles add column is_master boolean not null default false;
create unique index profiles_one_master on public.profiles ((true)) where is_master;

create function public.is_master(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.is_master and p.role = 'administrador' and p.active)
$$;
revoke all on function public.is_master(uuid) from public;
grant execute on function public.is_master(uuid) to authenticated;

create function public.guard_master_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.is_master and (not new.is_master or new.role <> 'administrador' or not new.active) then
    raise exception 'O administrador master deve permanecer ativo e administrador';
  end if;
  if old.is_master is distinct from new.is_master and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'A função master só pode ser atribuída pelo administrador do banco';
  end if;
  return new;
end $$;
create trigger guard_master_profile before update on public.profiles
for each row execute function public.guard_master_profile();

drop policy profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_master(auth.uid()))
with check (public.is_master(auth.uid()));
