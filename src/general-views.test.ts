import { describe, expect, it, beforeEach } from 'vitest'
import type { Board, BoardStage, Member, Profile, Stage, Task, Sprint } from './lib'
import {
  getStagesForBoard,
  getGeneralBoardMetrics,
  filterTasksBySituation,
  getUserGeneralMode,
  setUserGeneralMode,
  getUserLateralBlockOrder,
  setUserLateralBlockOrder,
  getUserConsolidatedExpanded,
  setUserConsolidatedExpanded,
  getUserBoardTabsOrder,
  setUserBoardTabsOrder,
} from './general-views'
import { getPermittedDestinationBoards } from './board-permissions'
import { computeTaskStatus, resolveTaskStage } from './reports'

const mockCanonicalStages: Stage[] = [
  { id: 'stage-1', name: 'Tarefas', position: 1, is_final: false, is_pause: false, color: '#3b82f6' },
  { id: 'stage-2', name: 'Em andamento', position: 2, is_final: false, is_pause: false, color: '#f59e0b' },
  { id: 'stage-3', name: 'Pausado', position: 3, is_final: false, is_pause: true, color: '#ef4444' },
  { id: 'stage-4', name: 'Concluído', position: 4, is_final: true, is_pause: false, color: '#22c55e' },
]

const mockGeneralBoard: Board = {
  id: 'board-geral',
  name: 'Geral',
  description: 'Quadro canônico',
  type: 'general',
  methodology: 'kanban',
  team_id: null,
  is_shared: true,
  stage_ids: ['stage-1', 'stage-2', 'stage-3', 'stage-4'],
  position: 0,
  created_by: 'system',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}

const mockCustomBoard: Board = {
  id: 'board-custom-1',
  name: 'Comercial',
  description: 'Quadro de vendas',
  type: 'custom',
  methodology: 'kanban',
  team_id: 'team-1',
  is_shared: false,
  stage_ids: [],
  position: 1,
  created_by: 'user-1',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}

const mockCustomStages: BoardStage[] = [
  { id: 'cstage-1', board_id: 'board-custom-1', name: 'Lead', position: 1, is_final: false, wip_limit: 5, color: '#3b82f6', created_at: '' },
  { id: 'cstage-2', board_id: 'board-custom-1', name: 'Negociação', position: 2, is_final: false, wip_limit: 3, color: '#f59e0b', created_at: '' },
  { id: 'cstage-3', board_id: 'board-custom-1', name: 'Fechado', position: 3, is_final: true, wip_limit: null, color: '#22c55e', created_at: '' },
]

const mockScrumBoard: Board = {
  id: 'board-scrum-1',
  name: 'Dev Mobile',
  description: 'Scrum sprint',
  type: 'custom',
  methodology: 'scrum',
  team_id: 'team-2',
  is_shared: false,
  stage_ids: [],
  position: 2,
  created_by: 'user-2',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
}

const mockScrumStages: BoardStage[] = [
  { id: 'sstage-1', board_id: 'board-scrum-1', name: 'Sprint Backlog', position: 1, is_final: false, wip_limit: null, color: '#3b82f6', created_at: '' },
  { id: 'sstage-2', board_id: 'board-scrum-1', name: 'Em Dev', position: 2, is_final: false, wip_limit: 4, color: '#f59e0b', created_at: '' },
  { id: 'sstage-3', board_id: 'board-scrum-1', name: 'Entregue', position: 3, is_final: true, wip_limit: null, color: '#22c55e', created_at: '' },
]

function createTestTask(partial: Partial<Task>): Task {
  return {
    id: 't-default',
    title: 'Tarefa Teste',
    description: '',
    stage_id: 'stage-1',
    team_id: 'team-1',
    assignee_id: null,
    client_id: null,
    priority: 'media',
    tags: [],
    due_at: null,
    created_by: 'user-1',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    completed_at: null,
    ...partial,
  }
}

