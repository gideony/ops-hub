import type { Board, BoardStage, Stage, Sprint, Task } from './lib'
import { computeTaskStatus, resolveTaskStage } from './reports'

export type GeneralViewMode = 'lateral' | 'consolidado'
export type GeneralSituationFilter = 'active' | 'done' | 'all'

export interface BoardMetricsSummary {
  active: number
  done: number
  blocked: number
  backlog: number
  total: number
}

export const canonicalStageVisuals: Record<string, { bg: string; dot: string }> = {
  'Negociações': { bg: '#e5e7eb', dot: '#6b7280' },
  'Negociação': { bg: '#e5e7eb', dot: '#6b7280' },
  'Atividades em pausa': { bg: '#fef3c7', dot: '#f59e0b' },
  'Pausado': { bg: '#fef3c7', dot: '#f59e0b' },
  'Backlog Desenvolvimento': { bg: '#fef3c7', dot: '#f59e0b' },
  'Backlog': { bg: '#fef3c7', dot: '#f59e0b' },
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

/**
 * Retorna as etapas canônicas ou customizadas para o quadro especificado.
 */
export function getStagesForBoard(
  board: Board,
  canonicalStages: Stage[],
  customBoardStages: BoardStage[]
): (Stage & { wip_limit?: number | null })[] {
  if (board.type === 'general') {
    return canonicalStages.map(s => ({
      ...s,
      wip_limit: null,
    }))
  }

  if (board.type === 'sector_view') {
    const stageIds = board.stage_ids || []
    return canonicalStages
      .filter(s => stageIds.includes(s.id))
      .sort((a, b) => a.position - b.position)
      .map(s => ({
        ...s,
        wip_limit: null,
      }))
  }

  // Quadro customizado
  const custom = customBoardStages.filter(s => s.board_id === board.id)
  if (custom.length === 0) {
    return canonicalStages.map(s => ({
      ...s,
      wip_limit: null,
    }))
  }
  return custom
    .sort((a, b) => a.position - b.position)
    .map(cs => ({
      id: cs.id,
      name: cs.name,
      color: cs.color,
      position: cs.position,
      is_final: cs.is_final,
      is_pause: false,
      wip_limit: cs.wip_limit,
    }))
}

/**
 * Calcula as métricas agregadas do quadro em concordância estrita com a ADR-008 (Relatórios).
 */
export function getGeneralBoardMetrics(
  board: Board,
  tasks: Task[],
  canonicalStages: Stage[],
  customBoardStages: BoardStage[],
  sprints: Sprint[] = []
): BoardMetricsSummary {
  const isGeneral = board.type === 'general'

  // Tarefas pertencentes a este quadro
  const boardTasks = tasks.filter(t => {
    if (isGeneral) {
      return !t.board_id || t.board_id === 'board-geral'
    }
    return t.board_id === board.id
  })

  let active = 0
  let done = 0
  let blocked = 0
  let backlog = 0

  for (const task of boardTasks) {
    const stageInfo = resolveTaskStage(task, canonicalStages, customBoardStages)
    const status = computeTaskStatus(task, stageInfo, board, sprints)

    if (status === 'done') done++
    else if (status === 'blocked') blocked++
    else if (status === 'backlog') backlog++
    else active++
  }

  return {
    active,
    done,
    blocked,
    backlog,
    total: boardTasks.length,
  }
}

/**
 * Filtra tarefas de acordo com a situação selecionada (Em andamento, Concluídas, Todas).
 */
export function filterTasksBySituation(
  tasks: Task[],
  situation: GeneralSituationFilter,
  board: Board,
  canonicalStages: Stage[],
  customBoardStages: BoardStage[],
  sprints: Sprint[] = []
): Task[] {
  if (situation === 'all') return tasks

  return tasks.filter(task => {
    const stageInfo = resolveTaskStage(task, canonicalStages, customBoardStages)
    const status = computeTaskStatus(task, stageInfo, board, sprints)

    if (situation === 'done') {
      return status === 'done'
    }
    return status !== 'done'
  })
}

// ==========================================
// PERSISTÊNCIA DE PREFERÊNCIAS (LOCALSTORAGE)
// ==========================================

const GENERAL_MODE_PREFIX = 'somax_user_general_mode_'
const LATERAL_ORDER_PREFIX = 'somax_user_lateral_block_order_'
const ACCORDION_EXPANDED_PREFIX = 'somax_user_consolidated_expanded_'
const TABS_ORDER_PREFIX = 'somax_user_board_tabs_order_'

export function getUserGeneralMode(userId?: string): GeneralViewMode {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const defaultMode: GeneralViewMode = isMobile ? 'consolidado' : 'lateral'

  if (!userId) return defaultMode
  try {
    const val = localStorage.getItem(`${GENERAL_MODE_PREFIX}${userId}`)
    if (val === 'lateral' || val === 'consolidado') return val
  } catch {}
  return defaultMode
}

export function setUserGeneralMode(userId: string | undefined, mode: GeneralViewMode): void {
  if (!userId) return
  try {
    localStorage.setItem(`${GENERAL_MODE_PREFIX}${userId}`, mode)
  } catch {}
}

export function getUserLateralBlockOrder(userId: string | undefined, defaultBoardIds: string[]): string[] {
  if (!userId) return defaultBoardIds
  try {
    const raw = localStorage.getItem(`${LATERAL_ORDER_PREFIX}${userId}`)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
        const savedOrder = parsed.filter(id => defaultBoardIds.includes(id))
        const remaining = defaultBoardIds.filter(id => !savedOrder.includes(id))
        return [...savedOrder, ...remaining]
      }
    }
  } catch {}
  return defaultBoardIds
}

