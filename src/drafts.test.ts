import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveDraft,
  getDraft,
  clearDraft,
  clearUserDrafts,
  sanitizeDraftData,
  getDraftStorageKey,
} from './drafts'

class LocalStorageMock {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

const mockStorage = new LocalStorageMock()
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: mockStorage },
  writable: true,
})

describe('Módulo de Rascunhos Seguros (drafts.ts)', () => {
  const userIdA = 'usr-uuid-1111'
  const userIdB = 'usr-uuid-2222'
  const formId = 'client_new'

  beforeEach(() => {
    mockStorage.clear()
    vi.restoreAllMocks()
  })

  describe('Requisito 2: Sanitização e Segurança de Rascunhos', () => {
    it('proíbe a persistência de chaves confidenciais como senhas, tokens e chaves de API', () => {
      const dataWithSecrets = {
        name: 'Cliente Alpha',
        contact: 'João Silva',
        password: 'senha_super_secreta',
        token: 'jwt_token_sensivel',
        api_key: 'sk_live_12345',
        secret_chave: 'chave_privada',
        auth_token: 'bearer_token',
      }

      const sanitized = sanitizeDraftData(dataWithSecrets)
      expect(sanitized).toEqual({
        name: 'Cliente Alpha',
        contact: 'João Silva',
      })
      expect((sanitized as Record<string, unknown>).password).toBeUndefined()
      expect((sanitized as Record<string, unknown>).token).toBeUndefined()
      expect((sanitized as Record<string, unknown>).api_key).toBeUndefined()
    })

    it('no formulário client_new, exclui estritamente a aba e os dados de integração', () => {
      const clientFormData = {
        name: 'OPSHUB Tech Ltda',
        legal: 'OPSHUB Tecnologia',
        contact: 'Carlos Oliveira',
        email: 'carlos@opshub.com',
        phone: '(11) 98888-7777',
        financialContact: 'Ana Financeiro',
        financialEmail: 'financeiro@opshub.com',
        financialWhatsapp: '(11) 97777-6666',
        financialDueDate: '2026-12-10',
        financial: 'Faturamento direto via boleto',
        links: [{ first: 'Portal', second: 'https://cliente.com' }],
        // Campos proibidos da aba Integração
        integrations: [{ first: 'API Key', second: 'segredo123' }],
        integration_items: [{ key: 'URL Webhook', value: 'https://webhook.com' }],
        integration_references: 'webhook_secret',
      }

      saveDraft(userIdA, formId, clientFormData)
      const stored = getDraft<typeof clientFormData>(userIdA, formId)

      expect(stored).not.toBeNull()
      expect(stored?.name).toBe('OPSHUB Tech Ltda')
      expect(stored?.financialContact).toBe('Ana Financeiro')
      expect(stored?.financialEmail).toBe('financeiro@opshub.com')
      expect(stored?.financialDueDate).toBe('2026-12-10')
      expect(stored?.financial).toBe('Faturamento direto via boleto')
      expect(stored?.links).toHaveLength(1)

      // Garantir que NENHUM dado de integração foi persistido
      expect((stored as Record<string, unknown>).integrations).toBeUndefined()
      expect((stored as Record<string, unknown>).integration_items).toBeUndefined()
      expect((stored as Record<string, unknown>).integration_references).toBeUndefined()

      // Verificar direto na string salva no localStorage
      const rawInStorage = mockStorage.getItem(getDraftStorageKey(userIdA, formId))
      expect(rawInStorage).not.toContain('segredo123')
      expect(rawInStorage).not.toContain('webhook_secret')
    })
  })

  describe('Requisito 3: Isolamento por Usuário, Expiração de 24h e Limpeza de Logout', () => {
    it('isola rascunhos por ID de usuário (outro login no mesmo navegador não vê o rascunho)', () => {
      saveDraft(userIdA, formId, { name: 'Cliente de A' })
      saveDraft(userIdB, formId, { name: 'Cliente de B' })

      const draftA = getDraft<{ name: string }>(userIdA, formId)
      const draftB = getDraft<{ name: string }>(userIdB, formId)

      expect(draftA?.name).toBe('Cliente de A')
      expect(draftB?.name).toBe('Cliente de B')
    })

    it('descarta automaticamente rascunhos com mais de 24 horas', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      saveDraft(userIdA, formId, { name: 'Rascunho Fresco' })
      expect(getDraft(userIdA, formId)).not.toBeNull()

      // Avançar o tempo em 24 horas e 1 minuto
      const past24Hours = now + (24 * 60 * 60 * 1000) + 60000
      vi.spyOn(Date, 'now').mockReturnValue(past24Hours)

      const expired = getDraft(userIdA, formId)
      expect(expired).toBeNull()

      // Certificar que a chave foi limpa do localStorage
      expect(mockStorage.getItem(getDraftStorageKey(userIdA, formId))).toBeNull()
    })

    it('clearDraft remove apenas o formulário especificado', () => {
      saveDraft(userIdA, 'form_1', { data: 'um' })
      saveDraft(userIdA, 'form_2', { data: 'dois' })

      clearDraft(userIdA, 'form_1')

      expect(getDraft(userIdA, 'form_1')).toBeNull()
      expect(getDraft(userIdA, 'form_2')).not.toBeNull()
    })

    it('clearUserDrafts apaga todos os rascunhos do usuário no logout voluntário sem afetar outro usuário', () => {
      saveDraft(userIdA, 'client_new', { name: 'Cliente A1' })
      saveDraft(userIdA, 'task_new', { title: 'Tarefa A2' })
      saveDraft(userIdB, 'client_new', { name: 'Cliente B1' })

      // Logout voluntário de A
      clearUserDrafts(userIdA)

      expect(getDraft(userIdA, 'client_new')).toBeNull()
      expect(getDraft(userIdA, 'task_new')).toBeNull()

      // Os rascunhos de B permanecem intactos
      expect(getDraft(userIdB, 'client_new')).toEqual({ name: 'Cliente B1' })
    })
  })
})