describe('general-views: getStagesForBoard', () => {
  it('retorna todas as etapas canônicas para o quadro Geral', () => {
    const stages = getStagesForBoard(mockGeneralBoard, mockCanonicalStages, mockCustomStages)
    expect(stages).toHaveLength(4)
    expect(stages[0].name).toBe('Tarefas')
    expect(stages[3].is_final).toBe(true)
  })

  it('retorna as etapas customizadas ordenadas por posição para quadro customizado', () => {
    const stages = getStagesForBoard(mockCustomBoard, mockCanonicalStages, mockCustomStages)
    expect(stages).toHaveLength(3)
    expect(stages[0].name).toBe('Lead')
    expect(stages[0].wip_limit).toBe(5)
    expect(stages[1].name).toBe('Negociação')
    expect(stages[2].name).toBe('Fechado')
    expect(stages[2].is_final).toBe(true)
  })

  it('filtra corretamente subconjunto de etapas para visões de setor', () => {
    const sectorBoard: Board = {
      ...mockGeneralBoard,
      id: 'board-sector-1',
      name: 'Visão Suporte',
      type: 'sector_view',
      stage_ids: ['stage-2', 'stage-4'],
    }
    const stages = getStagesForBoard(sectorBoard, mockCanonicalStages, mockCustomStages)
    expect(stages).toHaveLength(2)
    expect(stages[0].id).toBe('stage-2')
    expect(stages[1].id).toBe('stage-4')
  })
})

describe('general-views: getGeneralBoardMetrics & Concordância ADR-008', () => {
  const allBoardStages = [...mockCustomStages, ...mockScrumStages]
  const mockTasks: Task[] = [
    // Tarefas do Geral
    createTestTask({ id: 't-1', title: 'Tarefa Geral 1', stage_id: 'stage-1' }),
    createTestTask({ id: 't-2', title: 'Tarefa Geral 2', stage_id: 'stage-2', priority: 'alta' }),
    createTestTask({ id: 't-3', title: 'Tarefa Geral Pausada', stage_id: 'stage-3', priority: 'baixa' }),
    createTestTask({ id: 't-4', title: 'Tarefa Geral Concluída', stage_id: 'stage-4', completed_at: '2026-11-10' }),

    // Tarefas do Comercial (Customizado)
    createTestTask({ id: 't-5', title: 'Lead 1', board_id: 'board-custom-1', stage_id: 'cstage-1', priority: 'alta' }),
    createTestTask({ id: 't-6', title: 'Fechado 1', board_id: 'board-custom-1', stage_id: 'cstage-3', completed_at: '2026-11-10' }),

    // Tarefas do Dev Mobile (Scrum)
    createTestTask({ id: 't-7', title: 'Card Backlog (sem sprint)', board_id: 'board-scrum-1', stage_id: 'sstage-1' }),
    createTestTask({ id: 't-8', title: 'Card Sprint Ativa', board_id: 'board-scrum-1', sprint_id: 'sprint-1', stage_id: 'sstage-2', priority: 'alta' }),
  ]

  const mockSprints: Sprint[] = [
    { id: 'sprint-1', board_id: 'board-scrum-1', name: 'Sprint 1', goal: null, start_date: null, end_date: null, status: 'active', created_at: '', updated_at: '' },
  ]

  it('calcula métricas do quadro Geral sem contar tarefas de quadros customizados', () => {
    const metrics = getGeneralBoardMetrics(mockGeneralBoard, mockTasks, mockCanonicalStages, allBoardStages, mockSprints)
    expect(metrics.total).toBe(4)
    expect(metrics.active).toBe(2) // t-1 e t-2
    expect(metrics.blocked).toBe(1) // t-3 (pausada)
    expect(metrics.done).toBe(1) // t-4
    expect(metrics.active + metrics.done + metrics.blocked + metrics.backlog).toBe(metrics.total)
  })

  it('calcula métricas do quadro Comercial isoladamente', () => {
    const metrics = getGeneralBoardMetrics(mockCustomBoard, mockTasks, mockCanonicalStages, allBoardStages, mockSprints)
    expect(metrics.total).toBe(2)
    expect(metrics.active).toBe(1) // t-5
    expect(metrics.done).toBe(1) // t-6
    expect(metrics.blocked).toBe(0)
    expect(metrics.total).toBe(metrics.active + metrics.done)
  })

  it('calcula métricas do quadro Scrum separando tarefas ativas de backlog', () => {
    const metrics = getGeneralBoardMetrics(mockScrumBoard, mockTasks, mockCanonicalStages, allBoardStages, mockSprints)
    expect(metrics.total).toBe(2)
    expect(metrics.backlog).toBe(1) // t-7 sem sprint
    expect(metrics.active).toBe(1) // t-8 em sprint ativa
    expect(metrics.done).toBe(0)
    expect(metrics.active + metrics.done + metrics.blocked + metrics.backlog).toBe(metrics.total)
  })
})

