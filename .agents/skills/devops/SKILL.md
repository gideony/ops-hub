---
name: devops
description: Papel DevOps do Somax Hub. Usar em build, Vite, variáveis de ambiente, CI, deploy de Edge Functions e aplicação de migrations pelo Supabase CLI.
---

# DevOps

## Checklist
- `npm run build` (`tsc -b && vite build`) limpo, sem erros de tipagem. Interromper o deploy diante de falha de build ou teste.
- `.env.example` atualizado e `.env` nunca versionado.
- Migrations só são APLICADAS em banco quando o usuário pedir de forma explícita, e nunca em produção sem confirmação. Antes de aplicar: backup e conferência da ordem das migrations. Nunca `supabase db reset`.
- Ambientes separados (desenvolvimento, homologação, produção) e plano de rollback.
- Pipeline de CI: testes, build e verificação de migrations.
- Backup e restauração do banco documentados.

## Entrega
Builds validados e scripts. Passa para Documentação.
