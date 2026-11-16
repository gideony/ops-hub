import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FolderKanban,
  GitBranch,
  Layers,
  Lock,
  PauseCircle,
  Search,
  Timer,
  Users,
} from 'lucide-react'
import {
  buildBoardSummaryCsv,
  buildReport,
  daysBetween,
  getPresetDates,
  isTaskOverdue,
  reportCsvCell,
  resolveTaskStage,
} from './reports'
import type {
  DateFieldFilter,
  PeriodPreset,
  ReportFilterStatus,
  ReportFilters,
  ScrumScopeFilter,
} from './reports'
import { dateBR, todayISO } from './lib'
import type { Board, Task } from './lib'
import type { Data } from './App'

type Props = { data: Data; onTask: (task: Task) => void }

export type ReportsTab = 'quadros' | 'gargalos' | 'equipe' | 'pontualidade'

const statusNames: Record<ReportFilterStatus, string> = {
  all: 'Todas',
  active: 'Em andamento',
  done: 'Concluídas',
  blocked: 'Pausadas',
  backlog: 'Backlog',
  overdue: 'Atrasadas',
}

const dateFieldNames: Record<DateFieldFilter, string> = {
  created: 'Data de criação',
  completed: 'Data de conclusão',
  due: 'Data de prazo',
}

const priorityNames: Record<Task['priority'], string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
}

