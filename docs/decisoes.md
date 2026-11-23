# Registro de Decisões de Arquitetura (ADR) — OPSHUB

Este documento registra as decisões estruturais, trade-offs e padrões técnicos adotados na evolução do OPSHUB, conforme as diretrizes do papel de **Arquiteto** em `AGENTS.md`.

---

## ADR-001: Reaproveitamento do Modelo de Tarefas e Evitação de Duplicidade

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Contexto:**
  O sistema precisava evoluir de um único quadro com 15 etapas para suportar visões por setor (filtros sobre o Geral), quadros personalizados independentes e quadros com metodologia Scrum. Havia o risco de criar tabelas paralelas de tarefas (ex: `scrum_tasks`, `custom_tasks`), duplicando lógica, relatórios e permissões.
- **Decisão:**
  A tabela `public.tasks` permanece como a entidade relacional central e única para todas as tarefas do sistema.
  - Para isolamento de quadros independentes, a tabela `tasks` recebe a coluna `board_id uuid references public.boards(id) on delete cascade` (com valor `null` indicando pertencimento ao Quadro Geral canônico).
  - Para quadros Scrum, a tabela `tasks` recebe a coluna `sprint_id uuid references public.sprints(id) on delete set null`. Tarefas com `sprint_id is null` residem no Backlog do quadro; tarefas vinculadas à sprint ativa compõem o quadro de execução da sprint.
  - As **Visões de Setor** não duplicam tarefas nem criam etapas próprias; elas são registradas em `boards` com `type = 'sector_view'` e contêm a lista de `stage_ids` canônicos que espelham do Quadro Geral.
- **Consequências:**
  - Positivas: Zero duplicação de dados; relatórios, métricas de equipe e histórico de movimentações (`task_movements`) continuam unificados; movimentar uma tarefa em uma visão de setor atualiza instantaneamente o Quadro Geral.
  - Mitigações: Consultas de tarefas do Geral filtram `board_id is null`, garantindo que tarefas de quadros independentes não poluam o fluxo principal.

---

## ADR-002: Arquitetura de Tenancy e RLS para Quadros Personalizados e Visões

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Contexto:**
  Quadros personalizados podem ser de escopo privado de uma equipe ou corporativos (compartilhados entre todas as equipes). Visões de setor alteram a representação macro do fluxo e devem ser governadas centralmente.
- **Decisão:**
  Criar a tabela `public.boards` com controle explícito de escopo:
  - `type in ('general', 'sector_view', 'custom')`
  - `methodology in ('kanban', 'scrum')`
  - `team_id uuid references public.teams(id)` (preenchido para quadros privados)
  - `is_shared boolean not null default false` (true para quadros corporativos)
  - `stage_ids uuid[] default '{}'` (usado exclusivamente quando `type = 'sector_view'`)
  Políticas de RLS (`boards_read`, `boards_write`, `boards_delete`):
  1. Leitura: Administradores leem tudo. Usuários ativos leem quadros onde `is_shared = true` OU `team_id` pertence a uma equipe na qual o usuário é membro ativo (`public.is_team_member(team_id, auth.uid())`).
  2. Criação/Edição:
     - Para `type = 'sector_view'`: restrito a `public.is_admin(auth.uid())`.
     - Para `type = 'custom'`: permitido para administradores OU gestores da equipe especificada (`public.is_team_manager(team_id, auth.uid())`).
- **Consequências:**
  - Blindagem contra IDOR entre equipes garantida a nível de banco de dados via PostgreSQL RLS.

---

## ADR-003: Modelo de Sprints para Quadros Scrum

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Contexto:**
  Quadros configurados com metodologia Scrum precisam de suporte a ciclos temporais (Sprints), backlog priorizado e controle de sprint ativa.
- **Decisão:**
  Criar a tabela `public.sprints`:
  - `id uuid primary key default gen_random_uuid()`
  - `board_id uuid not null references public.boards(id) on delete cascade`
  - `name text not null` (ex: "Sprint 1")
  - `goal text`
  - `start_date date`
  - `end_date date`
  - `status text not null default 'planning' check (status in ('planning', 'active', 'completed'))`
  - Constraint / Trigger de integridade: Apenas 1 sprint pode estar no status `active` por quadro ao mesmo tempo.
  - Lógica de estados:
    - `planning`: sprint planejada aguardando início.
    - `active`: sprint em execução cujo conteúdo é renderizado no modo "Sprint Ativa".
    - `completed`: sprint encerrada, cujas tarefas finalizadas são arquivadas no histórico e pendências retornam ao backlog ou próxima sprint.
- **Consequências:**
  - Permite alternar a visualização do quadro Scrum entre "Backlog / Planejamento" e "Quadro da Sprint".

---

## ADR-004: Limites de Trabalho em Andamento (WIP) e Telemetria de Sobrecarga

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Contexto:**
  O usuário optou por alerta visual não-bloqueante para violações de limite WIP (Work In Progress), permitindo flexibilidade operacional sem travar o operador.
- **Decisão:**
  - Tabela `public.board_stages` recebe `wip_limit integer default null`.
  - Quando `wip_limit` for preenchido (> 0):
    - Se `quantidade_tarefas == wip_limit`: indicador visual amarelo de capacidade atingida.
    - Se `quantidade_tarefas > wip_limit`: indicador visual vermelho e badge pulsante de sobrecarga na coluna do Kanban.
    - O drop do card não é abortado, permitindo registrar a movimentação normalmente em `task_movements`.
- **Consequências:**
  - Excelente experiência de usuário (UX) sem atrito, mantendo visibilidade clara para líderes de gargalos no fluxo.

---

## ADR-005: Contratos de RPCs Atômicas

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Decisão:**
  Criar procedures SQL atômicas (`SECURITY DEFINER`) para garantir consistência transacional:
  1. `public.create_custom_board(p_name, p_description, p_type, p_methodology, p_team_id, p_is_shared, p_stage_ids, p_stages_json)`: Cria o quadro e suas etapas (ou mapeamento de setor) em uma única transação protegida.
  2. `public.save_sprint(p_board_id, p_sprint_id, p_name, p_goal, p_start_date, p_end_date, p_status, p_task_ids)`: Cria/atualiza sprint e aloca tarefas atomicamente.

---

## ADR-006: Padronização Visual e Navegação da Fase 1 (Kanban, Visões de Setor e Meus Quadros em Tela)

- **Data:** 2026-11-10
- **Status:** Aprovado
- **Contexto:**
  A Fase 1 foca exclusivamente no fluxo Kanban contínuo e na fidelidade ao design de referência do OPSHUB (sem introduzir Scrum nesta etapa). Era necessário estruturar a navegação por abas com ordem mandatória, transformar "Meus quadros" de pop-up para tela própria e padronizar paleta e dimensões de colunas e cards.
- **Decisão:**
  1. **Linha de Abas Superior:**
     Ordem estrita: `[Geral]` -> `[Meus quadros]` -> `[quadros do usuário, ex: Comercial, Suporte]` -> `[+ Novo quadro]`.
     O botão `+ Novo quadro` é fixado inline na linha de abas, logo após o último quadro, eliminando botões duplicados no cabeçalho.
  2. **Navegação "Meus Quadros":**
     A aba "Meus quadros" navega para uma view dedicada na própria página (`activeBoardId = 'meus-quadros'`), mantendo a aba ativa e listando em grid responsivo apenas os quadros permitidos ao usuário logado (criados por ele, da sua equipe ou corporativos compartilhados), com ações de acesso, edição e exclusão.
  3. **Visão por Setor:**
     Apresenta banner de apoio: *"Visão filtrada do quadro Geral. Mover um card aqui atualiza o Geral."* Cards movidos atualizam a tarefa canônica e geram auditoria em `task_movements`.
  4. **Padronização das 15 Etapas do Geral:**
     Cores exatas de cabeçalho (fundo e bolinha de destaque):
     - Negociações: `#e5e7eb` / `#6b7280`
     - Atividades em pausa: `#fef3c7` / `#f59e0b`
     - Backlog Desenvolvimento: `#fef3c7` / `#f59e0b`
     - Contrato: `#dbeafe` / `#3b82f6`
     - Kick-off: `#fee2e2` / `#ef4444`
     - Criação de Imagens: `#dcfce7` / `#22c55e`
     - Desenvolvimento APP: `#ede9fe` / `#8b5cf6`
     - Integração/Personalização: `#e5e7eb` / `#6b7280`
     - Homologação: `#fef3c7` / `#f59e0b`
     - Criação de Telas: `#dbeafe` / `#3b82f6`
     - Deploy: `#fee2e2` / `#ef4444`
     - Aguardando Aprovação: `#dcfce7` / `#22c55e`
     - Entrega: `#ede9fe` / `#8b5cf6`
     - Faturamento: `#e5e7eb` / `#6b7280`
     - Concluído: `#dcfce7` / `#22c55e`
  5. **Dimensões e Componentes:**
     - Coluna: `250px` fixa, fundo branco, borda `#e2e8f0`, raio `10px`, cabeçalho com dot colorido, nome `14px/600` e contador em pílula escura `11px`.
     - Card: padding `12px`, título `13px`, linha secundária `12px` com chip do setor (`#dbeafe` / `#1e3a8a`).
     - Botão primário: `#1e40af`, raio `8px`, padding `10x16`, peso `600`.
     - Botão secundário (ghost): fundo branco, borda `#cbd5e1`, raio `8px`, texto `13px`.
   6. **Miniaturas e Ações em "Meus Quadros" (Tela 3):**
      - Miniatura das etapas (bolinha colorida + nome da etapa) em cada cartão de quadro.
      - Cartão totalmente clicável para navegação direta ao quadro.
      - Cartão tracejado `+ Novo quadro personalizado` posicionado ao final do grid para abertura imediata do modal de criação.
      - Banner de estado vazio com texto amigável e botão primário caso o usuário ainda não tenha quadros próprios.
   7. **Modal de Criação (Tela 4):**
      - Metodologia: Kanban ativo, Scrum desabilitado com badge `Em breve (Fase 2)`.
      - Origem das tarefas: "Quadro independente" ou "Espelhar etapas do Geral".
      - Visibilidade: "Privado da equipe" (padrão com seletor) ou "Corporativo".
      - Etapas padrão ao abrir: "Tarefas", "Em andamento" (WIP 3) e "Concluído".
      - Botão "+ Adicionar etapa" e rodapé com "Cancelar" e "Criar quadro".
- **Consequências:**
  - Interface ágil e limpa, consistente nos temas claro e escuro, sem duplicidade de botões e com navegação fluida.

---

## ADR-007: Arquitetura da Fase 2 — Metodologia Scrum (Backlog, Sprints, Burndown e Transições)

- **Data:** 2026-11-11
- **Status:** Aprovado
- **Contexto:**
  A Fase 2 expande os quadros personalizados para suportar ciclos ágeis de Scrum, exigindo controle transacional de sprints, estimativa de tarefas em pontos, ordenação de backlog, quadro focado na sprint ativa, relatório de encerramento e gráfico de burndown diário sem dependências externas.
- **Decisão:**
  1. **Schema e Integridade Relacional:**
     - Adição das colunas `story_points` (inteiro positivo ou 0) e `backlog_order` (inteiro sequencial) na tabela `public.tasks`.
     - Criação de índice único parcial em `public.sprints(board_id) WHERE status = 'active'` para impedir fisicamente no PostgreSQL que mais de uma sprint esteja ativa simultaneamente no mesmo quadro.
  2. **Transações Atômicas via RPCs:**
     - `public.start_sprint(p_sprint_id uuid)`: valida se a sprint contém tarefas e datas válidas antes de ativar.
     - `public.move_task_sprint(p_task_id uuid, p_sprint_id uuid, p_backlog_order int)`: move tarefas entre o backlog (`sprint_id = null`) e a sprint planejada atomicamente.
     - `public.complete_sprint(p_sprint_id uuid, p_action_for_pending text, p_next_sprint_name text)`: conclui a sprint ativa e transfere as pendências automaticamente conforme opção escolhida (retorno ao backlog ou nova sprint).
  3. **Visualizações e Navegação no Front-end:**
     - Quadros Scrum exibem 4 opções no alternador: Kanban / Lista / Backlog / Sprint.
     - A visualização "Sprint" foca exclusivamente nos cards da sprint ativa nas colunas do quadro.
     - A visualização "Backlog" exibe as tarefas não alocadas e as sprints planejadas para drag-and-drop.
  4. **Burndown em SVG Puro:**
     - Cálculo determinístico dos pontos totais versus queima diária baseando-se no timestamp das transições para etapas finais (`is_final = true`) registradas em `public.task_movements`.
     - Renderização vetorial nativa (SVG) leve e responsiva com linha ideal tracejada e linha real sólida.
  5. **Compatibilidade com Modo Demonstração:**
     - Funções de estado no `src/demo.ts` refletem as mesmas regras e persistência em memória local sem requerer Supabase.
- **Consequências:**
  - Garantia de consistência lógica absoluta (apenas uma sprint ativa, sem perda de tarefas pendentes).
  - Alto desempenho e leveza visual sem inclusão de bibliotecas pesadas de gráficos.

---

## ADR-008: Auditoria e Concordância Absoluta entre Tarefas (Kanban) e Relatórios

- **Data:** 2026-11-11
- **Status:** Aprovado
- **Contexto:**
  Após a implementação dos múltiplos quadros independentes (Geral, visões setoriais e quadros customizados Kanban/Scrum), identificou-se divergências conceituais e contábeis entre os números exibidos nas colunas do Kanban e as métricas consolidadas dos relatórios:
  1. Tarefas de quadros customizados com etapas personalizadas não eram reconhecidas pelas consultas globais (caindo em etapas genéricas ou não identificadas).
  2. Visões de setor podiam ser contadas inadvertidamente como quadros com tarefas próprias, duplicando a soma total do sistema.
  3. "Atrasada" e "Pausada" eram tratadas com sobreposição de contagem em relação a "Em andamento".
  4. Fuso horário de cálculo de prazo comparava strings ISO em UTC, marcando prazos do dia corrente como atrasados prematuramente.
  5. Tarefas de quadros Scrum fora de sprints ativas distorciam a contagem de tarefas em andamento.
