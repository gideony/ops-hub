# Somax Hub

Hub interno de tarefas e comunicação da Somax, em português do Brasil. Projeto independente em React, TypeScript, Vite, Tailwind CSS e Supabase. Os dados de demonstração são fictícios. Nenhum arquivo do sistema atual foi alterado.

## Preparação

1. Crie **um projeto Supabase separado** para este hub.
2. No SQL Editor do novo projeto, execute nesta ordem as migrations presentes em [`supabase/migrations/`](supabase/migrations/), incluindo [`202611100002_update_kanban_flows.sql`](supabase/migrations/202611100002_update_kanban_flows.sql), [`202611100003_admin_free_flow.sql`](supabase/migrations/202611100003_admin_free_flow.sql), [`202611100004_update_checklist_templates.sql`](supabase/migrations/202611100004_update_checklist_templates.sql), [`202611100005_update_stage_subtask_templates.sql`](supabase/migrations/202611100005_update_stage_subtask_templates.sql), [`202611100007_custom_boards_scrum.sql`](supabase/migrations/202611100007_custom_boards_scrum.sql), [`202611100008_create_custom_board_rpc_defaults.sql`](supabase/migrations/202611100008_create_custom_board_rpc_defaults.sql), [`202611100009_custom_board_stages_and_tasks.sql`](supabase/migrations/202611100009_custom_board_stages_and_tasks.sql), [`202611110001_scrum_sprints_and_backlog.sql`](supabase/migrations/202611110001_scrum_sprints_and_backlog.sql), [`202611110002_reports_board_concordance.sql`](supabase/migrations/202611110002_reports_board_concordance.sql), [`202611110003_client_registration_links.sql`](supabase/migrations/202611110003_client_registration_links.sql) e [`202611110004_reorder_stages_fix.sql`](supabase/migrations/202611110004_reorder_stages_fix.sql). As migrations criam e atualizam tabelas, gatilhos, políticas RLS, equipes, etapas operacionais com nomes padronizados, transições com descrição de fluxo, regras de fluxo livre para administradores e fluxo guiado para colaboradores, quadros personalizados (`boards`), etapas customizadas (`board_stages`) com limites WIP, sprints ágeis (`sprints`), story points e ordenação de backlog (`tasks`), grupos de templates de subtarefas, subtarefas automáticas de etapa (`subtask_templates`), tags, canais privados, o bucket `chat-private`, funções administrativas atômicas (`start_sprint`, `move_task_sprint`, `complete_sprint`), procedure atômica de métricas de relatórios por quadro (`get_board_report_metrics`) com isolamento nativo via `SECURITY INVOKER`, suporte a links de cadastro e anexos de clientes, e procedure transacional robusta de reordenação de etapas (`reorder_stages`).
3. Em **Authentication > Providers > Email**, desative cadastro público. Em **Authentication > URL Configuration**, adicione a URL local ou futura do hub aos redirects permitidos.
4. Em **Authentication > Users**, crie a primeira conta. Depois execute no SQL Editor, trocando o e-mail pelo da conta criada:

   ```sql
   update public.profiles p
   set role = 'administrador'
   from auth.users u
   where p.id = u.id and u.email = 'admin@exemplo.com';
   ```

5. Execute [`supabase/seed_demo.sql`](supabase/seed_demo.sql) **uma vez**, depois de criar a conta administradora. O script cadastra clientes e tarefas fictícias e inclui o administrador nas quatro equipes.
6. Copie `.env.example` para `.env` e preencha apenas a URL e a chave **pública anon** do projeto Supabase. Nunca coloque a chave `service_role` no frontend. Sem `.env`, `npm run dev` abre uma prévia local com dados fictícios.
7. Instale e execute:

   ```bash
   npm install
   npm run dev
   ```

