--
-- ==============================================================================
-- SCRIPT COMPLETO MESTRE DE TODAS AS MIGRATIONS (SOMAX HUB)
-- ==============================================================================
-- Este script contém a totalidade das 34 migrations sequenciais do sistema,
-- desde a inicialização completa de tabelas e RLS até a última funcionalidade.
-- Total de migrations compiladas: 34
-- ==============================================================================
--


-- ==============================================================================
-- MIGRATION: 202611070001_init.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611080001_template_groups.sql
-- ==============================================================================
-- Grupos opcionais selecionados na criação de tarefas.
create table public.checklist_template_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  position integer not null default 0
);
create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.checklist_template_groups(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  position integer not null default 0
);
create index checklist_template_items_group_idx on public.checklist_template_items(group_id, position);
alter table public.checklist_template_groups enable row level security;
alter table public.checklist_template_items enable row level security;
create policy template_groups_read on public.checklist_template_groups for select to authenticated using (public.is_active_user(auth.uid()));
create policy template_groups_write on public.checklist_template_groups for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy template_items_read on public.checklist_template_items for select to authenticated using (public.is_active_user(auth.uid()));
create policy template_items_write on public.checklist_template_items for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.is_team_member(p_team_id, auth.uid()) then
    raise exception 'Sem acesso à equipe';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;
  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), auth.uid())
    returning id into created_id;
  insert into public.task_checklist(task_id, title, position)
    select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id)
    from public.checklist_template_items item
    join public.checklist_template_groups template on template.id = item.group_id
    where item.group_id = any(coalesce(p_template_ids,'{}'))
      and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);
  return created_id;
end $$;
revoke all on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[]) from public;
grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[]) to authenticated;

insert into public.checklist_template_groups(name,position) values
  ('BRANDKIT',1), ('Contrato',2), ('Criação de Imagens',3), ('Deploy',4),
  ('Desenvolvimento de APP',5), ('Entrega',6), ('Faturamento',7), ('Homologação',8),
  ('Integração',9), ('Kick-off',10), ('Nova Integração',11), ('Personalização',12),
  ('Produção das telas',13);

insert into public.checklist_template_items(group_id,title,position)
select template.id, item.title, item.position
from (values
  ('BRANDKIT',array['Briefing de marca','Pesquisa de referências','Paleta de cores','Tipografia','Conceito visual','Variações de logo','Aplicações','Guia de uso','Revisão final']),
  ('Contrato',array['Confirmar escopo','Revisar condições','Coletar aprovação']),
  ('Criação de Imagens',array['Receber briefing','Reunir referências','Criar rascunhos','Revisar peças','Exportar arquivos','Solicitar aprovação']),
  ('Deploy',array['Validar ambiente','Preparar publicação','Executar deploy','Verificar serviços','Testar navegação','Registrar versão']),
  ('Desenvolvimento de APP',array['Definir arquitetura','Implementar funcionalidades','Revisar aplicação']),
  ('Entrega',array['Conferir arquivos','Enviar entrega','Registrar aceite']),
  ('Faturamento',array['Emitir faturamento']),
  ('Homologação',array['Preparar cenário','Validar critérios','Registrar aprovação']),
  ('Integração',array['Validar conexão']),
  ('Kick-off',array['Agendar reunião','Confirmar participantes','Alinhar objetivos','Definir responsáveis','Registrar prazos','Compartilhar ata']),
  ('Nova Integração',array['Mapear requisitos']),
  ('Personalização',array['Levantar preferências','Definir proposta','Criar variações','Revisar textos','Validar identidade','Aplicar ajustes','Aprovar versão final']),
  ('Produção das telas',array['Desenhar wireframes','Criar layouts','Revisar responsividade'])
) as seed(name,items)
join public.checklist_template_groups template on template.name = seed.name
cross join lateral unnest(seed.items) with ordinality as item(title,position);



-- ==============================================================================
-- MIGRATION: 202611080002_flow_descriptions.sql
-- ==============================================================================
alter table public.stage_transitions
  add column description text check (description is null or length(description) <= 500);

update public.stage_transitions transition
set description = 'Após a assinatura do contrato, iniciar o kick-off.'
from public.stages origin, public.stages target
where transition.from_stage_id = origin.id
  and transition.to_stage_id = target.id
  and origin.name = 'Contrato'
  and target.name = 'Kick-off';



-- ==============================================================================
-- MIGRATION: 202611080003_template_editor.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611080004_tags.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611080005_kanban_stages.sql
-- ==============================================================================
-- Ordena as colunas iniciais do Kanban sem alterar as transições do fluxo.
do $$
declare v_offset integer;
begin
  select max(position) - min(position) + count(*) + 1 into v_offset from public.stages;
  update public.stages set position = position + v_offset;
  with ordered as (
    select id, row_number() over (order by
      case name
        when 'Negociação' then 0
        when 'Pausado' then 1
        when 'Backlog' then 2
        when 'Contrato' then 3
        when 'Kick-off' then 4
        when 'Criação de Imagens' then 5
        when 'Desenvolvimento' then 6
        when 'Integração' then 7
        when 'Homologação' then 8
        when 'Criação de Telas' then 9
        when 'Deploy' then 10
        when 'Aprovação' then 11
        when 'Entrega' then 12
        when 'Faturamento' then 13
        when 'Concluído' then 14
        else 100 + position
      end, position) - 1 as new_position
    from public.stages
  )
  update public.stages stage set position = ordered.new_position
  from ordered where stage.id = ordered.id;
end $$;

create function public.reorder_stages(p_stage_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_offset integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Somente administradores podem ordenar etapas'; end if;
  lock table public.stages in share row exclusive mode;
  select count(*), max(position) - min(position) + count(*) + 1 into v_count, v_offset from public.stages;
  if cardinality(p_stage_ids) <> v_count
    or (select count(distinct id) from unnest(p_stage_ids) as item(id)) <> v_count
    or exists (select stage.id from public.stages stage except select id from unnest(p_stage_ids) as item(id))
  then raise exception 'A lista deve conter todas as etapas uma vez'; end if;
  update public.stages set position = position + v_offset;
  update public.stages stage set position = ordered.position
  from (select id, ordinality::integer - 1 as position from unnest(p_stage_ids) with ordinality as item(id,ordinality)) ordered
  where stage.id = ordered.id;
end $$;
revoke all on function public.reorder_stages(uuid[]) from public;
grant execute on function public.reorder_stages(uuid[]) to authenticated;

create function public.guard_stage_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.tasks where stage_id = old.id)
    or exists(select 1 from public.stage_transitions where from_stage_id = old.id or to_stage_id = old.id)
    or exists(select 1 from public.subtask_templates where stage_id = old.id)
  then raise exception 'Remova as tarefas, os fluxos e os itens padrão desta etapa antes de excluí-la'; end if;
  if old.is_final and (select count(*) from public.stages where is_final) <= 1
  then raise exception 'Mantenha ao menos uma etapa final'; end if;
  return old;
end $$;
create trigger stage_delete_guard before delete on public.stages
for each row execute function public.guard_stage_delete();



-- ==============================================================================
-- MIGRATION: 202611080006_people_teams.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611090001_user_settings.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611090002_client_financial_details.sql
-- ==============================================================================
alter table public.clients
  add column financial_contact_name text,
  add column financial_email text,
  add column financial_whatsapp text,
  add column financial_due_date date,
  add column integration_items jsonb not null default '[]'::jsonb,
  add constraint clients_integration_items_array check (jsonb_typeof(integration_items) = 'array');



