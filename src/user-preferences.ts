/**
 * Somax Hub — Módulo de Preferências do Usuário
 * Centraliza tipagem, leitura e persistência resiliente de preferências pessoais.
 * Funciona offline (localStorage por userId) e no modo demonstração.
 */

export interface UserPreferences {
  // Visualização de Tarefas
  defaultTaskView: 'kanban' | 'lista'
  defaultGeneralMode: 'lateral' | 'consolidado'
  hideEmptyColumns: boolean
  startPage: 'dashboard' | 'tasks' | 'chat'

  // Notificações & Alertas
  soundChatMessages: boolean
  soundChatMentions: boolean
  browserNotifications: boolean
  taskDueAlerts: boolean
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultTaskView: 'kanban',
  defaultGeneralMode: 'lateral',
  hideEmptyColumns: false,
  startPage: 'dashboard',
  soundChatMessages: true,
  soundChatMentions: true,
  browserNotifications: false,
  taskDueAlerts: true,
}

function getStorageKey(userId?: string): string {
  return `somax_user_preferences_${userId || 'default'}`
}

/**
 * Carrega as preferências salvas do usuário ou retorna o padrão seguro.
 */
export function getUserPreferences(userId?: string): UserPreferences {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return { ...DEFAULT_USER_PREFERENCES }
    const parsed = JSON.parse(raw)
    return {
      defaultTaskView: parsed.defaultTaskView === 'lista' ? 'lista' : 'kanban',
      defaultGeneralMode: parsed.defaultGeneralMode === 'consolidado' ? 'consolidado' : 'lateral',
      hideEmptyColumns: Boolean(parsed.hideEmptyColumns),
      startPage: ['dashboard', 'tasks', 'chat'].includes(parsed.startPage) ? parsed.startPage : 'dashboard',
      soundChatMessages: parsed.soundChatMessages !== false,
      soundChatMentions: parsed.soundChatMentions !== false,
      browserNotifications: Boolean(parsed.browserNotifications),
      taskDueAlerts: parsed.taskDueAlerts !== false,
    }
  } catch {
    return { ...DEFAULT_USER_PREFERENCES }
  }
}

/**
 * Salva as preferências do usuário no armazenamento local e sincroniza chaves legadas.
 */
export function saveUserPreferences(userId: string | undefined, prefs: Partial<UserPreferences>): UserPreferences {
  const current = getUserPreferences(userId)
  const updated: UserPreferences = { ...current, ...prefs }

  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(updated))

    // Sincroniza chaves legadas para compatibilidade instantânea com general-views.ts e App.tsx
    if (prefs.defaultGeneralMode) {
      localStorage.setItem(`somax_general_mode_${userId || 'default'}`, prefs.defaultGeneralMode)
    }
    if (prefs.hideEmptyColumns !== undefined) {
      localStorage.setItem(`somax_hide_empty_cols_all_${userId || 'default'}`, String(prefs.hideEmptyColumns))
      localStorage.setItem(`somax_hide_empty_cols_lateral_${userId || 'default'}`, String(prefs.hideEmptyColumns))
      localStorage.setItem(`somax_hide_empty_cols_consolidado_${userId || 'default'}`, String(prefs.hideEmptyColumns))
    }
    if (prefs.startPage) {
      localStorage.setItem(`somax_start_page_${userId || 'default'}`, prefs.startPage)
    }
    if (prefs.defaultTaskView) {
      localStorage.setItem(`somax_default_task_view_${userId || 'default'}`, prefs.defaultTaskView)
    }
  } catch {}

  return updated
}

/**
 * Toca um bip suave sintetizado via Web Audio API para teste ou alerta sonoro (sem dependência de arquivos externos).
 */
export function playNotificationChime(type: 'message' | 'mention' = 'message') {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    if (type === 'mention') {
      // Tom duplo mais brilhante para menções
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
    } else {
      // Tom suave de mensagem
      osc.frequency.setValueAtTime(440, ctx.currentTime) // A4
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12) // E5
    }

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {
    // Silencioso caso áudio esteja desabilitado no navegador
  }
}
