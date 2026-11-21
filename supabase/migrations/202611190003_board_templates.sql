-- ==============================================================================
-- Migration: 202611190003_board_templates.sql
-- Demanda: Modelos de Quadro Gerenciáveis para criação em 2 Passos
-- ==============================================================================
-- 1. Cria a tabela public.board_templates para armazenar conjuntos de etapas reutilizáveis.
-- 2. Habilita RLS: leitura para todos os usuários autenticados, gestão para admins.
-- 3. Insere os 5 modelos iniciais oficiais da Somax:
--    - Em branco
--    - Suporte (Tarefas, Em andamento, Resolvido)
--    - Comercial (Lead, Negociações, Follow-up, Assinatura de Contrato, Concluído, Perdido)
--    - Implantação (Kick-off, Em Implantação, Homologação, Concluído)
--    - Scrum padrão (Sprint Backlog, Em Desenvolvimento, Code Review, Entregue)
-- ==============================================================================

create table if not exists public.board_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  methodology text not null default 'kanban' check (methodology in ('kanban', 'scrum')),
  color text not null default '#3b82f6',
  stages jsonb not null default '[]'::jsonb,
  is_builtin boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.board_templates enable row level security;

drop policy if exists board_templates_read on public.board_templates;
create policy board_templates_read on public.board_templates
  for select to authenticated using (true);

drop policy if exists board_templates_write on public.board_templates;
create policy board_templates_write on public.board_templates
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Inserção dos 5 modelos pré-definidos oficiais (Idempotente)
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from public.profiles where role = 'administrador' order by created_at asc limit 1;
  if v_admin_id is null then
    select id into v_admin_id from public.profiles order by created_at asc limit 1;
  end if;

  -- 1. Em branco
  if not exists (select 1 from public.board_templates where name = 'Em branco') then
    insert into public.board_templates (name, description, methodology, color, stages, is_builtin, created_by)
    values (
      'Em branco',
      'Quadro minimalista com apenas uma etapa inicial para você estruturar do seu jeito.',
      'kanban',
      '#94a3b8',
      jsonb_build_array(
        jsonb_build_object('name', 'Tarefas', 'color', '#94a3b8', 'wip_limit', null, 'is_final', false)
      ),
      true,
      v_admin_id
    );
  end if;

  -- 2. Suporte
  if not exists (select 1 from public.board_templates where name = 'Suporte') then
    insert into public.board_templates (name, description, methodology, color, stages, is_builtin, created_by)
    values (
      'Suporte',
      'Fluxo enxuto e ágil para atendimento a chamados e incidentes com limite de trabalho.',
      'kanban',
      '#0d9488',
      jsonb_build_array(
        jsonb_build_object('name', 'Tarefas', 'color', '#94a3b8', 'wip_limit', null, 'is_final', false),
        jsonb_build_object('name', 'Em andamento', 'color', '#0d9488', 'wip_limit', 3, 'is_final', false),
        jsonb_build_object('name', 'Resolvido', 'color', '#10b981', 'wip_limit', null, 'is_final', true)
      ),
      true,
      v_admin_id
    );
  end if;

  -- 3. Comercial
  if not exists (select 1 from public.board_templates where name = 'Comercial') then
    insert into public.board_templates (name, description, methodology, color, stages, is_builtin, created_by)
    values (
      'Comercial',
      'Funil de vendas completo desde a qualificação do lead até o fechamento ou perda.',
      'kanban',
      '#2563eb',
      jsonb_build_array(
        jsonb_build_object('name', 'Lead', 'color', '#60a5fa', 'wip_limit', null, 'is_final', false),
        jsonb_build_object('name', 'Negociações', 'color', '#f59e0b', 'wip_limit', 4, 'is_final', false),
        jsonb_build_object('name', 'Follow-up', 'color', '#3b82f6', 'wip_limit', 3, 'is_final', false),
        jsonb_build_object('name', 'Assinatura de Contrato', 'color', '#a855f7', 'wip_limit', 2, 'is_final', false),
        jsonb_build_object('name', 'Concluído', 'color', '#10b981', 'wip_limit', null, 'is_final', true),
        jsonb_build_object('name', 'Perdido', 'color', '#ef4444', 'wip_limit', null, 'is_final', true)
      ),
      true,
      v_admin_id
    );
  end if;

  -- 4. Implantação
  if not exists (select 1 from public.board_templates where name = 'Implantação') then
    insert into public.board_templates (name, description, methodology, color, stages, is_builtin, created_by)
    values (
      'Implantação',
      'Esteira estruturada para homologação e entrada em produção de novos clientes.',
      'kanban',
      '#7c3aed',
      jsonb_build_array(
        jsonb_build_object('name', 'Kick-off', 'color', '#3b82f6', 'wip_limit', null, 'is_final', false),
        jsonb_build_object('name', 'Em Implantação', 'color', '#f97316', 'wip_limit', 3, 'is_final', false),
        jsonb_build_object('name', 'Homologação', 'color', '#8b5cf6', 'wip_limit', 2, 'is_final', false),
        jsonb_build_object('name', 'Concluído', 'color', '#10b981', 'wip_limit', null, 'is_final', true)
      ),
      true,
      v_admin_id
    );
  end if;

  -- 5. Scrum padrão
  if not exists (select 1 from public.board_templates where name = 'Scrum padrão') then
    insert into public.board_templates (name, description, methodology, color, stages, is_builtin, created_by)
    values (
      'Scrum padrão',
      'Ciclo ágil ideal para desenvolvimento com sprints, code review e entrega contínua.',
      'scrum',
      '#6366f1',
      jsonb_build_array(
        jsonb_build_object('name', 'Sprint Backlog', 'color', '#94a3b8', 'wip_limit', null, 'is_final', false),
        jsonb_build_object('name', 'Em Desenvolvimento', 'color', '#6366f1', 'wip_limit', 4, 'is_final', false),
        jsonb_build_object('name', 'Code Review', 'color', '#f59e0b', 'wip_limit', 2, 'is_final', false),
        jsonb_build_object('name', 'Entregue', 'color', '#10b981', 'wip_limit', null, 'is_final', true)
      ),
      true,
      v_admin_id
    );
  end if;

end $$;
