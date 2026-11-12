# Registro de Decisões de Arquitetura (ADR) — Somax Hub

Este documento registra as decisões estruturais, trade-offs e padrões técnicos adotados na evolução do Somax Hub, conforme as diretrizes do papel de **Arquiteto** em `AGENTS.md`.

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
  A Fase 1 foca exclusivamente no fluxo Kanban contínuo e na fidelidade ao design de referência do Somax Hub (sem introduzir Scrum nesta etapa). Era necessário estruturar a navegação por abas com ordem mandatória, transformar "Meus quadros" de pop-up para tela própria e padronizar paleta e dimensões de colunas e cards.
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

## ADR-011: Somax Analytics V3 — Evolução da Aba de Relatórios por Dores Operacionais (Pontualidade, Gargalos e Capacidade da Equipe)

- **Data:** 2026-11-12
- **Status:** Aprovado
- **Contexto:**
  A aba de relatórios original exibia filtros, métricas simples e uma lista extensa de tarefas, mas não respondia diretamente às principais dores da gestão operacional da Somax:
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

