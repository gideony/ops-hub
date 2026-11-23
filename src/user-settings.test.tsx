import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import UserSettings from './UserSettings'
import {
  getUserPreferences,
  saveUserPreferences,
  DEFAULT_USER_PREFERENCES,
  playNotificationChime,
} from './user-preferences'
import type { Profile } from './lib'

class LocalStorageMock {
  private store = new Map<string, string>()

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
      Notification: { permission: 'default', requestPermission: vi.fn() },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    writable: true,
  })
}

describe('Módulo de Preferências do Usuário (user-preferences.ts)', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  it('retorna os valores padrão quando não há nada salvo', () => {
    const prefs = getUserPreferences('user-1')
    expect(prefs).toEqual(DEFAULT_USER_PREFERENCES)
    expect(prefs.defaultTaskView).toBe('kanban')
    expect(prefs.defaultGeneralMode).toBe('lateral')
    expect(prefs.startPage).toBe('dashboard')
    expect(prefs.soundChatMessages).toBe(true)
    expect(prefs.soundChatMentions).toBe(true)
  })

  it('salva e recupera alterações de preferências por usuário', () => {
    saveUserPreferences('user-1', {
      defaultTaskView: 'lista',
      defaultGeneralMode: 'consolidado',
      hideEmptyColumns: true,
      startPage: 'tasks',
      soundChatMessages: false,
    })

    const prefs = getUserPreferences('user-1')
    expect(prefs.defaultTaskView).toBe('lista')
    expect(prefs.defaultGeneralMode).toBe('consolidado')
    expect(prefs.hideEmptyColumns).toBe(true)
    expect(prefs.startPage).toBe('tasks')
    expect(prefs.soundChatMessages).toBe(false)
    expect(prefs.soundChatMentions).toBe(true) // não alterado
  })

  it('sincroniza chaves legadas de modo do geral e colunas vazias', () => {
    saveUserPreferences('user-legacy', {
      defaultGeneralMode: 'consolidado',
      hideEmptyColumns: true,
      defaultTaskView: 'lista',
      startPage: 'chat',
    })

    expect(mockStorage.getItem('somax_general_mode_user-legacy')).toBe('consolidado')
    expect(mockStorage.getItem('somax_hide_empty_cols_all_user-legacy')).toBe('true')
    expect(mockStorage.getItem('somax_default_task_view_user-legacy')).toBe('lista')
    expect(mockStorage.getItem('somax_start_page_user-legacy')).toBe('chat')
  })

  it('playNotificationChime executa sem lançar erros em ambiente de teste', () => {
    expect(() => playNotificationChime('message')).not.toThrow()
    expect(() => playNotificationChime('mention')).not.toThrow()
  })
})

describe('Componente UserSettings.tsx — Configurações e Preferências', () => {
  beforeEach(() => {
    mockStorage.clear()
  })

  const mockProfile: Profile = {
    id: 'user-test-123',
    full_name: 'Carlos Oliveira',
    email: 'carlos@opshub.com.br',
    whatsapp: '+5585988887777',
    role: 'gestor',
    active: true,
  }

  const mockTeams = ['Comercial', 'Suporte']
  const mockNotify = vi.fn()
  const mockProfileSaved = vi.fn()
  const mockThemeChange = vi.fn()

  it('renderiza os dados de perfil corporativo, cargo e equipes ativas', () => {
    const html = renderToStaticMarkup(
      <UserSettings
        profile={mockProfile}
        email="carlos@opshub.com.br"
        teams={mockTeams}
        preview={true}
        theme="light"
        onThemeChange={mockThemeChange}
        onProfileSaved={mockProfileSaved}
        notify={mockNotify}
      />
    )

    expect(html).toContain('Configurações e Preferências')
    expect(html).toContain('Carlos Oliveira')
    expect(html).toContain('carlos@opshub.com.br')
    expect(html).toContain('Gestor')
    expect(html).toContain('Comercial')
    expect(html).toContain('Suporte')
    expect(html).toContain('Perfil Corporativo')
    expect(html).toContain('Preferências de Tarefas')
    expect(html).toContain('Notificações &amp; Sons')
    expect(html).toContain('Segurança &amp; Aparência')
  })

  it('exibe o badge de Administrador Master quando o perfil for master', () => {
    const masterProfile: Profile = {
      ...mockProfile,
      is_master: true,
    }

    const html = renderToStaticMarkup(
      <UserSettings
        profile={masterProfile}
        email="admin@opshub.com.br"
        teams={mockTeams}
        preview={false}
        theme="dark"
        onThemeChange={mockThemeChange}
        onProfileSaved={mockProfileSaved}
        notify={mockNotify}
      />
    )

    expect(html).toContain('Administrador Master')
  })
})
