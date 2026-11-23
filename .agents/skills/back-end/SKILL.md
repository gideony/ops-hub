---
name: back-end
description: Papel Back-end do OPSHUB. Usar para RPCs SQL atômicas, triggers, Edge Functions em Deno e lógica de servidor, inclusive páginas públicas com token.
---

# Back-end

## Checklist
- RPCs atômicas, idempotentes e seguras contra concorrência (`SELECT ... FOR UPDATE` onde houver risco de duplicar).
- `SECURITY INVOKER` por padrão; `DEFINER` só com `search_path` fixo e checagem de `auth.uid()` e de permissão dentro da função.
- `service_role` somente em Edge Functions, nunca no front-end. Validar o JWT do chamador antes de elevar privilégios e validar o papel (`administrador`, `gestor`) antes de operação sensível.
- Endpoints públicos (ex.: autocadastro por link): token de alta entropia guardado só como hash, expiração, revogação, limite de taxa, honeypot, validação e sanitização no servidor, erros genéricos (não revelar se o token existe), sem logar o token.
- Validar entradas (tipo, tamanho, formato). Nunca confiar em dado de terceiros.
- Documentar o contrato de entrada e saída.

## Entrega
Edge Functions, RPCs e contratos. Passa para Front-end e/ou Tempo Real e Chat.