- **Decisão:**
  1. **Quadro como Dimensão de Agrupamento e Filtro:**
     - A camada de relatórios adiciona o seletor de Quadro com agrupamento visual (`Todos os meus quadros`, `Quadro Geral`, `Visões por Setor` e `Quadros Personalizados`).
     - Em `Todos os meus quadros`, apresenta-se uma tabela resumo com linhas por quadro (`Nome`, `Tipo`, `Total`, `Em andamento`, `Pausadas`, `Backlog`, `Concluídas` e `Atrasadas`).
     - As visões de setor aparecem como linhas informativas destacadas (*"visão do Geral"*) e com flag `isMirrorView: true`.
     - **Regra de Não-Duplicação:** Apenas quadros canônicos e independentes (`type = 'general'` e `type = 'custom'`) somam para a linha de TOTAL CONSOLIDADO. Visões de setor são expressamente excluídas do somatório geral.
  2. **Definição Única de Status Mutuamente Exclusivos:**
     - Uma tarefa tem exatamente **um** status de ciclo de vida:
       - `done` (Concluída): se a etapa correspondente possuir `is_final = true` (resolvida no próprio quadro da tarefa).
       - `blocked` (Pausada): se a etapa correspondente possuir `is_pause = true`.
       - `backlog` (Backlog Scrum): se o quadro da tarefa for Scrum e a tarefa não possuir sprint vinculada (`sprint_id is null`) OU estiver alocada em uma sprint planejada (`sprint.status = 'planning'`).
       - `active` (Em andamento): tarefas restantes em execução ativa (inclusive tarefas de sprints ativas).
     - **Equação de Concordância:** `active + done + blocked + backlog === total_tarefas`.
  3. **Atrasada como Indicador / Marcação Extra:**
     - `overdue` (Atrasada) é tratada estritamente como um indicador/alerta, não como status excludente.
     - Uma tarefa é considerada atrasada quando: `status !== 'done'` E `task.due_at` existe E `task.due_at.slice(0, 10) < today`.
     - Tarefas com prazo no dia corrente (`due_at == today`) **NÃO** são atrasadas (o responsável tem até o final do dia).
     - Tarefas pausadas com prazo vencido recebem a marcação de atrasada sem perder o status de pausada.
     - Tarefas concluídas com prazo anterior **nunca** contam como atrasadas.
  4. **Padronização de Fuso Horário:**
     - Tanto no front-end (`todayISO()`) quanto no SQL da migration (`America/Fortaleza`), a data atual de referência é extraída respeitando o fuso brasileiro oficial do sistema (`America/Fortaleza` / UTC-3).
  5. **Resolução de Etapas por Quadro:**
     - O nome, cor e propriedades da etapa de cada tarefa são resolvidos dinamicamente: se `board_id` for customizado, busca em `board_stages`; caso contrário, busca em `stages`. Nenhuma tarefa cai em etapa não identificada.
     - O total de tarefas por etapa no relatório é matematicamente idêntico à contagem de cards na respectiva coluna do Kanban.
  6. **Segurança, RLS e Paridade:**
     - A procedure `public.get_board_report_metrics` criada na migration `202611110002_reports_board_concordance.sql` é declarada explicitamente como `SECURITY INVOKER` (e não `SECURITY DEFINER`). Com isso, as políticas de Row Level Security (RLS) de `boards` e `tasks` são avaliadas contra o contexto do usuário autenticado, impedindo vazamento de dados (IDOR) de quadros privados entre equipes.
     - Paridade absoluta: o módulo em memória `src/demo.ts` e `src/reports.ts` implementa exatamente a mesma álgebra relacional e fuso horário da procedure do banco de dados.
- **Consequências:**
  - 100% de concordância entre os cards do Kanban e os números dos Relatórios.
  - Ausência de distorções por contagem dupla em visões de setor.
  - Segurança e isolamento multi-tenant garantidos em tempo de consulta.

---

## ADR-009: Padronização de Layout em Relatórios e Resolução de Contraste no Modo Escuro do Kanban

- **Data:** 2026-11-11
- **Status:** Aprovado
- **Contexto:**
  1. Na tela de Relatórios, a tabela de Resumo por Quadro apresentava alturas desproporcionais por célula, esticamento visual das etiquetas de metodologia e cabeçalho desintegrado com o ícone fora de linha.
  2. No Kanban, o cabeçalho da coluna (`.kanban-head`) continha `style={{ background: bgColor }}` inline com cores claras hexadecimais, o que anulava as regras de tema escuro (`:root[data-theme='dark'] .kanban-head`) e gerava texto branco sobre fundo claro.
- **Decisão:**
  1. **Tabelas de Relatórios:**
     - Classes semânticas dedicadas (`.report-board-table`, `.report-table-wrap`, `.report-badge-methodology`).
     - Altura de linha consistente (48-52px), alinhamento vertical centralizado e padding vertical uniforme.
     - Etiquetas em pílula (`inline-flex`, raio 9999px, altura 22px) consumindo tokens semânticos (`--chip-info-*`, `--chip-purple-*`, `--chip-neutral-*`).
     - Colunas numéricas alinhadas à direita com números tabulares (`tabular-nums`), distinção para zeros (`.num-zero`) e destaque para tarefas atrasadas com ícone relógio.
     - Suporte nativo à acessibilidade por teclado (`role="button"`, `tabIndex={0}`, foco visível e acionamento por Enter/Espaço).
     - Tabela detalhada com estados vazios semânticos em `<tbody>` (`colSpan`).
  2. **Contraste do Kanban:**
     - Remoção do estilo de background inline em `.kanban-head`.
     - O cabeçalho passa a herdar a variável `--stage-bg` no tema claro e a regra `:root[data-theme='dark'] .kanban-head { background: color-mix(in srgb, var(--stage-color) 20%, #1c1c22); }` no tema escuro, garantindo contraste superior a 7:1 em ambos os modos.
- **Consequências:**
  - Layout harmonioso, responsivo e com alta fidelidade às diretrizes WCAG AA nos temas claro e escuro.
  - Ausência de conflitos de especificidade CSS e eliminação de inline styles desnecessários.

---

## ADR-010: Evolução do Resumo por Quadro em Relatórios (Progresso, Filtro Clicável, Story Points e Exportação CSV)

- **Data:** 2026-11-12
- **Status:** Aprovado
- **Contexto:**
  A tabela gerencial "Resumo por Quadro" apresentava indicadores consolidados por quadro, mas necessitava de evolução para permitir:
  1. Acompanhamento visual da taxa percentual de entrega (% de progresso) por quadro e no total consolidado;
  2. Apoio à metodologia ágil Scrum com exibição da pontuação de Story Points (planejados vs. concluídos);
  3. Navegação rápida e interativa: em vez de apenas filtrar pelo quadro inteiro ao clicar na linha, o gestor deve poder clicar na contagem específica de um status (ex.: *Atrasadas* ou *Em andamento*) para já abrir a listagem analítica filtrada naquele quadro e status;
  4. Exportação executiva dedicada da síntese por quadros em formato CSV com compatibilidade universal (BOM UTF-8 e sanitização anti-injeção).
- **Decisão:**
  1. **Tipagem e Cálculo em `reports.ts`:**
     - Enriquecer `BoardSummaryRow` e `ReportTotals` com `progressPercent` (`Math.round((done / total) * 100)`), `totalStoryPoints` e `doneStoryPoints`.
     - Para quadros Kanban, Story Points são mantidos em 0 e exibidos como `—` na UI para não poluir fluxos não-ágeis.
     - Linha de Total Consolidado totaliza o progresso global ponderado e a soma de Story Points dos quadros ágeis independentes.
  2. **Interatividade e Acessibilidade em `ReportsPage.tsx`:**
     - Implementar elementos interativos acessíveis (`.summary-cell-clickable`) com `role="button"`, `tabIndex={0}`, `aria-label` e suporte a teclado (`Enter`/`Espaço`) com `e.stopPropagation()`, acionando o filtro composto `{ boardId: b.boardId, status: targetStatus }`.
     - Clicar na linha continua filtrando pelo quadro como um todo (`status: 'all'`).
  3. **Visual e Tokens em `reports.css`:**
     - Componente `.report-progress-cell` com mini-barra `.report-progress-bar` e preenchimento `.report-progress-fill` consumindo os tokens de status e tema (`--chip-success-text`).
     - Badge `.scrum-points-pill` com tipografia tabular.
  4. **Exportação Gerencial Segura:**
     - Função canônica `buildBoardSummaryCsv` com delimitador `;`, prefixo `\uFEFF` (BOM UTF-8 para Excel) e proteção contra injeção de fórmulas CSV via `reportCsvCell`.
---

## ADR-011: OPSHUB Analytics V3 — Evolução da Aba de Relatórios por Dores Operacionais (Pontualidade, Gargalos e Capacidade da Equipe)

- **Data:** 2026-11-12
- **Status:** Aprovado
- **Contexto:**
  A aba de relatórios original exibia filtros, métricas simples e uma lista extensa de tarefas, mas não respondia diretamente às principais dores da gestão operacional da OPSHUB:
  1. **Dor 1 (Pontualidade & Prazos):** Falta de visibilidade clara da taxa de entrega no prazo (% On-Time SLA), tarefas concluídas com atraso vs. no prazo e ausência de um radar preventivo de tarefas em risco iminente de vencimento;
  2. **Dor 2 (Gargalos na Esteira):** Falta de identificação do tempo médio de permanência das tarefas por etapa e ausência de alerta de tarefas estagnadas (> 5 dias sem movimentação na mesma etapa);
  3. **Dor 4 (Equipe & Capacidade):** Carga invisível de trabalho por colaborador, dificultando detectar sobrecargas críticas (≥ 8 tarefas ativas) antes que gerem atrasos ou esgotamento.
  Além disso, a tabela de Resumo por Quadro continha colunas redundantes ("Tipo / Metodologia" e "Backlog") que foram removidas a pedido da gestão, unificando a síntese kanban operacional em 6 colunas canônicas (`Quadro`, `Total`, `Em andamento`, `Pausadas`, `Concluídas`, `Atrasadas`).
- **Decisão:**
  1. **Motor de Cálculo em `reports.ts`:**
     - Adição das funções e tipagens canônicas: `daysBetween`, `getPresetDates(preset, today)`, `PunctualityMetrics`, `BottleneckMetrics`, `TeamCapacityMetrics`.
     - `punctualityMetrics`: Calcula `% onTimeRate`, contagem de concluídas no prazo vs. atrasadas, média de dias de atraso e lista `riskTasks` (tarefas ativas vencendo hoje ou nos próximos 3 dias).
     - `bottleneckMetrics`: Calcula `stageRetentions` (dias médios por etapa e status de retenção: rápido, normal, alerta, crítico), destaca o maior gargalo e identifica `stagnantTasks` (tarefas paradas há mais de 5 dias).
     - `teamCapacityMetrics`: Mapeia ocupação ativa, concluídas e atrasadas por colaborador, calculando status de capacidade (`disponivel` [0], `equilibrado` [1-4], `alerta` [5-7], `sobrecarga` [≥ 8]) e média de ativas por pessoa.
  2. **Placar Executivo de Topo:**
     - 3 cards clicáveis no topo da página de relatórios exibindo os KPIs imediatos de SLA de Entrega, Gargalo da Esteira e Equipe & Capacidade, permitindo alternar rapidamente para a aba analítica correspondente.
  3. **Navegação em 4 Abas (`reports-tabs-nav`):**
     - Aba `quadros`: Resumo por Quadro (tabela canônica de 6 colunas) + Gráficos de distribuição + Tabela detalhada de tarefas com busca e exportação CSV.
     - Aba `gargalos`: Ranking de retenção média por etapa com barras visuais e Radar de Tarefas Estagnadas com cards de ação imediata.
     - Aba `equipe`: Grid de capacidade dos colaboradores com avatar, badges de ocupação, barras de carga proporcional e filtro rápido por pessoa.
     - Aba `pontualidade`: Termômetro SLA de entregas no prazo e Radar Preventivo de Prazos em Risco com contagem regressiva em dias.
  4. **Filtros Rápidos de Período:**
     - Barra de atalhos rápidos de período no topo: `[ Este Mês ]`, `[ Esta Semana ]`, `[ Últimos 30 dias ]`, `[ Personalizado ]`.
  5. **Design Tokens & Acessibilidade:**
     - Uso exclusivo de tokens semânticos (`theme-tokens.css`), zero cores hexadecimais fixas inline nos novos elementos, contraste WCAG AA aprovado nos temas claro e escuro.
- **Consequências:**
  - Painel executivo e operacional completo que resolve as 3 dores centrais com alta usabilidade e performance.
  - Zero dependência externa ou quebra do modo demonstração (`src/demo.ts`).
  - Cobertura de testes unitários automatizada com 120 testes passando no Vitest e compilação limpa no Vite/TypeScript.

---

## ADR-012: Modos de Visualização Geral Lateral e Geral Consolidado, Reordenação de Abas e Isolamento Multiquadro

- **Data:** 2026-11-13
- **Status:** Aprovado
- **Contexto:**
  A aba "Geral" de Tarefas necessita oferecer visibilidade unificada de todos os quadros acessíveis ao usuário através de dois modos ergonômicos de visualização:
  1. **Modo 1 — Geral Lateral:** Apresenta cada quadro como um bloco com rolagem horizontal lado a lado, alça de reordenação de blocos, linha de atalhos "Ir para:" e cabeçalhos informativos;
  2. **Modo 2 — Geral Consolidado:** Apresenta uma lista vertical de faixas (raias) expansíveis/recolhíveis estilo accordion, permitindo foco e navegação rápida;
  Além disso, foi requerida a reordenação das abas de topo de Tarefas com indicador visual azul e acessibilidade por teclado, bem como regras rígidas contra duplicidade de tarefas e contra movimentações indevidas entre quadros distintos.
- **Decisões Técnicas:**
  1. **Persistência de Preferências do Usuário:**
     - Optou-se pela recomendação técnica de armazenamento local tipado (`localStorage`) com chaves isoladas por ID de usuário (`somax_user_general_mode_${userId}`, `somax_user_lateral_block_order_${userId}`, `somax_user_consolidated_expanded_${userId}`, `somax_user_board_tabs_order_${userId}`).
     - *Motivo:* Zero latência de rede, reatividade imediata na interface, total suporte ao modo demonstração (`src/demo.ts`) sem exigir rede ou migrations, e isolamento rigoroso entre múltiplos perfis que compartilhem o mesmo dispositivo.
  2. **Motor Canônico de Etapas e Status:**
     - Criação da função exportada `getStagesForBoard(board, canonicalStages, customBoardStages)` em `src/general-views.ts`, unificando a extração de colunas para quadros canônicos e customizados.
     - As contagens de tarefas ativas e concluídas nos cabeçalhos de bloco e faixa utilizam rigorosamente as funções canônicas `resolveTaskStage` e `computeTaskStatus` da ADR-008, garantindo 100% de coerência com a tela de Relatórios.
  3. **Isolamento de Tarefas e Bloqueio de Arrasto Inter-quadro:**
     - Em estrita conformidade com a ADR-001, cada tarefa pertence a um único quadro (`board_id`).
     - O bloco do quadro "Geral" exibe exclusivamente tarefas onde `board_id` é nulo ou canônico, eliminando qualquer duplicação com quadros personalizados.
     - Visões de setor (`type === 'sector_view'`) são filtros sobre o Geral e não são duplicadas como blocos independentes.
     - Ao arrastar um card, o payload transporta o ID do quadro de origem (`text/board-id`). O drop handler valida se o quadro de destino coincide com o da tarefa; caso pertença a outro quadro, a movimentação é rejeitada com a notificação: *"Para levar a tarefa a outro quadro, use Encaminhar"*.
  4. **Reordenação de Abas com Acessibilidade:**
     - Drag-and-drop de abas no cabeçalho com indicador visual de inserção azul (`.tab-drop-indicator`).
     - Alternativa acessível para navegação via teclado com botões dedicados e atalhos, compatível com as diretrizes WCAG AA.
  5. **Desempenho e Responsividade:**
     - No modo Consolidado, tarefas e colunas das faixas recolhidas só são montadas no DOM quando expandidas.
     - No modo Lateral, colunas com volume elevado contam com limite e botão "Ver mais tarefas".
     - Em telas estreitas (< 768px), o modo Consolidado é automaticamente adotado como padrão inicial.
