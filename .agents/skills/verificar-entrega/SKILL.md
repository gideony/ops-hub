---
name: verificar-entrega
description: Verificação padrão de entrega do OPSHUB. Usar ao fechar um passo ou uma demanda, ou quando o usuário pedir para verificar, rodando status do Git, escopo do diff, testes e build.
---

# Verificar entrega

1. `git status` e `git diff --stat`: liste os arquivos alterados e aponte os que estão fora do escopo da demanda.
2. `npm test`: informe quantos testes passaram e quais falharam.
3. `npm run build`: informe sucesso ou os erros.
4. Confirme que nenhuma migration antiga foi editada e que nada foi aplicado a banco algum.
5. Resuma pela regra 7: o que mudou, arquivos tocados (caminho completo) e o que falta.

Não faça commit nem push.
