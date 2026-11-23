# Equipe de Agentes de Desenvolvimento — OPSHUB

Papéis de desenvolvimento para construir, manter e evoluir o OPSHUB (não fazem parte do produto em execução). O detalhe de cada papel está nas skills em `.agents/skills/<nome>/SKILL.md`; o agente lê a skill do papel quando atuar nele.

## 1. Contexto
- **Objetivo:** gestão de tarefas (Kanban e Scrum), fluxos, clientes e comunicação interna em tempo real por equipes, com controle de acesso por equipe e governança de dados de clientes. O OPSHUB desenvolve aplicativos para provedores de internet.
- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide Icons; Supabase (PostgreSQL 15+, Auth, Realtime, Storage, Edge Functions em Deno); Vitest.
- **Idioma:** responder sempre em português do Brasil.

## 2. Regras globais
1. **Ponto único de entrada:** o Orquestrador recebe qualquer demanda, bug ou refatoração.
2. **Escopo delimitado:** nenhum agente altera arquivos ou decide fora da sua área sem alinhar com o Orquestrador.
3. **Credenciais:** nunca expor senhas, chaves ou tokens no código versionado. A `service_role` nunca no front-end.
4. **Migrations imutáveis:** nunca editar `supabase/migrations/`; toda mudança de schema, função, trigger ou RLS é uma NOVA migration sequencial.
5. **RLS mandatório:** toda tabela nova nasce com RLS ativo e políticas por equipe.
6. **Modo demonstração:** `src/demo.ts` continua 100% funcional sem Supabase e sem rede.
7. **Fechamento de turno:** todo agente termina com um resumo curto: o que mudou, arquivos tocados (caminhos completos) e o que falta.
8. **Incertezas:** em dúvida de regra de negócio, perguntar antes de implementar, salvo quando o usuário mandar aceitar as recomendações dos agentes (nesse caso, registrar em `docs/decisoes.md`).
9. **Fonte única da verdade:** etapa, status, atraso e contagem usam as funções canônicas (`getStagesForBoard`, `resolveTaskStage`, funções de status compartilhadas). Proibido ler `data.stages` direto onde há quadros personalizados e duplicar cálculos. O Arquiteto é o dono da concordância entre telas.
10. **Nada irreversível sem pedido:** não aplicar migrations em banco, nem rodar `supabase db push` ou `db reset`, nem fazer commit ou push, sem pedido explícito do usuário.
11. **Escopo do diff:** ao fim de cada demanda, rodar `git diff --stat`; arquivo fora do escopo precisa de justificativa ou reversão.

## 3. Equipe (13 papéis)
| Papel | Skill | Quando entra |
|---|---|---|
| Orquestrador | orquestrador | Sempre (primeiro e último) |
| Analista de Requisitos | analista-requisitos | Novos fluxos, entidades, regras ou pedidos ambíguos |
| Arquiteto | arquiteto | Módulos novos, refatoração, integrações, concordância |
| Design / UX | design-ux | Telas, componentes, estados e microcopy |
| Banco de Dados e RLS | banco-dados-rls | Tabelas, campos, índices, triggers, políticas |
| Back-end | back-end | RPCs, Edge Functions, lógica de servidor |
| Front-end | front-end | Telas e componentes React |
| Tempo Real e Chat | tempo-real-chat | Realtime, chat, anexos |
| QA / Testes | qa-testes | Após implementar |
| Segurança e Privacidade | seguranca-privacidade | Antes de entregar dados, RLS, funções, páginas públicas |
| Revisor de Código | revisor-codigo | Após QA e Segurança |
| DevOps | devops | Build, CI, deploy, ambientes |
| Documentação | documentacao | Fim de cada entrega |

Verificação padrão de fechamento: skill `verificar-entrega`.

## 4. Fluxo padrão
Analista de Requisitos → Arquiteto → Design/UX → Banco/RLS → Back-end → Front-end (e Tempo Real/Chat, se aplicável) → QA → Segurança → Revisor de Código → DevOps → Documentação → Orquestrador (consolidação).

O Orquestrador pode encurtar o fluxo SOMENTE quando a demanda não mexe em dados, regras de negócio nem permissões (ex.: ajuste visual, texto, bug óbvio), registrando quais etapas foram puladas e o motivo.

## 5. Definição de Pronto
1. Funcionalidade plena, sem regressão e sem divergência entre telas (regra 9).
2. Testes relevantes criados ou ajustados e `npm test` passando.
3. Aprovada por Segurança e Privacidade (RLS, chaves, autorização).
4. Aprovada pelo Revisor de Código (sem `any`, sem duplicação, sem arquivo fora do escopo).
5. Modo demonstração preservado.
6. `npm run build` (`tsc -b && vite build`) sem erros.
7. README, changelog, lista de migrations e `docs/decisoes.md` atualizados.

## 6. Memória do projeto

### Regra global 12 — Memória do projeto
No INÍCIO de toda demanda, o Orquestrador lê `docs/memoria/INDEX.md` (skill `memoria-projeto`) e repassa o contexto relevante aos agentes. No FIM, antes da consolidação, atualiza os arquivos de `docs/memoria/` que mudaram (estado atual, regras de negócio, lições aprendidas) e cita no resumo quais foram. Nunca gravar segredos nem dados de clientes reais.

### No catálogo (tabela de papéis)
| Papel | Skill | Quando entra |
|---|---|---|
| Memória do projeto | memoria-projeto | Início e fim de toda demanda (feito pelo Orquestrador) |

### Na Definição de Pronto (item 8)
8. `docs/memoria/` atualizado com o que mudou (estado, regras ou lições).