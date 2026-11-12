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
  created_by: string
  created_at: string
  updated_at: string
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
export type Task = { id: string; title: string; description: string; team_id: string; assignee_id: string | null; client_id: string | null; stage_id: string; priority: 'baixa' | 'media' | 'alta' | 'urgente'; due_at: string | null; tags: string[]; completed_at: string | null; created_by: string; created_at: string; updated_at: string; board_id?: string | null; sprint_id?: string | null; story_points?: number | null; backlog_order?: number }
export type Checklist = { id: string; task_id: string; title: string; done: boolean; position: number; group_name?: string | null }
export type TaskComment = { id: string; task_id: string; author_id: string; body: string; created_at: string }
export type Movement = { id: string; task_id: string; from_stage_id: string | null; to_stage_id: string; moved_by: string; moved_at: string }
export type Channel = { id: string; team_id: string; name: string; created_at: string }
export type Message = { id: string; channel_id: string; author_id: string; body: string; reply_to_id: string | null; task_id: string | null; created_at: string }
export type Attachment = { id: string; message_id: string; storage_path: string; file_name: string; size_bytes: number }
export type Read = { channel_id: string; user_id: string; last_read_at: string }

export async function unreadMessageCounts() {
  const { data, error } = await supabase.rpc('unread_message_counts')
  if (error) throw error
  return Object.fromEntries(((data || []) as { channel_id: string; unread_count: number }[])
    .map(row => [row.channel_id, Number(row.unread_count)])) as Record<string, number>
}

export function completed(task: Task, stages: (Stage | BoardStage)[]) {
  return stages.find(s => s.id === task.stage_id)?.is_final === true
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
  const active = tasks.filter(t => !completed(t, allStages))
  return {
    mine: active.filter(t => t.assignee_id === userId),
    overdue: active.filter(t => t.due_at && t.due_at.slice(0, 10) < today),
    soon: active.filter(t => t.due_at && t.due_at.slice(0, 10) >= today && t.due_at.slice(0, 10) <= soon),
    blocked: active.filter(t => stages.find(s => s.id === t.stage_id)?.is_pause),
    week: tasks.filter(t => completed(t, allStages) && t.completed_at && new Date(t.completed_at) >= start),
  }
}
export function messageError(error: unknown): string {
  if (!error) return 'Erro desconhecido'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>
    if (typeof err.message === 'string' && err.message) {
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

