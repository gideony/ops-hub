alter table public.checklist_template_groups
  add column description text check (description is null or length(description) <= 1000);

create function public.save_checklist_template(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_items text[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem editar templates'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'Informe o nome do template'; end if;
  if p_group_id is null then
    insert into public.checklist_template_groups(name, description, position)
    values (trim(p_name), nullif(trim(coalesce(p_description,'')),''),
      coalesce((select max(position)+1 from public.checklist_template_groups),1))
    returning id into saved_id;
  else
    update public.checklist_template_groups
    set name = trim(p_name), description = nullif(trim(coalesce(p_description,'')),'')
    where id = p_group_id returning id into saved_id;
    if saved_id is null then raise exception 'Template não encontrado'; end if;
    delete from public.checklist_template_items where group_id = saved_id;
  end if;
  insert into public.checklist_template_items(group_id,title,position)
    select saved_id, trim(item.title), item.position
    from unnest(coalesce(p_items,'{}')) with ordinality as item(title,position)
    where length(trim(item.title)) > 0;
  return saved_id;
end $$;
revoke all on function public.save_checklist_template(uuid,text,text,text[]) from public;
grant execute on function public.save_checklist_template(uuid,text,text,text[]) to authenticated;
