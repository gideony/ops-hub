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

export interface BoardColorToken {
  key: string
  dot: string
  light: {
    bg: string
    text: string
    border: string
  }
  dark: {
    bg: string
    text: string
    border: string
  }
}

/**
 * Paleta estável de 10 cores semânticas para identificação visual de quadros.
 * Cada item possui par de tokens (fundo claro + texto escuro no tema claro; fundo escuro + texto claro no escuro)
 * com taxa de contraste WCAG 2.1 comprovadamente superior ao mínimo AA de 4.5:1.
 */
export const BOARD_COLOR_PALETTE: BoardColorToken[] = [
  {
    key: 'blue',
    dot: '#2563eb', // Comercial
    light: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    dark: { bg: '#172554', text: '#bfdbfe', border: '#1d4ed8' },
  },
  {
    key: 'purple',
    dot: '#7c3aed', // Implantação
    light: { bg: '#f5f3ff', text: '#581c87', border: '#ddd6fe' },
    dark: { bg: '#2e1065', text: '#e9d5ff', border: '#7c3aed' },
  },
  {
    key: 'teal',
    dot: '#0d9488', // Suporte N1
    light: { bg: '#f0fdfa', text: '#115e59', border: '#99f6e4' },
    dark: { bg: '#134e4a', text: '#ccfbf1', border: '#0d9488' },
  },
  {
    key: 'amber',
    dot: '#d97706', // Backlog
    light: { bg: '#fffbeb', text: '#78350f', border: '#fde68a' },
    dark: { bg: '#451a03', text: '#fef3c7', border: '#b45309' },
  },
  {
    key: 'pink',
    dot: '#db2777', // Atualização sistema
    light: { bg: '#fdf2f8', text: '#831843', border: '#fbcfe8' },
    dark: { bg: '#500724', text: '#fce7f3', border: '#be185d' },
  },
  {
    key: 'emerald',
    dot: '#059669', // Financeiro
    light: { bg: '#ecfdf5', text: '#064e3b', border: '#a7f3d0' },
    dark: { bg: '#064e3b', text: '#d1fae5', border: '#059669' },
  },
  {
    key: 'orange',
    dot: '#ea580c', // Operações
    light: { bg: '#fff7ed', text: '#7c2d12', border: '#fed7aa' },
    dark: { bg: '#431407', text: '#ffedd5', border: '#c2410c' },
  },
  {
    key: 'indigo',
    dot: '#4f46e5', // Qualidade / QA
    light: { bg: '#eef2ff', text: '#312e81', border: '#c7d2fe' },
    dark: { bg: '#1e1b4b', text: '#e0e7ff', border: '#4f46e5' },
  },
  {
    key: 'sky',
    dot: '#0284c7', // Atendimento
    light: { bg: '#f0f9ff', text: '#075985', border: '#bae6fd' },
    dark: { bg: '#082f49', text: '#e0f2fe', border: '#0284c7' },
  },
  {
    key: 'slate',
    dot: '#475569', // Geral / Neutro
    light: { bg: '#f8fafc', text: '#0f172a', border: '#cbd5e1' },
    dark: { bg: '#0f172a', text: '#f1f5f9', border: '#334155' },
  },
]

/**
 * Retorna os tokens visuais completos de um quadro (cor da bolinha, fundos e textos para ambos os temas).
 * Se o quadro tiver `board.color`, tenta casar com a paleta ou monta os tokens a partir da cor hex.
 * Caso contrário, atribui estavelmente a cor pela semântica do nome ou pelo índice/hash do ID.
 */
export function getBoardVisual(
  board?: { id?: string; name?: string; color?: string | null; type?: string } | null,
  fallbackIndex?: number
): BoardColorToken {
  if (!board) return BOARD_COLOR_PALETTE[9] // Slate

  // Casos canônicos por nome
  const nameLower = (board.name || '').toLowerCase()
  if (nameLower.includes('comercial')) return BOARD_COLOR_PALETTE[0]
  if (nameLower.includes('implanta')) return BOARD_COLOR_PALETTE[1]
  if (nameLower.includes('suporte')) return BOARD_COLOR_PALETTE[2]
  if (nameLower.includes('backlog')) return BOARD_COLOR_PALETTE[3]
  if (nameLower.includes('atualiza') || nameLower.includes('sistema')) return BOARD_COLOR_PALETTE[4]
  if (nameLower.includes('financ')) return BOARD_COLOR_PALETTE[5]
  if (nameLower.includes('opera')) return BOARD_COLOR_PALETTE[6]
  if (nameLower.includes('qa') || nameLower.includes('qualidade')) return BOARD_COLOR_PALETTE[7]
  if (nameLower.includes('atend')) return BOARD_COLOR_PALETTE[8]
  if (board.id === 'board-geral' || board.type === 'general') return BOARD_COLOR_PALETTE[0] // Azul Somax

  // Se já possui cor explícita
  if (board.color) {
    const match = BOARD_COLOR_PALETTE.find(
      p => p.dot.toLowerCase() === board.color?.toLowerCase()
    )
    if (match) return match
  }

  // Atribuição estável por índice ou hash do ID
  if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
    return BOARD_COLOR_PALETTE[fallbackIndex % BOARD_COLOR_PALETTE.length]
  }

  const idStr = board.id || board.name || 'board'
  let hash = 0
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) >>> 0
  }
  return BOARD_COLOR_PALETTE[hash % BOARD_COLOR_PALETTE.length]
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

// ==========================================
// PREFERÊNCIA: OCULTAR COLUNAS VAZIAS
// ==========================================

const HIDE_EMPTY_COLS_PREFIX = 'somax_user_hide_empty_cols_'

export function getUserHideEmptyColumns(
  userId: string | undefined,
  mode: GeneralViewMode = 'lateral'
): boolean {
  // Lateral: padrão true (colunas com 0 tarefas recolhidas em tiras de 46px)
  // Consolidado: padrão false (colunas abertas por padrão)
  const defaultVal = mode === 'lateral'
  if (!userId) return defaultVal
  try {
    const raw = localStorage.getItem(`${HIDE_EMPTY_COLS_PREFIX}${mode}_${userId}`)
    if (raw !== null) {
      return raw === 'true'
    }
  } catch {}
  return defaultVal
}

export function setUserHideEmptyColumns(
  userId: string | undefined,
  mode: GeneralViewMode,
  hide: boolean
): void {
  if (!userId) return
  try {
    localStorage.setItem(`${HIDE_EMPTY_COLS_PREFIX}${mode}_${userId}`, String(hide))
  } catch {}
}

/**
 * Resumo de etapas com tarefas para o cabeçalho das faixas recolhidas do modo Consolidado.
 * Retorna as etapas que contêm tarefas, ordenadas pelas mais povoadas primeiro.
 */
export function getBoardStageSummary(
  stages: Stage[],
  tasks: Task[]
): { stageId: string; stageName: string; count: number; color?: string }[] {
  const counts: Record<string, number> = {}
  for (const t of tasks) {
    counts[t.stage_id] = (counts[t.stage_id] || 0) + 1
  }

  return stages
    .map(s => ({
      stageId: s.id,
      stageName: s.name,
      count: counts[s.id] || 0,
      color: s.color,
    }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
}