export default function ReportsPage({ data, onTask }: Props) {
  const [filters, setFilters] = useState<ReportFilters>({
    from: '',
    to: '',
    dateField: 'created',
    boardId: 'all',
    scrumScope: 'all',
    teamId: '',
    assigneeId: '',
    clientId: '',
    status: 'all',
  })
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ReportsTab>('quadros')
  const [preset, setPreset] = useState<PeriodPreset | 'custom'>('custom')
  const today = todayISO()

  function applyPreset(p: PeriodPreset) {
    setPreset(p)
    const { from, to } = getPresetDates(p, today)
    setFilters(current => ({ ...current, from, to }))
  }

  // Lista canônica de quadros disponíveis
  const canonicalGeneral: Board = useMemo(() => ({
    id: 'board-geral',
    name: 'Geral',
    description: 'Quadro Geral corporativo',
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

  const allBoards: Board[] = useMemo(() => [
    canonicalGeneral,
    ...(data.boards || []).filter(b => b.id !== 'board-geral'),
  ], [canonicalGeneral, data.boards])

  const selectedBoard = useMemo(() => {
    if (!filters.boardId || filters.boardId === 'all') return undefined
    return allBoards.find(b => b.id === filters.boardId)
  }, [allBoards, filters.boardId])

  const report = useMemo(() => buildReport(
    data.tasks,
    data.stages,
    filters,
    today,
    data.boardStages || [],
    allBoards,
    data.sprints || []
  ), [data.tasks, data.stages, filters, today, data.boardStages, allBoards, data.sprints])

  const visible = useMemo(() => report.rows.filter(task =>
    `${task.title} ${task.description}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
  ), [report.rows, query])

  const teams = useMemo(() => data.teams.filter(team => data.tasks.some(task => task.team_id === team.id)), [data.teams, data.tasks])
  const people = useMemo(() => data.profiles.filter(person => data.tasks.some(task => task.assignee_id === person.id)), [data.profiles, data.tasks])
  const clients = useMemo(() => data.clients.filter(client => data.tasks.some(task => task.client_id === client.id)), [data.clients, data.tasks])

  const teamName = (id: string) => data.teams.find(team => team.id === id)?.name || 'Equipe removida'
  const personName = (id: string | null) => data.profiles.find(person => person.id === id)?.full_name || 'Sem responsável'
  const clientName = (id: string | null) => data.clients.find(client => client.id === id)?.name || '—'

  const taskBoardName = (task: Task) => {
    if (!task.board_id || task.board_id === 'board-geral') return 'Geral'
    const b = allBoards.find(x => x.id === task.board_id)
    return b ? b.name : 'Personalizado'
  }

  function getTaskDisplay(task: Task) {
    const stageInfo = resolveTaskStage(task, data.stages, data.boardStages || [])
    const board = allBoards.find(b => b.id === (task.board_id || 'board-geral'))
    const isSprintActive = Boolean(task.sprint_id && (data.sprints || []).some(s => s.id === task.sprint_id && s.status === 'active'))
    const isSprintPlanning = Boolean(task.sprint_id && (data.sprints || []).some(s => s.id === task.sprint_id && s.status === 'planning'))

    let statusKey: ReportFilterStatus = 'active'
    let statusLabel = 'Em andamento'

    if (stageInfo.isFinal) {
      statusKey = 'done'
      statusLabel = 'Concluída'
    } else if (stageInfo.isPause) {
      statusKey = 'blocked'
      statusLabel = 'Pausada'
    } else if (board?.methodology === 'scrum') {
      if (!task.sprint_id) {
        statusKey = 'backlog'
        statusLabel = 'Backlog'
      } else if (isSprintPlanning) {
        statusKey = 'backlog'
        statusLabel = 'Sprint planejada'
      } else if (isSprintActive) {
        statusKey = 'active'
        statusLabel = 'Em andamento'
      }
    }

    const overdue = isTaskOverdue(task, statusKey === 'done' ? 'done' : statusKey === 'blocked' ? 'blocked' : statusKey === 'backlog' ? 'backlog' : 'active', today)

    return {
      stageName: stageInfo.name,
      stageColor: stageInfo.color,
      statusKey,
      statusLabel,
      overdue,
    }
  }

  function exportCsv() {
    const header = ['Tarefa', 'Quadro', 'Equipe', 'Responsável', 'Cliente', 'Etapa', 'Situação', 'Atrasada', 'Ramificação', 'Encaminhada', 'Prioridade', 'Prazo', 'Criação', 'Conclusão']
    const lines = [header, ...visible.map(task => {
      const disp = getTaskDisplay(task)
      return [
        task.title,
        taskBoardName(task),
        teamName(task.team_id),
        personName(task.assignee_id),
        clientName(task.client_id),
        disp.stageName,
        disp.statusLabel,
        disp.overdue ? 'Sim' : 'Não',
        task.origin_task_id ? 'Sim' : 'Não',
        task.forwarded_at ? 'Sim' : 'Não',
        priorityNames[task.priority],
        task.due_at || '',
        task.created_at.slice(0, 10),
        task.completed_at || '',
      ]
    })]
    const csv = '\uFEFF' + lines.map(line => line.map(reportCsvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `somax-relatorio-tarefas-${today}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportBoardSummaryCsv() {
    const csv = buildBoardSummaryCsv(report.boardSummaries, report.totals)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `somax-resumo-quadros-${today}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const metrics: { key: ReportFilterStatus; icon: typeof BarChart3; subtitle: string }[] = [
    { key: 'all', icon: BarChart3, subtitle: 'Total no período' },
    { key: 'active', icon: Timer, subtitle: 'Em execução' },
    { key: 'done', icon: CheckCircle2, subtitle: 'Concluídas no período' },
    { key: 'blocked', icon: PauseCircle, subtitle: 'Em etapa de pausa' },
    { key: 'backlog', icon: Layers, subtitle: 'Scrum / Planejadas' },
    { key: 'overdue', icon: CalendarDays, subtitle: 'Prazo expirado' },
  ]

  const sectorViews = allBoards.filter(b => b.type === 'sector_view')
  const customBoards = allBoards.filter(b => b.type === 'custom')

  return (
    <section className="content reports-page">
      <div className="page-heading reports-heading">
        <div>
          <div className="eyebrow">VISÃO DE TAREFAS & QUADROS</div>
          <h1>Relatórios</h1>
          <p>
            Acompanhe o fluxo consolidado com concordância absoluta entre os quadros Kanban, visões de setor e Scrum.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!visible.length}>
          <Download size={15} /> Exportar CSV
        </button>
      </div>

      <div className="reports-filter-panel">
        <div className="reports-presets-bar" role="group" aria-label="Atalhos rápidos de período">
          <span className="reports-presets-label">Período:</span>
          <button
            type="button"
            className={`preset-btn ${preset === 'this_month' ? 'active' : ''}`}
            onClick={() => applyPreset('this_month')}
          >
            Este Mês
          </button>
          <button
            type="button"
            className={`preset-btn ${preset === 'this_week' ? 'active' : ''}`}
            onClick={() => applyPreset('this_week')}
          >
            Esta Semana
          </button>
          <button
            type="button"
            className={`preset-btn ${preset === 'last_30_days' ? 'active' : ''}`}
            onClick={() => applyPreset('last_30_days')}
          >
            Últimos 30 dias
          </button>
          <button
            type="button"
            className={`preset-btn ${preset === 'custom' ? 'active' : ''}`}
            onClick={() => setPreset('custom')}
          >
            Personalizado
          </button>
        </div>

        <div className="reports-filter-grid reports-filter-grid-v2">
          {/* 1. Dimensão: Quadro */}
          <label className="field">
            <span>Quadro</span>
            <select
              value={filters.boardId || 'all'}
              onChange={event => setFilters(current => ({ ...current, boardId: event.target.value }))}
            >
              <optgroup label="Visão Geral">
                <option value="all">Todos os meus quadros</option>
                <option value="board-geral">Quadro Geral (Canônico)</option>
              </optgroup>
              {sectorViews.length > 0 && (
                <optgroup label="Visões por Setor (Filtros do Geral)">
                  {sectorViews.map(view => (
                    <option key={view.id} value={view.id}>
                      Visão: {view.name} [Geral]
                    </option>
                  ))}
                </optgroup>
              )}
              {customBoards.length > 0 && (
                <optgroup label="Quadros Personalizados">
                  {customBoards.map(board => (
                    <option key={board.id} value={board.id}>
                      {board.name} ({board.methodology === 'scrum' ? 'Scrum' : 'Kanban'})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          {/* 2. Escopo Scrum (quando selecionado quadro Scrum) */}
          {selectedBoard?.methodology === 'scrum' && (
            <label className="field">
              <span>Escopo Scrum</span>
              <select
                value={filters.scrumScope || 'all'}
                onChange={event => setFilters(current => ({ ...current, scrumScope: event.target.value as ScrumScopeFilter }))}
              >
                <option value="all">Todo o quadro (com backlog)</option>
                <option value="active_sprint">Apenas sprint ativa</option>
              </select>
            </label>
          )}

          {/* 3. Filtro de Data */}
          <label className="field">
            <span>Filtrar por</span>
            <select
              value={filters.dateField || 'created'}
              onChange={event => setFilters(current => ({ ...current, dateField: event.target.value as DateFieldFilter }))}
            >
              {(Object.entries(dateFieldNames) as [DateFieldFilter, string][]).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>De</span>
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={event => {
                setPreset('custom')
                setFilters(current => ({ ...current, from: event.target.value }))
              }}
            />
          </label>

          <label className="field">
            <span>Até</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={event => {
                setPreset('custom')
                setFilters(current => ({ ...current, to: event.target.value }))
              }}
            />
          </label>

          <label className="field">
            <span>Equipe</span>
            <select
              value={filters.teamId}
              onChange={event => setFilters(current => ({ ...current, teamId: event.target.value }))}
            >
              <option value="">Todas as equipes</option>
              {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Responsável</span>
            <select
              value={filters.assigneeId}
              onChange={event => setFilters(current => ({ ...current, assigneeId: event.target.value }))}
            >
              <option value="">Todos</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Cliente</span>
            <select
              value={filters.clientId}
              onChange={event => setFilters(current => ({ ...current, clientId: event.target.value }))}
            >
              <option value="">Todos</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>

          <label className="field field-checkbox-inline" title="Exibe apenas as tarefas originais de cada jornada, ocultando ramificações para não inflar contagens">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', height: '100%', paddingTop: '1.25rem' }}>
              <input
                type="checkbox"
                checked={Boolean(filters.hideBranches)}
                onChange={event => setFilters(current => ({ ...current, hideBranches: event.target.checked }))}
              />
              Ocultar ramificações
            </span>
          </label>

          <button
            type="button"
            className="reports-clear"
            onClick={() => {
              setPreset('custom')
              setFilters({
                from: '',
                to: '',
                dateField: 'created',
                boardId: 'all',
                scrumScope: 'all',
                teamId: '',
                assigneeId: '',
                clientId: '',
                status: 'all',
                hideBranches: false,
              })
              setQuery('')
            }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {/* Placar Executivo Somax Analytics */}
      <div className="reports-executive-bar" role="region" aria-label="Placar Executivo">
        <button
          type="button"
          className={`executive-card ${activeTab === 'pontualidade' ? 'active' : ''}`}
          onClick={() => setActiveTab('pontualidade')}
          title="Ver detalhes de pontualidade e radar preventivo"
        >
          <div className="executive-card-head">
            <span className="executive-badge success">
              <CheckCircle2 size={13} /> SLA de Entrega
            </span>
            <span className="executive-link-hint">Ver aba &rarr;</span>
          </div>
          <div className="executive-main-val">
            <strong>{report.punctualityMetrics.onTimeRate}%</strong>
            <span className="executive-unit">no prazo</span>
          </div>
          <p className="executive-desc">
            {report.punctualityMetrics.completedOnTimeCount} de {report.punctualityMetrics.completedTotalWithDueDate} concluídas no prazo
            {report.punctualityMetrics.riskTasks.length > 0 && (
              <span className="executive-alert-pill">
                · {report.punctualityMetrics.riskTasks.length} a vencer
              </span>
            )}
          </p>
        </button>

        <button
          type="button"
          className={`executive-card ${activeTab === 'gargalos' ? 'active' : ''}`}
          onClick={() => setActiveTab('gargalos')}
          title="Ver gargalos de fluxo e tarefas estagnadas"
        >
          <div className="executive-card-head">
            <span className="executive-badge warning">
              <Clock size={13} /> Gargalo da Esteira
            </span>
            <span className="executive-link-hint">Ver aba &rarr;</span>
          </div>
          <div className="executive-main-val">
            {report.bottleneckMetrics.topBottleneckStage ? (
              <>
                <strong>~{report.bottleneckMetrics.topBottleneckStage.avgDays}d</strong>
                <span className="executive-unit">em {report.bottleneckMetrics.topBottleneckStage.stageName}</span>
              </>
            ) : (
              <>
                <strong>Fluxo Livre</strong>
                <span className="executive-unit">sem retenção</span>
              </>
            )}
          </div>
          <p className="executive-desc">
            {report.bottleneckMetrics.stagnantTasks.length > 0
              ? `${report.bottleneckMetrics.stagnantTasks.length} ${report.bottleneckMetrics.stagnantTasks.length === 1 ? 'tarefa parada' : 'tarefas paradas'} há mais de 5 dias`
              : 'Nenhuma tarefa estagnada há mais de 5 dias'}
          </p>
        </button>

        <button
          type="button"
          className={`executive-card ${activeTab === 'equipe' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipe')}
          title="Ver distribuição de tarefas e capacidade das pessoas"
        >
          <div className="executive-card-head">
            <span className="executive-badge info">
              <Users size={13} /> Equipe &amp; Capacidade
            </span>
            <span className="executive-link-hint">Ver aba &rarr;</span>
          </div>
          <div className="executive-main-val">
            {report.teamCapacityMetrics.overloadedCount > 0 ? (
              <>
                <strong className="text-danger">{report.teamCapacityMetrics.overloadedCount}</strong>
                <span className="executive-unit">em sobrecarga crítica</span>
              </>
            ) : (
              <>
                <strong className="text-success">Equilibrada</strong>
                <span className="executive-unit">zero sobrecargas</span>
              </>
            )}
          </div>
          <p className="executive-desc">
            Média de {report.teamCapacityMetrics.averageActivePerMember} tarefas ativas por colaborador
          </p>
        </button>
      </div>

      {/* Navegação de Abas */}
      <nav className="reports-tabs-nav" role="tablist" aria-label="Seções do Relatório">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'quadros'}
          className={`reports-tab-btn ${activeTab === 'quadros' ? 'active' : ''}`}
          onClick={() => setActiveTab('quadros')}
        >
          <FolderKanban size={16} />
          <span>Quadros &amp; Detalhes</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gargalos'}
          className={`reports-tab-btn ${activeTab === 'gargalos' ? 'active' : ''}`}
          onClick={() => setActiveTab('gargalos')}
        >
          <Clock size={16} />
          <span>Gargalos &amp; Fluxo</span>
          {report.bottleneckMetrics.stagnantTasks.length > 0 && (
            <span className="tab-pill-warning" title={`${report.bottleneckMetrics.stagnantTasks.length} tarefas paradas há mais de 5 dias`}>
              {report.bottleneckMetrics.stagnantTasks.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'equipe'}
          className={`reports-tab-btn ${activeTab === 'equipe' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipe')}
        >
          <Users size={16} />
          <span>Pessoas &amp; Carga</span>
          {report.teamCapacityMetrics.overloadedCount > 0 && (
            <span className="tab-pill-danger" title={`${report.teamCapacityMetrics.overloadedCount} pessoas em sobrecarga crítica`}>
              {report.teamCapacityMetrics.overloadedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pontualidade'}
          className={`reports-tab-btn ${activeTab === 'pontualidade' ? 'active' : ''}`}
          onClick={() => setActiveTab('pontualidade')}
        >
          <CheckCircle2 size={16} />
          <span>Pontualidade &amp; Prazos</span>
          {report.punctualityMetrics.riskTasks.length > 0 && (
            <span className="tab-pill-warning" title={`${report.punctualityMetrics.riskTasks.length} tarefas vencendo em até 3 dias`}>
              {report.punctualityMetrics.riskTasks.length}
            </span>
          )}
        </button>
      </nav>

      {/* Conteúdo da Aba 1: Quadros & Detalhes */}
      {activeTab === 'quadros' && (
        <div className="reports-tab-pane">
          {/* Cards de Métricas Consolidadas */}
          <div className="reports-metrics reports-metrics-v2">
            {metrics.map(({ key, icon: Icon, subtitle }) => (
              <button
                key={key}
                type="button"
                className={`reports-metric ${filters.status === key ? 'selected' : ''}`}
                onClick={() => setFilters(current => ({ ...current, status: key }))}
              >
                <span className={`reports-metric-icon ${key}`}>
                  <Icon size={18} />
                </span>
                <strong>{report.totals[key]}</strong>
                <span>{statusNames[key]}</span>
                <small>{subtitle}</small>
              </button>
            ))}
          </div>

      {/* Quadro-Resumo: Exibido na Visão Consolidada ("Todos os meus quadros") */}
      {(!filters.boardId || filters.boardId === 'all') && (
        <section className="reports-panel reports-board-summary-box">
          <div className="reports-panel-head reports-summary-head-actions">
            <div>
              <div className="reports-title-inline">
                <FolderKanban size={18} className="reports-title-icon" aria-hidden="true" />
                <h2>Resumo por Quadro</h2>
              </div>
              <p>Concordância líquida de tarefas entre os quadros canônicos e personalizados (visões de setor não duplicam tarefas).</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm reports-summary-export-btn"
              onClick={exportBoardSummaryCsv}
              disabled={report.boardSummaries.length === 0}
              title="Exportar resumo consolidado dos quadros em CSV"
              aria-label="Exportar resumo consolidado dos quadros em CSV"
            >
              <Download size={14} /> Exportar resumo (CSV)
            </button>
          </div>

          <div className="table-wrap report-table-wrap">
            <table className="data-table reports-summary-table report-board-table">
              <thead>
                <tr>
                  <th>Quadro</th>
                  <th className="num-col">Total</th>
                  <th className="num-col">Em andamento</th>
                  <th className="num-col">Pausadas</th>
                  <th className="num-col">Concluídas</th>
                  <th className="num-col">Atrasadas</th>
                </tr>
              </thead>
              <tbody>
                {report.boardSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="reports-empty-table">
                      Nenhum quadro encontrado para o filtro selecionado.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* 1. Quadros Independentes (Soma real) */}
                    {report.boardSummaries.filter(b => !b.isMirrorView).map(b => (
                      <tr
                        key={b.boardId}
                        className="summary-row-clickable"
                        onClick={() => setFilters(current => ({ ...current, boardId: b.boardId }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setFilters(current => ({ ...current, boardId: b.boardId }))
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Filtrar pelo quadro ${b.boardName}`}
                        title="Clique na linha para filtrar apenas este quadro"
                      >
                        <td>
                          <span className="table-title">
                            <strong>{b.boardName}</strong>
                          </span>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar todas as tarefas do quadro ${b.boardName}`}
                            aria-label={`Filtrar todas as tarefas do quadro ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'all' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'all' }))
                              }
                            }}
                          >
                            <strong className={b.total === 0 ? 'num-zero' : ''}>{b.total}</strong>
                          </span>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas em andamento do quadro ${b.boardName}`}
                            aria-label={`Filtrar tarefas em andamento do quadro ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'active' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'active' }))
                              }
                            }}
                          >
                            <span className={b.active === 0 ? 'num-zero' : ''}>{b.active}</span>
                          </span>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas pausadas do quadro ${b.boardName}`}
                            aria-label={`Filtrar tarefas pausadas do quadro ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'blocked' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'blocked' }))
                              }
                            }}
                          >
                            <span className={b.blocked === 0 ? 'num-zero' : ''}>{b.blocked}</span>
                          </span>
                        </td>
                        <td className="num-col text-success">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas concluídas do quadro ${b.boardName}`}
                            aria-label={`Filtrar tarefas concluídas do quadro ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'done' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'done' }))
                              }
                            }}
                          >
                            <strong className={b.done === 0 ? 'num-zero' : ''}>{b.done}</strong>
                          </span>
                        </td>
                        <td className="num-col text-danger">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas atrasadas do quadro ${b.boardName}`}
                            aria-label={`Filtrar tarefas atrasadas do quadro ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'overdue' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'overdue' }))
                              }
                            }}
                          >
                            {b.overdue > 0 ? (
                              <span className="num-with-icon">
                                <Clock size={12} aria-hidden="true" />
                                <strong>{b.overdue}</strong>
                              </span>
                            ) : (
                              <span className="num-zero">0</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* Linha de Total Consolidado */}
                    <tr className="summary-row-total">
                      <td>
                        <div className="table-title">
                          <strong>TOTAL CONSOLIDADO</strong>
                          <small className="muted">Soma líquida dos quadros</small>
                        </div>
                      </td>
                      <td className="num-col">
                        <span
                          className="summary-cell-clickable"
                          role="button"
                          tabIndex={0}
                          title="Filtrar todas as tarefas consolidadas"
                          aria-label="Filtrar todas as tarefas consolidadas"
                          onClick={e => {
                            e.stopPropagation()
                            setFilters(current => ({ ...current, boardId: 'all', status: 'all' }))
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              setFilters(current => ({ ...current, boardId: 'all', status: 'all' }))
                            }
                          }}
                        >
                          <strong className={report.totals.all === 0 ? 'num-zero' : ''}>{report.totals.all}</strong>
                        </span>
                      </td>
                      <td className="num-col">
                        <span
                          className="summary-cell-clickable"
                          role="button"
                          tabIndex={0}
                          title="Filtrar tarefas em andamento consolidadas"
                          aria-label="Filtrar tarefas em andamento consolidadas"
                          onClick={e => {
                            e.stopPropagation()
                            setFilters(current => ({ ...current, boardId: 'all', status: 'active' }))
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              setFilters(current => ({ ...current, boardId: 'all', status: 'active' }))
                            }
                          }}
                        >
                          <span className={report.totals.active === 0 ? 'num-zero' : ''}>{report.totals.active}</span>
                        </span>
                      </td>
                      <td className="num-col">
                        <span
                          className="summary-cell-clickable"
                          role="button"
                          tabIndex={0}
                          title="Filtrar tarefas pausadas consolidadas"
                          aria-label="Filtrar tarefas pausadas consolidadas"
                          onClick={e => {
                            e.stopPropagation()
                            setFilters(current => ({ ...current, boardId: 'all', status: 'blocked' }))
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              setFilters(current => ({ ...current, boardId: 'all', status: 'blocked' }))
                            }
                          }}
                        >
                          <span className={report.totals.blocked === 0 ? 'num-zero' : ''}>{report.totals.blocked}</span>
                        </span>
                      </td>
                      <td className="num-col text-success">
                        <span
                          className="summary-cell-clickable"
                          role="button"
                          tabIndex={0}
                          title="Filtrar tarefas concluídas consolidadas"
                          aria-label="Filtrar tarefas concluídas consolidadas"
                          onClick={e => {
                            e.stopPropagation()
                            setFilters(current => ({ ...current, boardId: 'all', status: 'done' }))
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              setFilters(current => ({ ...current, boardId: 'all', status: 'done' }))
                            }
                          }}
                        >
                          <strong className={report.totals.done === 0 ? 'num-zero' : ''}>{report.totals.done}</strong>
                        </span>
                      </td>
                      <td className="num-col text-danger">
                        <span
                          className="summary-cell-clickable"
                          role="button"
                          tabIndex={0}
                          title="Filtrar tarefas atrasadas consolidadas"
                          aria-label="Filtrar tarefas atrasadas consolidadas"
                          onClick={e => {
                            e.stopPropagation()
                            setFilters(current => ({ ...current, boardId: 'all', status: 'overdue' }))
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              setFilters(current => ({ ...current, boardId: 'all', status: 'overdue' }))
                            }
                          }}
                        >
                          {report.totals.overdue > 0 ? (
                            <span className="num-with-icon">
                              <Clock size={12} aria-hidden="true" />
                              <strong>{report.totals.overdue}</strong>
                            </span>
                          ) : (
                            <span className="num-zero">0</span>
                          )}
                        </span>
                      </td>
                    </tr>

                    {/* 2. Visões por Setor (Informativas, fora do total) */}
                    {report.boardSummaries.filter(b => b.isMirrorView).map(b => (
                      <tr
                        key={b.boardId}
                        className="summary-row-mirror summary-row-clickable"
                        onClick={() => setFilters(current => ({ ...current, boardId: b.boardId }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setFilters(current => ({ ...current, boardId: b.boardId }))
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Filtrar pela visão ${b.boardName}`}
                        title="Clique na linha para filtrar esta visão do Geral"
                      >
                        <td>
                          <div className="table-title">
                            <strong>Visão: {b.boardName}</strong>
                            <small className="badge-mirror-note">Lente do Quadro Geral</small>
                          </div>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar todas as tarefas da visão ${b.boardName}`}
                            aria-label={`Filtrar todas as tarefas da visão ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'all' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'all' }))
                              }
                            }}
                          >
                            <span className={b.total === 0 ? 'num-zero' : ''}>{b.total}</span>
                          </span>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas em andamento da visão ${b.boardName}`}
                            aria-label={`Filtrar tarefas em andamento da visão ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'active' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'active' }))
                              }
                            }}
                          >
                            <span className={b.active === 0 ? 'num-zero' : ''}>{b.active}</span>
                          </span>
                        </td>
                        <td className="num-col">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas pausadas da visão ${b.boardName}`}
                            aria-label={`Filtrar tarefas pausadas da visão ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'blocked' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'blocked' }))
                              }
                            }}
                          >
                            <span className={b.blocked === 0 ? 'num-zero' : ''}>{b.blocked}</span>
                          </span>
                        </td>
                        <td className="num-col text-success">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas concluídas da visão ${b.boardName}`}
                            aria-label={`Filtrar tarefas concluídas da visão ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'done' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'done' }))
                              }
                            }}
                          >
                            <span className={b.done === 0 ? 'num-zero' : ''}>{b.done}</span>
                          </span>
                        </td>
                        <td className="num-col text-danger">
                          <span
                            className="summary-cell-clickable"
                            role="button"
                            tabIndex={0}
                            title={`Filtrar tarefas atrasadas da visão ${b.boardName}`}
                            aria-label={`Filtrar tarefas atrasadas da visão ${b.boardName}`}
                            onClick={e => {
                              e.stopPropagation()
                              setFilters(current => ({ ...current, boardId: b.boardId, status: 'overdue' }))
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                e.preventDefault()
                                setFilters(current => ({ ...current, boardId: b.boardId, status: 'overdue' }))
                              }
                            }}
                          >
                            {b.overdue > 0 ? (
                              <span className="num-with-icon">
                                <Clock size={12} aria-hidden="true" />
                                <strong>{b.overdue}</strong>
                              </span>
                            ) : (
                              <span className="num-zero">0</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Gráficos de Distribuição */}
      <div className="reports-charts">
        <section className="reports-panel">
          <div className="reports-panel-head">
            <h2>Tarefas por equipe</h2>
            <p>Distribuição das tarefas no período</p>
          </div>
          <div className="reports-bar-list">
            {[...report.teamCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => (
              <div className="reports-bar-row" key={id}>
                <span>{teamName(id)}</span>
                <div>
                  <i style={{
                    width: `${count / Math.max(report.totals.all, 1) * 100}%`,
                    background: data.teams.find(team => team.id === id)?.color || '#6366f1',
                  }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
            {!report.teamCounts.size && <p className="reports-empty">Nenhuma tarefa para os filtros escolhidos.</p>}
          </div>
        </section>

        <section className="reports-panel">
          <div className="reports-panel-head">
            <h2>Tarefas por etapa</h2>
            <p>Etapa atual de cada tarefa (Geral e Personalizadas)</p>
          </div>
          <div className="reports-bar-list">
            {[...report.stageCounts.entries()].sort((a, b) => b[1].count - a[1].count).map(([id, stg]) => (
              <div className="reports-bar-row" key={id}>
                <span>{stg.name}</span>
                <div>
                  <i style={{
                    width: `${stg.count / Math.max(report.totals.all, 1) * 100}%`,
                    background: stg.color,
                  }} />
                </div>
                <strong>{stg.count}</strong>
              </div>
            ))}
            {!report.stageCounts.size && <p className="reports-empty">Nenhuma tarefa para os filtros escolhidos.</p>}
          </div>
        </section>
      </div>

      {/* Tabela Detalhada de Tarefas */}
      <section className="reports-panel reports-list">
        <div className="reports-list-head">
          <div>
            <h2>Tarefas do relatório</h2>
            <p>
              {visible.length} {visible.length === 1 ? 'tarefa exibida' : 'tarefas exibidas'} · {report.totals.journeys} {report.totals.journeys === 1 ? 'jornada única' : 'jornadas únicas'} · {statusNames[filters.status].toLowerCase()}
            </p>
          </div>
          <div className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar no relatório..."
              aria-label="Buscar no relatório"
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Quadro</th>
                <th>Equipe</th>
                <th>Responsável</th>
                <th>Etapa</th>
                <th>Situação</th>
                <th>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(task => {
                const disp = getTaskDisplay(task)
                const branchTask = task.forwarded_at ? data.tasks.find(x => x.origin_task_id === task.id) : undefined
                const originTask = task.origin_task_id ? data.tasks.find(x => x.id === task.origin_task_id) : undefined
                const targetBoardName = branchTask
                  ? (allBoards.find(b => b.id === (branchTask.board_id || 'board-geral'))?.name || 'Geral')
                  : 'Destino'
                const originBoardName = originTask
                  ? (allBoards.find(b => b.id === (originTask.board_id || 'board-geral'))?.name || 'Geral')
                  : 'Origem'

                return (
                  <tr key={task.id}>
                    <td>
                      <button type="button" className="table-title" onClick={() => onTask(task)}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>{task.title}</span>
                          {task.origin_task_id && (
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
                          {task.forwarded_at && (
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
                        </span>
                        <small>{clientName(task.client_id)}</small>
                      </button>
                    </td>
                    <td>
                      <span className="team-tiny">{taskBoardName(task)}</span>
                    </td>
                    <td>{teamName(task.team_id)}</td>
                    <td>{personName(task.assignee_id)}</td>
                    <td>
                      <span className="stage-pill" style={{ color: disp.stageColor }}>
                        {disp.stageName}
                      </span>
                    </td>
                    <td>
                      <div className="status-cell-wrap">
                        <span className={`reports-status ${disp.statusKey}`}>
                          {disp.statusLabel}
                        </span>
                        {disp.overdue && (
                          <span className="reports-overdue-tag" title="Prazo vencido (indicador de alerta)">
                            <Clock size={11} /> Atrasada
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{dateBR(task.due_at)}</td>
                  </tr>
                )
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={7} className="reports-empty-table">
                    Nenhuma tarefa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
        </div>
      )}

      {/* Conteúdo da Aba 2: Gargalos & Fluxo */}
      {activeTab === 'gargalos' && (
        <div className="reports-tab-pane">
          {/* 1. Ranking de Retenção por Etapa */}
          <section className="reports-panel">
            <div className="reports-panel-head">
              <h2>Tempo Médio de Retenção por Etapa</h2>
              <p>Média de permanência das tarefas em cada estágio do fluxo operacional.</p>
            </div>
            <div className="reports-retention-list">
              {report.bottleneckMetrics.stageRetentions.length === 0 ? (
                <p className="reports-empty" style={{ padding: '16px 19px' }}>
                  Nenhuma etapa com tarefas registradas no momento.
                </p>
              ) : (
                report.bottleneckMetrics.stageRetentions.map(stage => {
                  const maxDays = Math.max(...report.bottleneckMetrics.stageRetentions.map(s => s.avgDays), 1)
                  const percent = Math.min(Math.round((stage.avgDays / maxDays) * 100), 100)
                  return (
                    <div key={stage.stageId} className="retention-row">
                      <div className="retention-info">
                        <span className="retention-stage-name" style={{ borderLeftColor: stage.color }}>
                          {stage.stageName}
                        </span>
                        <span className="retention-task-count">
                          {stage.taskCount} {stage.taskCount === 1 ? 'tarefa' : 'tarefas'}
                        </span>
                      </div>
                      <div className="retention-bar-track">
                        <div
                          className={`retention-bar-fill ${stage.status}`}
                          style={{ width: `${Math.max(percent, 8)}%` }}
                        />
                      </div>
                      <div className="retention-stat">
                        <strong>~{stage.avgDays} dias</strong>
                        <span className={`retention-badge ${stage.status}`}>
                          {stage.status === 'rapido' && 'Rápido'}
                          {stage.status === 'normal' && 'Normal'}
                          {stage.status === 'alerta' && 'Alerta'}
                          {stage.status === 'critico' && 'Gargalo Crítico'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* 2. Tarefas Estagnadas */}
          <section className="reports-panel">
            <div className="reports-panel-head">
              <div className="reports-title-inline">
                <AlertTriangle size={17} className="text-warning" aria-hidden="true" />
                <h2>Radar de Tarefas Estagnadas</h2>
              </div>
              <p>Tarefas ativas sem movimentação há mais de 5 dias na mesma etapa.</p>
            </div>

            <div className="reports-stagnant-content">
              {report.bottleneckMetrics.stagnantTasks.length === 0 ? (
                <div className="reports-empty-success-box">
                  <CheckCircle2 size={32} className="text-success" />
                  <div>
                    <strong>Fluxo Contínuo &amp; Saudável!</strong>
                    <p>Nenhuma tarefa ativa está parada há mais de 5 dias na mesma etapa.</p>
                  </div>
                </div>
              ) : (
                <div className="stagnant-tasks-grid">
                  {report.bottleneckMetrics.stagnantTasks.map(({ task, stageName, stageColor, daysInStage }) => (
                    <div key={task.id} className="stagnant-task-card">
                      <div className="stagnant-card-top">
                        <span className="stage-pill" style={{ color: stageColor }}>
                          {stageName}
                        </span>
                        <span className="stagnant-badge-danger">
                          <Clock size={12} /> {daysInStage} dias parada
                        </span>
                      </div>
                      <button
                        type="button"
                        className="stagnant-title-btn"
                        onClick={() => onTask(task)}
                      >
                        {task.title}
                      </button>
                      <div className="stagnant-meta">
                        <span><strong>Resp:</strong> {personName(task.assignee_id)}</span>
                        <span><strong>Cliente:</strong> {clientName(task.client_id)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onTask(task)}
                      >
                        Abrir tarefa
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Conteúdo da Aba 3: Pessoas & Carga */}
      {activeTab === 'equipe' && (
        <div className="reports-tab-pane">
          <section className="reports-panel">
            <div className="reports-panel-head">
              <h2>Capacidade &amp; Distribuição por Pessoa</h2>
              <p>Visão de carga operacional para prevenir sobrecargas e equilibrar o time.</p>
            </div>

            <div className="reports-workload-content">
              {report.teamCapacityMetrics.members.length === 0 ? (
                <p className="reports-empty" style={{ padding: '16px 19px' }}>
                  Nenhum colaborador com tarefas alocadas no período.
                </p>
              ) : (
                <div className="reports-workload-grid">
                  {report.teamCapacityMetrics.members.map(member => {
                    const fullName = personName(member.userId)
                    const initials = fullName
                      .split(' ')
                      .slice(0, 2)
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()
                    const loadPercent = Math.min(Math.round((member.activeCount / 8) * 100), 100)

                    return (
                      <div key={member.userId} className={`workload-card ${member.capacityStatus}`}>
                        <div className="workload-card-head">
                          <div className="workload-avatar" aria-hidden="true">
                            {initials || 'U'}
                          </div>
                          <div className="workload-person-info">
                            <strong>{fullName}</strong>
                            <span className={`workload-badge ${member.capacityStatus}`}>
                              {member.capacityStatus === 'sobrecarga' && 'Sobrecarga Crítica (≥ 8)'}
                              {member.capacityStatus === 'alerta' && 'Alerta de Carga (5-7)'}
                              {member.capacityStatus === 'equilibrado' && 'Carga Equilibrada'}
                              {member.capacityStatus === 'disponivel' && 'Disponível'}
                            </span>
                          </div>
                        </div>

                        <div className="workload-bar-box">
                          <div className="workload-bar-label">
                            <span>Ocupação ativa</span>
                            <strong>{member.activeCount} {member.activeCount === 1 ? 'tarefa' : 'tarefas'}</strong>
                          </div>
                          <div className="workload-track">
                            <div
                              className={`workload-fill ${member.capacityStatus}`}
                              style={{ width: `${Math.max(loadPercent, member.activeCount > 0 ? 10 : 0)}%` }}
                            />
                          </div>
                        </div>

                        <div className="workload-stats-row">
                          <div className="workload-stat-col">
                            <small>Ativas</small>
                            <strong>{member.activeCount}</strong>
                          </div>
                          <div className="workload-stat-col text-success">
                            <small>Concluídas</small>
                            <strong>{member.doneCount}</strong>
                          </div>
                          <div className="workload-stat-col text-danger">
                            <small>Atrasadas</small>
                            <strong>{member.overdueCount}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm workload-filter-btn"
                          onClick={() => {
                            setFilters(c => ({ ...c, assigneeId: member.userId, status: 'all' }))
                            setActiveTab('quadros')
                          }}
                        >
                          Ver tarefas desta pessoa &rarr;
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Conteúdo da Aba 4: Pontualidade & Prazos */}
      {activeTab === 'pontualidade' && (
        <div className="reports-tab-pane">
          {/* 1. Indicador de SLA / Pontualidade */}
          <section className="reports-panel">
            <div className="reports-panel-head">
              <h2>SLA de Entrega &amp; Pontualidade</h2>
              <p>Proporção de tarefas concluídas rigorosamente antes ou no dia do prazo estipulado.</p>
            </div>

            <div className="punctuality-display-panel">
              <div className="punctuality-main-kpi">
                <div className="punctuality-circle-stat">
                  <strong>{report.punctualityMetrics.onTimeRate}%</strong>
                  <span>Taxa no Prazo</span>
                </div>
                <div className="punctuality-progress-wrap">
                  <div className="punctuality-progress-track">
                    <div
                      className="punctuality-progress-fill"
                      style={{ width: `${report.punctualityMetrics.onTimeRate}%` }}
                    />
                  </div>
                  <div className="punctuality-kpi-subtext">
                    Meta ideal Somax: &ge; 85% de entregas no prazo
                  </div>
                </div>
              </div>

              <div className="punctuality-breakdown-grid">
                <div className="punctuality-box on-time">
                  <CheckCircle2 size={18} className="text-success" />
                  <div>
                    <strong>{report.punctualityMetrics.completedOnTimeCount}</strong>
                    <span>Concluídas no prazo</span>
                  </div>
                </div>

                <div className="punctuality-box late">
                  <Clock size={18} className="text-danger" />
                  <div>
                    <strong>{report.punctualityMetrics.completedLateCount}</strong>
                    <span>Entregues com atraso</span>
                  </div>
                </div>

                <div className="punctuality-box delay-avg">
                  <CalendarDays size={18} className="text-warning" />
                  <div>
                    <strong>~{report.punctualityMetrics.averageLateDays} dias</strong>
                    <span>Média de atraso quando atrasa</span>
                  </div>
                </div>

                <div className="punctuality-box total">
                  <BarChart3 size={18} />
                  <div>
                    <strong>{report.punctualityMetrics.completedTotalWithDueDate}</strong>
                    <span>Total com prazo avaliado</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Radar Preventivo de Prazos */}
          <section className="reports-panel">
            <div className="reports-panel-head">
              <div className="reports-title-inline">
                <Clock size={17} className="text-warning" aria-hidden="true" />
                <h2>Radar Preventivo de Prazos (Tarefas em Risco)</h2>
              </div>
              <p>Tarefas ativas vencendo hoje ou nos próximos 3 dias que exigem prioridade para não violar o SLA.</p>
            </div>

            <div className="reports-risk-content">
              {report.punctualityMetrics.riskTasks.length === 0 ? (
                <div className="reports-empty-success-box">
                  <CheckCircle2 size={32} className="text-success" />
                  <div>
                    <strong>Prazos Sob Controle!</strong>
                    <p>Nenhuma tarefa ativa em risco iminente de vencimento nos próximos 3 dias.</p>
                  </div>
                </div>
              ) : (
                <div className="risk-tasks-grid">
                  {report.punctualityMetrics.riskTasks.map(task => {
                    const disp = getTaskDisplay(task)
                    const diffDays = daysBetween(today, task.due_at || '')
                    return (
                      <div key={task.id} className="risk-task-card">
                        <div className="risk-card-top">
                          <span className="stage-pill" style={{ color: disp.stageColor }}>
                            {disp.stageName}
                          </span>
                          <span className={`risk-badge ${diffDays <= 0 ? 'today' : diffDays === 1 ? 'tomorrow' : 'soon'}`}>
                            {diffDays <= 0 && 'Vence hoje!'}
                            {diffDays === 1 && 'Vence amanhã!'}
                            {diffDays > 1 && `Vence em ${diffDays} dias`}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="risk-title-btn"
                          onClick={() => onTask(task)}
                        >
                          {task.title}
                        </button>
                        <div className="risk-meta">
                          <span><strong>Prazo:</strong> {dateBR(task.due_at)}</span>
                          <span><strong>Resp:</strong> {personName(task.assignee_id)}</span>
                          <span><strong>Cliente:</strong> {clientName(task.client_id)}</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onTask(task)}
                        >
                          Abrir tarefa
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
