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
