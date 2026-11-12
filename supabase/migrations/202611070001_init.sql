create extension if not exists pgcrypto;

create type public.user_role as enum ('administrador', 'gestor', 'colaborador');
create type public.task_priority as enum ('baixa', 'media', 'alta', 'urgente');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'colaborador',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#6366f1'
);
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_manager boolean not null default false,
  active boolean not null default true,
  primary key (team_id, user_id)
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  financial_notes text,
  links jsonb not null default '[]'::jsonb,
  integration_references text,
  created_at timestamptz not null default now(),
  constraint no_secret_fields check (jsonb_typeof(links) = 'array')
);
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null unique,
  color text not null default '#64748b',
  is_final boolean not null default false,
  is_pause boolean not null default false
);
create table public.stage_transitions (
  from_stage_id uuid not null references public.stages(id) on delete cascade,
  to_stage_id uuid not null references public.stages(id) on delete cascade,
  primary key (from_stage_id, to_stage_id),
  constraint different_stages check (from_stage_id <> to_stage_id)
);
create table public.subtask_templates (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  title text not null,
  position integer not null default 0
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  team_id uuid not null references public.teams(id),
  assignee_id uuid references public.profiles(id),
  client_id uuid references public.clients(id),
  stage_id uuid not null references public.stages(id),
  priority public.task_priority not null default 'media',
  due_at date,
  tags text[] not null default '{}',
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_team_stage_idx on public.tasks(team_id, stage_id);
create index tasks_assignee_due_idx on public.tasks(assignee_id, due_at);
create table public.task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0
);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create table public.task_movements (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_stage_id uuid references public.stages(id),
  to_stage_id uuid not null references public.stages(id),
  moved_by uuid not null references public.profiles(id),
  moved_at timestamptz not null default now()
);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (team_id, name)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null default '',
  reply_to_id uuid references public.messages(id),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_has_content check (length(trim(body)) > 0 or task_id is not null)
);
create index messages_channel_created_idx on public.messages(channel_id, created_at desc, id desc);
create table public.message_reads (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create function public.is_active_user(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.active)
$$;
create function public.is_admin(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = uid and p.role = 'administrador' and p.active)
$$;
create function public.is_team_member(tid uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user(uid) and (public.is_admin(uid) or exists(
    select 1 from public.team_members m where m.team_id = tid and m.user_id = uid and m.active
  ))
$$;
create function public.is_team_manager(tid uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin(uid) or (public.is_active_user(uid) and exists(
    select 1 from public.team_members m where m.team_id = tid and m.user_id = uid and m.active and m.is_manager
  ))
$$;
create function public.is_channel_member(tid uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_user(uid) and exists(
    select 1 from public.team_members m where m.team_id = tid and m.user_id = uid and m.active
  )
$$;
create function public.can_access_task(task_uuid uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tasks t where t.id = task_uuid and public.is_team_member(t.team_id, uid))
$$;
create function public.can_access_channel(channel_uuid uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.channels c where c.id = channel_uuid and public.is_channel_member(c.team_id, uid))
$$;
revoke all on function public.is_active_user(uuid), public.is_admin(uuid), public.is_team_member(uuid,uuid), public.is_team_manager(uuid,uuid), public.is_channel_member(uuid,uuid), public.can_access_task(uuid,uuid), public.can_access_channel(uuid,uuid) from public;
grant execute on function public.is_active_user(uuid), public.is_admin(uuid), public.is_team_member(uuid,uuid), public.is_team_manager(uuid,uuid), public.is_channel_member(uuid,uuid), public.can_access_task(uuid,uuid), public.can_access_channel(uuid,uuid) to authenticated;

create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();

create function public.on_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_final boolean; allowed boolean;
begin
  select is_final into target_final from public.stages where id = new.stage_id;
  if target_final is null then raise exception 'Etapa inválida'; end if;
  if tg_op = 'INSERT' then
    new.completed_at := case when target_final then now() else null end;
    new.updated_at := now();
  else
    if new.created_by is distinct from old.created_by then raise exception 'Criador não pode ser alterado'; end if;
    if new.stage_id is distinct from old.stage_id then
      select exists(select 1 from public.stage_transitions where from_stage_id = old.stage_id and to_stage_id = new.stage_id) into allowed;
      if not allowed then raise exception 'Transição não permitida'; end if;
      new.completed_at := case when target_final then now() else null end;
    else
      new.completed_at := old.completed_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger task_write before insert or update on public.tasks for each row execute function public.on_task_write();
create function public.guard_stage_final_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_final is distinct from new.is_final and exists(select 1 from public.tasks where stage_id = old.id) then
    raise exception 'Mova as tarefas desta etapa antes de alterar a regra de conclusão';
  end if;
  return new;
end $$;
create trigger stage_final_guard before update of is_final on public.stages for each row execute function public.guard_stage_final_change();
create function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by)
      values (new.id, case when tg_op = 'INSERT' then null else old.stage_id end, new.stage_id, coalesce(auth.uid(), new.created_by));
    insert into public.task_checklist(task_id, title, position)
      select new.id, template.title, template.position from public.subtask_templates template
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end $$;
create trigger task_movement after insert or update of stage_id on public.tasks for each row execute function public.log_task_movement();

create function public.validate_message() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id <> auth.uid() then raise exception 'Autor inválido'; end if;
  new.created_at := now();
  if new.reply_to_id is not null and not exists(select 1 from public.messages m where m.id = new.reply_to_id and m.channel_id = new.channel_id) then
    raise exception 'Resposta fora do canal';
  end if;
  if new.task_id is not null and not public.can_access_task(new.task_id, auth.uid()) then raise exception 'Tarefa sem acesso'; end if;
  return new;
end $$;
create trigger message_validate before insert on public.messages for each row execute function public.validate_message();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.clients enable row level security;
alter table public.stages enable row level security;
alter table public.stage_transitions enable row level security;
alter table public.subtask_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_movements enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.attachments enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (public.is_active_user(auth.uid()));
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy teams_read on public.teams for select to authenticated using (public.is_active_user(auth.uid()));
create policy teams_admin_write on public.teams for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy members_read on public.team_members for select to authenticated using (public.is_team_member(team_id, auth.uid()));
create policy members_manage on public.team_members for all to authenticated using (public.is_team_manager(team_id, auth.uid())) with check (public.is_team_manager(team_id, auth.uid()));
create policy clients_read on public.clients for select to authenticated using (public.is_active_user(auth.uid()));
create policy clients_write on public.clients for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy stages_read on public.stages for select to authenticated using (public.is_active_user(auth.uid()));
create policy stages_write on public.stages for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy transitions_read on public.stage_transitions for select to authenticated using (public.is_active_user(auth.uid()));
create policy transitions_write on public.stage_transitions for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy templates_read on public.subtask_templates for select to authenticated using (public.is_active_user(auth.uid()));
create policy templates_write on public.subtask_templates for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy tasks_read on public.tasks for select to authenticated using (public.is_team_member(team_id, auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_team_member(team_id, auth.uid()) and created_by = auth.uid() and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active)));
create policy tasks_update on public.tasks for update to authenticated using (public.is_team_member(team_id, auth.uid())) with check (public.is_team_member(team_id, auth.uid()) and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active)));
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_team_manager(team_id, auth.uid()));
create policy checklist_read on public.task_checklist for select to authenticated using (public.can_access_task(task_id, auth.uid()));
create policy checklist_write on public.task_checklist for all to authenticated using (public.can_access_task(task_id, auth.uid())) with check (public.can_access_task(task_id, auth.uid()));
create policy comments_read on public.task_comments for select to authenticated using (public.can_access_task(task_id, auth.uid()));
create policy comments_insert on public.task_comments for insert to authenticated with check (public.can_access_task(task_id, auth.uid()) and author_id = auth.uid());
create policy movements_read on public.task_movements for select to authenticated using (public.can_access_task(task_id, auth.uid()));
create policy channels_read on public.channels for select to authenticated using (public.can_access_channel(id, auth.uid()));
create policy channels_insert on public.channels for insert to authenticated with check (public.is_team_manager(team_id, auth.uid()) and created_by = auth.uid() and lower(name) <> 'geral');
create policy channels_delete on public.channels for delete to authenticated using (public.is_team_manager(team_id, auth.uid()) and lower(name) <> 'geral');
create policy messages_read on public.messages for select to authenticated using (public.can_access_channel(channel_id, auth.uid()));
create policy messages_insert on public.messages for insert to authenticated with check (public.can_access_channel(channel_id, auth.uid()) and author_id = auth.uid() and (task_id is null or public.can_access_task(task_id, auth.uid())));
create policy reads_own on public.message_reads for all to authenticated using (user_id = auth.uid() and public.can_access_channel(channel_id, auth.uid())) with check (user_id = auth.uid() and public.can_access_channel(channel_id, auth.uid()));
create policy attachments_read on public.attachments for select to authenticated using (exists(select 1 from public.messages m where m.id = message_id and public.can_access_channel(m.channel_id, auth.uid())));
create policy attachments_insert on public.attachments for insert to authenticated with check (uploader_id = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text and exists(select 1 from public.messages m where m.id = message_id and m.author_id = auth.uid() and split_part(storage_path, '/', 2) = m.channel_id::text and public.can_access_channel(m.channel_id, auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit) values ('chat-private', 'chat-private', false, 10485760) on conflict (id) do update set public = false;
create policy chat_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'chat-private' and exists (
    select 1 from public.attachments a join public.messages m on m.id = a.message_id
    where a.storage_path = name and public.can_access_channel(m.channel_id, auth.uid())
  )
);
create policy chat_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-private' and split_part(name, '/', 1) = auth.uid()::text and exists (
    select 1 from public.channels c where c.id::text = split_part(name, '/', 2) and public.can_access_channel(c.id, auth.uid())
  )
);
create policy chat_objects_delete on storage.objects for delete to authenticated using (
  bucket_id = 'chat-private' and split_part(name, '/', 1) = auth.uid()::text
);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.attachments;

