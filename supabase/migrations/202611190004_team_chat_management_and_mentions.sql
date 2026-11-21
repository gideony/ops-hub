-- Migration: 202611190002_team_chat_management_and_mentions.sql
-- Objetivo:
-- 1. Canais: colunas description, archived_at, is_restricted.
-- 2. Proteção estrutural do canal "Geral" (não pode ser renomeado, arquivado nem excluído).
-- 3. Políticas de RLS de canais: criar/editar por gestor/admin, excluir apenas por admin.
-- 4. Tabela de auditoria para exclusão definitiva de canais (channel_deletion_audit).
-- 5. Mensagens: colunas edited_at, deleted_at, mentions e mentions_all.
-- 6. Trigger de integridade de mensagens: validação/sanitização de menções, LGPD no soft-delete, imutabilidade de campos protegidos.
-- 7. Políticas de RLS para atualização e moderação de mensagens (messages_update).
-- 8. RPC canônica unread_channel_metrics com contagem de não lidas e menções diretas não lidas (@n).

-- 1. Adicionar colunas na tabela public.channels
alter table public.channels
  add column if not exists description text check (description is null or length(description) <= 500),
  add column if not exists archived_at timestamptz default null,
  add column if not exists is_restricted boolean not null default false;

-- 2. Trigger para proteger o canal "Geral" contra alteração de nome, arquivamento ou exclusão
create or replace function public.guard_channel_geral()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if lower(old.name) = 'geral' and lower(new.name) <> 'geral' then
      raise exception 'O canal Geral é protegido e não pode ser renomeado.';
    end if;
    if lower(old.name) = 'geral' and new.archived_at is not null then
      raise exception 'O canal Geral é protegido e não pode ser arquivado.';
    end if;
  elsif tg_op = 'DELETE' then
    if lower(old.name) = 'geral' then
      raise exception 'O canal Geral é protegido e não pode ser excluído.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_channel_geral on public.channels;
create trigger trg_guard_channel_geral
  before update or delete on public.channels
  for each row execute function public.guard_channel_geral();

-- 3. Tabela de auditoria para exclusão de canais
create table if not exists public.channel_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  channel_name text not null,
  team_id uuid not null,
  team_name text not null,
  deleted_by uuid not null references public.profiles(id),
  deleted_by_name text not null,
  messages_count integer not null default 0,
  attachments_count integer not null default 0,
  deleted_at timestamptz not null default now()
);

alter table public.channel_deletion_audit enable row level security;

drop policy if exists audit_admin_read on public.channel_deletion_audit;
create policy audit_admin_read on public.channel_deletion_audit
  for select to authenticated
  using (public.is_admin(auth.uid()));

-- 4. Atualizar políticas RLS em public.channels
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated
  with check (
    (public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid()))
    and created_by = auth.uid()
    and lower(name) <> 'geral'
  );

drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated
  using (
    public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid())
  )
  with check (
    public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid())
  );

drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels for delete to authenticated
  using (
    public.is_admin(auth.uid()) and lower(name) <> 'geral'
  );

-- 5. Adicionar colunas de ciclo de vida e marcações na tabela public.messages
alter table public.messages
  add column if not exists edited_at timestamptz default null,
  add column if not exists deleted_at timestamptz default null,
  add column if not exists mentions uuid[] not null default '{}',
  add column if not exists mentions_all boolean not null default false;

-- 6. Trigger para integridade, ciclo de vida e sanitização de menções em public.messages
create or replace function public.guard_message_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_team_id uuid;
  v_caller uuid := auth.uid();
  v_is_mgr boolean := false;
  v_is_adm boolean := false;
  v_sanitized_mentions uuid[] := '{}';
  v_mid uuid;
