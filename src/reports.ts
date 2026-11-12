import type { Board, BoardStage, Sprint, Stage, Task } from './lib'

export type ReportExclusiveStatus = 'active' | 'done' | 'blocked' | 'backlog'
export type ReportFilterStatus = 'all' | ReportExclusiveStatus | 'overdue'
export type DateFieldFilter = 'created' | 'completed' | 'due'
export type ScrumScopeFilter = 'all' | 'active_sprint'
export type PeriodPreset = 'this_week' | 'this_month' | 'last_30_days' | 'custom'

export type ReportFilters = {
  from: string
  to: string
  dateField?: DateFieldFilter
  boardId?: string
  scrumScope?: ScrumScopeFilter
  teamId: string
  assigneeId: string
  clientId: string
  status: ReportFilterStatus
  preset?: PeriodPreset
}

export type StageDisplayInfo = {
  id: string
  name: string
  color: string
  isFinal: boolean
  isPause: boolean
}

export type BoardSummaryRow = {
  boardId: string
  boardName: string
  type: 'general' | 'sector_view' | 'custom'
  methodology: 'kanban' | 'scrum'
  isMirrorView: boolean
  total: number
  active: number
  done: number
  blocked: number
  backlog: number
  overdue: number
  progressPercent: number
  totalStoryPoints: number
  doneStoryPoints: number
}

export type ReportTotals = {
  all: number
  active: number
  done: number
  blocked: number
  backlog: number
  overdue: number
  progressPercent: number
  totalStoryPoints: number
  doneStoryPoints: number
}

export type PunctualityMetrics = {
  onTimeRate: number
  completedTotalWithDueDate: number
  completedOnTimeCount: number
  completedLateCount: number
  averageLateDays: number
  riskTasks: Task[]
}

export type StageRetentionInfo = {
  stageId: string
  stageName: string
  color: string
  taskCount: number
  avgDays: number
  status: 'rapido' | 'normal' | 'alerta' | 'critico'
}

export type BottleneckMetrics = {
  stageRetentions: StageRetentionInfo[]
  topBottleneckStage: StageRetentionInfo | null
  stagnantTasks: {
    task: Task
    stageName: string
    stageColor: string
    daysInStage: number
  }[]
}

export type MemberCapacityStatus = 'disponivel' | 'equilibrado' | 'alerta' | 'sobrecarga'

export type MemberWorkloadInfo = {
  userId: string
  name: string
  activeCount: number
  doneCount: number
  overdueCount: number
  capacityStatus: MemberCapacityStatus
}

export type TeamCapacityMetrics = {
  members: MemberWorkloadInfo[]
  overloadedCount: number
  averageActivePerMember: number
}

export function daysBetween(dateStr1: string, dateStr2: string): number {
  if (!dateStr1 || !dateStr2) return 0
  const d1 = new Date(dateStr1.slice(0, 10) + 'T00:00:00')
  const d2 = new Date(dateStr2.slice(0, 10) + 'T00:00:00')
  const diffTime = d2.getTime() - d1.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24))
}

export function getPresetDates(preset: PeriodPreset, todayStr: string): { from: string; to: string } {
  if (!todayStr) return { from: '', to: '' }
  const today = new Date(todayStr + 'T00:00:00')

  if (preset === 'this_week') {
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(new Date(today).setDate(diff))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      from: monday.toISOString().slice(0, 10),
      to: sunday.toISOString().slice(0, 10),
    }
  }

  if (preset === 'this_month') {
    const year = today.getFullYear()
    const month = today.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    return {
      from: firstDay.toISOString().slice(0, 10),
      to: lastDay.toISOString().slice(0, 10),
    }
  }

  if (preset === 'last_30_days') {
    const past = new Date(today)
    past.setDate(today.getDate() - 30)
    return {
      from: past.toISOString().slice(0, 10),
      to: todayStr,
    }
  }

  return { from: '', to: '' }
}