-- ==============================================================================
-- MIGRATION: 202611090002_master_admin.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611090003_manage_users.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611090004_unread_message_counts.sql
-- ==============================================================================
-- Uma única chamada para os badges do chat, respeitando as políticas RLS do usuário autenticado.
create function public.unread_message_counts()
returns table(channel_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         count(m.id)::bigint
  from public.channels c
  left join public.message_reads r
    on r.channel_id = c.id and r.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
   and m.author_id <> auth.uid()
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id
$$;

revoke all on function public.unread_message_counts() from public;
grant execute on function public.unread_message_counts() to authenticated;



-- ==============================================================================
-- MIGRATION: 202611090005_allow_conclude_from_all_stages.sql
-- ==============================================================================
-- Permite que tarefas em qualquer etapa possam transicionar diretamente para a etapa final (Concluído)
insert into public.stage_transitions (from_stage_id, to_stage_id)
select s.id, f.id
from public.stages s, public.stages f
where f.is_final = true and s.id != f.id
on conflict (from_stage_id, to_stage_id) do nothing;



-- ==============================================================================
-- MIGRATION: 202611100001_tasks_delete_policy.sql
-- ==============================================================================
-- Migration: 202611100001_tasks_delete_policy.sql
-- Permite que administradores, gestores da equipe e o próprio criador da tarefa possam excluí-la.

drop policy if exists tasks_delete on public.tasks;

create policy tasks_delete on public.tasks for delete to authenticated using (
  public.is_team_manager(team_id, auth.uid()) or created_by = auth.uid()
);



-- ==============================================================================
-- MIGRATION: 202611100002_update_kanban_flows.sql
-- ==============================================================================
-- Atualização dos nomes de etapas e descrições dos fluxos operacionais da Somax.

-- 1. Renomeia etapas para refletir a nomenclatura exata do fluxo
update public.stages set name = 'Desenvolvimento APP' where name = 'Desenvolvimento';
update public.stages set name = 'Integração/Personalização' where name = 'Integração';
update public.stages set name = 'Aguardando Aprovação' where name = 'Aprovação';

-- 2. Assegura a existência das transições principais e atualiza suas descrições
with stage_ids as (
  select id, name from public.stages
),
flow_data as (
  select * from (values
    ('Negociação', 'Contrato', null::text),
    ('Contrato', 'Kick-off', 'Após assinatura de contrato, mover para kickoff'),
    ('Kick-off', 'Criação de Imagens', 'Após o kickoff e receber todo o Brandkit do cliente enviar para etapa de Criação de Imagens'),
    ('Criação de Imagens', 'Desenvolvimento APP', 'Após conclusão de todas as imagens mover para equipa de Desenvolvimento do APP'),
    ('Desenvolvimento APP', 'Integração/Personalização', 'Após App criado, mover para etapa de integração e personalização'),
    ('Integração/Personalização', 'Homologação', 'Após app integrado e personalizado mover para etapa de homologação'),
    ('Homologação', 'Criação de Telas', 'Após homologar o app com o cliente mover para Criação de Telas'),
    ('Criação de Telas', 'Deploy', 'Após todas as telas produzidas, mover para Deploy'),
    ('Deploy', 'Aguardando Aprovação', 'Após subir o App nas lojas, mover para Aguardando Aprovação'),
    ('Aguardando Aprovação', 'Entrega', 'Após APP publicado em ambas as lojas mover para etapa de Entrega'),
    ('Entrega', 'Faturamento', 'Após finalizar entrega do cliente mover para Faturamento.'),
    ('Faturamento', 'Concluído', null::text)
  ) as v(from_name, to_name, description)
)
insert into public.stage_transitions (from_stage_id, to_stage_id, description)
select orig.id, dest.id, flow.description
from flow_data flow
join stage_ids orig on orig.name = flow.from_name
join stage_ids dest on dest.name = flow.to_name
on conflict (from_stage_id, to_stage_id)
do update set description = excluded.description;



-- ==============================================================================
-- MIGRATION: 202611100003_admin_free_flow.sql
-- ==============================================================================
-- Permite que administradores movam tarefas livremente para qualquer etapa (Fluxo Livre),
-- enquanto colaboradores e gestores continuam restritos às transições permitidas (Fluxo Guiado).

create or replace function public.on_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
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
      -- Se não for administrador, exige que a transição esteja explicitamente cadastrada
      if not public.is_admin(auth.uid()) then
        select exists(
          select 1 from public.stage_transitions
          where from_stage_id = old.stage_id and to_stage_id = new.stage_id
        ) into allowed;
        if not allowed then
          raise exception 'Transição não permitida: siga o fluxo guiado da equipe';
        end if;
      end if;
      new.completed_at := case when target_final then now() else null end;
    else
      new.completed_at := old.completed_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;



-- ==============================================================================
-- MIGRATION: 202611100004_update_checklist_templates.sql
-- ==============================================================================
-- Atualiza os templates e subtarefas dos grupos de checklist padrão da Somax

-- 1. Garante que todos os 13 grupos existam
insert into public.checklist_template_groups (name, position)
values
  ('BRANDKIT', 1),
  ('Contrato', 2),
  ('Criação de Imagens', 3),
  ('Produção das telas', 4),
  ('Personalização', 5),
  ('Nova Integração', 6),
  ('Kick-off', 7),
  ('Integração', 8),
  ('Homologação', 9),
  ('Faturamento', 10),
  ('Entrega', 11),
  ('Desenvolvimento de APP', 12),
  ('Deploy', 13)
on conflict (name) do update set position = excluded.position;

-- 2. Limpa os itens de template dos grupos para regravar os itens oficiais solicitados
delete from public.checklist_template_items
where group_id in (
  select id from public.checklist_template_groups
  where name in (
    'BRANDKIT', 'Contrato', 'Criação de Imagens', 'Produção das telas',
    'Personalização', 'Nova Integração', 'Kick-off', 'Integração',
    'Homologação', 'Faturamento', 'Entrega', 'Desenvolvimento de APP', 'Deploy'
  )
);

-- 3. Insere os itens exatos de cada grupo
with template_data as (
  select * from (values
    ('BRANDKIT', array[
      'NOME DO APP PARA AS LOJAS',
      'URL DO SISTEMA DE GESTAO',
      'DADOS DE INTEGRACAO',
      '3 CPFS PARA TESTES',
      'DADOS DE REDES SOCIAIS',
      'SOLICITAR LOGOTIPO DO CLIENTE EM PDF',
      'CONTATO CENTRAL DE ATENDIMENTO',
      'URL TESTE DE VELOCIDADE',
      'SITE DO PROVEDOR'
    ]),
    ('Contrato', array[
      'Gerar contrato',
      'Enviar Contrato',
      'Contrato assinado'
    ]),
    ('Criação de Imagens', array[
      'Icones do Android',
      'Icones do Apple',
      'Tela de Splash',
      'Banner Home',
      'Imagem para SVA',
      'Paleta de Cores'
    ]),
    ('Produção das telas', array[
      'Desing para Android',
      'Desing para iPhone',
      'Desing para iPad'
    ]),
    ('Personalização', array[
      'Banner Home',
      'Tela de Splash',
      'Tela de Login',
      'Tela Principal',
      'Tela de Fatruras',
      'Tela de Notificações',
      'SVA'
    ]),
    ('Nova Integração', array[
      'Nova integração com ERP'
    ]),
    ('Kick-off', array[
      'Criação de Grupo',
      'Criação de Apresentação',
      'Criação do Cronograma',
      'Reunião de Kick-off',
      'Criação do Termo de Abertura',
      'Criação do Termo de Encerramento'
    ]),
    ('Integração', array[
      'Realizar integração com ERP'
    ]),
    ('Homologação', array[
      'Homologar Super App com cliente',
      'Realizar Meet',
      'Criar credencias do Cliente'
    ]),
    ('Faturamento', array[
      'Gerar fatura do cliente'
    ]),
    ('Entrega', array[
      'Termo de encerramento do projeto',
      'Treinamento para o Cliente',
      'Criação dos cards de divulgação'
    ]),
    ('Desenvolvimento de APP', array[
      'Duplicação do APP',
      'Provisionamento da infraestrutura',
      'Configuração das notificações'
    ]),
    ('Deploy', array[
      'Deploy Google',
      'Preparação para publicação',
      'Publicação concluída',
      'Revisão das lojas',
      'Validação da Upload Key  Google Play',
      'Deploy Apple'
    ])
  ) as v(name, items)
)
insert into public.checklist_template_items (group_id, title, position)
select g.id, item.title, item.position
from template_data t
join public.checklist_template_groups g on g.name = t.name
cross join lateral unnest(t.items) with ordinality as item(title, position);



-- ==============================================================================
-- MIGRATION: 202611100005_update_stage_subtask_templates.sql
-- ==============================================================================
-- Atualiza as subtarefas padrão de cada etapa (subtask_templates),
-- aplicadas automaticamente quando uma tarefa entra na respectiva etapa do Kanban.

-- 1. Remove templates antigos de etapas para sincronizar com a lista oficial
delete from public.subtask_templates;

-- 2. Insere as subtarefas padrão por etapa
with stage_subtasks as (
  select * from (values
    ('Contrato', array[
      'Gerar contrato',
      'Enviar Contrato',
      'Contrato assinado'
    ]),
    ('Kick-off', array[
      'Criação de Grupo',
      'Criação de Apresentação',
      'Criação do Cronograma',
      'Reunião de Kick-off',
      'Criação do Termo de Abertura',
      'Criação do Termo de Encerramento'
    ]),
    ('Criação de Imagens', array[
      'Icones do Android',
      'Icones do Apple',
      'Tela de Splash',
      'Banner Home',
      'Imagem para SVA',
      'Paleta de Cores'
    ]),
    ('Criação de Telas', array[
      'Desing para Android',
      'Desing para iPhone',
      'Desing para iPad'
    ]),
    ('Desenvolvimento APP', array[
      'Duplicação do APP',
      'Provisionamento da infraestrutura',
      'Configuração das notificações'
    ]),
    ('Integração/Personalização', array[
      'Realizar integração com ERP',
      'Banner Home',
      'Tela de Splash',
      'Tela de Login',
      'Tela Principal',
      'Tela de Fatruras',
      'Tela de Notificações',
      'SVA'
    ]),
    ('Homologação', array[
      'Homologar Super App com cliente',
      'Realizar Meet',
      'Criar credencias do Cliente'
    ]),
    ('Deploy', array[
      'Deploy Google',
      'Preparação para publicação',
      'Publicação concluída',
      'Revisão das lojas',
      'Validação da Upload Key  Google Play',
      'Deploy Apple'
    ]),
    ('Entrega', array[
      'Termo de encerramento do projeto',
      'Treinamento para o Cliente',
      'Criação dos cards de divulgação'
    ]),
    ('Faturamento', array[
      'Gerar fatura do cliente'
    ])
  ) as v(stage_name, items)
)
insert into public.subtask_templates (stage_id, title, position)
select s.id, item.title, item.position
from stage_subtasks st
join public.stages s on s.name = st.stage_name
cross join lateral unnest(st.items) with ordinality as item(title, position);



-- ==============================================================================
-- MIGRATION: 202611100006_task_checklist_group_name.sql
-- ==============================================================================
-- Migration: Adicionar group_name a task_checklist e suporte a templates agrupados
-- Adiciona a coluna group_name para identificar o template de origem da subtarefa
alter table public.task_checklist add column if not exists group_name text;

-- Atualiza create_task_with_templates para registrar o nome do template no group_name
create or replace function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.is_team_member(p_team_id, auth.uid()) then
    raise exception 'Sem acesso à equipe';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), auth.uid())
    returning id into created_id;

  insert into public.task_checklist(task_id, title, position, group_name)
    select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
    from public.checklist_template_items item
    join public.checklist_template_groups template on template.id = item.group_id
    where item.group_id = any(coalesce(p_template_ids,'{}'))
      and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);

  return created_id;
end $$;

-- Atualiza log_task_movement para salvar o nome da etapa como group_name ao inserir subtarefas automáticas
create or replace function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by)
      values (new.id, case when tg_op = 'INSERT' then null else old.stage_id end, new.stage_id, coalesce(auth.uid(), new.created_by));

    insert into public.task_checklist(task_id, title, position, group_name)
      select new.id, template.title, template.position, stage.name
      from public.subtask_templates template
      join public.stages stage on stage.id = template.stage_id
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end $$;

-- Cria função para aplicar templates diretamente em tarefas existentes
create or replace function public.apply_template_to_task(
  p_task_id uuid,
  p_template_id uuid
) returns int language plpgsql security definer set search_path = '' as $$
declare
  inserted_count int;
  t_name text;
begin
  if not public.can_access_task(p_task_id, auth.uid()) then
    raise exception 'Sem permissão para alterar esta tarefa';
  end if;

  select name into t_name from public.checklist_template_groups where id = p_template_id;
  if t_name is null then
    raise exception 'Template não encontrado';
  end if;

  with inserted as (
    insert into public.task_checklist(task_id, title, position, group_name)
    select p_task_id, item.title, 1000 + row_number() over (order by item.position, item.id), t_name
    from public.checklist_template_items item
    where item.group_id = p_template_id
      and not exists (
        select 1 from public.task_checklist existing
        where existing.task_id = p_task_id and existing.title = item.title
      )
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return inserted_count;
end $$;

revoke all on function public.apply_template_to_task(uuid, uuid) from public;
grant execute on function public.apply_template_to_task(uuid, uuid) to authenticated;

-- Preenche group_name para subtarefas já cadastradas existentes
update public.task_checklist tc
set group_name = g.name
from public.checklist_template_items ti
join public.checklist_template_groups g on g.id = ti.group_id
where tc.group_name is null and lower(trim(tc.title)) = lower(trim(ti.title));

update public.task_checklist tc
set group_name = s.name
from public.subtask_templates st
join public.stages s on s.id = st.stage_id
where tc.group_name is null and lower(trim(tc.title)) = lower(trim(st.title));



-- ==============================================================================
-- MIGRATION: 202611100007_custom_boards_scrum.sql
-- ==============================================================================
-- Migration: Quadros Kanban personalizados, visões de setor e Scrum
-- 202611100007_custom_boards_scrum.sql

-- 1. Tabela de Quadros
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null default 'custom' check (type in ('general', 'sector_view', 'custom')),
  methodology text not null default 'kanban' check (methodology in ('kanban', 'scrum')),
  team_id uuid references public.teams(id) on delete cascade,
  is_shared boolean not null default false,
  stage_ids uuid[] default '{}',
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Tabela de Etapas dos Quadros Personalizados
create table if not exists public.board_stages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  position integer not null default 0,
  wip_limit integer default null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Tabela de Sprints (Scrum)
create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  goal text,
  start_date date,
  end_date date,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Adicionar board_id e sprint_id em public.tasks
alter table public.tasks add column if not exists board_id uuid references public.boards(id) on delete cascade;
alter table public.tasks add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

-- Índices de performance
create index if not exists idx_tasks_board_id on public.tasks(board_id);
create index if not exists idx_tasks_sprint_id on public.tasks(sprint_id);
create index if not exists idx_boards_team_id on public.boards(team_id);
create index if not exists idx_board_stages_board on public.board_stages(board_id, position);
create index if not exists idx_sprints_board on public.sprints(board_id, status);

-- 5. Funções de auxílio para RLS
create or replace function public.can_access_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        public.is_admin(p_user_id)
        or b.is_shared
        or (b.team_id is not null and public.is_team_member(b.team_id, p_user_id))
      )
  );
$$;

create or replace function public.can_manage_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        public.is_admin(p_user_id)
        or (b.type = 'custom' and b.team_id is not null and public.is_team_manager(b.team_id, p_user_id))
        or (b.type = 'custom' and b.created_by = p_user_id)
      )
  );
$$;

-- 6. Habilitar RLS
alter table public.boards enable row level security;
alter table public.board_stages enable row level security;
alter table public.sprints enable row level security;

-- Políticas de RLS em boards
drop policy if exists boards_read on public.boards;
create policy boards_read on public.boards
  for select to authenticated
  using (public.can_access_board(id, auth.uid()));

drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards
  for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or (
      type = 'custom'
      and (
        (team_id is not null and public.is_team_manager(team_id, auth.uid()))
        or created_by = auth.uid()
      )
    )
  );

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards
  for update to authenticated
  using (public.can_manage_board(id, auth.uid()))
  with check (public.can_manage_board(id, auth.uid()));

drop policy if exists boards_delete on public.boards;
create policy boards_delete on public.boards
  for delete to authenticated
  using (public.can_manage_board(id, auth.uid()));

-- Políticas de RLS em board_stages
drop policy if exists board_stages_read on public.board_stages;
create policy board_stages_read on public.board_stages
  for select to authenticated
  using (public.can_access_board(board_id, auth.uid()));

drop policy if exists board_stages_write on public.board_stages;
create policy board_stages_write on public.board_stages
  for all to authenticated
  using (public.can_manage_board(board_id, auth.uid()))
  with check (public.can_manage_board(board_id, auth.uid()));

-- Políticas de RLS em sprints
drop policy if exists sprints_read on public.sprints;
create policy sprints_read on public.sprints
  for select to authenticated
  using (public.can_access_board(board_id, auth.uid()));

drop policy if exists sprints_write on public.sprints;
create policy sprints_write on public.sprints
  for all to authenticated
  using (public.can_manage_board(board_id, auth.uid()))
  with check (public.can_manage_board(board_id, auth.uid()));

-- Atualização na política de leitura de tarefas para permitir acesso a tarefas do quadro
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (board_id is null and public.is_team_member(team_id, auth.uid()))
    or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  );

