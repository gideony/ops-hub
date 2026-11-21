import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return jsonResponse({ error: 'Método não permitido' }, 405)

  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'Não autenticado' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!url || !anon || !service) {
      return jsonResponse({ error: 'Configuração do servidor incompleta' }, 500)
    }

    // 1. Validar a identidade do chamador via JWT
    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse({ error: 'Sessão inválida ou expirada' }, 401)
    }

    const callerId = authData.user.id
    const admin = createClient(url, service)

    // 2. Validar que o chamador é um administrador ativo
    const { data: caller, error: callerError } = await admin
      .from('profiles')
      .select('id, full_name, role, active, is_master')
      .eq('id', callerId)
      .single()

    if (callerError || !caller?.active) {
      return jsonResponse({ error: 'Acesso negado: perfil inativo ou inexistente' }, 403)
    }

    if (caller.role !== 'administrador') {
      return jsonResponse({ error: 'Apenas administradores podem excluir canais definitivamente' }, 403)
    }

    // 3. Processar payload de entrada
    const input = await request.json()
    const channelId = String(input.channel_id || '').trim()
    const confirmationName = String(input.confirmation_name || '').trim()

    if (!/^[0-9a-f-]{36}$/i.test(channelId)) {
      return jsonResponse({ error: 'Identificador de canal inválido' }, 400)
    }

    // 4. Buscar informações do canal e da equipe
    const { data: channel, error: channelError } = await admin
      .from('channels')
      .select('id, name, team_id, teams (name)')
      .eq('id', channelId)
      .single()

    if (channelError || !channel) {
      return jsonResponse({ error: 'Canal não encontrado' }, 404)
    }

    // 5. Validar proteção do canal "Geral"
    if (channel.name.trim().toLowerCase() === 'geral') {
      return jsonResponse({ error: 'O canal Geral é protegido e não pode ser excluído' }, 400)
    }

    // 6. Validar nome de confirmação
    if (channel.name.trim().toLowerCase() !== confirmationName.toLowerCase()) {
      return jsonResponse(
        { error: 'O nome de confirmação digitado não confere com o nome do canal' },
        400
      )
    }

    // 7. Obter todos os anexos associados a mensagens deste canal
    const { data: messages, error: messagesError } = await admin
      .from('messages')
      .select('id')
      .eq('channel_id', channelId)

    if (messagesError) {
      return jsonResponse({ error: 'Erro ao consultar mensagens do canal' }, 500)
    }

    const messageIds = (messages || []).map((m: { id: string }) => m.id)
    let attachmentsCount = 0

    if (messageIds.length > 0) {
      const { data: attachments, error: attachError } = await admin
        .from('attachments')
        .select('id, storage_path')
        .in('message_id', messageIds)

      if (!attachError && attachments && attachments.length > 0) {
        attachmentsCount = attachments.length
        const paths = attachments
          .map((a: { storage_path: string }) => a.storage_path)
          .filter(Boolean)

        if (paths.length > 0) {
          try {
            await admin.storage.from('chat-private').remove(paths)
          } catch (storageErr) {
            console.warn('Aviso: falha ao expurgar arquivos físicos do bucket chat-private:', storageErr)
          }
        }
      }
    }

    // 8. Gravar registro na tabela de auditoria
    const teamName = (channel.teams as unknown as { name?: string })?.name || 'Equipe'
    try {
      await admin.from('channel_deletion_audit').insert({
        channel_id: channel.id,
        channel_name: channel.name,
        team_id: channel.team_id,
        team_name: teamName,
        deleted_by: caller.id,
        deleted_by_name: caller.full_name || 'Administrador',
        messages_count: messageIds.length,
        attachments_count: attachmentsCount,
        deleted_at: new Date().toISOString(),
      })
    } catch (auditErr) {
      console.warn('Aviso: falha ao gravar log de auditoria de exclusão do canal:', auditErr)
    }

    // 9. Excluir o canal no banco de dados (cascade em messages, attachments, message_reads)
    const { error: deleteError } = await admin
      .from('channels')
      .delete()
      .eq('id', channelId)

    if (deleteError) {
      return jsonResponse({ error: `Erro ao excluir canal: ${deleteError.message}` }, 500)
    }

    return jsonResponse({
      success: true,
      message: `Canal #${channel.name} excluído com sucesso.`,
      channel_id: channel.id,
      messages_purged: messageIds.length,
      attachments_purged: attachmentsCount,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno do servidor'
    return jsonResponse({ error: message }, 500)
  }
})
