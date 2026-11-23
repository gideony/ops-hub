import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell,
  Check,
  Columns,
  Compass,
  FolderKanban,
  Kanban,
  LayoutGrid,
  List,
  LockKeyhole,
  MessageSquare,
  Moon,
  Save,
  ShieldCheck,
  Sliders,
  Sun,
  UserRound,
  Volume2,
  Volume1,
  Users
} from 'lucide-react'
import { maskPhone, messageError, supabase } from './lib'
import type { Profile } from './lib'
import PasswordInput from './PasswordInput'
import {
  getUserPreferences,
  saveUserPreferences,
  playNotificationChime,
  type UserPreferences
} from './user-preferences'

type Props = {
  profile: Profile | null
  email: string
  teams: string[]
  preview: boolean
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onProfileSaved: (profile: Profile) => void
  notify: (message: string) => void
  initialTab?: 'perfil' | 'tarefas' | 'notificacoes' | 'seguranca'
}

const roles: Record<Profile['role'], string> = {
  administrador: 'Administrador',
  gestor: 'Gestor',
  colaborador: 'Colaborador',
}

export default function UserSettings({
  profile,
  email,
  teams,
  preview,
  theme,
  onThemeChange,
  onProfileSaved,
  notify,
  initialTab = 'perfil',
}: Props) {
  const [activeTab, setActiveTab] = useState<'perfil' | 'tarefas' | 'notificacoes' | 'seguranca'>(initialTab)

  // Dados de Perfil
  const [name, setName] = useState(profile?.full_name || '')
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || '')
  const [profileError, setProfileError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Segurança (Senha)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // Preferências do Usuário
  const [prefs, setPrefs] = useState<UserPreferences>(() => getUserPreferences(profile?.id))
  const [browserPermStatus, setBrowserPermStatus] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const notifApi = (window as unknown as { Notification?: { permission?: NotificationPermission } }).Notification
      return notifApi?.permission || 'default'
    }
    return 'default'
  })

  useEffect(() => {
    setName(profile?.full_name || '')
    setWhatsapp(profile?.whatsapp || '')
    setPrefs(getUserPreferences(profile?.id))
  }, [profile?.id, profile?.full_name, profile?.whatsapp])

  function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const updated = saveUserPreferences(profile?.id, { [key]: value })
    setPrefs(updated)
    notify('Preferência atualizada.')
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    const cleanName = name.trim()
    const digits = whatsapp.replace(/\D/g, '')
    const cleanWhatsapp = digits ? `+${digits.length === 10 || digits.length === 11 ? `55${digits}` : digits}` : ''
    if (cleanName.length < 2 || cleanName.length > 120) {
      setProfileError('Informe um nome entre 2 e 120 caracteres.')
      return
    }
    if (cleanWhatsapp && !/^\+[0-9]{10,15}$/.test(cleanWhatsapp)) {
      setProfileError('Informe um número de telefone/WhatsApp válido com DDD.')
      return
    }
    setProfileError('')
    setSavingProfile(true)
    try {
      if (!preview) {
        const { error } = await supabase.rpc('update_my_profile', {
          p_full_name: cleanName,
          p_whatsapp: cleanWhatsapp || null,
        })
        if (error) throw error
      }
      onProfileSaved({ ...profile, full_name: cleanName, whatsapp: cleanWhatsapp || null })
      notify(preview ? 'Perfil atualizado nesta prévia local.' : 'Seu perfil foi atualizado.')
    } catch (error) {
      setProfileError(messageError(error))
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (newPassword.length < 8) {
      setPasswordError('Use uma senha com pelo menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }
    if (preview) {
      setPasswordError('A troca de senha exige uma conta conectada ao Supabase.')
      return
    }
    setPasswordError('')
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      notify('Sua senha foi alterada.')
    } catch (error) {
      setPasswordError(messageError(error))
    } finally {
      setSavingPassword(false)
    }
  }

  async function requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notify('Seu navegador não suporta notificações de área de trabalho.')
      return
    }
    try {
      const notifApi = (window as unknown as { Notification?: { requestPermission: () => Promise<NotificationPermission> } }).Notification
      if (!notifApi) return
      const permission = await notifApi.requestPermission()
      setBrowserPermStatus(permission)
      if (permission === 'granted') {
        updatePreference('browserNotifications', true)
        testDesktopNotification()
      } else {
        updatePreference('browserNotifications', false)
        notify('Permissão de notificação negada no navegador.')
      }
    } catch {
      notify('Não foi possível solicitar permissão ao navegador.')
    }
  }

  function testDesktopNotification() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const NotifConstructor = (window as unknown as { Notification?: new (title: string, options?: NotificationOptions) => unknown }).Notification
        if (NotifConstructor && browserPermStatus === 'granted') {
          new NotifConstructor('OPSHUB — Teste de Notificação', {
            body: 'As notificações da sua conta estão configuradas e ativas!',
            icon: '/favicon.ico',
          })
        }
      } catch {}
    }
    playNotificationChime('mention')
    notify('Alerta de teste enviado com sucesso.')
  }

  const initials = (profile?.full_name || email || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('')

  return (
    <section className="content account-settings">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MINHA CONTA</div>
          <h1>Configurações e Preferências</h1>
          <p>Personalize suas informações corporativas, preferências de tarefas, alertas e segurança.</p>
        </div>
      </div>

      {/* Cartão de Perfil Corporativo Principal */}
      <div className="account-intro">
        <div className="account-avatar">{initials}</div>
        <div className="account-intro-main">
          <div className="account-title-row">
            <h2>{profile?.full_name || 'Usuário'}</h2>
            <span className={`account-role ${profile?.is_master ? 'master' : ''}`}>
              <ShieldCheck size={13} />
              {profile?.is_master ? 'Administrador Master' : profile ? roles[profile.role] : 'Conta ativa'}
            </span>
          </div>
          <p>{email}</p>
          <div className="account-teams-summary">
            <span className="teams-label">Equipes:</span>
            {teams.length > 0 ? (
              teams.map(t => (
                <span key={t} className="account-team-chip">
                  <Users size={11} /> {t}
                </span>
              ))
            ) : (
              <span className="account-teams-empty">Nenhuma equipe vinculada</span>
            )}
          </div>
        </div>
      </div>

      {/* Navegação entre Subabas de Configuração */}
      <div className="settings-tabs-nav" role="tablist" aria-label="Abas de configuração">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'perfil'}
          className={`settings-tab-btn ${activeTab === 'perfil' ? 'active' : ''}`}
          onClick={() => setActiveTab('perfil')}
        >
          <UserRound size={15} />
          <span>Perfil Corporativo</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tarefas'}
          className={`settings-tab-btn ${activeTab === 'tarefas' ? 'active' : ''}`}
          onClick={() => setActiveTab('tarefas')}
        >
          <Sliders size={15} />
          <span>Preferências de Tarefas</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notificacoes'}
          className={`settings-tab-btn ${activeTab === 'notificacoes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notificacoes')}
        >
          <Bell size={15} />
          <span>Notificações & Sons</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'seguranca'}
          className={`settings-tab-btn ${activeTab === 'seguranca' ? 'active' : ''}`}
          onClick={() => setActiveTab('seguranca')}
        >
          <LockKeyhole size={15} />
          <span>Segurança & Aparência</span>
        </button>
      </div>

      {/* ABA 1: PERFIL CORPORATIVO */}
      <div hidden={activeTab !== 'perfil'}>
        <div className="account-grid">
          <section className="account-panel">
            <div className="account-panel-heading">
              <UserRound size={18} />
              <div>
                <h2>Dados de Contato Corporativo</h2>
                <p>Mantenha seu nome e telefone atualizados para comunicação interna.</p>
              </div>
            </div>
            <form onSubmit={event => void saveProfile(event)} className="account-form">
              <label className="field">
                <span>Nome completo *</span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>

              <label className="field">
                <span>E-mail institucional (Acesso)</span>
                <input value={email} type="email" readOnly aria-readonly="true" />
              </label>

              <label className="field">
                <span>WhatsApp corporativo</span>
                <input
                  value={whatsapp}
                  onChange={event => setWhatsapp(maskPhone(event.target.value))}
                  type="tel"
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                />
              </label>

              <p className="account-hint">
                O e-mail e as permissões de acesso ao sistema são gerenciados pela administração do OPSHUB.
              </p>

              {profileError && (
                <p className="form-error" role="alert">
                  {profileError}
                </p>
              )}

              <button className="btn btn-primary" type="submit" disabled={savingProfile || !profile}>
                <Save size={15} />
                {savingProfile ? 'Salvando...' : 'Salvar dados do perfil'}
              </button>
            </form>
          </section>

          <div className="account-side">
            <section className="account-panel">
              <div className="account-panel-heading">
                <ShieldCheck size={18} />
                <div>
                  <h2>Estrutura Organizacional</h2>
                  <p>Sua alocação em equipes e nível de permissão.</p>
                </div>
              </div>
              <div className="account-access">
                <div>
                  <span>Cargo / Função</span>
                  <strong>
                    {profile?.is_master ? 'Administrador Master' : profile ? roles[profile.role] : '—'}
                  </strong>
                </div>
                <div>
                  <span>Equipes Ativas</span>
                  <strong>{teams.length ? teams.join(', ') : 'Nenhuma equipe ativa'}</strong>
                </div>
                <div>
                  <span>Modo de Demonstração</span>
                  <strong>{preview ? 'Ativo (Local sem Supabase)' : 'Conectado ao Supabase Cloud'}</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ABA 2: PREFERÊNCIAS DE VISUALIZAÇÃO DE TAREFAS */}
      <div hidden={activeTab !== 'tarefas'}>
        <div className="account-grid">
          <section className="account-panel">
            <div className="account-panel-heading">
              <Sliders size={18} />
              <div>
                <h2>Visualização Padrão das Tarefas</h2>
                <p>Configure como os quadros operacionais e o Geral devem abrir para você.</p>
              </div>
            </div>

            <div className="account-pref-body">
              {/* Opção 1: Lista vs Kanban nos Quadros */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Modo de exibição dos quadros</strong>
                  <p>Escolha a visão padrão ao abrir qualquer quadro operacional (Comercial, Implantação, etc.).</p>
                </div>
                <div className="pref-segment-group" role="radiogroup" aria-label="Modo de visualização dos quadros">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.defaultTaskView === 'kanban'}
                    className={`pref-segment-btn ${prefs.defaultTaskView === 'kanban' ? 'active' : ''}`}
                    onClick={() => updatePreference('defaultTaskView', 'kanban')}
                  >
                    <Kanban size={15} />
                    <span>Quadro (Kanban)</span>
                    {prefs.defaultTaskView === 'kanban' && <Check size={13} />}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.defaultTaskView === 'lista'}
                    className={`pref-segment-btn ${prefs.defaultTaskView === 'lista' ? 'active' : ''}`}
                    onClick={() => updatePreference('defaultTaskView', 'lista')}
                  >
                    <List size={15} />
                    <span>Lista detalhada</span>
                    {prefs.defaultTaskView === 'lista' && <Check size={13} />}
                  </button>
                </div>
              </div>

              {/* Opção 2: Modo Lateral vs Consolidado no Geral */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Aba Geral: Modo de Agregação Panorâmica</strong>
                  <p>Defina o layout padrão para a visão Geral dos quadros reais.</p>
                </div>
                <div className="pref-segment-group" role="radiogroup" aria-label="Modo de agregação da aba Geral">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.defaultGeneralMode === 'lateral'}
                    className={`pref-segment-btn ${prefs.defaultGeneralMode === 'lateral' ? 'active' : ''}`}
                    onClick={() => updatePreference('defaultGeneralMode', 'lateral')}
                  >
                    <Columns size={15} />
                    <span>Modo Lateral (Lado a Lado)</span>
                    {prefs.defaultGeneralMode === 'lateral' && <Check size={13} />}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.defaultGeneralMode === 'consolidado'}
                    className={`pref-segment-btn ${prefs.defaultGeneralMode === 'consolidado' ? 'active' : ''}`}
                    onClick={() => updatePreference('defaultGeneralMode', 'consolidado')}
                  >
                    <FolderKanban size={15} />
                    <span>Modo Consolidado (Faixas)</span>
                    {prefs.defaultGeneralMode === 'consolidado' && <Check size={13} />}
                  </button>
                </div>
              </div>

              {/* Opção 3: Ocultar Colunas Vazias */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Colunas vazias recolhidas por padrão</strong>
                  <p>Inicia colunas sem tarefas recolhidas em tiras compactas de 46px para economizar espaço horizontal.</p>
                </div>
                <label className="pref-switch-wrap">
                  <input
                    type="checkbox"
                    checked={prefs.hideEmptyColumns}
                    onChange={e => updatePreference('hideEmptyColumns', e.target.checked)}
                  />
                  <span className="pref-slider" />
                </label>
              </div>

              {/* Opção 4: Página Inicial do Hub */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Página inicial ao entrar no sistema</strong>
                  <p>Selecione a tela que deve ser carregada imediatamente após o login.</p>
                </div>
                <div className="pref-segment-group" role="radiogroup" aria-label="Página inicial ao entrar">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.startPage === 'dashboard'}
                    className={`pref-segment-btn ${prefs.startPage === 'dashboard' ? 'active' : ''}`}
                    onClick={() => updatePreference('startPage', 'dashboard')}
                  >
                    <LayoutGrid size={15} />
                    <span>Dashboard</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.startPage === 'tasks'}
                    className={`pref-segment-btn ${prefs.startPage === 'tasks' ? 'active' : ''}`}
                    onClick={() => updatePreference('startPage', 'tasks')}
                  >
                    <Kanban size={15} />
                    <span>Tarefas</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={prefs.startPage === 'chat'}
                    className={`pref-segment-btn ${prefs.startPage === 'chat' ? 'active' : ''}`}
                    onClick={() => updatePreference('startPage', 'chat')}
                  >
                    <MessageSquare size={15} />
                    <span>Chat da Equipe</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="account-side">
            <section className="account-panel">
              <div className="account-panel-heading">
                <Compass size={18} />
                <div>
                  <h2>Dicas de Produtividade</h2>
                  <p>Ajustes automáticos de ergonomia visual.</p>
                </div>
              </div>
              <div className="account-pref-tips">
                <p>
                  <strong>Visão em Lista:</strong> Ideal para triagens massivas, reuniões de status e conferência de
                  prazos com ordenação por coluna.
                </p>
                <p>
                  <strong>Visão Kanban:</strong> Recomendada para operação diária, passagem de bastão e fluxo contínuo.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ABA 3: NOTIFICAÇÕES & SONS */}
      <div hidden={activeTab !== 'notificacoes'}>
        <div className="account-grid">
          <section className="account-panel">
            <div className="account-panel-heading">
              <Bell size={18} />
              <div>
                <h2>Alertas e Sons de Notificação</h2>
                <p>Gerencie como e quando você deseja ser notificado sobre novidades e menções.</p>
              </div>
            </div>

            <div className="account-pref-body">
              {/* Sons no Chat: Mensagens */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Som ao receber nova mensagem no canal ativo</strong>
                  <p>Emite um bip suave para que você não perca conversas enquanto atende outras abas.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-test-sound"
                    title="Ouvir som de teste"
                    onClick={() => playNotificationChime('message')}
                  >
                    <Volume1 size={14} /> Testar
                  </button>
                  <label className="pref-switch-wrap">
                    <input
                      type="checkbox"
                      checked={prefs.soundChatMessages}
                      onChange={e => updatePreference('soundChatMessages', e.target.checked)}
                    />
                    <span className="pref-slider" />
                  </label>
                </div>
              </div>

              {/* Sons no Chat: Menções */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Som prioritário para menções diretas (@você / @todos)</strong>
                  <p>Alerta sonoro diferenciado para chamadas onde sua atenção é solicitada nominalmente.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-test-sound"
                    title="Ouvir som de teste"
                    onClick={() => playNotificationChime('mention')}
                  >
                    <Volume2 size={14} /> Testar
                  </button>
                  <label className="pref-switch-wrap">
                    <input
                      type="checkbox"
                      checked={prefs.soundChatMentions}
                      onChange={e => updatePreference('soundChatMentions', e.target.checked)}
                    />
                    <span className="pref-slider" />
                  </label>
                </div>
              </div>

              {/* Notificações no Navegador (Desktop Push) */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Notificações na área de trabalho (Navegador)</strong>
                  <p>Receba alertas em janela suspensa mesmo quando o navegador estiver minimizado.</p>
                  <small style={{ color: 'var(--text-muted)' }}>
                    Status atual no navegador:{' '}
                    <strong>
                      {browserPermStatus === 'granted'
                        ? 'Permitido'
                        : browserPermStatus === 'denied'
                        ? 'Bloqueado no navegador'
                        : 'Pendente de autorização'}
                    </strong>
                  </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {browserPermStatus !== 'granted' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void requestNotificationPermission()}
                    >
                      Permitir no navegador
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-test-sound"
                      onClick={() => testDesktopNotification()}
                    >
                      <Bell size={13} /> Enviar teste
                    </button>
                  )}
                </div>
              </div>

              {/* Alertas de Prazos de Tarefas */}
              <div className="pref-item">
                <div className="pref-item-info">
                  <strong>Alerta de prazos e tarefas atribuídas</strong>
                  <p>Destaque no sino do topo para tarefas que vencem hoje ou com prazo expirado.</p>
                </div>
                <label className="pref-switch-wrap">
                  <input
                    type="checkbox"
                    checked={prefs.taskDueAlerts}
                    onChange={e => updatePreference('taskDueAlerts', e.target.checked)}
                  />
                  <span className="pref-slider" />
                </label>
              </div>
            </div>
          </section>

          <div className="account-side">
            <section className="account-panel">
              <div className="account-panel-heading">
                <Volume2 size={18} />
                <div>
                  <h2>Privacidade e Foco</h2>
                  <p>Controle do fluxo de atenção no trabalho.</p>
                </div>
              </div>
              <div className="account-pref-tips">
                <p>
                  Os alertas sonoros são sintetizados via áudio nativo do navegador, sem consumir tráfego de dados e sem
                  interromper reprodutores externos.
                </p>
                <p>
                  Para silenciar completamente o hub durante reuniões, basta desmarcar os interruptores de som ao lado.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ABA 4: SEGURANÇA & APARÊNCIA */}
      <div hidden={activeTab !== 'seguranca'}>
        <div className="account-grid">
          <section className="account-panel">
            <div className="account-panel-heading">
              <LockKeyhole size={18} />
              <div>
                <h2>Segurança de Acesso</h2>
                <p>Altere periodicamente sua senha para proteger sua conta corporativa.</p>
              </div>
            </div>
            <form onSubmit={event => void savePassword(event)} className="account-form">
              <label className="field">
                <span>Nova senha</span>
                <PasswordInput
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="field">
                <span>Confirmar nova senha</span>
                <PasswordInput
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>

              {passwordError && (
                <p className="form-error" role="alert">
                  {passwordError}
                </p>
              )}

              <button className="btn btn-secondary" type="submit" disabled={savingPassword || preview}>
                {savingPassword ? 'Alterando...' : 'Alterar minha senha'}
              </button>

              {preview && (
                <p className="account-hint">A troca de senha exige uma conta conectada ao Supabase Cloud.</p>
              )}
            </form>
          </section>

          <div className="account-side">
            <section className="account-panel">
              <div className="account-panel-heading">
                <Sun size={18} />
                <div>
                  <h2>Aparência do Hub</h2>
                  <p>Escolha o tema visual que melhor se adapta à sua iluminação.</p>
                </div>
              </div>
              <div className="account-appearance">
                <button
                  type="button"
                  className={theme === 'light' ? 'selected' : ''}
                  onClick={() => onThemeChange('light')}
                >
                  <Sun size={17} /> Claro {theme === 'light' && <Check size={15} />}
                </button>
                <button
                  type="button"
                  className={theme === 'dark' ? 'selected' : ''}
                  onClick={() => onThemeChange('dark')}
                >
                  <Moon size={17} /> Escuro {theme === 'dark' && <Check size={15} />}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}
