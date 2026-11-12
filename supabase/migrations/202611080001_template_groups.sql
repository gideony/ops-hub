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
