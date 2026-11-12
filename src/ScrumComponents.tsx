import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  GripVertical,
  LineChart,
  Plus,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import type { Board, Profile, Sprint, Task } from './lib'
import type { Data } from './App'

// ==========================================
// 1. Modal: Criar Nova Sprint
// ==========================================
type CreateSprintModalProps = {
  board: Board
  existingSprintsCount: number
  onClose: () => void
  onSave: (sprint: Partial<Sprint>) => Promise<void>
}

export function CreateSprintModal({ board, existingSprintsCount, onClose, onSave }: CreateSprintModalProps) {
  const [name, setName] = useState(`Sprint ${existingSprintsCount + 1}`)
  const [goal, setGoal] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome da sprint.'); return }
    if (startDate && endDate && endDate < startDate) {
      setError('A data de término não pode ser anterior à data de início.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await onSave({
        board_id: board.id,
        name: name.trim(),
        goal: goal.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status: 'planning',
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar sprint')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal sprint-modal" role="dialog" aria-modal="true" aria-label="Criar Nova Sprint">
        <header className="board-modal-header">
          <div>
            <h2>Criar Nova Sprint</h2>
            <p>Defina o período, meta e nome para o próximo ciclo de trabalho em {board.name}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} className="board-modal-form">
          <label className="task-form-field">
            <span>Nome da Sprint *</span>
            <input
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Sprint 14"
            />
          </label>

          <div className="sprint-dates-grid">
            <label className="task-form-field">
              <span>Data de Início *</span>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </label>
            <label className="task-form-field">
              <span>Data de Término *</span>
              <input
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <label className="task-form-field">
            <span>Meta da Sprint (Goal)</span>
            <textarea
              rows={2}
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="Ex: Finalizar autenticação e painel de tarefas"
            />
          </label>

          {error && <p className="board-modal-error" role="alert">{error}</p>}

          <footer className="board-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Salvando...' : 'Criar Sprint'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ==========================================
// 2. Modal: Encerrar Sprint
// ==========================================
type CompleteSprintModalProps = {
  sprint: Sprint
  tasks: Task[]
  boardStages: { id: string; name: string; is_final?: boolean; color?: string }[]
  onClose: () => void
  onComplete: (sprintId: string, actionForPending: 'backlog' | 'next_sprint', nextSprintName?: string) => Promise<void>
}

export function CompleteSprintModal({ sprint, tasks, boardStages, onClose, onComplete }: CompleteSprintModalProps) {
  const finalStageIds = new Set(boardStages.filter(s => s.is_final).map(s => s.id))
  const sprintTasks = tasks.filter(t => t.sprint_id === sprint.id)
  const completedTasks = sprintTasks.filter(t => finalStageIds.has(t.stage_id))
  const pendingTasks = sprintTasks.filter(t => !finalStageIds.has(t.stage_id))

  const totalPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
  const completedPoints = completedTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
  const pendingPoints = totalPoints - completedPoints

  const [action, setAction] = useState<'backlog' | 'next_sprint'>('backlog')
  const [nextSprintName, setNextSprintName] = useState('Próxima Sprint')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onComplete(sprint.id, action, action === 'next_sprint' ? nextSprintName : undefined)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar sprint')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal sprint-complete-modal" role="dialog" aria-modal="true" aria-label="Encerrar Sprint">
        <header className="board-modal-header">
          <div>
            <h2>Encerrar Sprint — {sprint.name}</h2>
            <p>Revise o resumo das entregas e defina o destino das tarefas não concluídas.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <form onSubmit={handleConfirm} className="board-modal-form">
          <div className="sprint-summary-cards">
            <div className="sprint-summary-card">
              <span className="card-label">Concluídas</span>
              <strong className="text-success">{completedTasks.length} de {sprintTasks.length}</strong>
              <small>tarefas entregues</small>
            </div>
            <div className="sprint-summary-card">
              <span className="card-label">Velocidade</span>
              <strong className="text-primary">{completedPoints} pts</strong>
              <small>pontos queimados</small>
            </div>
            <div className="sprint-summary-card">
              <span className="card-label">Pendentes</span>
              <strong className={pendingTasks.length > 0 ? 'text-warning' : 'text-muted'}>
                {pendingTasks.length} tarefas ({pendingPoints} pts)
              </strong>
              <small>não finalizadas</small>
            </div>
          </div>

          {pendingTasks.length > 0 && (
            <fieldset className="sprint-pending-box">
              <legend>Destino das {pendingTasks.length} tarefas pendentes</legend>
              <label className="board-radio-label">
                <input
                  type="radio"
                  name="pending_action"
                  checked={action === 'backlog'}
                  onChange={() => setAction('backlog')}
                />
                <div>
                  <strong>Retornar para o Backlog</strong>
                  <small>As tarefas voltam à lista priorizada do quadro para novo planejamento.</small>
                </div>
              </label>

              <label className="board-radio-label">
                <input
                  type="radio"
                  name="pending_action"
                  checked={action === 'next_sprint'}
                  onChange={() => setAction('next_sprint')}
                />
                <div>
                  <strong>Mover para a próxima Sprint</strong>
                  <small>Transfere automaticamente para uma sprint planejada existente ou cria uma nova.</small>
                </div>
              </label>

              {action === 'next_sprint' && (
                <div className="task-form-field next-sprint-input-box">
                  <span>Nome da próxima sprint:</span>
                  <input
                    value={nextSprintName}
                    onChange={e => setNextSprintName(e.target.value)}
                    placeholder="Ex: Sprint 15"
                  />
                </div>
              )}
            </fieldset>
          )}

          {error && <p className="board-modal-error" role="alert">{error}</p>}

          <footer className="board-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Encerrando...' : 'Confirmar Encerramento'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ==========================================
// 3. Modal: Gráfico de Burndown
// ==========================================
type BurndownModalProps = {
  sprint: Sprint
  tasks: Task[]
  boardStages: { id: string; name: string; is_final?: boolean; color?: string }[]
  onClose: () => void
}

export function BurndownModal({ sprint, tasks, boardStages, onClose }: BurndownModalProps) {
  const finalStageIds = new Set(boardStages.filter(s => s.is_final).map(s => s.id))
  const sprintTasks = tasks.filter(t => t.sprint_id === sprint.id)
  const totalPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)

  // Geração do eixo temporal diário da Sprint
  const start = sprint.start_date ? new Date(sprint.start_date + 'T00:00:00Z') : new Date()
  const end = sprint.end_date ? new Date(sprint.end_date + 'T00:00:00Z') : new Date(start.getTime() + 13 * 86400000)
  const daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const days: { dateStr: string; label: string; dayIndex: number }[] = []

  for (let i = 0; i < daysDiff; i++) {
    const d = new Date(start.getTime() + i * 86400000)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    days.push({
      dateStr: `${yyyy}-${mm}-${dd}`,
      label: `${dd}/${mm}`,
      dayIndex: i,
    })
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  // Cálculo da queima real de pontos até cada dia
  // Uma tarefa concluída com completed_at <= dateStr queima seus pontos a partir daquela data
  let currentBurned = 0
  const realPointsData: { dayIndex: number; pointsRemaining: number; label: string }[] = []

  for (const day of days) {
    if (day.dateStr > todayStr && sprint.status === 'active') break

    const pointsDoneOnOrBefore = sprintTasks
      .filter(t => {
        if (!finalStageIds.has(t.stage_id)) return false
        const compDate = t.completed_at ? t.completed_at.slice(0, 10) : t.updated_at.slice(0, 10)
        return compDate <= day.dateStr
      })
      .reduce((acc, t) => acc + (t.story_points || 0), 0)

    currentBurned = pointsDoneOnOrBefore
    realPointsData.push({
      dayIndex: day.dayIndex,
      pointsRemaining: Math.max(0, totalPoints - pointsDoneOnOrBefore),
      label: day.label,
    })
  }

  // Dimensões do SVG
  const width = 560
  const height = 240
  const padLeft = 46
  const padRight = 24
  const padTop = 24
  const padBottom = 36

  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const maxPoints = Math.max(10, totalPoints)

  function getX(dayIndex: number) {
    if (daysDiff <= 1) return padLeft + chartW / 2
    return padLeft + (dayIndex / (daysDiff - 1)) * chartW
  }

  function getY(points: number) {
    return padTop + chartH - (points / maxPoints) * chartH
  }

  // Coordenadas da linha ideal (reta do dia 0 com totalPoints até dia final com 0)
  const idealX1 = getX(0)
  const idealY1 = getY(totalPoints)
  const idealX2 = getX(daysDiff - 1)
  const idealY2 = getY(0)

  // Coordenadas da linha real
  const realPointsPolyline = realPointsData.map(pt => `${getX(pt.dayIndex)},${getY(pt.pointsRemaining)}`).join(' ')

  const pointsRemaining = Math.max(0, totalPoints - currentBurned)

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal burndown-modal" role="dialog" aria-modal="true" aria-label="Gráfico de Burndown">
        <header className="board-modal-header">
          <div>
            <h2>Gráfico de Burndown — {sprint.name}</h2>
            <p>{sprint.goal || 'Acompanhamento do ritmo diário de queima de pontos da sprint.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <div className="burndown-body">
          {/* Métricas do topo */}
          <div className="burndown-metrics-bar">
            <div>
              <span className="burndown-metric-label">Planejado</span>
              <strong>{totalPoints} pts</strong>
            </div>
            <div>
              <span className="burndown-metric-label">Entregue</span>
              <strong className="text-success">{currentBurned} pts</strong>
            </div>
            <div>
              <span className="burndown-metric-label">Restante</span>
              <strong className="text-primary">{pointsRemaining} pts</strong>
            </div>
            <div>
              <span className="burndown-metric-label">Duração</span>
              <strong>{daysDiff} dias</strong>
            </div>
          </div>

          {/* Gráfico SVG nativo */}
          <div className="burndown-chart-wrapper">
            <svg viewBox={`0 0 ${width} ${height}`} className="burndown-svg" aria-label="Gráfico de Burndown da Sprint">
              {/* Linhas de Grade Horizontal */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padTop + chartH * (1 - pct)
                const ptValue = Math.round(maxPoints * pct)
                return (
                  <g key={i}>
                    <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="2 2" />
                    <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                      {ptValue}
                    </text>
                  </g>
                )
              })}

              {/* Linha Ideal (tracejada) */}
              <line
                x1={idealX1}
                y1={idealY1}
                x2={idealX2}
                y2={idealY2}
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="4 4"
              />

              {/* Linha Real (sólida) */}
              {realPointsData.length > 1 && (
                <polyline
                  points={realPointsPolyline}
                  fill="none"
                  stroke="#1e40af"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pontos diários na linha real */}
              {realPointsData.map(pt => {
                const cx = getX(pt.dayIndex)
                const cy = getY(pt.pointsRemaining)
                return (
                  <g key={pt.dayIndex} className="burndown-point-node">
                    <circle cx={cx} cy={cy} r="4" fill="#1e40af" stroke="#ffffff" strokeWidth="2" />
                    <title>{`${pt.label}: ${pt.pointsRemaining} pts restantes`}</title>
                  </g>
                )
              })}

              {/* Rótulos de dias no Eixo X */}
              {days.map((day, idx) => {
                // Exibe no máximo ~7 marcações para não sobrepor
                const step = Math.max(1, Math.floor(daysDiff / 7))
                if (idx % step !== 0 && idx !== daysDiff - 1) return null
                const x = getX(day.dayIndex)
                return (
                  <text key={idx} x={x} y={height - 12} textAnchor="middle" fontSize="10" fill="#64748b">
                    {day.label}
                  </text>
                )
              })}
            </svg>
          </div>

          {/* Legenda */}
          <div className="burndown-legend">
            <span className="legend-item">
              <i className="legend-line ideal" /> Linha Ideal (queima planejada)
            </span>
            <span className="legend-item">
              <i className="legend-line real" /> Linha Real (pontos restantes)
            </span>
          </div>
        </div>

        <footer className="board-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </footer>
      </div>
    </div>
  )
}

// ==========================================
// 4. Cabeçalho de Sprint Ativa (na visão Sprint)
// ==========================================
type SprintActiveHeaderProps = {
  sprint: Sprint
  tasks: Task[]
  boardStages: { id: string; name: string; is_final?: boolean; color?: string }[]
  onOpenBurndown: () => void
  onOpenComplete: () => void
}

export function SprintActiveHeader({
  sprint,
  tasks,
  boardStages,
  onOpenBurndown,
  onOpenComplete,
}: SprintActiveHeaderProps) {
  const finalStageIds = new Set(boardStages.filter(s => s.is_final).map(s => s.id))
  const sprintTasks = tasks.filter(t => t.sprint_id === sprint.id)
  const completedTasks = sprintTasks.filter(t => finalStageIds.has(t.stage_id))

  const totalPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)
  const completedPoints = completedTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)

  // Cálculo de dias decorridos
  const start = sprint.start_date ? new Date(sprint.start_date + 'T00:00:00Z') : new Date()
  const end = sprint.end_date ? new Date(sprint.end_date + 'T00:00:00Z') : new Date(start.getTime() + 13 * 86400000)
  const now = new Date()
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const currentDay = Math.min(totalDays, Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000) + 1))

  return (
    <div className="sprint-active-banner">
      <div className="sprint-banner-info">
        <div className="sprint-banner-title-row">
          <Zap size={16} className="text-warning" />
          <strong>{sprint.name}</strong>
          <span className="sprint-active-badge">Sprint Ativa</span>
          <span className="sprint-days-counter">Dia {currentDay} de {totalDays}</span>
        </div>
        {sprint.goal && <p className="sprint-banner-goal">{sprint.goal}</p>}
      </div>

      <div className="sprint-banner-metrics">
        <div className="sprint-points-pill" title="Pontos entregues versus total planejado">
          <span>{completedPoints} / {totalPoints} pts</span>
          <div className="sprint-points-bar">
            <div
              className="sprint-points-fill"
              style={{ width: `${totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenBurndown}
          title="Ver gráfico de queima diária"
        >
          <LineChart size={14} /> Burndown
        </button>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onOpenComplete}
          title="Encerrar sprint e transferir pendências"
        >
          <CheckCircle2 size={14} /> Encerrar sprint
        </button>
      </div>
    </div>
  )
}

// ==========================================
// 5. Visão de Backlog (com Sprints Planejadas)
// ==========================================
type BacklogViewProps = {
  board: Board
  data: Data
  activeSprint?: Sprint | null
  onOpenCreateSprint: () => void
  onStartSprint: (sprintId: string) => Promise<void>
  onMoveTaskToSprint: (taskId: string, sprintId: string | null) => Promise<void>
  onQuickCreateTask: (title: string, storyPoints: number) => Promise<void>
  onSelectTask: (task: Task) => void
  person: (id: string | null | undefined) => Profile | undefined
}

export function BacklogView({
  board,
  data,
  activeSprint,
  onOpenCreateSprint,
  onStartSprint,
  onMoveTaskToSprint,
  onQuickCreateTask,
  onSelectTask,
  person,
}: BacklogViewProps) {
  const boardSprints = data.sprints.filter(s => s.board_id === board.id)
  const planningSprints = boardSprints.filter(s => s.status === 'planning')
  const boardTasks = data.tasks.filter(t => t.board_id === board.id)
  const backlogTasks = boardTasks
    .filter(t => !t.sprint_id)
    .sort((a, b) => (a.backlog_order ?? 0) - (b.backlog_order ?? 0))

  const totalBacklogPoints = backlogTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)

  const [quickTitle, setQuickTitle] = useState('')
  const [quickPoints, setQuickPoints] = useState(1)
  const [addingTask, setAddingTask] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleAddBacklogTask(e: FormEvent) {
    e.preventDefault()
    if (!quickTitle.trim()) return
    setBusy(true)
    try {
      await onQuickCreateTask(quickTitle.trim(), quickPoints)
      setQuickTitle('')
      setQuickPoints(1)
      setAddingTask(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrum-backlog-page">
      {/* Barra de Ações do Backlog */}
      <div className="scrum-backlog-toolbar">
        <div>
          <h3>Backlog do Quadro</h3>
          <p>Priorize as demandas e planeje os ciclos de entrega para {board.name}.</p>
        </div>
        <div className="scrum-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenCreateSprint}
          >
            <Plus size={14} /> Nova Sprint
          </button>
          {!addingTask && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAddingTask(true)}
            >
              <Plus size={14} /> + Tarefa no backlog
            </button>
          )}
        </div>
      </div>

      {/* Formulário rápido de criação no backlog */}
      {addingTask && (
        <form onSubmit={handleAddBacklogTask} className="quick-task-form">
          <input
            required
            autoFocus
            value={quickTitle}
            onChange={e => setQuickTitle(e.target.value)}
            placeholder="O que precisa ser feito?"
            className="quick-task-input"
          />
          <div className="quick-task-points">
            <span>Estimativa:</span>
            <input
              type="number"
              min="0"
              max="99"
              value={quickPoints}
              onChange={e => setQuickPoints(parseInt(e.target.value, 10) || 0)}
              className="points-input"
            />
            <small>pts</small>
          </div>
          <div className="quick-task-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingTask(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !quickTitle.trim()}>
              {busy ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      )}

      {/* Sprints Planejadas */}
      <div className="planning-sprints-container">
        {planningSprints.map(sprint => {
          const sprintTasks = boardTasks.filter(t => t.sprint_id === sprint.id)
          const sprintPoints = sprintTasks.reduce((acc, t) => acc + (t.story_points || 0), 0)

          return (
            <div
              key={sprint.id}
              className="planning-sprint-box"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const taskId = e.dataTransfer.getData('text/task-id')
                if (taskId) void onMoveTaskToSprint(taskId, sprint.id)
              }}
            >
              <div className="planning-sprint-head">
                <div className="sprint-head-title">
                  <Zap size={15} />
                  <strong>{sprint.name}</strong>
                  <span className="badge-type custom">Planejada</span>
                  {sprint.start_date && sprint.end_date && (
                    <span className="sprint-dates-text">
                      <CalendarDays size={12} /> {sprint.start_date} a {sprint.end_date}
                    </span>
                  )}
                  <span className="sprint-capacity-pill">
                    {sprintPoints} {sprintPoints === 1 ? 'ponto' : 'pontos'} ({sprintTasks.length} {sprintTasks.length === 1 ? 'tarefa' : 'tarefas'})
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void onStartSprint(sprint.id)}
                  title={activeSprint ? 'Já existe uma sprint ativa neste quadro' : 'Iniciar esta sprint'}
                >
                  <Zap size={13} /> Iniciar sprint
                </button>
              </div>

              {sprint.goal && <p className="planning-sprint-goal"><strong>Meta:</strong> {sprint.goal}</p>}

              <div className="planning-sprint-tasks">
                {sprintTasks.map(task => {
                  const assigned = person(task.assignee_id)
                  return (
                    <div
                      key={task.id}
                      className="backlog-task-row"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/task-id', task.id)}
                    >
                      <GripVertical size={14} className="drag-handle" />
                      <div className="task-title-cell" onClick={() => onSelectTask(task)}>
                        <span>{task.title}</span>
                      </div>
                      <span className={`task-priority-chip priority-${task.priority}`}>
                        {task.priority}
                      </span>
                      <span className="task-points-badge" title="Story Points">
                        {task.story_points || 0} pts
                      </span>
                      {assigned && (
                        <span className="task-assignee-chip" title={`Responsável: ${assigned.full_name}`}>
                          {assigned.full_name}
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-backlog-action"
                        onClick={() => void onMoveTaskToSprint(task.id, null)}
                        title="Mover de volta ao Backlog"
                      >
                        Remover da sprint
                      </button>
                    </div>
                  )
                })}
                {sprintTasks.length === 0 && (
                  <div className="empty-drop-zone">
                    <span>Arraste tarefas do backlog para planejar esta sprint</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lista Principal de Backlog */}
      <div
        className="backlog-main-card"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const taskId = e.dataTransfer.getData('text/task-id')
          if (taskId) void onMoveTaskToSprint(taskId, null)
        }}
      >
        <div className="backlog-card-header">
          <div>
            <strong>Tarefas não alocadas ({backlogTasks.length})</strong>
            <small>Arraste para uma sprint planejada ou reordene por prioridade</small>
          </div>
          <span className="total-points-badge">
            Total no Backlog: <strong>{totalBacklogPoints} pts</strong>
          </span>
        </div>

        <div className="backlog-items-list">
          {backlogTasks.map((task, idx) => {
            const assigned = person(task.assignee_id)
            return (
              <div
                key={task.id}
                className="backlog-task-row"
                draggable
                onDragStart={e => e.dataTransfer.setData('text/task-id', task.id)}
              >
                <GripVertical size={14} className="drag-handle" />
                <span className="backlog-index-num">#{idx + 1}</span>
                <div className="task-title-cell" onClick={() => onSelectTask(task)}>
                  <strong>{task.title}</strong>
                  {task.description && <small>{task.description}</small>}
                </div>
                <span className={`task-priority-chip priority-${task.priority}`}>
                  {task.priority}
                </span>
                <span className="task-points-badge" title="Story Points">
                  {task.story_points || 0} pts
                </span>
                {assigned && (
                  <span className="task-assignee-chip" title={`Responsável: ${assigned.full_name}`}>
                    {assigned.full_name}
                  </span>
                )}
                {planningSprints.length > 0 && (
                  <select
                    className="assign-sprint-select"
                    defaultValue=""
                    onChange={e => {
                      const val = e.target.value
                      if (val) void onMoveTaskToSprint(task.id, val)
                    }}
                    title="Alocar em sprint planejada"
                  >
                    <option value="">Enviar para sprint...</option>
                    {planningSprints.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}

          {backlogTasks.length === 0 && (
            <div className="backlog-empty-state">
              <Sparkles size={24} />
              <p>O backlog deste quadro está vazio.</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAddingTask(true)}
              >
                + Adicionar primeira tarefa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