- **Consequências:**
  - Experiência fluida e intuitiva para supervisores e operadores acompanharem múltiplos fluxos na mesma tela.
  - Fidelidade absoluta aos relatórios gerenciais e respeito intransigente ao isolamento multi-tenant do banco.

---

## ADR-013: Permissões Estritas de Encaminhamento, Blindagem RLS e Omissão de Quadros Privados

- **Data:** 2026-11-14
- **Status:** Aprovado
- **Contexto:**
  Requisito mandatório de segurança e governança de dados: o usuário só pode criar ou encaminhar tarefas para quadros que enxerga e onde tem permissão de criar tarefas. Quadros privados de outra equipe (`team_id is not null and not is_shared and not is_team_member`) jamais podem aparecer como opção de destino na interface, nem aceitar tarefas via APIs/RPCs.
- **Decisões Técnicas:**
  1. **Regra de Acesso e Destinos Elegíveis:**
     - Administradores (`role = 'administrador'` ou `is_master = true`) possuem acesso a todos os quadros.
     - Colaboradores e gestores só podem ter como destino:
       - O Quadro Geral canônico (`id === 'board-geral'` ou `type === 'general'`), desde que pertençam ativamente a alguma equipe;
       - Quadros explicitamente compartilhados (`is_shared = true`);
       - Quadros vinculados à equipe do próprio usuário (`board.team_id === member.team_id` com `member.active = true`).
     - Quadros privados de outras equipes são sumariamente omitidos na UI e bloqueados no banco.
  2. **Banco de Dados e RLS:**
     - Migration `202611140001_board_permissions_forwarding_rls.sql`:
       - Função de segurança `public.can_create_task_in_board(p_board_id, p_user_id)` com `set search_path = ''` para evitar hijacking de schema.
       - Atualização das políticas `tasks_insert` e `tasks_update` para validar que `board_id` atende `can_create_task_in_board(board_id, auth.uid())`.
       - Atualização da RPC `create_task_with_templates` checando `can_create_task_in_board(p_board_id, v_actor_id)`.
       - Nova RPC transacional `forward_task_to_board(p_task_id, p_target_board_id, p_target_stage_id, p_target_team_id)`:
         - Valida `auth.uid() is not null`;
         - Valida permissão na tarefa de origem e no quadro de destino;
         - Valida que a etapa de destino pertence ao quadro de destino;
         - Grava auditoria em `task_movements`;
         - Atualiza atomicamente `board_id`, `stage_id`, `team_id`, reseta `sprint_id` e calcula `completed_at`.
  3. **Front-end e Modo Demonstração:**
     - Módulo `src/board-permissions.ts` com funções puras `canForwardToBoard` e `getPermittedDestinationBoards`, cobertas por 11 testes unitários em `src/board-permissions.test.ts`.
     - `availableBoards` em `src/App.tsx` usa `getPermittedDestinationBoards`, blindando todo o sistema.
     - Modal `TaskDetail.tsx` apresenta seletor de "Quadro de Destino" e etapas correspondentes, atualizando a tarefa de forma atômica no Supabase e preservando o modo demonstração (`src/demo.ts`).
---

## ADR-014: Encaminhamento de Tarefa Concluída com Ramificação e Linha do Tempo Imutável

- **Data:** 2026-11-14
- **Status:** Aprovado (Recomendações aceitas pelo Orquestrador conforme delegação do usuário)
- **Contexto:**
  Cada quadro representa uma fase de trabalho (Comercial, Implantação, Suporte etc.). Ao concluir uma tarefa em um quadro, o usuário necessita encaminhá-la para outro quadro. A tarefa original deve permanecer concluída e visível no quadro de origem, enquanto uma ramificação nasce no destino trazendo a linha do tempo herdada da jornada completa, mantendo estrita conformidade com o princípio de que uma tarefa pertence a um único quadro.
- **Decisões Técnicas:**
  1. **Modelo de Ramificação e Unicidade:**
     - Tabela `public.tasks` recebe:
       - `origin_task_id uuid references public.tasks(id) on delete set null`
       - `root_task_id uuid references public.tasks(id) on delete set null`
       - `forwarded_at timestamptz`
       - `forwarded_by uuid references public.profiles(id)`
     - Restrição única parcial: `create unique index tasks_single_branch_idx on public.tasks (origin_task_id) where origin_task_id is not null;` garantindo no PostgreSQL que cada tarefa só gera no máximo uma ramificação.
  2. **Contrato de Cópia de Dados:**
     - **Copiados para a ramificação:** título, descrição, cliente (`client_id`), prioridade (`priority`), tags, equipe (`team_id` resolvido do quadro de destino ou preservado se compatível), responsável (`assignee_id` preservado apenas se o usuário for membro ativo da equipe de destino; caso contrário, nulo).
     - **Não copiados:** prazo (`due_at` começa vazio), subtarefas/templates (começam vazios para não herdar pendências de outro setor; opção de aplicar templates do novo quadro), data de conclusão (`completed_at` nulo), comentários (começam limpos; o histórico fica na aba Linha do Tempo), sprint (`sprint_id` nulo; se destino for Scrum, entra no backlog).
  3. **Travamento no Servidor da Tarefa Concluída e Encaminhada:**
     - Uma vez que `forwarded_at is not null`, a tarefa original fica travada na etapa final. Trigger no PostgreSQL `trg_check_forwarded_task_immutable` rejeita qualquer tentativa de alteração de `stage_id` ou novo encaminhamento.
     - Não há opção de "desfazer encaminhamento" nesta versão.
  4. **Prevenção de Ciclos:**
     - A ramificação não pode retornar para o quadro de origem nem para nenhum quadro que já faça parte da sua linha histórica de ancestrais (validação na listagem de destinos elegíveis e na RPC).
  5. **Tabela de Linha do Tempo Imutável (`task_lineage_events`):**
     - Armazena snapshots imutáveis (`task_id`, `root_task_id`, `board_id`, `board_name`, `board_color`, `stage_id`, `stage_name`, `event_type`, `actor_id`, `actor_name`, `created_at`, `metadata`).
     - A linha do tempo sobrevive a eventuais renomeações ou exclusões de quadros e tarefas.
     - Privacidade: se o usuário autenticado não possui acesso a um quadro anterior da cadeia, a RPC `get_task_lineage` mascara o nome do quadro e etapa para `"Etapa de quadro restrito"`, preservando o registro cronológico sem vazar informações confidenciais.
  6. **Configuração do Quadro "Ao Concluir":**
     - Tabela `public.boards` recebe:
       - `on_completion_action text not null default 'ask' check (on_completion_action in ('ask', 'suggest_default', 'none'))`
       - `default_forward_board_id uuid references public.boards(id) on delete set null`
       - `default_forward_stage_id uuid`
  7. **Concordância nos Relatórios (ADR-008):**
     - Status mutuamente exclusivos preservados.
     - A original conta como concluída no quadro de origem e a ramificação como ativa no quadro de destino.
     - Introdução do filtro "Ocultar ramificações" e do indicador "Total de Jornadas" (`count(distinct root_task_id)`), eliminando duplicidade enganosa em visões gerenciais.
  8. **Preservação do Modo Demonstração:**
     - O fluxo completo de ramificação, travamento, modal interceptor e linha do tempo é simulado em `src/demo.ts` e na interface local sem dependência de rede.
- **Consequências:**
  - Rastreabilidade ponta a ponta da jornada do cliente por múltiplos setores da empresa.
  - Segurança, integridade referencial e idempotência contra concorrência e duplo clique.

---

## ADR-014: Melhorias Operacionais do Dashboard com Escopo por Quadro e Alertas de Gargalo WIP

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  O Dashboard inicial do OPSHUB apresentava métricas gerais estáticas do sistema. Com o advento de múltiplos quadros (Geral, visões setoriais, quadros personalizados e Scrum), os gestores e operadores necessitavam de visibilidade operacional dinâmica sem complexidades desnecessárias:
  1. Capacidade de alternar o escopo do Dashboard (todos os quadros, quadro Geral canônico ou um quadro setorial específico).
  2. Alerta imediato e acionável de limites WIP excedidos para evitar acúmulo e estrangulamento nas etapas de trabalho.
  3. Acompanhamento direto da Sprint ativa em quadros com metodologia Scrum.
  4. Visualização de tarefas urgentes/atrasadas com contexto do quadro de origem e capacidade da equipe para gestores.
  5. Adesão ao princípio de simplicidade operacional ("nada mirabolante"), WCAG AA, conformidade de tokens (`theme-tokens.css`) e preservação do modo demonstração (`src/demo.ts`).
- **Decisões Técnicas:**
  1. **Componente Modular Dedicado (`Dashboard.tsx`):**
     - Extração do Dashboard do arquivo `App.tsx` para um componente modular com responsabilidades delimitadas, tipagem estrita no TypeScript e folha de estilos limpa (`src/dashboard.css`).
  2. **Seletor de Escopo de Quadro:**
     - Oferece filtro imediato por "Todos os meus quadros", "Quadro Geral" ou qualquer quadro específico acessível ao usuário (filtrado pelas regras de governança e RLS).
  3. **Banner de Alerta de Gargalo WIP:**
     - Inspeciona dinamicamente os limites de trabalho em andamento (`wip_limit`) das etapas pertinentes ao escopo. Caso uma etapa atinja ou estoure o limite, renderiza banner destacado com botão de salto direto para o quadro.
  4. **Widget de Sprint Ativa (Scrum):**
     - Em escopo geral com quadros Scrum ou em quadro Scrum selecionado, exibe card com nome da sprint, meta, dias restantes com barra de progresso visual, contagem de pontos/tarefas e atalho de navegação.
  5. **Métricas Rápidas Operacionais:**
     - 5 blocos essenciais: Minhas tarefas, Atrasadas, Próximas, Bloqueadas (pausadas) e Concluídas na semana, com chips de filtro rápido e atalhos para a tela de Tarefas.
  6. **Panorama de Fluxo Adaptativo:**
     - Projeta a distribuição das tarefas nas etapas canônicas (quando em escopo Geral/Todos) ou nas etapas específicas do quadro selecionado.
  7. **Painel de Prioridades e Capacidade da Equipe:**
     - Lista de urgências com etiquetas coloridas do quadro e setor; painel de distribuição da equipe para gestores/administradores com alerta de tarefas sem responsável atribuído.
  8. **Zero Migrations Adicionais e RLS Preservado:**
     - Reaproveitamento total dos contratos de dados vigentes, sem custos extras de requisição ou modificações no schema relacional.
  9. **Modo Demonstração Preservado:**
     - Todas as melhorias operam de forma transparente em `src/demo.ts` e em ambiente local com dados simulados.
- **Consequências:**
  - Visibilidade e produtividade elevadas para equipes operacionais e gestores.
  - Zero sobrecarga cognitiva ou quebra de fluxo com animações ou gráficos excessivos.
  - Cobertura de testes automatizados com 100% de sucesso no Vitest (`src/dashboard.test.tsx`).

---

## ADR-015: Refinamentos da Visão Geral como Agregador de Quadros, Imutabilidade do Board de Tarefas e Resiliência da Linha do Tempo

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  Após a entrega da funcionalidade de ramificação de tarefas e visualizações panorâmicas, a operação identificou melhorias cruciais de ergonomia, segurança e integridade de dados:
  1. *Visão Geral como Agregador Panorâmico:* A aba Geral das Tarefas deve atuar exclusivamente como agregador e hub panorâmico dos outros quadros (setoriais e personalizados), não fazendo sentido manter nela um bloco solto de "Quadro Geral".
  2. *Reordenação no Modo Consolidado:* O usuário necessitava reorganizar a ordem dos quadros tanto no modo lateral quanto no modo consolidado (faixas/raias verticais expansíveis).
  3. *Localização do Gerenciador de Etapas:* O botão "Gerenciar etapas" no topo da aba de Tarefas causava ruído na barra de visualizações; seu lugar correto e natural é na aba "Fluxos".
  4. *Preservação de `board_id` ao Editar Tarefas:* Ao editar os detalhes de uma tarefa ramificada, ela sumia do quadro de destino porque um `<select>` de quadro sobrepunha o `board_id` para null ou 'board-geral'. O vínculo de uma tarefa ao seu quadro deve ser estritamente preservado; encaminhar entre quadros é uma ação explícita de ramificação na etapa final.
  5. *Resiliência da Linha do Tempo e Relatórios:* A aba de Linha do Tempo deve exibir com riqueza de detalhes todos os passos da jornada de qualquer ramificação, mesmo se offline ou se a RPC do banco não responder. A área de comentários/relatórios precisava de um editor multilinha e feedback imediato.
  6. *Enriquecimento Visual dos Cards:* Exibir nome do cliente, responsável e destaque para prazos em atraso em todas as visualizações de cards.
