import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, ArrowDown, ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2, CircleHelp, ClipboardList, FolderKanban, GitBranch, Layers, LayoutDashboard, List, Lock, LockKeyhole, LogOut, Menu, MessageCircle, Moon, MoreHorizontal, Paperclip, Plus, Search, Send, Settings2, ShieldCheck, Sun, Tags, Trash2, Users, X, Zap } from 'lucide-react'
import type { CSSProperties } from 'react'
import { supabase, configured, completed, dateBR, timeBR, todayISO, taskBuckets, messageError, unreadMessageCounts, isNetworkError } from './lib'
import type { Attachment, Board, BoardStage, Channel, Checklist, ChecklistTemplateGroup, ChecklistTemplateItem, Client, ClientRegistrationLink, ClientRegistrationSubmission, Member, Message, Profile, Read, Sprint, Stage, Tag, Task, Team, Template, Transition } from './lib'
import { demoData, initialDemoChecklists } from './demo'
import { clearUserDrafts } from './drafts'
import NewTaskForm from './NewTaskForm'
import TemplateEditor from './TemplateEditor'
import TemplateTab from './TemplateTab'
import TagEditor from './TagEditor'
import TagTab from './TagTab'
import TaskDetailModal from './TaskDetail'
import FlowTab from './FlowTab'
import StageManager from './StageManager'
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
  getStagesForBoard,
  getUserBoardTabsOrder,
  getUserConsolidatedExpanded,
  getUserGeneralMode,
  getUserLateralBlockOrder,
  setUserBoardTabsOrder,
  setUserConsolidatedExpanded,
  setUserGeneralMode,
  setUserLateralBlockOrder,
} from './general-views'
import { GeneralAccordionView, GeneralLateralView, GeneralToolbar } from './GeneralViews'
import Dashboard from './Dashboard'
import './dashboard.css'
import PasswordInput from './PasswordInput'

const ReportsPage = lazy(() => import('./ReportsPage'))
const ClientsPage = lazy(() => import('./AdminPages').then(m => ({ default: m.ClientsPage })))
const TeamsPage = lazy(() => import('./AdminPages').then(m => ({ default: m.TeamsPage })))
const UsersPage = lazy(() => import('./AdminPages').then(m => ({ default: m.UsersPage })))
const UserSettings = lazy(() => import('./UserSettings'))

