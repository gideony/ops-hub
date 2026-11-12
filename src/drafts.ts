/**
 * Gerenciador de Rascunhos Seguros (Drafts)
 * 
 * Regras:
 * 1. Isolamento por usuário: chave 'somax_draft_${userId}_${formId}'.
 * 2. Sanitização estrita: NUNCA persistir segredos, chaves de API, senhas ou tokens.
 *    Para o cadastro de clientes, a aba 'Integração' (chaves e valores) é estritamente proibida.
 * 3. Validade temporal: rascunhos com mais de 24 horas são descartados automaticamente.
 * 4. Limpeza no logout voluntário: ao clicar em 'Sair', todos os rascunhos do usuário são apagados.
 *    Em caso de expiração passiva de sessão (SIGNED_OUT sem clique do usuário), os rascunhos são mantidos.
 */

export interface DraftEnvelope<T = Record<string, unknown>> {
  userId: string
  formId: string
  savedAt: number
  data: T
}

const DRAFT_PREFIX = 'somax_draft_'
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000 // 24 horas

const SENSITIVE_KEY_REGEX = /(?:^|_)(?:token|password|senha|secret|key|chave|api_key|apikey|auth|integration|integracao)(?:_|$)/i

/**
 * Sanitiza recursivamente um objeto ou valor, removendo chaves sensíveis.
 */
export function sanitizeDraftData<T>(input: T, formId?: string): T {
  if (input === null || typeof input !== 'object') {
    return input
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeDraftData(item, formId)) as unknown as T
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Proibir chaves sensíveis
    if (SENSITIVE_KEY_REGEX.test(key)) {
      continue
    }

    // Regra específica para o formulário de clientes: proibir aba/dados de integração
    if (formId === 'client_new') {
      if (key.toLowerCase().includes('integration') || key.toLowerCase().includes('integracao')) {
        continue
      }
    }

    sanitized[key] = sanitizeDraftData(value, formId)
  }

  return sanitized as T
}

/**
 * Retorna a chave de armazenamento para o rascunho de um formulário de um usuário.
 */
export function getDraftStorageKey(userId: string, formId: string): string {
  return `${DRAFT_PREFIX}${userId}_${formId}`
}

/**
 * Salva um rascunho no localStorage associado ao ID do usuário.
 */
export function saveDraft<T extends Record<string, unknown>>(userId: string, formId: string, data: T): void {
  if (!userId || !formId || typeof window === 'undefined') return

  try {
    const cleanData = sanitizeDraftData(data, formId)
    const envelope: DraftEnvelope<T> = {
      userId,
      formId,
      savedAt: Date.now(),
      data: cleanData,
    }
    window.localStorage.setItem(getDraftStorageKey(userId, formId), JSON.stringify(envelope))
  } catch {
    // Falha silenciosa em caso de cota de armazenamento ou restrição de cookies
  }
}

/**
 * Recupera um rascunho salvo se ele pertencer ao usuário e tiver menos de 24 horas de criação.
 * Se o rascunho tiver mais de 24 horas, é automaticamente removido e retorna null.
 */
export function getDraft<T>(userId: string, formId: string): T | null {
  if (!userId || !formId || typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(userId, formId))
    if (!raw) return null

    const envelope = JSON.parse(raw) as DraftEnvelope<T>

    if (envelope.userId !== userId || envelope.formId !== formId) {
      clearDraft(userId, formId)
      return null
    }

    const age = Date.now() - (envelope.savedAt || 0)
    if (age > MAX_DRAFT_AGE_MS || age < 0) {
      clearDraft(userId, formId)
      return null
    }

    return envelope.data
  } catch {
    clearDraft(userId, formId)
    return null
  }
}

/**
 * Remove um rascunho específico de um usuário.
 */
export function clearDraft(userId: string, formId: string): void {
  if (!userId || !formId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getDraftStorageKey(userId, formId))
  } catch {
    // Ignorar falha de remoção
  }
}

/**
 * Remove TODOS os rascunhos pertencentes a um usuário (usado no logout voluntário).
 */
export function clearUserDrafts(userId: string): void {
  if (!userId || typeof window === 'undefined') return
  try {
    const userPrefix = `${DRAFT_PREFIX}${userId}_`
    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(userPrefix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignorar erro
  }
}
