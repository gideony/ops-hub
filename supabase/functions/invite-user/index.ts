import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
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
    const email = String(input.email || '').trim().toLowerCase()
    const fullName = String(input.full_name || '').trim()
    const password = String(input.password || '')
    const whatsappDigits = String(input.whatsapp || '').replace(/\D/g, '')
    const whatsapp = `+${whatsappDigits.length === 10 || whatsappDigits.length === 11 ? `55${whatsappDigits}` : whatsappDigits}`
    const role = String(input.role || 'colaborador')
    const teamId = String(input.team_id || '')
    if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2 || fullName.length > 120 || password.length < 8 || password.length > 128 || !/^\+[0-9]{10,15}$/.test(whatsapp) || !/^(administrador|gestor|colaborador)$/.test(role) || !/^[0-9a-f-]{36}$/i.test(teamId)) return response({ error: 'Dados inválidos: confira nome, e-mail, WhatsApp, senha (mínimo 8 caracteres), função e equipe' }, 400)
    const { data: caller, error: callerError } = await admin.from('profiles').select('role,active').eq('id', auth.user.id).single()
    if (callerError || !caller?.active) return response({ error: 'Sem permissão' }, 403)
    if (caller.role !== 'administrador') {
      if (role === 'administrador') return response({ error: 'Sem permissão para criar administrador' }, 403)
      const { data: membership } = await admin.from('team_members').select('is_manager,active').eq('team_id', teamId).eq('user_id', auth.user.id).single()
      if (!membership?.active || !membership.is_manager) return response({ error: 'Equipe sem permissão' }, 403)
    }
    const { data: team } = await admin.from('teams').select('id').eq('id', teamId).single()
    if (!team) return response({ error: 'Equipe inexistente' }, 400)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, whatsapp, must_set_password: true },
    })
    if (createError || !created.user) return response({ error: createError?.message || 'Usuário não criado' }, 400)
    const { error: profileError } = await admin.from('profiles').update({ full_name: fullName, email, whatsapp, role }).eq('id', created.user.id)
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return response({ error: profileError.message }, 500)
    }
    const { error: memberError } = await admin.from('team_members').upsert({ team_id: teamId, user_id: created.user.id, is_manager: role === 'gestor', active: true }, { onConflict: 'team_id,user_id' })
    if (memberError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return response({ error: memberError.message }, 500)
    }
    return response({ ok: true, user_id: created.user.id })
  } catch (error) { return response({ error: error instanceof Error ? error.message : 'Erro inesperado' }, 500) }
})
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