-- 7. RPC atômica para criar quadro com etapas
create or replace function public.create_custom_board(
  p_name text,
  p_description text,
  p_type text,
  p_methodology text,
  p_team_id uuid,
  p_is_shared boolean,
  p_stage_ids uuid[],
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
    trim(p_name),
    p_description,
    p_type,
    p_methodology,
    case when p_is_shared then null else p_team_id end,
    p_is_shared,
    coalesce(p_stage_ids, '{}'),
    auth.uid()
  )
  returning id into v_board_id;

  if p_type = 'custom' and jsonb_array_length(p_stages) > 0 then
    for v_stage in select * from jsonb_array_elements(p_stages) loop
      v_pos := v_pos + 1;
      insert into public.board_stages(board_id, name, color, position, wip_limit, is_final)
      values (
        v_board_id,
        trim(coalesce(v_stage->>'name', 'Etapa ' || v_pos)),
        coalesce(v_stage->>'color', '#64748b'),
        v_pos,
        nullif((v_stage->>'wip_limit')::int, 0),
        coalesce((v_stage->>'is_final')::boolean, false)
      );
    end loop;
  end if;

  return v_board_id;
end $$;

revoke all on function public.create_custom_board(text, text, text, text, uuid, boolean, uuid[], jsonb) from public;
grant execute on function public.create_custom_board(text, text, text, text, uuid, boolean, uuid[], jsonb) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611100007_insert_requested_tags.sql
-- ==============================================================================
-- Migration: Inserir novas tags do sistema
-- Tags solicitadas: Atualizar versão do APP, Concluido, Faturado, Google, Higor, Integrado, Nova Integração, Novo Cliente, Personalizado, Urgente

insert into public.tags (name, color)
select v.name, v.color
from (values
  ('Atualizar versão do APP', '#6366f1'),
  ('Concluido', '#10b981'),
  ('Faturado', '#059669'),
  ('Google', '#ea4335'),
  ('Higor', '#3b82f6'),
  ('Integrado', '#06b6d4'),
  ('Nova Integração', '#8b5cf6'),
  ('Novo Cliente', '#f59e0b'),
  ('Personalizado', '#ec4899'),
  ('Urgente', '#ef4444')
) as v(name, color)
where not exists (
  select 1 from public.tags t where lower(t.name) = lower(v.name)
);



-- ==============================================================================
-- MIGRATION: 202611100008_create_custom_board_rpc_defaults.sql
-- ==============================================================================
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



-- ==============================================================================
-- MIGRATION: 202611100009_custom_board_stages_and_tasks.sql
-- ==============================================================================
-- Migration: 202611100009_custom_board_stages_and_tasks.sql
-- Objetivo: Suporte completo para criação de tarefas em quadros novos e edição dinâmica de etapas de quadros personalizados e visões de setor.

-- 1. Desvincular FKs diretas que impediam stage_id em board_stages
alter table public.tasks drop constraint if exists tasks_stage_id_fkey;
alter table public.task_movements drop constraint if exists task_movements_from_stage_id_fkey;
alter table public.task_movements drop constraint if exists task_movements_to_stage_id_fkey;

-- 2. Atualizar gatilho on_task_write para validar tanto etapas canônicas quanto etapas customizadas
create or replace function public.on_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_final boolean;
  allowed boolean;
  v_board_type text := 'general';
begin
  if new.board_id is not null then
    select type into v_board_type from public.boards where id = new.board_id;
  end if;

  if v_board_type = 'custom' then
    select is_final into target_final from public.board_stages where id = new.stage_id and board_id = new.board_id;
    if target_final is null then
      raise exception 'Etapa inválida para este quadro personalizado';
    end if;

    if tg_op = 'INSERT' then
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    else
      if new.created_by is distinct from old.created_by then
        raise exception 'Criador não pode ser alterado';
      end if;
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    end if;
  else
    -- Quadro Geral ou Visão de Setor
    select is_final into target_final from public.stages where id = new.stage_id;
    if target_final is null then
      raise exception 'Etapa inválida';
    end if;

    if tg_op = 'INSERT' then
      new.completed_at := case when target_final then now() else null end;
      new.updated_at := now();
    else
      if new.created_by is distinct from old.created_by then
        raise exception 'Criador não pode ser alterado';
      end if;
      if new.stage_id is distinct from old.stage_id then
        if not public.is_admin(auth.uid()) then
          select exists(
            select 1 from public.stage_transitions
            where from_stage_id = old.stage_id and to_stage_id = new.stage_id
          ) into allowed;
          if not allowed then
            raise exception 'Transição não permitida: siga o fluxo guiado da equipe';
          end if;
        end if;
        new.completed_at := case when target_final then now() else null end;
      else
        new.completed_at := old.completed_at;
      end if;
      new.updated_at := now();
    end if;
  end if;

  return new;
end $$;

-- 3. Atualizar create_task_with_templates para suportar board_id e sprint_id
create or replace function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}',
  p_board_id uuid default null,
  p_sprint_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not (public.is_admin(auth.uid()) or public.is_team_member(p_team_id, auth.uid())) then
    raise exception 'Sem acesso à equipe';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), auth.uid(), p_board_id, p_sprint_id)
    returning id into created_id;

  if p_template_ids is not null and array_length(p_template_ids, 1) > 0 then
    insert into public.task_checklist(task_id, title, position, group_name)
      select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
      from public.checklist_template_items item
      join public.checklist_template_groups template on template.id = item.group_id
      where item.group_id = any(coalesce(p_template_ids,'{}'))
        and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);
  end if;

  return created_id;
end $$;

grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;

