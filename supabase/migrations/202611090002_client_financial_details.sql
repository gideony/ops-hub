alter table public.clients
  add column financial_contact_name text,
  add column financial_email text,
  add column financial_whatsapp text,
  add column financial_due_date date,
  add column integration_items jsonb not null default '[]'::jsonb,
  add constraint clients_integration_items_array check (jsonb_typeof(integration_items) = 'array');