8. Para o botão **Novo usuário**, publique a Edge Function [`supabase/functions/invite-user/index.ts`](supabase/functions/invite-user/index.ts) no projeto separado (o nome do endpoint foi mantido). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` devem permanecer como segredos da função. Ela valida a sessão e as permissões, cria a conta com senha temporária via `auth.admin.createUser` e exige a troca da senha no primeiro acesso. Entregue o e-mail e a senha temporária à pessoa por um canal seguro. O cadastro público continua desativado.

Não há publicação ou conexão com produção nesta entrega.

## Regras principais

- A etapa é a fonte única para saber se uma tarefa está concluída. O gatilho do banco preenche `completed_at` ao entrar em etapa final e limpa ao sair. Cada movimentação grava autor e horário em `task_movements`. Kanban, lista de concluídas e dashboard consultam a mesma regra.
- As transições válidas são cadastradas em `stage_transitions`. Colaboradores e gestores seguem estritamente o fluxo guiado, enquanto administradores possuem fluxo livre para mover tarefas para qualquer etapa. O menu de movimentação oferece alternativa ao arrastar. Itens padrão da etapa são aplicados ao entrar nela. Grupos opcionais de templates podem ser selecionados no formulário de nova tarefa; a função `create_task_with_templates` cria tarefa e subtarefas na mesma transação.
- A aba Templates permite criar e editar nome, descrição e itens do grupo. A função `save_checklist_template` salva tudo na mesma transação; alterações no template não reescrevem checklists de tarefas já criadas.
- A aba Tags permite criar, editar cor e nome, e excluir tags. As funções `save_tag` e `delete_tag` atualizam também as tarefas que usam a tag; apenas administradores podem executá-las. A seleção de tags nas tarefas usa o cadastro compartilhado.
- Em **Tarefas > Kanban > Gerenciar Etapas**, administradores podem criar etapas, alterar nome e cor, reordenar por arrastar ou pelas setas do teclado e excluir etapas sem tarefas, fluxos ou subtarefas padrão. A função `reorder_stages` grava a ordem sem violar a posição única, e o gatilho `guard_stage_delete` preserva as referências e a última etapa final. Os caminhos continuam configurados em **Fluxos**.
- Tarefas e seus comentários, checklists e histórico são protegidos por RLS de equipe, inclusive em consulta direta por ID.
- Mensagens, metadados de anexos e objetos do bucket privado exigem membro **ativo** da equipe. Administradores sem associação ativa não acessam o canal. A função de criação de usuários mantém a chave privilegiada no servidor.
- Mensagens são exibidas como enviadas só após o `INSERT` no PostgreSQL. O chat reconcilia mensagens após reconexão, pagina o histórico e elimina duplicatas por ID. Em falha de gravação, o texto permanece no campo.
- O cadastro de clientes separa dados gerais, financeiro, links e referências de integração. Não use esses campos para senhas ou tokens.
- Clientes têm visões em cartões e lista, com criação e edição para administradores. Administradores criam equipes; gestores podem editar a equipe que gerenciam. `save_team` cria também o canal privado Geral e a associação do administrador criador na mesma transação.
- O cadastro de usuários coleta nome, e-mail de acesso, WhatsApp, senha temporária e função (Administrador, Gestor ou Colaborador), além da equipe. A senha vai apenas para o Supabase Auth pela Edge Function e não é gravada no perfil nem na prévia local.
- Em **Configurações**, qualquer pessoa logada vê os dados da própria conta, pode atualizar nome e WhatsApp, alterar a própria senha e escolher o tema. Função e equipes são informativas; o e-mail de acesso é somente leitura. `update_my_profile` altera exclusivamente o perfil identificado por `auth.uid()` e não permite trocar função ou status.
- A aba **Relatórios** reúne indicadores de tarefas, distribuição por equipe e etapa, seletor de dimensão por quadro e lista filtrável com exportação CSV:
  - **Quadro como Dimensão**: Permite filtrar e agrupar por `Todos os meus quadros`, `Quadro Geral`, `Visões por Setor` (espelhos) e `Quadros Personalizados` (Kanban/Scrum).
  - **Quadro-Resumo de Indicadores**: Na opção `Todos os meus quadros`, apresenta uma tabela comparativa com uma linha por quadro (Nome, Tipo, Total, Em andamento, Pausadas, Backlog, Concluídas, Atrasadas, Progresso % com mini-barra e Story Points para Scrum). As visões por setor aparecem como linhas informativas ("visão do Geral") e ficam rigorosamente fora da linha de TOTAL CONSOLIDADO, impedindo qualquer contagem dupla. Conta com navegação rápida com filtros clicáveis por célula de status e botão dedicado de exportação do resumo em CSV (compatível com Excel via BOM UTF-8).
  - **Status Mutuamente Exclusivos**: Toda tarefa possui exatamente um status (`active` + `done` + `blocked` + `backlog` = Total).
  - **Atraso como Indicador Visual**: `Atrasada` é um marcador/alerta extra (ícone de relógio vermelho), aplicando-se a tarefas não concluídas com prazo estritamente anterior à data de hoje no fuso oficial `America/Fortaleza`. Tarefas com prazo no próprio dia não contam como atrasadas.
  - **Quadros Scrum**: Tarefas fora da sprint ativa entram no status `Backlog` (com rótulo Backlog ou Sprint planejada). Há alternador opcional entre "Todo o quadro" e "Apenas sprint ativa".
  - **Segurança e RLS**: Consultas de agregação de relatórios no banco utilizam a procedure `get_board_report_metrics` com `SECURITY INVOKER`, garantindo que quadros e tarefas privadas de outras equipes nunca vazem nem no nome nem nos totais. A exportação CSV respeita as permissões ativas.
- **Quadros Kanban Personalizados e Visões por Setor**:
  - **Quadro Geral**: Quadro canônico oficial com todas as 15 etapas e todas as tarefas.
  - **Visões por Setor**: Espelham subconjuntos de etapas do Geral (ex: Comercial com Negociação, Contrato e Kick-off) sem duplicar tarefas. Mover um card na visão do setor atualiza o Geral em tempo real. Apenas administradores podem criar visões de setor.
  - **Quadros Personalizados**: Permitem definir etapas próprias (nome, cor, ordem e limite WIP opcional). Administradores e gestores de equipe podem criar quadros (privados de sua equipe ou corporativos compartilhados). A movimentação em quadros personalizados é livre para quem possui acesso.
  - **Criação de Tarefas nos Quadros**: O modal "Nova Tarefa" detecta automaticamente o quadro ativo (`activeBoard`). Ao criar uma tarefa dentro de um quadro personalizado, ela é vinculada a ele (`board_id`), restrita às colunas dele (`board_stages`) e, caso o quadro seja Scrum, permite alocação direta à sprint ativa ou ao backlog.
  - **Edição de Etapas e Configurações do Quadro**: Pelo botão "Editar Etapas" no topo do quadro ou em "Meus quadros > Editar", gestores e administradores podem editar nome, descrição, escopo, adicionar novas colunas, renomear, trocar cores, ajustar limites WIP e definir a coluna final. Tarefas de etapas removidas são realocadas automaticamente para a primeira coluna remanescente pela RPC `update_custom_board`, evitando registros órfãos.
  - **Limites de Trabalho em Andamento (WIP)**: Alerta visual configurável por etapa (destaque amarelo ao atingir o limite exato, vermelho ao exceder; ex: `3/3` ou `4/3`), sem bloquear a soltura do card.
  - **Navegação e Linha de Abas (Fase 1)**: As abas seguem estritamente a ordem `[Geral]` -> `[Meus quadros]` -> `[quadros do usuário, ex: Comercial, Suporte]` -> `[+ Novo quadro]`. O botão `[+ Novo quadro]` permanece fixado inline ao lado do último quadro, abrindo o modal de criação. À direita, alternador de visão `[Kanban / Lista]` e botão de gerenciar etapas.
  - **Tela "Meus Quadros" em Navegação Própria**: Clicar na aba "Meus quadros" navega para uma visualização dedicada na própria tela (sem popup ou modal), apresentando cartões com resumo, métricas, escopo e ações de acesso, edição e exclusão de quadros associados ao usuário logado.
  - **Visão por Setor**: Apresenta banner de apoio informativo (*"Visão filtrada do quadro Geral. Mover um card aqui atualiza o Geral."*).
  - **Padrão Visual de Referência**: Colunas de 250px, cabeçalhos das 15 etapas com cores padronizadas e bolinha de destaque, contador em pílula escura de 11px, cards com padding 12px e chip de setor secundário (`#dbeafe`/`#1e3a8a`), botão primário `#1e40af` (raio 8px, peso 600) e botões ghost `#cbd5e1`.
  - **Metodologia Scrum (Fase 2)**:
    - **Criação de Quadro Scrum**: Metodologia "Scrum" habilitada no modal "Criar quadro" com etapas editáveis (padrão: Tarefas, Em andamento, Concluído).
    - **Alternador de Visões**: Em quadros Scrum, exibe dinamicamente 4 opções: `[Kanban | Lista | Backlog | Sprint]`. Em quadros Kanban convencionais e no Geral, `Backlog` e `Sprint` não são exibidos.
    - **Backlog Priorizado**: Lista priorizada de demandas não alocadas, reordenável via drag-and-drop, com estimativa em Story Points (`pts`), tags de prioridade, responsável e botão rápido `+ Tarefa no backlog`.
    - **Planejamento de Sprints**: Criação de sprints com nome, meta e período de início/término. Permite arrastar tarefas do backlog para a sprint planejada, calculando o total planejado em tempo real.
    - **Regra de Unicidade**: Blindagem no PostgreSQL (`idx_unique_active_sprint_per_board`) e na aplicação garantindo rigorosamente apenas **uma** sprint ativa simultaneamente por quadro.
    - **Validação de Início de Sprint**: A RPC `start_sprint` exige ao menos uma tarefa alocada e período de datas válido para iniciar o ciclo.
    - **Quadro da Sprint Ativa**: Exibe exclusivamente as tarefas da sprint corrente nas colunas do quadro, com cabeçalho contendo nome, meta, período, badge "Dia X de Y", barra de progresso de pontos entregues e botões "Burndown" e "Encerrar sprint".
    - **Gráfico de Burndown Diário**: Renderização vetorial em SVG nativo responsivo comparando a linha ideal de queima de pontos versus a linha real baseada nas transições registradas em `task_movements`.
    - **Encerramento de Sprint**: Modal completo exibindo velocidade (pontos entregues), pendências e transição automática das tarefas não concluídas para o backlog (`sprint_id = null`) ou para a próxima sprint planejada via RPC atômica `complete_sprint`.