begin
  -- Identificar a equipe do canal
  select c.team_id into v_team_id
    from public.channels c
   where c.id = coalesce(new.channel_id, old.channel_id);

  if v_team_id is null then
    raise exception 'Canal associado inexistente.';
  end if;

  if tg_op = 'INSERT' then
    -- Sanitizar lista de menções para incluir unicamente membros ativos da equipe
    if new.mentions is not null and array_length(new.mentions, 1) > 0 then
      foreach v_mid in array new.mentions loop
        if exists (
          select 1 from public.team_members tm
           where tm.team_id = v_team_id
             and tm.user_id = v_mid
             and tm.active = true
        ) then
          if not (v_mid = any(v_sanitized_mentions)) then
            v_sanitized_mentions := array_append(v_sanitized_mentions, v_mid);
          end if;
        end if;
      end loop;
    end if;
    new.mentions := v_sanitized_mentions;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Imutabilidade estrita dos campos estruturais
    new.author_id   := old.author_id;
    new.channel_id  := old.channel_id;
    new.created_at  := old.created_at;
    new.reply_to_id := old.reply_to_id;
    new.task_id     := old.task_id;

    v_is_adm := public.is_admin(v_caller);
    v_is_mgr := public.is_team_manager(v_team_id, v_caller);

    -- CASO 1: Exclusão lógica (Soft Delete / Moderação)
    if new.deleted_at is not null and old.deleted_at is null then
      if v_caller <> old.author_id and not v_is_mgr and not v_is_adm then
        raise exception 'Permissão negada para remover esta mensagem.';
      end if;
      -- LGPD: apagar conteúdo e marcações permanentemente
      new.body := '';
      new.mentions := '{}';
      new.mentions_all := false;
      new.edited_at := null;
      return new;
    end if;

    -- CASO 2: Tentativa de editar mensagem previamente removida
    if old.deleted_at is not null then
      raise exception 'Mensagens removidas não podem ser editadas.';
    end if;

    -- CASO 3: Edição de conteúdo da mensagem
    if v_caller <> old.author_id then
      raise exception 'Apenas o autor pode editar o texto da mensagem.';
    end if;

    -- Verificar se o canal está arquivado
    if exists (select 1 from public.channels c where c.id = old.channel_id and c.archived_at is not null) then
      raise exception 'Não é permitido editar mensagens em canais arquivados.';
    end if;

    -- Recalcular e sanitizar novas menções
    if new.mentions is not null and array_length(new.mentions, 1) > 0 then
      foreach v_mid in array new.mentions loop
        if exists (
          select 1 from public.team_members tm
           where tm.team_id = v_team_id
             and tm.user_id = v_mid
             and tm.active = true
        ) then
          if not (v_mid = any(v_sanitized_mentions)) then
            v_sanitized_mentions := array_append(v_sanitized_mentions, v_mid);
          end if;
        end if;
      end loop;
    end if;
    new.mentions := v_sanitized_mentions;
    new.edited_at := now();

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_message_lifecycle on public.messages;
create trigger trg_guard_message_lifecycle
  before insert or update on public.messages
  for each row execute function public.guard_message_lifecycle();

-- 7. Políticas de RLS para atualização de mensagens (messages_update)
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (
    public.can_access_channel(channel_id, auth.uid())
    and (
      author_id = auth.uid()
      or public.is_admin(auth.uid())
      or exists (
        select 1 from public.channels c
         where c.id = messages.channel_id
           and public.is_team_manager(c.team_id, auth.uid())
      )
    )
  )
  with check (
    public.can_access_channel(channel_id, auth.uid())
  );

-- 8. RPC canônica unread_channel_metrics (com unread_count e mention_count @n)
create or replace function public.unread_channel_metrics()
returns table(
  channel_id uuid,
  unread_count bigint,
  mention_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id as channel_id,
         count(m.id)::bigint as unread_count,
         count(m.id) filter (
           where m.author_id <> auth.uid()
             and (auth.uid() = any(m.mentions) or m.mentions_all is true)
         )::bigint as mention_count
  from public.channels c
  left join public.message_reads r
    on r.channel_id = c.id and r.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
   and m.author_id <> auth.uid()
   and m.deleted_at is null
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id;
$$;

revoke all on function public.unread_channel_metrics() from public;
grant execute on function public.unread_channel_metrics() to authenticated;

-- Atualizar unread_message_counts para ignorar mensagens com deleted_at is not null
create or replace function public.unread_message_counts()
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
   and m.deleted_at is null
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id;
$$;

revoke all on function public.unread_message_counts() from public;
grant execute on function public.unread_message_counts() to authenticated;
