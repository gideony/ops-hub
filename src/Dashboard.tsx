import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Clock3,
  FolderKanban,
  Layers,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react'
import type { Profile, Stage, Task, Team } from './lib'
import { completed, dateBR, taskBuckets } from './lib'
import type { DashboardFilter, Data, Page } from './App'
import './dashboard.css'

const priorityLabel: Record<Task['priority'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}

const priorityWeight: Record<Task['priority'], number> = {
  urgente: 4,
  alta: 3,
  media: 2,
  baixa: 1,
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string
  value: number
  icon: ReactNode
  tone: string
  onClick: () => void
}) {
  return (
    <button className="metric" onClick={onClick} type="button">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <ArrowRight size={17} className="metric-arrow" />
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty" role="status">
      <CircleHelp size={27} />
      <p>{text}</p>
    </div>
  )
}

export type DashboardProps = {
  data: Data
  profile: Profile | null | undefined
  dashboard: Record<Exclude<DashboardFilter, null>, Task[]>
  openMetric: (metric: Exclude<DashboardFilter, null>) => void
  onTask: (task: Task) => void
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  stage: (id: string) => Stage | undefined
  onNewTask?: () => void
  onNavigateToPage?: (page: Page) => void
  onNavigateToBoard?: (boardId: string) => void
}

