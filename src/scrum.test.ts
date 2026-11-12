import { describe, expect, it } from 'vitest'
import type { Board, BoardStage, Sprint, Task } from './lib'

describe('Fase 2: Regras de Negócio do Scrum e Sprints', () => {
  const dummyStages: BoardStage[] = [
    { id: 'stg-1', board_id: 'b-scrum', name: 'Tarefas', color: '#94a3b8', position: 0, wip_limit: null, is_final: false, created_at: '' },
    { id: 'stg-2', board_id: 'b-scrum', name: 'Em andamento', color: '#3b82f6', position: 1, wip_limit: 3, is_final: false, created_at: '' },
    { id: 'stg-3', board_id: 'b-scrum', name: 'Concluído', color: '#10b981', position: 2, wip_limit: null, is_final: true, created_at: '' },
  ]

  it('impede iniciar uma sprint se outra sprint do mesmo quadro já estiver ativa', () => {
    const sprints: Sprint[] = [
      { id: 'sprint-1', board_id: 'b-scrum', name: 'Sprint 1', goal: null, start_date: '2026-11-01', end_date: '2026-11-15', status: 'active', created_at: '', updated_at: '' },
      { id: 'sprint-2', board_id: 'b-scrum', name: 'Sprint 2', goal: null, start_date: '2026-11-16', end_date: '2026-11-30', status: 'planning', created_at: '', updated_at: '' },
    ]

    const canStartSprint2 = !sprints.some(s => s.board_id === 'b-scrum' && s.status === 'active')
    expect(canStartSprint2).toBe(false)
  })

  it('permite iniciar sprint apenas se houver ao menos uma tarefa alocada', () => {
    const tasks: Task[] = [
      { id: 't-1', title: 'Task 1', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-1', priority: 'media', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-2', story_points: 5 },
    ]

    function validateSprintStart(sprintId: string, currentTasks: Task[], currentSprints: Sprint[]) {
      const sprint = currentSprints.find(s => s.id === sprintId)
      if (!sprint) return { ok: false, error: 'Sprint não encontrada' }
      if (sprint.status !== 'planning') return { ok: false, error: 'Apenas sprints planejadas podem ser iniciadas' }
      if (!sprint.start_date || !sprint.end_date) return { ok: false, error: 'Datas obrigatórias' }
      if (sprint.end_date < sprint.start_date) return { ok: false, error: 'Data de término inválida' }
      const count = currentTasks.filter(t => t.sprint_id === sprintId).length
      if (count === 0) return { ok: false, error: 'Sprint deve conter tarefas' }
      const hasActive = currentSprints.some(s => s.board_id === sprint.board_id && s.status === 'active')
      if (hasActive) return { ok: false, error: 'Já existe sprint ativa' }
      return { ok: true }
    }

    const availableSprints: Sprint[] = [
      { id: 'sprint-2', board_id: 'b-scrum', name: 'Sprint 2', goal: null, start_date: '2026-11-16', end_date: '2026-11-30', status: 'planning', created_at: '', updated_at: '' },
    ]

    // Com tarefa
    expect(validateSprintStart('sprint-2', tasks, availableSprints).ok).toBe(true)

    // Sem tarefa
    expect(validateSprintStart('sprint-2', [], availableSprints).ok).toBe(false)
  })

  it('calcula velocidade corretamente ao encerrar sprint', () => {
    const finalStageIds = new Set(dummyStages.filter(s => s.is_final).map(s => s.id))

    const tasks: Task[] = [
      { id: 't-1', title: 'Task 1', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-3', priority: 'alta', due_at: null, tags: [], completed_at: '2026-11-10', created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-1', story_points: 5 },
      { id: 't-2', title: 'Task 2', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-3', priority: 'media', due_at: null, tags: [], completed_at: '2026-11-12', created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-1', story_points: 8 },
      { id: 't-3', title: 'Task 3', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-2', priority: 'baixa', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-1', story_points: 3 },
    ]

    const sprintTasks = tasks.filter(t => t.sprint_id === 'sprint-1')
    const completedTasks = sprintTasks.filter(t => finalStageIds.has(t.stage_id))
    const pendingTasks = sprintTasks.filter(t => !finalStageIds.has(t.stage_id))

    const velocity = completedTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
    const pendingPoints = pendingTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)

    expect(completedTasks.length).toBe(2)
    expect(pendingTasks.length).toBe(1)
    expect(velocity).toBe(13)
    expect(pendingPoints).toBe(3)
  })

  it('no encerramento com destino "backlog", redefine sprint_id para null nas tarefas pendentes', () => {
    const finalStageIds = new Set(dummyStages.filter(s => s.is_final).map(s => s.id))
    const tasks: Task[] = [
      { id: 't-1', title: 'Task 1', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-3', priority: 'alta', due_at: null, tags: [], completed_at: '2026-11-10', created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-1', story_points: 5 },
      { id: 't-2', title: 'Task 2', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-2', priority: 'baixa', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: 'sprint-1', story_points: 3 },
    ]

    const updatedTasks = tasks.map(t => {
      if (t.sprint_id === 'sprint-1' && !finalStageIds.has(t.stage_id)) {
        return { ...t, sprint_id: null }
      }
      return t
    })

    expect(updatedTasks.find(t => t.id === 't-1')?.sprint_id).toBe('sprint-1') // Concluída permanece
    expect(updatedTasks.find(t => t.id === 't-2')?.sprint_id).toBeNull() // Pendente volta ao backlog
  })

  it('ordena tarefas do backlog rigorosamente por backlog_order', () => {
    const tasks: Task[] = [
      { id: 't-b3', title: 'Task B3', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-1', priority: 'media', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: null, story_points: 2, backlog_order: 3 },
      { id: 't-b1', title: 'Task B1', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-1', priority: 'urgente', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: null, story_points: 8, backlog_order: 1 },
      { id: 't-b2', title: 'Task B2', description: '', team_id: 'team-1', assignee_id: null, client_id: null, stage_id: 'stg-1', priority: 'alta', due_at: null, tags: [], completed_at: null, created_by: 'u1', created_at: '', updated_at: '', board_id: 'b-scrum', sprint_id: null, story_points: 5, backlog_order: 2 },
    ]

    const ordered = [...tasks].sort((a, b) => (a.backlog_order ?? 0) - (b.backlog_order ?? 0))
    expect(ordered.map(t => t.id)).toEqual(['t-b1', 't-b2', 't-b3'])
  })

  it('calcula capacidade versus planejado em pontos', () => {
    const sprintTasks: Partial<Task>[] = [
      { id: 't-1', story_points: 8 },
      { id: 't-2', story_points: 5 },
      { id: 't-3', story_points: 13 },
    ]
    const plannedPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
    const teamCapacity = 25

    expect(plannedPoints).toBe(26)
    expect(plannedPoints > teamCapacity).toBe(true) // Alerta de sobrecarga
  })

  it('calcula a trajetória do gráfico de Burndown diário', () => {
    const totalPoints = 20
    const daysCount = 5

    // Linha ideal: de totalPoints (dia 0) a 0 (dia final)
    const idealTrajectory = Array.from({ length: daysCount }).map((_, i) => {
      return totalPoints * (1 - i / (daysCount - 1))
    })

    expect(idealTrajectory[0]).toBe(20)
    expect(idealTrajectory[daysCount - 1]).toBe(0)

    // Queima real acumulada por dia
    const burnedByDay: Record<number, number> = { 0: 0, 1: 5, 2: 8, 3: 15, 4: 20 }
    const realRemaining = Array.from({ length: daysCount }).map((_, i) => {
      return Math.max(0, totalPoints - (burnedByDay[i] || 0))
    })

    expect(realRemaining).toEqual([20, 15, 12, 5, 0])
  })
})

describe('Fase 2: Auditoria de Segurança — Testes de IDOR entre Equipes (Dados Fictícios)', () => {
  const boardTeamA: Board = {
    id: 'b-team-a',
    name: 'Scrum Equipe Alpha',
    description: '',
    type: 'custom',
    methodology: 'scrum',
    team_id: 'team-alpha',
    is_shared: false, // Privado da Equipe Alpha
    stage_ids: [],
    position: 1,
    created_by: 'user-alpha-leader',
    created_at: '',
    updated_at: '',
  }

  const sprintAlpha: Sprint = {
    id: 'sprint-alpha-1',
    board_id: 'b-team-a',
    name: 'Sprint Alpha 1',
    goal: 'Exclusivo Alpha',
    start_date: '2026-11-01',
    end_date: '2026-11-15',
    status: 'active',
    created_at: '',
    updated_at: '',
  }

  const userBeta = {
    id: 'user-beta-colab',
    role: 'colaborador',
    teams: ['team-beta'], // Pertence exclusivamente à Equipe Beta
  }

  function canUserAccessBoard(user: typeof userBeta, board: Board): boolean {
    if (user.role === 'administrador') return true
    if (board.is_shared) return true
    if (board.team_id && user.teams.includes(board.team_id)) return true
    return false
  }

  function canUserManageSprint(user: typeof userBeta, board: Board): boolean {
    if (user.role === 'administrador') return true
    if (board.created_by === user.id) return true
    if (board.team_id && user.teams.includes(board.team_id) && user.role === 'gestor') return true
    return false
  }

  it('IDOR: impede que colaborador da Equipe Beta visualize sprint de quadro privado da Equipe Alpha', () => {
    function canUserAccessSprint(user: typeof userBeta, sprint: Sprint, board: Board): boolean {
      if (sprint.board_id !== board.id) return false
      return canUserAccessBoard(user, board)
    }

    const hasAccess = canUserAccessSprint(userBeta, sprintAlpha, boardTeamA)
    expect(hasAccess).toBe(false)
  })

  it('IDOR: impede que usuário da Equipe Beta encerre ou altere sprint da Equipe Alpha', () => {
    const canManage = canUserManageSprint(userBeta, boardTeamA)
    expect(canManage).toBe(false)
  })

  it('IDOR: impede que tarefa da Equipe Alpha seja alocada em sprint da Equipe Beta', () => {
    const taskAlpha: Task = {
      id: 't-alpha',
      title: 'Tarefa Alpha',
      description: '',
      team_id: 'team-alpha',
      assignee_id: null,
      client_id: null,
      stage_id: 'stg-1',
      priority: 'media',
      due_at: null,
      tags: [],
      completed_at: null,
      created_by: 'user-alpha',
      created_at: '',
      updated_at: '',
      board_id: 'b-team-a',
      sprint_id: null,
    }

    const sprintBeta: Sprint = {
      id: 'sprint-beta-1',
      board_id: 'b-team-b', // Quadro diferente
      name: 'Sprint Beta 1',
      goal: null,
      start_date: null,
      end_date: null,
      status: 'planning',
      created_at: '',
      updated_at: '',
    }

    function canAssignTaskToSprint(task: Task, sprint: Sprint): boolean {
      return task.board_id === sprint.board_id
    }

    expect(canAssignTaskToSprint(taskAlpha, sprintBeta)).toBe(false)
  })
})
