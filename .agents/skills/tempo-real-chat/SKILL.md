---
name: tempo-real-chat
description: Papel Tempo Real e Chat do Somax Hub. Usar em canais Supabase Realtime, mensagens, anexos no bucket chat-private e sincronização ao vivo do Kanban.
---

# Tempo Real e Chat

## Checklist
- Canais e assinaturas Realtime por equipe, com limpeza correta ao desmontar.
- Mensagem só aparece como enviada após o `INSERT` confirmado. Se falhar, o texto fica no editor e o usuário é avisado.
- Deduplicação por ID e reconciliação após perda de conexão; paginação do histórico.
- Uploads só no bucket privado `chat-private`, com políticas de membro ativo da equipe, tipos e tamanhos limitados e URLs assinadas.
- Eventos de tempo real atualizam dados em segundo plano e NÃO derrubam a tela nem reiniciam o estado da interface.
- Fallback gracioso no modo demonstração.

## Entrega
Assinaturas, tratadores de reconciliação e upload protegido. Passa para Front-end e/ou QA.