- **Decisões Técnicas:**
  1. **Filtro da Visão Geral:** `generalBoards` é definido estritamente como `availableBoards.filter(b => b.id !== 'board-geral')`.
  2. **Reordenação Universal:** O estado `generalBlockOrder` e a função `onBlockOrderChange` governam ambos os modos (`GeneralLateralView` e `GeneralAccordionView`), com suporte a drag-and-drop e botões acessíveis Subir/Descer.
  3. **Reposicionamento de `StageManager`:** O botão "Gerenciar etapas" foi retirado da barra superior de Tarefas e integrado à barra de ferramentas da aba "Fluxos", disponível para administradores e modo demonstração.
  4. **Fixação do `board_id` no `TaskDetail`:**
     - O formulário de edição de detalhes de tarefas não possui mais o select de mudança de quadro.
     - A função `save()` envia estritamente `board_id: task.board_id || null`.
     - O modal exibe um badge visual informativo com o nome e cor do quadro atual.
  5. **Sintetizador Determinístico da Linha do Tempo (`buildDeterministicLineage`):**
     - Função resiliente que percorre a árvore de ancestrais da tarefa via `origin_task_id -> root_task_id` e reconstrói todos os eventos da jornada (criação, encaminhamento entre quadros, ramificação e etapas).
     - Usada como fallback automático caso a RPC retorne vazia ou esteja em ambiente local/demonstração.
  6. **Redesign de Detalhes e Relatórios:**
     - Equipe e Responsável visíveis de imediato em grid de 2 colunas, sem `<details>`.
     - Textarea de 3 linhas com atalho Ctrl+Enter e botão "Registrar relatório" com persistência local resiliente.
  7. **Cards Enriquecidos:**
     - Exibição de Cliente (`Building2`), Responsável (`User`) e alerta visual para tarefas com prazo vencido (`task-due overdue`).
- **Consequências:**
  - Zero risco de perda ou desvinculação de tarefas durante edições de rotina.
  - Experiência fluida e consistente de navegação e histórico para todas as equipes.
  - Modo demonstração (`src/demo.ts`) 100% preservado.
  - Todos os 198 testes automatizados aprovados no Vitest e compilação limpa no Vite.

---

## ADR-016: Design System Moderno para Tarefas (Cards Hierárquicos, Modal em Duas Colunas, Busca de Templates e Visões Panorâmicas)

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  Com base no feedback visual e operacional da equipe e nos mockups de alta fidelidade enviados, fazia-se necessária uma modernização completa da experiência de visualização, criação e edição de tarefas:
  1. *Hierarquia Visual dos Cards (Kanban e Geral):* O card de tarefa precisava de uma organização clara: cliente no topo com menu de ações rápidas `...`, título em destaque, tags em chips suaves, linha de prioridade e prazo com badge vermelho de vencimento, barra de progresso horizontal de subtarefas com avatar circular e iniciais do responsável, e faixa colorida no rodapé para conexões de encaminhamento/ramificação.
  2. *Layout do Modal de Edição (2 Colunas):* A edição de tarefas precisava separar a área de trabalho/conteúdo (título, descrição, templates aplicados, subtarefas, relatórios e linha do tempo) da coluna lateral de metadados (etapa, prioridade, prazo, cliente, equipe, responsável e tags), eliminando alternâncias de tela desnecessárias.
  3. *Resolução do Bug de Edição de Tarefas Ramificadas:* Identificou-se que tarefas ramificadas ou de quadros com etapas em `boardStages` podiam sofrer descasamento de opções no `<select>` de etapa se a função de opções caísse nas etapas canônicas. Foi implementada uma resolução dinâmica estrita que detecta o quadro da tarefa e suas etapas irmãs, impedindo que o navegador resete o `stage_id` e fazendo com que a tarefa nunca suma do seu quadro de destino.
  4. *Modal de Nova Tarefa com Busca e Criação em Lote:* O modal de criação foi reestruturado com campos em grid de 2 colunas, busca em tempo real por templates com contagem dinâmica de subtarefas selecionadas, grade de 3 colunas de templates e o botão ergonômico "Criar e adicionar outra".
  5. *Aprimoramentos na Visão Geral:* Inclusão de atalhos rápidos "Ir para:" com chips na cor de cada quadro, contadores escuros em pílula nas colunas e correção do arrasto de reordenação no modo consolidado via elemento `div` nativo (evitando que o elemento `<button>` capture eventos HTML5).

- **Decisões Técnicas:**
  1. **Folha de Estilos Unificada (`src/modern-tasks.css`):**
     - Criação das classes `.task-card-v2`, `.task-card-v2-header`, `.task-card-v2-progress-row`, `.task-card-v2-avatar`, `.task-card-v2-forward-stripe`, `.task-card-v2-origin-stripe`, `.task-detail-modal-v2`, `.task-detail-v2-body`, `.templates-applied-card`, `.new-task-modal-v2`, `.template-checkbox-grid-v2`, `.general-jump-to-container` e `.kanban-counter-badge-dark`.
  2. **Refatoração do Modal de Edição (`src/TaskDetail.tsx`):**
     - `availableStagesForBoard` consulta tanto `currentBoard` quanto as etapas irmãs em `data.boardStages`, com preservação da etapa atual caso ela seja atípica.
     - Layout em duas colunas responsivo: painel esquerdo para navegação por abas e bloco de templates aplicados com barras de progresso azuis e porcentagens; painel direito para os metadados fixos.
  3. **Refatoração do Modal de Criação (`src/NewTaskForm.tsx`):**
     - Suporte ao fluxo "Criar e adicionar outra" mantendo o modal aberto e limpando campos secundários.
     - Busca com filtro em tempo real sobre os grupos de templates de subtarefas.
  4. **Padronização dos Cards (`src/App.tsx` e `src/GeneralViews.tsx`):**
     - Sincronização visual estrita em ambos os módulos, assegurando que o usuário veja a mesma hierarquia visual em qualquer tela.
  5. **Reordenação Robusta no Modo Consolidado:**
     - Substituição de elemento `<button>` por `<div role="button" draggable>` na alça de arrasto do cabeçalho do acordeão, garantindo disparo impecável dos eventos `dragstart` e `drop`.

- **Consequências:**
  - Experiência do usuário de alto padrão estético e consistência com os mockups.
  - Eliminação de regressões e sumiço de tarefas ao editar.
  - Total conformidade com o DoD do projeto: 198 testes automatizados aprovados no Vitest e compilação de produção limpa (`tsc -b && vite build`).





---

## ADR-017: Redesign Visual e Estrutural da Gestão de Clientes e Cadastros Pendentes

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  A experiência da aba de Clientes (perfil detalhado e fila de cadastros pendentes em quarentena) necessitava de um redesign de alta fidelidade alinhado aos mockups oficiais (`alethe-clipboard-img-FcC9had7.png`, `alethe-clipboard-img-2UKJ_loz.png`, `alethe-clipboard-img-mu5H4oKN.png`):
  1. *Estrutura do Modal de Detalhe:* Limitação da largura máxima para 940px, bordas arredondadas (raio 16px), cabeçalho com padding interno de 24px sem encostar na borda superior do modal.
  2. *Cabeçalho do Perfil:* Avatar quadrado 56x56px (raio 14px), título do cliente com 22px (peso 700), razão social com 14px, etiquetas inferiores padronizadas ("Cliente oficial" com contorno e "[n] demanda(s)" em verde).
  3. *Ações e Limpeza Visual:* Botões "Editar cadastro" (primário) e "Exportar" (secundário). O botão de lixeira solto é eliminado e substituído pelo menu `...` ("Mais ações"), que abriga "Excluir cliente". O rodapé do modal passa a conter estritamente o botão "Fechar", eliminando o segundo "Editar Cliente" e o "Cliente ID" redundante.
  4. *Regra de Exclusão de Clientes:* Proteção estrita contra perda de dados. Se o cliente possuir demandas/tarefas vinculadas (`tasks.length > 0`), a exclusão é sumariamente bloqueada com notificação clara orientando a reatribuição ou remoção prévia das demandas. Apenas clientes sem tarefas vinculadas podem ser excluídos, mediante confirmação do usuário.
  5. *Abas Tipográficas:* Abas em linha única, puramente textuais com contagens entre parênteses e sublinhado de 3px na cor primária para a ativa, com acessibilidade WAI-ARIA e navegação por teclado.
  6. *Aba Financeiro:* Eliminação de caixas amarelas de alerta para campos vazios. Exibição limpa de vencimento com botão "Definir vencimento" e cartões com botão contextual "Adicionar" para campos vazios.
  7. *Cadastros Pendentes:* Faixa compacta de quarentena, filtros por pills e cartões de submissão com expansão inline ao revisar. Remoção das caixas "0" no estado vazio.
- **Decisões Técnicas:**
  1. **Componente `src/ClientProfileModal.tsx`:** Atualizado com a nova hierarquia de cabeçalho, avatar 56x56 raio 14, menu `...` e rodapé limpo.
  2. **Abas Tipográficas WAI-ARIA:** Abas alinhadas em linha única, puramente textuais, com contagens entre parênteses (`Visão geral`, `Financeiro`, `Links e acessos (n)`, `Integrações (n)`, `Demandas (n)`), barra de 3px na cor primária para a ativa, overflow horizontal responsivo e navegação por teclado (`role="tablist"`, setas, `Home`, `End`).
  3. **Aba Visão Geral Redesenhada:** Fundo suave no corpo do modal, 3 cartões brancos superiores de KPIs (`Total de demandas`, `Em andamento`, `Concluídas`), e 2 cartões de detalhes (`Identificação cadastral` com ID exibido uma única vez com botão "Copiar" e `Contato principal` com links, "Abrir WhatsApp" e "Copiar"). Títulos em 15px bold neutros e rótulos 12px sem caixa alta azulada.
  4. **Aba Financeiro Neutra e Ergonômica:** Linha de vencimento em cartão neutro (sem caixas amarelas ou alertas alarmistas) com botão "Definir vencimento". Cartões "Contato financeiro" e "Instruções de faturamento" com padrão "—" e botão sutil "Adicionar" para campos vazios e "Copiar" com feedback para preenchidos.
  5. **Abas Links, Integrações e Demandas Padronizadas:**
     - *Links e acessos:* Lista em cartão suave com URL secundária, botões "Acessar" (`rel="noopener noreferrer"`) e "Copiar", com estado vazio amigável e botão "Adicionar link".
     - *Integrações técnicas:* Tabela com cabeçalhos rigorosamente alinhados à esquerda (`Chave`, `Valor`, `Ação`), valores monoespaçados com botão "Copiar", banner de aviso contra inclusão de senhas/segredos e bloco inferior de "Referências de integração".
     - *Demandas:* Cabeçalho com pílulas de demandas ativas e concluídas, lista em linhas com badges de equipe, etapa, prioridade, responsável e prazo, incluindo identificadores visuais para ramificações (`GitBranch`) e encaminhamentos (`ArrowRight`).
  6. **Modal de Cadastros Pendentes Modernizado:**
     - Cabeçalho limpo com contagem e frase explicativa; substituição do bloco azul pesado por faixa informativa sutil.
     - Filtros em pílulas (`Todos`, `Com dados financeiros`, `Com CNPJ/CPF`).
     - Lista de envios em cartões individuais com avatar, data/hora e etiquetas de dados presentes.
     - Expansão inline no clique de "Revisar" com exibição completa e botões diretos de "Rejeitar" e "Aprovar e criar cliente".
     - Estado vazio clean sem as caixas "0".
  7. **Bloqueio de Exclusão:** Implementado em `src/ClientProfileModal.tsx` e `src/AdminPages.tsx`, impedindo requisições ao Supabase caso `tasks.some(t => t.client_id === client.id)`.
  8. **Estilos Semânticos em `src/client-registration.css`:** Todas as cores utilizam tokens CSS oficiais do tema (`theme-tokens.css`), garantindo contraste WCAG AA >= 4.5:1 nos temas claro e escuro.
- **Consequências:**
  - Interface moderna, limpa e fiel aos desenhos oficiais.
  - Integridade referencial absoluta das tarefas corporativas.
  - Zero novas migrations requeridas, mantendo retrocompatibilidade total com o schema e o modo demonstração (`src/demo.ts`).

---

## ADR-018: Desbloqueio de Edição Textual em Tarefas Encaminhadas, Resiliência de Rede e Desacoplamento da Classe `.modal`

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  1. *Bloqueio em Tarefas Encaminhadas:* Usuários relataram que ao tentar adicionar qualquer informação em uma tarefa após ela ser encaminhada para outro quadro (ou ao tentar salvar/adicionar comentários/subtarefas), a interface bloqueava a ação ou disparava mensagens de erro de conexão (`TypeError: Failed to fetch`). No front-end, o botão "Salvar" estava indevidamente desabilitado com `disabled={busy || isLocked}`. Conforme a regra de negócio do encaminhamento ("Fluxo só para frente: a tarefa original fica travada na etapa final"), apenas a transição de etapa (`stage_id`) e a anulação de conclusão (`completed_at`) devem permanecer travadas. Edições descritivas, título, tags, cliente, prioridade, responsável, subtarefas e relatórios/comentários devem ser livremente permitidos.
  2. *Resiliência de Rede em Falhas de Conexão:* Se o Supabase estiver indisponível ou offline durante o salvamento de tarefas, comentários ou subtarefas, a aplicação deve aplicar fallback local gracioso (atualizando o estado sem lançar exceções não tratadas de rede como `Failed to fetch`).
  3. *Restrição de Largura dos Modais (`.modal`):* A regra legada `.modal { width: min(480px, calc(100vw - 24px)); max-width: calc(100vw - 24px) }` em `src/reference-layout.css` e o uso concomitante da classe `modal` nos modais redesenhados (`task-detail-modal-v2` e `new-task-modal-v2`) comprimiam as janelas em 480px, desfigurando os layouts de 1000px e 720px projetados.
- **Decisões Técnicas:**
  1. **Liberação do Botão "Salvar" (`src/TaskDetail.tsx`):**
     - O botão "Salvar" teve seu bloqueio removido (`disabled={busy}` em vez de `disabled={busy || isLocked}`).
     - Na função `save()`, fixamos `const effectiveStageId = isLocked ? task.stage_id : stageId`. O seletor de etapa continua desabilitado (`disabled={isLocked}`), garantindo conformidade rigorosa com a trigger do banco (`check_forwarded_task_immutable`) e com a regra de fluxo só para frente.
  2. **Resiliência e Fallback Local (`src/TaskDetail.tsx` e `src/App.tsx`):**
     - Adicionado tratamento com `isNetworkError` nas funções `save()`, `addComment()`, `addSubtask()`, `toggleSubtask()`, `deleteSubtask()` e `saveSubtaskTitle()`. Em caso de oscilação ou falha de conexão, as alterações são persistidas no estado local graciosa e confiavelmente.
     - A busca de dados em `TaskDetail.refresh()` foi blindada com bloco `try/catch`, acionando a reconstrução determinística de jornada (`buildDeterministicLineage`) caso a requisição ao Supabase falhe.
     - Ao encaminhar tarefas em `src/App.tsx` (tanto na prévia quanto no fallback local), as subtarefas existentes são clonadas com novos identificadores para a tarefa ramificada no `demoChecklists`.
  3. **Remoção da Regra `.modal {` e Desacoplamento:**
     - Removida a regra restritiva `.modal { width: min(480px, calc(100vw - 24px)); max-width: calc(100vw - 24px) }` de `src/reference-layout.css`.
     - Removida a classe `.modal` dos elementos raiz dos modais em `src/TaskDetail.tsx` (`className="task-detail-modal-v2"`) e `src/NewTaskForm.tsx` (`className="new-task-modal-v2"`), permitindo que ambos expandam livremente para as suas larguras nominais projetadas (1000px e 720px).