export function setUserLateralBlockOrder(userId: string | undefined, order: string[]): void {
  if (!userId) return
  try {
    localStorage.setItem(`${LATERAL_ORDER_PREFIX}${userId}`, JSON.stringify(order))
  } catch {}
}

export function getUserConsolidatedExpanded(
  userId: string | undefined,
  defaultBoardIds: string[]
): Record<string, boolean> {
  const defaultState: Record<string, boolean> = {}
  defaultBoardIds.forEach((id, index) => {
    defaultState[id] = index === 0
  })

  if (!userId) return defaultState
  try {
    const raw = localStorage.getItem(`${ACCORDION_EXPANDED_PREFIX}${userId}`)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const result: Record<string, boolean> = {}
        for (const id of defaultBoardIds) {
          result[id] = typeof (parsed as Record<string, unknown>)[id] === 'boolean'
            ? Boolean((parsed as Record<string, unknown>)[id])
            : defaultState[id] ?? false
        }
        return result
      }
    }
  } catch {}
  return defaultState
}

export function setUserConsolidatedExpanded(
  userId: string | undefined,
  state: Record<string, boolean>
): void {
  if (!userId) return
  try {
    localStorage.setItem(`${ACCORDION_EXPANDED_PREFIX}${userId}`, JSON.stringify(state))
  } catch {}
}

export function getUserBoardTabsOrder(userId: string | undefined, defaultTabIds: string[]): string[] {
  if (!userId) return defaultTabIds
  try {
    const raw = localStorage.getItem(`${TABS_ORDER_PREFIX}${userId}`)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
        const saved = parsed.filter(id => defaultTabIds.includes(id))
        const remaining = defaultTabIds.filter(id => !saved.includes(id))
        return [...saved, ...remaining]
      }
    }
  } catch {}
  return defaultTabIds
}

export function setUserBoardTabsOrder(userId: string | undefined, order: string[]): void {
  if (!userId) return
  try {
    localStorage.setItem(`${TABS_ORDER_PREFIX}${userId}`, JSON.stringify(order))
  } catch {}
}
