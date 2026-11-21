# Lições aprendidas

Cada entrada: data, o que aconteceu, causa e como evitar.

## 2026-11 — Dualidade do Geral e tarefas presas no limbo
Criar tarefas vinculadas ao "Geral" gerava inconsistência estrutural: apareciam em "Meus quadros", mas não no painel agregador do Geral, pois o Geral operava agregando outros quadros e não renderizava tarefas associadas a si próprio.
*Causa:* Ausência de separação clara de conceitos entre "Quadro Operacional" (onde tarefas vivem e transicionam) e "Visão Agregadora" (onde tarefas são apenas visualizadas).
*Como evitar:* Separar formalmente visões agregadoras de quadros operacionais; proibir no banco via trigger (`trg_validate_task_board_and_stage`) que tarefas nasçam sem quadro real ou com etapa de outro quadro; impor cascata Quadro -> Etapa no modal de criação e resgatar tarefas legadas para um quadro operacional dedicado ("Geral (legado)").

## 2026-11 — Etapa lida só de `data.stages`
O mesmo erro apareceu em Relatórios ("Etapa removida"), no campo Etapa do modal e na aba Concluídas: tarefas de quadros personalizados têm etapas em `data.boardStages`. Evitar: usar sempre `getStagesForBoard`/`resolveTaskStage` e uma definição única de "concluída".

## 2026-11 — Tela "Carregando" ao voltar para a aba
O evento de sessão do Supabase (`TOKEN_REFRESHED`) trocava a referência de `session`, o efeito chamava `setLoading(true)` e a interface inteira desmontava, apagando modais e formulários. Evitar: depender de `session?.user?.id`, separar carga inicial de revalidação em segundo plano, guardar rascunhos.

## 2026-11 — Arquivos fora do escopo
Numa correção de tarefas concluídas, o agente alterou um script de migrations e o README sem relação com o pedido. Evitar: rodar `git diff --stat` ao fim de toda demanda e justificar ou reverter o que estiver fora do escopo.

## 2026-11 — Migrations
Nunca editar migrations existentes; conferir o maior número antes de criar a próxima; não aplicar em banco sem pedido explícito.

## 2026-11 — Prazo e fuso
Comparar data com data no fuso America/Fortaleza; prazo de hoje não é atrasado. Cobrir com teste de borda (ontem, hoje, amanhã).

## 2026-11 — Chat em Tempo Real: Moderação, LGPD e Menções Server-side
Ao implementar chat com tempo real, menções e moderação, dados sensíveis podem vazar se o soft-delete mantiver o conteúdo textual ou se menções confiarem em texto do cliente.
*Causa:* Falta de sanitização no servidor e deleção lógica ingênua que mantém o corpo da mensagem acessível via API/Realtime.
*Como evitar:* Limpar o corpo da mensagem (`body = ''`) no momento da deleção lógica com trigger no banco garantindo conformidade LGPD; sanitizar menções no servidor filtrando estritamente membros ativos da equipe do canal; auditar canais protegidos como "Geral" para impedir exclusão/renomeação no schema do PostgreSQL; isolar privilégios destrutivos de storage em Edge Functions com `service_role` e cabeçalho JWT autenticado.

## 2026-11 — Chat: Resiliência de Schema Cache para Colunas Novas (mentions, deleted_at, description)
Ao conectar o front-end com instâncias remotas do Supabase onde a migration de chat ainda não foi executada no SQL Editor, o PostgREST rejeita inserts com "Could not find the 'mentions' column of 'messages' in the schema cache".
*Causa:* Descompasso temporal entre o front-end novo e a base de dados remota do usuário que ainda não rodou a migration.
*Como evitar:* Adicionar fallback transparente com `isMissingColumnError`: se o insert ou update com colunas novas falhar por ausência no schema cache, o front-end reenvia o payload compatível com o schema legado e preserva o estado calculado em memória, sem travar o envio de mensagens do usuário.

## 2026-11 — Suporte ao Modo Escuro em Novos Módulos e Prevenção de Cores Fixas
Ao entregar módulos visuais novos (como Chat, Modais v2 e Templates), se forem utilizados inline styles com cores fixas (ex: `#eff6ff`, `#f8fafc`, `#92400e`) ou novos arquivos CSS sem bloco `:root[data-theme='dark']`, o modo escuro quebra, gerando texto claro sobre fundo claro ou caixas brancas berrantes.
*Causa:* Prototipagem com foco exclusivo no tema claro e uso de valores literais em vez de variáveis de tokens semânticos (`theme-tokens.css`).
*Como evitar:* Todo componente novo deve utilizar variáveis CSS de tokens (`var(--bg-surface)`, `var(--text-primary)`, `var(--chip-info-bg)`); arquivos CSS novos devem sempre incluir a seção correspondente para `:root[data-theme='dark']`; para estilizações dinâmicas em inline styles (como chips de cores por entidade), injetar variáveis CSS por tema (`--item-bg-dark`, `--item-text-dark`) e sobrescrevê-las via CSS no tema escuro; e cobrir com testes automatizados de regressão em `theme-contrast.test.ts`.

## 2026-11 — Chamada Direta de Edge Functions vs. RPCs PostgreSQL ('Failed to fetch')
Ao excluir canais de chat, o front-end disparava `fetch` HTTP direto para `${VITE_SUPABASE_URL}/functions/v1/delete-channel`. Como o usuário aplica apenas migrations SQL no SQL Editor do painel e não possui deploy das Edge Functions via CLI do Supabase/Deno, a requisição falhava no navegador com `TypeError: Failed to fetch`.
*Causa:* Dependência de infraestrutura externa (Edge Functions) que não é implantada via SQL Editor no Supabase.
*Como evitar:* Priorizar sempre RPCs SQL (`SECURITY DEFINER`) transacionais para operações administrativas, pois são aplicadas diretamente pelas migrations no SQL Editor e acessadas via `supabase.rpc()`; no front-end, implementar sempre um fallback resiliente para exclusão direta via tabela (`supabase.from(...).delete()`) caso a RPC ainda não tenha sido aplicada, garantindo operação contínua sem quebras de rede.