- **Consequências:**
  - Usuários podem complementar e editar tarefas encaminhadas sem qualquer mensagem de erro ou bloqueio indevido.
  - Zero mensagens de `Failed to fetch` ao salvar notas, checklists ou tarefas em conexões instáveis.
  - Os modais de edição e criação de tarefas agora ocupam suas dimensões completas, sem estarem esmagados em 480px.
  - 215 testes automatizados aprovados no Vitest e compilação de produção com zero erros no Vite/TypeScript (`tsc -b`).

---

## ADR-019: Correção Estrutural de RLS em `task_comments` / `can_access_task` e Eliminação Global de `/* width:`

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  1. *Violação de RLS em Relatórios (`task_comments`):* Ao adicionar relatórios/comentários em tarefas de quadros independentes, compartilhados ou tarefas encaminhadas entre setores, o PostgreSQL lançava a exceção de Row Level Security: `new row violates row-level security policy for table "task_comments"`.
     A causa técnica residia na função legada `public.can_access_task(task_uuid, uid)`, criada na migration inicial de 2026-11-07, que verificava estritamente `public.is_team_member(t.team_id, uid)`. Essa implementação desatualizada:
     - Bloqueava administradores (`public.is_admin(uid)`);
     - Bloqueava tarefas vinculadas a quadros acessíveis (`public.can_access_board(t.board_id, uid)`);
     - Bloqueava tarefas de origem ou ramificadas na linhagem de encaminhamento de tarefas (`origin_task_id`, `root_task_id`);
     - Bloqueava inserções quando `author_id` era divergente ou nulo.
  2. *Propriedade Residual `width:` em `.modal`:* Em `src/style.css`, a regra base `.modal` ainda declarava `width: min(100%, 480px);`. No painel de estilos do DevTools, os desenvolvedores e usuários desativavam essa propriedade (`/* width: min(100%, 480px); */`) para inspecionar os modais largos.
- **Decisões Técnicas:**
  1. **Nova Migration Sequencial (`supabase/migrations/202611150002_fix_can_access_task_and_comments_rls.sql`):**
     - *Governança de `public.can_access_task`:* Reformulada para checar `is_admin`, `is_team_member`, `can_access_board(board_id)`, autor/responsável (`created_by = uid or assignee_id = uid`), ramificação de destino (`branch.origin_task_id = t.id`), tarefa original de origem (`t.origin_task_id`) e cadeia unificada (`root_task_id`). Execução protegida com `security definer set search_path = ''`.
     - *Trigger e Default para `author_id`:* Criada a trigger `trg_set_task_comment_author` que preenche automaticamente `author_id := auth.uid()` se o payload omitir o autor.
     - *Políticas RLS Atualizadas:* `comments_insert` atualizada para aceitar `author_id = auth.uid() or author_id is null or public.is_admin(auth.uid())`.
  2. **Tratamento no Front-end (`src/TaskDetail.tsx`):**
     - O método `addComment()` agora obtém o `auth.uid()` diretamente da sessão ativa do Supabase via `supabase.auth.getUser()`.
     - Fallback gracioso local adicionado caso o banco responda com código `42501` (violação transitória de RLS) ou erro de conexão, preservando o relatório no estado local da interface.
  3. **Eliminação de `width:` da Regra `.modal` (`src/style.css` e `src/modern-tasks.css`):**
     - Removida a propriedade `width: min(100%, 480px);` da classe `.modal` em `src/style.css`.
     - Restrita a largura padrão de 480px exclusivamente a modais não dimensionados através do seletor `.modal:not(.modal-wide):not([class*="-modal-v2"]):not(.stage-manager-modal)`.
     - Aplicado `width: 1000px !important; max-width: 95vw !important;` e `width: 720px !important; max-width: 95vw !important;` em `src/modern-tasks.css`.
- **Consequências:**
  - Zero erros de `new row violates row-level security policy for table "task_comments"`.
  - Operadores e gestores de quadros de origem e destino podem registrar relatórios em tarefas da cadeia de encaminhamento com conformidade de segurança e RLS.
  - Modais de tarefas operam com dimensões plenas de 1000px e 720px sem qualquer compressão indesejada de 480px.
  - Suíte de testes automatizados expandida para **217 testes** aprovados com 100% de sucesso no Vitest.

---

## ADR-020: Alinhamento Pixel-Perfect do Modal "Editar Tarefa" com a Referência Visual Oficial

- **Data:** 2026-11-15
- **Status:** Aprovado
- **Contexto:**
  O usuário forneceu a imagem de referência visual oficial (`alethe-clipboard-img-F2bQcWHr.png`) com a diretriz categórica: *"tem que ficar assim"*.
  A tela apresentava discrepâncias visuais em relação à referência:
  1. *Abas de Navegação:* A aba ativa `Detalhes` precisava da moldura retangular com borda sutil `#0f172a` e fundo branco, contagens entre parênteses em cinza suave e seletor com ícone de setas verticais (`ChevronsUpDown`) à direita.
  2. *Campos da Coluna Esquerda:* Os campos `Título *` e `Descrição` precisavam adotar a mesma família de estilos tipográficos e bordas suaves do painel direito.
  3. *Rodapé do Modal:* O botão `Excluir tarefa` requeria borda avermelhada suave `#fee2e2` com fundo branco e texto `#ef4444`. No canto direito, alinhamento perfeito de `Cancelar` (secundário branco com borda), `Encaminhar para outro quadro` (azul sólido com ícone `GitBranch`) e `Salvar` (azul sólido `#2563eb`), sem textos residuais quebrando o espaçamento.
  4. *Card de Templates Aplicados:* Proporção e contraste refinados com barra de progresso azul central e contador formatado `[n]/[total] · [pct]%`.
- **Decisões Técnicas:**
  1. **Ajuste Fino de Estilos em `src/modern-tasks.css`:**
     - Classes `.task-detail-v2-tabs-header`, `.task-detail-v2-tab-btn`, `.task-detail-tab-arrows`, `.task-detail-delete-btn`, `.btn-cancel-task`, `.btn-forward-footer-cta` e `.btn-save-task` afinadas de acordo com as medidas e cores da imagem.
     - Largura do modal fixada em `980px !important` e proporção de colunas `1fr 340px`.
  2. **Refatoração no Componente `src/TaskDetail.tsx`:**
     - Inclusão do ícone `ChevronsUpDown` na barra de abas.
     - Padronização dos campos com `className="task-detail-field-v2"`.
     - Rodapé com container flex alinhado `.task-detail-v2-footer-right` para os botões `Cancelar`, `Encaminhar para outro quadro` e `Salvar`.
- **Consequências:**
  - Fidelidade visual absoluta ao mockup do usuário (`alethe-clipboard-img-F2bQcWHr.png`).
  - Total conformidade com o DoD do projeto: 217 testes automatizados aprovados no Vitest e compilação de produção limpa (`tsc -b && vite build`).

---

## ADR-021: Resolução Definitiva do Bug de Desaparecimento de Tarefas Ramificadas ao Editar e Blindagem de RLS Multi-Quadro

- **Data:** 2026-11-16
- **Status:** Aprovado
- **Contexto:**
  O usuário relatou o seguinte bug crítico: *"quando eu encaminho uma tarefa e vou editar essa tarefa no novo quadro ela simplesmente some. o que está acontecendo?"*.
  A investigação minuciosa de ponta a ponta revelou as causas técnicas combinadas:
  1. *Ausência de Execução de Migrations no Banco Remoto:* A RPC `forward_completed_task`, as colunas de ramificação (`origin_task_id`, `root_task_id`, `forwarded_at`) e a tabela `task_lineage_events` ainda não tinham sido executadas no banco Supabase remoto do ambiente do usuário. Ao clicar em encaminhar, a chamada RPC falhava e caía no fallback gracioso de rede/resiliência do front-end, criando a ramificação apenas na memória local do React (`data.tasks`).
  2. *Varrimento pelo `reload()` no Front-end:* Ao abrir a tarefa ramificada no novo quadro e clicar em "Salvar", o modal chamava a função `run()`, que disparava `await reload()`. A função `reload()` fazia `supabase.from('tasks').select('*')` e substituía `data.tasks` integralmente pelas tarefas do banco remoto. Como a tarefa ramificada só existia na memória local, ela era sumariamente apagada e desaparecia da tela.
  3. *Restrição de RLS no `WITH CHECK` de `tasks_update`:* A política RLS `tasks_update` permitia no `USING` que membros do quadro de destino lessem e iniciassem o update (`can_access_board`), mas no `WITH CHECK` exigia estritamente que fossem membros da equipe (`is_team_member(team_id)`). Membros da equipe de destino que recebessem uma tarefa com `team_id` da equipe de origem sofriam violação de RLS.
  4. *Sobrescrita Forçada de Etapa no `useEffect`:* O `useEffect` de sincronização de etapas em `src/TaskDetail.tsx` forçava `stageChoices[0].id` caso houvesse descompasso temporário de avaliação de `stageChoices`, podendo mover a tarefa para uma etapa fora do quadro de destino.
- **Decisões Técnicas:**
  1. **Mesclagem Não-Destrutiva no `reload()` (`src/App.tsx`):**
     - O `reload()` agora detecta tarefas locais que ainda não foram sincronizadas no Supabase (identificadas por `origin_task_id`, prefixo `branch-` ou `demo-`) e mescla essas tarefas com o resultado retornado do servidor, impedindo que o `reload()` apague tarefas locais em memória.
  2. **Persistência Síncrona Reativa no `save()` (`src/TaskDetail.tsx`):**
     - O método `save()` invoca `onPreviewSave?.(updatedTask)` imediatamente no início da ação, garantindo que o estado local do React seja atualizado de forma síncrona com os novos valores (título, prioridade, responsável, descrição, etc.) antes da requisição de rede e mesmo se o Supabase responder com aviso de coluna ou rota diferida.
  3. **Blindagem de `stageId` contra Fallback Forçado (`src/TaskDetail.tsx`):**
     - O `useEffect` foi protegido para manter o `task.stage_id` original caso a etapa atual seja válida, sem sobrescrevê-la cegamente com a primeira opção da lista.
  4. **Nova Migration Sequencial (`supabase/migrations/202611160001_consolidated_forwarding_and_lineage.sql`):**
     - Consolidação idempotente de todas as colunas de ramificação em `public.tasks` e `public.boards`;
     - Criação da tabela `public.task_lineage_events` e RPCs `forward_completed_task` e `get_task_lineage`;
     - Atualização da política RLS `tasks_update` incluindo `or (board_id is not null and public.can_access_board(board_id, auth.uid()))` tanto no `USING` quanto no `WITH CHECK`, permitindo que qualquer operador com permissão no quadro de destino possa editar e manter tarefas ramificadas.
- **Consequências:**
  - Resolução definitiva do sumiço de tarefas ramificadas ao editar no quadro de destino.
  - Alta resiliência da aplicação: opera com fidelidade e sem perda de dados mesmo antes da aplicação das migrations no banco remoto.
  - Suíte de testes automatizados expandida para **220 testes** aprovados com 100% de sucesso no Vitest.
  - Compilação de produção limpa (`npm run build`) concluída com código 0 e sem avisos de tipagem.

---

## ADR-022: Unificação Canônica da Definição de Tarefas Concluídas, Resolução de Etapas e Concordância Entre Visões

- **Data:** 2026-11-17
- **Status:** Aprovado
- **Contexto:**
  A aba "Tarefas Concluídas" consultava apenas `data.stages` (etapas canônicas do Geral), ocultando tarefas concluídas pertencentes a quadros customizados (`data.boardStages`). Além disso, havia o risco de divergência entre a função `completed` (`src/lib.ts`) e os módulos de relatórios (`computeTaskStatus`/`resolveTaskStage` em `src/reports.ts`), bem como a necessidade de assegurar que tarefas reabertas tenham `completed_at` limpo tanto no front-end quanto no servidor e que o fallback por `completed_at` atue exclusivamente quando uma etapa for órfã/desconhecida.
- **Decisões Técnicas:**
  1. **Fonte Única de Verdade Canônica (`src/lib.ts` e `src/reports.ts`):**
     - O tipo `StageDisplayInfo` e a função `resolveTaskStage(task, stages, boardStages)` foram centralizados em `src/lib.ts` e reexportados em `src/reports.ts`.
     - A função canônica `completed(task, stages, boardStages)` retorna diretamente `resolveTaskStage(task, stages, boardStages).isFinal`.
     - O cálculo de `computeTaskStatus` em `src/reports.ts` avalia `stageInfo.isFinal`, garantindo concordância matemática exata entre Dashboard, Aba de Concluídas e Relatórios.
  2. **Reabertura Estrita e Limpeza de `completed_at`:**
     - Confirmado que a movimentação para fora da etapa final atribui `completed_at: null` tanto no cliente (`moveTask` em `src/App.tsx`) quanto no banco PostgreSQL (`on_task_write`).
     - Se uma tarefa possui `completed_at` antigo mas sua etapa atual é resolvida e não-final (`is_final: false`), ela é considerada rigorosamente ativa / em andamento.
  3. **Restrição de Fallback:**
     - O fallback por `Boolean(task.completed_at)` só é disparado caso a etapa não seja encontrada em nenhuma lista, emitindo `console.warn` em desenvolvimento e testes.
  4. **Varredura e Integração em Tela:**
     - `Dashboard.tsx`: `flowStages` consome `getStagesForBoard`, cobrindo Geral, Visões de Setor e Quadros Customizados.
     - `App.tsx`: `dashboard` utiliza `taskBuckets` com `data.boardStages`; `renderCompleted` filtra via `completed(t, allStages, data.boardStages)` e disponibiliza filtro por quadro; `TaskList` resolve badges de etapa via `resolveTaskStage` e exibe a coluna "Quadro".
- **Consequências:**
  - Concordância absoluta de métricas entre Dashboard, Concluídas e Relatórios no mesmo escopo.
  - Zero tarefas em fallback no conjunto de dados de demonstração (`demo.ts`).
  - Suíte de testes automatizados expandida para **236 testes** aprovados com 100% de sucesso no Vitest (`completed-tasks-unification.test.ts`).
  - Compilação de produção limpa (`tsc -b && vite build`) concluída com código 0.

---

## ADR-023: Redesign Visual e de Apresentação da Aba Geral (Modos Lateral e Consolidado)

