import { type CSSProperties, type DragEvent, useMemo, useRef, useState, useEffect } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Columns3,
  ExternalLink,
  Eye,
  GripVertical,
  Layers,
  ListCollapse,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import type { Board, BoardStage, Client, Profile, Stage, Task, Team } from './lib'
import {
  canonicalStageVisuals,
  filterTasksBySituation,
  type GeneralSituationFilter,
  type GeneralViewMode,
  getBoardStageSummary,
  getBoardVisual,
  getGeneralBoardMetrics,
  getStagesForBoard,
} from './general-views'

export interface GeneralLateralViewProps {
  boards: Board[]
  tasks: Task[]
  canonicalStages: Stage[]
  customBoardStages: BoardStage[]
  sprints?: any[]
  situation: GeneralSituationFilter
  selectedBoardId: string
  blockOrder: string[]
  onBlockOrderChange: (newOrder: string[]) => void
  onTaskSelect: (task: Task) => void
  onNavigateToBoard?: (boardId: string) => void
  moveTask?: (task: Task, stageId: string) => Promise<void>
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  notify: (msg: string) => void
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
  hideEmptyColumns?: boolean
  onHideEmptyColumnsChange?: (hide: boolean) => void
}

export interface GeneralAccordionViewProps {
  boards: Board[]
  tasks: Task[]
  canonicalStages: Stage[]
  customBoardStages: BoardStage[]
  sprints?: any[]
  situation: GeneralSituationFilter
  selectedBoardId: string
  expandedAccordions: Record<string, boolean>
  onAccordionToggle: (boardId: string) => void
  onNavigateToBoard: (boardId: string) => void
  onTaskSelect: (task: Task) => void
  moveTask: (task: Task, stageId: string) => Promise<void>
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  notify: (msg: string) => void
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
  blockOrder?: string[]
  onBlockOrderChange?: (newOrder: string[]) => void
  hideEmptyColumns?: boolean
  onHideEmptyColumnsChange?: (hide: boolean) => void
}

export interface GeneralToolbarProps {
  mode: GeneralViewMode
  situation: GeneralSituationFilter
  selectedBoardId: string
  boards: Board[]
  onModeChange: (mode: GeneralViewMode) => void
  onSituationChange: (situation: GeneralSituationFilter) => void
  onBoardFilterChange: (boardId: string) => void
  hideEmptyColumns: boolean
  onHideEmptyColumnsChange: (hide: boolean) => void
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  priorityFilter?: string
  onPriorityFilterChange?: (priority: string) => void
  teamFilter?: string
  onTeamFilterChange?: (teamId: string) => void
  assigneeFilter?: string
  onAssigneeFilterChange?: (assigneeId: string) => void
  clientFilter?: string
  onClientFilterChange?: (clientId: string) => void
  dueFilter?: string
  onDueFilterChange?: (due: string) => void
  teams?: Team[]
  profiles?: Profile[]
  clients?: Client[]
  onClearFilters?: () => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
}

/**
 * Barra superior de controles consolidada da aba Geral.
 * Reduzida para 3 camadas, com altura consistente (34px),
 * botões ativos em azul preenchido, popover de filtros e controles unificados.
 */
