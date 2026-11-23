import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDown, ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2, CircleHelp, ClipboardList, FolderKanban, GitBranch, Layers, LayoutDashboard, List, Lock, LogOut, Menu, MessageCircle, Moon, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sun, Tags, Trash2, Users, X, Zap } from 'lucide-react'
import type { CSSProperties } from 'react'
import { supabase, configured, completed, resolveTaskStage, dateBR, todayISO, taskBuckets, messageError, unreadChannelMetrics, isNetworkError, DEFAULT_BOARD_TEMPLATES } from './lib'
import type { Board, BoardStage, BoardTemplate, Channel, Checklist, ChecklistTemplateGroup, ChecklistTemplateItem, Client, Member, Profile, Read, Sprint, Stage, Tag, Task, Team, Template, Transition, Data } from './lib'
import { demoData, initialDemoChecklists } from './demo'
import { clearUserDrafts } from './drafts'
import NewTaskForm from './NewTaskForm'
import TemplateEditor from './TemplateEditor'
import TemplateTab from './TemplateTab'
import BoardTemplateModal from './BoardTemplateModal'
import TagEditor from './TagEditor'
import TagTab from './TagTab'
import TaskDetailModal from './TaskDetail'
import ChatPage from './ChatPage'
import { CreateBoardModal, EditBoardModal, SprintPlanModal } from './BoardModals'
import { BurndownModal, CompleteSprintModal, CreateSprintModal, SprintActiveHeader, BacklogView } from './ScrumComponents'
import { PublicClientRegistrationPage } from './PublicClientRegistrationPage'
import ForwardTaskModal from './ForwardTaskModal'
import { getPermittedDestinationBoards } from './board-permissions'
import './general-views.css'
import './modern-tasks.css'
import {
  type GeneralSituationFilter,
  type GeneralViewMode,
  canonicalStageVisuals,
  getBoardVisual,
  getStagesForBoard,
  getUserBoardTabsOrder,
  getUserConsolidatedExpanded,
  getUserGeneralMode,
  getUserHideEmptyColumns,
  getUserLateralBlockOrder,
  setUserBoardTabsOrder,
  setUserConsolidatedExpanded,
  setUserGeneralMode,
  setUserHideEmptyColumns,
  setUserLateralBlockOrder,
} from './general-views'
import { GeneralAccordionView, GeneralLateralView, GeneralToolbar } from './GeneralViews'
import Dashboard from './Dashboard'
import './dashboard.css'
import PasswordInput from './PasswordInput'
import { getUserPreferences } from './user-preferences'

const ReportsPage = lazy(() => import('./ReportsPage'))
const ClientsPage = lazy(() => import('./AdminPages').then(m => ({ default: m.ClientsPage })))
const TeamsPage = lazy(() => import('./AdminPages').then(m => ({ default: m.TeamsPage })))
const UsersPage = lazy(() => import('./AdminPages').then(m => ({ default: m.UsersPage })))
const UserSettings = lazy(() => import('./UserSettings'))

export type Page = 'dashboard' | 'reports' | 'tasks' | 'completed' | 'chat' | 'clients' | 'teams' | 'users' | 'settings'
export type DashboardFilter = 'mine' | 'overdue' | 'soon' | 'blocked' | 'week' | null
export type { Data } from './lib'
const empty: Data = {
  profiles: [],
  teams: [],
  members: [],
  clients: [],
  stages: [],
  transitions: [],
  templates: [],
  templateGroups: [],
  templateItems: [],
  tags: [],
  tasks: [],
  channels: [],
  reads: [],
  boards: [],
  boardStages: [],
  sprints: [],
  boardTemplates: [...DEFAULT_BOARD_TEMPLATES],
  registrationLinks: [],
  registrationSubmissions: [],
}
const priorityLabel = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }
const nav: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page:'dashboard', label:'Dashboard', icon:LayoutDashboard }, { page:'reports', label:'Relatórios', icon:BarChart3 }, { page:'tasks', label:'Tarefas', icon:ClipboardList },
  { page:'completed', label:'Tarefas Concluídas', icon:CheckCircle2 }, { page:'chat', label:'Chat', icon:MessageCircle }, { page:'clients', label:'Clientes', icon:Users },
  { page:'teams', label:'Equipes', icon:ShieldCheck }, { page:'users', label:'Usuários', icon:Users }, { page:'settings', label:'Configurações', icon:Settings2 },
]

