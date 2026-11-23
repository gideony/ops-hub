import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && anon && !url.includes('SEU-PROJETO'))
export const supabase = createClient(url || 'https://invalid.supabase.co', anon || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Profile = { id: string; full_name: string; email?: string | null; whatsapp?: string | null; role: 'administrador' | 'gestor' | 'colaborador'; active: boolean; is_master?: boolean }
export type Team = { id: string; name: string; color: string }
export type Member = { team_id: string; user_id: string; is_manager: boolean; active: boolean }
export type ClientLink = { label: string; url: string }
export type ClientIntegration = { key: string; value: string }
export type Client = { id: string; name: string; legal_name: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; financial_contact_name: string | null; financial_email: string | null; financial_whatsapp: string | null; financial_due_date: string | null; financial_notes: string | null; links: ClientLink[]; integration_references: string | null; integration_items: ClientIntegration[] }
export type Stage = { id: string; name: string; position: number; color: string; is_final: boolean; is_pause: boolean; wip_limit?: number | null }
export type Transition = { from_stage_id: string; to_stage_id: string; description?: string | null }
export type Template = { id: string; stage_id: string; title: string; position: number }
export type ChecklistTemplateGroup = { id: string; name: string; description: string | null; position: number }
export type ChecklistTemplateItem = { id: string; group_id: string; title: string; position: number }
export type BoardType = 'general' | 'sector_view' | 'custom'
export type BoardMethodology = 'kanban' | 'scrum'
export type BoardCompletionAction = 'ask' | 'suggest_default' | 'none'

export type BoardTemplateStage = {
  name: string
  color: string
  wip_limit?: number | null
  is_final: boolean
}

export type BoardTemplate = {
  id: string
  key?: string
  name: string
  title?: string
  description: string | null
  methodology: BoardMethodology
  color: string
  stages: BoardTemplateStage[]
  is_builtin?: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export const DEFAULT_BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'tmpl-blank',
    key: 'blank',
    name: 'Em branco',
    title: 'Em branco',
    description: 'Quadro limpo para configurar do seu jeito',
    methodology: 'kanban',
    color: '#94a3b8',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-suporte',
    key: 'support',
    name: 'Suporte',
    title: 'Suporte',
    description: 'Atendimento, triagem e resolução de chamados',
    methodology: 'kanban',
    color: '#0d9488',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Resolvido', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-comercial',
    key: 'commercial',
    name: 'Comercial',
    title: 'Comercial',
    description: 'Funil de vendas e fechamento de novos clientes',
    methodology: 'kanban',
    color: '#2563eb',
    is_builtin: true,
    stages: [
      { name: 'Lead', color: '#3b82f6', wip_limit: null, is_final: false },
      { name: 'Negociações', color: '#f59e0b', wip_limit: 4, is_final: false },
      { name: 'Follow-up', color: '#8b5cf6', wip_limit: 3, is_final: false },
      { name: 'Assinatura de Contrato', color: '#ec4899', wip_limit: 2, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
      { name: 'Perdido', color: '#ef4444', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-implantacao',
    key: 'deployment',
    name: 'Implantação',
    title: 'Implantação',
    description: 'Onboarding e entrega estruturada de projetos',
    methodology: 'kanban',
    color: '#7c3aed',
    is_builtin: true,
    stages: [
      { name: 'Kick-off', color: '#3b82f6', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#f59e0b', wip_limit: 3, is_final: false },
      { name: 'Aguardando aprovação', color: '#8b5cf6', wip_limit: 2, is_final: false },
      { name: 'Entrega', color: '#ec4899', wip_limit: 2, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-scrum',
    key: 'scrum_default',
    name: 'Scrum padrão',
    title: 'Scrum padrão',
    description: 'Ciclos com sprints, backlog e metas',
    methodology: 'scrum',
    color: '#6366f1',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
]

export type Board = {
  id: string
  name: string
  description: string | null
  type: BoardType
  methodology: BoardMethodology
  team_id: string | null
  is_shared: boolean
  stage_ids: string[]
  position: number
  color?: string | null
  created_by: string
  created_at: string
  updated_at: string
  on_completion_action?: BoardCompletionAction
  default_forward_board_id?: string | null
  default_forward_stage_id?: string | null
}

export type BoardStage = {
  id: string
  board_id: string
  name: string
  color: string
  position: number
  wip_limit: number | null
  is_final: boolean
  created_at: string
}

export type SprintStatus = 'planning' | 'active' | 'completed'

export type Sprint = {
  id: string
  board_id: string
  name: string
  goal: string | null
  start_date: string | null
  end_date: string | null
  status: SprintStatus
  created_at: string
  updated_at: string
}

export type ClientRegistrationLink = {
  id: string
  token: string
  created_by: string
  team_id: string | null
  client_id?: string | null
  single_use: boolean
  max_submissions: number
  submission_count: number
  include_financial: boolean
  expires_at: string
  is_active: boolean
  notes?: string | null
  created_at: string
  updated_at: string
}

export type ClientRegistrationData = {
  name: string
  legal_name?: string | null
  cnpj_cpf?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  financial_contact_name?: string | null
  financial_email?: string | null
  financial_whatsapp?: string | null
  financial_due_date?: string | null
  financial_notes?: string | null
  links?: ClientLink[]
}

export type ClientRegistrationSubmission = {
  id: string
  link_id: string
  client_id?: string | null
  data: ClientRegistrationData
  status: 'pending' | 'approved' | 'rejected'
  lgpd_accepted_at: string
  user_agent?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  review_notes?: string | null
  created_at: string
}

export type Tag = { id: string; name: string; color: string }
export type Task = {
  id: string
  title: string
  description: string
  team_id: string
  assignee_id: string | null
  client_id: string | null
  stage_id: string
  priority: 'baixa' | 'media' | 'alta' | 'urgente'
  due_at: string | null
  tags: string[]
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  board_id?: string | null
  sprint_id?: string | null
  story_points?: number | null
  backlog_order?: number
  origin_task_id?: string | null
  root_task_id?: string | null
  forwarded_at?: string | null
  forwarded_by?: string | null
}

export type TaskLineageEvent = {
  id: string
  task_id: string
  root_task_id: string
  board_id?: string | null
  board_name: string
  board_color?: string | null
  stage_id?: string | null
  stage_name: string
  event_type: 'created' | 'moved' | 'completed' | 'forwarded'
  actor_id?: string | null
  actor_name?: string | null
  metadata?: Record<string, unknown>
  created_at: string
  is_masked?: boolean
}
export type Checklist = { id: string; task_id: string; title: string; done: boolean; position: number; group_name?: string | null }
export type TaskComment = { id: string; task_id: string; author_id: string; body: string; created_at: string }
export type Movement = { id: string; task_id: string; from_stage_id: string | null; to_stage_id: string; moved_by: string; moved_at: string; from_stage_name?: string | null; to_stage_name?: string | null }
export type Channel = {
  id: string
  team_id: string
  name: string
  description?: string | null
  archived_at?: string | null
  is_restricted?: boolean
  created_by?: string | null
  created_at: string
}
export type Message = {
  id: string
  channel_id: string
  author_id: string
  body: string
  reply_to_id: string | null
  task_id: string | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
  mentions?: string[]
  mentions_all?: boolean
}
export type Attachment = { id: string; message_id: string; storage_path: string; file_name: string; size_bytes: number }
export type Read = { channel_id: string; user_id: string; last_read_at: string }

export type Data = {
  profiles: Profile[]
  teams: Team[]
  members: Member[]
  clients: Client[]
  stages: Stage[]
  transitions: Transition[]
  templates: Template[]
  templateGroups: ChecklistTemplateGroup[]
  templateItems: ChecklistTemplateItem[]
  tags: Tag[]
  tasks: Task[]
  channels: Channel[]
  reads: Read[]
  boards: Board[]
  boardStages: BoardStage[]
  sprints: Sprint[]
  boardTemplates?: BoardTemplate[]
  registrationLinks?: ClientRegistrationLink[]
  registrationSubmissions?: ClientRegistrationSubmission[]
}

export type ChannelMetrics = {
  unread_count: number
  mention_count: number
}

export async function unreadChannelMetrics(): Promise<Record<string, ChannelMetrics>> {
  try {
    const { data, error } = await supabase.rpc('unread_channel_metrics')
    if (!error && data) {
      return Object.fromEntries(
        (data as { channel_id: string; unread_count: number; mention_count: number }[]).map(row => [
          row.channel_id,
          {
            unread_count: Number(row.unread_count) || 0,
            mention_count: Number(row.mention_count) || 0,
          },
        ])
      )
    }
  } catch {}
  // Fallback para unread_message_counts
  try {
    const counts = await unreadMessageCounts()
    return Object.fromEntries(
      Object.entries(counts).map(([cId, unread]) => [
        cId,
        { unread_count: unread, mention_count: 0 },
      ])
    )
  } catch {
    return {}
  }
}

export async function unreadMessageCounts() {
  const { data, error } = await supabase.rpc('unread_message_counts')
  if (error) throw error
  return Object.fromEntries(((data || []) as { channel_id: string; unread_count: number }[])
    .map(row => [row.channel_id, Number(row.unread_count)])) as Record<string, number>
}

export type StageDisplayInfo = {
  id: string
  name: string
  color: string
  isFinal: boolean
  isPause: boolean
}

/**
 * Resolução canônica de etapa para qualquer tarefa do OPSHUB (Geral ou Personalizado).
 * Avalia prioritariamente o quadro da tarefa e suas etapas correspondentes.
 * O fallback por completed_at só é ativado se a etapa não puder ser resolvida.
 */
export function resolveTaskStage(
  task: Task,
  stages: (Stage | BoardStage)[],
  boardStages: BoardStage[] = []
): StageDisplayInfo {
  // 1. Se a tarefa pertence a um quadro customizado, busca prioritariamente em board_stages
  if (task.board_id && task.board_id !== 'board-geral') {
    const custom = boardStages.find(s => s.id === task.stage_id && s.board_id === task.board_id) ||
      (stages.find(s => s.id === task.stage_id && 'board_id' in s && (s as BoardStage).board_id === task.board_id) as BoardStage | undefined)
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        color: custom.color,
        isFinal: Boolean(custom.is_final),
        isPause: false,
      }
    }
  }

  // 2. Busca na lista de etapas canônicas ou lista mista/unificada
  const stage = stages.find(s => s.id === task.stage_id) || boardStages.find(s => s.id === task.stage_id)
  if (stage) {
    return {
      id: stage.id,
      name: stage.name,
      color: stage.color,
      isFinal: Boolean(stage.is_final),
      isPause: Boolean('is_pause' in stage && stage.is_pause),
    }
  }

  // 3. Fallback estrito: a etapa não pôde ser resolvida na lista de etapas
  const hasCompletedAt = Boolean(task.completed_at)
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.warn(`[stages] Tarefa ${task.id} (${task.title}) em etapa não identificada: ${task.stage_id}. Fallback por completed_at: ${hasCompletedAt}`)
  }

  return {
    id: task.stage_id,
    name: hasCompletedAt ? 'Concluída (etapa não identificada)' : 'Etapa sem identificação',
    color: '#94a3b8',
    isFinal: hasCompletedAt,
    isPause: false,
  }
}

/**
 * Função canônica única para determinar se uma tarefa está concluída.
 * Usa estritamente a mesma regra de resolveTaskStage: a etapa define a conclusão.
 * Se a tarefa foi reaberta (movida para etapa não-final), retorna false.
 */
export function completed(
  task: Task,
  stages: (Stage | BoardStage)[],
  boardStages: BoardStage[] = []
): boolean {
  return resolveTaskStage(task, stages, boardStages).isFinal
}
export function dateBR(value?: string | null) { return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value.slice(0, 10) + 'T12:00:00Z')) : 'Sem prazo' }
export function timeBR(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(value)) }
export function todayISO(current = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(current)
}
export function weekStart() { const d = new Date(); const day = (d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d }
export function taskBuckets(
  tasks: Task[],
  stages: Stage[],
  userId: string | undefined,
  arg4?: BoardStage[] | Date,
  arg5?: BoardStage[] | Date
) {
  let boardStages: BoardStage[] = []
  let current: Date = new Date()

  if (Array.isArray(arg4)) {
    boardStages = arg4
  } else if (arg4 instanceof Date) {
    current = arg4
  }

  if (Array.isArray(arg5)) {
    boardStages = arg5
  } else if (arg5 instanceof Date) {
    current = arg5
  }

  const allStages: (Stage | BoardStage)[] = [...stages, ...boardStages]
  const today = todayISO(current)
  const soonDate = new Date(current); soonDate.setDate(soonDate.getDate()+7)
  const soon = todayISO(soonDate)
  const start = new Date(current); start.setDate(start.getDate()-(start.getDay()+6)%7); start.setHours(0,0,0,0)
  const active = tasks.filter(t => !completed(t, allStages, boardStages))
  return {
    mine: active.filter(t => t.assignee_id === userId),
    overdue: active.filter(t => t.due_at && t.due_at.slice(0, 10) < today),
    soon: active.filter(t => t.due_at && t.due_at.slice(0, 10) >= today && t.due_at.slice(0, 10) <= soon),
    blocked: active.filter(t => resolveTaskStage(t, allStages, boardStages).isPause),
    week: tasks.filter(t => completed(t, allStages, boardStages) && t.completed_at && new Date(t.completed_at) >= start),
  }
}
export function isUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isNetworkError(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'string') {
    return error.includes('Failed to fetch') || error.includes('NetworkError') || error.toLowerCase().includes('network')
  }
  if (error instanceof Error) {
    return error.message.includes('Failed to fetch') ||
      (error.name === 'TypeError' && error.message.includes('fetch')) ||
      error.message.includes('NetworkError') ||
      error.name === 'NetworkError'
  }
  if (typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message)
    return msg.includes('Failed to fetch') || msg.includes('NetworkError')
  }
  return false
}