insert into public.teams (name, color) values
  ('Comercial','#e9a23b'), ('Desenvolvimento','#6f72d9'), ('Design','#d684a8'), ('Financeiro','#4caa90');
insert into public.stages (name, position, color, is_final, is_pause) values
  ('Backlog',0,'#f59e0b',false,false), ('Negociação',1,'#6b7280',false,false),
  ('Contrato',2,'#3b82f6',false,false), ('Kick-off',3,'#ef4444',false,false),
  ('Criação de Imagens',4,'#22c55e',false,false), ('Desenvolvimento',5,'#8b5cf6',false,false),
  ('Integração',6,'#777dd8',false,false), ('Homologação',7,'#9e8ccf',false,false),
  ('Criação de Telas',8,'#c184be',false,false), ('Deploy',9,'#6d9ed0',false,false),
  ('Aprovação',10,'#c19967',false,false), ('Entrega',11,'#6ab7a1',false,false),
  ('Faturamento',12,'#4caa90',false,false), ('Concluído',13,'#4caa90',true,false),
  ('Pausado',14,'#f59e0b',false,true);
insert into public.stage_transitions (from_stage_id, to_stage_id)
select a.id, b.id from public.stages a join public.stages b on
  (b.position = a.position + 1 and a.position between 0 and 12)
  or (a.name = 'Concluído' and b.name = 'Faturamento')
  or (a.name = 'Pausado' and b.name = 'Backlog')
  or (a.name not in ('Pausado','Concluído') and b.name in ('Pausado','Backlog') and a.id <> b.id);
insert into public.subtask_templates (stage_id, title, position)
select s.id, v.title, v.position from public.stages s join (values
  ('Kick-off','Alinhar escopo com o cliente',1), ('Kick-off','Registrar responsáveis',2),
  ('Desenvolvimento','Revisar implementação',1), ('Homologação','Validar critérios de aceite',1),
  ('Deploy','Confirmar checklist de publicação',1), ('Entrega','Enviar material final',1)
) as v(stage,title,position) on s.name = v.stage;
insert into public.channels (team_id, name) select id, 'Geral' from public.teams;
