create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  color text not null default '#a855f7' check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index tags_name_unique on public.tags (lower(name));

with existing as (
  select min(btrim(tag)) as name
  from public.tasks task, unnest(task.tags) as tag
  where length(btrim(tag)) between 1 and 80
  group by lower(btrim(tag))
), numbered as (
  select name, row_number() over (order by name) as position from existing
)
insert into public.tags(name,color)
select name, (array['#a855f7','#ef4444','#10b981','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#64748b'])[((position - 1) % 8) + 1]
from numbered;

alter table public.tags enable row level security;
create policy tags_read on public.tags for select to authenticated using (public.is_active_user(auth.uid()));
alter publication supabase_realtime add table public.tags;

create function public.save_tag(p_tag_id uuid, p_name text, p_color text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; old_name text; clean_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem editar tags'; end if;
  clean_name := btrim(coalesce(p_name,''));
  if length(clean_name) not between 1 and 80 then raise exception 'O nome deve ter entre 1 e 80 caracteres'; end if;
  if coalesce(p_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Cor inválida'; end if;

  if p_tag_id is null then
    insert into public.tags(name,color) values (clean_name,p_color) returning id into saved_id;
  else
    select name into old_name from public.tags where id = p_tag_id for update;
    if old_name is null then raise exception 'Tag não encontrada'; end if;
    update public.tags set name = clean_name, color = p_color where id = p_tag_id returning id into saved_id;
    if old_name is distinct from clean_name then
      update public.tasks set tags = array_replace(tags,old_name,clean_name)
      where old_name = any(tags);
    end if;
  end if;
  return saved_id;
end $$;
revoke all on function public.save_tag(uuid,text,text) from public;
grant execute on function public.save_tag(uuid,text,text) to authenticated;

create function public.delete_tag(p_tag_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare old_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem excluir tags'; end if;
  select name into old_name from public.tags where id = p_tag_id for update;
  if old_name is null then raise exception 'Tag não encontrada'; end if;
  update public.tasks set tags = array_remove(tags,old_name) where old_name = any(tags);
  delete from public.tags where id = p_tag_id;
end $$;
revoke all on function public.delete_tag(uuid) from public;
grant execute on function public.delete_tag(uuid) to authenticated;
