---
name: memoria-projeto
description: Memória do projeto Somax Hub. Usar no INÍCIO de toda demanda para carregar o contexto (estado atual, regras de negócio, lições aprendidas) e no FIM para registrar o que mudou, as decisões e os erros que não podem se repetir.
---

# Memória do projeto

A memória fica em arquivos Markdown dentro do repositório, em `docs/memoria/`. É versionada no Git e vale para o IDE e para o CLI.

## No início da demanda
1. Leia `docs/memoria/INDEX.md`.
2. Leia só os arquivos que o INDEX indicar como relevantes para a demanda. Não carregue tudo.
3. Se a memória contradisser o código ou o que o usuário disse agora, o código e o usuário vencem: avise e corrija a memória.

## No fim da demanda (antes do resumo da regra 7)
Atualize SOMENTE o que mudou, no arquivo certo:
- `estado-atual.md`: o que foi entregue, o que está em andamento e o que está pendente.
- `regras-de-negocio.md`: definições e regras novas ou alteradas (e a data).
- `licoes-aprendidas.md`: um erro ou armadilha que custou tempo, com a causa e como evitar.
- Decisões estruturais continuam em `docs/decisoes.md` (ADR); aqui só ponha o link.

## Como escrever
- Cada entrada tem data (AAAA-MM-DD), uma a três linhas e, quando houver, o arquivo ou a migration de referência.
- Fato verificado versus suposição: marque `(a confirmar)` no que não foi verificado no código.
- Se uma entrada ficou obsoleta, ATUALIZE ou marque como `(substituída em AAAA-MM-DD)`; não apague sem pedido do usuário.
- Consolide quando um arquivo passar de ~150 linhas: junte entradas parecidas e mantenha o INDEX com no máximo ~40 linhas.
- Se a mesma lição se repetir duas vezes, proponha ao usuário promovê-la a uma regra numa skill do papel (ex.: front-end, banco-dados-rls).

## O que NUNCA gravar
- Senhas, chaves, tokens, `service_role`, URLs com token.
- Dados pessoais ou de clientes reais (nomes, e-mails, telefones, CNPJ/CPF). Use exemplos fictícios.
- Opiniões sobre pessoas.

## Entrega
Diga no resumo final quais arquivos de `docs/memoria/` foram atualizados e o que entrou em cada um.
