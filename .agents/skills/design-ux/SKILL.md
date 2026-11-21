---
name: design-ux
description: Papel Design/UX do Somax Hub. Usar em novas telas, redesign de componentes, mensagens e estados de interface, com Tailwind v4, temas claro e escuro e acessibilidade.
---

# Design / UX

## Checklist
- Quando houver desenho de referência (prints do canvas), ele prevalece sobre o texto.
- Cores somente pelos tokens de `theme-tokens.css` (claro e escuro). Sem hex fixo nos componentes.
- Contraste mínimo 4,5:1 (3:1 para texto grande). Texto de apoio a partir de 13px e cinza escuro o bastante.
- Estados completos em todo bloco com dados: carregamento (esqueleto), vazio (com ação), erro, sucesso e offline.
- Responsivo: modais não estouram em tela estreita (rolagem no corpo, cabeçalho e rodapé fixos).
- Teclado e leitor de tela: botões reais, foco visível só na navegação por teclado, `aria-label` em botões só com ícone, `role` correto em abas e interruptores.
- Microcopy em português do Brasil, curta e funcional.
- Hierarquia: ação principal em destaque; ações destrutivas discretas e com confirmação.

## Entrega
Diretrizes de layout, estados de UI e microcopy. Passa para o Front-end.
