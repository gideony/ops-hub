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