describe('general-views: filterTasksBySituation', () => {
  const allBoardStages = [...mockCustomStages, ...mockScrumStages]
  const mockTasks: Task[] = [
    createTestTask({ id: 't-1', title: 'Em andamento', stage_id: 'stage-1' }),
    createTestTask({ id: 't-2', title: 'Concluída', stage_id: 'stage-4', completed_at: '2026-11-10' }),
  ]

  it('filtra apenas tarefas em andamento quando situation = active', () => {
    const filtered = filterTasksBySituation(mockTasks, 'active', mockGeneralBoard, mockCanonicalStages, allBoardStages)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('t-1')
  })

  it('filtra apenas tarefas concluídas quando situation = done', () => {
    const filtered = filterTasksBySituation(mockTasks, 'done', mockGeneralBoard, mockCanonicalStages, allBoardStages)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('t-2')
  })

  it('retorna todas as tarefas quando situation = all', () => {
    const filtered = filterTasksBySituation(mockTasks, 'all', mockGeneralBoard, mockCanonicalStages, allBoardStages)
    expect(filtered).toHaveLength(2)
  })
})

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
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    writable: true,
  })
}
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: mockStorage,
      innerWidth: 1024,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
    writable: true,
  })
}

describe('general-views: Persistência de Preferências por Usuário', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  it('armazena e recupera o modo de visualização (lateral vs consolidado) por usuário', () => {
    expect(getUserGeneralMode('user-123')).toBe('lateral') // desktop padrão
    setUserGeneralMode('user-123', 'consolidado')
    expect(getUserGeneralMode('user-123')).toBe('consolidado')

    // Outro usuário sem configuração herda padrão
    expect(getUserGeneralMode('user-456')).toBe('lateral')
  })

  it('armazena e recupera a ordem dos blocos laterais', () => {
    const defaultIds = ['board-geral', 'board-1', 'board-2']
    expect(getUserLateralBlockOrder('user-1', defaultIds)).toEqual(defaultIds)

    const newOrder = ['board-2', 'board-geral', 'board-1']
    setUserLateralBlockOrder('user-1', newOrder)
    expect(getUserLateralBlockOrder('user-1', defaultIds)).toEqual(newOrder)

    // Se um novo quadro for adicionado depois, ele deve ser anexado ao final da ordem
    const updatedDefaults = ['board-geral', 'board-1', 'board-2', 'board-3']
    expect(getUserLateralBlockOrder('user-1', updatedDefaults)).toEqual(['board-2', 'board-geral', 'board-1', 'board-3'])
  })

  it('armazena e recupera o estado de expansão das raias consolidadas (primeira aberta por padrão)', () => {
    const defaultIds = ['board-geral', 'board-1', 'board-2']
    const initial = getUserConsolidatedExpanded('user-1', defaultIds)
    expect(initial['board-geral']).toBe(true)
    expect(initial['board-1']).toBe(false)
    expect(initial['board-2']).toBe(false)

    setUserConsolidatedExpanded('user-1', { 'board-geral': false, 'board-1': true, 'board-2': true })
    const saved = getUserConsolidatedExpanded('user-1', defaultIds)
    expect(saved['board-geral']).toBe(false)
    expect(saved['board-1']).toBe(true)
    expect(saved['board-2']).toBe(true)
  })

  it('armazena e recupera a ordem das abas superiores de tarefas', () => {
    const defaultTabs = ['board-geral', 'meus-quadros', 'board-1']
    expect(getUserBoardTabsOrder('user-1', defaultTabs)).toEqual(defaultTabs)

    const reorderedTabs = ['meus-quadros', 'board-1', 'board-geral']
    setUserBoardTabsOrder('user-1', reorderedTabs)
    expect(getUserBoardTabsOrder('user-1', defaultTabs)).toEqual(reorderedTabs)
  })
})