## Verificação

Com o projeto Supabase configurado, use três contas fictícias: `A` e `B` na mesma equipe e `C` em outra. Abra sessões separadas e verifique:

1. `A` envia mensagem no canal **Geral**; `B` recebe sem atualizar a página. Desconecte `B`, envie outras mensagens e reconecte: todas aparecem uma vez. Simule falha de rede ao enviar: o texto continua no editor.
2. `C` não lista o canal da equipe de `A`, não recebe eventos Realtime e obtém resultado vazio/403 ao consultar `messages`, `attachments` e `storage.objects` diretamente pelo ID/caminho. Teste também uma tarefa vinculada de equipe diferente: o título não deve aparecer para quem não tem acesso à tarefa.
3. Mova uma tarefa para **Concluído**: ela aparece como concluída no Kanban, na lista e no indicador da semana. Reabra em **Faturamento**: `completed_at` volta a `null`, a tarefa sai das visões de concluídas e permanece no histórico de movimentações.
4. Desative a associação de `B` à equipe e repita a consulta direta ao canal e anexo: o acesso deve ser negado.
5. Crie uma tarefa selecionando dois grupos de templates e confirme que todos os itens selecionados aparecem no checklist após salvar e recarregar.
6. Crie um cliente, edite-o e confira as visões em cartões e lista. Crie uma equipe e confirme a associação do administrador e o canal privado Geral; edite nome e cor.
7. Crie um usuário com e-mail, WhatsApp, senha temporária, função e equipe. Faça login com essa conta e confirme a exigência de trocar a senha. Verifique que a senha não aparece em `profiles` nem na lista de usuários.
8. Entre com um colaborador, abra **Configurações** e altere nome e WhatsApp. Recarregue e confirme a persistência. Tente chamar `update_my_profile` sem sessão e confirme a negação. Altere a senha e confirme o novo login.

Comandos locais: `npm test` e `npm run build`.

## Limites desta entrega

O código está pronto para persistir dados no Supabase, mas este workspace não contém URL, chave pública nem contas do projeto. O Docker local também não está ativo. Por isso, a migration e os testes de aceitação entre contas não foram executados aqui; é necessário aplicá-los no novo projeto Supabase antes do uso. Nenhum dado real foi importado.