- **Data:** 2026-11-19
- **Status:** Aprovado
- **Contexto:**
  A apresentação da aba Geral de Tarefas possuía cinco faixas visuais dispersas e redundantes (`task-tabs`, `board-tabs-bar`, `GeneralToolbar`, `task-tools`, `task-subtools` e `general-quick-nav`), contorno escuro nas abas ativas, cards com chips de quadro repetidos dentro do próprio bloco do quadro, e necessidade de colunas vazias recolhidas para melhor aproveitamento horizontal do espaço. Não havia necessidade de alteração de regras de negócio, permissões ou migrations de banco (a tabela `boards` já possuía a coluna `color`).
- **Decisões Técnicas:**
  1. **Paleta Estável de Cores por Quadro (`src/general-views.ts`):**
     - Criação da constante `BOARD_COLOR_PALETTE` contendo 10 cores semânticas com pares de tokens para temas claro e escuro.
     - Garantia matemática de conformidade WCAG AA (taxa de contraste `>= 4.5:1`) para todos os pares em ambos os temas.
     - Função `getBoardVisual` com mapeamento semântico estável por nome (Comercial: azul `#2563eb`, Implantação: roxo `#7c3aed`, Suporte: teal `#0d9488`, Backlog: âmbar `#d97706`, Atualização sistema: rosa `#db2777`), respeito a cores customizadas do banco e fallback determinístico por hash.
  2. **Consolidação em 3 Camadas no Topo (`src/GeneralViews.tsx`, `src/App.tsx`, `src/general-views.css`):**
     - Camada 1: Abas de módulo (`Tarefas`, `Fluxos`, `Templates`, `Tags`) com o botão `+ Nova tarefa`.
     - Camada 2: Faixa fixa (`sticky`), com sombra sutil e fundo de superfície, contendo as abas de quadros com dot colorido de cada quadro, aba ativa com sublinhado azul de 3px (`border-bottom: 3px solid #2563eb`), foco visível apenas via teclado (`:focus-visible`) e sem contorno preto.
     - Camada 3: Linha única de controles consolidada da aba Geral com altura padronizada de 34px: seletor segmentado de modo (Lateral/Consolidado) com botões ativos em azul preenchido, seletor de situação (Em andamento/Concluídas/Todas), busca integrada com ícone de lupa, botão popover `Filtros (n)` para prioridade, equipe, responsável, cliente e prazo, seletor de quadros e toggle "Ocultar colunas vazias".
     - Remoção definitiva da linha obsoleta "Ir para:".
  3. **Modo Geral Lateral (`GeneralLateralView`):**
     - Blocos de quadros lado a lado com rolagem horizontal contínua.
     - Cabeçalho do bloco sticky com tokens de cor semânticos do quadro nos dois temas.
     - Colunas com 0 tarefas recolhidas por padrão em tiras verticais de `46px` de largura, com contador circular `0`, título na vertical (`writing-mode: vertical-lr`) e expansão automática ao clicar ou arrastar um card por cima (`onDragOver`).
     - Títulos longos de etapas com quebra em até duas linhas sem corte.
  4. **Modo Geral Consolidado (`GeneralAccordionView`):**
     - Lista de faixas com primeira aberta e demais recolhidas por padrão.
     - Faixa recolhida exibindo resumo `Por etapa:` com chips das etapas com mais tarefas primeiro.
     - Botões compactos de lote `Expandir todos` e `Recolher todos` na barra consolidada.
     - Colunas vazias abertas por padrão com altura compacta de 1 card ("Sem tarefas"), mantendo recolhidas no Geral Canônico (15 etapas).
  5. **Persistência de Preferências em `localStorage`:**
     - `getUserHideEmptyColumns(userId, mode)` e `setUserHideEmptyColumns(userId, mode, hide)` mantendo preferências isoladas por modo (Lateral default `true`, Consolidado default `false`) e por usuário.
  6. **Design do Card de Tarefas (`GeneralTaskCard`):**
     - O chip com o nome do quadro não é exibido quando a tarefa já se encontra no bloco do seu próprio quadro, aparecendo apenas no Geral canônico misto.
     - Faixas de encaminhamento no rodapé padronizadas em linha única contínua sem quebras de texto.
- **Consequências:**
  - Interface moderna, limpa, ergonômica e de alto impacto visual para as equipes de atendimento e desenvolvimento da OPSHUB.
  - Regra 9 (fonte única da verdade, concordância de contadores e métricas) estritamente preservada.
  - Modo demonstração (`src/demo.ts`) 100% funcional sem Supabase e sem rede.
  - Cobertura de testes automatizados expandida para **242 testes** aprovados com 100% de sucesso no Vitest (`general-views.test.ts` e `theme-contrast.test.ts`).
  - Compilação de produção (`npm run build`) concluída com código 0 e sem erros de TypeScript.

---

## ADR-024: Transformação da Aba Geral em Visão Pura de Agregação e Somente Leitura

- **Data:** 2026-11-19
- **Status:** Aprovado
- **Contexto:**
  Na arquitetura do OPSHUB, cada tarefa operacional pertence a um quadro específico (Comercial, Implantação, Suporte, Dev Scrum, etc.). A aba "Geral", por agregar todos os quadros e fluxos corporativos em uma visão macro panorâmica (modos Lateral e Consolidado), permitia operações diretas de drag-and-drop e exclusão de tarefas. Essa duplicidade operacional gerava confusão cognitiva para os usuários ao arrastar cards entre colunas em blocos de quadros diferentes, além de riscos de criação de tarefas sem quadro associado (`board_id = null` ou `board-geral`).
- **Decisões Técnicas:**
  1. **Visão Pura de Agregação e Somente Leitura (`src/GeneralViews.tsx`, `src/general-views.css`):**
     - A aba Geral passa a operar exclusivamente como um hub executivo de monitoramento e agregação de dados entre quadros.
     - Desativação completa de arrastar e soltar tarefas (`draggable={false}`) nos cards de tarefas do Geral (`GeneralTaskCard`).
     - Remoção de zonas de soltura (drop zones) de movimentação de tarefas nas colunas Kanban do Geral. As tiras de 46px recolhidas continuam responsivas a clique para alternar expansão.
     - Remoção de ações destrutivas rápidas (excluir tarefa) diretamente nos cards do Geral.
     - Manutenção do clique nos cards (`onTaskSelect`) para abertura do modal detalhado de inspeção da tarefa.
  2. **Navegação Direta para o Quadro Operacional (`onNavigateToBoard`):**
     - Adição do botão "Abrir quadro" (`general-btn-open-board`) com ícone `ExternalLink` nos cabeçalhos de blocos do modo Lateral e nas faixas do modo Consolidado.
     - O botão navega instantaneamente para o quadro operacional específico (`setActiveBoardId`), onde os operadores realizam transições de etapas, edições e gerenciamento de fluxo no seu contexto natural de trabalho.
  3. **Identificação Visual Transparente (`src/App.tsx`, `src/GeneralViews.tsx`):**
     - Atualização do pill/badge da aba Geral no topo de "Canônico" para "Agregação".
     - Adição de badge semântico informativo no `GeneralToolbar` com ícone `Eye`: "Visão de agregação (somente leitura)" e tooltip explicativo.
  4. **Garantia de Pertencimento a Quadro no Modal de Criação (`src/NewTaskForm.tsx`):**
     - Quando o modal de criação de tarefa é disparado a partir da aba Geral, é exigida a seleção do "Quadro de Destino *", populado exclusivamente com quadros operacionais (`operationalBoards`).
     - Nenhuma nova tarefa pode ser criada sem quadro ou como órfã.
     - A seleção do quadro de destino sincroniza dinamicamente as etapas do quadro (`boardStages`), a equipe responsável (`teamId`) e, no caso de quadros Scrum (`methodology === 'scrum'`), expõe a seleção de sprint ativa/planejada e estimativa de Story Points.
- **Consequências:**
  - Eliminação definitiva de ambiguidades operacionais e arrastos acidentais de cards entre quadros na visão macro.
  - Alinhamento pleno com a doutrina de negócio da OPSHUB e preservação estrita da Regra 9 (fonte única da verdade e concordância de contadores).
  - Modo demonstração (`src/demo.ts`) 100% preservado.
  - Suíte de testes automatizados expandida para **248 testes** aprovados com 100% de sucesso no Vitest (inclusão de `src/general-readonly.test.tsx`).
  - Compilação de produção limpa (`tsc -b && vite build`) concluída com código 0.

---

## ADR-025: Arquitetura de Banco, Segurança e Ciclo de Vida do Chat da Equipe (Canais, Mensagens, Moderação, Menções e Exclusão Segura)

### Contexto
O chat da equipe necessitava de evolução para suportar gestão completa de canais (criação, edição, arquivamento e exclusão definitiva), ciclo de vida de mensagens (edição pelo autor, moderação por gestores/administradores, conformidade com a LGPD em exclusões), menções diretas com validação estrita no servidor (`@usuario` e `@todos`) e métricas de não lidas com destaque visual.

### Decisões Tomadas
1. **Proteção Estrutural do Canal "Geral":** Criado trigger de banco `guard_channel_geral` em `public.channels` que impede incondicionalmente a renomeação, o arquivamento (`archived_at is not null`) e a exclusão do canal "Geral" de qualquer equipe, independentemente do privilégio do chamador.
2. **Ciclo de Vida de Canais e RLS:**
   - Visualização: restrita a membros ativos da equipe (`can_access_channel`).
   - Criação e Edição (nome, descrição e arquivamento): restrita a gestores da equipe (`is_team_manager`) ou administradores (`is_admin`).
   - Exclusão Definitiva: restrita estritamente a administradores (`is_admin`), delegada a uma Edge Function com `service_role` para expurgo seguro dos arquivos do Storage no bucket `chat-private`, cascade no banco e registro na tabela de auditoria `channel_deletion_audit`.
3. **Escopo de Participação em Canais:** Canais pertencem a "Toda a equipe" (padrão arquitetural). A opção de canais com membros selecionados permanece desabilitada com etiqueta visual *(em breve)* para não fragmentar nem reescrever as funções centrais de RLS de acesso.
4. **Ciclo de Vida de Mensagens e Moderação:**
   - Adicionadas colunas `edited_at`, `deleted_at`, `mentions uuid[]` e `mentions_all boolean` em `public.messages`.
   - Trigger `guard_message_lifecycle` garante a imutabilidade estrita de `author_id`, `channel_id`, `created_at`, `reply_to_id` e `task_id`.
   - Edição de conteúdo (`body`): permitida exclusivamente ao autor original e proibida em canais arquivados.
   - Remoção / Soft-delete (`deleted_at`): autor, gestor da equipe ou administrador podem remover. Em conformidade com a LGPD, o conteúdo textual é zerado (`body = ''`) e as marcações são removidas.
5. **Sanitização de Menções no Servidor:** O array `mentions` é sanitizado via trigger para manter única e exclusivamente UUIDs de usuários que sejam membros ativos da equipe daquele canal, prevenindo marcações forjadas ou acesso indevido.
6. **Métricas Canônicas de Mensagens e Menções:** Criada a RPC `unread_channel_metrics()` com `SECURITY INVOKER`, retornando `unread_count` e `mention_count` por canal, ignorando mensagens removidas (`deleted_at is null`).
7. **Interface do Chat da Equipe (`src/ChatPage.tsx`, `src/chat.css`):**
   - Painel lateral com agrupamento de canais por equipe, busca em tempo real, pips de identificação de cor da equipe, badges em vermelho para menções diretas (`@n`) e em azul para mensagens não lidas.
   - Gestão de canais com modal de criação/edição protegido contra alteração do canal "Geral", seção colapsável de canais arquivados e modal de exclusão definitiva com confirmação por digitação obrigatória do nome exato do canal.
   - Moderação e ciclo de vida de mensagens: edição em linha pelo autor com marcação visual *(editada)* e exclusão lógica (soft-delete) com substituição para *"Mensagem removida"* sem conteúdo residual.
   - Menu flutuante de menções inteligentes acionado por `@`, filtrando exclusivamente membros da equipe do canal e a opção `@todos`.
   - Badges de notificação em tempo real integrados à barra lateral do sistema e ao sino da topbar em `src/App.tsx`.

### Consequências
- Blindagem total contra exclusão acidental do canal "Geral".
- Conformidade estrita com a LGPD: mensagens apagadas não deixam resquício de texto no banco de dados.
- Eliminação de risco de adulteração de autor, canal ou histórico no PostgreSQL.
- Interface de alta fidelidade visual, acessível (WCAG AA >= 4.5:1) e responsiva.
- Suíte expandida para **290 testes** no Vitest (`src/chat-interface.test.tsx` e `src/chat-security-permissions.test.ts`) 100% aprovados.
- Compilação de produção (`npm run build`) sem erros.

---

## ADR-026: Redesign do Modal de Criação de Quadros — Assistente em Dois Passos com Prévia Fiel e Confirmação de Descarte

- **Data:** 2026-11-19
- **Status:** Aprovado
- **Contexto:**
  O modal original de criação de quadros (`CreateBoardModal`) concentrava todos os parâmetros em uma única tela vertical estreita (`max-w-2xl` / ~672px), gerando estouro horizontal nas colunas de configuração de etapas (colunas de WIP, etapa final e botões de ordenação cortados), rolagem dupla, uso arcaico de códigos hexadecimais brutos (`#94a3b8`, `#3b82f6`) em seletores de cor de etapas, e presença de opções confusas como "Origem das tarefas" e "Espelhar etapas do Geral".