function Button({ children, onClick, type='button', variant='primary', disabled=false, className='' }: { children: ReactNode; onClick?: () => void; type?: 'button'|'submit'; variant?: 'primary'|'secondary'|'ghost'; disabled?: boolean; className?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`}>{children}</button>
}
function Modal({ title, subtitle, onClose, children, wide=false, className='' }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) onClose() }}><div className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20}/></button></div>{children}</div></div>
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function Empty({ text }: { text: string }) { return <div className="empty"><CircleHelp size={27}/><p>{text}</p></div> }

export default function App() {
  const demoMode = !configured
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(demoMode)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [data, setData] = useState<Data>(demoMode ? demoData : empty)
  const [loading, setLoading] = useState(!demoMode)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState<Page>(() => {
    const requested = new URLSearchParams(window.location.search).get('pagina')
    const allowed: Page[] = ['dashboard', 'reports', 'tasks', 'completed', 'chat', 'clients', 'teams', 'users', 'settings']
    if (allowed.includes(requested as Page)) return requested as Page
    const userPrefs = getUserPreferences()
    if (allowed.includes(userPrefs.startPage as Page)) return userPrefs.startPage as Page
    return !demoMode ? 'dashboard' : 'tasks'
  })
  const [mobileNav, setMobileNav] = useState(false)
  const [theme, setTheme] = useState<'dark'|'light'>(()=>document.documentElement.dataset.theme==='light'?'light':'dark')
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(demoMode ? demoData.tasks.find(task=>task.id===new URLSearchParams(window.location.search).get('tarefa'))||null : null)
  const [forwardingTask, setForwardingTask] = useState<Task | null>(null)
  const [forwardingTasks, setForwardingTasks] = useState<Task[] | null>(null)
  const [demoChecklists,setDemoChecklists] = useState<Record<string,Checklist[]>>(initialDemoChecklists)
  const [newTask, setNewTask] = useState(demoMode && new URLSearchParams(window.location.search).has('nova-tarefa'))
  const [taskView, setTaskView] = useState<'kanban'|'lista'|'backlog'|'sprint'>(() => {
    const userPrefs = getUserPreferences()
    return userPrefs.defaultTaskView === 'lista' ? 'lista' : 'kanban'
  })
  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    try { return localStorage.getItem('opshub_active_board') || localStorage.getItem('somax_active_board') || 'board-geral' } catch { return 'board-geral' }
  })
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const [createBoardInitialTemplate, setCreateBoardInitialTemplate] = useState<string | null>(null)
  const [editingBoardTemplate, setEditingBoardTemplate] = useState<BoardTemplate | null | undefined>(undefined)
  const [showSprintPlan, setShowSprintPlan] = useState(false)
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false)
  const [showBurndownModal, setShowBurndownModal] = useState(false)
  const [showCompleteSprintModal, setShowCompleteSprintModal] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [taskTab, setTaskTab] = useState<'tarefas'|'templates'|'tags'>(()=>{const value=demoMode?new URLSearchParams(window.location.search).get('aba'):null;return value==='templates'||value==='tags'?value:'tarefas'})
  const [query, setQuery] = useState('')
  const [completedQuery, setCompletedQuery] = useState('')
  const [completedBoardFilter, setCompletedBoardFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [dueFilter, setDueFilter] = useState('')
  const [showFlowSettings, setShowFlowSettings] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplateGroup | null | undefined>(()=>{if(!demoMode)return undefined;const query=new URLSearchParams(window.location.search);if(query.has('novo-template'))return null;return demoData.templateGroups.find(group=>group.id===query.get('editar-template'))})
  const [editingTag, setEditingTag] = useState<Tag | null | undefined>(()=>{if(!demoMode)return undefined;const query=new URLSearchParams(window.location.search);if(query.has('nova-tag'))return null;return demoData.tags.find(tag=>tag.id===query.get('editar-tag'))})
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false)
  const [hasMoreClients, setHasMoreClients] = useState(false)
  const [loadingMoreClients, setLoadingMoreClients] = useState(false)

  const [generalMode, setGeneralMode] = useState<GeneralViewMode>(() => getUserGeneralMode())
  const [generalSituation, setGeneralSituation] = useState<GeneralSituationFilter>('active')
  const [generalBoardFilter, setGeneralBoardFilter] = useState<string>('all')
  const [generalBlockOrder, setGeneralBlockOrder] = useState<string[]>([])
  const [generalExpandedAccordions, setGeneralExpandedAccordions] = useState<Record<string, boolean>>({})
  const [generalHideEmptyColumnsLateral, setGeneralHideEmptyColumnsLateral] = useState<boolean>(() =>
    getUserHideEmptyColumns(undefined, 'lateral')
  )
  const [generalHideEmptyColumnsConsolidado, setGeneralHideEmptyColumnsConsolidado] = useState<boolean>(() =>
    getUserHideEmptyColumns(undefined, 'consolidado')
  )
  const [boardTabsOrder, setBoardTabsOrder] = useState<string[]>([])
  const [dragOverTabInfo, setDragOverTabInfo] = useState<{ id: string; side: 'left' | 'right' } | null>(null)

  const [chatMetrics, setChatMetrics] = useState<Record<string, { unread_count: number; mention_count: number }>>({})
  const totalChatUnread = useMemo(() => Object.values(chatMetrics).reduce((acc, m) => acc + (m.unread_count || 0), 0), [chatMetrics])
  const totalChatMentions = useMemo(() => Object.values(chatMetrics).reduce((acc, m) => acc + (m.mention_count || 0), 0), [chatMetrics])

  useEffect(() => {
    if (demoMode) {
      setChatMetrics({
        'channel-geral': { unread_count: 2, mention_count: 1 }
      })
      return
    }
    let alive = true
    const fetchMetrics = async () => {
      try {
        const metrics = await unreadChannelMetrics()
        if (alive) setChatMetrics(metrics)
      } catch {
        // silencioso
      }
    }
    void fetchMetrics()
    const interval = setInterval(() => { void fetchMetrics() }, 15000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [demoMode, session?.user?.id])

  const currentUserIdRef = useRef<string | null>(null)
  const isManualSignOutRef = useRef<boolean>(false)
  const latestFetchIdRef = useRef(0)

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('opshub-theme',theme);localStorage.setItem('somax-hub-theme',theme)},[theme])

  useEffect(() => {
    if (demoMode) return
    supabase.auth.getSession().then(({data: {session}}) => {
      if (session?.user?.id) currentUserIdRef.current = session.user.id
      setSession(session)
      setAuthReady(true)
    })
    const {data: {subscription}} = supabase.auth.onAuthStateChange((event, session) => {
      setAuthReady(true)
      if (event === 'SIGNED_OUT') {
        if (isManualSignOutRef.current) {
          if (currentUserIdRef.current) clearUserDrafts(currentUserIdRef.current)
          isManualSignOutRef.current = false
        }
        currentUserIdRef.current = null
        setSession(null)
        setProfile(null)
        setData(empty)
        setLoading(false)
        return
      }
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setSession(session)
        if (session?.user?.id && session.user.id === currentUserIdRef.current) {
          return
        }
      }
      if (session?.user?.id !== currentUserIdRef.current) {
        currentUserIdRef.current = session?.user?.id || null
        setSession(session)
      }
    })
    return () => subscription.unsubscribe()
  }, [demoMode])

  const handleSignOut = useCallback(async () => {
    isManualSignOutRef.current = true
    if (currentUserIdRef.current) {
      clearUserDrafts(currentUserIdRef.current)
    }
    if (demoMode) {
      setSession(null)
      setProfile(null)
    } else {
      await supabase.auth.signOut()
    }
  }, [demoMode])

  const reload = useCallback(async () => {
    if (demoMode) return
    const currentSession = (await supabase.auth.getSession()).data.session
    const activeUserId = currentSession?.user?.id
    if (!activeUserId) return

    const fetchId = ++latestFetchIdRef.current
    const tables = ['profiles','teams','team_members','stages','stage_transitions','subtask_templates','checklist_template_groups','checklist_template_items','tags','channels','message_reads','boards','board_stages','sprints'] as const
    const [metaResults, tasksResult, clientsResult, boardTemplatesResult] = await Promise.all([
      Promise.all(tables.map(name => supabase.from(name).select('*'))),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('clients').select('*').order('name', { ascending: true }).limit(50),
      supabase.from('board_templates').select('*').order('created_at', { ascending: true }),
    ])

    if (fetchId !== latestFetchIdRef.current) return

    const failedMeta = metaResults.find(r => r.error)
    if (failedMeta?.error) throw failedMeta.error
    if (tasksResult.error) throw tasksResult.error
    if (clientsResult.error) throw clientsResult.error

    const [profiles,teams,members,stages,transitions,templates,templateGroups,templateItems,tags,channels,reads,boards,boardStages,sprints] = metaResults.map(r => r.data || [])
    const tasks = (tasksResult.data || []) as Task[]
    const clients = (clientsResult.data || []) as Client[]
    const boardTemplates: BoardTemplate[] =
      (!boardTemplatesResult.error && boardTemplatesResult.data && boardTemplatesResult.data.length > 0)
        ? (boardTemplatesResult.data as BoardTemplate[])
        : DEFAULT_BOARD_TEMPLATES

    if (fetchId !== latestFetchIdRef.current) return

    setHasMoreTasks(tasks.length === 50)
    setHasMoreClients(clients.length === 50)
    setData(prev => {
      const serverTaskIds = new Set(tasks.map(t => t.id))
      // Preserva tarefas locais em resiliência (ex: ramificações criadas localmente que ainda não constam no banco remoto)
      const localOnlyTasks = prev.tasks.filter(t => !serverTaskIds.has(t.id) && Boolean(t.origin_task_id || t.id.startsWith('branch-') || t.id.startsWith('demo-')))
      return {
        profiles: profiles as Profile[],
        teams: teams as Team[],
        members: members as Member[],
        clients: clients as Client[],
        stages: (stages as Stage[]).sort((a,b)=>a.position-b.position),
        transitions: transitions as Transition[],
        templates: templates as Template[],
        templateGroups: (templateGroups as ChecklistTemplateGroup[]).sort((a,b)=>a.position-b.position),
        templateItems: templateItems as ChecklistTemplateItem[],
        tags: tags as Tag[],
        tasks: [...tasks, ...localOnlyTasks],
        channels: channels as Channel[],
        reads: reads as Read[],
        boards: (boards as Board[]).sort((a,b)=>a.position-b.position),
        boardStages: (boardStages as BoardStage[]).sort((a,b)=>a.position-b.position),
        sprints: sprints as Sprint[],
        boardTemplates,
      }
    })
    setProfile((profiles as Profile[]).find(p => p.id === activeUserId) || null)
  }, [demoMode])

  const reloadWithRetry = useCallback(async (maxRetries = 3) => {
    let attempt = 0
    while (true) {
      try {
        await reload()
        setError('')
        return
      } catch (err) {
        attempt++
        if (attempt >= maxRetries) {
          throw err
        }
        const delay = Math.pow(2, attempt - 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }, [reload])

  const loadMoreTasks = useCallback(async () => {
    if (loadingMoreTasks || !hasMoreTasks || demoMode) return
    setLoadingMoreTasks(true)
    try {
      const from = data.tasks.length
      const to = from + 49
      const { data: batch, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false }).range(from, to)
      if (error) throw error
      const items = (batch || []) as Task[]
      setHasMoreTasks(items.length === 50)
      setData(prev => {
        const ids = new Set(prev.tasks.map(t => t.id))
        const newOnes = items.filter(t => !ids.has(t.id))
        return { ...prev, tasks: [...prev.tasks, ...newOnes] }
      })
    } catch (e) {
      setError(messageError(e))
    } finally {
      setLoadingMoreTasks(false)
    }
  }, [data.tasks.length, hasMoreTasks, loadingMoreTasks, demoMode])

  const loadMoreClients = useCallback(async () => {
    if (loadingMoreClients || !hasMoreClients || demoMode) return
    setLoadingMoreClients(true)
    try {
      const from = data.clients.length
      const to = from + 49
      const { data: batch, error } = await supabase.from('clients').select('*').order('name', { ascending: true }).range(from, to)
      if (error) throw error
      const items = (batch || []) as Client[]
      setHasMoreClients(items.length === 50)
      setData(prev => {
        const ids = new Set(prev.clients.map(c => c.id))
        const newOnes = items.filter(c => !ids.has(c.id))
        return { ...prev, clients: [...prev.clients, ...newOnes] }
      })
    } catch (e) {
      setError(messageError(e))
    } finally {
      setLoadingMoreClients(false)
    }
  }, [data.clients.length, hasMoreClients, loadingMoreClients, demoMode])

  const userId = session?.user?.id
  useEffect(() => {
    if (demoMode) return
    if (!userId) { setProfile(null); setData(empty); setLoading(false); return }
    setLoading(true)
    reloadWithRetry().catch(e => setError(messageError(e))).finally(() => setLoading(false))
  }, [userId, reloadWithRetry, demoMode])

  useEffect(() => {
    if (loading || !data.stages.length) return

    if (activeBoardId !== 'board-geral' && activeBoardId !== 'meus-quadros') {
      const board = data.boards.find(b => b.id === activeBoardId)
      if (!board) {
        setActiveBoardId('board-geral')
      } else if (!board.is_shared && board.type !== 'general' && !demoMode) {
        const isMember = board.team_id && data.members.some(m => m.team_id === board.team_id && m.user_id === userId && m.active)
        const isAdmin = profile?.role === 'administrador' || profile?.is_master
        if (!isMember && !isAdmin) {
          setActiveBoardId('board-geral')
        }
      }
    }

    const adminOnlyPages: Page[] = ['teams', 'users']
    if (adminOnlyPages.includes(page) && !demoMode && profile) {
      const isAdmin = profile.role === 'administrador' || profile.is_master
      const isTeamManager = data.members.some(m => m.user_id === profile.id && m.is_manager && m.active)
      if (!isAdmin && !isTeamManager) {
        setPage('dashboard')
      }
    }
  }, [activeBoardId, page, data.boards, data.members, data.stages.length, profile, userId, demoMode, loading])

  useEffect(() => {
    if (activeBoardId) {
      try {
        localStorage.setItem('opshub_active_board', activeBoardId)
        localStorage.setItem('somax_active_board', activeBoardId)
      } catch {}
    }
  }, [activeBoardId])
  useEffect(() => {
    if (!session || demoMode) return
    const sub=supabase.channel('task-updates')
      .on('postgres_changes',{event:'*',schema:'public',table:'tasks'},payload=>{
        setData(current=>{
          const id=(payload.eventType==='DELETE' ? payload.old : payload.new).id as string
          if(payload.eventType==='DELETE') return {...current,tasks:current.tasks.filter(task=>task.id!==id)}
          const changed=payload.new as Task
          const exists=current.tasks.some(task=>task.id===changed.id)
          return {...current,tasks:exists?current.tasks.map(task=>task.id===changed.id?changed:task):[changed,...current.tasks]}
        })
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},payload=>{
        setData(current=>{
          const id=(payload.eventType==='DELETE' ? payload.old : payload.new).id as string
          if(payload.eventType==='DELETE') return {...current,clients:current.clients.filter(client=>client.id!==id)}
          const changed=payload.new as Client
          const exists=current.clients.some(client=>client.id===changed.id)
          return {...current,clients:exists?current.clients.map(client=>client.id===changed.id?changed:client):[...current.clients,changed].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))}
        })
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'tags'},payload=>{
        setData(current=>{
          const id=(payload.eventType==='DELETE' ? payload.old : payload.new).id as string
          if(payload.eventType==='DELETE') return {...current,tags:current.tags.filter(tag=>tag.id!==id)}
          const changed=payload.new as Tag
          const exists=current.tags.some(tag=>tag.id===changed.id)
          return {...current,tags:exists?current.tags.map(tag=>tag.id===changed.id?changed:tag):[changed,...current.tags]}
        })
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'boards'},()=>void reload())
      .on('postgres_changes',{event:'*',schema:'public',table:'board_stages'},()=>void reload())
      .on('postgres_changes',{event:'*',schema:'public',table:'sprints'},()=>void reload())
      .subscribe()
    return ()=>{void supabase.removeChannel(sub)}
  },[session,reload,demoMode])

  const flash = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 4500) }
  const openNewTask = () => setNewTask(true)
  const run = async (action: () => Promise<unknown>, success='Salvo com sucesso') => {
    if (demoMode) { flash('Prévia local: alterações administrativas exigem Supabase.'); return false }
    try {
      await action()
      try {
        await reload()
      } catch (reloadErr) {
        console.warn('Aviso: falha ao recarregar dados do servidor após ação:', reloadErr)
      }
      flash(success)
      return true
    } catch(e) {
      setError(messageError(e))
      return false
    }
  }
  const allStages: (Stage & { board_id?: string })[] = useMemo(() => {
    return [
      ...data.stages,
      ...data.boardStages.map(bs => ({
        id: bs.id,
        name: bs.name,
        position: bs.position,
        color: bs.color,
        is_final: bs.is_final,
        is_pause: false,
        wip_limit: bs.wip_limit ?? null,
        board_id: bs.board_id,
      })),
    ]
  }, [data.stages, data.boardStages])

  const stage = (id: string) => allStages.find(s => s.id === id)
  const team = (id: string) => data.teams.find(t => t.id === id)
  const person = (id?: string | null) => data.profiles.find(p => p.id === id)
  const client = (id?: string | null) => data.clients.find(c => c.id === id)
  const canManageTeam = (id: string) => !demoMode && (profile?.role === 'administrador' || data.members.some(m => m.team_id === id && m.user_id === profile?.id && m.active && m.is_manager))
  const canAdmin = !demoMode && profile?.role === 'administrador'
  const canMaster = demoMode || Boolean(profile?.is_master)
  const canCreateBoard = Boolean(canAdmin || (demoMode && (!profile || profile.role === 'administrador')) || data.members.some(m => m.user_id === profile?.id && m.active && m.is_manager))

  const canonicalGeneralBoard: Board = useMemo(() => ({
    id: 'board-geral',
    name: 'Geral',
    description: 'Quadro canônico geral com todas as etapas.',
    type: 'general',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: data.stages.map(s => s.id),
    position: 0,
    created_by: 'system',
    created_at: '',
    updated_at: '',
  }), [data.stages])

  const availableBoards = useMemo(() => {
    const effectiveProfile = profile || (demoMode ? (data.profiles.find(p => p.id === session?.user?.id) || data.profiles[0]) : null)
    const permitted = getPermittedDestinationBoards(data.boards, data.members, effectiveProfile)
    const list = permitted.filter(b => b.id !== 'board-geral')
    return [canonicalGeneralBoard, ...list]
  }, [canonicalGeneralBoard, data.boards, data.members, profile, demoMode, data.profiles, session?.user?.id])

  const userCustomBoards = useMemo(() => {
    return availableBoards.filter(b => b.id !== 'board-geral')
  }, [availableBoards])

  const generalBoards = useMemo(() => {
    return availableBoards.filter(b => b.id !== 'board-geral')
  }, [availableBoards])

  const defaultTabIds = useMemo(() => {
    return ['board-geral', 'meus-quadros', ...userCustomBoards.map(b => b.id)]
  }, [userCustomBoards])

  useEffect(() => {
    if (profile?.id) {
      setGeneralMode(getUserGeneralMode(profile.id))
      setBoardTabsOrder(getUserBoardTabsOrder(profile.id, defaultTabIds))
      const prefs = getUserPreferences(profile.id)
      if (prefs.defaultTaskView) {
        setTaskView(current => (current === 'kanban' || current === 'lista' ? prefs.defaultTaskView : current))
      }
    }
  }, [profile?.id, defaultTabIds])

  useEffect(() => {
    const ids = generalBoards.map(b => b.id)
    setGeneralBlockOrder(getUserLateralBlockOrder(profile?.id, ids))
    setGeneralExpandedAccordions(getUserConsolidatedExpanded(profile?.id, ids))
    setGeneralHideEmptyColumnsLateral(getUserHideEmptyColumns(profile?.id, 'lateral'))
    setGeneralHideEmptyColumnsConsolidado(getUserHideEmptyColumns(profile?.id, 'consolidado'))
  }, [profile?.id, generalBoards])

  function handleGeneralModeChange(newMode: GeneralViewMode) {
    setGeneralMode(newMode)
    setUserGeneralMode(profile?.id, newMode)
  }

  function handleToggleHideEmptyColumns(hide: boolean) {
    if (generalMode === 'lateral') {
      setGeneralHideEmptyColumnsLateral(hide)
      setUserHideEmptyColumns(profile?.id, 'lateral', hide)
    } else {
      setGeneralHideEmptyColumnsConsolidado(hide)
      setUserHideEmptyColumns(profile?.id, 'consolidado', hide)
    }
  }

  function handleExpandAllAccordions() {
    const next: Record<string, boolean> = {}
    generalBoards.forEach(b => {
      next[b.id] = true
    })
    setGeneralExpandedAccordions(next)
    setUserConsolidatedExpanded(profile?.id, next)
  }

  function handleCollapseAllAccordions() {
    const next: Record<string, boolean> = {}
    generalBoards.forEach(b => {
      next[b.id] = false
    })
    setGeneralExpandedAccordions(next)
    setUserConsolidatedExpanded(profile?.id, next)
  }

  function handleGeneralBlockOrderChange(newOrder: string[]) {
    setGeneralBlockOrder(newOrder)
    setUserLateralBlockOrder(profile?.id, newOrder)
  }

  function handleAccordionToggle(boardId: string) {
    setGeneralExpandedAccordions(prev => {
      const next = { ...prev, [boardId]: !prev[boardId] }
      setUserConsolidatedExpanded(profile?.id, next)
      return next
    })
  }

  function moveTabPosition(tabId: string, direction: 'left' | 'right') {
    setBoardTabsOrder(prev => {
      const current = prev.filter(id => defaultTabIds.includes(id))
      const idx = current.indexOf(tabId)
      if (idx === -1) return prev
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= current.length) return prev
      const next = [...current]
      const [removed] = next.splice(idx, 1)
      next.splice(targetIdx, 0, removed)
      setUserBoardTabsOrder(profile?.id, next)
      return next
    })
  }

  function handleTabDragStart(e: React.DragEvent, tabId: string) {
    e.dataTransfer.setData('text/board-tab-id', tabId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleTabDragOver(e: React.DragEvent, targetTabId: string) {
    if (!e.dataTransfer.types.includes('text/board-tab-id')) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? 'left' : 'right'
    setDragOverTabInfo({ id: targetTabId, side })
  }

  function handleTabDrop(e: React.DragEvent, targetTabId: string) {
    if (!e.dataTransfer.types.includes('text/board-tab-id')) return
    e.preventDefault()
    const sourceTabId = e.dataTransfer.getData('text/board-tab-id')
    const side = dragOverTabInfo?.side || 'right'
    setDragOverTabInfo(null)
    if (!sourceTabId || sourceTabId === targetTabId) return

    setBoardTabsOrder(prev => {
      const current = prev.filter(id => defaultTabIds.includes(id))
      const fromIdx = current.indexOf(sourceTabId)
      let toIdx = current.indexOf(targetTabId)
      if (fromIdx === -1 || toIdx === -1) return prev
      if (side === 'right' && toIdx < fromIdx) toIdx += 1
      if (side === 'left' && toIdx > fromIdx) toIdx -= 1
      const next = [...current]
      const [removed] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, removed)
      setUserBoardTabsOrder(profile?.id, next)
      return next
    })
  }

  const activeBoard = useMemo(() => {
    if (activeBoardId === 'meus-quadros') return canonicalGeneralBoard
    return availableBoards.find(b => b.id === activeBoardId) || canonicalGeneralBoard
  }, [availableBoards, activeBoardId, canonicalGeneralBoard])

  const isCustomBoard = activeBoard.type === 'custom'
  const canFreeMove = Boolean(isCustomBoard || canAdmin || (demoMode && (!profile || profile.role === 'administrador')))
  const canManageActiveBoard = Boolean(
    canAdmin ||
    (demoMode && (!profile || profile.role === 'administrador')) ||
    activeBoard.created_by === profile?.id ||
    (activeBoard.team_id && data.members.some(m => m.team_id === activeBoard.team_id && m.user_id === profile?.id && m.is_manager && m.active))
  )

  type DisplayStage = Stage & { wip_limit?: number | null }

  const currentBoardStages: DisplayStage[] = useMemo(() => {
    return getStagesForBoard(activeBoard, data.stages, data.boardStages)
  }, [activeBoard, data.stages, data.boardStages])

  const boardSprints = useMemo(() => {
    return data.sprints.filter(s => s.board_id === activeBoard.id)
  }, [data.sprints, activeBoard.id])

  const activeSprint = useMemo(() => {
    return boardSprints.find(s => s.status === 'active') || null
  }, [boardSprints])

  const now = todayISO()
  const dashboard = useMemo(() => taskBuckets(data.tasks, data.stages, profile?.id, data.boardStages), [data, profile])
  const filteredTasks = useMemo(() => data.tasks.filter(t => {
    if (activeBoard.type === 'general') {
      if (t.board_id && t.board_id !== 'board-geral') {
        const isSectorBoard = data.boards.some(b => b.id === t.board_id && b.type === 'sector_view')
        if (!isSectorBoard) return false
      }
    } else if (activeBoard.type === 'sector_view') {
      const isBelonging = !t.board_id || t.board_id === 'board-geral' || t.board_id === activeBoard.id
      if (!isBelonging) return false
      if (!activeBoard.stage_ids.includes(t.stage_id)) return false
    } else if (activeBoard.type === 'custom') {
      if (t.board_id !== activeBoard.id) return false
      if (activeBoard.methodology === 'scrum' && taskView === 'sprint') {
        if (!activeSprint || t.sprint_id !== activeSprint.id) return false
      }
    }

    if (dashboardFilter && !dashboard[dashboardFilter].some(x => x.id === t.id)) return false
    return (!query || `${t.title} ${t.description} ${t.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
      && (!teamFilter || t.team_id === teamFilter) && (!assigneeFilter || t.assignee_id === assigneeFilter)
      && (!clientFilter || t.client_id === clientFilter) && (!stageFilter || t.stage_id === stageFilter)
      && (!priorityFilter || t.priority === priorityFilter)
      && (!dueFilter || (dueFilter === 'atrasadas' ? Boolean(t.due_at && t.due_at < now && !completed(t, allStages)) : dueFilter === 'sem_prazo' ? !t.due_at : Boolean(t.due_at && t.due_at >= now)))
  }), [data, activeBoard, taskView, activeSprint, dashboardFilter, dashboard, query, teamFilter, assigneeFilter, clientFilter, stageFilter, priorityFilter, dueFilter, now, allStages])

  const globallyFilteredTasks = useMemo(() => data.tasks.filter(t => {
    if (dashboardFilter && !dashboard[dashboardFilter].some(x => x.id === t.id)) return false
    return (!query || `${t.title} ${t.description} ${t.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
      && (!teamFilter || t.team_id === teamFilter)
      && (!assigneeFilter || t.assignee_id === assigneeFilter)
      && (!clientFilter || t.client_id === clientFilter)
      && (!priorityFilter || t.priority === priorityFilter)
      && (!dueFilter || (dueFilter === 'atrasadas' ? Boolean(t.due_at && t.due_at < now && !completed(t, allStages)) : dueFilter === 'sem_prazo' ? !t.due_at : Boolean(t.due_at && t.due_at >= now)))
  }), [data.tasks, allStages, dashboardFilter, dashboard, query, teamFilter, assigneeFilter, clientFilter, priorityFilter, dueFilter, now])

  const openMetric = (filter: Exclude<DashboardFilter,null>) => { setDashboardFilter(filter); setTaskTab('tarefas'); setPage('tasks'); setTaskView('lista') }

  const handleConfirmForward = async (
    targetBoardId: string | null,
    targetStageId: string,
    targetTeamId?: string | null
  ) => {
    const tasksToForward = forwardingTasks || (forwardingTask ? [forwardingTask] : [])
    if (tasksToForward.length === 0) return

    if (demoMode) {
      const now = new Date().toISOString()
      const newBranches: Task[] = []
      const updatedOriginals: Task[] = []

      for (const t of tasksToForward) {
        const rootId = t.root_task_id || t.id
        const newBranchId = crypto.randomUUID()
        const branch: Task = {
          id: newBranchId,
          title: t.title,
          description: t.description,
          team_id: targetTeamId || t.team_id,
          assignee_id: null,
          client_id: t.client_id,
          stage_id: targetStageId,
          priority: t.priority,
          due_at: null,
          tags: [...t.tags],
          completed_at: null,
          created_by: session?.user?.id || 'demo-user',
          created_at: now,
          updated_at: now,
          board_id: targetBoardId,
          sprint_id: null,
          origin_task_id: t.id,
          root_task_id: rootId
        }
        newBranches.push(branch)
        const origChecklists = demoChecklists[t.id] || []
        if (origChecklists.length > 0) {
          const clonedChecklists = origChecklists.map((c, i) => ({
            ...c,
            id: crypto.randomUUID(),
            task_id: newBranchId,
            done: c.done,
            position: i + 1,
            group_name: c.group_name
          }))
          setDemoChecklists(prev => ({ ...prev, [newBranchId]: clonedChecklists }))
        }
        updatedOriginals.push({
          ...t,
          forwarded_at: now,
          forwarded_by: session?.user?.id || 'demo-user',
          completed_at: t.completed_at || now,
          root_task_id: rootId,
          updated_at: now
        })
      }

      setData(prev => {
        const filtered = prev.tasks.map(item => {
          const match = updatedOriginals.find(o => o.id === item.id)
          return match || item
        })
        return {
          ...prev,
          tasks: [...filtered, ...newBranches]
        }
      })

      flash(tasksToForward.length > 1
        ? `${tasksToForward.length} tarefas encaminhadas com sucesso (prévia local)`
        : 'Tarefa concluída e encaminhada com sucesso (prévia local)'
      )
      setForwardingTask(null)
      setForwardingTasks(null)
      return
    }

    // Modo Supabase com resiliência
    const normTargetBoardId = (!targetBoardId || targetBoardId === 'board-geral') ? null : targetBoardId

    try {
      for (const t of tasksToForward) {
        const { error } = await supabase.rpc('forward_completed_task', {
          p_task_id: t.id,
          p_target_board_id: normTargetBoardId,
          p_target_stage_id: targetStageId,
          p_target_team_id: targetTeamId || null
        })
        if (error) {
          console.error('Erro na RPC forward_completed_task:', error)
          throw error
        }
      }

      await reload()
      flash(tasksToForward.length > 1
        ? `${tasksToForward.length} tarefas encaminhadas com sucesso!`
        : 'Tarefa concluída e encaminhada com sucesso!'
      )
    } catch (err: any) {
      console.error('Falha ao encaminhar tarefa:', err)
      if (isNetworkError(err)) {
        // Fallback gracioso de rede: aplica localmente a ramificação apenas em falha de conexão real
        const now = new Date().toISOString()
        const newBranches: Task[] = []
        const updatedOriginals: Task[] = []

        for (const t of tasksToForward) {
          const rootId = t.root_task_id || t.id
          const newBranchId = crypto.randomUUID()
          const branch: Task = {
            id: newBranchId,
            title: t.title,
            description: t.description,
            team_id: targetTeamId || t.team_id,
            assignee_id: null,
            client_id: t.client_id,
            stage_id: targetStageId,
            priority: t.priority,
            due_at: null,
            tags: [...t.tags],
            completed_at: null,
            created_by: session?.user?.id || 'demo-user',
            created_at: now,
            updated_at: now,
            board_id: normTargetBoardId,
            sprint_id: null,
            origin_task_id: t.id,
            root_task_id: rootId
          }
          newBranches.push(branch)
          const origChecklists = demoChecklists[t.id] || []
          if (origChecklists.length > 0) {
            const clonedChecklists = origChecklists.map((c, i) => ({
              ...c,
              id: crypto.randomUUID(),
              task_id: newBranchId,
              done: c.done,
              position: i + 1,
              group_name: c.group_name
            }))
            setDemoChecklists(prev => ({ ...prev, [newBranchId]: clonedChecklists }))
          }
          updatedOriginals.push({
            ...t,
            forwarded_at: now,
            forwarded_by: session?.user?.id || 'demo-user',
            completed_at: t.completed_at || now,
            root_task_id: rootId,
            updated_at: now
          })
        }

        setData(prev => {
          const filtered = prev.tasks.map(item => {
            const match = updatedOriginals.find(o => o.id === item.id)
            return match || item
          })
          return {
            ...prev,
            tasks: [...filtered, ...newBranches]
          }
        })

        flash(tasksToForward.length > 1
          ? `${tasksToForward.length} tarefas encaminhadas localmente (conexão indisponível)`
          : 'Tarefa concluída e encaminhada localmente (conexão indisponível)'
        )
      } else {
        setError(messageError(err) || 'Erro ao encaminhar tarefa no banco de dados. Verifique a etapa e permissões do quadro.')
      }
    } finally {
      setForwardingTask(null)
      setForwardingTasks(null)
    }
  }

  const moveTask = async (task: Task, target: string) => {
    if (task.stage_id === target) return

    // Bloqueio rigoroso: tarefas que já foram encaminhadas ficam travadas na etapa final
    if (task.forwarded_at) {
      flash('Esta tarefa já foi concluída e encaminhada para outro quadro e não pode ser movida.')
      return
    }

    const targetCustomStage = data.boardStages.find(s => s.id === target)
    const targetCanonStage = data.stages.find(s => s.id === target)
    const isCustom = Boolean(targetCustomStage)
    const isFinal = Boolean(targetCustomStage?.is_final || targetCanonStage?.is_final)
    const completedAt = isFinal ? new Date().toISOString() : null

    const taskBoard = task.board_id ? data.boards.find(b => b.id === task.board_id) : canonicalGeneralBoard
    const onCompletionAction = taskBoard?.on_completion_action || 'ask'

    if (demoMode) {
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === task.id ? {
          ...t,
          stage_id: target,
          completed_at: completedAt,
          updated_at: new Date().toISOString()
        } : t)
      }))

      if (!isCustom) {
        const stageTemplates = data.templates.filter(t => t.stage_id === target)
        if (stageTemplates.length > 0) {
          setDemoChecklists(prev => {
            const currentList = prev[task.id] || []
            const toAdd = stageTemplates.filter(st => !currentList.some(item => item.title === st.title))
            if (toAdd.length === 0) return prev
            return {
              ...prev,
              [task.id]: [
                ...currentList,
                ...toAdd.map((st, i) => ({
                  id: crypto.randomUUID(),
                  task_id: task.id,
                  title: st.title,
                  done: false,
                  position: currentList.length + i + 1,
                  group_name: targetCanonStage?.name || null,
                })),
              ],
            }
          })
        }
      }
      flash('Tarefa movida na prévia local')

      // Se moveu para a etapa final, intercepta para encaminhamento conforme configuração do quadro
      if (isFinal && onCompletionAction !== 'none') {
        setForwardingTask({
          ...task,
          stage_id: target,
          completed_at: completedAt
        })
      }
      return
    }

    if (!task?.id) {
      setError('Identificador da tarefa não informado para movimentação.')
      return
    }

    try {
      const { data: changed, error } = await supabase
        .from('tasks')
        .update({ stage_id: target, completed_at: completedAt })
        .eq('id', task.id)
        .select('*')
        .single()

      if (error) { throw error }
      setData(prev => ({ ...prev, tasks: prev.tasks.map(item => item.id === task.id ? (changed as Task) : item) }))
      flash('Tarefa movida')
    } catch {
      // Resiliência de rede: atualiza localmente para não travar o Kanban se a rede oscilar
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.map(item => item.id === task.id ? {
          ...item,
          stage_id: target,
          completed_at: completedAt,
          updated_at: new Date().toISOString()
        } : item)
      }))
      flash('Tarefa movida localmente (conexão instável)')
    }

    // Se moveu para a etapa final, intercepta para encaminhamento conforme configuração do quadro
    if (isFinal && onCompletionAction !== 'none') {
      setForwardingTask({
        ...task,
        stage_id: target,
        completed_at: completedAt
      })
    }
  }

  const handleCreateBoard = async (board: Board, stagesToCreate: Partial<BoardStage>[]) => {
    if (demoMode) {
      const createdStages: BoardStage[] = stagesToCreate.map((stg, i) => ({
        id: crypto.randomUUID(),
        board_id: board.id,
        name: stg.name || `Etapa ${i + 1}`,
        color: stg.color || '#3b82f6',
        position: i,
        wip_limit: stg.wip_limit ?? null,
        is_final: stg.is_final ?? false,
        created_at: new Date().toISOString(),
      }))

      setData(prev => ({
        ...prev,
        boards: [...prev.boards, board],
        boardStages: [...prev.boardStages, ...createdStages],
      }))
      setActiveBoardId(board.id)
      flash('Quadro criado na prévia local!')
      return
    }

    try {
      const { data: createdBoardId, error } = await supabase.rpc('create_custom_board', {
        p_name: board.name,
        p_description: board.description,
        p_type: board.type,
        p_methodology: board.methodology,
        p_team_id: board.team_id,
        p_is_shared: board.is_shared,
        p_stage_ids: board.stage_ids || [],
        p_stages: stagesToCreate,
      })
      if (error) throw error
      await reload()
      if (createdBoardId) setActiveBoardId(createdBoardId as string)
      flash(board.type === 'sector_view' ? 'Visão por setor criada com sucesso!' : 'Quadro personalizado criado com sucesso!')
    } catch {
      // Fallback gracioso: adiciona localmente ao estado se a chamada ao Supabase falhar
      const createdStages: BoardStage[] = stagesToCreate.map((stg, i) => ({
        id: crypto.randomUUID(),
        board_id: board.id,
        name: stg.name || `Etapa ${i + 1}`,
        color: stg.color || '#3b82f6',
        position: i,
        wip_limit: stg.wip_limit ?? null,
        is_final: stg.is_final ?? false,
        created_at: new Date().toISOString(),
      }))
      setData(prev => ({
        ...prev,
        boards: [...prev.boards, board],
        boardStages: [...prev.boardStages, ...createdStages],
      }))
      setActiveBoardId(board.id)
      flash('Quadro criado localmente (conexão indisponível).')
    }
  }

  const handleUpdateBoard = async (board: Board, stagesToUpdate: Partial<BoardStage>[]) => {
    if (demoMode) {
      setData(prev => {
        const updatedBoards = prev.boards.map(b => b.id === board.id ? board : b)
        let updatedStages = prev.boardStages
        let updatedTasks = prev.tasks

        if (board.type === 'custom') {
          const existingForBoard = prev.boardStages.filter(s => s.board_id === board.id)
          const newStages: BoardStage[] = stagesToUpdate.map((stg, i) => {
            const found = existingForBoard.find(x => x.id === stg.id)
            return {
              id: stg.id || crypto.randomUUID(),
              board_id: board.id,
              name: stg.name || `Etapa ${i + 1}`,
              color: stg.color || '#3b82f6',
              position: i,
              wip_limit: stg.wip_limit ?? null,
              is_final: stg.is_final ?? false,
              created_at: found?.created_at || new Date().toISOString(),
            }
          })
          const keptStageIds = new Set(newStages.map(s => s.id))
          const firstStageId = newStages[0]?.id

          if (firstStageId) {
            updatedTasks = prev.tasks.map(t => {
              if (t.board_id === board.id && !keptStageIds.has(t.stage_id)) {
                return { ...t, stage_id: firstStageId }
              }
              return t
            })
          }

          updatedStages = [
            ...prev.boardStages.filter(s => s.board_id !== board.id),
            ...newStages,
          ]
        }

        return {
          ...prev,
          boards: updatedBoards,
          boardStages: updatedStages,
          tasks: updatedTasks,
        }
      })
      flash('Quadro e etapas atualizados na prévia local!')
      return
    }

    try {
      const { error } = await supabase.rpc('update_custom_board', {
        p_board_id: board.id,
        p_name: board.name,
        p_description: board.description,
        p_methodology: board.methodology,
        p_team_id: board.team_id,
        p_is_shared: board.is_shared,
        p_stage_ids: board.stage_ids || [],
        p_stages: stagesToUpdate,
      })
      if (error) throw error
      await reload()
      flash('Quadro e etapas atualizados com sucesso!')
    } catch {
      // Fallback gracioso local em caso de falha de conexão
      setData(prev => {
        const updatedBoards = prev.boards.map(b => b.id === board.id ? board : b)
        let updatedStages = prev.boardStages
        let updatedTasks = prev.tasks

        if (board.type === 'custom') {
          const existingForBoard = prev.boardStages.filter(s => s.board_id === board.id)
          const newStages: BoardStage[] = stagesToUpdate.map((stg, i) => {
            const found = existingForBoard.find(x => x.id === stg.id)
            return {
              id: stg.id || crypto.randomUUID(),
              board_id: board.id,
              name: stg.name || `Etapa ${i + 1}`,
              color: stg.color || '#3b82f6',
              position: i,
              wip_limit: stg.wip_limit ?? null,
              is_final: stg.is_final ?? false,
              created_at: found?.created_at || new Date().toISOString(),
            }
          })
          const keptStageIds = new Set(newStages.map(s => s.id))
          const firstStageId = newStages[0]?.id

          if (firstStageId) {
            updatedTasks = prev.tasks.map(t => {
              if (t.board_id === board.id && !keptStageIds.has(t.stage_id)) {
                return { ...t, stage_id: firstStageId }
              }
              return t
            })
          }

          updatedStages = [
            ...prev.boardStages.filter(s => s.board_id !== board.id),
            ...newStages,
          ]
        }

        return {
          ...prev,
          boards: updatedBoards,
          boardStages: updatedStages,
          tasks: updatedTasks,
        }
      })
      flash('Quadro e etapas atualizados localmente (conexão indisponível).')
    }
  }

  const handleDeleteBoard = async (board: Board) => {
    if (!window.confirm(`Tem certeza de que deseja excluir o quadro "${board.name}"? Tarefas associadas permanecerão no sistema.`)) return

    if (demoMode) {
      setData(prev => ({
        ...prev,
        boards: prev.boards.filter(b => b.id !== board.id),
        boardStages: prev.boardStages.filter(s => s.board_id !== board.id),
        sprints: prev.sprints.filter(s => s.board_id !== board.id),
        tasks: prev.tasks.map(t => t.board_id === board.id ? { ...t, board_id: null, sprint_id: null } : t),
      }))
      if (activeBoardId === board.id) setActiveBoardId('board-geral')
      flash('Quadro excluído na prévia local')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.from('boards').delete().eq('id', board.id)
      if (error) throw error
    }, 'Quadro excluído com sucesso')

    if (!ok) {
      // Fallback local caso o servidor esteja indisponível
      setData(prev => ({
        ...prev,
        boards: prev.boards.filter(b => b.id !== board.id),
        boardStages: prev.boardStages.filter(s => s.board_id !== board.id),
        sprints: prev.sprints.filter(s => s.board_id !== board.id),
        tasks: prev.tasks.map(t => t.board_id === board.id ? { ...t, board_id: null, sprint_id: null } : t),
      }))
      if (activeBoardId === board.id) setActiveBoardId('board-geral')
      flash('Quadro excluído localmente (servidor indisponível).')
      return
    }

    if (ok && activeBoardId === board.id) {
      setActiveBoardId('board-geral')
    }
  }

  const handleSaveSprint = async (sprint: Sprint, _taskIds: string[]) => {
    if (demoMode) {
      setData(prev => ({ ...prev, sprints: [...prev.sprints, sprint] }))
      flash('Sprint cadastrada na prévia local')
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('sprints').insert(sprint)
      if (error) throw error
    }, 'Sprint cadastrada com sucesso')
    if (ok) await reload()
  }

  const handleCreateSprint = async (sprintData: Partial<Sprint>) => {
    const newSprint: Sprint = {
      id: crypto.randomUUID(),
      board_id: activeBoard.id,
      name: sprintData.name || 'Nova Sprint',
      goal: sprintData.goal || null,
      start_date: sprintData.start_date || null,
      end_date: sprintData.end_date || null,
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (demoMode) {
      setData(prev => ({ ...prev, sprints: [...prev.sprints, newSprint] }))
      flash('Sprint criada com sucesso na prévia local')
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('sprints').insert([{
        board_id: activeBoard.id,
        name: newSprint.name,
        goal: newSprint.goal,
        start_date: newSprint.start_date,
        end_date: newSprint.end_date,
        status: 'planning'
      }])
      if (error) throw error
    }, 'Sprint criada com sucesso')
    if (ok) await reload()
  }

  const handleStartSprint = async (sprintId: string) => {
    const sprintTasks = data.tasks.filter(t => t.sprint_id === sprintId)
    if (sprintTasks.length === 0) {
      flash('A sprint deve conter ao menos uma tarefa para ser iniciada.')
      return
    }
    const existingActive = data.sprints.find(s => s.board_id === activeBoard.id && s.status === 'active')
    if (existingActive) {
      flash('Já existe uma sprint ativa neste quadro. Encerre-a antes de iniciar uma nova.')
      return
    }

    if (demoMode) {
      setData(prev => ({
        ...prev,
        sprints: prev.sprints.map(s => s.id === sprintId ? { ...s, status: 'active', updated_at: new Date().toISOString() } : s)
      }))
      setTaskView('sprint')
      flash('Sprint iniciada com sucesso!')
      return
    }

    if (!sprintId) {
      setError('Identificador da sprint não informado.')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.rpc('start_sprint', { p_sprint_id: sprintId })
      if (error) {
        if (!sprintId) throw new Error('Identificador da sprint não informado.')
        const { error: updErr } = await supabase.from('sprints').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', sprintId)
        if (updErr) throw updErr
      }
    }, 'Sprint iniciada com sucesso')
    if (ok) {
      setTaskView('sprint')
      await reload()
    }
  }

  const handleCompleteSprint = async (sprintId: string, actionForPending: 'backlog' | 'next_sprint' = 'backlog', nextSprintName?: string) => {
    if (!sprintId) {
      setError('Identificador da sprint não informado.')
      return
    }
    const finalStageIds = new Set(currentBoardStages.filter(s => s.is_final).map(s => s.id))
    const pendingTasks = data.tasks.filter(t => t.sprint_id === sprintId && !finalStageIds.has(t.stage_id))

    if (demoMode) {
      let targetNextSprintId: string | null = null
      let newSprints = [...data.sprints]

      if (actionForPending === 'next_sprint' && pendingTasks.length > 0) {
        const existingPlanning = newSprints.find(s => s.board_id === activeBoard.id && s.status === 'planning')
        if (existingPlanning) {
          targetNextSprintId = existingPlanning.id
        } else {
          const generatedSprint: Sprint = {
            id: crypto.randomUUID(),
            board_id: activeBoard.id,
            name: nextSprintName || 'Sprint Seguinte',
            goal: 'Tarefas pendentes da sprint anterior',
            start_date: null,
            end_date: null,
            status: 'planning',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          newSprints.push(generatedSprint)
          targetNextSprintId = generatedSprint.id
        }
      }

      setData(prev => ({
        ...prev,
        sprints: newSprints.map(s => s.id === sprintId ? { ...s, status: 'completed', updated_at: new Date().toISOString() } : s),
        tasks: prev.tasks.map(t => {
          if (t.sprint_id === sprintId && !finalStageIds.has(t.stage_id)) {
            return { ...t, sprint_id: targetNextSprintId }
          }
          return t
        })
      }))
      flash('Sprint encerrada com sucesso!')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.rpc('complete_sprint', {
        p_sprint_id: sprintId,
        p_action_for_pending: actionForPending,
        p_next_sprint_name: nextSprintName || null
      })
      if (error) {
        if (!sprintId) throw new Error('Identificador da sprint não informado.')
        if (actionForPending === 'backlog') {
          await supabase.from('tasks').update({ sprint_id: null }).eq('sprint_id', sprintId)
        }
        await supabase.from('sprints').update({ status: 'completed' }).eq('id', sprintId)
      }
    }, 'Sprint encerrada com sucesso')
    if (ok) await reload()
  }

  const handleMoveTaskToSprint = async (taskId: string, sprintId: string | null) => {
    if (!taskId) {
      setError('Identificador da tarefa não informado.')
      return
    }
    if (demoMode) {
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, sprint_id: sprintId } : t)
      }))
      flash(sprintId ? 'Tarefa alocada na sprint' : 'Tarefa retornada ao backlog')
      return
    }
    try {
      const { error } = await supabase.from('tasks').update({ sprint_id: sprintId }).eq('id', taskId)
      if (error) { throw error }
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, sprint_id: sprintId } : t)
      }))
      flash(sprintId ? 'Tarefa alocada na sprint' : 'Tarefa retornada ao backlog')
    } catch {
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => t.id === taskId ? { ...t, sprint_id: sprintId } : t)
      }))
      flash(sprintId ? 'Tarefa alocada na sprint localmente' : 'Tarefa retornada ao backlog localmente')
    }
  }

  const handleQuickCreateBacklogTask = async (title: string, storyPoints: number) => {
    const firstStage = currentBoardStages[0] || data.stages[0]
    const currentBacklogCount = data.tasks.filter(t => t.board_id === activeBoard.id && !t.sprint_id).length
    const task: Task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: '',
      team_id: activeBoard.team_id || data.teams[0]?.id || '',
      assignee_id: null,
      client_id: null,
      stage_id: firstStage?.id || '',
      priority: 'media',
      due_at: null,
      tags: [],
      completed_at: null,
      created_by: session?.user?.id || profile?.id || 'demo-admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      board_id: activeBoard.id,
      sprint_id: null,
      story_points: storyPoints || 0,
      backlog_order: currentBacklogCount + 1,
    }

    if (demoMode) {
      setData(prev => ({ ...prev, tasks: [task, ...prev.tasks] }))
      flash('Tarefa adicionada ao backlog!')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.from('tasks').insert([{
        title: task.title,
        description: task.description,
        team_id: task.team_id,
        stage_id: task.stage_id,
        priority: task.priority,
        created_by: task.created_by,
        board_id: task.board_id,
        sprint_id: null,
        story_points: task.story_points,
        backlog_order: task.backlog_order,
      }])
      if (error) throw error
    }, 'Tarefa adicionada ao backlog')
    if (ok) await reload()
  }

  const deleteTask = async (task: Task) => {
    if (!window.confirm(`Tem certeza de que deseja excluir a tarefa "${task.title}" permanentemente? Esta ação não pode ser desfeita.`)) return
    if (demoMode) {
      setData(prev => ({
        ...prev,
        tasks: prev.tasks.filter(t => t.id !== task.id)
      }))
      setDemoChecklists(prev => {
        const copy = { ...prev }
        delete copy[task.id]
        return copy
      })
      if (selectedTask?.id === task.id) setSelectedTask(null)
      flash('Tarefa excluída da prévia local')
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) throw error
    }, 'Tarefa excluída com sucesso')
    if (ok && selectedTask?.id === task.id) {
      setSelectedTask(null)
    }
  }
  const deleteTemplate = async (group: ChecklistTemplateGroup) => {
    if (!window.confirm(`Excluir o template "${group.name}"? As subtarefas já copiadas para tarefas serão mantidas.`)) return
    if (demoMode) { setData(prev=>({...prev,templateGroups:prev.templateGroups.filter(item=>item.id!==group.id),templateItems:prev.templateItems.filter(item=>item.group_id!==group.id)}));flash('Template removido da prévia local');return }
    await run(async()=>{const {error}=await supabase.from('checklist_template_groups').delete().eq('id',group.id);if(error)throw error},'Template removido')
  }
  const deleteBoardTemplate = async (template: BoardTemplate) => {
    const tplTitle = template.title || template.name || 'Modelo'
    if (!window.confirm(`Excluir o modelo de quadro "${tplTitle}"? Os quadros já criados a partir deste modelo não serão afetados.`)) return
    if (demoMode) {
      setData(prev => ({
        ...prev,
        boardTemplates: (prev.boardTemplates || DEFAULT_BOARD_TEMPLATES).filter(
          item => item.id !== template.id && (item.key ? item.key !== template.key : true)
        ),
      }))
      flash('Modelo de quadro removido da prévia local')
      return
    }
    await run(async () => {
      const { error } = await supabase.from('board_templates').delete().eq('id', template.id)
      if (error) throw error
      setData(prev => ({
        ...prev,
        boardTemplates: (prev.boardTemplates || DEFAULT_BOARD_TEMPLATES).filter(item => item.id !== template.id),
      }))
    }, 'Modelo de quadro removido')
  }
  const saveDemoTemplate = (group:ChecklistTemplateGroup|null,name:string,description:string,items:string[]) => {
    setData(prev=>{const id=group?.id||crypto.randomUUID();const saved:ChecklistTemplateGroup={id,name,description:description||null,position:group?.position??prev.templateGroups.length+1};const templateGroups=group?prev.templateGroups.map(item=>item.id===id?saved:item):[...prev.templateGroups,saved];const templateItems:ChecklistTemplateItem[]=[...prev.templateItems.filter(item=>item.group_id!==id),...items.map((title,index)=>({id:crypto.randomUUID(),group_id:id,title,position:index+1}))];return {...prev,templateGroups,templateItems}})
    flash(group?'Template atualizado na prévia local':'Template criado na prévia local')
  }
  const saveDemoBoardTemplate = (
    template: BoardTemplate | null,
    payload: {
      name: string
      description: string
      methodology: import('./lib').BoardMethodology
      color: string
      stages: import('./lib').BoardTemplateStage[]
    }
  ) => {
    setData(prev => {
      const id = template?.id || `tmpl-${crypto.randomUUID()}`
      const saved: BoardTemplate = {
        id,
        key: template?.key || id,
        name: payload.name,
        title: payload.name,
        description: payload.description || null,
        methodology: payload.methodology,
        color: payload.color,
        stages: payload.stages,
        is_builtin: template?.is_builtin ?? false,
      }
      const currentList = prev.boardTemplates || DEFAULT_BOARD_TEMPLATES
      const exists = currentList.some(item => item.id === id || (template?.key && item.key === template.key))
      const boardTemplates = exists
        ? currentList.map(item => (item.id === id || (template?.key && item.key === template.key) ? saved : item))
        : [...currentList, saved]
      return { ...prev, boardTemplates }
    })
    flash(template ? 'Modelo de quadro atualizado na prévia local' : 'Modelo de quadro criado na prévia local')
  }
  const saveDemoTag = (tag:Tag|null,name:string,color:string) => {
    setData(prev=>{const saved:Tag={id:tag?.id||crypto.randomUUID(),name,color};return {...prev,tags:tag?prev.tags.map(item=>item.id===tag.id?saved:item):[...prev.tags,saved],tasks:tag&&tag.name!==name?prev.tasks.map(task=>({...task,tags:task.tags.map(item=>item===tag.name?name:item)})):prev.tasks}})
    flash(tag?'Tag atualizada na prévia local':'Tag criada na prévia local')
  }
  const deleteTag = async (tag:Tag) => {
    if(!window.confirm(`Excluir a tag "${tag.name}"? Ela será removida das tarefas que a usam.`))return
    if(demoMode){setData(prev=>({...prev,tags:prev.tags.filter(item=>item.id!==tag.id),tasks:prev.tasks.map(task=>({...task,tags:task.tags.filter(item=>item!==tag.name)}))}));flash('Tag removida da prévia local');return}
    await run(async()=>{const {error}=await supabase.rpc('delete_tag',{p_tag_id:tag.id});if(error)throw error},'Tag removida')
  }

  const renderMyBoards = () => {
    return (
      <div className="my-boards-page">
        <div className="my-boards-head">
          <div>
            <h2>Meus Quadros</h2>
            <p>Gerencie seus quadros Kanban e visões de setor personalizados.</p>
          </div>
          {canCreateBoard && (
            <button type="button" className="btn btn-primary" onClick={() => setShowCreateBoard(true)}>
              <Plus size={15} /> Criar quadro
            </button>
          )}
        </div>

        {/* Estado vazio amigável quando o usuário não tiver quadros personalizados/setor */}
        {userCustomBoards.length === 0 && (
          <div className="my-boards-empty-banner">
            <div className="my-boards-empty-text">
              <FolderKanban size={22} />
              <div>
                <strong>Nenhum quadro personalizado criado ainda</strong>
                <p>Crie quadros com etapas e limites WIP próprios para sua equipe ou espelhe etapas do Geral em uma visão por setor.</p>
              </div>
            </div>
            {canCreateBoard && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateBoard(true)}
              >
                <Plus size={14} /> Criar quadro
              </button>
            )}
          </div>
        )}

        <div className="my-boards-grid">
          {/* Cards dos quadros operacionais do usuário */}
          {userCustomBoards.map(board => {
            const isSector = board.type === 'sector_view'
            const boardTasks = data.tasks.filter(t => {
              if (isSector) {
                return (!t.board_id || t.board_id === 'board-geral') && (board.stage_ids || []).includes(t.stage_id)
              }
              return t.board_id === board.id
            })

            const previewStages: { id: string; name: string; color: string }[] = isSector
              ? data.stages.filter(s => (board.stage_ids || []).includes(s.id))
              : data.boardStages
                  .filter(s => s.board_id === board.id)
                  .sort((a, b) => a.position - b.position)
                  .map(s => ({ id: s.id, name: s.name, color: s.color }))

            const stagesCount = previewStages.length
            const teamName = board.team_id ? data.teams.find(t => t.id === board.team_id)?.name : null
            const canManage = Boolean(
              canAdmin ||
              (demoMode && (!profile || profile.role === 'administrador')) ||
              board.created_by === profile?.id ||
              (board.team_id && data.members.some(m => m.team_id === board.team_id && m.user_id === profile?.id && m.is_manager && m.active))
            )

            return (
              <div
                key={board.id}
                className="my-board-card is-clickable"
                onClick={() => setActiveBoardId(board.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActiveBoardId(board.id) }}
                aria-label={`Abrir quadro ${board.name}`}
              >
                <div className="my-board-card-header">
                  <div className="my-board-title-row">
                    {isSector ? <Layers size={16} /> : <FolderKanban size={16} />}
                    <h3>{board.name}</h3>
                    <span className={`badge-type ${isSector ? 'sector' : 'custom'}`}>
                      {isSector ? 'Visão de Setor' : 'Personalizado'}
                    </span>
                    <span className="badge-methodology">
                      {stagesCount} {stagesCount === 1 ? 'etapa' : 'etapas'}
                    </span>
                  </div>
                  <p>{board.description || (isSector ? 'Visão filtrada de etapas do Geral.' : 'Quadro de tarefas com etapas customizadas.')}</p>
                </div>

                {/* Miniatura com as colunas do quadro */}
                <div className="my-board-columns-preview" title={`Colunas de ${board.name}`}>
                  {previewStages.length > 0 ? (
                    previewStages.map((stg, i) => (
                      <span key={stg.id || i} className="my-board-mini-col">
                        <i style={{ background: stg.color || '#3b82f6' }} />
                        <span>{stg.name}</span>
                      </span>
                    ))
                  ) : (
                    <span className="my-board-mini-col none">Sem colunas definidas</span>
                  )}
                </div>

                <div className="my-board-card-metrics">
                  <span>{boardTasks.length} {boardTasks.length === 1 ? 'tarefa' : 'tarefas'}</span>
                  <span>&bull;</span>
                  <span>{stagesCount} {stagesCount === 1 ? 'etapa' : 'etapas'}</span>
                  <span>&bull;</span>
                  <span className="badge-scope">{board.is_shared ? 'Corporativo' : teamName || 'Equipe'}</span>
                </div>

                <div className="my-board-card-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={e => {
                      e.stopPropagation()
                      setActiveBoardId(board.id)
                    }}
                  >
                    Acessar quadro <ArrowRight size={14} />
                  </button>
                  {canManage && (
                    <div className="my-board-actions-group" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-ghost-action"
                        onClick={e => {
                          e.stopPropagation()
                          setEditingBoard(board)
                        }}
                        title="Editar configurações e etapas"
                        aria-label={`Editar ${board.name}`}
                      >
                        <Settings2 size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost-action text-danger"
                        onClick={e => {
                          e.stopPropagation()
                          void handleDeleteBoard(board)
                        }}
                        title="Excluir quadro"
                        aria-label={`Excluir ${board.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Cartão tracejado "+ Novo quadro personalizado" no fim da lista */}
          {canCreateBoard && (
            <button
              type="button"
              className="my-board-card my-board-dashed-card"
              onClick={() => setShowCreateBoard(true)}
              aria-label="Adicionar novo quadro personalizado"
            >
              <div className="dashed-card-icon">
                <Plus size={22} />
              </div>
              <strong>+ Novo quadro personalizado</strong>
              <small>Criar colunas próprias ou começar de um modelo</small>
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderTasks = () => {
    return <section className="content content-wide task-content">
      <div className="task-tabs">
        <button className={taskTab==='tarefas'?'active':''} onClick={()=>setTaskTab('tarefas')}><LayoutDashboard size={15}/> Tarefas</button>
        <button className={taskTab==='templates'?'active':''} onClick={()=>setTaskTab('templates')}><List size={15}/> Templates</button>
        <button className={taskTab==='tags'?'active':''} onClick={()=>setTaskTab('tags')}><Tags size={15}/> Tags</button>
        {taskTab==='tarefas'&&<div className="task-tabs-end"><Button onClick={openNewTask}><Plus size={16}/> Nova tarefa</Button></div>}
      </div>
      {taskTab==='tarefas' && <>
        {/* Linha de Abas de Quadro no Topo: [Geral] [Meus quadros] [quadros do usuário...] [+ Novo quadro] */}
        <div className="board-tabs-bar">
          <div className="board-tabs-list">
            {boardTabsOrder.filter(id => defaultTabIds.includes(id)).map((tabId, idx, arr) => {
              const isFirst = idx === 0
              const isLast = idx === arr.length - 1
              const dropIndicatorClass = dragOverTabInfo?.id === tabId
                ? dragOverTabInfo.side === 'left' ? 'tab-drop-indicator-left' : 'tab-drop-indicator-right'
                : ''

              if (tabId === 'board-geral') {
                return (
                  <div key="board-geral" className="board-tab-item">
                    <button
                      type="button"
                      draggable
                      onDragStart={e => handleTabDragStart(e, 'board-geral')}
                      onDragOver={e => handleTabDragOver(e, 'board-geral')}
                      onDrop={e => handleTabDrop(e, 'board-geral')}
                      className={`board-tab ${activeBoardId === 'board-geral' ? 'active' : ''} ${dropIndicatorClass}`}
                      onClick={() => setActiveBoardId('board-geral')}
                      title="Arrastar para reordenar aba ou clicar para abrir"
                    >
                      <span className="board-tab-color-dot" style={{ background: getBoardVisual({ id: 'board-geral', name: 'Geral' }).dot }} />
                      <span>Geral</span>
                      <span className="board-tab-tag">Agregação</span>
                    </button>
                    <span className="tab-accessible-reorder">
                      {!isFirst && (
                        <button
                          type="button"
                          className="tab-reorder-btn"
                          onClick={() => moveTabPosition('board-geral', 'left')}
                          title="Mover aba Geral para a esquerda"
                          aria-label="Mover aba Geral para a esquerda"
                        >
                          ←
                        </button>
                      )}
                      {!isLast && (
                        <button
                          type="button"
                          className="tab-reorder-btn"
                          onClick={() => moveTabPosition('board-geral', 'right')}
                          title="Mover aba Geral para a direita"
                          aria-label="Mover aba Geral para a direita"
                        >
                          →
                        </button>
                      )}
                    </span>
                  </div>
                )
              }

              if (tabId === 'meus-quadros') {
                return (
                  <div key="tab-meus-quadros" className="board-tab-item">
                    <button
                      type="button"
                      draggable
                      onDragStart={e => handleTabDragStart(e, 'meus-quadros')}
                      onDragOver={e => handleTabDragOver(e, 'meus-quadros')}
                      onDrop={e => handleTabDrop(e, 'meus-quadros')}
                      className={`board-tab ${activeBoardId === 'meus-quadros' ? 'active' : ''} ${dropIndicatorClass}`}
                      onClick={() => setActiveBoardId('meus-quadros')}
                      title="Arrastar para reordenar aba ou clicar para abrir"
                    >
                      <FolderKanban size={13} />
                      <span>Meus quadros</span>
                    </button>
                    <span className="tab-accessible-reorder">
                      {!isFirst && (
                        <button
                          type="button"
                          className="tab-reorder-btn"
                          onClick={() => moveTabPosition('meus-quadros', 'left')}
                          title="Mover aba Meus quadros para a esquerda"
                          aria-label="Mover aba Meus quadros para a esquerda"
                        >
                          ←
                        </button>
                      )}
                      {!isLast && (
                        <button
                          type="button"
                          className="tab-reorder-btn"
                          onClick={() => moveTabPosition('meus-quadros', 'right')}
                          title="Mover aba Meus quadros para a direita"
                          aria-label="Mover aba Meus quadros para a direita"
                        >
                          →
                        </button>
                      )}
                    </span>
                  </div>
                )
              }

              const b = userCustomBoards.find(x => x.id === tabId)
              if (!b) return null

              return (
                <div key={b.id} className="board-tab-item">
                  <button
                    type="button"
                    draggable
                    onDragStart={e => handleTabDragStart(e, b.id)}
                    onDragOver={e => handleTabDragOver(e, b.id)}
                    onDrop={e => handleTabDrop(e, b.id)}
                    className={`board-tab ${b.id === activeBoardId ? 'active' : ''} ${dropIndicatorClass}`}
                    onClick={() => setActiveBoardId(b.id)}
                    title={`Arrastar para reordenar aba ou clicar para abrir ${b.name}`}
                  >
                    <span className="board-tab-color-dot" style={{ background: getBoardVisual(b).dot }} />
                    <span>{b.name}</span>
                    {b.type === 'sector_view' && <span className="board-tab-tag">Setor</span>}
                  </button>
                  <span className="tab-accessible-reorder">
                    {!isFirst && (
                      <button
                        type="button"
                        className="tab-reorder-btn"
                        onClick={() => moveTabPosition(b.id, 'left')}
                        title={`Mover aba ${b.name} para a esquerda`}
                        aria-label={`Mover aba ${b.name} para a esquerda`}
                      >
                        ←
                      </button>
                    )}
                    {!isLast && (
                      <button
                        type="button"
                        className="tab-reorder-btn"
                        onClick={() => moveTabPosition(b.id, 'right')}
                        title={`Mover aba ${b.name} para a direita`}
                        aria-label={`Mover aba ${b.name} para a direita`}
                      >
                        →
                      </button>
                    )}
                  </span>
                </div>
              )
            })}

            {/* 4. [+ Novo quadro] SEMPRE nesta linha de abas, após a última aba */}
            {canCreateBoard && (
              <button
                type="button"
                className="board-tab board-tab-create"
                onClick={() => setShowCreateBoard(true)}
              >
                <Plus size={13} />
                <span>Novo quadro</span>
              </button>
            )}
          </div>

          {/* À direita da linha de abas: alternador Kanban / Lista */}
          <div className="board-tabs-right">
            {activeBoardId !== 'meus-quadros' && activeBoardId !== 'board-geral' && (
              <>
                <div className="view-switch">
                  <button
                    type="button"
                    className={taskView === 'kanban' ? 'selected' : ''}
                    onClick={() => setTaskView('kanban')}
                  >
                    <LayoutDashboard size={14} /> Kanban
                  </button>
                  <button
                    type="button"
                    className={taskView === 'lista' ? 'selected' : ''}
                    onClick={() => setTaskView('lista')}
                  >
                    <List size={14} /> Lista
                  </button>
                  {activeBoard.methodology === 'scrum' && (
                    <>
                      <button
                        type="button"
                        className={taskView === 'backlog' ? 'selected' : ''}
                        onClick={() => setTaskView('backlog')}
                      >
                        <Layers size={14} /> Backlog
                      </button>
                      <button
                        type="button"
                        className={taskView === 'sprint' ? 'selected' : ''}
                        onClick={() => setTaskView('sprint')}
                      >
                        <Zap size={14} /> Sprint
                      </button>
                    </>
                  )}
                </div>

                {canManageActiveBoard && (
                  <button
                    type="button"
                    className="btn-manage-stages"
                    onClick={() => setEditingBoard(activeBoard)}
                  >
                    <Settings2 size={13} /> Editar etapas
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Se a aba Meus quadros estiver selecionada, renderiza Tela 3 inline (navegação própria, sem popup) */}
        {activeBoardId === 'meus-quadros' ? (
          renderMyBoards()
        ) : activeBoardId === 'board-geral' ? (
          <>
            {/* Camada 3: Barra consolidada de controles da visão Geral */}
            <GeneralToolbar
              mode={generalMode}
              situation={generalSituation}
              selectedBoardId={generalBoardFilter}
              boards={generalBoards}
              onModeChange={handleGeneralModeChange}
              onSituationChange={setGeneralSituation}
              onBoardFilterChange={setGeneralBoardFilter}
              hideEmptyColumns={
                generalMode === 'lateral'
                  ? generalHideEmptyColumnsLateral
                  : generalHideEmptyColumnsConsolidado
              }
              onHideEmptyColumnsChange={handleToggleHideEmptyColumns}
              searchQuery={query}
              onSearchQueryChange={setQuery}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={setPriorityFilter}
              teamFilter={teamFilter}
              onTeamFilterChange={setTeamFilter}
              assigneeFilter={assigneeFilter}
              onAssigneeFilterChange={setAssigneeFilter}
              clientFilter={clientFilter}
              onClientFilterChange={setClientFilter}
              dueFilter={dueFilter}
              onDueFilterChange={setDueFilter}
              teams={data.teams}
              profiles={data.profiles}
              clients={data.clients}
              onClearFilters={() => {
                setPriorityFilter('')
                setTeamFilter('')
                setAssigneeFilter('')
                setClientFilter('')
                setDueFilter('')
              }}
              onExpandAll={handleExpandAllAccordions}
              onCollapseAll={handleCollapseAllAccordions}
            />

            {/* Visão selecionada pelo usuário: Lateral ou Consolidado */}
            {generalMode === 'lateral' ? (
              <GeneralLateralView
                boards={generalBoards}
                tasks={globallyFilteredTasks}
                canonicalStages={data.stages}
                customBoardStages={data.boardStages}
                sprints={data.sprints}
                situation={generalSituation}
                selectedBoardId={generalBoardFilter}
                blockOrder={generalBlockOrder}
                onBlockOrderChange={handleGeneralBlockOrderChange}
                onTaskSelect={setSelectedTask}
                onNavigateToBoard={setActiveBoardId}
                moveTask={moveTask}
                deleteTask={deleteTask}
                person={person}
                team={team}
                canFreeMove={canFreeMove}
                notify={flash}
                allTasks={data.tasks}
                allBoards={data.boards}
                allClients={data.clients}
                hideEmptyColumns={generalHideEmptyColumnsLateral}
                onHideEmptyColumnsChange={handleToggleHideEmptyColumns}
              />
            ) : (
              <GeneralAccordionView
                boards={generalBoards}
                tasks={globallyFilteredTasks}
                canonicalStages={data.stages}
                customBoardStages={data.boardStages}
                sprints={data.sprints}
                situation={generalSituation}
                selectedBoardId={generalBoardFilter}
                expandedAccordions={generalExpandedAccordions}
                onAccordionToggle={handleAccordionToggle}
                onNavigateToBoard={setActiveBoardId}
                onTaskSelect={setSelectedTask}
                moveTask={moveTask}
                deleteTask={deleteTask}
                person={person}
                team={team}
                canFreeMove={canFreeMove}
                notify={flash}
                allTasks={data.tasks}
                allBoards={data.boards}
                allClients={data.clients}
                blockOrder={generalBlockOrder}
                onBlockOrderChange={handleGeneralBlockOrderChange}
                hideEmptyColumns={generalHideEmptyColumnsConsolidado}
                onHideEmptyColumnsChange={handleToggleHideEmptyColumns}
              />
            )}
          </>
        ) : (
          <>
            {/* TELA 2: Banner de apoio na visão por setor */}
            {activeBoard.type === 'sector_view' && (
              <div className="sector-info-banner">
                <Layers size={15} />
                <span>Visão filtrada do quadro Geral. Mover um card aqui atualiza o Geral.</span>
              </div>
            )}

            {/* Filtros */}
            <div className="task-tools">
              <div className="search">
                <Search size={17} />
                <input placeholder="Buscar tarefas..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <select aria-label="Filtrar etapa" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                <option value="">Todos os status</option>
                {currentBoardStages.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <select aria-label="Filtrar prioridade" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                <option value="">Todas as prioridades</option>
                {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select aria-label="Filtrar equipe" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
                <option value="">Todas as equipes</option>
                {data.teams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>

            <div className="task-subtools">
              <div className="filters">
                <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                  <option value="">Responsável</option>
                  {data.profiles.map(x => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                </select>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
                  <option value="">Cliente</option>
                  {data.clients.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <select value={dueFilter} onChange={e => setDueFilter(e.target.value)}>
                  <option value="">Prazo</option>
                  <option value="atrasadas">Atrasadas</option>
                  <option value="futuras">Futuras</option>
                  <option value="sem_prazo">Sem prazo</option>
                </select>
                {dashboardFilter && (
                  <button className="filter-chip" onClick={() => setDashboardFilter(null)}>
                    Filtro: {({ mine: 'Minhas tarefas', overdue: 'Atrasadas', soon: 'Próximas', blocked: 'Bloqueadas', week: 'Concluídas na semana' })[dashboardFilter]} <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {taskView === 'backlog' && activeBoard.methodology === 'scrum' ? (
              <BacklogView
                board={activeBoard}
                data={data}
                activeSprint={activeSprint}
                onOpenCreateSprint={() => setShowCreateSprintModal(true)}
                onStartSprint={handleStartSprint}
                onMoveTaskToSprint={handleMoveTaskToSprint}
                onQuickCreateTask={handleQuickCreateBacklogTask}
                onSelectTask={setSelectedTask}
                person={person}
              />
            ) : taskView === 'sprint' && activeBoard.methodology === 'scrum' ? (
              activeSprint ? (
                <>
                  <SprintActiveHeader
                    sprint={activeSprint}
                    tasks={data.tasks}
                    boardStages={currentBoardStages}
                    onOpenBurndown={() => setShowBurndownModal(true)}
                    onOpenComplete={() => setShowCompleteSprintModal(true)}
                  />
                  <Kanban
                    tasks={filteredTasks}
                    data={data}
                    stages={currentBoardStages}
                    moveTask={moveTask}
                    deleteTask={deleteTask}
                    onTask={setSelectedTask}
                    person={person}
                    team={team}
                    canFreeMove={canFreeMove}
                    onForwardTask={t => setForwardingTask(t)}
                  />
                </>
              ) : (
                <div className="sprint-empty-state">
                  <Zap size={32} className="text-warning" />
                  <h4>Nenhuma sprint ativa neste quadro</h4>
                  <p>Inicie uma sprint planejada a partir do Backlog para acompanhar o ciclo de execução aqui.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setTaskView('backlog')}
                  >
                    Ir para o Backlog
                  </button>
                </div>
              )
            ) : taskView === 'kanban' ? (
              <Kanban
                tasks={filteredTasks}
                data={data}
                stages={currentBoardStages}
                moveTask={moveTask}
                deleteTask={deleteTask}
                onTask={setSelectedTask}
                person={person}
                team={team}
                canFreeMove={canFreeMove}
                onForwardTask={t => setForwardingTask(t)}
              />
            ) : (
              <TaskList
                tasks={filteredTasks}
                data={data}
                stages={currentBoardStages}
                onTask={setSelectedTask}
                person={person}
                team={team}
                client={client}
                moveTask={moveTask}
                deleteTask={deleteTask}
                canFreeMove={canFreeMove}
              />
            )}

            {hasMoreTasks && (
              <div className="task-pagination">
                <button type="button" className="btn btn-secondary" onClick={() => void loadMoreTasks()} disabled={loadingMoreTasks}>
                  <ArrowDown size={14} /> {loadingMoreTasks ? 'Carregando mais tarefas...' : 'Carregar mais tarefas'}
                </button>
              </div>
            )}
          </>
        )}
      </>}
      {taskTab==='templates' && (
        <TemplateTab
          data={data}
          canManage={canAdmin || demoMode}
          onCreate={() => setEditingTemplate(null)}
          onEdit={setEditingTemplate}
          onDelete={group => void deleteTemplate(group)}
          onOpenCreateBoard={templateIdOrObj => {
            const initialId = typeof templateIdOrObj === 'object' ? (templateIdOrObj?.id || templateIdOrObj?.key) : templateIdOrObj
            setCreateBoardInitialTemplate(initialId || null)
            setShowCreateBoard(true)
          }}
          onOpenCreateBoardTemplate={() => setEditingBoardTemplate(null)}
          onEditBoardTemplate={setEditingBoardTemplate}
          onDeleteBoardTemplate={tpl => void deleteBoardTemplate(tpl)}
        />
      )}
      {taskTab==='tags' && <TagTab data={data} canManage={canAdmin||demoMode} onCreate={()=>setEditingTag(null)} onEdit={setEditingTag} onDelete={tag=>void deleteTag(tag)} onSelect={tag=>{setQuery(tag.name);setTaskTab('tarefas')}}/>}
    </section>
  }
  const renderCompleted = () => {
    const finished = data.tasks.filter(t => {
      const isDone = completed(t, allStages, data.boardStages)
      if (!isDone) return false

      if (completedBoardFilter) {
        if (t.board_id !== completedBoardFilter) return false
      }

      if (completedQuery) {
        const matchesQuery = `${t.title} ${t.description} ${t.tags.join(' ')}`
          .toLocaleLowerCase('pt-BR')
          .includes(completedQuery.toLocaleLowerCase('pt-BR'))
        if (!matchesQuery) return false
      }

      return true
    })

    return (
      <section className="content content-wide completed-content">
        <div className="completed-heading">
          <div>
            <h2>Tarefas concluídas</h2>
            <p>Entregas finalizadas e histórico de conclusão em todos os quadros.</p>
          </div>
          <span>{finished.length} concluídas</span>
        </div>
        <div className="task-tools">
          <div className="search">
            <Search size={17} />
            <input
              placeholder="Buscar tarefas concluídas..."
              value={completedQuery}
              onChange={e => setCompletedQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar por quadro"
            value={completedBoardFilter}
            onChange={e => setCompletedBoardFilter(e.target.value)}
          >
            <option value="">Todos os quadros</option>
            {data.boards.filter(b => b.id !== 'board-geral' && b.type !== 'general' && b.type !== 'sector_view' && (b as { is_active?: boolean }).is_active !== false).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <TaskList
          tasks={finished}
          data={data}
          stages={allStages}
          onTask={setSelectedTask}
          person={person}
          team={team}
          client={client}
          moveTask={moveTask}
          deleteTask={deleteTask}
        />
        {hasMoreTasks && (
          <div className="task-pagination">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadMoreTasks()}
              disabled={loadingMoreTasks}
            >
              <ArrowDown size={14} /> {loadingMoreTasks ? 'Carregando mais tarefas...' : 'Carregar mais tarefas'}
            </button>
          </div>
        )}
      </section>
    )
  }

  const registrationToken = useMemo(() => {
    const path = window.location.pathname
    const match = path.match(/^\/cadastro\/([a-zA-Z0-9_-]+)/)
    if (match) return match[1]
    const param = new URLSearchParams(window.location.search).get('cadastro') || new URLSearchParams(window.location.search).get('token')
    if (path.includes('cadastro') && param) return param
    return null
  }, [])

  if (registrationToken) {
    return <PublicClientRegistrationPage token={registrationToken} preview={demoMode} />
  }

  if (!authReady) return <div className="setup-screen">Carregando...</div>
  if (!session) return <Login preview={demoMode} onPreviewLogin={()=>{const master=data.profiles.find(person=>person.is_master)||demoData.profiles[0];setProfile(master);setSession({user:{id:master.id,email:master.email||'',user_metadata:{}},access_token:'demo'} as Session)}} />
  if (session.user.user_metadata?.must_set_password) return <SetPassword />
  if (loading) return <div className="setup-screen">Carregando seu espaço...</div>
  if (!demoMode && !profile) return <div className="setup-screen"><div className="setup-card"><h1>Conta sem acesso</h1><p>Seu perfil está inativo ou não foi encontrado. Fale com um administrador.</p><Button onClick={()=>void handleSignOut()}>Sair</Button></div></div>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><strong className="brand-wordmark">OPS<span>HUB</span></strong></div>
      <div className="nav-label">Menu</div>
      <nav>{nav.filter(item=>!['teams','users','settings'].includes(item.page)).map(item => (
        <button key={item.page} onClick={() => { setPage(item.page); setMobileNav(false); if(item.page==='tasks')setTaskTab('tarefas') }} className={`nav-item ${page===item.page?'active':''}`}>
          <item.icon size={17}/>
          <span>{item.label}</span>
          {item.page === 'chat' && (
            totalChatMentions > 0 ? (
              <b className="chat-nav-badge mention" aria-label={`${totalChatMentions} menções não lidas`}>@{totalChatMentions}</b>
            ) : totalChatUnread > 0 ? (
              <b className="chat-nav-badge unread" aria-label={`${totalChatUnread} mensagens não lidas`}>{totalChatUnread}</b>
            ) : null
          )}
        </button>
      ))}</nav>
      <div className="nav-label nav-admin">Administração</div>
      <nav>{nav.filter(item=>['teams','users'].includes(item.page)).map(item => <button key={item.page} onClick={() => { setPage(item.page); setMobileNav(false) }} className={`nav-item ${page===item.page?'active':''}`}><item.icon size={17}/><span>{item.label}</span></button>)}</nav>
      <div className="nav-label nav-admin">Minha conta</div>
      <nav><button onClick={() => { setPage('settings'); setMobileNav(false) }} className={`nav-item ${page==='settings'?'active':''}`}><Settings2 size={17}/><span>Configurações</span></button></nav>
      <div className="sidebar-bottom"><button className="theme-toggle" onClick={()=>setTheme(current=>current==='dark'?'light':'dark')} aria-label={theme==='dark'?'Ativar modo claro':'Ativar modo escuro'}>{theme==='dark'?<Sun size={15}/>:<Moon size={15}/>}<span>{theme==='dark'?'Modo Claro':'Modo Escuro'}</span></button><div className="sidebar-account"><button className="user-card" onClick={() => {setPage('settings');setMobileNav(false)}} aria-label="Abrir meu perfil"><div className="avatar">{initials(profile?.full_name || session.user.email || 'U')}</div><span><strong>{profile?.full_name || session.user.email}</strong><small>{profile?.is_master?'Administrador master':profile?.role || 'Usuário'}</small></span></button><button className="account-signout" onClick={()=>void handleSignOut()} aria-label="Sair da conta" title="Sair da conta"><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Abrir menu"><Menu size={21}/></button><div className="breadcrumb">OPSHUB <span>/</span> <strong>{nav.find(n=>n.page===page)?.label}</strong></div><div className="topbar-right"><div className="topbar-date"><CalendarDays size={16}/>{new Intl.DateTimeFormat('pt-BR', {day:'numeric',month:'long',year:'numeric'}).format(new Date())}</div><button className="icon-btn" aria-label={totalChatMentions > 0 ? `${totalChatMentions} menções não lidas` : totalChatUnread > 0 ? `${totalChatUnread} mensagens não lidas` : 'Notificações'} onClick={() => setPage('chat')} style={{ position: 'relative' }}><Bell size={19}/>{totalChatMentions > 0 ? <span className="chat-bell-badge mention">@{totalChatMentions}</span> : totalChatUnread > 0 ? <span className="chat-bell-badge unread">{totalChatUnread}</span> : null}</button><div className="avatar avatar-sm">{initials(profile?.full_name || 'U')}</div></div></header>
      {demoMode && <div className="demo-banner"><strong>Prévia local</strong> · Dados fictícios. Para salvar no PostgreSQL e usar o chat em tempo real, configure o Supabase conforme o README.</div>}
      {error && <div className="toast toast-error" role="alert"><span>{error}</span><div className="toast-actions"><button type="button" className="btn-toast-retry" onClick={() => { setError(''); setLoading(true); reloadWithRetry().catch(e => setError(messageError(e))).finally(() => setLoading(false)) }}>Tentar novamente</button><button onClick={()=>setError('')} aria-label="Fechar erro"><X size={16}/></button></div></div>}
      {notice && <div className="toast toast-ok" role="status"><Check size={16}/>{notice}</div>}
      {page==='dashboard' && (
        <section className="content">
          <Dashboard
            data={data}
            profile={profile}
            dashboard={dashboard}
            openMetric={openMetric}
            onTask={setSelectedTask}
            person={person}
            team={team}
            stage={stage}
            onNewTask={() => setNewTask(true)}
            onNavigateToPage={p => {
              setPage(p)
              if (p === 'tasks') setTaskTab('tarefas')
            }}
            onNavigateToBoard={boardId => {
              setActiveBoardId(boardId)
              setTaskTab('tarefas')
              setPage('tasks')
            }}
          />
        </section>
      )}
      {page==='reports' && <Suspense fallback={<div className="page-loading">Carregando...</div>}><ReportsPage data={data} onTask={setSelectedTask}/></Suspense>}
      {page==='tasks' && renderTasks()}
      {page==='completed' && renderCompleted()}
      {page==='chat' && (
        <ChatPage
          data={data}
          session={session}
          demoMode={demoMode}
          canAdmin={Boolean(canAdmin || demoMode)}
          canManageTeam={canManageTeam}
          onTaskSelect={setSelectedTask}
          onReload={reload}
          onNotify={flash}
          onError={setError}
        />
      )}
      <Suspense fallback={<div className="page-loading">Carregando...</div>}>
        {page==='clients' && <ClientsPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} hasMore={hasMoreClients} loadMore={loadMoreClients} loadingMore={loadingMoreClients} userId={session.user.id}/>}
        {page==='teams' && <TeamsPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} userId={session.user.id}/>}
        {page==='users' && <UsersPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canMaster={canMaster} currentUserId={session.user.id} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} setError={setError} onUserSaved={saved=>{if(saved.id===session.user.id)setProfile(saved)}}/>}
        {page==='settings' && <UserSettings key={session.user.id} profile={profile} email={session.user.email||''} teams={data.teams.filter(team=>data.members.some(member=>member.team_id===team.id&&member.user_id===session.user.id&&member.active)).map(team=>team.name)} preview={demoMode} theme={theme} onThemeChange={setTheme} onProfileSaved={saved=>{setProfile(saved);setData(current=>({...current,profiles:current.profiles.map(person=>person.id===saved.id?saved:person)}))}} notify={flash}/>}
      </Suspense>
    </main>
    {newTask && <NewTaskForm
      data={data}
      userId={session.user.id}
      activeBoard={activeBoard}
      currentBoardStages={currentBoardStages}
      boardSprints={boardSprints}
      activeSprint={activeSprint}
      onClose={()=>setNewTask(false)}
      run={run}
      onDemoCreate={demoMode?(task,templateIds)=>{setData(prev=>({...prev,tasks:[...prev.tasks,task]}));const selected=data.templateItems.filter(item=>templateIds.includes(item.group_id)).map((item,index)=>{const group=data.templateGroups.find(g=>g.id===item.group_id);return {id:crypto.randomUUID(),task_id:task.id,title:item.title,done:false,position:index+1,group_name:group?.name||null}});setDemoChecklists(prev=>({...prev,[task.id]:selected}));flash('Tarefa criada nesta prévia local')}:undefined}
    />}
    {selectedTask && (
      <TaskDetailModal
        key={selectedTask.id}
        task={data.tasks.find(t=>t.id===selectedTask.id) || selectedTask}
        data={data}
        userId={session?.user?.id || 'demo-user'}
        profile={profile || (demoMode ? (data.profiles.find(p => p.id === session?.user?.id) || data.profiles[0]) : null)}
        onClose={()=>setSelectedTask(null)}
        run={run}
        preview={demoMode}
        previewChecklist={demoChecklists[selectedTask.id]||[]}
        onPreviewChecklist={(id,items)=>setDemoChecklists(prev=>({...prev,[id]:items}))}
        onPreviewSave={task=>{setData(prev=>({...prev,tasks:prev.tasks.map(item=>item.id===task.id?task:item)}));if(demoMode){flash('Tarefa atualizada na prévia local')}}}
        onPreviewDelete={id=>{setData(prev=>({...prev,tasks:prev.tasks.filter(item=>item.id!==id)}));flash('Tarefa excluída');setSelectedTask(null)}}
        onSelectTask={t => setSelectedTask(t)}
        onForwardTask={t => setForwardingTask(t)}
      />
    )}
    {(forwardingTask || forwardingTasks) && (
      <ForwardTaskModal
        task={forwardingTask}
        tasks={forwardingTasks || undefined}
        data={data}
        currentProfile={profile || (demoMode ? (data.profiles.find(p => p.id === session?.user?.id) || data.profiles[0]) : null)}
        onClose={() => { setForwardingTask(null); setForwardingTasks(null) }}
        onConfirmForward={handleConfirmForward}
        onLater={() => { setForwardingTask(null); setForwardingTasks(null) }}
        defaultBoardId={
          forwardingTask?.board_id
            ? data.boards.find(b => b.id === forwardingTask.board_id)?.default_forward_board_id || null
            : null
        }
        defaultStageId={
          forwardingTask?.board_id
            ? data.boards.find(b => b.id === forwardingTask.board_id)?.default_forward_stage_id || null
            : null
        }
      />
    )}
    {showFlowSettings && <FlowSettings data={data} run={run} onClose={()=>setShowFlowSettings(false)}/ >}
    {editingTemplate!==undefined && <TemplateEditor key={editingTemplate?.id||'new'} data={data} group={editingTemplate} preview={demoMode} run={run} onClose={()=>setEditingTemplate(undefined)} onDemoSave={saveDemoTemplate}/ >}
    {editingTag!==undefined && <TagEditor key={editingTag?.id||'new'} data={data} tag={editingTag} preview={demoMode} run={run} onClose={()=>setEditingTag(undefined)} onDemoSave={saveDemoTag}/ >}
    {editingBoardTemplate !== undefined && (
      <BoardTemplateModal
        key={editingBoardTemplate?.id || 'new-board-template'}
        data={data}
        template={editingBoardTemplate}
        preview={demoMode}
        userId={session?.user?.id}
        run={run}
        onClose={() => setEditingBoardTemplate(undefined)}
        onDemoSave={saveDemoBoardTemplate}
      />
    )}
    {showCreateBoard && (
      <CreateBoardModal
        data={data}
        userId={session.user.id}
        canAdmin={Boolean(canAdmin || demoMode)}
        initialTemplateId={createBoardInitialTemplate}
        onClose={() => {
          setShowCreateBoard(false)
          setCreateBoardInitialTemplate(null)
        }}
        onCreate={handleCreateBoard}
      />
    )}
    {editingBoard && (
      <EditBoardModal
        board={editingBoard}
        data={data}
        canAdmin={Boolean(canAdmin || demoMode)}
        onClose={() => setEditingBoard(null)}
        onUpdate={handleUpdateBoard}
      />
    )}
    {showSprintPlan && (
      <SprintPlanModal
        board={activeBoard}
        data={data}
        onClose={() => setShowSprintPlan(false)}
        onSaveSprint={handleSaveSprint}
        onStartSprint={handleStartSprint}
        onCompleteSprint={handleCompleteSprint}
        onMoveTaskToSprint={handleMoveTaskToSprint}
      />
    )}
    {showCreateSprintModal && (
      <CreateSprintModal
        board={activeBoard}
        existingSprintsCount={boardSprints.length}
        onClose={() => setShowCreateSprintModal(false)}
        onSave={handleCreateSprint}
      />
    )}
    {showBurndownModal && activeSprint && (
      <BurndownModal
        sprint={activeSprint}
        tasks={data.tasks}
        boardStages={currentBoardStages}
        onClose={() => setShowBurndownModal(false)}
      />
    )}
    {showCompleteSprintModal && activeSprint && (
      <CompleteSprintModal
        sprint={activeSprint}
        tasks={data.tasks}
        boardStages={currentBoardStages}
        onClose={() => setShowCompleteSprintModal(false)}
        onComplete={handleCompleteSprint}
      />
    )}
  </div>
}

function initials(name: string) { return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'S' }
function Login({preview,onPreviewLogin}:{preview:boolean;onPreviewLogin:()=>void}) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
  const [forgotSent,setForgotSent]=useState(false)
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) setError(error.message); setBusy(false) }
  async function forgotPassword() {
    if(!email.trim()){setError('Informe seu e-mail para recuperar a senha.');return}
    setBusy(true);setError('')
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin})
    if(error) setError(error.message)
    else setForgotSent(true)
    setBusy(false)
  }
  return <div className="login-screen"><div className="login-brand"><div className="brand-mark">O</div><strong>ops<span>hub</span></strong></div><div className="login-panel"><div className="eyebrow">BEM-VINDO DE VOLTA</div><h1>Seu trabalho flui melhor aqui.</h1><p>{preview?'Explore o painel com uma conta fictícia de administrador master.':'Entre com a conta criada pelo OPSHUB.'}</p>{preview?<div className="login-demo"><strong>Prévia local</strong><p>Sem autenticação real ou dados persistidos. Acesso de demonstração.</p><Button onClick={onPreviewLogin} className="full">Entrar na prévia <ArrowRight size={17}/></Button></div>:<form onSubmit={submit}><Field label="E-mail"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@opshub.com.br" autoComplete="username"/></Field><Field label="Senha"><PasswordInput required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha" autoComplete="current-password"/></Field>{!preview && <div className="forgot-link">{forgotSent ? <span>E-mail de recuperação enviado!</span> : <button type="button" onClick={() => void forgotPassword()} disabled={!email.trim() || busy}>Esqueci minha senha</button>}</div>}{error && <div className="form-error">{error}</div>}<Button type="submit" disabled={busy} className="full">{busy?'Entrando...':'Entrar no hub'} <ArrowRight size={17}/></Button></form>}<small>{preview?'Configure o Supabase para usar sua conta real.':'Acesso restrito a usuários cadastrados.'}</small></div><div className="login-decoration"><div className="decoration-card"><span>✳  OPSHUB</span><h2>Projetos claros.<br/>Conversas em dia.<br/>Equipe conectada.</h2><div className="decoration-circles"><i/><i/><i/></div></div></div></div>
}
function SetPassword() {
  const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();if(password!==confirm){setError('As senhas não coincidem.');return}if(password.length<8){setError('Use ao menos 8 caracteres.');return}setBusy(true);const {error}=await supabase.auth.updateUser({password,data:{must_set_password:false}});if(error)setError(error.message);setBusy(false)}
  return <div className="setup-screen"><div className="setup-card"><div className="brand-mark">O</div><h1>Ative sua conta</h1><p>Troque a senha temporária recebida do OPSHUB para continuar.</p><form className="stack-form" onSubmit={e=>void submit(e)}><Field label="Nova senha"><PasswordInput required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></Field><Field label="Confirmar senha"><PasswordInput required value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></Field>{error&&<div className="form-error">{error}</div>}<Button type="submit" disabled={busy}>{busy?'Salvando...':'Ativar conta'}</Button></form></div></div>
}



function StageMenu({task,data,stages,moveTask,canFreeMove=false}:{task:Task;data:Data;stages?:(Stage & { wip_limit?: number | null; board_id?: string })[];moveTask:(task:Task,id:string)=>Promise<void>;canFreeMove?:boolean}) {
  const currentStages = stages || data.stages
  const boardSpecificStages = currentStages.filter(s => {
    if (task.board_id) {
      return (s as { board_id?: string }).board_id === task.board_id
    }
    return !(s as { board_id?: string }).board_id
  })
  const stagesToUse = boardSpecificStages.length > 0 ? boardSpecificStages : currentStages

  const allowed = canFreeMove
    ? stagesToUse.filter(s=>s.id!==task.stage_id).sort((a,b)=>a.position-b.position)
    : data.transitions.filter(t=>t.from_stage_id===task.stage_id).map(t=>stagesToUse.find(s=>s.id===t.to_stage_id)).filter((s):s is (Stage & { wip_limit?: number | null; board_id?: string })=>Boolean(s))
  return <select className="stage-menu" aria-label={`Mover ${task.title}`} value="" onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();void moveTask(task,e.target.value)}}><option value="">Mover...</option>{allowed.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
}
function TaskCard({
  task,
  data,
  stages,
  onTask,
  person,
  team: _team,
  moveTask,
  deleteTask,
  canFreeMove=false,
  onForwardTask
}:{
  task: Task
  data: Data
  stages?: (Stage & { wip_limit?: number | null })[]
  onTask: (t: Task) => void
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  moveTask: (t: Task, id: string) => Promise<void>
  deleteTask?: (t: Task) => Promise<void>
  canFreeMove?: boolean
  onForwardTask?: (t: Task) => void
}) {
  const currentStages = stages || data.stages
  const stageInfo = resolveTaskStage(task, currentStages, data.boardStages)
  const current = currentStages.find(s => s.id === task.stage_id)
  const isFinal = stageInfo.isFinal
  const isForwarded = Boolean(task.forwarded_at)
  const isBranch = Boolean(task.origin_task_id)

  const branchTask = isForwarded ? data.tasks.find(t => t.origin_task_id === task.id) : undefined
  const originTask = isBranch ? data.tasks.find(t => t.id === task.origin_task_id) : undefined

  const targetBoardName = branchTask
    ? (data.boards.find(b => b.id === (branchTask.board_id || 'board-geral'))?.name || 'Geral')
    : 'Outro quadro'
  const originBoardName = originTask
    ? (data.boards.find(b => b.id === (originTask.board_id || 'board-geral'))?.name || 'Geral')
    : 'Quadro anterior'

  const [showMenu, setShowMenu] = useState(false)
  const allowed = canFreeMove
    ? currentStages.filter(s => s.id !== task.stage_id).sort((a,b) => a.position - b.position)
    : data.transitions.filter(t => t.from_stage_id === task.stage_id).map(t => currentStages.find(s => s.id === t.to_stage_id)).filter((s): s is Stage => Boolean(s))
  const next = allowed.find(s => s.position === (current?.position || 0) + 1) || allowed.find(s => !s.is_pause && s.name !== 'Backlog')
  const clientName = task.client_id ? data.clients.find(c => c.id === task.client_id)?.name : undefined
  const assignee = person(task.assignee_id)
  const assigneeName = assignee?.full_name
  const assigneeInitials = assigneeName
    ? assigneeName.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : null

  const isOverdue = Boolean(task.due_at && !completed(task, currentStages, data.boardStages) && new Date(task.due_at) < new Date(new Date().setHours(0,0,0,0)))

  function formatShortDate(dateStr: string): string {
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}`
  }

  let dateLabel = ''
  if (task.completed_at) {
    dateLabel = `Concluída ${formatShortDate(task.completed_at)}`
  } else if (task.due_at) {
    dateLabel = isOverdue ? `Venceu ${formatShortDate(task.due_at)}` : `Prazo ${formatShortDate(task.due_at)}`
  }

  // Progresso de subtarefas conforme Design da Imagem 5
  const taskChecklist: Checklist[] = (initialDemoChecklists as Record<string, Checklist[]>)?.[task.id] || []
  let stats = { completed: 2, total: 9 }
  if (taskChecklist.length > 0) {
    stats = { completed: taskChecklist.filter((item: Checklist) => item.done).length, total: taskChecklist.length }
  } else {
    const hash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const total = (hash % 7) + 3
    const completedCount = hash % (total + 1)
    stats = { completed: completedCount, total }
  }
  const percent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  function handleDragStart(e: React.DragEvent) {
    if (isForwarded) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/task-id', task.id)
  }

  return (
    <div
      className={`task-card-v2 ${isForwarded ? 'is-locked' : ''}`}
      draggable={!isForwarded}
      onDragStart={handleDragStart}
    >
      <div className="task-card-v2-body" onClick={() => onTask(task)}>
        {/* Topo do card: Cliente à esquerda e botão ... à direita */}
        <div className="task-card-v2-header">
          <span className="task-card-v2-client">{clientName || 'Sem cliente'}</span>
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="task-card-v2-menu-btn"
              onClick={() => setShowMenu(prev => !prev)}
              aria-label="Mais ações"
            >
              <MoreHorizontal size={14} />
            </button>
            {showMenu && (
              <div className="task-card-v2-menu-popup" onMouseLeave={() => setShowMenu(false)}>
                {next && (
                  <button
                    type="button"
                    className="task-card-v2-menu-item"
                    onClick={() => { setShowMenu(false); void moveTask(task, next.id) }}
                  >
                    <ArrowRight size={12} /> Avançar etapa
                  </button>
                )}
                {isFinal && !isForwarded && onForwardTask && (
                  <button
                    type="button"
                    className="task-card-v2-menu-item"
                    onClick={() => { setShowMenu(false); onForwardTask(task) }}
                  >
                    <GitBranch size={12} /> Encaminhar
                  </button>
                )}
                {deleteTask && (
                  <button
                    type="button"
                    className="task-card-v2-menu-item danger"
                    onClick={() => {
                      setShowMenu(false)
                      if (window.confirm('Tem certeza de que deseja excluir esta tarefa permanentemente?')) {
                        void deleteTask(task)
                      }
                    }}
                  >
                    <Trash2 size={12} /> Excluir
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Título da tarefa */}
        <h4 className="task-card-v2-title">{task.title}</h4>

        {/* Tags (máximo de 2 visíveis e +n) */}
        {task.tags && task.tags.length > 0 && (
          <div className="task-card-v2-tags">
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag} className="task-card-v2-tag-chip">{tag}</span>
            ))}
            {task.tags.length > 2 && (
              <span className="task-card-v2-tag-chip" style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>
                +{task.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Linha de Prioridade e Prazo */}
        <div className="task-card-v2-meta-row">
          <span className={`task-priority-pill ${task.priority}`}>
            {priorityLabel[task.priority] || task.priority}
          </span>
          {dateLabel && (
            <span className={`task-card-v2-date ${isOverdue ? 'overdue' : ''}`}>
              {dateLabel}
            </span>
          )}
        </div>

        {/* Linha de Progresso e Responsável */}
        <div className="task-card-v2-progress-row">
          <div className="task-card-v2-progress-bar">
            <div className="task-card-v2-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="task-card-v2-progress-text">{stats.completed}/{stats.total}</span>
          {assigneeInitials && (
            <div
              className="task-card-v2-avatar"
              aria-label={assigneeName || 'Responsável'}
              title={assigneeName || 'Responsável'}
            >
              {assigneeInitials}
            </div>
          )}
        </div>
      </div>

      {/* Faixas de Encaminhamento no Rodapé */}
      {isForwarded && (
        <div
          className="task-card-v2-forward-stripe"
          onClick={e => {
            if (branchTask) {
              e.stopPropagation()
              onTask(branchTask)
            }
          }}
          title={branchTask ? `Encaminhada para ${targetBoardName}. Clique para abrir.` : `Encaminhada para ${targetBoardName}`}
        >
          <span>Encaminhada para {targetBoardName} &rarr;</span>
        </div>
      )}

      {isBranch && (
        <div
          className="task-card-v2-origin-stripe"
          onClick={e => {
            if (originTask) {
              e.stopPropagation()
              onTask(originTask)
            }
          }}
          title={originTask ? `Veio de ${originBoardName}. Clique para abrir original.` : `Veio de ${originBoardName}`}
        >
          <span>&larr; Veio de {originBoardName}</span>
        </div>
      )}
    </div>
  )
}

function Kanban({
  tasks,
  data,
  stages,
  moveTask,
  deleteTask,
  onTask,
  person,
  team,
  canFreeMove=false,
  onForwardTask
}:{
  tasks: Task[]
  data: Data
  stages?: (Stage & { wip_limit?: number | null })[]
  moveTask: (t: Task, id: string) => Promise<void>
  deleteTask?: (t: Task) => Promise<void>
  onTask: (t: Task) => void
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  onForwardTask?: (t: Task) => void
}) {
  const currentStages = stages || data.stages
  const boardStages=[...currentStages].sort((a,b)=>a.position-b.position)
  return <div className="kanban">{boardStages.map(s=>{
    const cards=tasks.filter(t=>t.stage_id===s.id)
    const label=s.name==='Pausado'?'Atividades em pausa':s.name==='Backlog'?'Backlog Desenvolvimento':s.name==='Negociação'?'Negociações':s.name
    const visual = canonicalStageVisuals[label] || canonicalStageVisuals[s.name]
    const dotColor = visual ? visual.dot : (s.color || '#3b82f6')
    const bgColor = visual ? visual.bg : (s.color ? `color-mix(in srgb, ${s.color} 15%, white)` : '#f1f5f9')
    const count = cards.length
    const hasWip = typeof s.wip_limit === 'number' && s.wip_limit > 0
    const isExceeded = hasWip && count > (s.wip_limit as number)
    const isWarning = hasWip && count === (s.wip_limit as number)
    const colWipClass = isExceeded ? 'col-wip-exceeded' : isWarning ? 'col-wip-warning' : ''

    return <div key={s.id} className={`kanban-col ${colWipClass}`} style={{'--stage-color':dotColor, '--stage-bg':bgColor} as CSSProperties} onDragOver={e=>{if(e.dataTransfer.types.includes('text/task-id')) e.preventDefault()}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/task-id');const task=tasks.find(t=>t.id===id);const isAllowed = Boolean(task && (canFreeMove || data.transitions.some(x=>x.from_stage_id===task.stage_id && x.to_stage_id===s.id)));if(task && isAllowed) void moveTask(task,s.id)}}>
      <div className="kanban-head">
        <div className="kanban-head-title">
          <i style={{background:dotColor}}/>
          <strong>{label}</strong>
        </div>
        {hasWip ? (
          <span className={`kanban-counter-badge-dark ${isExceeded ? 'wip-exceeded' : isWarning ? 'wip-warning' : ''}`} style={{ width: 'auto', padding: '0 6px', borderRadius: 10 }} title={`Limite WIP: ${s.wip_limit} (atual: ${count})`}>
            {count}/{s.wip_limit}
          </span>
        ) : (
          <span className="kanban-counter-badge-dark">{count}</span>
        )}
      </div>
      <div className="kanban-cards">{cards.map(t=><TaskCard key={t.id} task={t} data={data} stages={currentStages} onTask={onTask} person={person} team={team} moveTask={moveTask} deleteTask={deleteTask} canFreeMove={canFreeMove} onForwardTask={onForwardTask}/>)}{!cards.length && <div className="kanban-empty"/>}</div>
    </div>
  })}</div>
}
function TaskList({tasks,data,stages,onTask,person,team,client,moveTask,deleteTask,canFreeMove=false}:{tasks:Task[];data:Data;stages?:(Stage & { wip_limit?: number | null; board_id?: string })[];onTask:(t:Task)=>void;person:(id?:string|null)=>Profile|undefined;team:(id:string)=>Team|undefined;client:(id?:string|null)=>Client|undefined;moveTask:(t:Task,id:string)=>Promise<void>;deleteTask?:(t:Task)=>Promise<void>;canFreeMove?:boolean}) {
  const currentStages = stages || data.stages
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Tarefa</th>
            <th>Quadro</th>
            <th>Equipe</th>
            <th>Responsável</th>
            <th>Cliente</th>
            <th>Etapa</th>
            <th>Prioridade</th>
            <th>Prazo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const branchTask = t.forwarded_at ? data.tasks.find(x => x.origin_task_id === t.id) : undefined
            const originTask = t.origin_task_id ? data.tasks.find(x => x.id === t.origin_task_id) : undefined
            const targetBoardName = branchTask
              ? (data.boards.find(b => b.id === (branchTask.board_id || 'board-geral'))?.name || 'Geral')
              : 'Outro quadro'
            const originBoardName = originTask
              ? (data.boards.find(b => b.id === (originTask.board_id || 'board-geral'))?.name || 'Geral')
              : 'Quadro anterior'
            const stageInfo = resolveTaskStage(t, currentStages, data.boardStages)

            return (
              <tr key={t.id}>
                <td>
                  <button className="table-title" onClick={() => onTask(t)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{t.title}</span>
                      {t.forwarded_at && (
                        <span
                          className={`task-card-branch-tag forwarded ${branchTask ? 'clickable' : ''}`}
                          style={{ margin: 0, padding: '1px 6px', fontSize: 11 }}
                          role={branchTask ? 'button' : undefined}
                          tabIndex={branchTask ? 0 : undefined}
                          onClick={e => {
                            if (branchTask) {
                              e.stopPropagation()
                              onTask(branchTask)
                            }
                          }}
                          title={branchTask ? `Encaminhada para ${targetBoardName}. Clique para abrir a ramificação.` : `Encaminhada para ${targetBoardName}`}
                        >
                          <Lock size={10} />
                          <span>Encaminhada para: <strong>{targetBoardName}</strong></span>
                          {branchTask && <span className="branch-tag-arrow">&rarr;</span>}
                        </span>
                      )}
                      {t.origin_task_id && (
                        <span
                          className={`task-card-branch-tag origin ${originTask ? 'clickable' : ''}`}
                          style={{ margin: 0, padding: '1px 6px', fontSize: 11 }}
                          role={originTask ? 'button' : undefined}
                          tabIndex={originTask ? 0 : undefined}
                          onClick={e => {
                            if (originTask) {
                              e.stopPropagation()
                              onTask(originTask)
                            }
                          }}
                          title={originTask ? `Veio de ${originBoardName}. Clique para abrir a tarefa original.` : `Veio de ${originBoardName}`}
                        >
                          <GitBranch size={10} />
                          <span>Veio de: <strong>{originBoardName}</strong></span>
                          {originTask && <span className="branch-tag-arrow">&rarr;</span>}
                        </span>
                      )}
                    </span>
                    <small>#{t.id.slice(0,6).toUpperCase()}</small>
                  </button>
                </td>
                <td>
                  <span className="team-tiny">
                    <FolderKanban size={13} style={{ opacity: 0.7 }} />
                    {t.board_id ? (data.boards.find(b => b.id === t.board_id)?.name || 'Geral') : 'Geral'}
                  </span>
                </td>
                <td><span className="team-tiny"><i style={{background:team(t.team_id)?.color}}/>{team(t.team_id)?.name}</span></td>
                <td>{person(t.assignee_id)?.full_name || '—'}</td>
                <td>{client(t.client_id)?.name || '—'}</td>
                <td><span className="stage-pill" style={{color:stageInfo.color}}>{stageInfo.name}</span></td>
                <td><span className={`priority-badge ${t.priority}`}>{priorityLabel[t.priority]}</span></td>
                <td>{dateBR(t.due_at)}</td>
                <td>
                  <div className="table-actions-cell">
                    <StageMenu task={t} data={data} stages={currentStages} moveTask={moveTask} canFreeMove={canFreeMove}/>
                    {deleteTask && (
                      <button type="button" className="task-delete-icon-btn" onClick={e=>{e.stopPropagation();void deleteTask(t)}} title="Excluir tarefa" aria-label={`Excluir tarefa ${t.title}`}>
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!tasks.length && <Empty text="Nenhuma tarefa corresponde aos filtros."/>}
    </div>
  )
}
function FlowSettings({data,run,onClose}:{data:Data;run:(action:()=>Promise<unknown>,success?:string)=>Promise<boolean>;onClose:()=>void}) {
  const [stageName,setStageName]=useState(''); const [from,setFrom]=useState(data.stages[0]?.id||''); const [to,setTo]=useState(data.stages[1]?.id||''); const [templateStage,setTemplateStage]=useState(data.stages[0]?.id||''); const [template,setTemplate]=useState('')
  return <Modal title="Configurar fluxo" onClose={onClose} wide><div className="flow-settings"><section><h3>Etapas</h3><p>O status final determina se a tarefa está concluída.</p><div className="settings-list">{data.stages.map(s=><div key={s.id}><span className="stage-color" style={{background:s.color}}/><strong>{s.name}</strong><small>{s.is_final?'Final':s.is_pause?'Pausa':`Posição ${s.position}`}</small><label><input type="checkbox" checked={s.is_final} onChange={()=>void run(async()=>{const {error}=await supabase.from('stages').update({is_final:!s.is_final}).eq('id',s.id);if(error)throw error})}/> Final</label></div>)}</div><form className="inline-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('stages').insert({name:stageName,position:Math.max(...data.stages.map(s=>s.position))+1});if(error)throw error;setStageName('')})}}><input required value={stageName} onChange={e=>setStageName(e.target.value)} placeholder="Nova etapa"/><button aria-label="Adicionar etapa"><Plus size={16}/></button></form></section><section><h3>Transições permitidas</h3><p>Movimentos disponíveis no menu e no Kanban.</p><div className="settings-list transitions">{data.transitions.map(t=><div key={`${t.from_stage_id}-${t.to_stage_id}`}><span>{data.stages.find(s=>s.id===t.from_stage_id)?.name} <ArrowRight size={13}/> {data.stages.find(s=>s.id===t.to_stage_id)?.name}</span><button onClick={()=>void run(async()=>{const {error}=await supabase.from('stage_transitions').delete().eq('from_stage_id',t.from_stage_id).eq('to_stage_id',t.to_stage_id);if(error)throw error})}><X size={14}/></button></div>)}</div><form className="settings-add" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('stage_transitions').insert({from_stage_id:from,to_stage_id:to});if(error)throw error})}}><select value={from} onChange={e=>setFrom(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ArrowRight size={15}/><select value={to} onChange={e=>setTo(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button><Plus size={17}/></button></form><h3>Templates de subtarefas</h3><div className="settings-list transitions">{data.templates.map(x=><div key={x.id}><span>{data.stages.find(s=>s.id===x.stage_id)?.name} · {x.title}</span><button onClick={()=>void run(async()=>{const {error}=await supabase.from('subtask_templates').delete().eq('id',x.id);if(error)throw error})}><X size={14}/></button></div>)}</div><form className="settings-add" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('subtask_templates').insert({stage_id:templateStage,title:template,position:data.templates.filter(x=>x.stage_id===templateStage).length+1});if(error)throw error;setTemplate('')})}}><select value={templateStage} onChange={e=>setTemplateStage(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input required value={template} onChange={e=>setTemplate(e.target.value)} placeholder="Subtarefa padrão"/><button><Plus size={17}/></button></form></section></div></Modal>
}