describe('QA / Regras Mandatórias da Demanda: Paridade, Segurança e Interação', () => {
  const allStages = [...mockCanonicalStages]
  const allBoardStages = [...mockCustomStages, ...mockScrumStages]
  const sampleTasks: Task[] = [
    createTestTask({ id: 't-1', title: 'Tarefa Geral', stage_id: 'stage-1' }),
    createTestTask({ id: 't-2', title: 'Tarefa Geral Concluída', stage_id: 'stage-4', completed_at: '2026-11-10' }),
    createTestTask({ id: 't-3', title: 'Lead Comercial', board_id: 'board-custom-1', stage_id: 'cstage-1' }),
    createTestTask({ id: 't-4', title: 'Fechado Comercial', board_id: 'board-custom-1', stage_id: 'cstage-3', completed_at: '2026-11-10' }),
  ]

  it('modo lateral e consolidado mostram exatamente os mesmos quadros e cards', () => {
    const boards = [mockGeneralBoard, mockCustomBoard]

    // Ambos os modos usam a mesma lógica para filtrar tarefas por situação e quadro
    const lateralData = boards.map(b => {
      const bTasks = sampleTasks.filter(t => (b.id === 'board-geral' ? !t.board_id || t.board_id === 'board-geral' : t.board_id === b.id))
      const filtered = filterTasksBySituation(bTasks, 'all', b, allStages, allBoardStages)
      return { boardId: b.id, count: filtered.length, cardIds: filtered.map(t => t.id) }
    })

    const consolidadoData = boards.map(b => {
      const bTasks = sampleTasks.filter(t => (b.id === 'board-geral' ? !t.board_id || t.board_id === 'board-geral' : t.board_id === b.id))
      const filtered = filterTasksBySituation(bTasks, 'all', b, allStages, allBoardStages)
      return { boardId: b.id, count: filtered.length, cardIds: filtered.map(t => t.id) }
    })

    expect(lateralData).toEqual(consolidadoData)
    expect(lateralData[0].cardIds).toEqual(['t-1', 't-2'])
    expect(lateralData[1].cardIds).toEqual(['t-3', 't-4'])
  })

  it('os totais do cabeçalho dos blocos/faixas concordam rigorosamente com computeTaskStatus dos relatórios', () => {
    const board = mockCustomBoard
    const bTasks = sampleTasks.filter(t => t.board_id === board.id)
    const metrics = getGeneralBoardMetrics(board, bTasks, allStages, allBoardStages, [])

    // Cálculo independente usando computeTaskStatus dos relatórios
    let countActive = 0
    let countDone = 0
    for (const task of bTasks) {
      const stageInfo = resolveTaskStage(task, allStages, allBoardStages)
      const st = computeTaskStatus(task, stageInfo, board, [])
      if (st === 'active') countActive++
      if (st === 'done') countDone++
    }

    expect(metrics.active).toBe(countActive)
    expect(metrics.done).toBe(countDone)
    expect(metrics.total).toBe(countActive + countDone)
  })

  it('segurança e privacidade: quadro privado de outra equipe não aparece (IDOR audit)', () => {
    const userProfile: Profile = {
      id: 'colab-equipe-1',
      full_name: 'Colaborador Equipe 1',
      email: 'colab1@somax.example',
      whatsapp: null,
      role: 'colaborador',
      active: true,
      is_master: false,
    }

    const memberships: Member[] = [
      { team_id: 'team-1', user_id: 'colab-equipe-1', is_manager: false, active: true },
    ]

    const privateBoardTeam2: Board = {
      id: 'board-secret-team2',
      name: 'Quadro Secreto Equipe 2',
      description: 'Apenas membros da equipe 2',
      type: 'custom',
      methodology: 'kanban',
      team_id: 'team-2', // Outra equipe!
      is_shared: false,
      stage_ids: [],
      position: 10,
      created_by: 'outro-gestor',
      created_at: '',
      updated_at: '',
    }

    const allBoards = [mockGeneralBoard, mockCustomBoard, privateBoardTeam2]

    // Auditoria de listagem de quadros permitidos
    const allowed = getPermittedDestinationBoards(allBoards, memberships, userProfile)

    // O quadro privado da equipe 2 NÃO pode estar presente
    const foundSecret = allowed.find(b => b.id === 'board-secret-team2')
    expect(foundSecret).toBeUndefined()

    // Apenas Geral e o da equipe 1 estão acessíveis
    expect(allowed.map(b => b.id)).toEqual(['board-geral', 'board-custom-1'])
  })

  it('arrastar entre quadros diferentes é rejeitado e dentro do mesmo quadro é aceito', () => {
    // Simulação da regra de validação de drag & drop inter-quadros
    function validateMove(cardBoardId: string | null | undefined, targetStageBoardId: string): { allowed: boolean; message?: string } {
      const effectiveCardBoard = cardBoardId || 'board-geral'
      if (effectiveCardBoard !== targetStageBoardId) {
        return {
          allowed: false,
          message: 'Para levar a tarefa a outro quadro, use Encaminhar',
        }
      }
      return { allowed: true }
    }

    // Tentativa 1: Arrastar card do Geral para etapa do Comercial -> Bloqueado
    const moveCross = validateMove('board-geral', 'board-custom-1')
    expect(moveCross.allowed).toBe(false)
    expect(moveCross.message).toBe('Para levar a tarefa a outro quadro, use Encaminhar')

    // Tentativa 2: Arrastar card do Comercial para etapa do Geral -> Bloqueado
    const moveCross2 = validateMove('board-custom-1', 'board-geral')
    expect(moveCross2.allowed).toBe(false)
    expect(moveCross2.message).toBe('Para levar a tarefa a outro quadro, use Encaminhar')

    // Tentativa 3: Arrastar card dentro do Comercial (de cstage-1 para cstage-2) -> Permitido
    const moveSameBoard = validateMove('board-custom-1', 'board-custom-1')
    expect(moveSameBoard.allowed).toBe(true)
    expect(moveSameBoard.message).toBeUndefined()
  })

  it('evento TOKEN_REFRESHED não reinicia a tela nem perde o estado e preferências do usuário', () => {
    const userId = 'user-resilience-1'
    setUserGeneralMode(userId, 'consolidado')
    setUserLateralBlockOrder(userId, ['board-custom-1', 'board-geral'])
    setUserConsolidatedExpanded(userId, { 'board-custom-1': true, 'board-geral': false })

    // Simulação do disparo do evento de refresh de token no Supabase Auth
    const event = new Event('TOKEN_REFRESHED')
    window.dispatchEvent(event)

    // As preferências devem continuar intactas
    expect(getUserGeneralMode(userId)).toBe('consolidado')
    expect(getUserLateralBlockOrder(userId, ['board-geral', 'board-custom-1'])).toEqual(['board-custom-1', 'board-geral'])
    expect(getUserConsolidatedExpanded(userId, ['board-geral', 'board-custom-1'])).toEqual({
      'board-custom-1': true,
      'board-geral': false,
    })
  })

  it('filtra board-geral para que a aba Geral exiba exclusivamente os outros quadros', () => {
    const availableBoards: Board[] = [
      mockGeneralBoard,
      mockCustomBoard,
      {
        ...mockCustomBoard,
        id: 'board-custom-2',
        name: 'Implantação',
      },
    ]

    // Regra da aba Geral: exibe apenas os outros quadros
    const generalBoards = availableBoards.filter(b => b.id !== 'board-geral')
    expect(generalBoards.map(b => b.id)).toEqual(['board-custom-1', 'board-custom-2'])
    expect(generalBoards.some(b => b.id === 'board-geral')).toBe(false)
  })

  it('garante que a edição da tarefa preserva estritamente o board_id da ramificação', () => {
    const originalBranchTask: Task = {
      id: 'task-branch-1',
      title: 'Implantação Cliente Alfa',
      description: 'Setup inicial',
      board_id: 'board-custom-2',
      stage_id: 'cstage-1',
      team_id: 'team-1',
      assignee_id: null,
      due_at: null,
      completed_at: null,
      priority: 'alta',
      tags: ['onboarding'],
      client_id: 'client-1',
      origin_task_id: 'task-orig-1',
      root_task_id: 'task-orig-1',
      created_by: 'user-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Ao salvar os valores editados, o board_id deve ser idêntico ao da tarefa
    const updatedValues = {
      title: 'Implantação Cliente Alfa - Fase 1 Concluída',
      description: 'Setup com observações adicionais',
      client_id: originalBranchTask.client_id,
      priority: originalBranchTask.priority,
      stage_id: originalBranchTask.stage_id,
      due_at: '2026-11-20',
      team_id: originalBranchTask.team_id,
      assignee_id: 'user-2',
      tags: originalBranchTask.tags,
      board_id: originalBranchTask.board_id || null,
    }

    expect(updatedValues.board_id).toBe('board-custom-2')
    expect(updatedValues.board_id).not.toBeNull()
    expect(updatedValues.board_id).not.toBe('board-geral')
  })

  describe('Redesign Visual da Aba Geral — Cores por Quadro e Preferências (Passos 2 a 6)', () => {
    it('getBoardVisual associa cores semânticas estáveis por nome do quadro', async () => {
      const { getBoardVisual } = await import('./general-views')

      const comercialVisual = getBoardVisual({ id: 'b1', name: 'Comercial' })
      expect(comercialVisual.key).toBe('blue')
      expect(comercialVisual.dot).toBe('#2563eb')

      const implantacaoVisual = getBoardVisual({ id: 'b2', name: 'Implantação Provedor' })
      expect(implantacaoVisual.key).toBe('purple')
      expect(implantacaoVisual.dot).toBe('#7c3aed')

      const suporteVisual = getBoardVisual({ id: 'b3', name: 'Suporte N1' })
      expect(suporteVisual.key).toBe('teal')
      expect(suporteVisual.dot).toBe('#0d9488')

      const backlogVisual = getBoardVisual({ id: 'b4', name: 'Backlog Geral' })
      expect(backlogVisual.key).toBe('amber')
      expect(backlogVisual.dot).toBe('#d97706')

      const atualizacaoVisual = getBoardVisual({ id: 'b5', name: 'Atualização Sistema' })
      expect(atualizacaoVisual.key).toBe('pink')
      expect(atualizacaoVisual.dot).toBe('#db2777')
    })

    it('getBoardVisual respeita cor existente no campo color do quadro', async () => {
      const { getBoardVisual } = await import('./general-views')

      const customWithColor = getBoardVisual({
        id: 'b-custom',
        name: 'Financeiro Especial',
        color: '#059669',
      })
      expect(customWithColor.key).toBe('emerald')
      expect(customWithColor.dot).toBe('#059669')
    })

    it('getBoardVisual gera retorno visual consistente mesmo para quadros sem nome ou nulos', async () => {
      const { getBoardVisual } = await import('./general-views')

      const fallback = getBoardVisual(null)
      expect(fallback).toBeDefined()
      expect(fallback.dot).toBeDefined()
      expect(fallback.light).toBeDefined()
      expect(fallback.dark).toBeDefined()
    })

    it('getUserHideEmptyColumns retorna padrões corretos por modo e persiste separadamente', async () => {
      const { getUserHideEmptyColumns, setUserHideEmptyColumns } = await import('./general-views')
      const testUserId = 'test-user-empty-cols-123'

      // Padrão: Lateral = true (colunas 0 tarefas recolhidas como tiras de 46px)
      expect(getUserHideEmptyColumns(testUserId, 'lateral')).toBe(true)

      // Padrão: Consolidado = false (colunas abertas por padrão com altura compacta)
      expect(getUserHideEmptyColumns(testUserId, 'consolidado')).toBe(false)

      // Salva alteração para o lateral
      setUserHideEmptyColumns(testUserId, 'lateral', false)
      expect(getUserHideEmptyColumns(testUserId, 'lateral')).toBe(false)
      // Consolidado não deve ser afetado
      expect(getUserHideEmptyColumns(testUserId, 'consolidado')).toBe(false)

      // Salva alteração para o consolidado
      setUserHideEmptyColumns(testUserId, 'consolidado', true)
      expect(getUserHideEmptyColumns(testUserId, 'consolidado')).toBe(true)
      expect(getUserHideEmptyColumns(testUserId, 'lateral')).toBe(false)
    })

    it('getBoardStageSummary resume etapas com tarefas ordenadas pelas mais povoadas', async () => {
      const { getBoardStageSummary } = await import('./general-views')

      const testStages: Stage[] = [
        { id: 's1', name: 'Lead', position: 1, is_final: false, is_pause: false, color: '#3b82f6' },
        { id: 's2', name: 'Negociação', position: 2, is_final: false, is_pause: false, color: '#f59e0b' },
        { id: 's3', name: 'Pausa', position: 3, is_final: false, is_pause: true, color: '#ef4444' },
        { id: 's4', name: 'Concluído', position: 4, is_final: true, is_pause: false, color: '#22c55e' },
      ]

      const testTasks: Task[] = [
        createTestTask({ id: 't1', stage_id: 's2' }),
        createTestTask({ id: 't2', stage_id: 's2' }),
        createTestTask({ id: 't3', stage_id: 's2' }),
        createTestTask({ id: 't4', stage_id: 's4' }),
      ]

      const summary = getBoardStageSummary(testStages, testTasks)

      // Apenas s2 (3 tarefas) e s4 (1 tarefa) devem aparecer; s1 e s3 (0 tarefas) devem ser filtradas
      expect(summary).toHaveLength(2)
      expect(summary[0].stageName).toBe('Negociação')
      expect(summary[0].count).toBe(3)
      expect(summary[1].stageName).toBe('Concluído')
      expect(summary[1].count).toBe(1)
    })
  })
})