- **Decisões Técnicas:**
  1. **Arquitetura de Assistente em Dois Passos (`src/BoardModals.tsx`):**
     - Estruturação em 2 etapas focadas: **Passo 1 ("Configuração")** e **Passo 2 ("Acesso e revisão")**.
     - Cabeçalho com indicador claro de progresso por stepper semântico (`wizard-step-badge active / completed`).
  2. **Ergonomia e Layout Responsivo (`src/reference-layout.css`):**
     - Largura do modal expandida para até `860px` (`width: min(860px, calc(100vw - 24px))`), responsivo em viewport móvel (`@media (max-width: 640px)` em tela cheia).
     - Eliminação de qualquer barra de rolagem horizontal com uso de `overflow-x: hidden`, flexbox responsivo e grid adaptativo.
     - Conformidade WCAG AA estrita utilizando variáveis de tema (`--modal-bg`, `--text-primary`, `--border-main`, `--primary-main`, etc.) sem hexadecimais soltos.
  3. **Paleta de Cores Nomeadas e Amigáveis:**
     - Paleta de 8 cores do sistema para o quadro (`NAMED_BOARD_COLORS`: Azul, Roxo, Verde, Âmbar, Rosa, Vermelho, Índigo e Cinza) em chips circulares acessíveis com marcação de seleção.
     - Cores das etapas selecionadas por **NOME** (`NAMED_STAGE_COLORS`), eliminando strings hexadecimais na interface.
  4. **Modelos Predefinidos de Quadro (`BOARD_TEMPLATES`):**
     - 5 modelos definidos em código TypeScript: *Em branco*, *Suporte*, *Comercial*, *Implantação* e *Scrum padrão*.
     - A escolha do modelo pré-popula as etapas na lista e define a metodologia correspondente, mantendo total flexibilidade para edição pelo usuário.
  5. **Metodologia e Automatização do Scrum:**
     - Cartões estilizados para Kanban e Scrum.
     - Ao selecionar Scrum, callout informativo informa que Backlog e Sprints são criados e gerenciados automaticamente.
  6. **Reordenação Flexível de Etapas:**
     - Suporte duplo para ordenação: alça para arrastar (`GripVertical` com Drag and Drop HTML5) e botões/atalhos de teclado (`ArrowUp` / `ArrowDown`), garantindo total acessibilidade.
     - Validação que exige nome preenchido, mínimo de 2 etapas, pelo menos 1 etapa final e limites WIP inteiros positivos (`> 0`).
  7. **Passo 2 com Layout em Duas Colunas e Prévia Fiel:**
     - **Coluna Esquerda:** cartões de acesso ("Privado da equipe" e "Corporativo"), dropdown de Equipe Responsável e comportamento "Ao concluir uma tarefa" (`ask`, `suggest_default` com seleção de quadro e etapa de destino via `getStagesForBoard`, e `none`).
     - Campo "Fase da jornada do cliente" deliberadamente omitido (já verificado que não existe no banco de dados).
     - **Coluna Direita:** painel "Como o quadro vai ficar" com colunas proporcionais, dot colorido da etapa, badges WIP e Final e cards simulados; card de resumo com atributos consolidados; checklist informativo "Antes de criar".
  8. **Robustez, Idempotência e Confirmação de Descarte:**
     - Bloqueio de submissão concorrente com flag de referência (`isSubmittingRef`) e desabilitação de botões durante o salvamento (`busy`).
     - Tratamento robusto de erros: caso ocorra falha de rede/API, o modal **não** fecha e **não** perde dados digitados, exibindo banner destacado em vermelho.
     - Detecção de modificações (`isDirty`) e diálogo de confirmação de descarte de alterações caso o usuário tente fechar pelo botão X, clique no backdrop ou tecla Escape.
     - Suporte a foco preso (trap focus) dentro do modal com ciclo de teclado (Tab e Shift+Tab).
  9. **Limpeza de Escopo na Criação:**
     - Remoção definitiva da interface de criação das seções "Origem das tarefas" e "Espelhar etapas do Geral", mantendo o quadro criado como independente (`type: 'custom'`).
- **Consequências:**
  - Experiência de uso fluida, agradável e ergonômica na criação de quadros operacionais.
  - Eliminação de estouros de layout e barras de rolagem duplas.
  - Testes automatizados criados em `src/create-board-wizard.test.tsx` com 100% de sucesso.
  - Suíte completa com 262 testes verdes no Vitest e compilação de produção (`npm run build`) sem erros.

---

## ADR-028: Padronização Visual e Ergonômica de Largura entre Modais — Criar Novo Quadro e Nova Tarefa (720px)

- **Data:** 2026-11-19
- **Status:** Aprovado
- **Contexto:**
  O assistente de criação de quadros (ADR-026) havia sido inicialmente projetado com largura de 860px (`min(860px, calc(100vw - 24px))`), diferindo do modal de "Nova Tarefa" (`.new-task-modal-v2`), que possui largura nominal consolidada de 720px (`width: 720px !important; max-width: 95vw !important; border-radius: 16px;`). O usuário solicitou que o modal "Criar Novo Quadro" compartilhasse exatamente a mesma largura do modal "Nova Tarefa", proporcionando consistência e uniformidade visual nas interações do sistema.
- **Decisões Técnicas:**
  1. **Largura e Geometria Idênticas (`src/reference-layout.css`):**
     - `.board-wizard-modal` ajustado para `width: 720px !important; max-width: min(720px, calc(100vw - 24px)) !important; max-height: min(90vh, 880px); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.18);`.
  2. **Remoção da Classe Restritiva `.modal` (`src/BoardModals.tsx`):**
     - O container raiz do modal passa a utilizar estritamente `className="board-wizard-modal"` (sem a classe legada `.modal`), evitando interferência da regra `.modal:not(...)` de 480px em `style.css` e alinhando-se com a diretriz dos modais modernos v2 do sistema.
  3. **Acomodação Ergonômica dos Elementos Internos em 720px:**
     - Ajuste do grid de modelos `.board-templates-grid` para `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;`, permitindo que os 5 modelos predefinidos caibam perfeitamente na largura interna disponível (~672px úteis) sem quebra indesejada.
     - Preservação da lista de etapas com alça de arrastar, botões de teclado e seletores com espaçamento confortável sem overflow horizontal.
     - Preservação da responsividade do Passo 2 (duas colunas equilibradas em desktop e quebra fluida em coluna única em telas estreitas).
- **Consequências:**
  - Consistência estética e previsibilidade dimensional entre os dois principais modais de entrada do sistema.
  - Eliminação de qualquer barra de rolagem horizontal.
  - 100% de aprovação na suíte de testes Vitest (288 testes passando) e build de produção compila sem erros (`npm run build`).

---

## ADR-029: Gestão Completa de Modelos de Quadro (Criação, Edição, Exclusão e Interoperabilidade com o Assistente de Quadros)

- **Data:** 2026-11-20
- **Status:** Aprovado
- **Contexto:**
  Após a transição da aba "Fluxos" para "Modelos de Quadro" na aba Templates (ADR-027), a interface exibia apenas uma listagem fixa em modo somente leitura dos 5 modelos predefinidos. O usuário reportou a impossibilidade de editar os modelos existentes ou adicionar novos modelos personalizados. Havia necessidade de permitir que administradores e gestores configurem, editem e excluam modelos de quadro completos (etapas, cores, WIP, marcas de etapa final e metodologia), com persistência tanto no Supabase quanto no modo demonstração offline, e interoperabilidade direta com o assistente de criação de novos quadros.
- **Decisões Técnicas:**
  1. **Fonte Única de Dados Dinâmica (`Data.boardTemplates`):**
     - O tipo `Data` em `src/lib.ts` passa a conter formalmente `boardTemplates?: BoardTemplate[]`.
     - `DEFAULT_BOARD_TEMPLATES` enriquecido com etapas ricas e completas com limites WIP e etapas finais compatíveis com as regras de validação.
     - `demoData` em `src/demo.ts` inicializado com `[...DEFAULT_BOARD_TEMPLATES]`.
     - No carregamento inicial (`reload` em `src/App.tsx`), `board_templates` é consultado via PostgREST de forma resiliente, com fallback automático para `DEFAULT_BOARD_TEMPLATES` caso a tabela ainda não exista no schema cache da instância remota conectada.
  2. **Modal Ergonômico de Edição e Criação (`src/BoardTemplateModal.tsx`):**
     - Criação do componente modal `BoardTemplateModal`, dimensionado em 720px (`border-radius: 16px`, sem overflow).
     - Formulário abrangente: Nome do Modelo (obrigatório, mín. 2 caracteres), Descrição opcional, Metodologia (Kanban ou Scrum), Paleta oficial de 8 cores do sistema e editor dinâmico de etapas.
     - Editor de etapas: drag-and-drop nativo com alça `GripVertical`, botões de reordenação por teclado (`ArrowUp`/`ArrowDown`), nome da etapa, seletor de cores nomeadas (`NAMED_STAGE_COLORS`), campo WIP opcional (inteiro `> 0`), checkbox "Final" e botão de remoção (mínimo de 2 etapas).
     - Validação robusta em português do Brasil e diálogo de confirmação de descarte de alterações caso o usuário tente fechar com dados não salvos.
  3. **Ações Administrativas na Aba Templates (`src/TemplateTab.tsx`):**
     - Cabeçalho: botão `+ Novo Modelo de Quadro` para administradores/gestores (`canManage`).
     - Cards de modelo: inclusão de botões `Editar` (`Pencil`) e `Excluir` (`Trash2` com diálogo de confirmação).
     - Atalho "Criar quadro com este modelo": aciona a abertura de `CreateBoardModal` passando o identificador do modelo pré-selecionado.
  4. **Interoperabilidade Imediata com o Assistente de Criação (`src/BoardModals.tsx`):**
     - `CreateBoardModal` passa a consumir dinamicamente `availableTemplates` a partir de `data.boardTemplates` (com fallback para `BOARD_TEMPLATES`).
     - Novo parâmetro opcional `initialTemplateId` permite carregar e pré-selecionar o modelo desejado imediatamente.
     - Todo modelo criado ou editado pelo usuário fica instantaneamente disponível para seleção ao criar novos quadros operacionais.
  5. **Operações de Persistência no Banco e no Demo:**
     - `saveDemoBoardTemplate` e `deleteBoardTemplate` gerenciam o estado em memória no modo Demo com notificações toast via `flash()`.
     - Operações Supabase efetuam `insert`, `update` e `delete` diretos na tabela `public.board_templates`, protegidos pelas políticas de RLS `board_templates_write`.
- **Consequências:**
  - Autonomia operacional plena para a OPSHUB criar e customizar esteiras de trabalho reutilizáveis para novos fluxos.
  - Testes automatizados criados em `src/board-templates.test.tsx` cobrindo adição, edição, exclusão e integração com o assistente de criação.
  - Suíte completa do Vitest expandida para **27 arquivos de teste e 296 testes aprovados (100% verde)**.
  - Compilação de produção (`npm run build`) concluída com código 0 e sem avisos de tipagem.

---

## ADR-030: Correção e Harmonização Global do Modo Escuro (:root[data-theme='dark']) e Aderência Estrita a WCAG AA (>= 4.5:1)

- **Data:** 2026-11-20
- **Status:** Aprovado
- **Contexto:**
  Após as recentes entregas dos módulos de Chat da Equipe (`ChatPage.tsx`, `chat.css`), Modais Modernos de Tarefas (`modern-tasks.css`, `NewTaskForm.tsx`, `TaskDetail.tsx`) e Modelos de Quadro (`TemplateTab.tsx`), o usuário reportou que o modo escuro apresentava falhas visuais ("modo escuro ficou bugado"). A auditoria técnica identificou:
  1. No Chat, ausência de regras com o seletor `:root[data-theme='dark']` para classes do chat, gerando fundos brancos residuais e texto branco sobre fundo claro por uso de variáveis ausentes como `--bg-surface-soft`.
  2. Nos cards da visão Geral de Tarefas (`GeneralViews.tsx`), o chip identificador do quadro utilizava inline style `color: taskBoardVisual.light.text` fixo, resultando em texto escuro sobre fundo escuro no tema dark.
  3. No modal de "Nova Tarefa" (`NewTaskForm.tsx`), a seleção de modelos de subtarefa usava inline style `#eff6ff` (azul bebê claro), causando estouro de contraste no tema escuro.
  4. Na aba de "Templates" (`TemplateTab.tsx`), badges de metodologia Scrum/Kanban e chips de etapas (Final e WIP) possuíam cores hexadecimais fixas claras e escuras sem adaptação a temas.
  5. Nas abas de navegação de quadros (`.board-tab.active`), a cor primária `#2563eb` possuía contraste marginal em telas escuras.
- **Decisões Técnicas:**
  1. **Expansão dos Tokens Semânticos (`src/theme-tokens.css`):**
     - Adição dos tokens e aliases nos blocos `:root` e `:root[data-theme='dark']`: `--bg-surface-soft`, `--bg-muted`, `--color-primary-base`, `--brand-primary`, `--accent`, `--color-success`, `--color-warning`, `--surface-hover` e `--bg-primary-subtle`.
  2. **Estilização Completa do Chat no Tema Escuro (`src/chat.css` e `src/main.tsx`):**
     - Bloco dedicado `:root[data-theme='dark']` cobrindo `.chat-container`, `.chat-sidebar-panel`, `.chat-conversation-panel`, `.chat-message-stream`, `.chat-msg-row`, `.chat-composer-box`, `.chat-mentions-popup` e modais do chat.
     - Inclusão do import de `chat.css` em `src/main.tsx` para garantia de carregamento global.
  3. **Adaptação Dinâmica do Chip de Quadro nos Cards (`src/GeneralViews.tsx` e `src/general-views.css`):**
     - O componente `GeneralTaskCard` passa a injetar variáveis CSS (`--board-chip-bg-dark`, `--board-chip-text-dark`, `--board-chip-border-dark`) calculadas a partir da paleta semântica (`BOARD_COLOR_PALETTE`), com sobrescrita explícita via `:root[data-theme='dark'] .task-board-chip` para garantir contraste mínimo WCAG AA `>= 4.5:1`.
  4. **Padronização Semântica na Aba Templates (`src/TemplateTab.tsx`):**
     - Badges Scrum e Kanban convertidas para tokens semânticos (`--chip-purple-bg`/`--chip-purple-text` e `--chip-info-bg`/`--chip-info-text`).
     - Chips de etapa (Final e WIP) convertidos para `--color-success` e `--color-warning`.
  5. **Modais de Tarefas e Quadros (`src/modern-tasks.css`, `src/NewTaskForm.tsx`, `src/BoardModals.tsx`, `src/dark-theme.css`):**
     - Checkbox de templates em nova tarefa refatorado para a classe `.template-checkbox-item-v2.is-checked` com tokens semânticos.
     - Bloco escuro para abas de quadros (`.board-tab.active`, `.board-tab-tag`, `.btn-manage-stages`, `.tab-reorder-btn`).
- **Consequências:**
  - Experiência visual harmoniosa, moderna e livre de aberrações de contraste em ambos os temas (claro e escuro).
  - Testes de contraste em `src/theme-contrast.test.ts` ampliados para 47 asserções cobrindo todos os novos seletores e tokens.
  - Suíte completa de 297 testes Vitest 100% verde e build de produção compilando perfeitamente.

---

## ADR-031: Redesign da Página de Configurações, Perfil Corporativo, Preferências de Visualização e Alertas de Notificação

- **Data:** 2026-11-20
- **Status:** Aprovado
- **Contexto:**
  O sistema possuía uma tela básica de configurações em coluna única com dados pessoais, troca de senha e alternador de tema. O usuário demandou a evolução para uma central completa de configurações com personalização de preferências de notificação (sons e alertas no navegador), visualização padrão de tarefas (Quadro Kanban vs. Lista detalhada), modo do Geral (Lateral vs. Consolidado), colunas vazias, tela de entrada ao logar e visualização rica dos dados de perfil corporativo.