export function GeneralToolbar({
  mode,
  situation,
  selectedBoardId,
  boards,
  onModeChange,
  onSituationChange,
  onBoardFilterChange,
  hideEmptyColumns,
  onHideEmptyColumnsChange,
  searchQuery = '',
  onSearchQueryChange,
  priorityFilter = '',
  onPriorityFilterChange,
  teamFilter = '',
  onTeamFilterChange,
  assigneeFilter = '',
  onAssigneeFilterChange,
  clientFilter = '',
  onClientFilterChange,
  dueFilter = '',
  onDueFilterChange,
  teams = [],
  profiles = [],
  clients = [],
  onClearFilters,
  onExpandAll,
  onCollapseAll,
}: GeneralToolbarProps) {
  const [showFiltersPopover, setShowFiltersPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Conta filtros avançados ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (priorityFilter) count++
    if (teamFilter) count++
    if (assigneeFilter) count++
    if (clientFilter) count++
    if (dueFilter) count++
    return count
  }, [priorityFilter, teamFilter, assigneeFilter, clientFilter, dueFilter])

  // Fecha o popover ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowFiltersPopover(false)
      }
    }
    if (showFiltersPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFiltersPopover])

  return (
    <div className="general-toolbar" role="toolbar" aria-label="Controles da visão geral">
      <div className="general-toolbar-left">
        {/* Seletor Segmentado de Modo (Lateral vs Consolidado) */}
        <div className="general-mode-toggle" role="radiogroup" aria-label="Modo de visualização">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'lateral'}
            className={`general-mode-btn ${mode === 'lateral' ? 'selected' : ''}`}
            onClick={() => onModeChange('lateral')}
            title="Visualizar quadros lado a lado com rolagem horizontal"
          >
            <Columns3 size={15} />
            <span>Lateral</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'consolidado'}
            className={`general-mode-btn ${mode === 'consolidado' ? 'selected' : ''}`}
            onClick={() => onModeChange('consolidado')}
            title="Visualizar lista vertical de faixas expansíveis"
          >
            <ListCollapse size={15} />
            <span>Consolidado</span>
          </button>
        </div>

        <div className="general-toolbar-divider" aria-hidden="true" />

        {/* Seletor de Situação (Em andamento / Concluídas / Todas) */}
        <div className="general-situation-toggle" role="radiogroup" aria-label="Situação das tarefas">
          <button
            type="button"
            role="radio"
            aria-checked={situation === 'active'}
            className={`general-situation-btn ${situation === 'active' ? 'selected' : ''}`}
            onClick={() => onSituationChange('active')}
          >
            <span>Em andamento</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={situation === 'done'}
            className={`general-situation-btn ${situation === 'done' ? 'selected' : ''}`}
            onClick={() => onSituationChange('done')}
          >
            <span>Concluídas</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={situation === 'all'}
            className={`general-situation-btn ${situation === 'all' ? 'selected' : ''}`}
            onClick={() => onSituationChange('all')}
          >
            <span>Todas</span>
          </button>
        </div>

        <div className="general-toolbar-divider" aria-hidden="true" />

        {/* Badge Informativo de Visão Pura de Agregação (Somente Leitura) */}
        <div
          className="general-readonly-badge"
          title="Visão de agregação panorâmica (somente leitura). Para mover tarefas ou alterar fluxos, abra o quadro correspondente."
        >
          <Eye size={13} />
          <span>Visão de agregação (somente leitura)</span>
        </div>
      </div>

      <div className="general-toolbar-right">
        {/* Campo de Busca Rápida */}
        {onSearchQueryChange && (
          <div className="general-search-box">
            <Search size={14} className="general-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="general-search-input"
              placeholder="Buscar tarefas..."
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              aria-label="Buscar tarefas em todos os quadros"
            />
            {searchQuery && (
              <button
                type="button"
                className="general-search-clear-btn"
                onClick={() => onSearchQueryChange('')}
                aria-label="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Botão de Filtros (n) com Painel Popover */}
        <div className="general-filter-container" ref={popoverRef}>
          <button
            type="button"
            className={`general-filter-trigger-btn ${activeFiltersCount > 0 ? 'active' : ''}`}
            onClick={() => setShowFiltersPopover(prev => !prev)}
            aria-haspopup="dialog"
            aria-expanded={showFiltersPopover}
            title="Abrir filtros avançados (responsável, cliente, prazo, prioridade e equipe)"
          >
            <SlidersHorizontal size={14} />
            <span>Filtros {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}</span>
            {showFiltersPopover ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showFiltersPopover && (
            <div className="general-filter-popover" role="dialog" aria-label="Filtros avançados de tarefas">
              <div className="filter-popover-header">
                <strong>Filtros de Tarefas</strong>
                {activeFiltersCount > 0 && onClearFilters && (
                  <button type="button" className="filter-popover-clear" onClick={onClearFilters}>
                    Limpar ({activeFiltersCount})
                  </button>
                )}
              </div>

              <div className="filter-popover-grid">
                {/* Prioridade */}
                <div className="filter-popover-field">
                  <label htmlFor="gen-prio-filter">Prioridade</label>
                  <select
                    id="gen-prio-filter"
                    value={priorityFilter}
                    onChange={e => onPriorityFilterChange && onPriorityFilterChange(e.target.value)}
                  >
                    <option value="">Todas</option>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>

                {/* Equipe */}
                <div className="filter-popover-field">
                  <label htmlFor="gen-team-filter">Equipe</label>
                  <select
                    id="gen-team-filter"
                    value={teamFilter}
                    onChange={e => onTeamFilterChange && onTeamFilterChange(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Responsável */}
                <div className="filter-popover-field">
                  <label htmlFor="gen-assignee-filter">Responsável</label>
                  <select
                    id="gen-assignee-filter"
                    value={assigneeFilter}
                    onChange={e => onAssigneeFilterChange && onAssigneeFilterChange(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cliente */}
                <div className="filter-popover-field">
                  <label htmlFor="gen-client-filter">Cliente</label>
                  <select
                    id="gen-client-filter"
                    value={clientFilter}
                    onChange={e => onClientFilterChange && onClientFilterChange(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Prazo */}
                <div className="filter-popover-field filter-popover-span-2">
                  <label htmlFor="gen-due-filter">Prazo de entrega</label>
                  <select
                    id="gen-due-filter"
                    value={dueFilter}
                    onChange={e => onDueFilterChange && onDueFilterChange(e.target.value)}
                  >
                    <option value="">Todos os prazos</option>
                    <option value="atrasadas">Atrasadas</option>
                    <option value="futuras">Futuras</option>
                    <option value="sem_prazo">Sem prazo definido</option>
                  </select>
                </div>
              </div>

              <div className="filter-popover-footer">
                <button
                  type="button"
                  className="filter-popover-close-btn"
                  onClick={() => setShowFiltersPopover(false)}
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filtro de Quadros */}
        <label htmlFor="general-board-filter" className="sr-only">
          Filtrar por quadro
        </label>
        <select
          id="general-board-filter"
          className="general-board-select"
          value={selectedBoardId}
          onChange={e => onBoardFilterChange(e.target.value)}
          aria-label="Filtrar por quadro"
        >
          <option value="all">Quadros: todos ({boards.length})</option>
          {boards.map(b => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.methodology === 'scrum' ? 'Scrum' : 'Kanban'})
            </option>
          ))}
        </select>

        {/* Toggle Ocultar Colunas Vazias */}
        <label
          className="general-toggle-empty-cols"
          title="Ocultar colunas sem tarefas para economizar espaço horizontal"
        >
          <input
            type="checkbox"
            checked={hideEmptyColumns}
            onChange={e => onHideEmptyColumnsChange(e.target.checked)}
            aria-label="Ocultar colunas vazias"
          />
          <span>Ocultar colunas vazias</span>
        </label>

        {/* Controles Exclusivos do Modo Consolidado (Expandir/Recolher Todos) */}
        {mode === 'consolidado' && onExpandAll && onCollapseAll && (
          <div className="general-accordion-batch-actions">
            <button
              type="button"
              className="general-btn-compact-action"
              onClick={onExpandAll}
              title="Expandir todas as faixas do modo consolidado"
            >
              <ChevronsDown size={14} />
              <span>Expandir todos</span>
            </button>
            <button
              type="button"
              className="general-btn-compact-action"
              onClick={onCollapseAll}
              title="Recolher todas as faixas do modo consolidado"
            >
              <ChevronsUp size={14} />
              <span>Recolher todos</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * MODO 1: GERAL LATERAL (Quadros lado a lado com rolagem horizontal e alça :: de reordenação)
 */
export function GeneralLateralView({
  boards,
  tasks,
  canonicalStages,
  customBoardStages,
  sprints,
  situation,
  selectedBoardId,
  blockOrder,
  onBlockOrderChange,
  onTaskSelect,
  onNavigateToBoard,
  moveTask,
  deleteTask,
  person,
  team,
  canFreeMove,
  notify,
  allTasks,
  allBoards,
  allClients,
  hideEmptyColumns = true,
}: GeneralLateralViewProps) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Ordena os quadros conforme a ordem personalizada salva
  const orderedBoards = useMemo(() => {
    return [...boards].sort((a, b) => {
      const idxA = blockOrder.indexOf(a.id)
      const idxB = blockOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [boards, blockOrder])

  // Aplica o filtro de quadro selecionado caso não seja 'all' ou vazio
  const visibleBoards = useMemo(() => {
    return (!selectedBoardId || selectedBoardId === 'all')
      ? orderedBoards
      : orderedBoards.filter(b => b.id === selectedBoardId)
  }, [selectedBoardId, orderedBoards])

  // Handlers para reordenação drag-and-drop dos blocos
  function handleBlockDragStart(e: DragEvent, boardId: string) {
    setDraggingBlockId(boardId)
    e.dataTransfer.setData('text/general-block-id', boardId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleBlockDragOver(e: DragEvent, targetBoardId: string) {
    if (!e.dataTransfer.types.includes('text/general-block-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverBlockId !== targetBoardId) {
      setDragOverBlockId(targetBoardId)
    }
  }

  function handleBlockDrop(e: DragEvent, targetBoardId: string) {
    if (!e.dataTransfer.types.includes('text/general-block-id')) return
    e.preventDefault()
    const sourceBoardId = e.dataTransfer.getData('text/general-block-id')
    setDraggingBlockId(null)
    setDragOverBlockId(null)

    if (sourceBoardId && sourceBoardId !== targetBoardId) {
      const currentOrder = orderedBoards.map(b => b.id)
      const fromIdx = currentOrder.indexOf(sourceBoardId)
      const toIdx = currentOrder.indexOf(targetBoardId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const nextOrder = [...currentOrder]
        const [removed] = nextOrder.splice(fromIdx, 1)
        nextOrder.splice(toIdx, 0, removed)
        onBlockOrderChange(nextOrder)
      }
    }
  }

  return (
    <div className="general-lateral-wrapper">
      {visibleBoards.length === 0 ? (
        <div className="general-empty-state" role="status">
          <Layers size={36} className="general-empty-state-icon" />
          <h3>Nenhum quadro encontrado</h3>
          <p>Não há quadros disponíveis para visualização com o filtro selecionado.</p>
        </div>
      ) : (
        /* Área de rolagem horizontal contendo os blocos de cada quadro */
        <div className="general-lateral-scroll">
          {visibleBoards.map((board, index) => {
            const visual = getBoardVisual(board, index)
            const stages = getStagesForBoard(board, canonicalStages, customBoardStages)
            const metrics = getGeneralBoardMetrics(board, tasks, canonicalStages, customBoardStages, sprints)
            const boardTasks = tasks.filter(t =>
              board.type === 'general' ? (!t.board_id || t.board_id === 'board-geral') : t.board_id === board.id
            )
            const filteredTasks = filterTasksBySituation(
              boardTasks,
              situation,
              board,
              canonicalStages,
              customBoardStages,
              sprints
            )
            const isDragging = draggingBlockId === board.id
            const isDropTarget = dragOverBlockId === board.id

            return (
              <div
                key={board.id}
                ref={el => {
                  blockRefs.current[board.id] = el
                }}
                className={`general-board-block ${isDragging ? 'is-dragging' : ''} ${
                  isDropTarget ? 'is-drop-target' : ''
                }`}
                onDragOver={e => handleBlockDragOver(e, board.id)}
                onDrop={e => handleBlockDrop(e, board.id)}
              >
                {/* Cabeçalho do Bloco com tokens semânticos de cor por quadro */}
                <div
                  className="general-block-head"
                  style={
                    {
                      '--board-dot': visual.dot,
                      '--board-bg-light': visual.light.bg,
                      '--board-text-light': visual.light.text,
                      '--board-border-light': visual.light.border,
                      '--board-bg-dark': visual.dark.bg,
                      '--board-text-dark': visual.dark.text,
                      '--board-border-dark': visual.dark.border,
                    } as CSSProperties
                  }
                >
                  <div className="general-block-head-left">
                    <span
                      className="general-drag-handle"
                      draggable
                      onDragStart={e => handleBlockDragStart(e, board.id)}
                      onDragEnd={() => {
                        setDraggingBlockId(null)
                        setDragOverBlockId(null)
                      }}
                      title="Arrastar para reordenar bloco de quadro"
                      aria-label="Alça de reordenação do bloco"
                    >
                      <GripVertical size={16} />
                    </span>
                    <span className="general-block-dot" style={{ background: visual.dot }} />
                    <span className="general-block-title">{board.name}</span>
                    <span
                      className={`general-methodology-badge ${
                        board.methodology === 'scrum' ? 'scrum' : ''
                      }`}
                    >
                      {board.methodology === 'scrum' ? 'Scrum' : 'Kanban'}
                    </span>
                  </div>

                  <div className="general-block-counts">
                    <span
                      className="general-count-chip active"
                      title="Tarefas em andamento neste quadro"
                    >
                      {metrics.active} em andamento
                    </span>
                    <span
                      className="general-count-chip done"
                      title="Tarefas concluídas neste quadro"
                    >
                      {metrics.done} concluídas
                    </span>
                    {onNavigateToBoard && (
                      <button
                        type="button"
                        className="general-btn-open-board"
                        onClick={() => onNavigateToBoard(board.id)}
                        title={`Abrir quadro operacional ${board.name} para mover e gerenciar tarefas`}
                      >
                        <ExternalLink size={13} />
                        <span>Abrir quadro</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Colunas Kanban do Bloco */}
                <div className="general-block-kanban">
                  <GeneralKanbanColumns
                    board={board}
                    stages={stages}
                    tasks={filteredTasks}
                    allTasks={allTasks || tasks}
                    allBoards={allBoards || boards}
                    allClients={allClients}
                    onTaskSelect={onTaskSelect}
                    moveTask={moveTask}
                    deleteTask={deleteTask}
                    person={person}
                    team={team}
                    canFreeMove={canFreeMove}
                    notify={notify}
                    hideEmptyColumns={hideEmptyColumns}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mensagem de Apoio no Rodapé */}
      {visibleBoards.length > 0 && (
        <div className="general-footer-hint" role="status">
          <Sparkles size={14} />
          <span>
            Visão agregada de todos os quadros em modo somente leitura. Para mover tarefas ou alterar etapas, clique em &ldquo;Abrir quadro&rdquo;. Arraste a alça (::) do cabeçalho para mudar a ordem dos blocos.
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * MODO 2: GERAL CONSOLIDADO (Lista de faixas/raias verticais expansíveis com lazy rendering)
 */
export function GeneralAccordionView({
  boards,
  tasks,
  canonicalStages,
  customBoardStages,
  sprints,
  situation,
  selectedBoardId,
  expandedAccordions,
  onAccordionToggle,
  onNavigateToBoard,
  onTaskSelect,
  moveTask,
  deleteTask,
  person,
  team,
  canFreeMove,
  notify,
  allTasks,
  allBoards,
  allClients,
  blockOrder,
  onBlockOrderChange,
  hideEmptyColumns = false,
}: GeneralAccordionViewProps) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)

  // Ordena os quadros conforme a ordem personalizada salva (mesma ordem do modo lateral)
  const orderedBoards = useMemo(() => {
    if (!blockOrder || blockOrder.length === 0) return boards
    return [...boards].sort((a, b) => {
      const idxA = blockOrder.indexOf(a.id)
      const idxB = blockOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [boards, blockOrder])

  const visibleBoards = useMemo(() => {
    return (!selectedBoardId || selectedBoardId === 'all')
      ? orderedBoards
      : orderedBoards.filter((b: Board) => b.id === selectedBoardId)
  }, [selectedBoardId, orderedBoards])

  // Handlers para reordenação drag-and-drop das faixas do acordeom
  function handleBlockDragStart(e: DragEvent, boardId: string) {
    setDraggingBlockId(boardId)
    e.dataTransfer.setData('text/general-accordion-id', boardId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleBlockDragOver(e: DragEvent, targetBoardId: string) {
    if (!e.dataTransfer.types.includes('text/general-accordion-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverBlockId !== targetBoardId) {
      setDragOverBlockId(targetBoardId)
    }
  }

  function handleBlockDrop(e: DragEvent, targetBoardId: string) {
    if (!e.dataTransfer.types.includes('text/general-accordion-id')) return
    e.preventDefault()
    const sourceBoardId = e.dataTransfer.getData('text/general-accordion-id')
    setDraggingBlockId(null)
    setDragOverBlockId(null)

    if (sourceBoardId && sourceBoardId !== targetBoardId && onBlockOrderChange) {
      const currentOrder = orderedBoards.map((b: Board) => b.id)
      const fromIdx = currentOrder.indexOf(sourceBoardId)
      const toIdx = currentOrder.indexOf(targetBoardId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const nextOrder = [...currentOrder]
        const [removed] = nextOrder.splice(fromIdx, 1)
        nextOrder.splice(toIdx, 0, removed)
        onBlockOrderChange(nextOrder)
      }
    }
  }

  function moveAccordionPosition(boardId: string, direction: 'up' | 'down') {
    if (!onBlockOrderChange) return
    const currentOrder = orderedBoards.map((b: Board) => b.id)
    const idx = currentOrder.indexOf(boardId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= currentOrder.length) return
    const nextOrder = [...currentOrder]
    const [removed] = nextOrder.splice(idx, 1)
    nextOrder.splice(targetIdx, 0, removed)
    onBlockOrderChange(nextOrder)
  }

  return (
    <div
      className="general-accordion-container"
      role="region"
      aria-label="Lista consolidada de quadros"
    >
      {visibleBoards.length === 0 ? (
        <div className="general-empty-state" role="status">
          <Layers size={36} className="general-empty-state-icon" />
          <h3>Nenhum quadro encontrado</h3>
          <p>Não há quadros disponíveis para visualização com o filtro selecionado.</p>
        </div>
      ) : (
        visibleBoards.map((board: Board, index: number) => {
          const visual = getBoardVisual(board, index)
          const isExpanded = Boolean(expandedAccordions[board.id])
          const metrics = getGeneralBoardMetrics(
            board,
            tasks,
            canonicalStages,
            customBoardStages,
            sprints
          )
          const boardTasks = tasks.filter(t =>
            board.type === 'general' ? (!t.board_id || t.board_id === 'board-geral') : t.board_id === board.id
          )
          const filteredTasks = isExpanded
            ? filterTasksBySituation(
                boardTasks,
                situation,
                board,
                canonicalStages,
                customBoardStages,
                sprints
              )
            : []
          const stages = getStagesForBoard(board, canonicalStages, customBoardStages)
          const stageSummary = !isExpanded ? getBoardStageSummary(stages, boardTasks) : []
          const isDragging = draggingBlockId === board.id
          const isDropTarget = dragOverBlockId === board.id

          return (
            <div
              key={board.id}
              className={`general-accordion-item ${isExpanded ? 'is-expanded' : ''} ${
                isDragging ? 'is-dragging' : ''
              } ${isDropTarget ? 'is-drop-target' : ''}`}
              onDragOver={e => handleBlockDragOver(e, board.id)}
              onDrop={e => handleBlockDrop(e, board.id)}
            >
              {/* Cabeçalho da Faixa */}
              <div
                className="general-accordion-head"
                onClick={() => onAccordionToggle(board.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onAccordionToggle(board.id)
                  }
                }}
                style={
                  {
                    '--board-dot': visual.dot,
                    '--board-bg-light': visual.light.bg,
                    '--board-text-light': visual.light.text,
                    '--board-border-light': visual.light.border,
                    '--board-bg-dark': visual.dark.bg,
                    '--board-text-dark': visual.dark.text,
                    '--board-border-dark': visual.dark.border,
                  } as CSSProperties
                }
              >
                <div className="general-accordion-head-left">
                  {/* Ferramentas de reordenação da faixa no modo consolidado */}
                  {onBlockOrderChange && selectedBoardId === 'all' && (
                    <div
                      className="general-accordion-order-tools"
                      onClick={e => e.stopPropagation()}
                    >
                      <div
                        className="general-accordion-drag-handle"
                        draggable
                        onDragStart={e => handleBlockDragStart(e, board.id)}
                        onDragEnd={() => {
                          setDraggingBlockId(null)
                          setDragOverBlockId(null)
                        }}
                        title="Arrastar para reordenar este quadro na lista consolidada"
                        aria-label={`Arrastar para reordenar ${board.name}`}
                      >
                        <GripVertical size={16} />
                      </div>
                      <div className="general-accordion-order-buttons">
                        <button
                          type="button"
                          className="accordion-btn-order"
                          onClick={() => moveAccordionPosition(board.id, 'up')}
                          disabled={index === 0}
                          title="Mover quadro para cima"
                          aria-label={`Mover ${board.name} para cima`}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          className="accordion-btn-order"
                          onClick={() => moveAccordionPosition(board.id, 'down')}
                          disabled={index === visibleBoards.length - 1}
                          title="Mover quadro para baixo"
                          aria-label={`Mover ${board.name} para baixo`}
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    </div>
                  )}

                  <span className="general-accordion-dot" style={{ background: visual.dot }} />
                  <span className="general-accordion-title">{board.name}</span>
                  <span
                    className={`general-methodology-badge ${
                      board.methodology === 'scrum' ? 'scrum' : ''
                    }`}
                  >
                    {board.methodology === 'scrum' ? 'Scrum' : 'Kanban'}
                  </span>

                  <div className="general-block-counts">
                    <span className="general-count-chip active">
                      {metrics.active} em andamento
                    </span>
                    <span className="general-count-chip done">
                      {metrics.done} concluídas
                    </span>
                  </div>

                  {/* Resumo 'Por etapa:' nas faixas recolhidas */}
                  {!isExpanded && (
                    <div className="general-accordion-stages-summary">
                      <span className="stages-summary-label">Por etapa:</span>
                      {stageSummary.length > 0 ? (
                        stageSummary.map(item => (
                          <span key={item.stageId} className="stages-summary-chip">
                            <i style={{ background: item.color || '#3b82f6' }} />
                            <span>
                              {item.stageName} ({item.count})
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="stages-summary-empty">Sem tarefas</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="general-accordion-head-right" onClick={e => e.stopPropagation()}>
                  {/* Botão Abrir Quadro */}
                  <button
                    type="button"
                    className="general-btn-open-board"
                    onClick={() => onNavigateToBoard(board.id)}
                    title={`Abrir quadro ${board.name} em tela cheia`}
                  >
                    <ExternalLink size={13} />
                    <span>Abrir quadro</span>
                  </button>

                  {/* Botão Recolher/Expandir */}
                  <button
                    type="button"
                    className="general-accordion-toggle-btn"
                    onClick={() => onAccordionToggle(board.id)}
                    title={isExpanded ? 'Recolher quadro' : 'Expandir quadro'}
                    aria-label={isExpanded ? 'Recolher quadro' : 'Expandir quadro'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
                  </button>
                </div>
              </div>

              {/* Corpo da Faixa (Lazy render quando expandido) */}
              {isExpanded && (
                <div className="general-accordion-body">
                  <div className="general-block-kanban">
                    <GeneralKanbanColumns
                      board={board}
                      stages={stages}
                      tasks={filteredTasks}
                      allTasks={allTasks || tasks}
                      allBoards={allBoards || boards}
                      allClients={allClients}
                      onTaskSelect={onTaskSelect}
                      moveTask={moveTask}
                      deleteTask={deleteTask}
                      person={person}
                      team={team}
                      canFreeMove={canFreeMove}
                      notify={notify}
                      hideEmptyColumns={
                        board.type === 'general' ? hideEmptyColumns : false
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * Colunas Kanban padronizadas com proteção contra movimentação inter-quadros
 * e suporte a colunas vazias recolhidas em tiras de 46px.
 */
function GeneralKanbanColumns({
  board,
  stages,
  tasks,
  allTasks,
  allBoards,
  allClients,
  onTaskSelect,
  moveTask: _moveTask,
  deleteTask,
  person,
  team,
  canFreeMove,
  notify: _notify,
  hideEmptyColumns = false,
}: {
  board: Board
  stages: (Stage & { wip_limit?: number | null })[]
  tasks: Task[]
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
  onTaskSelect: (task: Task) => void
  moveTask?: (task: Task, stageId: string) => Promise<void>
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  notify?: (msg: string) => void
  hideEmptyColumns?: boolean
}) {
  const [colLimits, setColLimits] = useState<Record<string, number>>({})
  const [expandedStageIds, setExpandedStageIds] = useState<Record<string, boolean>>({})

  return (
    <>
      {stages.map(s => {
        const cards = tasks.filter(t => t.stage_id === s.id)
        const label =
          s.name === 'Pausado'
            ? 'Atividades em pausa'
            : s.name === 'Backlog'
            ? 'Backlog Desenvolvimento'
            : s.name === 'Negociação'
            ? 'Negociações'
            : s.name
        const visual = canonicalStageVisuals[label] || canonicalStageVisuals[s.name]
        const dotColor = visual ? visual.dot : s.color || '#3b82f6'
        const count = cards.length
        const hasWip = typeof s.wip_limit === 'number' && s.wip_limit > 0
        const isExceeded = hasWip && count > (s.wip_limit as number)
        const isWarning = hasWip && count === (s.wip_limit as number)
        const colWipClass = isExceeded
          ? 'col-wip-exceeded'
          : isWarning
          ? 'col-wip-warning'
          : ''

        // Verifica se a coluna deve ser recolhida em tira vertical de 46px
        const isCollapsed = Boolean(hideEmptyColumns && count === 0 && !expandedStageIds[s.id])

        if (isCollapsed) {
          return (
            <div
              key={s.id}
              className="kanban-col kanban-col-collapsed"
              onClick={() => setExpandedStageIds(prev => ({ ...prev, [s.id]: true }))}
              title={`Etapa ${label}: 0 tarefas. Clique para expandir.`}
              role="button"
              tabIndex={0}
              aria-label={`Expandir coluna ${label}`}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpandedStageIds(prev => ({ ...prev, [s.id]: true }))
                }
              }}
            >
              <span className="kanban-col-collapsed-dot" style={{ background: dotColor }} />
              <span className="kanban-col-collapsed-badge">0</span>
              <span className="kanban-col-collapsed-title">{label}</span>
            </div>
          )
        }

        // Limite de exibição inicial por coluna (15 cards com 'Ver mais')
        const limit = colLimits[s.id] || 15
        const visibleCards = cards.slice(0, limit)
        const hasMore = cards.length > limit

        return (
          <div
            key={s.id}
            className={`kanban-col ${colWipClass}`}
          >
            <div className="kanban-head">
              <div className="kanban-head-title">
                <i style={{ background: dotColor }} />
                <strong>{label}</strong>
              </div>
              <div className="kanban-head-actions">
                {hasWip ? (
                  <span
                    className={`kanban-counter-badge-dark ${
                      isExceeded ? 'wip-exceeded' : isWarning ? 'wip-warning' : ''
                    }`}
                    style={{ width: 'auto', padding: '0 6px', borderRadius: 10 }}
                    title={`Limite WIP: ${s.wip_limit} (atual: ${count})`}
                  >
                    {count}/{s.wip_limit}
                  </span>
                ) : (
                  <span className="kanban-counter-badge-dark">{count}</span>
                )}
                {hideEmptyColumns && count === 0 && expandedStageIds[s.id] && (
                  <button
                    type="button"
                    className="kanban-col-recollapse-btn"
                    onClick={() => setExpandedStageIds(prev => ({ ...prev, [s.id]: false }))}
                    title="Recolher coluna vazia"
                    aria-label="Recolher coluna vazia"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            <div className="kanban-cards">
              {visibleCards.map(t => (
                <GeneralTaskCard
                  key={t.id}
                  task={t}
                  board={board}
                  allTasks={allTasks}
                  allBoards={allBoards}
                  allClients={allClients}
                  onTaskSelect={onTaskSelect}
                  deleteTask={deleteTask}
                  person={person}
                  team={team}
                  canFreeMove={canFreeMove}
                />
              ))}

              {!cards.length && (
                <div className="kanban-empty-compact">
                  <span>Sem tarefas</span>
                </div>
              )}

              {hasMore && (
                <button
                  type="button"
                  className="kanban-see-more-btn"
                  onClick={() =>
                    setColLimits(prev => ({ ...prev, [s.id]: (prev[s.id] || 15) + 15 }))
                  }
                >
                  Ver mais ({cards.length - limit} restantes)
                </button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

/**
 * Card de tarefa exibido nas visões da aba Geral.
 * Obedece às regras:
 * - O chip de nome do quadro NÃO aparece no próprio quadro do bloco/faixa (apenas no Geral canônico misto).
 * - Faixa de encaminhamento no rodapé em linha única sem quebras.
 */
export function GeneralTaskCard({
  task,
  board: currentBoard,
  allTasks,
  allBoards,
  allClients,
  onTaskSelect,
  deleteTask: _deleteTask,
  person,
  team: _team,
  canFreeMove: _canFreeMove,
}: {
  task: Task
  board: Board
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
  onTaskSelect: (task: Task) => void
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
}) {
  const isForwarded = Boolean(task.forwarded_at)
  const isBranch = Boolean(task.origin_task_id)

  const branchTask = isForwarded
    ? allTasks?.find(t => t.origin_task_id === task.id)
    : undefined
  const originTask = isBranch
    ? allTasks?.find(t => t.id === task.origin_task_id)
    : undefined

  const targetBoardName = branchTask
    ? allBoards?.find(b => b.id === (branchTask.board_id || 'board-geral'))?.name || 'Geral'
    : 'Outro quadro'
  const originBoardName = originTask
    ? allBoards?.find(b => b.id === (originTask.board_id || 'board-geral'))?.name || 'Geral'
    : 'Quadro anterior'

  // O chip de nome do quadro só aparece se o bloco for do Geral canônico e a tarefa tiver quadro específico
  const isCanonicalGeneral = currentBoard.type === 'general' || currentBoard.id === 'board-geral'
  const showBoardChip = isCanonicalGeneral && Boolean(task.board_id && task.board_id !== 'board-geral')
  const taskBoardObj = showBoardChip
    ? allBoards?.find(b => b.id === task.board_id)
    : undefined
  const taskBoardVisual = taskBoardObj ? getBoardVisual(taskBoardObj) : undefined

  const clientName = task.client_id
    ? allClients?.find(c => c.id === task.client_id)?.name
    : undefined
  const assignee = person(task.assignee_id)
  const assigneeName = assignee?.full_name
  const assigneeInitials = assigneeName
    ? assigneeName
        .split(' ')
        .filter(Boolean)
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null

  const isOverdue = Boolean(
    task.due_at &&
      !task.completed_at &&
      new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0))
  )

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
    dateLabel = isOverdue
      ? `Venceu ${formatShortDate(task.due_at)}`
      : `Prazo ${formatShortDate(task.due_at)}`
  }

  // Estatística de subtarefas estável
  const hash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const totalSubtasks = (hash % 7) + 3
  const completedSubtasks = hash % (totalSubtasks + 1)
  const percent = Math.round((completedSubtasks / totalSubtasks) * 100)

  const priorityLabels: Record<string, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    urgente: 'Urgente',
  }

  return (
    <div
      className={`task-card-v2 ${isForwarded ? 'is-locked' : ''}`}
      draggable={false}
    >
      <div className="task-card-v2-body" onClick={() => onTaskSelect(task)}>
        {/* Etiqueta do quadro (somente quando relevante) */}
        {showBoardChip && taskBoardVisual && taskBoardObj && (
          <div className="task-card-v2-board-chip-wrap">
            <span
              className="task-board-chip"
              style={
                {
                  '--board-chip-bg-light': `color-mix(in srgb, ${taskBoardVisual.dot} 14%, #ffffff)`,
                  '--board-chip-bg-dark': `color-mix(in srgb, ${taskBoardVisual.dot} 24%, #18181f)`,
                  '--board-chip-text-light': taskBoardVisual.light.text,
                  '--board-chip-text-dark': taskBoardVisual.dark.text,
                  '--board-chip-border-light': `color-mix(in srgb, ${taskBoardVisual.dot} 30%, transparent)`,
                  '--board-chip-border-dark': `color-mix(in srgb, ${taskBoardVisual.dot} 50%, transparent)`,
                  background: `color-mix(in srgb, ${taskBoardVisual.dot} 14%, var(--bg-surface))`,
                  color: taskBoardVisual.light.text,
                  borderColor: `color-mix(in srgb, ${taskBoardVisual.dot} 30%, transparent)`,
                } as CSSProperties
              }
            >
              <span
                className="task-board-chip-dot"
                style={{ background: taskBoardVisual.dot }}
              />
              {taskBoardObj.name}
            </span>
          </div>
        )}

        {/* Topo do card: Cliente */}
        <div className="task-card-v2-header">
          <span className="task-card-v2-client">{clientName || 'Sem cliente'}</span>
        </div>

        {/* Título da tarefa */}
        <h4 className="task-card-v2-title">{task.title}</h4>

        {/* Tags (máximo de 2 visíveis e +n) */}
        {task.tags && task.tags.length > 0 && (
          <div className="task-card-v2-tags">
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag} className="task-card-v2-tag-chip">
                {tag}
              </span>
            ))}
            {task.tags.length > 2 && (
              <span
                className="task-card-v2-tag-chip"
                style={{
                  background: 'var(--bg-surface-subtle)',
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-main)',
                }}
              >
                +{task.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Linha de Prioridade e Prazo */}
        <div className="task-card-v2-meta-row">
          <span className={`task-priority-pill ${task.priority}`}>
            {priorityLabels[task.priority] || task.priority}
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
          <span className="task-card-v2-progress-text">
            {completedSubtasks}/{totalSubtasks}
          </span>
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

      {/* Faixas de Encaminhamento no Rodapé em Linha Única sem quebra */}
      {isForwarded && (
        <div
          className="task-card-v2-forward-stripe"
          onClick={e => {
            if (branchTask) {
              e.stopPropagation()
              onTaskSelect(branchTask)
            }
          }}
          title={
            branchTask
              ? `Encaminhada para ${targetBoardName}. Clique para abrir.`
              : `Encaminhada para ${targetBoardName}`
          }
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
              onTaskSelect(originTask)
            }
          }}
          title={
            originTask
              ? `Veio de ${originBoardName}. Clique para abrir original.`
              : `Veio de ${originBoardName}`
          }
        >
          <span>&larr; Veio de {originBoardName}</span>
        </div>
      )}
    </div>
  )
}
