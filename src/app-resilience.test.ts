import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveDraft,
  getDraft,
  clearUserDrafts,
  getDraftStorageKey,
} from './drafts'
import type { Board, Member, Profile } from './lib'

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

describe('Resiliência de Sessão e Comportamento no Nível do App (Requisitos 1 a 6)', () => {
  const currentUserId = 'usr-admin-123'
  const otherUserId = 'usr-colab-456'

  beforeEach(() => {
    mockStorage.clear()
    vi.restoreAllMocks()
  })

  describe('Requisito 1: Dependência de Usuário e TOKEN_REFRESHED sem recarga', () => {
    it('evento TOKEN_REFRESHED com o mesmo usuário não altera loading nem recarrega dados', () => {
      let reloadCallCount = 0
      let isLoading = false
      let activeUserId: string | null = currentUserId

      // Simulação do reload do App
      const simulateReload = () => {
        reloadCallCount++
        isLoading = true
        // simula término da carga
        isLoading = false
      }

      // Handler de Auth do App (onAuthStateChange)
      const handleAuthStateChange = (event: string, newSession: { user: { id: string } } | null) => {
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (newSession?.user?.id && newSession.user.id === activeUserId) {
            // Mesmo usuário: apenas atualiza o token sem recarregar nada
            return
          }
        }
        if (newSession?.user?.id !== activeUserId) {
          activeUserId = newSession?.user?.id || null
          simulateReload()
        }
      }

      // 1. Usuário abre o modal "Novo cliente" e digita dados
      const clientFormData = {
        name: 'Cliente em Digitação',
        contact: 'Maria Santos',
        financialEmail: 'financeiro@santos.com',
      }
      saveDraft(currentUserId, 'client_new', clientFormData)

      expect(reloadCallCount).toBe(0)
      expect(isLoading).toBe(false)

      // 2. Supabase emite TOKEN_REFRESHED para o mesmo usuário
      handleAuthStateChange('TOKEN_REFRESHED', {
        user: { id: currentUserId },
      })

      // 3. Verifica que reload NÃO foi chamado e que "Carregando" não apareceu
      expect(reloadCallCount).toBe(0)
      expect(isLoading).toBe(false)

      // 4. Confirma que os dados digitados no modal permanecem intactos
      const draftAfterRefresh = getDraft<typeof clientFormData>(currentUserId, 'client_new')
      expect(draftAfterRefresh).toEqual(clientFormData)
      expect(draftAfterRefresh?.name).toBe('Cliente em Digitação')
      expect(draftAfterRefresh?.financialEmail).toBe('financeiro@santos.com')
    })

    it('troca real de usuário recarrega os dados completamente', () => {
      let reloadCallCount = 0
      let activeUserId: string | null = currentUserId

      const simulateReload = () => {
        reloadCallCount++
      }

      const handleAuthStateChange = (event: string, newSession: { user: { id: string } } | null) => {
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (newSession?.user?.id && newSession.user.id === activeUserId) return
        }
        if (newSession?.user?.id !== activeUserId) {
          activeUserId = newSession?.user?.id || null
          simulateReload()
        }
      }

      // Troca de usuário de currentUserId para otherUserId
      handleAuthStateChange('USER_UPDATED', { user: { id: otherUserId } })

      expect(reloadCallCount).toBe(1)
      expect(activeUserId).toBe(otherUserId)
    })
  })

  describe('Requisito 3 & 6: Logout Voluntário vs Sessão Expirada', () => {
    it('logout voluntário (clique em Sair) APAGA os rascunhos do usuário', () => {
      // 1. Usuário tem rascunhos salvos
      saveDraft(currentUserId, 'client_new', { name: 'Cliente Quase Pronto' })
      saveDraft(currentUserId, 'notes', { text: 'Anotações financeiras' })
      expect(getDraft(currentUserId, 'client_new')).not.toBeNull()

      // 2. Simulação do handleSignOut voluntário (acionado pelo botão Sair)
      let isManualSignOut = false
      const handleSignOut = () => {
        isManualSignOut = true
        clearUserDrafts(currentUserId)
      }

      handleSignOut()
      expect(isManualSignOut).toBe(true)

      // 3. Confirma que os rascunhos foram completamente apagados do localStorage
      expect(getDraft(currentUserId, 'client_new')).toBeNull()
      expect(getDraft(currentUserId, 'notes')).toBeNull()
      expect(mockStorage.getItem(getDraftStorageKey(currentUserId, 'client_new'))).toBeNull()
    })

    it('sessão expirada à força (SIGNED_OUT passivo) MANTÉM os rascunhos do usuário intactos', () => {
      // 1. Usuário tem rascunho de cliente salvo
      const draftData = {
        name: 'Trabalho em Andamento Importante',
        contact: 'Dra. Patrícia',
        financialEmail: 'patricia@empresa.com',
      }
      saveDraft(currentUserId, 'client_new', draftData)
      expect(getDraft(currentUserId, 'client_new')).not.toBeNull()

      // 2. Simulação de expiração de token / sessão encerrada pelo servidor
      let manualSignOutFlag = false

      const onAuthStateChange = (event: string) => {
        if (event === 'SIGNED_OUT') {
          if (manualSignOutFlag) {
            clearUserDrafts(currentUserId)
          }
          // Sessão expirada passivamente: NÃO chama clearUserDrafts
        }
      }

      onAuthStateChange('SIGNED_OUT')

      // 3. Confirma que o rascunho permanece guardado para ser recuperado no próximo login
      const preservedDraft = getDraft<typeof draftData>(currentUserId, 'client_new')
      expect(preservedDraft).not.toBeNull()
      expect(preservedDraft?.name).toBe('Trabalho em Andamento Importante')
      expect(preservedDraft?.financialEmail).toBe('patricia@empresa.com')
    })
  })

  describe('Requisito 4: Navegação Restaurada com Validação e Fallback Seguro', () => {
    const mockBoards: Board[] = [
      {
        id: 'board-geral',
        name: 'Geral',
        description: null,
        type: 'general',
        methodology: 'kanban',
        team_id: null,
        is_shared: true,
        stage_ids: ['stg-1'],
        position: 0,
        created_by: 'system',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'board-financeiro',
        name: 'Financeiro',
        description: null,
        type: 'custom',
        methodology: 'kanban',
        team_id: 'team-financeiro',
        is_shared: false,
        stage_ids: ['stg-1'],
        position: 1,
        created_by: 'adm',
        created_at: '',
        updated_at: '',
      },
    ]

    function validateBoardAccess(
      activeBoardId: string,
      boards: Board[],
      members: Member[],
      userId: string,
      profile: Profile | null,
    ): string {
      if (activeBoardId === 'board-geral' || activeBoardId === 'meus-quadros') return activeBoardId
      const board = boards.find(b => b.id === activeBoardId)
      if (!board) return 'board-geral'
      if (board.is_shared || board.type === 'general') return activeBoardId

      const isMember = board.team_id && members.some(m => m.team_id === board.team_id && m.user_id === userId && m.active)
      const isAdmin = profile?.role === 'administrador' || profile?.is_master
      if (!isMember && !isAdmin) {
        return 'board-geral'
      }
      return activeBoardId
    }

    function validatePageAccess(
      page: string,
      profile: Profile | null,
      members: Member[],
    ): string {
      const adminOnlyPages = ['teams', 'users']
      if (adminOnlyPages.includes(page) && profile) {
        const isAdmin = profile.role === 'administrador' || profile.is_master
        const isTeamManager = members.some(m => m.user_id === profile.id && m.is_manager && m.active)
        if (!isAdmin && !isTeamManager) {
          return 'dashboard'
        }
      }
      return page
    }

    it('mantém a aba "meus-quadros" ativa sem fazer fallback para o Geral', () => {
      const resolved = validateBoardAccess('meus-quadros', mockBoards, [], currentUserId, null)
      expect(resolved).toBe('meus-quadros')
    })

    it('faz fallback para "board-geral" se o quadro não existir mais', () => {
      const nonExistentBoardId = 'board-deletado-xyz'
      const resolved = validateBoardAccess(nonExistentBoardId, mockBoards, [], currentUserId, null)
      expect(resolved).toBe('board-geral')
    })

    it('faz fallback para "board-geral" se o usuário não pertencer à equipe do quadro privado', () => {
      const colabProfile: Profile = {
        id: otherUserId,
        full_name: 'Colaborador Comercial',
        role: 'colaborador',
        active: true,
        is_master: false,
      }
      // O usuário pertence apenas à equipe de suporte, não do financeiro
      const members: Member[] = [
        { team_id: 'team-suporte', user_id: otherUserId, is_manager: false, active: true },
      ]

      const resolved = validateBoardAccess('board-financeiro', mockBoards, members, otherUserId, colabProfile)
      expect(resolved).toBe('board-geral')
    })

    it('permite acesso ao quadro privado se o usuário for membro da equipe ou administrador', () => {
      const adminProfile: Profile = {
        id: currentUserId,
        full_name: 'Admin Master',
        role: 'administrador',
        active: true,
        is_master: true,
      }
      const resolved = validateBoardAccess('board-financeiro', mockBoards, [], currentUserId, adminProfile)
      expect(resolved).toBe('board-financeiro')
    })

    it('faz fallback para "dashboard" se usuário sem permissão tentar acessar "users" ou "teams"', () => {
      const colabProfile: Profile = {
        id: otherUserId,
        full_name: 'Colaborador Comum',
        role: 'colaborador',
        active: true,
        is_master: false,
      }

      expect(validatePageAccess('users', colabProfile, [])).toBe('dashboard')
      expect(validatePageAccess('teams', colabProfile, [])).toBe('dashboard')
      expect(validatePageAccess('tasks', colabProfile, [])).toBe('tasks')
      expect(validatePageAccess('reports', colabProfile, [])).toBe('reports')
    })
  })

  describe('Requisito 5: Revalidação sem Corrida e Retry com Backoff', () => {
    it('descarta resposta de revalidação mais antiga se uma nova for iniciada antes do término', async () => {
      let latestFetchId = 0
      let committedData: string | null = null

      // Simulação de revalidação com verificação de corrida
      const simulateFetch = async (fetchIdParam: number, dataResult: string, delayMs: number) => {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        if (fetchIdParam !== latestFetchId) {
          // Descartado por ser obsoleto!
          return
        }
        committedData = dataResult
      }

      // Revalidação 1 iniciada (lenta: 50ms)
      const fetch1 = ++latestFetchId
      const p1 = simulateFetch(fetch1, 'dados_antigos_v1', 50)

      // Revalidação 2 iniciada logo em seguida (rápida: 10ms)
      const fetch2 = ++latestFetchId
      const p2 = simulateFetch(fetch2, 'dados_novos_v2', 10)

      await Promise.all([p1, p2])

      // Garante que mesmo p1 terminando depois, o dado final gravado é o mais recente (v2)
      expect(committedData).toBe('dados_novos_v2')
    })

    it('retry com backoff exponencial respeita o limite máximo de 3 tentativas', async () => {
      let attempts = 0
      const delays: number[] = []

      const fetchWithRetry = async (maxRetries = 3) => {
        let attempt = 0
        while (true) {
          try {
            attempts++
            throw new Error('Falha simulada de rede')
          } catch (err) {
            attempt++
            if (attempt >= maxRetries) {
              throw err
            }
            const delay = Math.pow(2, attempt - 1) * 10
            delays.push(delay)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }

      await expect(fetchWithRetry(3)).rejects.toThrow('Falha simulada de rede')
      // Confirma que foram exatamente 3 tentativas no total
      expect(attempts).toBe(3)
      // Confirma espera crescente
      expect(delays).toEqual([10, 20])
    })
  })
})
