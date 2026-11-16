import { describe, expect, it } from 'vitest'
import type { Client, ClientRegistrationData, ClientRegistrationLink, ClientRegistrationSubmission, Member, Profile, Team } from './lib'

describe('Fluxo de Auto-Cadastro de Clientes com Aprovação Humana', () => {
  const adminUser: Profile = {
    id: 'user-admin',
    full_name: 'Administrador Master',
    role: 'administrador',
    active: true,
  }

  const managerComercial: Profile = {
    id: 'user-manager-com',
    full_name: 'Gestor Comercial',
    role: 'gestor',
    active: true,
  }

  const collaboratorComercial: Profile = {
    id: 'user-collab-com',
    full_name: 'Colaborador Comercial',
    role: 'colaborador',
    active: true,
  }

  const teamComercial: Team = {
    id: 'team-com',
    name: 'Comercial',
    color: '#e9a23b',
  }

  const members: Member[] = [
    { team_id: teamComercial.id, user_id: managerComercial.id, is_manager: true, active: true },
    { team_id: teamComercial.id, user_id: collaboratorComercial.id, is_manager: false, active: true },
  ]

  function canManageRegistration(userId: string, linkTeamId: string | null): boolean {
    if (userId === adminUser.id) return true
    if (!linkTeamId) return false
    return members.some(m => m.team_id === linkTeamId && m.user_id === userId && m.is_manager && m.active)
  }

  function validateLink(link: ClientRegistrationLink, now = new Date()): { valid: boolean; error?: string } {
    if (!link.is_active) {
      return { valid: false, error: 'Este link de cadastro já foi utilizado ou foi revogado.' }
    }
    if (new Date(link.expires_at) <= now) {
      return { valid: false, error: 'Este link de cadastro expirou.' }
    }
    if (link.submission_count >= link.max_submissions) {
      return { valid: false, error: 'O limite de envios deste link foi atingido.' }
    }
    return { valid: true }
  }

  function simulateSubmission(
    link: ClientRegistrationLink,
    payload: ClientRegistrationData,
    honeypot?: string
  ): { success: boolean; submission?: ClientRegistrationSubmission; error?: string } {
    // Defesa anti-bot: se honeypot preenchido, sucesso fingido sem quarentena
    if (honeypot && honeypot.trim() !== '') {
      return { success: true }
    }

    const check = validateLink(link)
    if (!check.valid) {
      return { success: false, error: check.error }
    }

    if (!payload.name || !payload.name.trim()) {
      return { success: false, error: 'O nome do cliente é obrigatório.' }
    }

    if (!payload.contact_email || !/^\S+@\S+\.\S+$/.test(payload.contact_email.trim())) {
      return { success: false, error: 'E-mail de contato inválido.' }
    }

    // Incrementa contagem de envios e atualiza status
    link.submission_count += 1
    if (link.single_use || link.submission_count >= link.max_submissions) {
      link.is_active = false
    }

    const sub: ClientRegistrationSubmission = {
      id: `sub-${Math.random().toString(36).substring(2, 9)}`,
      link_id: link.id,
      client_id: null,
      data: payload,
      status: 'pending',
      lgpd_accepted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    return { success: true, submission: sub }
  }

  function reviewSubmission(
    submission: ClientRegistrationSubmission,
    action: 'approve' | 'reject',
    reviewerId: string,
    linkTeamId: string | null,
    approvedData?: ClientRegistrationData,
    notes?: string
  ): { success: boolean; client?: Client; error?: string } {
    if (!canManageRegistration(reviewerId, linkTeamId)) {
      return { success: false, error: 'Sem permissão para revisar esta submissão.' }
    }

    if (submission.status !== 'pending') {
      return { success: false, error: 'Esta submissão já foi revisada.' }
    }

    if (action === 'reject') {
      submission.status = 'rejected'
      submission.reviewed_by = reviewerId
      submission.reviewed_at = new Date().toISOString()
      submission.review_notes = notes || null
      return { success: true }
    }

    const d = approvedData || submission.data
    const newClient: Client = {
      id: `client-${Math.random().toString(36).substring(2, 9)}`,
      name: d.name.trim(),
      legal_name: d.legal_name?.trim() || null,
      contact_name: d.contact_name?.trim() || null,
      contact_email: d.contact_email?.trim() || null,
      contact_phone: d.contact_phone?.trim() || null,
      financial_contact_name: d.financial_contact_name?.trim() || null,
      financial_email: d.financial_email?.trim() || null,
      financial_whatsapp: d.financial_whatsapp?.trim() || null,
      financial_due_date: d.financial_due_date?.trim() || null,
      financial_notes: d.financial_notes?.trim() || null,
      links: d.links || [],
      integration_references: null,
      integration_items: [],
    }

    submission.status = 'approved'
    submission.client_id = newClient.id
    submission.reviewed_by = reviewerId
    submission.reviewed_at = new Date().toISOString()
    submission.review_notes = notes || null

    return { success: true, client: newClient }
  }

  it('deve gerar link com token, validade e limite de envios corretos', () => {
    const days = 7
    const expires = new Date()
    expires.setDate(expires.getDate() + days)

    const link: ClientRegistrationLink = {
      id: 'link-01',
      token: 'tok-abc12345',
      created_by: managerComercial.id,
      team_id: teamComercial.id,
      single_use: true,
      max_submissions: 1,
      submission_count: 0,
      include_financial: false,
      expires_at: expires.toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    expect(link.token).toBe('tok-abc12345')
    expect(link.is_active).toBe(true)
    expect(link.max_submissions).toBe(1)
    expect(validateLink(link).valid).toBe(true)
  })

  it('deve invalidar link expirado por data', () => {
    const pastDate = new Date(Date.now() - 3600000)
    const link: ClientRegistrationLink = {
      id: 'link-exp',
      token: 'tok-exp',
      created_by: adminUser.id,
      team_id: null,
      single_use: true,
      max_submissions: 1,
      submission_count: 0,
      include_financial: false,
      expires_at: pastDate.toISOString(),
      is_active: true,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    }

    const check = validateLink(link)
    expect(check.valid).toBe(false)
    expect(check.error).toContain('expirou')
  })

  it('deve desativar link de uso único após primeira submissão com sucesso', () => {
    const link: ClientRegistrationLink = {
      id: 'link-single',
      token: 'tok-single',
      created_by: managerComercial.id,
      team_id: teamComercial.id,
      single_use: true,
      max_submissions: 1,
      submission_count: 0,
      include_financial: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const result = simulateSubmission(link, {
      name: 'Empresa Alpha',
      contact_email: 'contato@alpha.example',
      contact_phone: '(11) 99999-8888',
    })

    expect(result.success).toBe(true)
    expect(result.submission).toBeDefined()
    expect(result.submission?.status).toBe('pending')
    expect(link.submission_count).toBe(1)
    expect(link.is_active).toBe(false)

    // Segunda tentativa no mesmo link deve falhar
    const secondTry = simulateSubmission(link, {
      name: 'Tentativa 2',
      contact_email: 'tentativa@alpha.example',
    })
    expect(secondTry.success).toBe(false)
    expect(secondTry.error).toContain('utilizado')
  })

  it('deve descartar silenciosamente submissão com honeypot preenchido (anti-bot)', () => {
    const link: ClientRegistrationLink = {
      id: 'link-bot',
      token: 'tok-bot',
      created_by: adminUser.id,
      team_id: null,
      single_use: true,
      max_submissions: 1,
      submission_count: 0,
      include_financial: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const result = simulateSubmission(
      link,
      {
        name: 'Spam Bot Corp',
        contact_email: 'spammer@bot.net',
      },
      'https://spam-link-preenchido-pelo-robo.com' // Honeypot preenchido
    )

    expect(result.success).toBe(true)
    // Não criou submissão na quarentena
    expect(result.submission).toBeUndefined()
    // Link continua intacto
    expect(link.submission_count).toBe(0)
    expect(link.is_active).toBe(true)
  })

  it('deve exigir aprovação humana antes de criar cliente na base oficial', () => {
    const link: ClientRegistrationLink = {
      id: 'link-valid',
      token: 'tok-valid',
      created_by: managerComercial.id,
      team_id: teamComercial.id,
      single_use: false,
      max_submissions: 3,
      submission_count: 0,
      include_financial: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const subResult = simulateSubmission(link, {
      name: 'Padaria Modelo',
      legal_name: 'Padaria Modelo Eireli',
      cnpj_cpf: '11.222.333/0001-44',
      contact_name: 'Antônio Ferreira',
      contact_email: 'antonio@padariamodelo.example',
      contact_phone: '(85) 98888-7777',
      financial_contact_name: 'Clara Silva',
      financial_email: 'financeiro@padariamodelo.example',
      financial_due_date: '15',
    })

    const submission = subResult.submission!
    expect(submission.status).toBe('pending')
    expect(submission.client_id).toBeNull()

    // Aprovação pelo Gestor Comercial
    const reviewResult = reviewSubmission(
      submission,
      'approve',
      managerComercial.id,
      teamComercial.id,
      undefined,
      'Contato confirmado por WhatsApp.'
    )

    expect(reviewResult.success).toBe(true)
    expect(reviewResult.client).toBeDefined()
    expect(reviewResult.client?.name).toBe('Padaria Modelo')
    expect(reviewResult.client?.financial_due_date).toBe('15')
    expect(submission.status).toBe('approved')
    expect(submission.client_id).toBe(reviewResult.client?.id)
    expect(submission.reviewed_by).toBe(managerComercial.id)
    expect(submission.review_notes).toBe('Contato confirmado por WhatsApp.')
  })

  it('deve barrar aprovação de submissão por colaborador sem perfil gestor/admin', () => {
    const submission: ClientRegistrationSubmission = {
      id: 'sub-perm',
      link_id: 'link-perm',
      client_id: null,
      data: {
        name: 'Empresa Teste',
        contact_email: 'teste@empresa.example',
      },
      status: 'pending',
      lgpd_accepted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    // Colaborador tenta aprovar
    const result = reviewSubmission(
      submission,
      'approve',
      collaboratorComercial.id,
      teamComercial.id
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Sem permissão')
    expect(submission.status).toBe('pending')
  })

  it('deve permitir rejeição com anotação do motivo', () => {
    const submission: ClientRegistrationSubmission = {
      id: 'sub-reject',
      link_id: 'link-reject',
      client_id: null,
      data: {
        name: 'Cadastro Incompleto / Inválido',
        contact_email: 'invalido@teste.example',
      },
      status: 'pending',
      lgpd_accepted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    const result = reviewSubmission(
      submission,
      'reject',
      adminUser.id,
      null,
      undefined,
      'Cadastro suspeito de duplicidade.'
    )

    expect(result.success).toBe(true)
    expect(submission.status).toBe('rejected')
    expect(submission.reviewed_by).toBe(adminUser.id)
    expect(submission.review_notes).toBe('Cadastro suspeito de duplicidade.')
  })

  it('deve aprovar e preservar financial_due_date como texto livre sem erro de tipo (datas ISO, dias ou texto)', () => {
    const testCases = ['Todo dia 10', '15', '2026-11-10', '  Dia 25  ']

    for (const testDueDate of testCases) {
      const submission: ClientRegistrationSubmission = {
        id: `sub-date-${Math.random()}`,
        link_id: 'link-date',
        client_id: null,
        data: {
          name: `Cliente Vencimento ${testDueDate}`,
          contact_email: 'contato@cliente.example',
          financial_due_date: testDueDate,
        },
        status: 'pending',
        lgpd_accepted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }

      const result = reviewSubmission(
        submission,
        'approve',
        adminUser.id,
        null
      )

      expect(result.success).toBe(true)
      expect(result.client).toBeDefined()
      expect(result.client?.financial_due_date).toBe(testDueDate.trim())
      expect(typeof result.client?.financial_due_date).toBe('string')
    }
  })

  it('deve excluir cliente preservando e desvinculando tarefas existentes (client_id = null)', () => {
    const clientsList: Client[] = [
      {
        id: 'client-1',
        name: 'Cliente Alpha',
        legal_name: 'Alpha Ltda',
        contact_name: 'Carlos',
        contact_email: 'carlos@alpha.example',
        contact_phone: null,
        financial_contact_name: null,
        financial_email: null,
        financial_whatsapp: null,
        financial_due_date: '10',
        financial_notes: null,
        links: [],
        integration_references: null,
        integration_items: [],
      },
      {
        id: 'client-2',
        name: 'Cliente Beta',
        legal_name: 'Beta S.A.',
        contact_name: 'Bruna',
        contact_email: 'bruna@beta.example',
        contact_phone: null,
        financial_contact_name: null,
        financial_email: null,
        financial_whatsapp: null,
        financial_due_date: '20',
        financial_notes: null,
        links: [],
        integration_references: null,
        integration_items: [],
      },
    ]

    const tasksList = [
      { id: 'task-1', title: 'Tarefa do Alpha', client_id: 'client-1' },
      { id: 'task-2', title: 'Outra tarefa do Alpha', client_id: 'client-1' },
      { id: 'task-3', title: 'Tarefa do Beta', client_id: 'client-2' },
    ]

    // Simula a exclusão do client-1 por administrador
    function simulateDeleteClient(clientId: string, userRole: string) {
      if (userRole !== 'administrador') {
        return { success: false, error: 'Apenas administradores podem excluir clientes.' }
      }
      const updatedClients = clientsList.filter(c => c.id !== clientId)
      const updatedTasks = tasksList.map(t => (t.client_id === clientId ? { ...t, client_id: null } : t))
      return { success: true, clients: updatedClients, tasks: updatedTasks }
    }

    // Tentativa por colaborador não-admin
    const denied = simulateDeleteClient('client-1', 'colaborador')
    expect(denied.success).toBe(false)
    expect(denied.error).toContain('Apenas administradores')

    // Execução por administrador
    const allowed = simulateDeleteClient('client-1', 'administrador')
    expect(allowed.success).toBe(true)
    expect(allowed.clients).toBeDefined()
    expect(allowed.clients!).toHaveLength(1)
    expect(allowed.clients![0].id).toBe('client-2')

    // Tarefas do client-1 devem estar desvinculadas (client_id === null) e mantidas
    expect(allowed.tasks).toBeDefined()
    expect(allowed.tasks!).toHaveLength(3)
    const task1 = allowed.tasks!.find(t => t.id === 'task-1')
    const task2 = allowed.tasks!.find(t => t.id === 'task-2')
    const task3 = allowed.tasks!.find(t => t.id === 'task-3')

    expect(task1?.client_id).toBeNull()
    expect(task2?.client_id).toBeNull()
    expect(task3?.client_id).toBe('client-2')
  })
})