export default function Dashboard({
  data,
  profile,
  dashboard,
  openMetric,
  onTask,
  person,
  team,
  stage,
  onNewTask,
  onNavigateToPage,
  onNavigateToBoard,
}: DashboardProps) {
  // Filtro de escopo do dashboard (Todos os quadros, Quadro Geral ou quadro específico)
  const [boardScope, setBoardScope] = useState<string>('all')

  // Saudação dinâmica por horário do dia
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = profile?.full_name?.split(' ')[0] || 'equipe'

  // Todas as etapas combinadas (canônicas + customizadas)
  const allStages = useMemo(() => {
    return [...data.stages, ...data.boardStages]
  }, [data.stages, data.boardStages])

  // Tarefas filtradas pelo escopo de quadro selecionado
  const scopedTasks = useMemo(() => {
    if (boardScope === 'all') return data.tasks
    if (boardScope === 'board-geral') {
      return data.tasks.filter(t => !t.board_id || t.board_id === 'board-geral')
    }
    return data.tasks.filter(t => t.board_id === boardScope)
  }, [data.tasks, boardScope])

  // Buckets de métricas recalculados conforme o escopo selecionado
  const currentMetrics = useMemo(() => {
    if (boardScope === 'all') return dashboard
    return taskBuckets(scopedTasks, data.stages, profile?.id, data.boardStages)
  }, [boardScope, dashboard, scopedTasks, data.stages, profile?.id, data.boardStages])

  // Tarefas em andamento (ativas) no escopo selecionado
  const activeTasks = useMemo(() => {
    return scopedTasks.filter(t => !completed(t, allStages))
  }, [scopedTasks, allStages])

  // Atividade recente no escopo (últimas 5 tarefas atualizadas)
  const recentTasks = useMemo(() => {
    return [...scopedTasks]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5)
  }, [scopedTasks])

  // Suas prioridades: tarefas atribuídas ao usuário logado no escopo, ordenadas por urgência e prazo
  const myPriorities = useMemo(() => {
    return currentMetrics.mine
      .slice()
      .sort((a, b) => {
        const weightDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
        if (weightDiff !== 0) return weightDiff
        if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at)
        if (a.due_at) return -1
        if (b.due_at) return 1
        return b.updated_at.localeCompare(a.updated_at)
      })
      .slice(0, 5)
  }, [currentMetrics.mine])

  // Detecção de Gargalos Operacionais: Etapas com limite de WIP excedido
  const wipBottlenecks = useMemo(() => {
    const list: {
      boardId: string
      boardName: string
      boardColor: string
      stageId: string
      stageName: string
      count: number
      wipLimit: number
    }[] = []

    for (const bStage of data.boardStages) {
      if (typeof bStage.wip_limit === 'number' && bStage.wip_limit > 0) {
        // Se escopo específico estiver ativo e não for o deste quadro, pula
        if (boardScope !== 'all' && boardScope !== bStage.board_id) continue

        const count = scopedTasks.filter(
          t => t.stage_id === bStage.id && !completed(t, allStages)
        ).length

        if (count > bStage.wip_limit) {
          const board = data.boards.find(b => b.id === bStage.board_id)
          list.push({
            boardId: bStage.board_id,
            boardName: board?.name || 'Quadro',
            boardColor: (board as any)?.color || '#3b82f6',
            stageId: bStage.id,
            stageName: bStage.name,
            count,
            wipLimit: bStage.wip_limit,
          })
        }
      }
    }

    return list
  }, [data.boardStages, data.boards, boardScope, scopedTasks, allStages])

  // Sprint Ativa em destaque (Scrum)
  const activeSprintInfo = useMemo(() => {
    const sprint = data.sprints?.find(s => s.status === 'active')
    if (!sprint) return null

    // Se o escopo estiver restrito a outro quadro, não mostra a sprint daquele quadro
    if (boardScope !== 'all' && boardScope !== sprint.board_id) return null

    const sprintBoard = data.boards.find(b => b.id === sprint.board_id)
    const sprintTasks = data.tasks.filter(t => t.sprint_id === sprint.id)
    const totalPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
    const doneTasks = sprintTasks.filter(t => completed(t, allStages))
    const donePoints = doneTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
    const percent = totalPoints > 0
      ? Math.round((donePoints / totalPoints) * 100)
      : (sprintTasks.length > 0 ? Math.round((doneTasks.length / sprintTasks.length) * 100) : 0)

    let daysLeft: number | null = null
    if (sprint.end_date) {
      const diff = new Date(sprint.end_date).getTime() - new Date().getTime()
      daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24))
    }

    return {
      sprint,
      board: sprintBoard,
      totalTasks: sprintTasks.length,
      doneTasks: doneTasks.length,
      totalPoints,
      donePoints,
      percent,
      daysLeft,
    }
  }, [data.sprints, data.boards, data.tasks, allStages, boardScope])

  // Carga de Trabalho por Equipe (visão para gestores e administradores)
  const isManagerOrAdmin = profile?.role === 'administrador' || profile?.role === 'gestor' || profile?.is_master
  const teamWorkload = useMemo(() => {
    if (!isManagerOrAdmin) return []
    return data.teams.map(t => {
      const teamActive = activeTasks.filter(task => task.team_id === t.id)
      const unassigned = teamActive.filter(task => !task.assignee_id)
      return {
        team: t,
        activeCount: teamActive.length,
        unassignedCount: unassigned.length,
      }
    }).filter(row => row.activeCount > 0)
  }, [isManagerOrAdmin, data.teams, activeTasks])

  // Etapas exibidas no Panorama do Fluxo conforme o escopo
  const flowStages = useMemo(() => {
    if (boardScope === 'all' || boardScope === 'board-geral') {
      return data.stages
        .filter(s => !s.is_final && activeTasks.some(t => t.stage_id === s.id))
        .slice(0, 6)
    }
    return data.boardStages
      .filter(s => s.board_id === boardScope && !s.is_final && activeTasks.some(t => t.stage_id === s.id))
      .sort((a, b) => a.position - b.position)
      .slice(0, 6)
  }, [boardScope, data.stages, data.boardStages, activeTasks])

  return (
    <>
      {/* Cabeçalho do Dashboard com Saudação e Ações Rápidas */}
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">VISÃO GERAL</div>
          <h1>
            {greeting}, {firstName} <span className="wave">✳</span>
          </h1>
          <p>Acompanhe o que importa e mantenha tudo em movimento.</p>
        </div>

        <div className="dashboard-heading-actions">
          {onNewTask && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNewTask}
              title="Criar nova tarefa no sistema"
            >
              <Plus size={15} />
              <span>Nova Tarefa</span>
            </button>
          )}

          {onNavigateToPage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigateToPage('tasks')}
              title="Ir para o quadro de tarefas"
            >
              <FolderKanban size={15} />
              <span>Ver Tarefas</span>
            </button>
          )}

          {onNavigateToPage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigateToPage('reports')}
              title="Ir para os relatórios gerenciais"
            >
              <BarChart3 size={15} />
              <span>Relatórios</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtro de Escopo do Dashboard */}
      <div className="dashboard-scope-bar" role="toolbar" aria-label="Escopo de exibição do dashboard">
        <div className="dashboard-scope-left">
          <Layers size={16} />
          <span>Escopo do Dashboard:</span>
          <select
            className="dashboard-scope-select"
            value={boardScope}
            onChange={e => setBoardScope(e.target.value)}
            aria-label="Filtrar escopo de dados do dashboard"
          >
            <option value="all">Todos os meus quadros (Consolidado)</option>
            <option value="board-geral">Quadro Geral (Canônico)</option>
            {data.boards
              .filter(b => b.id !== 'board-geral')
              .map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.methodology === 'scrum' ? 'Scrum' : 'Kanban'})
                </option>
              ))}
          </select>
        </div>

        <div className="dashboard-scope-badge">
          <span>
            {scopedTasks.length} {scopedTasks.length === 1 ? 'tarefa no escopo' : 'tarefas no escopo'}
          </span>
        </div>
      </div>

      {/* Banner de Alerta de Limite WIP (Gargalos) */}
      {wipBottlenecks.length > 0 && (
        <div className="dashboard-wip-alert" role="alert">
          <AlertTriangle size={20} className="dashboard-wip-alert-icon" />
          <div className="dashboard-wip-alert-content">
            <div>
              <strong>Atenção ao fluxo:</strong>{' '}
              {wipBottlenecks.length === 1
                ? '1 etapa excedeu o limite de trabalho em andamento (WIP):'
                : `${wipBottlenecks.length} etapas excederam o limite de trabalho em andamento (WIP):`}
            </div>
            <div className="dashboard-wip-chips">
              {wipBottlenecks.map(b => (
                <button
                  key={`${b.boardId}-${b.stageId}`}
                  type="button"
                  className="dashboard-wip-chip"
                  onClick={() => onNavigateToBoard?.(b.boardId)}
                  title={`Abrir quadro ${b.boardName}`}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: b.boardColor,
                    }}
                  />
                  <span>
                    {b.boardName} · {b.stageName} (<strong>{b.count}/{b.wipLimit}</strong>)
                  </span>
                  <ArrowRight size={11} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Widget de Sprint Ativa (Scrum) */}
      {activeSprintInfo && (
        <div className="dashboard-sprint-widget" role="region" aria-label="Sprint Ativa em Andamento">
          <div className="dashboard-sprint-info">
            <div className="dashboard-sprint-badge-row">
              <span className="dashboard-sprint-chip">Sprint Ativa</span>
              <span className="dashboard-sprint-board-name">
                {activeSprintInfo.board?.name || 'Scrum'}
              </span>
              {activeSprintInfo.daysLeft !== null && (
                <span className="due-text" style={{ fontSize: 11 }}>
                  <CalendarDays size={12} />
                  {activeSprintInfo.daysLeft > 0
                    ? `${activeSprintInfo.daysLeft} dias restantes`
                    : activeSprintInfo.daysLeft === 0
                    ? 'Termina hoje'
                    : 'Sprint expirada'}
                </span>
              )}
            </div>
            <h3 className="dashboard-sprint-title">{activeSprintInfo.sprint.name}</h3>
            {activeSprintInfo.sprint.goal && (
              <p className="dashboard-sprint-goal">
                <strong>Meta:</strong> {activeSprintInfo.sprint.goal}
              </p>
            )}
          </div>

          <div className="dashboard-sprint-metrics">
            {activeSprintInfo.totalPoints > 0 && (
              <div className="dashboard-sprint-metric-col">
                <span>Story Points</span>
                <strong>
                  {activeSprintInfo.donePoints} / {activeSprintInfo.totalPoints} pts
                </strong>
                <div className="dashboard-sprint-progress-bar">
                  <div
                    className="dashboard-sprint-progress-fill"
                    style={{ width: `${activeSprintInfo.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="dashboard-sprint-metric-col">
              <span>Tarefas Entregues</span>
              <strong>
                {activeSprintInfo.doneTasks} / {activeSprintInfo.totalTasks} ({activeSprintInfo.percent}%)
              </strong>
            </div>

            {onNavigateToBoard && activeSprintInfo.board && (
              <button
                type="button"
                className="dashboard-sprint-btn"
                onClick={() => onNavigateToBoard(activeSprintInfo.board!.id)}
                title="Acessar o quadro desta Sprint"
              >
                <span>Acessar Sprint</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Seção de Métricas Rápidas */}
      <div className="section-title">
        <h2>Visão rápida</h2>
        <span>O que precisa da sua atenção hoje</span>
      </div>

      <div className="metrics">
        <MetricCard
          label="Minhas tarefas"
          value={currentMetrics.mine.length}
          icon={<ClipboardList size={21} />}
          tone="purple"
          onClick={() => openMetric('mine')}
        />
        <MetricCard
          label="Atrasadas"
          value={currentMetrics.overdue.length}
          icon={<Clock3 size={21} />}
          tone="red"
          onClick={() => openMetric('overdue')}
        />
        <MetricCard
          label="Próximas do prazo"
          value={currentMetrics.soon.length}
          icon={<CalendarDays size={21} />}
          tone="orange"
          onClick={() => openMetric('soon')}
        />
        <MetricCard
          label="Bloqueadas"
          value={currentMetrics.blocked.length}
          icon={<LockKeyhole size={21} />}
          tone="slate"
          onClick={() => openMetric('blocked')}
        />
        <MetricCard
          label="Concluídas na semana"
          value={currentMetrics.week.length}
          icon={<CheckCircle2 size={21} />}
          tone="green"
          onClick={() => openMetric('week')}
        />
      </div>

      {/* Grid de Atividade Recente e Panorama do Fluxo */}
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Atividade recente</h2>
              <p>Últimas tarefas atualizadas</p>
            </div>
            <Activity size={19} />
          </div>

          {recentTasks.length ? (
            <div className="recent-list">
              {recentTasks.map(t => {
                const stageObj = stage(t.stage_id) || data.boardStages.find(s => s.id === t.stage_id)
                const teamObj = team(t.team_id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="recent-row"
                    onClick={() => onTask(t)}
                  >
                    <span
                      className="recent-dot"
                      style={{ background: stageObj?.color || '#3b82f6' }}
                    />
                    <span className="recent-main">
                      <strong>{t.title}</strong>
                      <small>
                        {teamObj?.name || 'Geral'} · {stageObj?.name || 'Etapa'}
                      </small>
                    </span>
                    <span className="recent-time">
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      }).format(new Date(t.updated_at))}
                    </span>
                    <ArrowRight size={15} />
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty text="As tarefas criadas aparecerão aqui." />
          )}
        </div>

        <div className="panel progress-panel">
          <div className="panel-heading">
            <div>
              <h2>Panorama do fluxo</h2>
              <p>Distribuição das tarefas ativas</p>
            </div>
            <MoreHorizontal size={20} />
          </div>

          <div className="progress-number">
            {activeTasks.length}
            <span>tarefas em andamento</span>
          </div>

          <div className="progress-bars">
            {flowStages.map(s => {
              const count = activeTasks.filter(t => t.stage_id === s.id).length
              const percent = activeTasks.length > 0 ? (count / activeTasks.length) * 100 : 0
              return (
                <div className="progress-row" key={s.id}>
                  <div>
                    <span>{s.name}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${percent}%`,
                        background: s.color || '#3b82f6',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="panel-foot">
            {data.teams.length} equipes · {data.clients.length} clientes
          </div>
        </div>
      </div>

      {/* Seção de Suas Prioridades */}
      <div className="section-title dashboard-bottom">
        <h2>Suas prioridades</h2>
        <button
          type="button"
          onClick={() => openMetric('mine')}
          className="btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>Ver todas</span>
          <ArrowRight size={15} />
        </button>
      </div>

      <div className="priority-list">
        {myPriorities.map(t => {
          const boardObj = data.boards.find(b => b.id === (t.board_id || 'board-geral'))
          const boardColor = (boardObj as any)?.color || '#3b82f6'

          return (
            <button
              key={t.id}
              type="button"
              className="priority-row"
              onClick={() => onTask(t)}
            >
              <div className="priority-check">
                <Check size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className="priority-board-chip"
                    style={{
                      background: `color-mix(in srgb, ${boardColor} 12%, var(--bg-surface, #fff))`,
                      color: boardColor,
                      borderColor: `color-mix(in srgb, ${boardColor} 30%, transparent)`,
                    }}
                  >
                    {boardObj?.name || 'Geral'}
                  </span>
                  <strong>{t.title}</strong>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {team(t.team_id)?.name || 'Geral'} ·{' '}
                  {person(t.assignee_id)?.full_name || 'Sem responsável'}
                </span>
              </div>

              <span className={`priority-badge ${t.priority}`}>
                {priorityLabel[t.priority]}
              </span>

              <span className="due-text">
                <CalendarDays size={14} />
                {dateBR(t.due_at)}
              </span>

              <ArrowRight size={16} />
            </button>
          )
        })}

        {!myPriorities.length && (
          <Empty text="Você não tem tarefas ativas atribuídas neste escopo." />
        )}
      </div>

      {/* Painel de Carga de Trabalho por Equipe (Exibido para Gestores e Administradores) */}
      {isManagerOrAdmin && teamWorkload.length > 0 && (
        <div className="team-load-panel" role="region" aria-label="Carga de trabalho por equipe">
          <div className="panel-heading" style={{ marginBottom: 12 }}>
            <div>
              <h2>Distribuição por Equipe</h2>
              <p>Volume de tarefas ativas e alertas de pendências sem responsável</p>
            </div>
            <Users size={19} />
          </div>

          <div className="team-load-grid">
            {teamWorkload.map(item => {
              const maxActive = Math.max(...teamWorkload.map(w => w.activeCount), 1)
              const percent = Math.round((item.activeCount / maxActive) * 100)
              const teamColor = item.team.color || '#3b82f6'

              return (
                <div key={item.team.id} className="team-load-card">
                  <div className="team-load-card-head">
                    <strong>{item.team.name}</strong>
                    <span>{item.activeCount} ativas</span>
                  </div>

                  <div className="team-load-bar">
                    <div
                      className="team-load-bar-fill"
                      style={{ width: `${percent}%`, background: teamColor }}
                    />
                  </div>

                  {item.unassignedCount > 0 && (
                    <div className="team-unassigned-alert">
                      <AlertTriangle size={12} />
                      <span>{item.unassignedCount} sem responsável</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
