-- Execute após criar e promover a primeira conta administradora.
-- Todos os nomes, empresas e projetos abaixo são fictícios.
insert into public.clients (name, legal_name, contact_name, contact_email, contact_phone, financial_notes, links, integration_references)
values
  ('Aurora Café', 'Aurora Café Comércio Fictício Ltda.', 'Marina Lopes', 'marina@aurora.example', '(11) 90000-0101', 'Cobrança mensal fictícia.', '[{"label":"Site","url":"https://aurora.example"}]', 'Integração simulada com catálogo de produtos.'),
  ('Verdejar', 'Verdejar Projetos Fictícios Ltda.', 'Daniel Prado', 'daniel@verdejar.example', '(11) 90000-0202', 'Projeto demonstrativo.', '[{"label":"Referências","url":"https://verdejar.example"}]', 'Referência pública de API fictícia.'),
  ('Nuvem Norte', 'Nuvem Norte Serviços Fictícios Ltda.', 'Clara Reis', 'clara@nuvemnorte.example', '(11) 90000-0303', 'Faturamento de demonstração.', '[]', 'Sem integração ativa.');

do $$
declare admin_id uuid; dev_id uuid; design_id uuid; comercial_id uuid; financeiro_id uuid; client_aurora uuid; client_verdejar uuid; task_one uuid; task_two uuid;
begin
  select id into admin_id from public.profiles where role = 'administrador' and active order by created_at limit 1;
  if admin_id is null then raise exception 'Crie uma conta administradora antes de executar seed_demo.sql'; end if;
  insert into public.team_members(team_id,user_id,is_manager,active)
    select id,admin_id,true,true from public.teams
    on conflict (team_id,user_id) do update set is_manager=true,active=true;
  select id into dev_id from public.teams where name = 'Desenvolvimento';
  select id into design_id from public.teams where name = 'Design';
  select id into comercial_id from public.teams where name = 'Comercial';
  select id into financeiro_id from public.teams where name = 'Financeiro';
  select id into client_aurora from public.clients where name = 'Aurora Café' limit 1;
  select id into client_verdejar from public.clients where name = 'Verdejar' limit 1;
  insert into public.tasks(title,description,team_id,assignee_id,client_id,stage_id,priority,due_at,tags,created_by)
  values ('Portal de pedidos Aurora','Criar a experiência do novo portal de pedidos.',dev_id,admin_id,client_aurora,(select id from public.stages where name='Desenvolvimento'),'alta',current_date+5,array['portal','produto'],admin_id) returning id into task_one;
  insert into public.tasks(title,description,team_id,assignee_id,client_id,stage_id,priority,due_at,tags,created_by)
  values ('Campanha de lançamento Verdejar','Desenvolver peças visuais para a campanha.',design_id,admin_id,client_verdejar,(select id from public.stages where name='Criação de Imagens'),'media',current_date+9,array['campanha','design'],admin_id) returning id into task_two;
  insert into public.tasks(title,description,team_id,assignee_id,client_id,stage_id,priority,due_at,tags,created_by)
  values
  ('Proposta Nuvem Norte','Preparar escopo e proposta comercial.',comercial_id,admin_id,(select id from public.clients where name='Nuvem Norte'),(select id from public.stages where name='Negociação'),'urgente',current_date-2,array['proposta'],admin_id),
  ('Conferir faturamento Aurora','Validar dados de cobrança do projeto.',financeiro_id,admin_id,client_aurora,(select id from public.stages where name='Faturamento'),'baixa',current_date+12,array['financeiro'],admin_id),
  ('Revisão de conteúdo institucional','Aguardando retorno do cliente.',design_id,admin_id,client_aurora,(select id from public.stages where name='Pausado'),'media',null,array['conteúdo'],admin_id);
  insert into public.task_checklist(task_id,title,position) values (task_one,'Revisar requisitos',1),(task_one,'Implementar interface',2),(task_two,'Criar primeira proposta visual',1);
  insert into public.task_comments(task_id,author_id,body) values (task_one,admin_id,'Projeto fictício criado para demonstração do hub.');
end $$;

-- Cadastra as etiquetas fictícias usadas pelas tarefas acima.
with existing as (
  select distinct tag as name from public.tasks task, unnest(task.tags) as tag
), numbered as (
  select name, row_number() over (order by name) as position from existing
)
insert into public.tags(name,color)
select name, (array['#a855f7','#ef4444','#10b981','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#64748b'])[((position - 1) % 8) + 1]
from numbered
on conflict do nothing;
