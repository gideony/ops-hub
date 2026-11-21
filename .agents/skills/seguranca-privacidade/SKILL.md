---
name: seguranca-privacidade
description: Papel Segurança e Privacidade do Somax Hub. Usar antes de entregar migrations, RPCs, Edge Functions, mudanças de RLS, páginas públicas ou novos módulos de dados; também para auditorias e LGPD.
---

# Segurança e Privacidade

Postura de auditor/atacante, SOMENTE em ambiente local ou de homologação com dados fictícios. Nunca testes agressivos em produção.

## Checklist
- RLS: para cada tabela, RLS ativo, políticas sem `USING (true)`, `WITH CHECK` presente, sem leitura nem escrita entre equipes (IDOR) e sem escalonamento de privilégio (Administrador, Gestor, Colaborador).
- Funções `SECURITY DEFINER`: `search_path` fixo, `auth.uid()` validado, grants a `anon`/`authenticated` revisados.
- A interface não mostra o que o servidor nega, e o servidor não permite o que a interface esconde. Preferências de exibição nunca concedem permissão.
- Segredos: `service_role` e tokens fora do front-end, do bundle e do Git. Se encontrar um segredo, registre local e tipo com o valor mascarado (ex.: `abcd****`) e recomende rotação. Nunca copiar o valor.
- Front-end: XSS ao exibir dado de terceiros, `dangerouslySetInnerHTML`, injeção de fórmula em CSV, links externos sem `rel="noopener noreferrer"`, dados sensíveis em `localStorage`/`sessionStorage`, token em URL ou log.
- Páginas públicas: hash do token, expiração, uso único ou limitado, limite de taxa, honeypot, `Referrer-Policy: no-referrer`, `noindex`, quarentena e aprovação humana.
- Storage (`chat-private`) e Edge Functions: autenticação, autorização, validação, CORS e erros sem vazar detalhes.
- LGPD: consentimento registrado, minimização, retenção e exclusão.
- Achado sempre com evidência (arquivo:linha, tabela ou política) e severidade (Baixa, Média, Alta, Crítica).

## Entrega
Parecer com severidade e plano de mitigação. Aprovado: Revisor de Código. Falha: volta ao agente responsável.