-- 4. RPC para atualizar quadros e gerenciar etapas dinamicamente
create or replace function public.update_custom_board(
  p_board_id uuid,
  p_name text,
  p_description text default null,
  p_methodology text default 'kanban',
  p_team_id uuid default null,
  p_is_shared boolean default false,
  p_stage_ids uuid[] default array[]::uuid[],
  p_stages jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_stage jsonb;
  v_pos int := 0;
  v_board_type text;
  v_stage_id uuid;
  v_kept_stage_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.can_manage_board(p_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar este quadro';
  end if;

  select type into v_board_type from public.boards where id = p_board_id;
  if v_board_type is null then raise exception 'Quadro não encontrado'; end if;

  update public.boards
  set name = p_name,
      description = p_description,
      methodology = coalesce(p_methodology, methodology),
      team_id = p_team_id,
      is_shared = coalesce(p_is_shared, false),
      stage_ids = case when v_board_type = 'sector_view' then coalesce(p_stage_ids, array[]::uuid[]) else stage_ids end,
      updated_at = now()
  where id = p_board_id;

  if v_board_type = 'custom' and p_stages is not null then
    for v_stage in select * from jsonb_array_elements(p_stages) loop
      v_stage_id := (v_stage->>'id')::uuid;
      if v_stage_id is not null and exists (select 1 from public.board_stages where id = v_stage_id and board_id = p_board_id) then
        update public.board_stages
        set name = coalesce(v_stage->>'name', name),
            color = coalesce(v_stage->>'color', color),
            position = v_pos,
            wip_limit = (v_stage->>'wip_limit')::int,
            is_final = coalesce((v_stage->>'is_final')::boolean, is_final)
        where id = v_stage_id and board_id = p_board_id;
        v_kept_stage_ids := array_append(v_kept_stage_ids, v_stage_id);
      else
        insert into public.board_stages(board_id, name, color, position, wip_limit, is_final)
        values (
          p_board_id,
          coalesce(v_stage->>'name', 'Etapa ' || (v_pos + 1)),
          coalesce(v_stage->>'color', '#3b82f6'),
          v_pos,
          (v_stage->>'wip_limit')::int,
          coalesce((v_stage->>'is_final')::boolean, false)
        )
        returning id into v_stage_id;
        v_kept_stage_ids := array_append(v_kept_stage_ids, v_stage_id);
      end if;
      v_pos := v_pos + 1;
    end loop;

    -- Se alguma etapa foi excluída, move as tarefas dela para a primeira etapa restante
    if array_length(v_kept_stage_ids, 1) > 0 then
      update public.tasks
      set stage_id = v_kept_stage_ids[1]
      where board_id = p_board_id and stage_id not in (select unnest(v_kept_stage_ids));

      delete from public.board_stages
      where board_id = p_board_id and id not in (select unnest(v_kept_stage_ids));
    end if;
  end if;
end;
$$;

grant execute on function public.update_custom_board(uuid, text, text, text, uuid, boolean, uuid[], jsonb) to authenticated;

notify pgrst, 'reload schema';



-- ==============================================================================
-- MIGRATION: 202611110001_scrum_sprints_and_backlog.sql
-- ==============================================================================
-- Migration: Fase 2 - Scrum, Sprints, Backlog e Burndown
-- 202611110001_scrum_sprints_and_backlog.sql

-- 1. Novas colunas em public.tasks para story points e ordenação no backlog
alter table public.tasks add column if not exists story_points integer not null default 0;
alter table public.tasks add column if not exists backlog_order integer not null default 0;

-- 2. Índice único parcial para garantir rigorosamente no máximo 1 sprint ativa por quadro
create unique index if not exists idx_unique_active_sprint_per_board
  on public.sprints(board_id)
  where status = 'active';

-- Índices de suporte para backlog e sprints
create index if not exists idx_tasks_scrum_backlog
  on public.tasks(board_id, backlog_order)
  where sprint_id is null;

create index if not exists idx_tasks_sprint_active
  on public.tasks(sprint_id)
  where sprint_id is not null;

-- 3. RPC atômica: Iniciar Sprint
create or replace function public.start_sprint(
  p_sprint_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_status text;
  v_start_date date;
  v_end_date date;
  v_task_count int;
  v_active_count int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id, status, start_date, end_date
    into v_board_id, v_status, v_start_date, v_end_date
    from public.sprints
   where id = p_sprint_id;

  if v_board_id is null then
    raise exception 'Sprint não encontrada';
  end if;

  if not public.can_manage_board(v_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar sprints deste quadro';
  end if;

  if v_status != 'planning' then
    raise exception 'Apenas sprints planejadas podem ser iniciadas (status atual: %)', v_status;
  end if;

  -- Validação de datas
  if v_start_date is null or v_end_date is null then
    raise exception 'A sprint deve conter data de início e término definidas';
  end if;

  if v_end_date < v_start_date then
    raise exception 'A data de término não pode ser anterior à data de início';
  end if;

  -- Validação de tarefas alocadas
  select count(*) into v_task_count
    from public.tasks
   where sprint_id = p_sprint_id;

  if v_task_count = 0 then
    raise exception 'A sprint deve conter ao menos uma tarefa para ser iniciada';
  end if;

  -- Validação de sprint ativa concorrente no mesmo quadro
  select count(*) into v_active_count
    from public.sprints
   where board_id = v_board_id and status = 'active';

  if v_active_count > 0 then
    raise exception 'Já existe uma sprint ativa neste quadro. Encerre-a antes de iniciar uma nova.';
  end if;

  -- Ativação atômica
  update public.sprints
     set status = 'active',
         updated_at = now()
   where id = p_sprint_id;

  return jsonb_build_object('success', true, 'sprint_id', p_sprint_id, 'status', 'active');
end $$;

revoke all on function public.start_sprint(uuid) from public;
grant execute on function public.start_sprint(uuid) to authenticated;

-- 4. RPC atômica: Mover tarefa entre Backlog e Sprint
create or replace function public.move_task_sprint(
  p_task_id uuid,
  p_sprint_id uuid, -- se null, volta ao backlog
  p_backlog_order int default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task_board_id uuid;
  v_sprint_board_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id into v_task_board_id
    from public.tasks
   where id = p_task_id;

  if v_task_board_id is null then
    raise exception 'Tarefa não encontrada ou não pertence a um quadro';
  end if;

  if not public.can_access_board(v_task_board_id, auth.uid()) then
    raise exception 'Sem permissão para alterar tarefas deste quadro';
  end if;

  if p_sprint_id is not null then
    select board_id into v_sprint_board_id
      from public.sprints
     where id = p_sprint_id;

    if v_sprint_board_id is null or v_sprint_board_id != v_task_board_id then
      raise exception 'A sprint especificada não pertence ao mesmo quadro da tarefa';
    end if;
  end if;

  update public.tasks
     set sprint_id = p_sprint_id,
         backlog_order = coalesce(p_backlog_order, 0),
         updated_at = now()
   where id = p_task_id;

  return jsonb_build_object('success', true, 'task_id', p_task_id, 'sprint_id', p_sprint_id);
end $$;

revoke all on function public.move_task_sprint(uuid, uuid, int) from public;
grant execute on function public.move_task_sprint(uuid, uuid, int) to authenticated;

-- 5. RPC atômica: Encerrar Sprint
create or replace function public.complete_sprint(
  p_sprint_id uuid,
  p_action_for_pending text default 'backlog', -- 'backlog' ou 'next_sprint'
  p_next_sprint_name text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_board_id uuid;
  v_status text;
  v_next_sprint_id uuid;
  v_completed_count int := 0;
  v_pending_count int := 0;
  v_final_stage_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select board_id, status
    into v_board_id, v_status
    from public.sprints
   where id = p_sprint_id;

  if v_board_id is null then
    raise exception 'Sprint não encontrada';
  end if;

  if not public.can_manage_board(v_board_id, auth.uid()) then
    raise exception 'Sem permissão para gerenciar sprints deste quadro';
  end if;

  if v_status != 'active' then
    raise exception 'Apenas sprints ativas podem ser encerradas (status atual: %)', v_status;
  end if;

  -- Coleta os IDs das etapas finais deste quadro
  select coalesce(array_agg(id), '{}')
    into v_final_stage_ids
    from public.board_stages
   where board_id = v_board_id and is_final = true;

  -- Conta tarefas concluídas e pendentes
  select count(*) filter (where stage_id = any(v_final_stage_ids)),
         count(*) filter (where not (stage_id = any(v_final_stage_ids)))
    into v_completed_count, v_pending_count
    from public.tasks
   where sprint_id = p_sprint_id;

  -- Tratamento das tarefas pendentes
  if v_pending_count > 0 then
    if p_action_for_pending = 'next_sprint' then
      -- Busca sprint planejada existente no mesmo quadro
      select id into v_next_sprint_id
        from public.sprints
       where board_id = v_board_id and status = 'planning'
       order by created_at asc
       limit 1;

      -- Se não existir, cria a próxima sprint planejada
      if v_next_sprint_id is null then
        insert into public.sprints(board_id, name, goal, status)
        values (
          v_board_id,
          coalesce(nullif(trim(p_next_sprint_name), ''), 'Sprint Seguinte'),
          'Sprint criada automaticamente para tarefas pendentes.',
          'planning'
        )
        returning id into v_next_sprint_id;
      end if;

      -- Move tarefas pendentes para a próxima sprint
      update public.tasks
         set sprint_id = v_next_sprint_id,
             updated_at = now()
       where sprint_id = p_sprint_id
         and not (stage_id = any(v_final_stage_ids));

    else
      -- Retorna ao backlog (sprint_id = null)
      update public.tasks
         set sprint_id = null,
             updated_at = now()
       where sprint_id = p_sprint_id
         and not (stage_id = any(v_final_stage_ids));
    end if;
  end if;

  -- Conclui a sprint atual
  update public.sprints
     set status = 'completed',
         updated_at = now()
   where id = p_sprint_id;

  return jsonb_build_object(
    'success', true,
    'sprint_id', p_sprint_id,
    'completed_tasks', v_completed_count,
    'pending_tasks', v_pending_count,
    'next_sprint_id', v_next_sprint_id
  );
end $$;

revoke all on function public.complete_sprint(uuid, text, text) from public;
grant execute on function public.complete_sprint(uuid, text, text) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611110002_reports_board_concordance.sql
-- ==============================================================================
-- Migration: RPC Canônica para Métricas e Concordância de Relatórios por Quadro
-- 202611110002_reports_board_concordance.sql
-- Regra 1: SECURITY INVOKER (respeita estritamente o RLS do usuário chamador, impedindo vazamento de dados de outras equipes)
-- Regra 3: Fuso horário America/Fortaleza e comparação estrita de data (prazo hoje NÃO é atrasada)
-- Regra 4: Backlog de Scrum mutuamente exclusivo de tarefas ativas

create or replace function public.get_board_report_metrics(
  p_board_id text default 'all',
  p_from date default null,
  p_to date default null,
  p_date_field text default 'created',
  p_team_id uuid default null,
  p_assignee_id uuid default null,
  p_client_id uuid default null,
  p_scrum_scope text default 'all'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Fuso horário oficial da Somax (America/Fortaleza)
  v_today := (timezone('America/Fortaleza', now()))::date;

  with active_sprints as (
    select id, board_id from public.sprints where status = 'active'
  ),
  classified_tasks as (
    select
      t.id as task_id,
      t.title,
      t.team_id,
      t.assignee_id,
      t.client_id,
      t.stage_id,
      t.priority,
      t.due_at,
      t.created_at,
      t.completed_at,
      coalesce(t.board_id, '00000000-0000-0000-0000-000000000000'::uuid) as resolved_board_id,
      t.board_id as original_board_id,
      t.sprint_id,
      b.name as board_name,
      b.type as board_type,
      b.methodology as board_methodology,
      -- Resolução de Etapa e Flags
      case
        when t.board_id is not null then coalesce(bs.name, 'Etapa sem identificação')
        else coalesce(s.name, 'Etapa sem identificação')
      end as stage_name,
      case
        when t.board_id is not null then coalesce(bs.color, '#94a3b8')
        else coalesce(s.color, '#94a3b8')
      end as stage_color,
      case
        when t.board_id is not null then coalesce(bs.is_final, false)
        else coalesce(s.is_final, false)
      end as is_final,
      case
        when t.board_id is null then coalesce(s.is_pause, false)
        else false
      end as is_pause,
      -- Data relevante para o filtro
      case
        when p_date_field = 'completed' then (coalesce(t.completed_at, t.updated_at) at time zone 'America/Fortaleza')::date
        when p_date_field = 'due' then t.due_at
        else (t.created_at at time zone 'America/Fortaleza')::date
      end as filter_date,
      -- Status Mutuamente Exclusivo
      case
        when (case when t.board_id is not null then coalesce(bs.is_final, false) else coalesce(s.is_final, false) end) then 'done'
        when (case when t.board_id is null then coalesce(s.is_pause, false) else false end) then 'blocked'
        when b.methodology = 'scrum' and (t.sprint_id is null or asp.id is null) then 'backlog'
        else 'active'
      end as canonical_status,
      -- Indicador de Atraso (Estritamente menor que hoje, excluindo concluídas)
      case
        when (case when t.board_id is not null then coalesce(bs.is_final, false) else coalesce(s.is_final, false) end) = false
          and t.due_at is not null
          and t.due_at < v_today
        then true
        else false
      end as is_overdue
    from public.tasks t
    left join public.boards b on b.id = t.board_id
    left join public.board_stages bs on bs.id = t.stage_id and t.board_id is not null
    left join public.stages s on s.id = t.stage_id and t.board_id is null
    left join active_sprints asp on asp.id = t.sprint_id
  ),
  filtered_tasks as (
    select ct.*
    from classified_tasks ct
    left join public.boards b_sel on (
      p_board_id is not null
      and p_board_id != 'all'
      and p_board_id != 'board-geral'
      and b_sel.id::text = p_board_id
    )
    where
      -- Filtro de período
      (p_from is null or ct.filter_date >= p_from)
      and (p_to is null or ct.filter_date <= p_to)
      -- Filtros relacionais
      and (p_team_id is null or ct.team_id = p_team_id)
      and (p_assignee_id is null or ct.assignee_id = p_assignee_id)
      and (p_client_id is null or ct.client_id = p_client_id)
      -- Filtro de escopo Scrum
      and (
        p_scrum_scope = 'all'
        or ct.board_methodology != 'scrum'
        or ct.canonical_status != 'backlog'
      )
      -- Filtro por dimensão Quadro / Visão
      and (
        p_board_id = 'all'
        or (p_board_id = 'board-geral' and ct.original_board_id is null)
        or (
          b_sel.type = 'sector_view'
          and ct.original_board_id is null
          and ct.stage_id = any(b_sel.stage_ids)
        )
        or (
          b_sel.type = 'custom'
          and ct.original_board_id = b_sel.id
        )
      )
  ),
  totals_agg as (
    select
      count(*) as total,
      count(*) filter (where canonical_status = 'active') as active,
      count(*) filter (where canonical_status = 'done') as done,
      count(*) filter (where canonical_status = 'blocked') as blocked,
      count(*) filter (where canonical_status = 'backlog') as backlog,
      count(*) filter (where is_overdue = true) as overdue
    from filtered_tasks
  ),
  boards_agg as (
    select
      coalesce(b.id::text, 'board-geral') as board_id,
      coalesce(b.name, 'Geral') as board_name,
      coalesce(b.type, 'general') as board_type,
      coalesce(b.methodology, 'kanban') as methodology,
      count(*) as total,
      count(*) filter (where canonical_status = 'active') as active,
      count(*) filter (where canonical_status = 'done') as done,
      count(*) filter (where canonical_status = 'blocked') as blocked,
      count(*) filter (where canonical_status = 'backlog') as backlog,
      count(*) filter (where is_overdue = true) as overdue
    from filtered_tasks ft
    left join public.boards b on b.id = ft.original_board_id
    group by b.id, b.name, b.type, b.methodology
  ),
  stages_agg as (
    select
      stage_name,
      stage_color,
      count(*) as count
    from filtered_tasks
    group by stage_name, stage_color
  ),
  teams_agg as (
    select
      tm.id as team_id,
      tm.name as team_name,
      tm.color as team_color,
      count(ft.task_id) as count
    from filtered_tasks ft
    join public.teams tm on tm.id = ft.team_id
    group by tm.id, tm.name, tm.color
  )
  select jsonb_build_object(
    'today', v_today,
    'totals', (select to_jsonb(t) from totals_agg t),
    'boards', coalesce((select jsonb_agg(to_jsonb(b)) from boards_agg b), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(to_jsonb(s)) from stages_agg s), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(tm)) from teams_agg tm), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.get_board_report_metrics from public;
grant execute on function public.get_board_report_metrics to authenticated;



-- ==============================================================================
-- MIGRATION: 202611110003_client_registration_links.sql
-- ==============================================================================
-- Migration 202611110003_client_registration_links.sql
-- Link Público de Auto-Cadastro de Clientes com Aprovação Humana

-- 1. Tabela de Links de Cadastro
create table if not exists public.client_registration_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  created_by uuid not null references public.profiles(id),
  team_id uuid references public.teams(id),
  client_id uuid references public.clients(id) on delete set null default null, -- Preparado para Fase 2 (atualização)
  single_use boolean not null default true,
  max_submissions integer not null default 1 check (max_submissions >= 1 and max_submissions <= 10),
  submission_count integer not null default 0,
  include_financial boolean not null default false,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_reg_links_token on public.client_registration_links(token);
create index if not exists idx_client_reg_links_team on public.client_registration_links(team_id);
create index if not exists idx_client_reg_links_expires on public.client_registration_links(expires_at);

-- 2. Tabela de Submissões (Quarentena)
create table if not exists public.client_registration_submissions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.client_registration_links(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null default null, -- Preenchido após aprovação
  data jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  lgpd_accepted_at timestamptz not null default now(),
  user_agent text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_reg_sub_link on public.client_registration_submissions(link_id);
create index if not exists idx_client_reg_sub_status on public.client_registration_submissions(status);

-- 3. Habilitar RLS
alter table public.client_registration_links enable row level security;
alter table public.client_registration_submissions enable row level security;

-- Políticas para client_registration_links
create policy client_reg_links_select on public.client_registration_links
  for select
  using (
    public.is_admin(auth.uid()) or
    (team_id is not null and public.is_team_manager(team_id, auth.uid()))
  );

create policy client_reg_links_insert on public.client_registration_links
  for insert
  with check (
    public.is_admin(auth.uid()) or
    (team_id is not null and public.is_team_manager(team_id, auth.uid()))
  );

create policy client_reg_links_update on public.client_registration_links
  for update
  using (
    public.is_admin(auth.uid()) or
    (team_id is not null and public.is_team_manager(team_id, auth.uid()))
  );

create policy client_reg_links_delete on public.client_registration_links
  for delete
  using (
    public.is_admin(auth.uid()) or
    (team_id is not null and public.is_team_manager(team_id, auth.uid()))
  );

-- Políticas para client_registration_submissions
create policy client_reg_sub_select on public.client_registration_submissions
  for select
  using (
    public.is_admin(auth.uid()) or
    exists (
      select 1 from public.client_registration_links l
      where l.id = client_registration_submissions.link_id
        and l.team_id is not null
        and public.is_team_manager(l.team_id, auth.uid())
    )
  );

create policy client_reg_sub_update on public.client_registration_submissions
  for update
  using (
    public.is_admin(auth.uid()) or
    exists (
      select 1 from public.client_registration_links l
      where l.id = client_registration_submissions.link_id
        and l.team_id is not null
        and public.is_team_manager(l.team_id, auth.uid())
    )
  );

-- 4. RPC Pública: Obter Informações do Link para a Página de Cadastro (Sem Vazar Dados Internos)
create or replace function public.get_registration_link_public_info(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  if p_token is null or trim(p_token) = '' then
    return jsonb_build_object('valid', false, 'error', 'Token de cadastro não informado.');
  end if;

  select * into v_link
  from public.client_registration_links
  where token = trim(p_token);

  if not found then
    return jsonb_build_object('valid', false, 'error', 'Link de cadastro não encontrado ou inválido.');
  end if;

  if not v_link.is_active then
    return jsonb_build_object('valid', false, 'error', 'Este link de cadastro já foi utilizado ou foi revogado.');
  end if;

  if v_link.expires_at <= now() then
    return jsonb_build_object('valid', false, 'error', 'Este link de cadastro expirou.');
  end if;

  if v_link.submission_count >= v_link.max_submissions then
    return jsonb_build_object('valid', false, 'error', 'O limite de envios deste link foi atingido.');
  end if;

  return jsonb_build_object(
    'valid', true,
    'include_financial', v_link.include_financial
  );
end;
$$;

grant execute on function public.get_registration_link_public_info(text) to anon, authenticated;

-- 5. RPC Pública: Submissão de Cadastro pelo Cliente Externo (Anti-Bot, Quarentena e Limite)
create or replace function public.submit_client_registration(
  p_token text,
  p_payload jsonb,
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_client_name text;
  v_sub_id uuid;
begin
  -- Defesa contra bots: se honeypot foi preenchido, rejeita silenciosamente com sucesso fingido
  if p_honeypot is not null and trim(p_honeypot) <> '' then
    return jsonb_build_object('success', true, 'message', 'Cadastro recebido com sucesso.');
  end if;

  if p_token is null or trim(p_token) = '' then
    return jsonb_build_object('success', false, 'error', 'Token de cadastro inválido.');
  end if;

  -- Lock pessimista na linha do link para evitar condição de corrida em submissões concorrentes
  select * into v_link
  from public.client_registration_links
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Link de cadastro não encontrado.');
  end if;

  if not v_link.is_active then
    return jsonb_build_object('success', false, 'error', 'Este link já foi utilizado ou está desativado.');
  end if;

  if v_link.expires_at <= now() then
    return jsonb_build_object('success', false, 'error', 'Este link de cadastro expirou.');
  end if;

  if v_link.submission_count >= v_link.max_submissions then
    return jsonb_build_object('success', false, 'error', 'Limite de envios atingido para este link.');
  end if;

  -- Validação mínima obrigatória dos dados gerais
  v_client_name := trim(coalesce(p_payload->>'name', ''));
  if v_client_name = '' then
    return jsonb_build_object('success', false, 'error', 'O nome do cliente é obrigatório.');
  end if;

  -- Incrementa contagem de envios
  update public.client_registration_links
  set submission_count = submission_count + 1,
      is_active = case
        when single_use = true then false
        when (submission_count + 1) >= max_submissions then false
        else is_active
      end,
      updated_at = now()
  where id = v_link.id;

  -- Insere na tabela de quarentena
  insert into public.client_registration_submissions (
    link_id,
    data,
    status,
    lgpd_accepted_at
  ) values (
    v_link.id,
    p_payload,
    'pending',
    now()
  ) returning id into v_sub_id;

  return jsonb_build_object(
    'success', true,
    'submission_id', v_sub_id,
    'message', 'Dados recebidos com sucesso! Seu cadastro passará por validação de nossa equipe.'
  );
end;
$$;

grant execute on function public.submit_client_registration(text, jsonb, text) to anon, authenticated;

-- 6. RPC Interna: Revisão e Aprovação / Rejeição por Administrador ou Gestor
create or replace function public.review_client_registration(
  p_submission_id uuid,
  p_action text,
  p_approved_data jsonb default null,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_link record;
  v_actor_id uuid;
  v_is_authorized boolean := false;
  v_client_id uuid;
  v_name text;
  v_legal_name text;
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
  v_financial_contact_name text;
  v_financial_email text;
  v_financial_whatsapp text;
  v_financial_due_date text;
  v_financial_notes text;
  v_links jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_sub
  from public.client_registration_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Submissão não encontrada.';
  end if;

  if v_sub.status <> 'pending' then
    raise exception 'Esta submissão já foi revisada (status atual: %).', v_sub.status;
  end if;

  select * into v_link
  from public.client_registration_links
  where id = v_sub.link_id;

  -- Checagem de permissão: Administrador ou Gestor da equipe do link
  if public.is_admin(v_actor_id) then
    v_is_authorized := true;
  elsif v_link.team_id is not null and public.is_team_manager(v_link.team_id, v_actor_id) then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Sem permissão para revisar esta submissão de cadastro.';
  end if;

  if p_action = 'reject' then
    update public.client_registration_submissions
    set status = 'rejected',
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        review_notes = p_review_notes
    where id = p_submission_id;

    return jsonb_build_object('success', true, 'status', 'rejected');
  elsif p_action = 'approve' then
    -- Se foram passados dados editados/corrigidos na revisão, usa-os; senão usa os submetidos
    declare
      v_data jsonb := coalesce(p_approved_data, v_sub.data);
    begin
      v_name := trim(coalesce(v_data->>'name', ''));
      if v_name = '' then
        raise exception 'Nome do cliente é obrigatório para aprovação.';
      end if;

      v_legal_name := nullif(trim(coalesce(v_data->>'legal_name', '')), '');
      v_contact_name := nullif(trim(coalesce(v_data->>'contact_name', '')), '');
      v_contact_email := nullif(trim(coalesce(v_data->>'contact_email', '')), '');
      v_contact_phone := nullif(trim(coalesce(v_data->>'contact_phone', '')), '');
      v_financial_contact_name := nullif(trim(coalesce(v_data->>'financial_contact_name', '')), '');
      v_financial_email := nullif(trim(coalesce(v_data->>'financial_email', '')), '');
      v_financial_whatsapp := nullif(trim(coalesce(v_data->>'financial_whatsapp', '')), '');
      v_financial_due_date := nullif(trim(coalesce(v_data->>'financial_due_date', '')), '');
      v_financial_notes := nullif(trim(coalesce(v_data->>'financial_notes', '')), '');
      v_links := coalesce(v_data->'links', '[]'::jsonb);

      -- Oficializa a criação do cliente na tabela central public.clients
      insert into public.clients (
        name,
        legal_name,
        contact_name,
        contact_email,
        contact_phone,
        financial_contact_name,
        financial_email,
        financial_whatsapp,
        financial_due_date,
        financial_notes,
        links,
        integration_references,
        integration_items
      ) values (
        v_name,
        v_legal_name,
        v_contact_name,
        v_contact_email,
        v_contact_phone,
        v_financial_contact_name,
        v_financial_email,
        v_financial_whatsapp,
        v_financial_due_date,
        v_financial_notes,
        coalesce(v_links, '[]'::jsonb),
        null,
        '[]'::jsonb
      ) returning id into v_client_id;

      -- Atualiza a submissão vinculando o cliente oficial
      update public.client_registration_submissions
      set status = 'approved',
        client_id = v_client_id,
        data = v_data,
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        review_notes = p_review_notes
      where id = p_submission_id;

      return jsonb_build_object(
        'success', true,
        'status', 'approved',
        'client_id', v_client_id
      );
    end;
  else
    raise exception 'Ação inválida: deve ser "approve" ou "reject".';
  end if;
end;
$$;

grant execute on function public.review_client_registration(uuid, text, jsonb, text) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611110004_reorder_stages_fix.sql
-- ==============================================================================
-- Migration: 202611110004_reorder_stages_fix.sql
-- Correção da procedure de reordenação de etapas do Kanban

create or replace function public.reorder_stages(p_stage_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_offset integer;
  v_user_id uuid;
  v_is_authorized boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  -- Permite Administradores e Gestores de equipe ativos
  if public.is_admin(v_user_id) then
    v_is_authorized := true;
  elsif exists (
    select 1 from public.team_members
    where user_id = v_user_id and is_manager = true and active = true
  ) then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Somente administradores e gestores podem ordenar etapas';
  end if;

  lock table public.stages in share row exclusive mode;

  select count(*), max(position) - min(position) + count(*) + 1
    into v_count, v_offset
    from public.stages;

  if cardinality(p_stage_ids) <> v_count
    or (select count(distinct id) from unnest(p_stage_ids) as item(id)) <> v_count
    or exists (select stage.id from public.stages stage except select id from unnest(p_stage_ids) as item(id))
  then
    raise exception 'A lista deve conter todas as etapas uma vez';
  end if;

  -- Cláusula WHERE explícita para compatibilidade com safeupdate do PostgreSQL
  update public.stages
     set position = position + v_offset
   where true;

  update public.stages stage
     set position = ordered.position
    from (
      select id, ordinality::integer - 1 as position
        from unnest(p_stage_ids) with ordinality as item(id, ordinality)
    ) ordered
   where stage.id = ordered.id;
end $$;

revoke all on function public.reorder_stages(uuid[]) from public;
grant execute on function public.reorder_stages(uuid[]) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611120001_client_financial_due_date_text.sql
-- ==============================================================================
-- Migration 202611120001_client_financial_due_date_text.sql
-- Altera a coluna financial_due_date da tabela clients de DATE para TEXT
-- para suportar dias de vencimento (ex.: '10', 'Todo dia 15') e datas ISO,
-- eliminando o erro de tipagem na aprovação de cadastro de clientes via RPC review_client_registration.

alter table public.clients
  alter column financial_due_date type text using financial_due_date::text;

-- Recriação da função review_client_registration para garantir coerência estrita de tipos
create or replace function public.review_client_registration(
  p_submission_id uuid,
  p_action text,
  p_approved_data jsonb default null,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_link record;
  v_actor_id uuid;
  v_is_authorized boolean := false;
  v_client_id uuid;
  v_name text;
  v_legal_name text;
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
  v_financial_contact_name text;
  v_financial_email text;
  v_financial_whatsapp text;
  v_financial_due_date text;
  v_financial_notes text;
  v_links jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado.';
  end if;

  select * into v_sub
  from public.client_registration_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Submissão não encontrada.';
  end if;

  if v_sub.status <> 'pending' then
    raise exception 'Esta submissão já foi revisada (status atual: %).', v_sub.status;
  end if;

  select * into v_link
  from public.client_registration_links
  where id = v_sub.link_id;

  -- Checagem de permissão: Administrador ou Gestor da equipe do link
  if public.is_admin(v_actor_id) then
    v_is_authorized := true;
  elsif v_link.team_id is not null and public.is_team_manager(v_link.team_id, v_actor_id) then
    v_is_authorized := true;
  end if;

  if not v_is_authorized then
    raise exception 'Sem permissão para revisar esta submissão de cadastro.';
  end if;

  if p_action = 'reject' then
    update public.client_registration_submissions
    set status = 'rejected',
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        review_notes = p_review_notes
    where id = p_submission_id;

    return jsonb_build_object('success', true, 'status', 'rejected');
  elsif p_action = 'approve' then
    -- Se foram passados dados editados/corrigidos na revisão, usa-os; senão usa os submetidos
    declare
      v_data jsonb := coalesce(p_approved_data, v_sub.data);
    begin
      v_name := trim(coalesce(v_data->>'name', ''));
      if v_name = '' then
        raise exception 'Nome do cliente é obrigatório para aprovação.';
      end if;

      v_legal_name := nullif(trim(coalesce(v_data->>'legal_name', '')), '');
      v_contact_name := nullif(trim(coalesce(v_data->>'contact_name', '')), '');
      v_contact_email := nullif(trim(coalesce(v_data->>'contact_email', '')), '');
      v_contact_phone := nullif(trim(coalesce(v_data->>'contact_phone', '')), '');
      v_financial_contact_name := nullif(trim(coalesce(v_data->>'financial_contact_name', '')), '');
      v_financial_email := nullif(trim(coalesce(v_data->>'financial_email', '')), '');
      v_financial_whatsapp := nullif(trim(coalesce(v_data->>'financial_whatsapp', '')), '');
      v_financial_due_date := nullif(trim(coalesce(v_data->>'financial_due_date', '')), '');
      v_financial_notes := nullif(trim(coalesce(v_data->>'financial_notes', '')), '');
      v_links := coalesce(v_data->'links', '[]'::jsonb);

      -- Oficializa a criação do cliente na tabela central public.clients
      insert into public.clients (
        name,
        legal_name,
        contact_name,
        contact_email,
        contact_phone,
        financial_contact_name,
        financial_email,
        financial_whatsapp,
        financial_due_date,
        financial_notes,
        links,
        integration_references,
        integration_items
      ) values (
        v_name,
        v_legal_name,
        v_contact_name,
        v_contact_email,
        v_contact_phone,
        v_financial_contact_name,
        v_financial_email,
        v_financial_whatsapp,
        v_financial_due_date,
        v_financial_notes,
        coalesce(v_links, '[]'::jsonb),
        null,
        '[]'::jsonb
      ) returning id into v_client_id;

      -- Atualiza a submissão vinculando o cliente oficial
      update public.client_registration_submissions
      set status = 'approved',
        client_id = v_client_id,
        data = v_data,
        reviewed_by = v_actor_id,
        reviewed_at = now(),
        review_notes = p_review_notes
      where id = p_submission_id;

      return jsonb_build_object(
        'success', true,
        'status', 'approved',
        'client_id', v_client_id
      );
    end;
  else
    raise exception 'Ação inválida: deve ser "approve" ou "reject".';
  end if;
end;
$$;

grant execute on function public.review_client_registration(uuid, text, jsonb, text) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611130001_tasks_client_id_on_delete_set_null.sql
-- ==============================================================================
-- Migration 202611130001_tasks_client_id_on_delete_set_null.sql
-- Permite a exclusão de clientes sem violar a integridade referencial,
-- desvinculando automaticamente tarefas existentes (client_id = null)
-- e assegurando política explícita de DELETE na tabela public.clients.

-- 1. Atualização da foreign key de tarefas para ON DELETE SET NULL
alter table public.tasks
  drop constraint if exists tasks_client_id_fkey,
  add constraint tasks_client_id_fkey
    foreign key (client_id)
    references public.clients(id)
    on delete set null;

-- 2. Política explícita de DELETE para administradores na tabela clients (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'clients_delete'
  ) then
    create policy clients_delete on public.clients
      for delete
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;



-- ==============================================================================
-- MIGRATION: 202611140001_board_permissions_forwarding_rls.sql
-- ==============================================================================
-- Migration: 202611140001_board_permissions_forwarding_rls.sql
-- Objetivo: Garantir conformidade estrita de permissões e RLS:
-- 1. O usuário só pode encaminhar para quadros que enxerga e onde pode criar tarefas.
-- 2. Quadro privado de outra equipe nunca pode ser destino nem acessado.
-- 3. Funções com validação rigorosa de auth.uid(), search_path seguro e blindagem contra escalonamento.

-- 1. Função auxiliar: Verifica se o usuário tem permissão para criar ou encaminhar tarefas para um quadro
create or replace function public.can_create_task_in_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_user_id is null then false
    when p_board_id is null then true -- Quadro Geral / canônico
    else exists (
      select 1 from public.boards b
      where b.id = p_board_id
        and (
          public.is_admin(p_user_id)
          or b.is_shared
          or (b.team_id is not null and public.is_team_member(b.team_id, p_user_id))
          or (b.team_id is null and b.created_by = p_user_id)
        )
    )
  end;
$$;

revoke all on function public.can_create_task_in_board(uuid, uuid) from public;
grant execute on function public.can_create_task_in_board(uuid, uuid) to authenticated;

-- 2. Atualizar políticas de INSERT e UPDATE em public.tasks para blindar board_id
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and created_by = auth.uid()
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_admin(auth.uid())
  or (board_id is null and public.is_team_member(team_id, auth.uid()))
  or (board_id is not null and public.can_access_board(board_id, auth.uid()))
) with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

-- 3. Atualizar create_task_with_templates com validação estrita de board_id
create or replace function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}',
  p_board_id uuid default null,
  p_sprint_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_id uuid;
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'Não autenticado'; end if;
  if not (public.is_admin(v_actor_id) or public.is_team_member(p_team_id, v_actor_id)) then
    raise exception 'Sem acesso à equipe da tarefa';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;

  -- Validação estrita de quadro de destino: não permite criar em quadro privado de outra equipe
  if p_board_id is not null then
    if not public.can_create_task_in_board(p_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode criar tarefas em um quadro privado de outra equipe';
    end if;
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), v_actor_id, p_board_id, p_sprint_id)
    returning id into created_id;

  if p_template_ids is not null and array_length(p_template_ids, 1) > 0 then
    insert into public.task_checklist(task_id, title, position, group_name)
      select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
      from public.checklist_template_items item
      join public.checklist_template_groups template on template.id = item.group_id
      where item.group_id = any(coalesce(p_template_ids,'{}'))
        and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);
  end if;

  return created_id;
end $$;

revoke all on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) from public;
grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;

-- 4. Nova RPC atômica: Encaminhar tarefa para outro quadro com validação de permissões
create or replace function public.forward_task_to_board(
  p_task_id uuid,
  p_target_board_id uuid, -- se null, encaminha para o Quadro Geral
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_task record;
  v_target_board record;
  v_from_stage_id uuid;
  v_resolved_team_id uuid;
  v_is_target_final boolean := false;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Obter tarefa e validar existência
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  -- 2. Validar permissão de alteração na tarefa de origem
  if not (
    public.is_admin(v_actor_id)
    or (v_task.board_id is null and public.is_team_member(v_task.team_id, v_actor_id))
    or (v_task.board_id is not null and public.can_access_board(v_task.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para alterar esta tarefa';
  end if;

  -- 3. Validar se o usuário pode encaminhar para o quadro de destino
  if p_target_board_id is not null then
    select * into v_target_board from public.boards where id = p_target_board_id;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    -- Quadro privado de outra equipe nunca pode ser destino
    if not public.can_create_task_in_board(p_target_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    -- Resolver equipe de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    end if;

    -- Validar etapa de destino
    if v_target_board.type = 'custom' then
      select is_final into v_is_target_final
        from public.board_stages
       where id = p_target_stage_id and board_id = p_target_board_id;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select is_final into v_is_target_final
        from public.stages
       where id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    -- Destino: Quadro Geral / canônico
    v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    select is_final into v_is_target_final
      from public.stages
     where id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  -- 4. Gravação de auditoria em task_movements
  v_from_stage_id := v_task.stage_id;
  insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by, moved_at)
  values (p_task_id, v_from_stage_id, p_target_stage_id, v_actor_id, now());

  -- 5. Atualização atômica da tarefa
  update public.tasks
     set board_id = p_target_board_id,
         stage_id = p_target_stage_id,
         team_id = v_resolved_team_id,
         sprint_id = null, -- Reseta sprint se mudar de quadro
         completed_at = case when v_is_target_final then coalesce(completed_at, now()) else null end,
         updated_at = now()
   where id = p_task_id;

  return jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'board_id', p_target_board_id,
    'stage_id', p_target_stage_id,
    'team_id', v_resolved_team_id
  );
end $$;

revoke all on function public.forward_task_to_board(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_task_to_board(uuid, uuid, uuid, uuid) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611140002_task_branching_lineage.sql
-- ==============================================================================
-- Migration: 202611140002_task_branching_lineage.sql
-- Objetivo: Suporte a encaminhamento de tarefa concluída com ramificação, prevenção de ciclos,
--           travamento no servidor da tarefa original e linha do tempo imutável com mascaramento de privacidade.

-- 1. Campos de ramificação na tabela public.tasks
alter table public.tasks
  add column if not exists origin_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists root_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists forwarded_at timestamptz default null,
  add column if not exists forwarded_by uuid references public.profiles(id) on delete set null;

-- Inicializar root_task_id para tarefas existentes que ainda não tenham
update public.tasks
   set root_task_id = id
 where root_task_id is null;

-- Restrição de unicidade parcial: garante que UMA tarefa original só pode ter UMA ramificação
create unique index if not exists tasks_single_branch_idx
  on public.tasks (origin_task_id)
  where origin_task_id is not null;

create index if not exists tasks_root_task_idx
  on public.tasks (root_task_id);

create index if not exists tasks_origin_task_idx
  on public.tasks (origin_task_id);

-- 2. Configurações por quadro na tabela public.boards ("Ao concluir")
alter table public.boards
  add column if not exists on_completion_action text not null default 'ask'
    check (on_completion_action in ('ask', 'suggest_default', 'none')),
  add column if not exists default_forward_board_id uuid references public.boards(id) on delete set null,
  add column if not exists default_forward_stage_id uuid default null;

-- 3. Tabela de linha do tempo e eventos imutáveis da jornada
create table if not exists public.task_lineage_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  root_task_id uuid not null,
  board_id uuid references public.boards(id) on delete set null,
  board_name text not null,
  board_color text,
  stage_id uuid,
  stage_name text not null,
  event_type text not null check (event_type in ('created', 'moved', 'completed', 'forwarded')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_lineage_events enable row level security;

create index if not exists task_lineage_events_root_idx
  on public.task_lineage_events (root_task_id, created_at asc);

create index if not exists task_lineage_events_task_idx
  on public.task_lineage_events (task_id, created_at asc);

-- RLS para task_lineage_events: usuários autenticados podem consultar
drop policy if exists task_lineage_events_select on public.task_lineage_events;
create policy task_lineage_events_select on public.task_lineage_events
  for select to authenticated using (true);

drop policy if exists task_lineage_events_insert on public.task_lineage_events;
create policy task_lineage_events_insert on public.task_lineage_events
  for insert to authenticated with check (true);

-- 4. Trigger de integridade: Travamento no servidor da tarefa concluída que já foi encaminhada
create or replace function public.check_forwarded_task_immutable()
returns trigger language plpgsql as $$
begin
  -- Se a tarefa já foi encaminhada, ela fica travada na etapa final
  if OLD.forwarded_at is not null then
    if NEW.stage_id <> OLD.stage_id then
      raise exception 'Esta tarefa já foi concluída e encaminhada para outro quadro e não pode ser reaberta ou movida.';
    end if;
    if NEW.completed_at is distinct from OLD.completed_at and NEW.completed_at is null then
      raise exception 'Esta tarefa já foi concluída e encaminhada e não pode ter seu status de conclusão removido.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_forwarded_task_immutable on public.tasks;
create trigger trg_check_forwarded_task_immutable
  before update on public.tasks
  for each row execute function public.check_forwarded_task_immutable();

-- 5. RPC Atômica para encaminhar tarefa concluída gerando ramificação
create or replace function public.forward_completed_task(
  p_task_id uuid,
  p_target_board_id uuid,     -- se null, encaminha para o Quadro Geral
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_orig public.tasks%rowtype;
  v_orig_board_name text := 'Quadro Geral';
  v_orig_board_color text := '#2563eb';
  v_orig_stage_name text := 'Concluído';
  v_orig_is_final boolean := false;
  v_target_board record;
  v_target_board_name text := 'Quadro Geral';
  v_target_board_color text := '#2563eb';
  v_target_stage_name text;
  v_target_is_final boolean := false;
  v_resolved_team_id uuid;
  v_resolved_assignee_id uuid := null;
  v_resolved_root_id uuid;
  v_new_task_id uuid;
  v_existing_branch public.tasks%rowtype;
  v_target_board_id_norm uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  -- Obter nome do operador
  select coalesce(full_name, 'Usuário') into v_actor_name
    from public.profiles where id = v_actor_id;

  -- 1. Trava pessimista na tarefa original para concorrência e duplo clique
  select * into v_orig
    from public.tasks
   where id = p_task_id
     for update;

  if not found then
    raise exception 'Tarefa original não encontrada';
  end if;

  -- 2. Idempotência estrita: se já foi encaminhada, retorna a ramificação existente
  if v_orig.forwarded_at is not null then
    select * into v_existing_branch
      from public.tasks
     where origin_task_id = p_task_id
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'already_forwarded', true,
        'branch_task_id', v_existing_branch.id,
        'origin_task_id', p_task_id,
        'target_board_id', v_existing_branch.board_id,
        'target_stage_id', v_existing_branch.stage_id,
        'message', 'Esta tarefa já foi encaminhada anteriormente.'
      );
    end if;
  end if;

  -- 3. Validar se a tarefa original está na etapa final
  if v_orig.board_id is not null then
    select bs.name, bs.is_final into v_orig_stage_name, v_orig_is_final
      from public.board_stages bs
     where bs.id = v_orig.stage_id and bs.board_id = v_orig.board_id;
    if not found then
      select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
        from public.stages s where s.id = v_orig.stage_id;
    end if;

    select b.name, b.color into v_orig_board_name, v_orig_board_color
      from public.boards b where b.id = v_orig.board_id;
  else
    select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
      from public.stages s where s.id = v_orig.stage_id;
  end if;

  if not coalesce(v_orig_is_final, false) and v_orig.completed_at is null then
    raise exception 'Apenas tarefas na etapa final podem ser encaminhadas para outro quadro.';
  end if;

  -- 4. Validar permissão na tarefa de origem
  if not (
    public.is_admin(v_actor_id)
    or (v_orig.board_id is null and public.is_team_member(v_orig.team_id, v_actor_id))
    or (v_orig.board_id is not null and public.can_access_board(v_orig.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para encaminhar esta tarefa';
  end if;

  -- 5. Validar quadro de destino e permissões
  v_target_board_id_norm := p_target_board_id;
  if v_target_board_id_norm is not null then
    select * into v_target_board from public.boards where id = v_target_board_id_norm;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    v_target_board_name := v_target_board.name;
    v_target_board_color := coalesce(v_target_board.color, '#2563eb');

    -- Quadro privado de outra equipe nunca pode ser destino
    if not public.can_create_task_in_board(v_target_board_id_norm, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    -- Prevenção de ciclos: o destino não pode coincidir com o quadro de origem
    if v_orig.board_id is not distinct from v_target_board_id_norm then
      raise exception 'A ramificação não pode ser criada no mesmo quadro de origem.';
    end if;

    -- Prevenção de ciclos na linhagem ancestral
    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if exists (
      select 1 from public.task_lineage_events
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) or exists (
      select 1 from public.tasks
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) then
      raise exception 'Não é permitido encaminhar para um quadro que já faz parte da jornada desta tarefa (ciclo detectado).';
    end if;

    -- Resolver equipe do quadro de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    end if;

    -- Validar etapa de destino
    if v_target_board.type = 'custom' then
      select bs.name, bs.is_final into v_target_stage_name, v_target_is_final
        from public.board_stages bs
       where bs.id = p_target_stage_id and bs.board_id = v_target_board_id_norm;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select s.name, s.is_final into v_target_stage_name, v_target_is_final
        from public.stages s where s.id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    -- Destino: Quadro Geral canônico
    v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if v_orig.board_id is null then
      raise exception 'A tarefa já pertence ao Quadro Geral e não pode ser ramificada para o mesmo quadro.';
    end if;

    select s.name, s.is_final into v_target_stage_name, v_target_is_final
      from public.stages s where s.id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  -- 6. Resolver responsável (apenas se for membro ativo da equipe de destino)
  if v_orig.assignee_id is not null then
    if exists (
      select 1 from public.team_members m
       where m.team_id = v_resolved_team_id
         and m.user_id = v_orig.assignee_id
         and m.active
    ) then
      v_resolved_assignee_id := v_orig.assignee_id;
    else
      v_resolved_assignee_id := null;
    end if;
  end if;

  -- 7. Criar a nova tarefa (ramificação) no quadro de destino
  insert into public.tasks (
    title,
    description,
    team_id,
    assignee_id,
    client_id,
    stage_id,
    priority,
    due_at,            -- Prazo começa vazio
    tags,
    created_by,
    board_id,
    sprint_id,          -- Sprint começa vazio (vai para o backlog se Scrum)
    origin_task_id,     -- Aponta para a tarefa original
    root_task_id,       -- Preserva o início da cadeia
    completed_at,       -- Nulo
    created_at,
    updated_at
  ) values (
    v_orig.title,
    v_orig.description,
    v_resolved_team_id,
    v_resolved_assignee_id,
    v_orig.client_id,
    p_target_stage_id,
    v_orig.priority,
    null,
    coalesce(v_orig.tags, '{}'),
    v_actor_id,
    v_target_board_id_norm,
    null,
    p_task_id,
    v_resolved_root_id,
    null,
    now(),
    now()
  ) returning id into v_new_task_id;

  -- 8. Atualizar a tarefa original: marca como encaminhada e trava
  update public.tasks
     set forwarded_at = now(),
         forwarded_by = v_actor_id,
         completed_at = coalesce(completed_at, now()),
         root_task_id = v_resolved_root_id,
         updated_at = now()
   where id = p_task_id;

  -- 9. Registrar eventos na linha do tempo imutável (task_lineage_events)
  -- Se for a primeira ramificação e ainda não existia evento de criação inicial, registra
  if not exists (select 1 from public.task_lineage_events where root_task_id = v_resolved_root_id and event_type = 'created') then
    insert into public.task_lineage_events (
      task_id, root_task_id, board_id, board_name, board_color,
      stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
    ) values (
      v_orig.id, v_resolved_root_id, v_orig.board_id, v_orig_board_name, v_orig_board_color,
      v_orig.stage_id, v_orig_stage_name, 'created', v_orig.created_by, 'Criador original', v_orig.created_at,
      jsonb_build_object('initial_task', true)
    );
  end if;

  -- Evento de conclusão/encaminhamento da original
  insert into public.task_lineage_events (
    task_id, root_task_id, board_id, board_name, board_color,
    stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
  ) values (
    v_orig.id, v_resolved_root_id, v_orig.board_id, v_orig_board_name, v_orig_board_color,
    v_orig.stage_id, v_orig_stage_name, 'forwarded', v_actor_id, v_actor_name, now(),
    jsonb_build_object(
      'target_board_id', v_target_board_id_norm,
      'target_board_name', v_target_board_name,
      'target_task_id', v_new_task_id
    )
  );

  -- Evento de entrada no novo quadro (ramificação)
  insert into public.task_lineage_events (
    task_id, root_task_id, board_id, board_name, board_color,
    stage_id, stage_name, event_type, actor_id, actor_name, created_at, metadata
  ) values (
    v_new_task_id, v_resolved_root_id, v_target_board_id_norm, v_target_board_name, v_target_board_color,
    p_target_stage_id, v_target_stage_name, 'created', v_actor_id, v_actor_name, now(),
    jsonb_build_object(
      'branch_from_task_id', p_task_id,
      'from_board_name', v_orig_board_name
    )
  );

  return jsonb_build_object(
    'success', true,
    'branch_task_id', v_new_task_id,
    'origin_task_id', p_task_id,
    'target_board_id', v_target_board_id_norm,
    'target_stage_id', p_target_stage_id,
    'target_team_id', v_resolved_team_id,
    'message', 'Tarefa concluída e encaminhada com sucesso.'
  );
end;
$$;

revoke all on function public.forward_completed_task(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_completed_task(uuid, uuid, uuid, uuid) to authenticated;

-- 6. RPC para consultar a linha do tempo com mascaramento de segurança
create or replace function public.get_task_lineage(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_task public.tasks%rowtype;
  v_root_id uuid;
  v_events jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  v_root_id := coalesce(v_task.root_task_id, v_task.id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'task_id', e.task_id,
      'root_task_id', e.root_task_id,
      'event_type', e.event_type,
      'created_at', e.created_at,
      'actor_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.actor_name
        else 'Colaborador'
      end,
      'board_id', e.board_id,
      'board_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.board_name
        else 'Quadro Restrito'
      end,
      'board_color', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.board_color
        else '#64748b'
      end,
      'stage_name', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.stage_name
        else 'Etapa Restrita'
      end,
      'is_masked', not (e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)),
      'metadata', case
        when e.board_id is null or public.can_access_board(e.board_id, v_actor_id) or public.is_admin(v_actor_id)
        then e.metadata
        else '{}'::jsonb
      end
    ) order by e.created_at asc
  ), '[]'::jsonb)
  into v_events
  from public.task_lineage_events e
  where e.root_task_id = v_root_id;

  return v_events;
end;
$$;

revoke all on function public.get_task_lineage(uuid) from public;
grant execute on function public.get_task_lineage(uuid) to authenticated;



-- ==============================================================================
-- MIGRATION: 202611150001_task_movements_snapshot_names.sql
-- ==============================================================================
-- Migration 202611150001_task_movements_snapshot_names.sql
-- Adiciona colunas de snapshot textual para etapas em task_movements, garantindo
-- que o histórico sobreviva a exclusões e resolva nomes de etapas em quadros personalizados.

alter table public.task_movements
  add column if not exists from_stage_name text,
  add column if not exists to_stage_name text;

-- Preenche retrospectivamente os nomes das etapas com base nas tabelas atuais
update public.task_movements m
set to_stage_name = coalesce(
  (select name from public.stages s where s.id = m.to_stage_id),
  (select name from public.board_stages bs where bs.id = m.to_stage_id),
  'Etapa inicial'
)
where m.to_stage_name is null;

update public.task_movements m
set from_stage_name = coalesce(
  (select name from public.stages s where s.id = m.from_stage_id),
  (select name from public.board_stages bs where bs.id = m.from_stage_id)
)
where m.from_stage_id is not null and m.from_stage_name is null;

-- Atualiza a trigger para gravar os nomes das etapas tanto de stages quanto de board_stages
create or replace function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from_name text;
  v_to_name text;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    -- Resolve nome da etapa de origem
    if tg_op = 'UPDATE' and old.stage_id is not null then
      select name into v_from_name from public.stages where id = old.stage_id;
      if v_from_name is null then
        select name into v_from_name from public.board_stages where id = old.stage_id;
      end if;
    end if;

    -- Resolve nome da etapa de destino
    select name into v_to_name from public.stages where id = new.stage_id;
    if v_to_name is null then
      select name into v_to_name from public.board_stages where id = new.stage_id;
    end if;

    insert into public.task_movements(
      task_id,
      from_stage_id,
      to_stage_id,
      moved_by,
      from_stage_name,
      to_stage_name
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.stage_id end,
      new.stage_id,
      coalesce(auth.uid(), new.created_by),
      v_from_name,
      v_to_name
    );

    -- Insere subtarefas automáticas se houver template de etapa correspondente
    insert into public.task_checklist(task_id, title, position, group_name)
      select new.id, template.title, template.position, stage.name
      from public.subtask_templates template
      join public.stages stage on stage.id = template.stage_id
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end;
$$;



-- ==============================================================================
-- MIGRATION: 202611150002_fix_can_access_task_and_comments_rls.sql
-- ==============================================================================
-- Migration: 202611150002_fix_can_access_task_and_comments_rls.sql
-- Objetivo: Corrigir a função can_access_task e políticas RLS de task_comments, task_checklist e task_movements:
-- 1. Permitir acesso a administradores, membros da equipe, usuários com acesso ao quadro da tarefa,
--    criador, responsável e operadores vinculados à linhagem de encaminhamento da tarefa.
-- 2. Corrigir a política comments_insert para aceitar author_id automático via auth.uid() e administradores.
-- 3. Adicionar trigger de preenchimento automático de author_id caso seja omitido.

-- 1. Atualizar public.can_access_task com suporte a quadros, administradores e tarefas encaminhadas
create or replace function public.can_access_task(task_uuid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when uid is null or task_uuid is null then false
    when public.is_admin(uid) then true
    else exists (
      select 1
        from public.tasks t
       where t.id = task_uuid
         and (
           -- 1. Membro da equipe da tarefa
           (t.team_id is not null and public.is_team_member(t.team_id, uid))
           -- 2. Acesso ao quadro da tarefa (custom, compartilhado ou canônico)
           or (t.board_id is not null and public.can_access_board(t.board_id, uid))
           -- 3. Criador ou responsável direto pela tarefa
           or (t.created_by = uid or t.assignee_id = uid)
           -- 4. Operador com acesso à ramificação gerada a partir desta tarefa
           or exists (
             select 1
               from public.tasks branch
              where branch.origin_task_id = t.id
                and (
                  (branch.team_id is not null and public.is_team_member(branch.team_id, uid))
                  or (branch.board_id is not null and public.can_access_board(branch.board_id, uid))
                )
           )
           -- 5. Operador com acesso à tarefa original de onde veio esta ramificação
           or (t.origin_task_id is not null and exists (
             select 1
               from public.tasks orig
              where orig.id = t.origin_task_id
                and (
                  (orig.team_id is not null and public.is_team_member(orig.team_id, uid))
                  or (orig.board_id is not null and public.can_access_board(orig.board_id, uid))
                )
           ))
           -- 6. Operador com acesso à mesma raiz de jornada (root_task_id)
           or (t.root_task_id is not null and exists (
             select 1
               from public.tasks chain
              where chain.root_task_id = t.root_task_id
                and chain.id <> t.id
                and (
                  (chain.team_id is not null and public.is_team_member(chain.team_id, uid))
                  or (chain.board_id is not null and public.can_access_board(chain.board_id, uid))
                )
           ))
         )
    )
  end;
$$;

revoke all on function public.can_access_task(uuid, uuid) from public;
grant execute on function public.can_access_task(uuid, uuid) to authenticated;

-- 2. Trigger para garantir preenchimento de author_id caso seja enviado nulo
create or replace function public.set_task_comment_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if NEW.author_id is null and auth.uid() is not null then
    NEW.author_id := auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_set_task_comment_author on public.task_comments;
create trigger trg_set_task_comment_author
  before insert on public.task_comments
  for each row execute function public.set_task_comment_author();

-- 3. Atualizar políticas RLS de public.task_comments
drop policy if exists comments_read on public.task_comments;
create policy comments_read on public.task_comments
  for select to authenticated
  using (public.can_access_task(task_id, auth.uid()));

drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments
  for insert to authenticated
  with check (
    public.can_access_task(task_id, auth.uid())
    and (author_id = auth.uid() or author_id is null or public.is_admin(auth.uid()))
  );

drop policy if exists comments_update on public.task_comments;
create policy comments_update on public.task_comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()))
  with check (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists comments_delete on public.task_comments;
create policy comments_delete on public.task_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));



-- ==============================================================================
-- MIGRATION: 202611160001_consolidated_forwarding_and_lineage.sql
-- ==============================================================================
-- Migration: 202611160001_consolidated_forwarding_and_lineage.sql
-- Objetivo: Garantir integridade de ponta a ponta para encaminhamento de tarefas com ramificação,
--           RLS permissiva para membros do quadro de destino, linha do tempo da jornada e blindagem
--           contra desaparecimento de tarefas ao editar em quadros de destino.

-- 1. Campos de ramificação na tabela public.tasks
alter table public.tasks
  add column if not exists origin_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists root_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists forwarded_at timestamptz default null,
  add column if not exists forwarded_by uuid references public.profiles(id) on delete set null;

-- Inicializar root_task_id para tarefas existentes que ainda não tenham
update public.tasks
   set root_task_id = id
 where root_task_id is null;

-- Índices para performance e integridade de linhagem
create unique index if not exists tasks_single_branch_idx
  on public.tasks (origin_task_id)
  where origin_task_id is not null;

create index if not exists tasks_root_task_idx
  on public.tasks (root_task_id);

create index if not exists tasks_origin_task_idx
  on public.tasks (origin_task_id);

-- 2. Configurações por quadro na tabela public.boards ("Ao concluir")
alter table public.boards
  add column if not exists on_completion_action text not null default 'ask'
    check (on_completion_action in ('ask', 'suggest_default', 'none')),
  add column if not exists default_forward_board_id uuid references public.boards(id) on delete set null,
  add column if not exists default_forward_stage_id uuid default null;

-- 3. Tabela de linha do tempo e eventos imutáveis da jornada
create table if not exists public.task_lineage_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  root_task_id uuid not null,
  board_id uuid references public.boards(id) on delete set null,
  board_name text not null,
  board_color text,
  stage_id uuid,
  stage_name text not null,
  event_type text not null check (event_type in ('created', 'moved', 'completed', 'forwarded')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_lineage_events enable row level security;

create index if not exists task_lineage_events_root_idx
  on public.task_lineage_events (root_task_id, created_at asc);

create index if not exists task_lineage_events_task_idx
  on public.task_lineage_events (task_id, created_at asc);

drop policy if exists task_lineage_events_select on public.task_lineage_events;
create policy task_lineage_events_select on public.task_lineage_events
  for select to authenticated using (true);

drop policy if exists task_lineage_events_insert on public.task_lineage_events;
create policy task_lineage_events_insert on public.task_lineage_events
  for insert to authenticated with check (true);

-- 4. Trigger de integridade: Travamento no servidor da tarefa concluída que já foi encaminhada
create or replace function public.check_forwarded_task_immutable()
returns trigger language plpgsql as $$
begin
  if OLD.forwarded_at is not null then
    if NEW.stage_id <> OLD.stage_id then
      raise exception 'Esta tarefa já foi concluída e encaminhada para outro quadro e não pode ser reaberta ou movida.';
    end if;
    if NEW.completed_at is distinct from OLD.completed_at and NEW.completed_at is null then
      raise exception 'Esta tarefa já foi concluída e encaminhada e não pode ter seu status de conclusão removido.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_forwarded_task_immutable on public.tasks;
create trigger trg_check_forwarded_task_immutable
  before update on public.tasks
  for each row execute function public.check_forwarded_task_immutable();

-- 5. Atualizar políticas de INSERT e UPDATE em public.tasks
-- Garante que membros do quadro de destino possam atualizar a tarefa ramificada
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_admin(auth.uid())
  or (board_id is null and public.is_team_member(team_id, auth.uid()))
  or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  or (origin_task_id is not null and (
    public.can_access_task(origin_task_id, auth.uid()) or
    (board_id is not null and public.can_access_board(board_id, auth.uid()))
  ))
) with check (
  (
    public.is_admin(auth.uid())
    or public.is_team_member(team_id, auth.uid())
    or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  )
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
);

-- 6. RPC Atômica para encaminhar tarefa concluída gerando ramificação vinculada
create or replace function public.forward_completed_task(
  p_task_id uuid,
  p_target_board_id uuid,
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_orig public.tasks%rowtype;
  v_orig_board_name text := 'Quadro Geral';
  v_orig_board_color text := '#2563eb';
  v_orig_stage_name text := 'Concluído';
  v_orig_is_final boolean := false;
  v_target_board record;
  v_target_board_name text := 'Quadro Geral';
  v_target_board_color text := '#2563eb';
  v_target_stage_name text;
  v_target_is_final boolean := false;
  v_resolved_team_id uuid;
  v_resolved_assignee_id uuid := null;
  v_resolved_root_id uuid;
  v_new_task_id uuid;
  v_existing_branch public.tasks%rowtype;
  v_target_board_id_norm uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  select coalesce(full_name, 'Usuário') into v_actor_name
    from public.profiles where id = v_actor_id;

  select * into v_orig
    from public.tasks
   where id = p_task_id
     for update;

  if not found then
    raise exception 'Tarefa original não encontrada';
  end if;

  if v_orig.forwarded_at is not null then
    select * into v_existing_branch
      from public.tasks
     where origin_task_id = p_task_id
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'already_forwarded', true,
        'branch_task_id', v_existing_branch.id,
        'origin_task_id', p_task_id,
        'target_board_id', v_existing_branch.board_id,
        'target_stage_id', v_existing_branch.stage_id,
        'message', 'Esta tarefa já foi encaminhada anteriormente.'
      );
    end if;
  end if;

  if v_orig.board_id is not null then
    select bs.name, bs.is_final into v_orig_stage_name, v_orig_is_final
      from public.board_stages bs
     where bs.id = v_orig.stage_id and bs.board_id = v_orig.board_id;
    if not found then
      select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
        from public.stages s where s.id = v_orig.stage_id;
    end if;

    select b.name, b.color into v_orig_board_name, v_orig_board_color
      from public.boards b where b.id = v_orig.board_id;
  else
    select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
      from public.stages s where s.id = v_orig.stage_id;
  end if;

  if not coalesce(v_orig_is_final, false) and v_orig.completed_at is null then
    raise exception 'Apenas tarefas na etapa final podem ser encaminhadas para outro quadro.';
  end if;

  if not (
    public.is_admin(v_actor_id)
    or (v_orig.board_id is null and public.is_team_member(v_orig.team_id, v_actor_id))
    or (v_orig.board_id is not null and public.can_access_board(v_orig.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para encaminhar esta tarefa';
  end if;

  v_target_board_id_norm := p_target_board_id;
  if v_target_board_id_norm is not null then
    select * into v_target_board from public.boards where id = v_target_board_id_norm;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    v_target_board_name := v_target_board.name;
    v_target_board_color := coalesce(v_target_board.color, '#2563eb');

    if not public.can_create_task_in_board(v_target_board_id_norm, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    if v_orig.board_id is not distinct from v_target_board_id_norm then
      raise exception 'A ramificação não pode ser criada no mesmo quadro de origem.';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if exists (
      select 1 from public.task_lineage_events
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) or exists (
      select 1 from public.tasks
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) then
      raise exception 'Não é permitido encaminhar para um quadro que já faz parte da jornada desta tarefa (ciclo detectado).';
    end if;

    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    end if;

    if v_target_board.type = 'custom' then
      select bs.name, bs.is_final into v_target_stage_name, v_target_is_final
        from public.board_stages bs
       where bs.id = p_target_stage_id and bs.board_id = v_target_board_id_norm;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select s.name, s.is_final into v_target_stage_name, v_target_is_final
        from public.stages s where s.id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if v_orig.board_id is null then
      raise exception 'A tarefa já pertence ao Quadro Geral e não pode ser ramificada para o mesmo quadro.';
    end if;

    select s.name, s.is_final into v_target_stage_name, v_target_is_final
      from public.stages s where s.id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  if v_orig.assignee_id is not null then
    if exists (
      select 1 from public.team_members m
       where m.team_id = v_resolved_team_id
         and m.user_id = v_orig.assignee_id
         and m.active
    ) then
      v_resolved_assignee_id := v_orig.assignee_id;
    else
      v_resolved_assignee_id := null;
    end if;
  end if;

  insert into public.tasks (
    title,
    description,
    team_id,
    assignee_id,
    client_id,
    stage_id,
    priority,
    due_at,
    tags,
    created_by,
    board_id,
    sprint_id,
    origin_task_id,
    root_task_id,
    completed_at,
    created_at,
    updated_at
  ) values (
    v_orig.title,
    v_orig.description,
    v_resolved_team_id,
    v_resolved_assignee_id,
    v_orig.client_id,
    p_target_stage_id,
    v_orig.priority,
    null,
    coalesce(v_orig.tags, '{}'),
    v_actor_id,
    v_target_board_id_norm,
    null,
    p_task_id,
    v_resolved_root_id,
    null,
    now(),
    now()
  ) returning id into v_new_task_id;

  update public.tasks
     set forwarded_at = now(),
         forwarded_by = v_actor_id,
         completed_at = coalesce(completed_at, now()),
         root_task_id = v_resolved_root_id,
         updated_at = now()
   where id = p_task_id;

  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    p_task_id,
    v_resolved_root_id,
    v_orig.board_id,
    v_orig_board_name,
    v_orig_board_color,
    v_orig.stage_id,
    v_orig_stage_name,
    'forwarded',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'target_board_id', v_target_board_id_norm,
      'target_board_name', v_target_board_name,
      'target_task_id', v_new_task_id
    ),
    now()
  );

  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    v_new_task_id,
    v_resolved_root_id,
    v_target_board_id_norm,
    v_target_board_name,
    v_target_board_color,
    p_target_stage_id,
    v_target_stage_name,
    'created',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'origin_task_id', p_task_id,
      'from_board_name', v_orig_board_name
    ),
    now() + interval '1 millisecond'
  );

  return jsonb_build_object(
    'success', true,
    'branch_task_id', v_new_task_id,
    'origin_task_id', p_task_id,
    'target_board_id', v_target_board_id_norm,
    'target_stage_id', p_target_stage_id,
    'message', 'Tarefa encaminhada com sucesso gerando ramificação vinculada.'
  );
end;
$$;

revoke all on function public.forward_completed_task(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_completed_task(uuid, uuid, uuid, uuid) to authenticated;

-- 7. RPC get_task_lineage para retornar eventos da linhagem
create or replace function public.get_task_lineage(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_root_id uuid;
  v_events jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if not public.can_access_task(p_task_id, v_uid) then
    raise exception 'Sem permissão para visualizar a linha do tempo desta tarefa';
  end if;

  select coalesce(root_task_id, id) into v_root_id
    from public.tasks
   where id = p_task_id;

  if v_root_id is null then
    v_root_id := p_task_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'task_id', e.task_id,
    'root_task_id', e.root_task_id,
    'board_id', e.board_id,
    'board_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.board_name
      else 'Quadro restrito'
    end,
    'board_color', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.board_color
      else '#94a3b8'
    end,
    'stage_id', e.stage_id,
    'stage_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.stage_name
      else 'Etapa anterior confidencial'
    end,
    'event_type', e.event_type,
    'actor_id', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.actor_id
      else null
    end,
    'actor_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.actor_name
      else 'Operador anterior'
    end,
    'metadata', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.metadata
      else '{}'::jsonb
    end,
    'created_at', e.created_at,
    'is_masked', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then false
      else true
    end
  ) order by e.created_at asc), '[]'::jsonb) into v_events
  from public.task_lineage_events e
  where e.root_task_id = v_root_id;

  return v_events;
end;
$$;

revoke all on function public.get_task_lineage(uuid) from public;
grant execute on function public.get_task_lineage(uuid) to authenticated;