export function resolveTaskStage(
  task: Task,
  stages: Stage[],
  boardStages: BoardStage[] = []
): StageDisplayInfo {
  // 1. Se a tarefa pertence a um quadro customizado, busca em board_stages
  if (task.board_id && task.board_id !== 'board-geral') {
    const custom = boardStages.find(s => s.id === task.stage_id)
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        color: custom.color,
        isFinal: custom.is_final,
        isPause: false,
      }
    }
  }

  // 2. Quadro geral ou fallback
  const globalStage = stages.find(s => s.id === task.stage_id)
  if (globalStage) {
    return {
      id: globalStage.id,
      name: globalStage.name,
      color: globalStage.color,
      isFinal: globalStage.is_final,
      isPause: globalStage.is_pause,
    }
  }

  // 3. Fallback com aviso para não esconder bugs silenciosamente
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[reports] Tarefa ${task.id} em etapa não identificada: ${task.stage_id}`)
  }
  return {
    id: task.stage_id,
    name: 'Etapa sem identificação',
    color: '#94a3b8',
    isFinal: false,
    isPause: false,
  }
}

export function computeTaskStatus(
  task: Task,
  stageInfo: StageDisplayInfo,
  board: Board | undefined,
  sprints: Sprint[] = []
): ReportExclusiveStatus {
  if (stageInfo.isFinal) return 'done'
  if (stageInfo.isPause) return 'blocked'
  if (board?.methodology === 'scrum') {
    if (!task.sprint_id) return 'backlog'
    const sprint = sprints.find(s => s.id === task.sprint_id)
    // Se o sprint estiver planejado ou não ativo, conta como backlog (Sprint planejada)
    if (!sprint || sprint.status !== 'active') return 'backlog'
  }
  return 'active'
}

export function isTaskOverdue(task: Task, status: ReportExclusiveStatus, today: string): boolean {
  if (status === 'done') return false
  if (!task.due_at) return false
  return task.due_at.slice(0, 10) < today
}

export function reportStatus(
  task: Task,
  stages: Stage[],
  _today?: string,
  boardStages: BoardStage[] = [],
  boards: Board[] = [],
  sprints: Sprint[] = []
): ReportExclusiveStatus {
  const stageInfo = resolveTaskStage(task, stages, boardStages)
  const board = boards.find(b => b.id === (task.board_id || 'board-geral'))
  return computeTaskStatus(task, stageInfo, board, sprints)
}

export function buildReport(
  tasks: Task[],
  stages: Stage[],
  filters: ReportFilters,
  today: string,
  boardStages: BoardStage[] = [],
  boards: Board[] = [],
  sprints: Sprint[] = []
) {
  const dateField = filters.dateField || 'created'
  const selectedBoardId = filters.boardId || 'all'
  const scrumScope = filters.scrumScope || 'all'
  const selectedBoard = boards.find(b => b.id === selectedBoardId)

  // 1. Filtragem da base de tarefas
  const base = tasks.filter(task => {
    // Filtro por Data
    let dateValue = ''
    if (dateField === 'completed') {
      dateValue = task.completed_at ? task.completed_at.slice(0, 10) : ''
    } else if (dateField === 'due') {
      dateValue = task.due_at ? task.due_at.slice(0, 10) : ''
    } else {
      dateValue = task.created_at.slice(0, 10)
    }
    if (filters.from && (!dateValue || dateValue < filters.from)) return false
    if (filters.to && (!dateValue || dateValue > filters.to)) return false

    // Filtros de Equipe, Responsável e Cliente
    if (filters.teamId && task.team_id !== filters.teamId) return false
    if (filters.assigneeId && task.assignee_id !== filters.assigneeId) return false
    if (filters.clientId && task.client_id !== filters.clientId) return false

    // Filtro de Dimensão: Quadro
    if (selectedBoardId === 'all') {
      // "Todos os meus quadros": soma tarefas do Geral + tarefas de quadros personalizados.
      // Visões por setor NUNCA duplicam tarefas aqui!
      // Uma tarefa pertence ou ao Geral (board_id nulo ou 'board-geral') ou a um quadro customizado.
      return true
    }
    if (selectedBoardId === 'board-geral') {
      return !task.board_id || task.board_id === 'board-geral'
    }
    if (selectedBoard) {
      if (selectedBoard.type === 'sector_view') {
        // Visão por setor: tarefas do Geral que estão nas etapas do setor
        const isGeneralTask = !task.board_id || task.board_id === 'board-geral' || task.board_id === selectedBoard.id
        return isGeneralTask && selectedBoard.stage_ids.includes(task.stage_id)
      }
      if (selectedBoard.type === 'custom') {
        return task.board_id === selectedBoard.id
      }
    }
    return true
  })

  // 2. Classificação de cada tarefa da base filtrada
  type ProcessedTask = {
    task: Task
    stageInfo: StageDisplayInfo
    status: ReportExclusiveStatus
    overdue: boolean
  }

  const processed: ProcessedTask[] = []
  for (const task of base) {
    const stageInfo = resolveTaskStage(task, stages, boardStages)
    const taskBoard = boards.find(b => b.id === (task.board_id || 'board-geral'))
    const status = computeTaskStatus(task, stageInfo, taskBoard, sprints)

    // Filtro de Escopo Scrum (se selecionado "Apenas sprint ativa")
    if (taskBoard?.methodology === 'scrum' && scrumScope === 'active_sprint' && status === 'backlog') {
      continue
    }

    const overdue = isTaskOverdue(task, status, today)
    processed.push({ task, stageInfo, status, overdue })
  }

  // 3. Totais Consolidados (Soma dos status exclusivos = total líquido)
  const totals: ReportTotals = {
    all: processed.length,
    active: 0,
    done: 0,
    blocked: 0,
    backlog: 0,
    overdue: 0,
    progressPercent: 0,
    totalStoryPoints: 0,
    doneStoryPoints: 0,
  }

  const teamCounts = new Map<string, number>()
  const stageCounts = new Map<string, { count: number; name: string; color: string }>()

  for (const item of processed) {
    if (item.status === 'active') totals.active++
    if (item.status === 'done') totals.done++
    if (item.status === 'blocked') totals.blocked++
    if (item.status === 'backlog') totals.backlog++
    if (item.overdue) totals.overdue++

    teamCounts.set(item.task.team_id, (teamCounts.get(item.task.team_id) || 0) + 1)

    const prevStage = stageCounts.get(item.stageInfo.id)
    stageCounts.set(item.stageInfo.id, {
      count: (prevStage?.count || 0) + 1,
      name: item.stageInfo.name,
      color: item.stageInfo.color,
    })
  }

  totals.progressPercent = totals.all > 0 ? Math.round((totals.done / totals.all) * 100) : 0
  totals.totalStoryPoints = processed.reduce((sum, p) => sum + (p.task.story_points || 0), 0)
  totals.doneStoryPoints = processed.filter(p => p.status === 'done').reduce((sum, p) => sum + (p.task.story_points || 0), 0)

  // 4. Quadro-Resumo de Indicadores por Quadro (Board Summaries)
  const canonicalGeneral: Board = boards.find(b => b.id === 'board-geral') || {
    id: 'board-geral',
    name: 'Geral',
    description: 'Quadro Geral corporativo',
    type: 'general',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: stages.map(s => s.id),
    position: 0,
    created_by: 'system',
    created_at: '',
    updated_at: '',
  }

  const relevantBoards: Board[] = [
    canonicalGeneral,
    ...boards.filter(b => b.id !== 'board-geral'),
  ]

  const boardSummaries: BoardSummaryRow[] = relevantBoards.map(b => {
    let boardTasks: ProcessedTask[] = []
    if (b.type === 'general') {
      boardTasks = processed.filter(p => !p.task.board_id || p.task.board_id === 'board-geral')
    } else if (b.type === 'sector_view') {
      boardTasks = processed.filter(p => (!p.task.board_id || p.task.board_id === 'board-geral' || p.task.board_id === b.id) && b.stage_ids.includes(p.task.stage_id))
    } else {
      boardTasks = processed.filter(p => p.task.board_id === b.id)
    }

    const rowDone = boardTasks.filter(p => p.status === 'done').length
    const rowTotal = boardTasks.length
    const progressPercent = rowTotal > 0 ? Math.round((rowDone / rowTotal) * 100) : 0
    const totalStoryPoints = boardTasks.reduce((sum, p) => sum + (p.task.story_points || 0), 0)
    const doneStoryPoints = boardTasks.filter(p => p.status === 'done').reduce((sum, p) => sum + (p.task.story_points || 0), 0)

    const row: BoardSummaryRow = {
      boardId: b.id,
      boardName: b.name,
      type: b.type,
      methodology: b.methodology,
      isMirrorView: b.type === 'sector_view',
      total: rowTotal,
      active: boardTasks.filter(p => p.status === 'active').length,
      done: rowDone,
      blocked: boardTasks.filter(p => p.status === 'blocked').length,
      backlog: boardTasks.filter(p => p.status === 'backlog').length,
      overdue: boardTasks.filter(p => p.overdue).length,
      progressPercent,
      totalStoryPoints,
      doneStoryPoints,
    }
    return row
  })

  // 5. Linhas para exibição na tabela detalhada
  const rows = processed
    .filter(item => {
      if (filters.status === 'all') return true
      if (filters.status === 'overdue') return item.overdue
      return item.status === filters.status
    })
    .map(item => item.task)
    .sort((a, b) => (a.due_at || '9999-12-31').localeCompare(b.due_at || '9999-12-31') || a.title.localeCompare(b.title, 'pt-BR'))

  // 6. Inteligência Operacional: Pontualidade (Dor 1)
  const completedWithDue = processed.filter(p => p.status === 'done' && p.task.due_at && p.task.completed_at)
  let onTimeCount = 0
  let lateCount = 0
  let totalLateDays = 0

  for (const p of completedWithDue) {
    const comp = p.task.completed_at!.slice(0, 10)
    const due = p.task.due_at!.slice(0, 10)
    if (comp <= due) {
      onTimeCount++
    } else {
      lateCount++
      totalLateDays += Math.max(1, daysBetween(due, comp))
    }
  }

  const onTimeRate = completedWithDue.length > 0
    ? Math.round((onTimeCount / completedWithDue.length) * 100)
    : 100
  const averageLateDays = lateCount > 0 ? Number((totalLateDays / lateCount).toFixed(1)) : 0

  // Tarefas em risco (ativas que vencem entre hoje e hoje + 3 dias)
  const riskTasks = processed
    .filter(p => p.status !== 'done' && p.task.due_at)
    .filter(p => {
      const diff = daysBetween(today, p.task.due_at!.slice(0, 10))
      return diff >= 0 && diff <= 3
    })
    .map(p => p.task)

  const punctualityMetrics: PunctualityMetrics = {
    onTimeRate,
    completedTotalWithDueDate: completedWithDue.length,
    completedOnTimeCount: onTimeCount,
    completedLateCount: lateCount,
    averageLateDays,
    riskTasks,
  }

  // 7. Inteligência Operacional: Gargalos & Retenção por Etapa (Dor 2)
  const stageRetentionMap = new Map<string, { count: number; totalDays: number; name: string; color: string }>()
  const stagnantTasks: BottleneckMetrics['stagnantTasks'] = []

  for (const p of processed) {
    if (p.status === 'done') continue
    const dateRef = p.task.updated_at || p.task.created_at
    const daysInStage = Math.max(0, daysBetween(dateRef.slice(0, 10), today))

    const prev = stageRetentionMap.get(p.stageInfo.id) || { count: 0, totalDays: 0, name: p.stageInfo.name, color: p.stageInfo.color }
    stageRetentionMap.set(p.stageInfo.id, {
      count: prev.count + 1,
      totalDays: prev.totalDays + daysInStage,
      name: p.stageInfo.name,
      color: p.stageInfo.color,
    })

    if (daysInStage >= 5) {
      stagnantTasks.push({
        task: p.task,
        stageName: p.stageInfo.name,
        stageColor: p.stageInfo.color,
        daysInStage,
      })
    }
  }

  stagnantTasks.sort((a, b) => b.daysInStage - a.daysInStage)

  const stageRetentions: StageRetentionInfo[] = [...stageRetentionMap.entries()].map(([id, info]) => {
    const avgDays = info.count > 0 ? Number((info.totalDays / info.count).toFixed(1)) : 0
    let status: StageRetentionInfo['status'] = 'rapido'
    if (avgDays >= 6) status = 'critico'
    else if (avgDays >= 4) status = 'alerta'
    else if (avgDays >= 2) status = 'normal'

    return {
      stageId: id,
      stageName: info.name,
      color: info.color,
      taskCount: info.count,
      avgDays,
      status,
    }
  }).sort((a, b) => b.avgDays - a.avgDays || b.taskCount - a.taskCount)

  const topBottleneckStage = stageRetentions.length > 0 ? stageRetentions[0] : null

  const bottleneckMetrics: BottleneckMetrics = {
    stageRetentions,
    topBottleneckStage,
    stagnantTasks,
  }

  // 8. Inteligência Operacional: Carga de Trabalho por Pessoa (Dor 4)
  const memberMap = new Map<string, { active: number; done: number; overdue: number }>()

  for (const p of processed) {
    const uid = p.task.assignee_id || 'unassigned'
    const cur = memberMap.get(uid) || { active: 0, done: 0, overdue: 0 }
    if (p.status === 'active' || p.status === 'blocked') cur.active++
    if (p.status === 'done') cur.done++
    if (p.overdue) cur.overdue++
    memberMap.set(uid, cur)
  }

  let overloadedCount = 0
  let totalActiveAssigned = 0
  let assignedMembersCount = 0

  const members: MemberWorkloadInfo[] = [...memberMap.entries()].map(([uid, stats]) => {
    let capacityStatus: MemberCapacityStatus = 'disponivel'
    if (stats.active >= 8) {
      capacityStatus = 'sobrecarga'
      overloadedCount++
    } else if (stats.active >= 5) {
      capacityStatus = 'alerta'
    } else if (stats.active >= 1) {
      capacityStatus = 'equilibrado'
    }

    if (uid !== 'unassigned') {
      totalActiveAssigned += stats.active
      assignedMembersCount++
    }

    return {
      userId: uid,
      name: '',
      activeCount: stats.active,
      doneCount: stats.done,
      overdueCount: stats.overdue,
      capacityStatus,
    }
  }).sort((a, b) => b.activeCount - a.activeCount)

  const averageActivePerMember = assignedMembersCount > 0
    ? Number((totalActiveAssigned / assignedMembersCount).toFixed(1))
    : 0

  const teamCapacityMetrics: TeamCapacityMetrics = {
    members,
    overloadedCount,
    averageActivePerMember,
  }

  return {
    rows,
    totals,
    teamCounts,
    stageCounts,
    boardSummaries,
    punctualityMetrics,
    bottleneckMetrics,
    teamCapacityMetrics,
  }
}

export function reportCsvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function buildBoardSummaryCsv(boardSummaries: BoardSummaryRow[], totals: ReportTotals): string {
  const headers = [
    'Quadro',
    'Tipo',
    'Metodologia',
    'Visão',
    'Total',
    'Em andamento',
    'Pausadas',
    'Backlog',
    'Concluídas',
    'Atrasadas',
    'Progresso (%)',
    'Story Points Concluídos',
    'Story Points Totais',
  ]

  const rows = boardSummaries.map(b => [
    reportCsvCell(b.boardName),
    reportCsvCell(b.type === 'general' ? 'Geral' : b.type === 'sector_view' ? 'Setor' : 'Personalizado'),
    reportCsvCell(b.methodology === 'scrum' ? 'Scrum' : 'Kanban'),
    reportCsvCell(b.isMirrorView ? 'Espelho (Informativo)' : 'Independente'),
    String(b.total),
    String(b.active),
    String(b.blocked),
    String(b.backlog),
    String(b.done),
    String(b.overdue),
    `${b.progressPercent}%`,
    b.methodology === 'scrum' ? String(b.doneStoryPoints) : '—',
    b.methodology === 'scrum' ? String(b.totalStoryPoints) : '—',
  ])

  // Linha de Total Consolidado
  rows.push([
    reportCsvCell('TOTAL CONSOLIDADO'),
    reportCsvCell('Consolidado'),
    reportCsvCell('Todos'),
    reportCsvCell('Soma líquida'),
    String(totals.all),
    String(totals.active),
    String(totals.blocked),
    String(totals.backlog),
    String(totals.done),
    String(totals.overdue),
    `${totals.progressPercent}%`,
    String(totals.doneStoryPoints),
    String(totals.totalStoryPoints),
  ])

  return '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n')
}