export type Page = 'dashboard' | 'reports' | 'tasks' | 'completed' | 'chat' | 'clients' | 'teams' | 'users' | 'settings'
export type DashboardFilter = 'mine' | 'overdue' | 'soon' | 'blocked' | 'week' | null
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
  registrationLinks?: ClientRegistrationLink[]
  registrationSubmissions?: ClientRegistrationSubmission[]
}
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
  const [page, setPage] = useState<Page>(()=>{if(!demoMode)return 'dashboard';const requested=new URLSearchParams(window.location.search).get('pagina');const allowed:Page[]=['dashboard','reports','tasks','completed','chat','clients','teams','users','settings'];return allowed.includes(requested as Page)?requested as Page:'tasks'})
  const [mobileNav, setMobileNav] = useState(false)
  const [theme, setTheme] = useState<'dark'|'light'>(()=>document.documentElement.dataset.theme==='light'?'light':'dark')
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(demoMode ? demoData.tasks.find(task=>task.id===new URLSearchParams(window.location.search).get('tarefa'))||null : null)
  const [forwardingTask, setForwardingTask] = useState<Task | null>(null)
  const [forwardingTasks, setForwardingTasks] = useState<Task[] | null>(null)
  const [demoChecklists,setDemoChecklists] = useState<Record<string,Checklist[]>>(initialDemoChecklists)
  const [newTask, setNewTask] = useState(demoMode && new URLSearchParams(window.location.search).has('nova-tarefa'))
  const [taskView, setTaskView] = useState<'kanban'|'lista'|'backlog'|'sprint'>('kanban')
  const [activeBoardId, setActiveBoardId] = useState<string>(() => {
    try { return localStorage.getItem('somax_active_board') || 'board-geral' } catch { return 'board-geral' }
  })
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const [showSprintPlan, setShowSprintPlan] = useState(false)
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false)
  const [showBurndownModal, setShowBurndownModal] = useState(false)
  const [showCompleteSprintModal, setShowCompleteSprintModal] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [taskTab, setTaskTab] = useState<'tarefas'|'fluxos'|'templates'|'tags'>(()=>{const value=demoMode?new URLSearchParams(window.location.search).get('aba'):null;return value==='fluxos'||value==='templates'||value==='tags'?value:'tarefas'})
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
  const [boardTabsOrder, setBoardTabsOrder] = useState<string[]>([])
  const [dragOverTabInfo, setDragOverTabInfo] = useState<{ id: string; side: 'left' | 'right' } | null>(null)

  const currentUserIdRef = useRef<string | null>(null)
  const isManualSignOutRef = useRef<boolean>(false)
  const latestFetchIdRef = useRef(0)

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('somax-hub-theme',theme)},[theme])

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
    const [metaResults, tasksResult, clientsResult] = await Promise.all([
      Promise.all(tables.map(name => supabase.from(name).select('*'))),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('clients').select('*').order('name', { ascending: true }).limit(50),
    ])

    if (fetchId !== latestFetchIdRef.current) return

    const failedMeta = metaResults.find(r => r.error)
    if (failedMeta?.error) throw failedMeta.error
    if (tasksResult.error) throw tasksResult.error
    if (clientsResult.error) throw clientsResult.error

    const [profiles,teams,members,stages,transitions,templates,templateGroups,templateItems,tags,channels,reads,boards,boardStages,sprints] = metaResults.map(r => r.data || [])
    const tasks = (tasksResult.data || []) as Task[]
    const clients = (clientsResult.data || []) as Client[]

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
      try { localStorage.setItem('somax_active_board', activeBoardId) } catch {}
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
  const stage = (id: string) => data.stages.find(s => s.id === id)
  const team = (id: string) => data.teams.find(t => t.id === id)
  const person = (id?: string | null) => data.profiles.find(p => p.id === id)
  const client = (id?: string | null) => data.clients.find(c => c.id === id)
  const canManageTeam = (id: string) => !demoMode && (profile?.role === 'administrador' || data.members.some(m => m.team_id === id && m.user_id === profile?.id && m.active && m.is_manager))
  const canAdmin = !demoMode && profile?.role === 'administrador'
  const canMaster = demoMode || Boolean(profile?.is_master)
  const canCreateBoard = Boolean(canAdmin || (demoMode && (!profile || profile.role === 'administrador')) || data.members.some(m => m.user_id === profile?.id && m.active && m.is_manager))

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
    }
  }, [profile?.id, defaultTabIds])

  useEffect(() => {
    const ids = generalBoards.map(b => b.id)
    setGeneralBlockOrder(getUserLateralBlockOrder(profile?.id, ids))
    setGeneralExpandedAccordions(getUserConsolidatedExpanded(profile?.id, ids))
  }, [profile?.id, generalBoards])

  function handleGeneralModeChange(newMode: GeneralViewMode) {
    setGeneralMode(newMode)
    setUserGeneralMode(profile?.id, newMode)
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
  const dashboard = useMemo(() => taskBuckets(data.tasks, data.stages, profile?.id), [data, profile])
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
  const saveDemoTemplate = (group:ChecklistTemplateGroup|null,name:string,description:string,items:string[]) => {
    setData(prev=>{const id=group?.id||crypto.randomUUID();const saved:ChecklistTemplateGroup={id,name,description:description||null,position:group?.position??prev.templateGroups.length+1};const templateGroups=group?prev.templateGroups.map(item=>item.id===id?saved:item):[...prev.templateGroups,saved];const templateItems:ChecklistTemplateItem[]=[...prev.templateItems.filter(item=>item.group_id!==id),...items.map((title,index)=>({id:crypto.randomUUID(),group_id:id,title,position:index+1}))];return {...prev,templateGroups,templateItems}})
    flash(group?'Template atualizado na prévia local':'Template criado na prévia local')
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
          {/* Card Canônico Geral */}
          <div
            className="my-board-card is-canonical is-clickable"
            onClick={() => setActiveBoardId('board-geral')}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActiveBoardId('board-geral') }}
            aria-label="Abrir quadro Geral"
          >
            <div className="my-board-card-header">
              <div className="my-board-title-row">
                <FolderKanban size={16} />
                <h3>Geral</h3>
                <span className="badge-type canonical">Canônico</span>
                <span className="badge-methodology">Kanban</span>
              </div>
              <p>Quadro canônico oficial da Somax com todas as 15 etapas.</p>
            </div>

            {/* Miniatura com as colunas do quadro Geral */}
            <div className="my-board-columns-preview" title="Etapas do quadro Geral">
              {data.stages.slice(0, 5).map(stg => {
                const visual = canonicalStageVisuals[stg.name]
                const dotColor = visual ? visual.dot : (stg.color || '#3b82f6')
                return (
                  <span key={stg.id} className="my-board-mini-col">
                    <i style={{ background: dotColor }} />
                    <span>{stg.name}</span>
                  </span>
                )
              })}
              {data.stages.length > 5 && (
                <span className="my-board-mini-col more">
                  +{data.stages.length - 5} etapas
                </span>
              )}
            </div>

            <div className="my-board-card-metrics">
              <span>{data.tasks.filter(t => !t.board_id || t.board_id === 'board-geral').length} tarefas</span>
              <span>&bull;</span>
              <span>{data.stages.length} etapas</span>
              <span>&bull;</span>
              <span className="badge-scope">Corporativo</span>
            </div>

            <div className="my-board-card-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={e => {
                  e.stopPropagation()
                  setActiveBoardId('board-geral')
                }}
              >
                Acessar quadro <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Cards dos quadros e visões do usuário */}
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
              <small>Criar colunas próprias ou espelhar etapas do Geral</small>
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
        <button className={taskTab==='fluxos'?'active':''} onClick={()=>setTaskTab('fluxos')}><Activity size={15}/> Fluxos</button>
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
                  <div key="board-geral" style={{ display: 'inline-flex', alignItems: 'center' }}>
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
                      <FolderKanban size={13} />
                      <span>Geral</span>
                      <span className="board-tab-tag">Canônico</span>
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
                  <div key="tab-meus-quadros" style={{ display: 'inline-flex', alignItems: 'center' }}>
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
                <div key={b.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
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
                    {b.type === 'sector_view' ? <Layers size={13} /> : <FolderKanban size={13} />}
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
            {/* Controles da visão Geral (Lateral vs Consolidado) */}
            <GeneralToolbar
              mode={generalMode}
              situation={generalSituation}
              selectedBoardId={generalBoardFilter}
              boards={generalBoards}
              onModeChange={handleGeneralModeChange}
              onSituationChange={setGeneralSituation}
              onBoardFilterChange={setGeneralBoardFilter}
            />

            {/* Filtros de busca compartilhados */}
            <div className="task-tools">
              <div className="search">
                <Search size={17} />
                <input placeholder="Buscar tarefas em todos os quadros..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
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
                moveTask={moveTask}
                deleteTask={deleteTask}
                person={person}
                team={team}
                canFreeMove={canFreeMove}
                notify={flash}
                allTasks={data.tasks}
                allBoards={data.boards}
                allClients={data.clients}
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
      {taskTab==='fluxos' && <><div className="flow-toolbar">{(canAdmin || demoMode) && <StageManager data={data} preview={demoMode} setData={setData} run={run} />}{canAdmin&&<Button variant="secondary" onClick={()=>setShowFlowSettings(true)}><Settings2 size={15}/> Configurar etapas e subtarefas</Button>}</div><FlowTab data={data} canManage={canAdmin||demoMode} preview={demoMode} setData={setData} run={run}/></>}
      {taskTab==='templates' && <TemplateTab data={data} canManage={canAdmin||demoMode} onCreate={()=>setEditingTemplate(null)} onEdit={setEditingTemplate} onDelete={group=>void deleteTemplate(group)}/>}
      {taskTab==='tags' && <TagTab data={data} canManage={canAdmin||demoMode} onCreate={()=>setEditingTag(null)} onEdit={setEditingTag} onDelete={tag=>void deleteTag(tag)} onSelect={tag=>{setQuery(tag.name);setTaskTab('tarefas')}}/>}
    </section>
  }
  const renderCompleted = () => {
    const finished = data.tasks.filter(t => {
      const isDone = completed(t, allStages) || Boolean(t.completed_at)
      if (!isDone) return false

      if (completedBoardFilter) {
        if (completedBoardFilter === 'board-geral') {
          if (t.board_id && t.board_id !== 'board-geral') return false
        } else {
          if (t.board_id !== completedBoardFilter) return false
        }
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
            <option value="board-geral">Geral (Canônico)</option>
            {data.boards.filter(b => b.id !== 'board-geral').map(b => (
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
      <div className="brand"><strong className="brand-wordmark">SOMAX<span> HUB</span></strong></div>
      <div className="nav-label">Menu</div>
      <nav>{nav.filter(item=>!['teams','users','settings'].includes(item.page)).map(item => <button key={item.page} onClick={() => { setPage(item.page); setMobileNav(false); if(item.page==='tasks')setTaskTab('tarefas') }} className={`nav-item ${page===item.page?'active':''}`}><item.icon size={17}/><span>{item.label}</span>{item.page==='chat' && !demoMode && <ChatBadge data={data} userId={profile?.id} />}</button>)}</nav>
      <div className="nav-label nav-admin">Administração</div>
      <nav>{nav.filter(item=>['teams','users'].includes(item.page)).map(item => <button key={item.page} onClick={() => { setPage(item.page); setMobileNav(false) }} className={`nav-item ${page===item.page?'active':''}`}><item.icon size={17}/><span>{item.label}</span></button>)}</nav>
      <div className="nav-label nav-admin">Minha conta</div>
      <nav><button onClick={() => { setPage('settings'); setMobileNav(false) }} className={`nav-item ${page==='settings'?'active':''}`}><Settings2 size={17}/><span>Configurações</span></button></nav>
      <div className="sidebar-bottom"><button className="theme-toggle" onClick={()=>setTheme(current=>current==='dark'?'light':'dark')} aria-label={theme==='dark'?'Ativar modo claro':'Ativar modo escuro'}>{theme==='dark'?<Sun size={15}/>:<Moon size={15}/>}<span>{theme==='dark'?'Modo Claro':'Modo Escuro'}</span></button><div className="sidebar-account"><button className="user-card" onClick={() => {setPage('settings');setMobileNav(false)}} aria-label="Abrir meu perfil"><div className="avatar">{initials(profile?.full_name || session.user.email || 'U')}</div><span><strong>{profile?.full_name || session.user.email}</strong><small>{profile?.is_master?'Administrador master':profile?.role || 'Usuário'}</small></span></button><button className="account-signout" onClick={()=>void handleSignOut()} aria-label="Sair da conta" title="Sair da conta"><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Abrir menu"><Menu size={21}/></button><div className="breadcrumb">Somax <span>/</span> <strong>{nav.find(n=>n.page===page)?.label}</strong></div><div className="topbar-right"><div className="topbar-date"><CalendarDays size={16}/>{new Intl.DateTimeFormat('pt-BR', {day:'numeric',month:'long',year:'numeric'}).format(new Date())}</div><button className="icon-btn" aria-label="Notificações" onClick={() => setPage('chat')}><Bell size={19}/></button><div className="avatar avatar-sm">{initials(profile?.full_name || 'U')}</div></div></header>
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
      {page==='chat' && (demoMode ? <DemoChat data={data}/> : <Chat data={data} session={session} reload={reload} setError={setError} flash={flash} canManageTeam={canManageTeam} onTask={setSelectedTask}/ >)}
      <Suspense fallback={<div className="page-loading">Carregando...</div>}>
        {page==='clients' && <ClientsPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} hasMore={hasMoreClients} loadMore={loadMoreClients} loadingMore={loadingMoreClients} userId={session.user.id}/ >}
        {page==='teams' && <TeamsPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} userId={session.user.id}/ >}
        {page==='users' && <UsersPage data={data} canAdmin={Boolean(canAdmin||demoMode)} canMaster={canMaster} currentUserId={session.user.id} canManageTeam={canManageTeam} preview={demoMode} setData={setData} run={run} notify={flash} setError={setError} onUserSaved={saved=>{if(saved.id===session.user.id)setProfile(saved)}}/ >}
        {page==='settings' && <UserSettings key={session.user.id} profile={profile} email={session.user.email||''} teams={data.teams.filter(team=>data.members.some(member=>member.team_id===team.id&&member.user_id===session.user.id&&member.active)).map(team=>team.name)} preview={demoMode} theme={theme} onThemeChange={setTheme} onProfileSaved={saved=>{setProfile(saved);setData(current=>({...current,profiles:current.profiles.map(person=>person.id===saved.id?saved:person)}))}} notify={flash}/ >}
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
    {showCreateBoard && (
      <CreateBoardModal
        data={data}
        userId={session.user.id}
        canAdmin={Boolean(canAdmin || demoMode)}
        onClose={() => setShowCreateBoard(false)}
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
  return <div className="login-screen"><div className="login-brand"><div className="brand-mark">S</div><strong>somax<span>hub</span></strong></div><div className="login-panel"><div className="eyebrow">BEM-VINDO DE VOLTA</div><h1>Seu trabalho flui melhor aqui.</h1><p>{preview?'Explore o painel com uma conta fictícia de administrador master.':'Entre com a conta criada pela Somax.'}</p>{preview?<div className="login-demo"><strong>Prévia local</strong><p>Sem autenticação real ou dados persistidos. Acesso de demonstração.</p><Button onClick={onPreviewLogin} className="full">Entrar na prévia <ArrowRight size={17}/></Button></div>:<form onSubmit={submit}><Field label="E-mail"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@somax.com.br" autoComplete="username"/></Field><Field label="Senha"><PasswordInput required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha" autoComplete="current-password"/></Field>{!preview && <div className="forgot-link">{forgotSent ? <span>E-mail de recuperação enviado!</span> : <button type="button" onClick={() => void forgotPassword()} disabled={!email.trim() || busy}>Esqueci minha senha</button>}</div>}{error && <div className="form-error">{error}</div>}<Button type="submit" disabled={busy} className="full">{busy?'Entrando...':'Entrar no hub'} <ArrowRight size={17}/></Button></form>}<small>{preview?'Configure o Supabase para usar sua conta real.':'Acesso restrito a usuários cadastrados.'}</small></div><div className="login-decoration"><div className="decoration-card"><span>✳  SOMAX HUB</span><h2>Projetos claros.<br/>Conversas em dia.<br/>Equipe conectada.</h2><div className="decoration-circles"><i/><i/><i/></div></div></div></div>
}
function SetPassword() {
  const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
  async function submit(e:FormEvent){e.preventDefault();if(password!==confirm){setError('As senhas não coincidem.');return}if(password.length<8){setError('Use ao menos 8 caracteres.');return}setBusy(true);const {error}=await supabase.auth.updateUser({password,data:{must_set_password:false}});if(error)setError(error.message);setBusy(false)}
  return <div className="setup-screen"><div className="setup-card"><div className="brand-mark">S</div><h1>Ative sua conta</h1><p>Troque a senha temporária recebida da Somax para continuar.</p><form className="stack-form" onSubmit={e=>void submit(e)}><Field label="Nova senha"><PasswordInput required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></Field><Field label="Confirmar senha"><PasswordInput required value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></Field>{error&&<div className="form-error">{error}</div>}<Button type="submit" disabled={busy}>{busy?'Salvando...':'Ativar conta'}</Button></form></div></div>
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
  const current = currentStages.find(s => s.id === task.stage_id)
  const isFinal = Boolean(current?.is_final)
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

  const isOverdue = Boolean(task.due_at && !task.completed_at && new Date(task.due_at) < new Date(new Date().setHours(0,0,0,0)))

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
                <td><span className="stage-pill" style={{color:currentStages.find(s=>s.id===t.stage_id)?.color}}>{currentStages.find(s=>s.id===t.stage_id)?.name}</span></td>
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
function ChatBadge({data,userId}:{data:Data;userId?:string}) {
  const [count,setCount]=useState(0)
  useEffect(()=>{if(!userId)return;let live=true;const update=async()=>{try{const counts=await unreadMessageCounts();if(live)setCount(Object.values(counts).reduce((total,value)=>total+value,0))}catch{/* o chat ainda calcula suas contagens locais */}};void update();const sub=supabase.channel('chat-badge').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},()=>void update()).subscribe();return()=>{live=false;void supabase.removeChannel(sub)}},[data.channels,userId])
  return count>0?<span className="nav-badge">{count>99?'99+':count}</span>:null
}
function DemoChat({data}:{data:Data}) {
  const [channelId,setChannelId]=useState(data.channels[0]?.id||'')
  const [body,setBody]=useState('')
  const [search,setSearch]=useState('')
  const [messages,setMessages]=useState<Record<string,{id:string;author:string;body:string;time:string}[]>>({
    'channel-comercial':[
      {id:'1',author:'Bruno Costa',body:'Bom dia, equipe! A proposta da Nuvem Norte está pronta para revisão.',time:'09:12'},
      {id:'2',author:'Ana Ribeiro',body:'Ótimo, @Bruno. Vou revisar ainda hoje.',time:'09:18'},
    ],
    'channel-desenvolvimento':[
      {id:'3',author:'Diego Ferreira',body:'O portal da Aurora está avançando. Vamos alinhar a integração no kick-off.',time:'10:24'},
      {id:'4',author:'Camila Martins',body:'Perfeito! Já deixei o checklist atualizado na tarefa.',time:'10:31'},
    ],
    'channel-design':[
      {id:'5',author:'Elisa Souza',body:'As primeiras imagens da campanha Verdejar estão em revisão.',time:'11:05'},
    ],
    'channel-financeiro':[
      {id:'6',author:'Ana Ribeiro',body:'Precisamos conferir os dados de faturamento da Aurora até sexta.',time:'14:40'},
    ],
  })
  const channel=data.channels.find(c=>c.id===channelId)
  const currentMessages = messages[channelId] || []
  const filteredMessages = currentMessages.filter(m => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return m.body.toLowerCase().includes(q) || m.author.toLowerCase().includes(q)
  })
  function send(e:FormEvent){e.preventDefault();if(!body.trim())return;setMessages(prev=>({...prev,[channelId]:[...(prev[channelId]||[]),{id:crypto.randomUUID(),author:'Ana Ribeiro',body:body.trim(),time:new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}]}));setBody('')}
  return <div className="chat-page"><div className="chat-sidebar"><div className="chat-side-head"><div className="eyebrow">COMUNICAÇÃO</div><h1>Chat</h1><p>Conversas do seu time</p></div>{data.teams.map(team=><div className="channel-group" key={team.id}><div className="channel-team"><i style={{background:team.color}}/>{team.name}</div>{data.channels.filter(c=>c.team_id===team.id).map(c=><button key={c.id} className={`channel-item ${channelId===c.id?'selected':''}`} onClick={()=>setChannelId(c.id)}><span>#</span>{c.name}</button>)}</div>)}</div><div className="conversation"><div className="conversation-head"><div className="conversation-head-left"><div className="channel-hash">#</div><div><strong>{channel?.name}</strong><span>{data.teams.find(t=>t.id===channel?.team_id)?.name} · canal privado</span></div><LockKeyhole size={16}/></div><div className="chat-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mensagens..." aria-label="Buscar mensagens"/>{search&&<button type="button" onClick={()=>setSearch('')} aria-label="Limpar busca"><X size={13}/></button>}</div></div><div className="messages"><div className="messages-inner"><div className="demo-chat-intro">Este é o início da conversa em <strong>#{channel?.name}</strong>.</div>{search&&filteredMessages.length===0?<div className="chat-search-empty"><p>Nenhuma mensagem encontrada para "{search}".</p></div>:filteredMessages.map(m=><div className="message" key={m.id}><div className="avatar avatar-xs">{initials(m.author)}</div><div className="message-content"><div className="message-meta"><strong>{m.author}</strong><time>{m.time}</time></div><div className="message-bubble">{m.body}</div></div></div>)}</div></div><form className="composer" onSubmit={send}><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={`Mensagem em #${channel?.name}...`} rows={2}/><div className="composer-actions"><span className="demo-composer-note">Mensagens desta prévia ficam só nesta página.</span><Button type="submit" disabled={!body.trim()}>Enviar <Send size={15}/></Button></div></form></div></div>
}
function Chat({data,session,reload,setError,flash,canManageTeam,onTask}:{data:Data;session:Session;reload:()=>Promise<void>;setError:(x:string)=>void;flash:(x:string)=>void;canManageTeam:(id:string)=>boolean;onTask:(t:Task)=>void}) {
  const [channelId,setChannelId]=useState(''); const [messages,setMessages]=useState<Message[]>([]); const [attachments,setAttachments]=useState<Attachment[]>([]); const [body,setBody]=useState(''); const [search,setSearch]=useState(''); const [reply,setReply]=useState<Message|null>(null); const [linkTask,setLinkTask]=useState(''); const [file,setFile]=useState<File|null>(null); const [sending,setSending]=useState(false); const [hasMore,setHasMore]=useState(true); const [unread,setUnread]=useState<Record<string,number>>({}); const [creating,setCreating]=useState(false); const [newChannel,setNewChannel]=useState(''); const [mentionOpen,setMentionOpen]=useState(false); const bottomRef=useRef<HTMLDivElement>(null); const fileRef=useRef<HTMLInputElement>(null); const latestRef=useRef(''); const channelIdRef=useRef(channelId);channelIdRef.current=channelId
  useEffect(()=>{if(!data.channels.some(c=>c.id===channelId))setChannelId(data.channels[0]?.id||'')},[data.channels,channelId])
  const channel=data.channels.find(c=>c.id===channelId)
  const teamUsers=data.members.filter(m=>m.team_id===channel?.team_id&&m.active).map(m=>data.profiles.find(p=>p.id===m.user_id)).filter((p):p is Profile=>Boolean(p))
  const merge=(items:Message[])=>setMessages(prev=>{const map=new Map([...prev,...items].map(x=>[x.id,x]));return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))})
  const filteredMessages = messages.filter(m => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const author = data.profiles.find(p=>p.id===m.author_id)?.full_name?.toLowerCase() || ''
    const matchAttachment = attachments.some(a => a.message_id === m.id && a.file_name.toLowerCase().includes(q))
    return m.body.toLowerCase().includes(q) || author.includes(q) || matchAttachment
  })
  const loadAttachments=useCallback(async(ids:string[])=>{if(!ids.length)return;const {data:rows,error}=await supabase.from('attachments').select('*').in('message_id',ids);if(error){setError(error.message);return}setAttachments(prev=>{const map=new Map([...prev,...((rows||[]) as Attachment[])].map(x=>[x.id,x]));return [...map.values()]})},[setError])
  const markRead=useCallback(async(id:string)=>{const {error}=await supabase.from('message_reads').upsert({channel_id:id,user_id:session.user.id,last_read_at:new Date().toISOString()},{onConflict:'channel_id,user_id'});if(!error)setUnread(prev=>({...prev,[id]:0}))},[session.user.id])
  const loadLatest=useCallback(async(id:string,incremental=false)=>{
    let items:Message[]=[]
    if(incremental){
      const cursor=latestRef.current
      let offset=0
      while(true){
        let q=supabase.from('messages').select('*').eq('channel_id',id).order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+99)
        if(cursor)q=q.gte('created_at',cursor)
        const {data:rows,error}=await q
        if(error){setError(error.message);return}
        const batch=(rows||[]) as Message[]
        items=items.concat(batch)
        if(batch.length<100)break
        offset+=100
      }
    }else{
      const {data:rows,error}=await supabase.from('messages').select('*').eq('channel_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30)
      if(error){setError(error.message);return}
      items=(rows||[]) as Message[]
    }
    if(channelIdRef.current!==id)return
    if(incremental)merge(items)
    else{setMessages(items.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)));setHasMore(items.length===30)}
    const max=items.map(x=>x.created_at).sort().at(-1)
    if(max&&max>latestRef.current)latestRef.current=max
    void loadAttachments(items.map(x=>x.id))
    void markRead(id)
  },[loadAttachments,markRead,setError])
  useEffect(()=>{if(!channelId)return;setMessages([]);setAttachments([]);setHasMore(true);latestRef.current='';void loadLatest(channelId);const subscription=supabase.channel(`chat-${channelId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`channel_id=eq.${channelId}`},payload=>{const incoming=payload.new as Message;merge([incoming]);if(incoming.created_at>latestRef.current)latestRef.current=incoming.created_at;void loadAttachments([incoming.id]);void markRead(channelId)}).on('postgres_changes',{event:'INSERT',schema:'public',table:'attachments'},payload=>{void loadAttachments([(payload.new as Attachment).message_id])}).subscribe(status=>{if(status==='SUBSCRIBED')void loadLatest(channelId,true)});const online=()=>void loadLatest(channelId,true);window.addEventListener('online',online);return()=>{window.removeEventListener('online',online);void supabase.removeChannel(subscription)}},[channelId,loadLatest,loadAttachments,markRead])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages.length,channelId])
  useEffect(()=>{let alive=true;const update=async()=>{try{const counts=await unreadMessageCounts();if(alive)setUnread(counts)}catch(error){if(alive)setError(messageError(error))}};void update();return()=>{alive=false}},[data.channels,session.user.id,setError])
  async function older(){if(!channelId||!messages.length)return;const first=messages[0];const {data:rows,error}=await supabase.from('messages').select('*').eq('channel_id',channelId).lt('created_at',first.created_at).order('created_at',{ascending:false}).limit(30);if(error){setError(error.message);return}const items=(rows||[]) as Message[];setHasMore(items.length===30);merge(items);void loadAttachments(items.map(x=>x.id))}
  async function send(e:FormEvent){
    e.preventDefault()
    if((!body.trim()&&!linkTask&&!file)||!channelId||sending)return
    if(file&&file.size>10*1024*1024){setError('O anexo deve ter até 10 MB.');return}
    setSending(true)
    let saved=false
    let uploadedPath=''
    try{
      const {data:created,error}=await supabase.from('messages').insert({channel_id:channelId,author_id:session.user.id,body:body.trim()||(file?`📎 ${file.name}`:''),reply_to_id:reply?.id||null,task_id:linkTask||null}).select('*').single()
      if(error)throw error
      saved=true
      merge([created as Message])
      if(created.created_at>latestRef.current)latestRef.current=created.created_at
      setBody('');setReply(null);setLinkTask('')
      await markRead(channelId)
      if(file){
        const path=`${session.user.id}/${channelId}/${created.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g,'_')}`
        const upload=await supabase.storage.from('chat-private').upload(path,file,{contentType:file.type,upsert:false})
        if(upload.error)throw upload.error
        uploadedPath=path
        const {data:attachment,error:attachError}=await supabase.from('attachments').insert({message_id:created.id,uploader_id:session.user.id,storage_path:path,file_name:file.name,content_type:file.type,size_bytes:file.size}).select('*').single()
        if(attachError)throw attachError
        setAttachments(prev=>[...prev,attachment as Attachment]);setFile(null)
      }
    }catch(err){
      if(uploadedPath)void supabase.storage.from('chat-private').remove([uploadedPath])
      setError(`${saved?'Mensagem salva, mas o anexo falhou':'Não foi possível enviar'}: ${messageError(err)}`)
      if(saved)setFile(null)
    }finally{setSending(false)}
  }
  async function openAttachment(a:Attachment){const {data:link,error}=await supabase.storage.from('chat-private').createSignedUrl(a.storage_path,60);if(error){setError(error.message);return}window.open(link.signedUrl,'_blank','noopener,noreferrer')}
  async function createChannel(e:FormEvent){e.preventDefault();if(!channel||!newChannel.trim())return;const {error}=await supabase.from('channels').insert({team_id:channel.team_id,name:newChannel.trim(),created_by:session.user.id});if(error){setError(error.message);return}setCreating(false);setNewChannel('');await reload();flash('Canal criado')}
  function renderText(text:string){return text.split(/(@[\p{L}\p{N}_]+)/gu).map((part,i)=>part.startsWith('@')?<mark key={i}>{part}</mark>:part)}
  return <div className="chat-page"><div className="chat-sidebar"><div className="chat-side-head"><div className="eyebrow">COMUNICAÇÃO</div><h1>Chat</h1><p>Conversas do seu time</p></div>{data.teams.filter(t=>data.channels.some(c=>c.team_id===t.id)).map(t=><div className="channel-group" key={t.id}><div className="channel-team"><i style={{background:t.color}}/>{t.name}{canManageTeam(t.id)&&<button onClick={()=>{setChannelId(data.channels.find(c=>c.team_id===t.id)?.id||'');setCreating(true)}} aria-label={`Criar canal em ${t.name}`}><Plus size={15}/></button>}</div>{data.channels.filter(c=>c.team_id===t.id).map(c=><button key={c.id} className={`channel-item ${channelId===c.id?'selected':''}`} onClick={()=>setChannelId(c.id)}><span>#</span>{c.name}{unread[c.id]>0&&<b>{unread[c.id]}</b>}</button>)}</div>)}</div><div className="conversation">{channel?<><div className="conversation-head"><div className="conversation-head-left"><div className="channel-hash">#</div><div><strong>{channel.name}</strong><span>{data.teams.find(x=>x.id===channel.team_id)?.name} · canal privado</span></div><LockKeyhole size={16}/></div><div className="chat-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar mensagens..." aria-label="Buscar mensagens"/>{search&&<button type="button" onClick={()=>setSearch('')} aria-label="Limpar busca"><X size={13}/></button>}</div></div><div className="messages"><div className="messages-inner">{hasMore&&messages.length>0&&<button className="older" onClick={()=>void older()}><ArrowDown size={15}/> Carregar mensagens anteriores</button>}{search&&filteredMessages.length===0?<div className="chat-search-empty"><p>Nenhuma mensagem encontrada para "{search}".</p></div>:filteredMessages.map(m=>{const author=data.profiles.find(p=>p.id===m.author_id);const linked=data.tasks.find(t=>t.id===m.task_id);const replied=messages.find(x=>x.id===m.reply_to_id);return <div className={`message ${m.author_id===session.user.id?'mine':''}`} key={m.id}><div className="avatar avatar-xs">{initials(author?.full_name||'?')}</div><div className="message-content"><div className="message-meta"><strong>{author?.full_name||'Usuário'}</strong><time>{timeBR(m.created_at)}</time></div>{replied&&<div className="reply-preview">↳ {data.profiles.find(p=>p.id===replied.author_id)?.full_name}: {replied.body.slice(0,90)}</div>}<div className="message-bubble">{renderText(m.body)}</div>{linked&&<button className="linked-task" onClick={()=>onTask(linked)}><ClipboardList size={15}/>{linked.title}<ArrowRight size={14}/></button>}{attachments.filter(a=>a.message_id===m.id).map(a=><button key={a.id} className="attachment-link" onClick={()=>void openAttachment(a)}><Paperclip size={14}/>{a.file_name}</button>)}<button className="reply-action" onClick={()=>setReply(m)}>Responder</button></div></div>})}<div ref={bottomRef}/></div></div><form className="composer" onSubmit={e=>void send(e)}>{reply&&<div className="composer-context">Respondendo a {data.profiles.find(p=>p.id===reply.author_id)?.full_name}: {reply.body.slice(0,60)}<button type="button" onClick={()=>setReply(null)}><X size={14}/></button></div>}{linkTask&&<div className="composer-context">Tarefa: {data.tasks.find(t=>t.id===linkTask)?.title}<button type="button" onClick={()=>setLinkTask('')}><X size={14}/></button></div>}{file&&<div className="composer-context"><Paperclip size={14}/>{file.name}<button type="button" onClick={()=>setFile(null)}><X size={14}/></button></div>}<textarea value={body} onChange={e=>{setBody(e.target.value);setMentionOpen(/@[^\s@]*$/.test(e.target.value))}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e as unknown as FormEvent)}}} placeholder={`Mensagem em #${channel.name}...`} rows={2}/>{mentionOpen&&<div className="mention-list">{teamUsers.filter(p=>p.full_name.toLowerCase().includes(body.split('@').at(-1)?.toLowerCase()||'')).slice(0,5).map(p=><button type="button" key={p.id} onClick={()=>{setBody(body.replace(/@[^\s@]*$/,'@'+p.full_name.replace(/\s+/g,'_')+' '));setMentionOpen(false)}}>@{p.full_name}</button>)}</div>}<div className="composer-actions"><div><input ref={fileRef} type="file" hidden onChange={e=>setFile(e.target.files?.[0]||null)}/><button type="button" onClick={()=>fileRef.current?.click()} title="Anexar arquivo"><Paperclip size={17}/></button><select value="" aria-label="Vincular tarefa" onChange={e=>setLinkTask(e.target.value)}><option value="">Vincular tarefa</option>{data.tasks.filter(t=>t.team_id===channel.team_id).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></div><Button type="submit" disabled={sending||(!body.trim()&&!linkTask&&!file)}>{sending?'Enviando...':'Enviar'}<Send size={15}/></Button></div></form></>:<Empty text="Selecione um canal para conversar."/>}</div>{creating&&<Modal title="Novo canal" onClose={()=>setCreating(false)}><form className="stack-form" onSubmit={e=>void createChannel(e)}><Field label="Nome do canal"><input required autoFocus value={newChannel} onChange={e=>setNewChannel(e.target.value)} placeholder="Ex.: Projetos"/></Field><div className="form-actions"><Button variant="secondary" onClick={()=>setCreating(false)}>Cancelar</Button><Button type="submit">Criar canal</Button></div></form></Modal>}</div>
}

function FlowSettings({data,run,onClose}:{data:Data;run:(action:()=>Promise<unknown>,success?:string)=>Promise<boolean>;onClose:()=>void}) {
  const [stageName,setStageName]=useState(''); const [from,setFrom]=useState(data.stages[0]?.id||''); const [to,setTo]=useState(data.stages[1]?.id||''); const [templateStage,setTemplateStage]=useState(data.stages[0]?.id||''); const [template,setTemplate]=useState('')
  return <Modal title="Configurar fluxo" onClose={onClose} wide><div className="flow-settings"><section><h3>Etapas</h3><p>O status final determina se a tarefa está concluída.</p><div className="settings-list">{data.stages.map(s=><div key={s.id}><span className="stage-color" style={{background:s.color}}/><strong>{s.name}</strong><small>{s.is_final?'Final':s.is_pause?'Pausa':`Posição ${s.position}`}</small><label><input type="checkbox" checked={s.is_final} onChange={()=>void run(async()=>{const {error}=await supabase.from('stages').update({is_final:!s.is_final}).eq('id',s.id);if(error)throw error})}/> Final</label></div>)}</div><form className="inline-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('stages').insert({name:stageName,position:Math.max(...data.stages.map(s=>s.position))+1});if(error)throw error;setStageName('')})}}><input required value={stageName} onChange={e=>setStageName(e.target.value)} placeholder="Nova etapa"/><button aria-label="Adicionar etapa"><Plus size={16}/></button></form></section><section><h3>Transições permitidas</h3><p>Movimentos disponíveis no menu e no Kanban.</p><div className="settings-list transitions">{data.transitions.map(t=><div key={`${t.from_stage_id}-${t.to_stage_id}`}><span>{data.stages.find(s=>s.id===t.from_stage_id)?.name} <ArrowRight size={13}/> {data.stages.find(s=>s.id===t.to_stage_id)?.name}</span><button onClick={()=>void run(async()=>{const {error}=await supabase.from('stage_transitions').delete().eq('from_stage_id',t.from_stage_id).eq('to_stage_id',t.to_stage_id);if(error)throw error})}><X size={14}/></button></div>)}</div><form className="settings-add" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('stage_transitions').insert({from_stage_id:from,to_stage_id:to});if(error)throw error})}}><select value={from} onChange={e=>setFrom(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ArrowRight size={15}/><select value={to} onChange={e=>setTo(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button><Plus size={17}/></button></form><h3>Templates de subtarefas</h3><div className="settings-list transitions">{data.templates.map(x=><div key={x.id}><span>{data.stages.find(s=>s.id===x.stage_id)?.name} · {x.title}</span><button onClick={()=>void run(async()=>{const {error}=await supabase.from('subtask_templates').delete().eq('id',x.id);if(error)throw error})}><X size={14}/></button></div>)}</div><form className="settings-add" onSubmit={e=>{e.preventDefault();void run(async()=>{const {error}=await supabase.from('subtask_templates').insert({stage_id:templateStage,title:template,position:data.templates.filter(x=>x.stage_id===templateStage).length+1});if(error)throw error;setTemplate('')})}}><select value={templateStage} onChange={e=>setTemplateStage(e.target.value)}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input required value={template} onChange={e=>setTemplate(e.target.value)} placeholder="Subtarefa padrão"/><button><Plus size={17}/></button></form></section></div></Modal>
}







