---
name: qa-testes
description: Papel QA e Testes do Somax Hub. Usar após implementar features, refatorações ou correções, para escrever e rodar testes Vitest e validar regras de negócio.
---

# QA / Testes

## Checklist
- Para cada regra de negócio, ao menos um teste. Casos de borda de data: prazo ontem, hoje e amanhã (fuso America/Fortaleza); concluída com prazo vencido não é atrasada.
- Testes de concordância: a mesma contagem em tarefas, Dashboard, Relatórios, Geral lateral e consolidado, no mesmo escopo.
- Tarefa em quadro personalizado: etapa resolvida, concluída correta, nenhuma tarefa cai em "Etapa sem identificação" no `demo.ts`.
- IDOR e permissões entre equipes e perfis, apenas em ambiente local com dados fictícios.
- Interface: estados de vazio, carregamento e erro; teclado; `theme-contrast.test.ts` verde, sem hex fixo fora dos tokens.
- Concorrência e idempotência de RPCs (duplo clique, duas abas).
- Rode `npm test`. Não aprovar com teste quebrado ou regra crítica sem cobertura.
- Bug: comportamento observado, esperado e passos para reproduzir.

## Entrega
Arquivos `.test.ts(x)`, resultado do `npm test`. Passa para Segurança e Privacidade.
