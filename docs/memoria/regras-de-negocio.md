# Regras de negócio

Atualize sempre que uma regra mudar, com a data. `(a confirmar)` = ainda não verificado no código.

## Tarefas e relatórios
- Cada tarefa pertence a UM único quadro real operacional (`type === 'custom'`). Nenhuma tarefa pode pertencer ao Geral canônico ou ter `board_id` nulo (garantido por trigger no PostgreSQL). Tarefas legadas residem no quadro corporativo "Geral (legado)". Visões de setor foram descontinuadas (`is_active = false`) para evitar duplicidade de tarefas. (ADR-027, 2026-11-19)
- Aba Geral: opera exclusivamente como visão pura de agregação panorâmica de todos os quadros corporativos (modos Lateral e Consolidado). Cards não são arrastáveis (`draggable={false}`) e não possuem ações destrutivas diretas no Geral. Para transicionar etapas ou alterar fluxos, o usuário acessa o quadro operacional via botão 'Abrir quadro'. Toda nova tarefa criada a partir de qualquer lugar da aplicação exige seleção obrigatória em cascata: Quadro -> Etapa (carregada dinamicamente via `getStagesForBoard`), lembrando o último quadro por usuário em `localStorage`. (ADR-024, ADR-027, 2026-11-19)
- Modelos de Quadro: a aba separada "Fluxos" foi descontinuada. Modelos reutilizáveis de quadros (*Em branco*, *Suporte*, *Comercial*, *Implantação* e *Scrum padrão*, além de novos modelos customizados) são gerenciados de forma dinâmica na aba "Templates" (subaba Modelos de Quadro) com capacidade total de adição, edição e exclusão por gestores e administradores, integrados diretamente ao assistente de criação de novos quadros. (ADR-027, ADR-029, 2026-11-20)
- Status mutuamente exclusivos: em andamento, concluída, pausada e backlog; a soma é igual ao total. "Atrasada" é uma marca extra, não um status. (ADR-008)
- Atrasada: tarefa não concluída com prazo estritamente anterior a hoje, no fuso America/Fortaleza. Prazo de hoje NÃO é atrasada.
- Concluída: a etapa atual do quadro da tarefa é final (is_final). Etapas vêm de `getStagesForBoard`/`resolveTaskStage`.
- Backlog Scrum: tarefa sem sprint ou em sprint planejada. Uma sprint ativa por quadro.
- WIP é alerta visual (não bloqueia).

## Encaminhamento (ramificação)
- Ao concluir na etapa final, a tarefa pode ser encaminhada para outro quadro; a original continua concluída e fica TRAVADA.
- Uma única ramificação por tarefa; fluxo só para frente; sem voltar a quadros da própria linha (sem ciclos).
- A ramificação traz a linha do tempo da jornada.

## Clientes e projetos (a confirmar a implementação)
- Cada cliente é um projeto. Situação do cliente: Em negociação, Em implantação, Entregue, Pausado, Encerrado.
- Projeto ativo = cliente "Em implantação", até ser marcado "Entregue" (manual, com sugestões do sistema).
- Excluir cliente é bloqueado se houver demandas vinculadas.
- Cadastros enviados por link público ficam em quarentena e exigem aprovação humana.

## Perfis, Usuários e Equipes (2026-11-20, ADR-031)
- Perfis: Administrador (acesso global), Gestor (suas equipes e quadros) e Colaborador (equipes de que participa). Esconder algo por preferência não muda permissão.
- Preferências de Visualização e Notificações: armazenadas por usuário (`localStorage`), abrangendo visualização padrão de tarefas (Quadro Kanban vs. Lista detalhada), modo do Geral (Lateral vs. Consolidado), recolhimento de colunas vazias, tela de entrada ao autenticar (Dashboard, Tarefas ou Chat), e alertas sonoros e no navegador para mensagens e menções do Chat. A navegação no App inicializa respeitando essas preferências.
- Exclusão de Equipes: restrita a administradores. É estritamente BLOQUEADA se houver qualquer tarefa vinculada à equipe (`tasks.team_id`), exigindo que o gestor ou administrador reatribua ou finalize as tarefas antes da exclusão. A exclusão atômica (`delete_team`) remove vínculos de autocadastro, canais, quadros personalizados e membros da equipe.
- Exclusão de Usuários: restrita a administradores. Possui salvaguardas inegociáveis:
  1. O Administrador Master (`is_master === true`) JAMAIS pode ser excluído do sistema.
  2. Auto-exclusão é proibida (`user.id === currentUserId`).
  3. Administradores comuns não podem excluir outro administrador (permissão restrita ao Master).
  4. Tarefas sob responsabilidade do usuário têm `assignee_id` setado para `null` (desatribuídas) com aviso explícito de confirmação.
  5. Se houver dependências históricas imutáveis de FK (ex: autoria de tarefas ou mensagens arquivadas), a RPC efetua fallback automático de anonimização e inativação segura (`soft_delete_anonymized`), desativando o acesso sem violar a integridade referencial.

## Chat da equipe e canais (2026-11-19, ADR-025)
- Canais pertencem a uma equipe. O canal "Geral" é protegido no PostgreSQL contra renomeação, arquivamento e exclusão física.
- Gestão de canais: criar, editar nome/descrição e arquivar/restaurar são ações permitidas a administradores e gestores da equipe. Colaboradores apenas participam.
- Exclusão definitiva de canal: exclusiva de administradores com confirmação por digitação do nome, acionando Edge Function (`delete-channel`) com auditoria e expurgo de arquivos no bucket `chat-private`.
- Mensagens e Moderação: cada autor edita ou remove suas próprias mensagens. Administradores e gestores podem moderar/remover mensagens de terceiros. Mensagem editada exibe "(editada)".
- Conformidade LGPD em mensagens removidas: mensagem excluída vira "Mensagem removida", com `body` apagado no banco (`''`) e menções limpas.
- Menções com @: validadas e sanitizadas no servidor para admitir apenas membros ativos da equipe do canal; "@todos" notifica a equipe inteira do canal.
- Contadores e Notificações: função canônica `unread_channel_metrics()` calcula mensagens não lidas e menções diretas não lidas (`@n`).