export function isMissingColumnError(error: unknown, columnName?: string): boolean {
  if (!error) return false
  const msg = typeof error === 'string'
    ? error
    : (error as { message?: string })?.message || (error as Error)?.message || ''
  const lower = msg.toLowerCase()
  const isSchemaCache = lower.includes('in the schema cache') || lower.includes('does not exist') || lower.includes('pgrst204')
  if (!isSchemaCache) return false
  if (columnName) {
    return lower.includes(columnName.toLowerCase())
  }
  return true
}

export function messageError(error: unknown): string {
  if (!error) return 'Erro desconhecido'
  if (typeof error === 'string') {
    if (error.includes('Failed to fetch')) {
      return 'Falha de conexão com o servidor Supabase (Failed to fetch). Verifique sua conexão com a internet ou se extensões do navegador (adblock/firewall) estão bloqueando requisições para o Supabase.'
    }
    return error
  }
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError' && error.message.includes('fetch')) {
      return 'Falha de conexão com o servidor Supabase (Failed to fetch). Verifique sua conexão com a internet ou se extensões do navegador (adblock/firewall) estão bloqueando requisições para o Supabase.'
    }
    return error.message
  }
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>
    if (typeof err.message === 'string' && err.message) {
      if (err.message.includes('Failed to fetch')) {
        return 'Falha de conexão com o servidor Supabase (Failed to fetch). Verifique sua conexão com a internet ou se extensões do navegador (adblock/firewall) estão bloqueando requisições para o Supabase.'
      }
      const details = typeof err.details === 'string' && err.details ? ` (${err.details})` : ''
      const hint = typeof err.hint === 'string' && err.hint ? ` - Dica: ${err.hint}` : ''
      return `${err.message}${details}${hint}`
    }
    if (typeof err.error_description === 'string' && err.error_description) return err.error_description
    if (typeof err.error === 'string' && err.error) return err.error
    if (typeof err.details === 'string' && err.details) return err.details
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}') return json
    } catch {
      // ignore
    }
  }
  return String(error)
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

