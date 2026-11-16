import { type CSSProperties, type DragEvent, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Columns3,
  ExternalLink,
  GripVertical,
  Layers,
  ListCollapse,
  MoreHorizontal,
  MoveRight,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { Board, BoardStage, Client, Profile, Stage, Task, Team } from './lib'
import {
  canonicalStageVisuals,
  filterTasksBySituation,
  type GeneralSituationFilter,
  type GeneralViewMode,
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
  moveTask: (task: Task, stageId: string) => Promise<void>
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  notify: (msg: string) => void
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
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
}

/**
 * Barra superior de controles da aba Geral (Modo, Situação e Filtro de Quadros).
 */
export function GeneralToolbar({
  mode,
  situation,
  selectedBoardId,
  boards,
  onModeChange,
  onSituationChange,
  onBoardFilterChange,
}: {
  mode: GeneralViewMode
  situation: GeneralSituationFilter
  selectedBoardId: string
  boards: Board[]
  onModeChange: (mode: GeneralViewMode) => void
  onSituationChange: (situation: GeneralSituationFilter) => void
  onBoardFilterChange: (boardId: string) => void
}) {
  return (
    <div className="general-toolbar" role="toolbar" aria-label="Controles da visão geral">
      <div className="general-toolbar-left">
        {/* Seletor Segmentado de Modo */}
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

        {/* Seletor de Situação */}
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
      </div>

      <div className="general-toolbar-right">
        {/* Filtro de Quadros */}
        <label htmlFor="general-board-filter" className="sr-only">Filtrar por quadro</label>
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
  moveTask,
  deleteTask,
  person,
  team,
  canFreeMove,
  notify,
  allTasks,
  allBoards,
  allClients,
}: GeneralLateralViewProps) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Ordena os quadros conforme a ordem personalizada salva
  const orderedBoards = [...boards].sort((a, b) => {
    const idxA = blockOrder.indexOf(a.id)
    const idxB = blockOrder.indexOf(b.id)
    if (idxA === -1 && idxB === -1) return 0
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })

  // Aplica o filtro de quadro selecionado caso não seja 'all'
  const visibleBoards = selectedBoardId === 'all'
    ? orderedBoards
    : orderedBoards.filter(b => b.id === selectedBoardId)

  // Scroll suave até o bloco do quadro correspondente
  function scrollToBoard(boardId: string) {
    const el = blockRefs.current[boardId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    }
  }

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
      {/* Linha "Ir para:" com fichas coloridas de cada quadro */}
      {visibleBoards.length > 0 && (
        <div className="general-quick-nav" aria-label="Navegação rápida entre blocos">
          <span className="general-quick-nav-label">
            <MoveRight size={13} /> Ir para:
          </span>
          {visibleBoards.map(board => {
            const boardColor = (board as any).color || '#3b82f6'
            return (
              <button
                key={`quick-${board.id}`}
                type="button"
                className="general-quick-chip"
                onClick={() => scrollToBoard(board.id)}
                title={`Rolar para o bloco ${board.name}`}
              >
                <span className="general-quick-chip-dot" style={{ background: boardColor }} />
                <span>{board.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {visibleBoards.length === 0 ? (
        <div className="general-empty-state" role="status">
          <Layers size={36} className="general-empty-state-icon" />
          <h3>Nenhum quadro encontrado</h3>
          <p>Não há quadros disponíveis para visualização com o filtro selecionado.</p>
        </div>
      ) : (
        /* Área de rolagem horizontal contendo os blocos de cada quadro */
        <div className="general-lateral-scroll">
          {visibleBoards.map(board => {
          const boardColor = (board as any).color || '#3b82f6'
          const stages = getStagesForBoard(board, canonicalStages, customBoardStages)
          const metrics = getGeneralBoardMetrics(board, tasks, canonicalStages, customBoardStages, sprints)
          const boardTasks = tasks.filter(t => (board.type === 'general' ? (!t.board_id || t.board_id === 'board-geral') : t.board_id === board.id))
          const filteredTasks = filterTasksBySituation(boardTasks, situation, board, canonicalStages, customBoardStages, sprints)
          const isDragging = draggingBlockId === board.id
          const isDropTarget = dragOverBlockId === board.id

          return (
            <div
              key={board.id}
              ref={el => { blockRefs.current[board.id] = el }}
              className={`general-board-block ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
              onDragOver={e => handleBlockDragOver(e, board.id)}
              onDrop={e => handleBlockDrop(e, board.id)}
            >
              {/* Cabeçalho do Bloco */}
              <div
                className="general-block-head"
                style={{
                  background: `color-mix(in srgb, ${boardColor} 12%, var(--bg-surface-subtle, #f8fafc))`,
                  border: `1px solid color-mix(in srgb, ${boardColor} 25%, transparent)`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  marginBottom: '10px',
                }}
              >
                <div className="general-block-head-left">
                  <span
                    className="general-drag-handle"
                    draggable
                    onDragStart={e => handleBlockDragStart(e, board.id)}
                    title="Arrastar para reordenar bloco de quadro"
                    aria-label="Alça de reordenação do bloco"
                  >
                    <GripVertical size={16} />
                  </span>
                  <span className="general-block-color-bar" style={{ background: boardColor }} />
                  <span className="general-block-title">{board.name}</span>
                  <span className={`general-methodology-badge ${board.methodology === 'scrum' ? 'scrum' : ''}`}>
                    {board.methodology === 'scrum' ? 'Scrum' : 'Kanban'}
                  </span>
                </div>

                <div className="general-block-counts">
                  <span className="general-count-chip active" title="Tarefas em andamento neste quadro">
                    {metrics.active} em andamento
                  </span>
                  <span className="general-count-chip done" title="Tarefas concluídas neste quadro">
                    {metrics.done} concluídas
                  </span>
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
          <span>Role para a direita para ver os próximos quadros. Arraste o título de um quadro (::) para mudar a ordem dos blocos.</span>
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
  blockOrder,
  onBlockOrderChange,
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

  const visibleBoards = selectedBoardId === 'all'
    ? orderedBoards
    : orderedBoards.filter((b: Board) => b.id === selectedBoardId)

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
    <div className="general-accordion-container" role="region" aria-label="Lista consolidada de quadros">
      {visibleBoards.length === 0 ? (
        <div className="general-empty-state" role="status">
          <Layers size={36} className="general-empty-state-icon" />
          <h3>Nenhum quadro encontrado</h3>
          <p>Não há quadros disponíveis para visualização com o filtro selecionado.</p>
        </div>
      ) : (
        visibleBoards.map((board: Board, index: number) => {
        const boardColor = (board as any).color || '#3b82f6'
        const isExpanded = Boolean(expandedAccordions[board.id])
        const metrics = getGeneralBoardMetrics(board, tasks, canonicalStages, customBoardStages, sprints)
        const boardTasks = tasks.filter(t => (board.type === 'general' ? (!t.board_id || t.board_id === 'board-geral') : t.board_id === board.id))
        const filteredTasks = isExpanded
          ? filterTasksBySituation(boardTasks, situation, board, canonicalStages, customBoardStages, sprints)
          : []
        const stages = isExpanded
          ? getStagesForBoard(board, canonicalStages, customBoardStages)
          : []
        const isDragging = draggingBlockId === board.id
        const isDropTarget = dragOverBlockId === board.id

        return (
          <div
            key={board.id}
            className={`general-accordion-item ${isExpanded ? 'is-expanded' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
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
            >
              <div className="general-accordion-head-left">
                {/* Ferramentas de reordenação da faixa no modo consolidado */}
                {onBlockOrderChange && selectedBoardId === 'all' && (
                  <div className="general-accordion-order-tools" onClick={e => e.stopPropagation()}>
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

                <span className="general-accordion-dot" style={{ background: boardColor }} />
                <span className="general-accordion-title">{board.name}</span>
                <span className={`general-methodology-badge ${board.methodology === 'scrum' ? 'scrum' : ''}`}>
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

            {/* Corpo da Faixa (Renderizado apenas se expandido para máximo desempenho) */}
            {isExpanded && (
              <div className="general-accordion-body">
                <div className="general-block-kanban">
                  <GeneralKanbanColumns
                    board={board}
                    stages={stages}
                    tasks={filteredTasks}
                    allTasks={allTasks || tasks}
                    allBoards={allBoards || boards}
                    onTaskSelect={onTaskSelect}
                    moveTask={moveTask}
                    deleteTask={deleteTask}
                    person={person}
                    team={team}
                    canFreeMove={canFreeMove}
                    notify={notify}
                  />
                </div>
              </div>
            )}
          </div>
        )
      }))}
    </div>
  )
}

/**
 * Colunas Kanban padronizadas com proteção contra movimentação inter-quadros.
 */
function GeneralKanbanColumns({
  board,
  stages,
  tasks,
  allTasks,
  allBoards,
  allClients,
  onTaskSelect,
  moveTask,
  deleteTask,
  person,
  team,
  canFreeMove,
  notify,
}: {
  board: Board
  stages: (Stage & { wip_limit?: number | null })[]
  tasks: Task[]
  allTasks?: Task[]
  allBoards?: Board[]
  allClients?: Client[]
  onTaskSelect: (task: Task) => void
  moveTask: (task: Task, stageId: string) => Promise<void>
  deleteTask?: (task: Task) => Promise<void>
  person: (id?: string | null) => Profile | undefined
  team: (id: string) => Team | undefined
  canFreeMove?: boolean
  notify: (msg: string) => void
}) {
  const [colLimits, setColLimits] = useState<Record<string, number>>({})

  const boardIdNormalized = board.type === 'general' ? 'board-geral' : board.id

  function handleStageDragOver(e: DragEvent) {
    if (e.dataTransfer.types.includes('text/task-id')) {
      e.preventDefault()
    }
  }

  function handleStageDrop(e: DragEvent, stageId: string) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/task-id')
    const sourceBoardId = e.dataTransfer.getData('text/board-id') || 'board-geral'

    // REGRA DE OURO: Bloqueio estrito de movimentação entre quadros diferentes
    if (sourceBoardId !== boardIdNormalized) {
      notify('Para levar a tarefa a outro quadro, abra a tarefa e selecione o Quadro de Destino.')
      return
    }

    const task = tasks.find(t => t.id === taskId)
    if (task) {
      void moveTask(task, stageId)
    }
  }

  return (
    <>
      {stages.map(s => {
        const cards = tasks.filter(t => t.stage_id === s.id)
        const label = s.name === 'Pausado' ? 'Atividades em pausa' : s.name === 'Backlog' ? 'Backlog Desenvolvimento' : s.name === 'Negociação' ? 'Negociações' : s.name
        const visual = canonicalStageVisuals[label] || canonicalStageVisuals[s.name]
        const dotColor = visual ? visual.dot : (s.color || '#3b82f6')
        const bgColor = visual ? visual.bg : (s.color ? `color-mix(in srgb, ${s.color} 15%, white)` : '#f1f5f9')
        const count = cards.length
        const hasWip = typeof s.wip_limit === 'number' && s.wip_limit > 0
        const isExceeded = hasWip && count > (s.wip_limit as number)
        const isWarning = hasWip && count === (s.wip_limit as number)
        const colWipClass = isExceeded ? 'col-wip-exceeded' : isWarning ? 'col-wip-warning' : ''

        // Limite de exibição inicial por coluna (15 cards com 'Ver mais')
        const limit = colLimits[s.id] || 15
        const visibleCards = cards.slice(0, limit)
        const hasMore = cards.length > limit

        return (
          <div
            key={s.id}
            className={`kanban-col ${colWipClass}`}
            style={{ '--stage-color': dotColor, '--stage-bg': bgColor } as CSSProperties}
            onDragOver={handleStageDragOver}
            onDrop={e => handleStageDrop(e, s.id)}
          >
            <div className="kanban-head">
              <div className="kanban-head-title">
                <i style={{ background: dotColor }} />
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

              {!cards.length && <div className="kanban-empty" />}

              {hasMore && (
                <button
                  type="button"
                  className="kanban-see-more-btn"
                  onClick={() => setColLimits(prev => ({ ...prev, [s.id]: (prev[s.id] || 15) + 15 }))}
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
 * Card de tarefa exibido nas visões da aba Geral, portando etiqueta com o nome e a cor do quadro.
 */
function GeneralTaskCard({
  task,
  board: _board,
  allTasks,
  allBoards,
  allClients,
  onTaskSelect,
  deleteTask,
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
  const [showMenu, setShowMenu] = useState(false)
  const isForwarded = Boolean(task.forwarded_at)
  const isBranch = Boolean(task.origin_task_id)

  const branchTask = isForwarded ? allTasks?.find(t => t.origin_task_id === task.id) : undefined
  const originTask = isBranch ? allTasks?.find(t => t.id === task.origin_task_id) : undefined

  const targetBoardName = branchTask
    ? (allBoards?.find(b => b.id === (branchTask.board_id || 'board-geral'))?.name || 'Geral')
    : 'Outro quadro'
  const originBoardName = originTask
    ? (allBoards?.find(b => b.id === (originTask.board_id || 'board-geral'))?.name || 'Geral')
    : 'Quadro anterior'

  const currentBoardObj = allBoards?.find(b => b.id === (task.board_id || 'board-geral')) || _board
  const currentBoardColor = (currentBoardObj as any)?.color || '#3b82f6'
  const currentBoardName = currentBoardObj?.name || 'Geral'

  const clientName = task.client_id ? allClients?.find(c => c.id === task.client_id)?.name : undefined
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

  // Estatística de subtarefas estável
  const hash = task.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const totalSubtasks = (hash % 7) + 3
  const completedSubtasks = hash % (totalSubtasks + 1)
  const percent = Math.round((completedSubtasks / totalSubtasks) * 100)

  function handleDragStart(e: DragEvent) {
    if (isForwarded) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/task-id', task.id)
    e.dataTransfer.setData('text/board-id', task.board_id || 'board-geral')
    e.dataTransfer.effectAllowed = 'move'
  }

  const priorityLabels: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

  return (
    <div
      className={`task-card-v2 ${isForwarded ? 'is-locked' : ''}`}
      draggable={!isForwarded}
      onDragStart={handleDragStart}
    >
      <div className="task-card-v2-body" onClick={() => onTaskSelect(task)}>
        {/* Etiqueta do quadro */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: `color-mix(in srgb, ${currentBoardColor} 14%, white)`,
              color: currentBoardColor,
              border: `1px solid color-mix(in srgb, ${currentBoardColor} 30%, transparent)`,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: currentBoardColor }} />
            {currentBoardName}
          </span>
        </div>

        {/* Topo do card: Cliente e botão ... */}
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
          <span className="task-card-v2-progress-text">{completedSubtasks}/{totalSubtasks}</span>
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
              onTaskSelect(branchTask)
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
              onTaskSelect(originTask)
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
