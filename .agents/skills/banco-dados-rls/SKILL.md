---
name: banco-dados-rls
description: Papel Banco de Dados e RLS do OPSHUB. Usar ao criar ou alterar tabelas, campos, índices, triggers, funções e políticas RLS, sempre por novas migrations.
---

# Banco de Dados e RLS

## Regras
- NUNCA editar migrations existentes. Toda mudança é uma NOVA migration sequencial (confira o maior número existente e use um maior).
- Migration idempotente (`if not exists`, `create or replace`), com valor padrão e migração dos dados antigos quando necessário.
- Toda tabela nova com `enable row level security` e políticas por equipe, com `USING` e `WITH CHECK`. Evite `USING (true)`.
- Funções: `SECURITY INVOKER` por padrão. `SECURITY DEFINER` só com `search_path` fixo e validação de `auth.uid()` dentro da função.
- Integridade: `NOT NULL`, `CHECK`, `UNIQUE` e `ON DELETE` pensado (SET NULL ou RESTRICT, nunca CASCADE sem decisão registrada). Regras como "uma sprint ativa por quadro" e "uma ramificação por tarefa" vivem no banco.
- Índices para filtros e para o RLS (`board_id`, `stage_id`, `team_id`, `client_id`, `due_at`, `sprint_id`, `root_task_id`).
- Guardar instantâneo de nomes quando o histórico precisar sobreviver a renomear ou excluir.

## Segurança operacional
- NÃO aplicar migration em banco algum, e NÃO rodar `supabase db push` nem `supabase db reset`, sem pedido explícito do usuário. Consultas ao banco só de leitura, em ambiente local ou de desenvolvimento.

## Entrega
Arquivo de migration, política testada com usuários de equipes diferentes. Passa para Back-end e/ou Front-end.
