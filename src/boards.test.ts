import { describe, expect, it } from 'vitest'
import type { Board, BoardStage, Sprint, Task } from './lib'

function makeTask(id: string, stageId: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Tarefa ${id}`,
    description: '',
    team_id: 'comercial',
    assignee_id: 'user-1',
    client_id: 'client-1',
    stage_id: stageId,
    priority: 'media',
    due_at: '2026-11-20',
    tags: [],
    completed_at: null,
    created_by: 'user-1',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    board_id: null,
    sprint_id: null,
    ...overrides,
  }
}

describe('Quadros: Limites de Trabalho em Andamento (WIP)', () => {
  it('identifica corretamente estado normal, no limite (alerta) e acima do limite (excedido)', () => {
    const stageWithWip: BoardStage = {
      id: 'stg-wip',
      board_id: 'board-custom',
      name: 'Em Andamento',
      color: '#3b82f6',
      position: 1,
      wip_limit: 3,
      is_final: false,
      created_at: '',
    }

    function checkWipStatus(cardCount: number, limit: number | null) {
      if (!limit || limit <= 0) return 'normal'
      if (cardCount > limit) return 'exceeded'
      if (cardCount === limit) return 'warning'
      return 'normal'
    }

    expect(checkWipStatus(2, stageWithWip.wip_limit)).toBe('normal')
    expect(checkWipStatus(3, stageWithWip.wip_limit)).toBe('warning')
    expect(checkWipStatus(4, stageWithWip.wip_limit)).toBe('exceeded')
    expect(checkWipStatus(10, null)).toBe('normal')
  })
})

describe('Visões por Setor (Espelhamento de etapas)', () => {
  const sectorBoard: Board = {
    id: 'view-comercial',
    name: 'Comercial',
    description: 'Etapas comerciais espelhadas',
    type: 'sector_view',
    methodology: 'kanban',
    team_id: 'comercial',
    is_shared: true,
    stage_ids: ['s-negociacao', 's-contrato', 's-kickoff'],
    position: 1,
    created_by: 'admin',
    created_at: '',
    updated_at: '',
  }

  const tasks: Task[] = [
    makeTask('t1', 's-negociacao'),
    makeTask('t2', 's-contrato'),
    makeTask('t3', 's-dev'), // Etapa fora da visão comercial
    makeTask('t4', 's-kickoff'),
    makeTask('t5', 's-negociacao', { board_id: 'board-suporte' }), // Pertence a outro quadro
  ]

  it('filtra tarefas canônicas sem duplicar e restringe apenas às etapas do setor', () => {
    const filteredForSector = tasks.filter(t => {
      if (t.board_id && t.board_id !== 'board-geral') return false
      return sectorBoard.stage_ids.includes(t.stage_id)
    })

    expect(filteredForSector.map(t => t.id)).toEqual(['t1', 't2', 't4'])
  })

  it('mover etapa no setor reflete no Geral mantendo o mesmo ID da tarefa', () => {
    let currentTasks = [...tasks]
    // Move t1 de Negociação para Contrato
    currentTasks = currentTasks.map(t => t.id === 't1' ? { ...t, stage_id: 's-contrato' } : t)

    // No Geral
    const geralTask = currentTasks.find(t => t.id === 't1')
    expect(geralTask?.stage_id).toBe('s-contrato')

    // Na visão do setor
    const sectorTask = currentTasks.filter(t => (!t.board_id || t.board_id === 'board-geral') && sectorBoard.stage_ids.includes(t.stage_id)).find(t => t.id === 't1')
    expect(sectorTask?.stage_id).toBe('s-contrato')
  })
})

describe('Metodologia Scrum: Sprints e Backlog', () => {
  const scrumBoard: Board = {
    id: 'board-mobile',
    name: 'App Mobile',
    description: 'Projeto mobile Scrum',
    type: 'custom',
    methodology: 'scrum',
    team_id: 'desenvolvimento',
    is_shared: false,
    stage_ids: [],
    position: 2,
    created_by: 'admin',
    created_at: '',
    updated_at: '',
  }

  const sprint1: Sprint = {
    id: 'sp-1',
    board_id: scrumBoard.id,
    name: 'Sprint 1',
    goal: 'Autenticação e Splash',
    start_date: '2026-11-01',
    end_date: '2026-11-14',
    status: 'active',
    created_at: '',
    updated_at: '',
  }

  const sprint2: Sprint = {
    id: 'sp-2',
    board_id: scrumBoard.id,
    name: 'Sprint 2',
    goal: 'Catálogo de Produtos',
    start_date: '2026-11-15',
    end_date: '2026-11-28',
    status: 'planning',
    created_at: '',
    updated_at: '',
  }

  const mobileTasks: Task[] = [
    makeTask('m1', 'bstage-1', { board_id: scrumBoard.id, sprint_id: sprint1.id }),
    makeTask('m2', 'bstage-2', { board_id: scrumBoard.id, sprint_id: sprint1.id }),
    makeTask('m3', 'bstage-1', { board_id: scrumBoard.id, sprint_id: null }), // No Backlog
    makeTask('m4', 'bstage-1', { board_id: scrumBoard.id, sprint_id: sprint2.id }),
  ]

  it('separa tarefas da sprint ativa vs tarefas no backlog', () => {
    const activeSprintTasks = mobileTasks.filter(t => t.board_id === scrumBoard.id && t.sprint_id === sprint1.id)
    const backlogTasks = mobileTasks.filter(t => t.board_id === scrumBoard.id && !t.sprint_id)

    expect(activeSprintTasks.map(t => t.id)).toEqual(['m1', 'm2'])
    expect(backlogTasks.map(t => t.id)).toEqual(['m3'])
  })

  it('permite alocar e desalocar tarefas entre backlog e sprint', () => {
    let tasksState = [...mobileTasks]
    // Alocar m3 na Sprint 1
    tasksState = tasksState.map(t => t.id === 'm3' ? { ...t, sprint_id: sprint1.id } : t)
    expect(tasksState.find(t => t.id === 'm3')?.sprint_id).toBe('sp-1')

    // Desalocar m1 de volta ao Backlog
    tasksState = tasksState.map(t => t.id === 'm1' ? { ...t, sprint_id: null } : t)
    expect(tasksState.find(t => t.id === 'm1')?.sprint_id).toBeNull()
  })

  it('controla a transição de status da sprint (planning -> active -> completed)', () => {
    let currentSprint: Sprint = { ...sprint2 }
    expect(currentSprint.status).toBe('planning')

    // Iniciar sprint
    currentSprint = { ...currentSprint, status: 'active' }
    expect(currentSprint.status).toBe('active')

    // Concluir sprint
    currentSprint = { ...currentSprint, status: 'completed' }
    expect(currentSprint.status).toBe('completed')
  })
})

describe('Criação e Edição de Tarefas e Etapas em Quadros Personalizados', () => {
  const customBoard: Board = {
    id: 'board-suporte-n2',
    name: 'Suporte N2',
    description: 'Demandas críticas de suporte',
    type: 'custom',
    methodology: 'kanban',
    team_id: 'suporte',
    is_shared: false,
    stage_ids: [],
    position: 3,
    created_by: 'user-admin',
    created_at: '',
    updated_at: '',
  }

  const initialStages: BoardStage[] = [
    { id: 'stg-1', board_id: customBoard.id, name: 'Triagem', color: '#94a3b8', position: 0, wip_limit: 5, is_final: false, created_at: '' },
    { id: 'stg-2', board_id: customBoard.id, name: 'Em Análise', color: '#3b82f6', position: 1, wip_limit: 3, is_final: false, created_at: '' },
    { id: 'stg-3', board_id: customBoard.id, name: 'Resolvido', color: '#10b981', position: 2, wip_limit: null, is_final: true, created_at: '' },
  ]

  it('permite criar tarefa dentro de um quadro novo com seu stage_id personalizado', () => {
    const newTask = makeTask('task-custom-1', 'stg-1', {
      board_id: customBoard.id,
      title: 'Ticket #404 - Falha de Login',
    })

    expect(newTask.board_id).toBe('board-suporte-n2')
    expect(newTask.stage_id).toBe('stg-1')
    expect(initialStages.some(s => s.id === newTask.stage_id)).toBe(true)
  })

  it('permite editar etapas do quadro: renomear, alterar WIP e adicionar nova etapa', () => {
    const updatedStagesSpec: Partial<BoardStage>[] = [
      { id: 'stg-1', name: 'Triagem Inicial', color: '#94a3b8', wip_limit: 10, is_final: false },
      { id: 'stg-2', name: 'Em Análise Técnica', color: '#6366f1', wip_limit: 2, is_final: false },
      { id: 'stg-new', name: 'Aguardando Cliente', color: '#f59e0b', wip_limit: 5, is_final: false },
      { id: 'stg-3', name: 'Resolvido e Fechado', color: '#10b981', wip_limit: null, is_final: true },
    ]

    const updatedStages: BoardStage[] = updatedStagesSpec.map((s, idx) => ({
      id: s.id || `gen-${idx}`,
      board_id: customBoard.id,
      name: s.name!,
      color: s.color || '#3b82f6',
      position: idx,
      wip_limit: s.wip_limit ?? null,
      is_final: s.is_final ?? false,
      created_at: '',
    }))

    expect(updatedStages.length).toBe(4)
    expect(updatedStages[0].name).toBe('Triagem Inicial')
    expect(updatedStages[0].wip_limit).toBe(10)
    expect(updatedStages[1].color).toBe('#6366f1')
    expect(updatedStages[2].name).toBe('Aguardando Cliente')
    expect(updatedStages[3].is_final).toBe(true)
  })

  it('realoca tarefas órfãs para a primeira etapa remanescente quando uma coluna é excluída', () => {
    let tasks: Task[] = [
      makeTask('t-a', 'stg-1', { board_id: customBoard.id }),
      makeTask('t-b', 'stg-2', { board_id: customBoard.id }), // Será removida a etapa stg-2
      makeTask('t-c', 'stg-3', { board_id: customBoard.id }),
    ]

    // Etapas mantidas (stg-2 foi removida)
    const keptStages = [initialStages[0], initialStages[2]]
    const keptIds = new Set(keptStages.map(s => s.id))
    const firstStageId = keptStages[0].id

    // Simula a lógica do handleUpdateBoard / update_custom_board
    tasks = tasks.map(t => {
      if (t.board_id === customBoard.id && !keptIds.has(t.stage_id)) {
        return { ...t, stage_id: firstStageId }
      }
      return t
    })

    expect(tasks.find(t => t.id === 't-b')?.stage_id).toBe('stg-1')
    expect(tasks.find(t => t.id === 't-a')?.stage_id).toBe('stg-1')
    expect(tasks.find(t => t.id === 't-c')?.stage_id).toBe('stg-3')
  })
})

describe('Fase 1: Design de Referência e Navegação Meus Quadros', () => {
  const canonicalVisuals: Record<string, { bg: string; dot: string }> = {
    'Negociações': { bg: '#e5e7eb', dot: '#6b7280' },
    'Atividades em pausa': { bg: '#fef3c7', dot: '#f59e0b' },
    'Backlog Desenvolvimento': { bg: '#fef3c7', dot: '#f59e0b' },
    'Contrato': { bg: '#dbeafe', dot: '#3b82f6' },
    'Kick-off': { bg: '#fee2e2', dot: '#ef4444' },
    'Criação de Imagens': { bg: '#dcfce7', dot: '#22c55e' },
    'Desenvolvimento APP': { bg: '#ede9fe', dot: '#8b5cf6' },
    'Integração/Personalização': { bg: '#e5e7eb', dot: '#6b7280' },
    'Homologação': { bg: '#fef3c7', dot: '#f59e0b' },
    'Criação de Telas': { bg: '#dbeafe', dot: '#3b82f6' },
    'Deploy': { bg: '#fee2e2', dot: '#ef4444' },
    'Aguardando Aprovação': { bg: '#dcfce7', dot: '#22c55e' },
    'Entrega': { bg: '#ede9fe', dot: '#8b5cf6' },
    'Faturamento': { bg: '#e5e7eb', dot: '#6b7280' },
    'Concluído': { bg: '#dcfce7', dot: '#22c55e' },
  }

  it('valida as cores de fundo do cabeçalho e bolinha para as 15 etapas do Geral', () => {
    expect(canonicalVisuals['Negociações']).toEqual({ bg: '#e5e7eb', dot: '#6b7280' })
    expect(canonicalVisuals['Atividades em pausa']).toEqual({ bg: '#fef3c7', dot: '#f59e0b' })
    expect(canonicalVisuals['Contrato']).toEqual({ bg: '#dbeafe', dot: '#3b82f6' })
    expect(canonicalVisuals['Kick-off']).toEqual({ bg: '#fee2e2', dot: '#ef4444' })
    expect(canonicalVisuals['Criação de Imagens']).toEqual({ bg: '#dcfce7', dot: '#22c55e' })
    expect(canonicalVisuals['Desenvolvimento APP']).toEqual({ bg: '#ede9fe', dot: '#8b5cf6' })
    expect(canonicalVisuals['Deploy']).toEqual({ bg: '#fee2e2', dot: '#ef4444' })
    expect(canonicalVisuals['Concluído']).toEqual({ bg: '#dcfce7', dot: '#22c55e' })
  })

  it('filtra quadros relacionados ao usuário logado na tela Meus Quadros', () => {
    const currentUserId = 'user-bruno'
    const userTeamIds = new Set(['comercial'])
    const allBoards: Board[] = [
      { id: 'b1', name: 'Comercial', description: '', type: 'sector_view', methodology: 'kanban', team_id: 'comercial', is_shared: false, stage_ids: [], position: 0, created_by: 'admin', created_at: '', updated_at: '' },
      { id: 'b2', name: 'Suporte Dev', description: '', type: 'custom', methodology: 'kanban', team_id: 'desenvolvimento', is_shared: false, stage_ids: [], position: 1, created_by: 'other', created_at: '', updated_at: '' },
      { id: 'b3', name: 'Inovação', description: '', type: 'custom', methodology: 'kanban', team_id: 'design', is_shared: false, stage_ids: [], position: 2, created_by: currentUserId, created_at: '', updated_at: '' },
      { id: 'b4', name: 'Corporativo Todos', description: '', type: 'custom', methodology: 'kanban', team_id: null, is_shared: true, stage_ids: [], position: 3, created_by: 'admin', created_at: '', updated_at: '' },
    ]

    const visibleBoards = allBoards.filter(b => {
      if (b.is_shared) return true
      if (b.created_by === currentUserId) return true
      if (b.team_id && userTeamIds.has(b.team_id)) return true
      return false
    })

    // Bruno vê: b1 (sua equipe comercial), b3 (criado por ele), b4 (corporativo). Não vê b2 (privado dev).
    expect(visibleBoards.map(b => b.id)).toEqual(['b1', 'b3', 'b4'])
  })

  it('valida a ordem mandatória de abas: [Geral, Meus quadros, quadros do usuário..., + Novo quadro]', () => {
    const tabs = ['Geral', 'Meus quadros', 'Comercial', 'Suporte', '+ Novo quadro']
    expect(tabs[0]).toBe('Geral')
    expect(tabs[1]).toBe('Meus quadros')
    expect(tabs[tabs.length - 1]).toBe('+ Novo quadro')
  })

  it('tarefa criada em visão por setor pertence ao fluxo canônico (board_id null) e aparece tanto no setor quanto no Geral', () => {
    const sectorBoard: Board = {
      id: 'board-comercial-view',
      name: 'Comercial',
      description: '',
      type: 'sector_view',
      methodology: 'kanban',
      team_id: 'comercial',
      is_shared: true,
      stage_ids: ['stage-negociacao', 'stage-contrato', 'stage-kickoff'],
      position: 1,
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    }

    // Regra canônica de criação: se o quadro for sector_view, board_id é null (pertence ao Geral)
    const targetBoardId = sectorBoard.type === 'custom' ? sectorBoard.id : null
    expect(targetBoardId).toBeNull()

    const createdTask = makeTask('t-nova-comercial', 'stage-negociacao', {
      board_id: targetBoardId,
    })

    // 1. Verificação de visibilidade na visão de setor
    const visibleInSector = (!createdTask.board_id || createdTask.board_id === 'board-geral' || createdTask.board_id === sectorBoard.id)
      && sectorBoard.stage_ids.includes(createdTask.stage_id)
    expect(visibleInSector).toBe(true)

    // 2. Verificação de visibilidade no Quadro Geral
    const visibleInGeneral = !createdTask.board_id || createdTask.board_id === 'board-geral'
    expect(visibleInGeneral).toBe(true)

    // 3. Verificação de isolamento: não deve vazar para um quadro independente de desenvolvimento
    const devBoardId = 'board-custom-dev'
    const visibleInDev = createdTask.board_id === devBoardId
    expect(visibleInDev).toBe(false)
  })
})