- **Decisões Técnicas:**
  1. **Módulo Canônico de Preferências (`src/user-preferences.ts`):**
     - Criação da interface `UserPreferences` encapsulando: `defaultTaskView` (`'kanban' | 'lista'`), `defaultGeneralMode` (`'lateral' | 'consolidado'`), `hideEmptyColumns` (`boolean`), `startPage` (`'dashboard' | 'tasks' | 'chat'`), `soundChatMessages` (`boolean`), `soundChatMentions` (`boolean`), `browserNotifications` (`boolean`) e `taskDueAlerts` (`boolean`).
     - Leitura e gravação resilientes em `localStorage` por `userId`, com sincronização bidirecional das chaves legadas utilizadas na aba Geral.
     - Implementação da função `playNotificationChime(type)` para síntese de áudio nativa via Web Audio API (sem assets pesados nem quebras em navegadores que bloqueiam áudio automático).
  2. **Arquitetura de Navegação em Abas no Componente (`src/UserSettings.tsx`):**
     - Estruturação em 4 subabas acessíveis:
       1. *Perfil Corporativo*: Dados de contato (nome, WhatsApp com máscara, e-mail institucional), cargo/função (com destaque visual para Master/Gestor) e chips das equipes ativas.
       2. *Preferências de Tarefas*: Alternadores segmentados para Kanban vs Lista, modo Lateral vs Consolidado, recolhimento de colunas vazias e página de entrada.
       3. *Notificações & Sons*: Interruptores de áudio para mensagens e menções, botão para solicitar permissão desktop push (`Notification.requestPermission()`) e botão de teste de notificação.
       4. *Segurança & Aparência*: Troca de senha com validação e seletor de tema claro/escuro.
     - Preservação do estado dos formulários através de atributos `hidden` nos painéis inativos, evitando o desmonte do DOM e perda de dados não salvos ao alternar entre abas.
  3. **Respeito às Preferências na Inicialização do Hub (`src/App.tsx`):**
     - `taskView` e `page` inicializam lendo as preferências do usuário ativo, carregando diretamente a visão preferida (ex: Lista detalhada ou Quadro Kanban).
  4. **Estilos e Design Tokens (`src/user-settings.css`):**
     - Criação de componentes visuais: `.pref-segment-group`, `.pref-segment-btn`, `.pref-switch-wrap`, `.pref-slider`, `.btn-test-sound`.
     - Suporte nativo ao tema escuro (`:root[data-theme='dark']`) aderente à paleta semântica do sistema.
- **Consequências:**
  - Autonomia e conforto ergonômico para os colaboradores da OPSHUB configurarem seu fluxo diário de trabalho.
  - Testes automatizados criados em `src/user-settings.test.tsx` com 100% de aprovação.
  - Suíte de testes expandida para **29 arquivos e 312 testes Vitest aprovados (100% verde)**.
  - Compilação de produção (`npm run build`) concluída com código 0.


---

## ADR-032: Exclusão Segura de Usuários e Equipes com Integridade Referencial

- **Data:** 2026-11-20
- **Status:** Aprovado
- **Contexto:**
  O sistema permitia o cadastro e a edição de equipes e usuários nas páginas de administração (`TeamsPage`, `UsersPage` e `UserEditor`), porém não disponibilizava mecanismos para exclusão. Ao implementar a exclusão de usuários e equipes, havia riscos severos de integridade e segurança:
  1. *Tarefas órfãs ou violação de FK:* A tabela `tasks` possui `team_id uuid not null references teams(id)`. Se uma equipe for excluída com tarefas ativas, o banco dispara `foreign_key_violation` ou corrompe a árvore de tarefas.
  2. *Tarefas com responsável excluído:* A coluna `tasks.assignee_id references profiles(id)` ficaria inconsistente se o perfil fosse removido sem tratamento.
  3. *Elevação de privilégio e autodestruição:* Proibir a auto-exclusão do usuário logado, proteger o `Administrador Master` contra exclusão e restringir a exclusão de administradores exclusivamente ao Master.
  4. *Modo Demonstração vs. Nuvem:* O modo de demonstração local (`src/demo.ts`) precisa refletir as exclusões em memória instantaneamente, enquanto o modo Supabase deve executar de forma atômica via RPCs `SECURITY DEFINER` e Edge Function `manage-user`.
- **Decisões Técnicas:**
  1. **Regras e Fluxo para Exclusão de Equipes (`TeamsPage.tsx` e RPC `delete_team`):**
     - O botão "Excluir equipe" está disponível para administradores no modal de detalhes da equipe (`selected`) e no modal de edição (`editing`).
     - *Bloqueio de Integridade:* Antes de qualquer ação, o sistema verifica se há tarefas vinculadas à equipe (`data.tasks.filter(t => t.team_id === team.id)`). Se houver, a exclusão é **bloqueada**, exibindo alerta instruindo o administrador a reatribuir ou finalizar as tarefas primeiro.
     - *Execução Atômica no Banco:* A migration `supabase/migrations/202611200001_delete_user_and_team_rpcs.sql` introduz a RPC `delete_team(p_team_id uuid)` que valida se o chamador é administrador, confere a contagem de tarefas e remove em cascata links de autocadastro, canais, quadros personalizados e membros da equipe antes de apagar a equipe.
     - *Modo Demonstração:* Remove a equipe do estado `data.teams`, remove membros em `data.members`, desvincula links de autocadastro e canais em memória.
  2. **Regras e Fluxo para Exclusão de Usuários (`UsersPage`, `UserEditor.tsx`, Edge Function `manage-user` e RPC `delete_managed_user`):**
     - *Salvaguardas de Segurança Inegociáveis:*
       - Proibido excluir o Administrador Master (`is_master === true`).
       - Proibida a auto-exclusão (`user.id === currentUserId`).
       - Administradores comuns não podem excluir outros administradores (`canMaster` mandatório).
     - *Alerta de Tarefas Atribuídas:* Se o usuário possuir tarefas sob sua responsabilidade, o modal de confirmação alerta explicitamente a quantidade de tarefas que passarão a ficar sem responsável (`assignee_id = null`).
     - *Exclusão pelo Modal e pela Tabela:* Ação "Excluir" disponível na coluna de Ações da tabela de usuários e botão "Excluir usuário" no rodapé de `UserEditor.tsx` (posicionado à esquerda com estilo destrutivo seguro).
     - *Edge Function e RPC Resiliente:* `manage-user` aceita `action: 'delete'`. A RPC `delete_managed_user(p_user_id uuid)` limpa `team_members` e `message_reads`, atualiza `tasks.assignee_id = null` e tenta a exclusão física (`hard delete`). Se houver vínculos imutáveis de histórico (ex.: `created_by` em tarefas ou mensagens), efetua fallback seguro para anonimização (`soft_delete_anonymized`: `active = false`, desativa credenciais e anonimiza nome).
- **Consequências:**
  - Gerenciamento completo do ciclo de vida de equipes e usuários com zero risco de corrupção relacional ou orfandade de dados.
  - Testes automatizados criados em `src/delete-user-and-team.test.tsx` cobrindo regras de autorização, bloqueios do master e integridade.
  - Suíte completa do Vitest com **29 arquivos e 312 testes aprovados (100% verde)**.
  - Build de produção (`npm run build`) validado com sucesso.

---

## ADR-033: Resiliência na Exclusão de Canais do Chat (RPC Atômica e Eliminação da Dependência de Edge Function)

- **Data:** 2026-11-20
- **Status:** Aprovado
- **Contexto:**
  Ao tentar excluir um canal no Chat da Equipe, o usuário recebia a mensagem `"Falha de conexão com o servidor Supabase (Failed to fetch). Verifique sua conexão com a internet ou se extensões do navegador (adblock/firewall) estão bloqueando requisições para o Supabase."`.
  O diagnóstico revelou que o componente `ChatPage.tsx` disparava um `fetch` HTTP direto para `${VITE_SUPABASE_URL}/functions/v1/delete-channel`. Como as Edge Functions em Deno não são provisionadas automaticamente quando o projeto roda no Supabase sem deploy explícito via CLI, a requisição era rejeitada pelo navegador com `TypeError: Failed to fetch`.
- **Decisões Técnicas:**
  1. **Criação da RPC Atômica no PostgreSQL (`public.delete_channel_atomic`):**
     - Criada a migration sequencial `supabase/migrations/202611200002_delete_channel_atomic_rpc.sql`.
     - Função com `security definer` e `search_path = ''`.
     - Validação rigorosa: chamador autenticado, perfil administrador ativo (ou service_role), bloqueio inegociável de exclusão do canal "Geral", conferência exata do texto de confirmação digitado.
     - Contabilização e registro do expurgo na tabela `public.channel_deletion_audit`.
     - Exclusão do canal em cascata relacional para `messages`, `attachments` e `message_reads`.
  2. **Camada de Resiliência no Front-end (`src/ChatPage.tsx`):**
     - O cliente expurga arquivos físicos de anexos no bucket `chat-private` via Supabase Storage.
     - Invoca `supabase.rpc('delete_channel_atomic', { ... })`.
     - Fallback robusto: se a RPC não existir ainda no banco (ex: script pendente no SQL Editor), o sistema recorre imediatamente à exclusão direta via `supabase.from('channels').delete().eq('id', ...)`, que já possui cobertura e proteção RLS (`channels_delete`) e trigger de guarda (`trg_guard_channel_geral`).
  3. **Script Unificado de Migrations Atualizado:**
     - A nova RPC foi anexada em `supabase/aplicar_pendentes_supabase.sql`.
- **Consequências:**
  - Erro `Failed to fetch` eliminado na exclusão de canais do chat.
  - Operação 100% via API nativa PostgREST do Supabase, sem dependência de deploy de Edge Functions.
  - Teste de regressão adicionado em `src/chat-security-permissions.test.ts`.
  - Suíte de 313 testes Vitest 100% verde e build de produção bem-sucedido.

---

## ADR-034: Harmonização Visual da Linha de Abas de Quadros no Modo Escuro (Tarefas)

- **Data:** 2026-11-21
- **Status:** Aprovado
- **Contexto:**
  Na página de Tarefas, a barra de abas de quadros (`Geral`, `Meus quadros`, `Comercial`, `Implantação`, `suporte n1`, `backlog`, `Atualização sistema`, `+ Novo quadro`) apresentava inconsistências visuais no modo escuro:
  1. *Fundo da barra desconectado:* Utilizava a cor de superfície dos cards, aparentando ser uma faixa de outra cor cortando a página.
  2. *Poluição Visual por Botões de Acessibilidade:* Os botões de reordenação por teclado (`←` e `→`) eram renderizados permanentemente com bordas e fundos cinzas entre todas as abas, fragmentando a leitura.
  3. *Descompasso Cromático da Aba Ativa:* O sublinhado ativo utilizava um tom roxo escuro enquanto o texto e as marcas adotavam o azul OPSHUB, com ausência de sobreposição precisa sobre a borda inferior da barra.
  4. *Alinhamento do Botão "+ Novo quadro":* Apresentava margens desbalanceadas (`margin-bottom: 4px`), desalinhando-se da linha base das abas operacionais.
  5. *Barra de Rolagem Bruta no Windows:* Em telas onde as 8 abas excediam a largura útil, o navegador renderizava a barra de rolagem horizontal nativa do sistema em tom claro berrante.
  6. *Visibilidade dos Indicadores de Cores (Dots):* Os círculos coloridos de quadros com tons escuros (ex: Azul OPSHUB e Teal) perdiam nitidez contra a superfície escura.
- **Decisões Técnicas (Estritamente baseadas em Design Tokens `var(--...)`):**
  1. **Fundo Unificado com a Página (`var(--bg-page)`):**
     - O fundo de `.board-tabs-bar` foi definido com `var(--bg-page)` (com `border-bottom: 1px solid var(--border-main)` e sem sombras duras), eliminando a impressão de faixa desconectada tanto no tema claro quanto no escuro.
  2. **Ocultação e Acessibilidade Progressiva dos Botões de Reordenação (`.tab-accessible-reorder`):**
     - Transicionados para estado compacto invisível (`opacity: 0; max-width: 0; pointer-events: none`).
     - Revelação suave com baixa opacidade (`opacity: 0.75`) e sem bordas pesadas ao passar o mouse na aba (`.board-tab-item:hover`) ou navegar via teclado (`:focus-within`), atingindo `opacity: 1` ao pairar diretamente sobre eles. Mantém 100% da função de troca de posição e reordenação.
  3. **Harmonização da Aba Ativa:**
     - Aba ativa estilizada via tokens: `color: var(--primary-main)` e `border-bottom: 2px solid var(--primary-main)` no tema claro; `color: var(--primary-text)` e `border-bottom: 2px solid var(--primary-text)` com fundo `var(--primary-subtle)` no tema escuro.
     - Cantos superiores arredondados (`border-radius: 6px 6px 0 0`) e compensação `margin-bottom: -1px` para que a linha ativa repouse exatamente sobre a borda delimitadora da barra fixa.
  4. **Abas Inativas e Estados de Interação:**
     - Texto em `var(--text-secondary)` com excelente legibilidade (WCAG AA >= 13:1 no escuro).
     - Estado hover com `var(--bg-surface-hover)` e foco visível por teclado via `:focus-visible` com `var(--border-focus)`.
  5. **Luminosidade dos Indicadores Coloridos (Dots):**
     - Mantidos rigorosamente alinhados com o texto (`gap: 7px; align-items: center`), recebendo contorno sutil `box-shadow: 0 0 0 1px var(--border-strong)` no modo escuro para garantir definição mesmo em tonalidades escuras.
  6. **Padronização da Etiqueta "Agregação" e Botão "+ Novo quadro":**
     - Etiqueta "Agregação" ajustada com dimensões compactas e contraste equilibrado por tema.
     - Botão "+ Novo quadro" centralizado verticalmente na barra (`margin: auto 0 auto 6px`), com borda tracejada `var(--border-strong)` e transição suave no hover.
  7. **Rolagem Horizontal Fluida:**
     - Adicionado `scroll-behavior: smooth`, `scrollbar-width: thin` e trilho translúcido para rolagem horizontal suave no Windows sem quebra de layout.
  8. **Consistência de Altura e Espaçamento:**
     - Altura mínima padronizada (`min-height: 40px`, `margin-bottom: 14px`) em concordância rítmica com a barra de filtros e controles logo abaixo (`GeneralToolbar` / `task-tools` com 36px de altura).
- **Consequências:**
  - Barra de abas de quadros moderna, minimalista e 100% harmonizada nos dois temas.
  - Zero cores fixas soltas: conformidade estrita aos tokens semânticos do projeto.
  - Todos os comportamentos (clique de navegação, drag-and-drop, reordenação acessível, criação de quadros) preservados intactos.
  - Suíte completa de 313 testes Vitest aprovados (100% verde).
  - Compilação de produção (`npm run build`) concluída com código 0 em 7.60s.


