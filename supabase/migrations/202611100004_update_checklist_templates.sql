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
