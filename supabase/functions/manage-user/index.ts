import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ error: 'Método não permitido' }, 405)

  try {
    const authHeader = request.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return response({ error: 'Não autenticado' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: auth, error: authError } = await authClient.auth.getUser(token)
    if (authError || !auth.user) return response({ error: 'Sessão inválida' }, 401)

    const admin = createClient(url, service)
    const input = await request.json()

    const userId = String(input.user_id || '')
    const email = String(input.email || '').trim().toLowerCase()
    const fullName = String(input.full_name || '').trim()
    const temporaryPassword = input.temporary_password ? String(input.temporary_password) : null
    const whatsappDigits = String(input.whatsapp || '').replace(/\D/g, '')
    const whatsapp = `+${whatsappDigits.length === 10 || whatsappDigits.length === 11 ? `55${whatsappDigits}` : whatsappDigits}`
    const role = String(input.role || 'colaborador')
    const active = Boolean(input.active)
    const teamIds = Array.isArray(input.team_ids) ? input.team_ids.map((id: unknown) => String(id)) : []

    if (!/^[0-9a-f-]{36}$/i.test(userId)) return response({ error: 'ID de usuário inválido' }, 400)
    if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2 || fullName.length > 120 || !/^\+[0-9]{10,15}$/.test(whatsapp) || !/^(administrador|gestor|colaborador)$/.test(role)) {
      return response({ error: 'Dados inválidos: confira nome, e-mail, WhatsApp e função' }, 400)
    }
    if (temporaryPassword && (temporaryPassword.length < 8 || temporaryPassword.length > 128)) {
      return response({ error: 'A senha temporária deve ter de 8 a 128 caracteres' }, 400)
    }

    const { data: caller, error: callerError } = await admin.from('profiles').select('role,active,is_master').eq('id', auth.user.id).single()
    if (callerError || !caller?.active) return response({ error: 'Sem permissão' }, 403)
    if (caller.role !== 'administrador') return response({ error: 'Apenas administradores podem gerenciar usuários' }, 403)

    // Chama a função atômica com service_role
    const { error: rpcError } = await admin.rpc('save_managed_user', {
      p_user_id: userId,
      p_full_name: fullName,
      p_email: email,
      p_whatsapp: whatsapp,
      p_role: role,
      p_active: active,
      p_team_ids: teamIds,
    })
    if (rpcError) return response({ error: rpcError.message }, 400)

    // Atualiza email/senha no Auth se fornecido
    const authUpdates: Record<string, unknown> = { email }
    if (temporaryPassword) {
      authUpdates.password = temporaryPassword
      authUpdates.user_metadata = { full_name: fullName, whatsapp, must_set_password: true }
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, authUpdates)
    if (authUpdateError) return response({ error: authUpdateError.message }, 500)

    return response({ ok: true })
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Erro inesperado' }, 500)
  }
})

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
