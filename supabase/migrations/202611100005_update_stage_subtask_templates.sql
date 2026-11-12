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
