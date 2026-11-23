import { describe, expect, it } from 'vitest'
import type {
  Client,
  ClientLink,
  ClientRegistrationData,
  ClientRegistrationLink,
  ClientRegistrationSubmission,
  Stage,
  Task,
} from './lib'

describe('Perfil do Cliente, Links de Cadastro e Validação em Quarentena', () => {
  const sampleClient: Client = {
    id: 'client-opshub-01',
    name: 'Logística Horizonte',
    legal_name: 'Horizonte Transportes e Logística S.A.',
    contact_name: 'Juliana Paes',
    contact_email: 'juliana@horizonte.example',
    contact_phone: '(11) 98765-4321',
    financial_contact_name: 'Carlos Faria',
    financial_email: 'financeiro@horizonte.example',
    financial_whatsapp: '(11) 98765-4322',
    financial_due_date: 'Todo dia 15',
    financial_notes: 'Boleto bancário emitido com 5 dias de antecedência.',
    links: [
      { label: 'Portal do Embarcador', url: 'https://embarcador.horizonte.example' },
      { label: 'Drive Contratual', url: 'https://drive.example/horizonte' },
    ],
    integration_references: 'Webhook de rastreamento configurado.',
    integration_items: [
      { key: 'API_ENDPOINT', value: 'https://api.horizonte.example/v1' },
      { key: 'TRACKING_ID', value: 'HZ-9988' },
    ],
  }

  const stages: Stage[] = [
    { id: 'st-backlog', name: 'Backlog', position: 0, color: '#3b82f6', is_final: false, is_pause: false },
    { id: 'st-progresso', name: 'Em Andamento', position: 1, color: '#f59e0b', is_final: false, is_pause: false },
    { id: 'st-concluido', name: 'Concluído', position: 2, color: '#22c55e', is_final: true, is_pause: false },
  ]

  const tasks: Task[] = [
    {
      id: 'task-1',
      title: 'Configurar integração de fretes',
      description: 'Parametrizar API de fretes para Horizonte',
      team_id: 'team-dev',
      assignee_id: 'user-1',
      client_id: sampleClient.id,
      stage_id: 'st-progresso',
      priority: 'alta',
      due_at: '2026-11-20',
      tags: ['integracao'],
      completed_at: null,
      created_by: 'user-admin',
      created_at: '2026-11-01',
      updated_at: '2026-11-02',
    },
    {
      id: 'task-2',
      title: 'Emissão de contrato inicial',
      description: 'Documento assinado pelas partes',
      team_id: 'team-com',
      assignee_id: 'user-2',
      client_id: sampleClient.id,
      stage_id: 'st-concluido',
      priority: 'media',
      due_at: null,
      tags: ['comercial'],
      completed_at: '2026-11-05',
      created_by: 'user-admin',
      created_at: '2026-11-01',
      updated_at: '2026-11-05',
    },
    {
      id: 'task-3',
      title: 'Tarefa de outro cliente',
      description: 'Não pertence ao horizonte',
      team_id: 'team-com',
      assignee_id: 'user-2',
      client_id: 'other-client',
      stage_id: 'st-progresso',
      priority: 'baixa',
      due_at: null,
      tags: [],
      completed_at: null,
      created_by: 'user-admin',
      created_at: '2026-11-01',
      updated_at: '2026-11-01',
    },
  ]

  describe('1. Perfil do Cliente — Agrupamento e Visão 360°', () => {
    it('deve isolar tarefas pertencentes ao cliente e calcular indicadores de andamento e concluídas', () => {
      const clientTasks = tasks.filter(t => t.client_id === sampleClient.id)
      expect(clientTasks).toHaveLength(2)

      const completed = clientTasks.filter(
        t => Boolean(t.completed_at) || stages.find(s => s.id === t.stage_id)?.is_final
      )
      const active = clientTasks.filter(
        t => !t.completed_at && !stages.find(s => s.id === t.stage_id)?.is_final
      )

      expect(completed).toHaveLength(1)
      expect(completed[0].id).toBe('task-2')
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('task-1')
    })

    it('deve formatar corretamente dados de contato, WhatsApp e vencimento financeiro', () => {
      const phoneDigits = sampleClient.contact_phone?.replace(/\D/g, '') || ''
      expect(phoneDigits).toBe('11987654321')

      const waUrl = `https://wa.me/55${phoneDigits}`
      expect(waUrl).toBe('https://wa.me/5511987654321')

      expect(sampleClient.financial_due_date).toBe('Todo dia 15')
      expect(sampleClient.links).toHaveLength(2)
      expect(sampleClient.integration_items).toHaveLength(2)
    })
  })

  describe('2. Links de Cadastro Gerados — Exclusão e Estados', () => {
    const linkActive: ClientRegistrationLink = {
      id: 'link-active-01',
      token: 'tok-abc-001',
      created_by: 'user-admin',
      team_id: 'team-com',
      single_use: false,
      max_submissions: 5,
      submission_count: 2,
      include_financial: true,
      expires_at: new Date(Date.now() + 86400000 * 3).toISOString(),
      is_active: true,
      notes: 'Campanha Black Friday',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const linkExpired: ClientRegistrationLink = {
      id: 'link-exp-02',
      token: 'tok-exp-002',
      created_by: 'user-admin',
      team_id: null,
      single_use: true,
      max_submissions: 1,
      submission_count: 1,
      include_financial: false,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      is_active: false,
      notes: 'Link antigo',
      created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    }

    function calculateLinkStatus(link: ClientRegistrationLink): 'Ativo' | 'Desativado' | 'Expirado' | 'Esgotado' {
      if (!link.is_active) return 'Desativado'
      if (new Date(link.expires_at) <= new Date()) return 'Expirado'
      if (link.submission_count >= link.max_submissions) return 'Esgotado'
      return 'Ativo'
    }

    it('deve identificar status de links ativos e expirados', () => {
      expect(calculateLinkStatus(linkActive)).toBe('Ativo')
      expect(calculateLinkStatus(linkExpired)).toBe('Desativado')
    })

    it('deve simular exclusão do link e cascade de submissões em memória (modo preview)', () => {
      let linksList = [linkActive, linkExpired]
      let submissionsList: ClientRegistrationSubmission[] = [
        {
          id: 'sub-1',
          link_id: linkActive.id,
          client_id: null,
          data: { name: 'Cliente A' },
          status: 'pending',
          lgpd_accepted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: 'sub-2',
          link_id: linkExpired.id,
          client_id: null,
          data: { name: 'Cliente B' },
          status: 'approved',
          lgpd_accepted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ]

      // Exclusão do link linkActive
      const targetId = linkActive.id
      linksList = linksList.filter(l => l.id !== targetId)
      submissionsList = submissionsList.filter(s => s.link_id !== targetId)

      expect(linksList).toHaveLength(1)
      expect(linksList[0].id).toBe(linkExpired.id)
      expect(submissionsList).toHaveLength(1)
      expect(submissionsList[0].link_id).toBe(linkExpired.id)
    })
  })

  describe('3. Revisão de Cadastros Pendentes com Links Informados', () => {
    it('deve permitir inclusão e edição de links preenchidos pelo cliente na tela de revisão', () => {
      const submissionData: ClientRegistrationData = {
        name: 'Alfa Inovações',
        legal_name: 'Alfa Inovações Tecnológicas Ltda',
        cnpj_cpf: '00.123.456/0001-00',
        contact_name: 'Renata Castro',
        contact_email: 'renata@alfa.example',
        contact_phone: '(21) 97777-6666',
        links: [
          { label: 'Site', url: 'https://alfa.example' },
        ],
      }

      // Adição de mais um link durante a revisão
      const reviewedLinks: ClientLink[] = [
        ...(submissionData.links || []),
        { label: 'Portfólio', url: 'https://behance.net/alfa' },
      ]

      const approvedClient: Client = {
        id: 'client-new-01',
        name: submissionData.name,
        legal_name: submissionData.legal_name || null,
        contact_name: submissionData.contact_name || null,
        contact_email: submissionData.contact_email || null,
        contact_phone: submissionData.contact_phone || null,
        financial_contact_name: null,
        financial_email: null,
        financial_whatsapp: null,
        financial_due_date: null,
        financial_notes: null,
        links: reviewedLinks,
        integration_references: null,
        integration_items: [],
      }

      expect(approvedClient.links).toHaveLength(2)
      expect(approvedClient.links[1].label).toBe('Portfólio')
      expect(approvedClient.name).toBe('Alfa Inovações')
    })
  })

  describe('4. Regra de Exclusão de Cliente (Passo 2)', () => {
    function tryDeleteClient(
      client: Client,
      allTasks: Task[]
    ): { allowed: boolean; message: string } {
      const clientTasks = allTasks.filter(t => t.client_id === client.id)
      if (clientTasks.length > 0) {
        return {
          allowed: false,
          message: `Este cliente tem ${clientTasks.length} ${clientTasks.length === 1 ? 'demanda vinculada' : 'demandas vinculadas'}. Para excluí-lo, é necessário reatribuir ou excluir as demandas primeiro.`,
        }
      }
      return {
        allowed: true,
        message: `Cliente ${client.name} excluído com sucesso.`,
      }
    }

    it('deve BLOQUEAR a exclusão do cliente se houver demandas vinculadas', () => {
      const result = tryDeleteClient(sampleClient, tasks)
      expect(result.allowed).toBe(false)
      expect(result.message).toContain('Este cliente tem 2 demandas vinculadas')
    })

    it('deve PERMITIR a exclusão do cliente quando não houver demandas vinculadas', () => {
      const clientWithoutTasks: Client = {
        ...sampleClient,
        id: 'client-sem-tarefas',
        name: 'Cliente Sem Demandas',
      }
      const result = tryDeleteClient(clientWithoutTasks, tasks)
      expect(result.allowed).toBe(true)
      expect(result.message).toContain('Cliente Sem Demandas excluído com sucesso')
    })
  })
})
