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
