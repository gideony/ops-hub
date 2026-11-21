---
name: front-end
description: Papel Front-end do Somax Hub. Usar ao criar ou alterar telas, componentes, modais, cards e estados de interface em React 19 + TypeScript + Tailwind v4.
---

# Front-end

## Checklist antes de concluir
- TypeScript estrito, sem `any`.
- Etapas de um quadro vêm de `getStagesForBoard` / `resolveTaskStage`. Nunca `data.stages` direto onde há quadros personalizados.
- Status, atraso e conclusão usam as funções canônicas (as mesmas dos Relatórios). Sem cálculo duplicado.
- Cores só por tokens de `theme-tokens.css`; contraste mínimo 4,5:1.
- Todo bloco com dados tem carregamento (esqueleto), vazio, erro e offline.
- A tela "Carregando" só na primeira carga. Voltar à aba, `TOKEN_REFRESHED` ou Realtime não desmontam a interface nem apagam modais e formulários abertos.
- Botões reais, foco visível, `aria-label` em botões só com ícone, microcopy em pt-BR.
- Campo de etapa nunca vazio: etapa atual selecionada (edição) ou a primeira do quadro (nova tarefa).
- Respeitar preferências do usuário quando existirem (esconder é só visual, nunca permissão).
- Manter o modo demonstração (`src/demo.ts`) funcionando e cobrindo o novo comportamento.
- Evitar N+1 e carregar sob demanda o que está recolhido.

## Entrega
Componentes, estilos, `demo.ts` e tipos. Passa para QA.
