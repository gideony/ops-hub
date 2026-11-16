import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronRight, FolderKanban, Layers, Plus, Settings2, Sparkles, Trash2, X, Zap } from 'lucide-react'
import type { Board, BoardCompletionAction, BoardMethodology, BoardStage, BoardType, Sprint } from './lib'
import type { Data } from './App'

type CreateBoardProps = {
  data: Data
  userId: string
  canAdmin: boolean
  onClose: () => void
  onCreate: (board: Board, stages: Partial<BoardStage>[]) => Promise<void>
}

export function CreateBoardModal({ data, userId, canAdmin, onClose, onCreate }: CreateBoardProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<BoardType>('custom')
  const [methodology, setMethodology] = useState<BoardMethodology>('kanban')
  const [teamId, setTeamId] = useState<string>(data.teams[0]?.id || '')
  const [isShared, setIsShared] = useState(false)
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([])
  const [onCompletionAction, setOnCompletionAction] = useState<BoardCompletionAction>('ask')
  const [defaultForwardBoardId, setDefaultForwardBoardId] = useState<string>('')
  const [defaultForwardStageId, setDefaultForwardStageId] = useState<string>('')
  const [customStages, setCustomStages] = useState<{ name: string; color: string; wip_limit: number | null; is_final: boolean }[]>([
    { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
    { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
    { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const colorPalette = ['#94a3b8', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#14b8a6', '#ef4444']

  function toggleStageSelection(stageId: string) {
    setSelectedStageIds(prev =>
      prev.includes(stageId) ? prev.filter(id => id !== stageId) : [...prev, stageId]
    )
  }

  function addCustomStage() {
    setCustomStages(prev => [
      ...prev,
      { name: `Etapa ${prev.length + 1}`, color: colorPalette[prev.length % colorPalette.length], wip_limit: null, is_final: false }
    ])
  }

  function removeCustomStage(index: number) {
    if (customStages.length <= 1) return
    setCustomStages(prev => prev.filter((_, i) => i !== index))
  }

  function moveCustomStage(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= customStages.length) return
    setCustomStages(prev => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  function updateCustomStage(index: number, patch: Partial<{ name: string; color: string; wip_limit: number | null; is_final: boolean }>) {
    setCustomStages(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do quadro.'); return }
    if (type === 'sector_view' && selectedStageIds.length === 0) {
      setError('Selecione pelo menos uma etapa do Geral para a visão do setor.')
      return
    }
    if (type === 'custom' && customStages.some(s => !s.name.trim())) {
      setError('Todas as etapas personalizadas devem ter um nome.')
      return
    }

    setBusy(true)
    setError('')

    const newBoard: Board = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || null,
      type,
      methodology,
      team_id: isShared ? null : (teamId || null),
      is_shared: isShared,
      stage_ids: type === 'sector_view' ? selectedStageIds : [],
      position: data.boards.length + 1,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      on_completion_action: onCompletionAction,
      default_forward_board_id: defaultForwardBoardId || null,
      default_forward_stage_id: defaultForwardStageId || null,
    }

    const stagesToCreate = type === 'custom'
      ? customStages.map((s, idx) => ({
          name: s.name.trim(),
          color: s.color,
          position: idx,
          wip_limit: s.wip_limit && s.wip_limit > 0 ? Number(s.wip_limit) : null,
          is_final: s.is_final,
        }))
      : []

    try {
      await onCreate(newBoard, stagesToCreate)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar quadro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal board-create-modal" role="dialog" aria-modal="true" aria-label="Criar Novo Quadro">
        <header className="board-modal-header">
          <div>
            <h2>Criar Novo Quadro</h2>
            <p>Configure um quadro personalizado ou espelhe etapas do Geral em uma visão por setor.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <form onSubmit={submit} className="board-modal-form">
          <label className="task-form-field">
            <span>Nome do Quadro *</span>
            <input
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Suporte N1, Comercial ou Sprint Mobile"
            />
          </label>

          <label className="task-form-field">
            <span>Descrição (opcional)</span>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Finalidade e escopo deste quadro..."
            />
          </label>

          <div className="board-form-grid">
            <div className="task-form-field">
              <span>Metodologia</span>
              <div className="board-type-cards">
                <button
                  type="button"
                  className={`board-type-card ${methodology === 'kanban' ? 'selected' : ''}`}
                  onClick={() => setMethodology('kanban')}
                >
                  <Sparkles size={16} />
                  <strong>Kanban</strong>
                  <small>Fluxo contínuo com limite de trabalho em andamento (WIP opcional)</small>
                </button>
                <button
                  type="button"
                  className={`board-type-card ${methodology === 'scrum' ? 'selected' : ''}`}
                  onClick={() => setMethodology('scrum')}
                >
                  <Zap size={16} />
                  <strong>Scrum</strong>
                  <small>Sprints temporais, planejamento de backlog, metas e burndown</small>
                </button>
              </div>
            </div>

            <div className="task-form-field">
              <span>Origem das tarefas</span>
              <div className="board-type-cards">
                <button
                  type="button"
                  className={`board-type-card ${type === 'custom' ? 'selected' : ''}`}
                  onClick={() => setType('custom')}
                >
                  <FolderKanban size={16} />
                  <strong>Quadro independente</strong>
                  <small>Etapas e colunas próprias com limites WIP opcionais</small>
                </button>

                {canAdmin && (
                  <button
                    type="button"
                    className={`board-type-card ${type === 'sector_view' ? 'selected' : ''}`}
                    onClick={() => setType('sector_view')}
                  >
                    <Layers size={16} />
                    <strong>Espelhar etapas do Geral</strong>
                    <small>Filtro sobre o Geral que espelha etapas sem duplicar tarefas</small>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="board-form-scope">
            <div className="board-scope-selector">
              <span>Visibilidade</span>
              <div className="board-scope-options">
                <label className="board-radio-label">
                  <input
                    type="radio"
                    name="board_visibility"
                    checked={!isShared}
                    onChange={() => setIsShared(false)}
                  />
                  <span>Privado da equipe (padrão)</span>
                </label>
                <label className="board-radio-label">
                  <input
                    type="radio"
                    name="board_visibility"
                    checked={isShared}
                    onChange={() => setIsShared(true)}
                  />
                  <span>Corporativo (compartilhado entre equipes)</span>
                </label>
              </div>
            </div>

            {!isShared && (
              <label className="task-form-field board-team-select">
                <span>Equipe Responsável</span>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                  {data.teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Configuração de Etapas */}
          {type === 'sector_view' ? (
            <fieldset className="board-sector-stages-box">
              <legend>Etapas do Geral a Espelhar</legend>
              <p>Selecione as etapas do Geral que serão exibidas nesta visão de setor:</p>
              <div className="sector-stage-chips">
                {data.stages.map(s => {
                  const isChecked = selectedStageIds.includes(s.id)
                  return (
                    <label key={s.id} className={`sector-chip ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleStageSelection(s.id)}
                      />
                      <span className="stage-dot" style={{ background: s.color }} />
                      <span>{s.name}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : (
            <fieldset className="board-custom-stages-box">
              <legend>Colunas do Quadro (Etapas)</legend>
              <p>Defina o nome, cor e o limite máximo de trabalho em andamento (WIP opcional):</p>
              <div className="custom-stage-list">
                {customStages.map((stg, index) => (
                  <div key={index} className="custom-stage-row">
                    <div className="stage-row-order-btns">
                      <button
                        type="button"
                        className="btn-order-step"
                        onClick={() => moveCustomStage(index, 'up')}
                        disabled={index === 0}
                        title="Mover para cima"
                        aria-label={`Mover ${stg.name} para cima`}
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn-order-step"
                        onClick={() => moveCustomStage(index, 'down')}
                        disabled={index === customStages.length - 1}
                        title="Mover para baixo"
                        aria-label={`Mover ${stg.name} para baixo`}
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                    <span className="stage-index">{index + 1}.</span>
                    <input
                      className="stage-name-input"
                      value={stg.name}
                      onChange={e => updateCustomStage(index, { name: e.target.value })}
                      placeholder="Nome da coluna"
                    />
                    <select
                      className="stage-color-select"
                      value={stg.color}
                      onChange={e => updateCustomStage(index, { color: e.target.value })}
                      title="Cor da coluna"
                    >
                      {colorPalette.map(c => (
                        <option key={c} value={c} style={{ color: c }}>● {c}</option>
                      ))}
                    </select>
                    <label className="stage-wip-field" title="Limite WIP: quantidade máxima de tarefas ativas">
                      <span>WIP:</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={stg.wip_limit ?? ''}
                        onChange={e => updateCustomStage(index, { wip_limit: e.target.value ? parseInt(e.target.value, 10) : null })}
                        placeholder="Sem limite"
                      />
                    </label>
                    <label className="stage-final-field" title="Marcar como etapa final (conclusão)">
                      <input
                        type="checkbox"
                        checked={stg.is_final}
                        onChange={e => updateCustomStage(index, { is_final: e.target.checked })}
                      />
                      <span>Final</span>
                    </label>
                    {customStages.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-stage"
                        onClick={() => removeCustomStage(index)}
                        title="Remover etapa"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn-add-stage" onClick={addCustomStage}>
                <Plus size={14} /> + Adicionar etapa
              </button>
            </fieldset>
          )}

          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
            <label className="task-form-field" style={{ marginBottom: onCompletionAction === 'suggest_default' ? 10 : 0 }}>
              <span style={{ fontWeight: 600 }}>Ao Concluir Tarefas Neste Quadro:</span>
              <select
                value={onCompletionAction}
                onChange={e => setOnCompletionAction(e.target.value as BoardCompletionAction)}
              >
                <option value="ask">Perguntar sempre para onde encaminhar (Padrão)</option>
                <option value="suggest_default">Sugerir destino padrão</option>
                <option value="none">Não perguntar ao concluir (permitir apenas pelo botão)</option>
              </select>
            </label>

            {onCompletionAction === 'suggest_default' && (
              <div className="task-form-two" style={{ marginTop: 8 }}>
                <label className="task-form-field">
                  <span>Quadro de Destino Padrão</span>
                  <select
                    value={defaultForwardBoardId}
                    onChange={e => setDefaultForwardBoardId(e.target.value)}
                  >
                    <option value="">Selecione o quadro padrão...</option>
                    {data.boards.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="task-form-field">
                  <span>Etapa Padrão</span>
                  <select
                    value={defaultForwardStageId}
                    onChange={e => setDefaultForwardStageId(e.target.value)}
                  >
                    <option value="">Primeira etapa do quadro de destino</option>
                    {data.stages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {error && <p className="board-modal-error" role="alert">{error}</p>}

          <footer className="board-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Criando...' : 'Criar quadro'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

type ManageBoardsProps = {
  data: Data
  activeBoardId: string
  canAdmin: boolean
  userId: string
  onSelectBoard: (boardId: string) => void
  onOpenCreate: () => void
  onEditBoard?: (board: Board) => void
  onDeleteBoard: (board: Board) => Promise<void>
  onClose: () => void
}

export function ManageBoardsModal({ data, activeBoardId, canAdmin, userId, onSelectBoard, onOpenCreate, onEditBoard, onDeleteBoard, onClose }: ManageBoardsProps) {
  const allBoards: Board[] = [
    {
      id: 'board-geral',
      name: 'Geral',
      description: 'Quadro canônico oficial da Somax com todas as 15 etapas.',
      type: 'general',
      methodology: 'kanban',
      team_id: null,
      is_shared: true,
      stage_ids: data.stages.map(s => s.id),
      position: 0,
      created_by: userId,
      created_at: '',
      updated_at: '',
    },
    ...data.boards.filter(b => b.id !== 'board-geral')
  ]

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal boards-manage-modal" role="dialog" aria-modal="true" aria-label="Meus Quadros">
        <header className="board-modal-header">
          <div>
            <h2>Meus Quadros</h2>
            <p>Gerencie seus quadros Kanban, visões por setor e projetos Scrum.</p>
          </div>
          <div className="board-header-actions">
            <button type="button" className="btn-create-header" onClick={() => { onClose(); onOpenCreate() }}>
              <Plus size={15} /> Criar Quadro
            </button>
            <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>
        </header>

        <div className="board-cards-list">
          {allBoards.map(board => {
            const isActive = activeBoardId === board.id
            const isGeneral = board.type === 'general'
            const isSector = board.type === 'sector_view'

            // Contagem de tarefas
            const taskCount = isGeneral
              ? data.tasks.filter(t => !t.board_id || t.board_id === 'board-geral').length
              : isSector
              ? data.tasks.filter(t => (!t.board_id || t.board_id === 'board-geral') && board.stage_ids.includes(t.stage_id)).length
              : data.tasks.filter(t => t.board_id === board.id).length

            const stagesCount = isGeneral
              ? data.stages.length
              : isSector
              ? board.stage_ids.length
              : data.boardStages.filter(s => s.board_id === board.id).length

            const teamObj = board.team_id ? data.teams.find(t => t.id === board.team_id) : null
            const canManage = canAdmin || board.created_by === userId || (board.team_id && data.members.some(m => m.team_id === board.team_id && m.user_id === userId && m.is_manager))

            return (
              <div key={board.id} className={`board-list-card ${isActive ? 'current-active' : ''}`}>
                <div className="board-card-info" onClick={() => { onSelectBoard(board.id); onClose() }}>
                  <div className="board-card-title-row">
                    <h3>{board.name}</h3>
                    {isActive && <span className="active-tag">Ativo</span>}
                  </div>
                  <p>{board.description || 'Sem descrição'}</p>
                  <div className="board-badges">
                    <span className={`badge-type ${board.type}`}>
                      {isGeneral ? 'Geral' : isSector ? 'Visão de Setor' : 'Personalizado'}
                    </span>
                    <span className="badge-methodology">
                      {board.methodology === 'scrum' ? '⚡ Scrum' : '📊 Kanban'}
                    </span>
                    <span className="badge-scope">
                      {board.is_shared ? 'Corporativo' : teamObj ? teamObj.name : 'Privado'}
                    </span>
                    <span className="badge-metrics">
                      {taskCount} {taskCount === 1 ? 'tarefa' : 'tarefas'} &bull; {stagesCount} etapas
                    </span>
                  </div>
                </div>

                <div className="board-card-actions">
                  <button
                    type="button"
                    className="btn-select-board"
                    onClick={() => { onSelectBoard(board.id); onClose() }}
                  >
                    Acessar <ChevronRight size={14} />
                  </button>
                  {!isGeneral && canManage && onEditBoard && (
                    <button
                      type="button"
                      className="btn-select-board"
                      onClick={() => { onClose(); onEditBoard(board) }}
                      title="Editar etapas e configurações"
                    >
                      <Settings2 size={13} /> Editar
                    </button>
                  )}
                  {!isGeneral && canManage && (
                    <button
                      type="button"
                      className="btn-delete-board"
                      onClick={() => void onDeleteBoard(board)}
                      title="Excluir quadro"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type EditBoardProps = {
  board: Board
  data: Data
  canAdmin: boolean
  onClose: () => void
  onUpdate: (board: Board, stages: Partial<BoardStage>[]) => Promise<void>
}

export function EditBoardModal({ board, data, canAdmin: _canAdmin, onClose, onUpdate }: EditBoardProps) {
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description || '')
  const [methodology, setMethodology] = useState<BoardMethodology>(board.methodology)
  const [teamId, setTeamId] = useState<string>(board.team_id || data.teams[0]?.id || '')
  const [isShared, setIsShared] = useState(board.is_shared)
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>(board.stage_ids || [])
  const [onCompletionAction, setOnCompletionAction] = useState<BoardCompletionAction>(board.on_completion_action || 'ask')
  const [defaultForwardBoardId, setDefaultForwardBoardId] = useState<string>(board.default_forward_board_id || '')
  const [defaultForwardStageId, setDefaultForwardStageId] = useState<string>(board.default_forward_stage_id || '')

  const existingStages = data.boardStages
    .filter(s => s.board_id === board.id)
    .sort((a, b) => a.position - b.position)

  const [customStages, setCustomStages] = useState<{ id?: string; name: string; color: string; wip_limit: number | null; is_final: boolean }[]>(() => {
    if (board.type === 'custom' && existingStages.length > 0) {
      return existingStages.map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        wip_limit: s.wip_limit,
        is_final: s.is_final,
      }))
    }
    return [
      { name: 'A Fazer', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em Andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ]
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const colorPalette = ['#94a3b8', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#14b8a6', '#ef4444']

  function toggleStageSelection(stageId: string) {
    setSelectedStageIds(prev =>
      prev.includes(stageId) ? prev.filter(id => id !== stageId) : [...prev, stageId]
    )
  }

  function addCustomStage() {
    setCustomStages(prev => [
      ...prev,
      { name: `Etapa ${prev.length + 1}`, color: colorPalette[prev.length % colorPalette.length], wip_limit: null, is_final: false }
    ])
  }

  function removeCustomStage(index: number) {
    if (customStages.length <= 1) return
    setCustomStages(prev => prev.filter((_, i) => i !== index))
  }

  function moveCustomStage(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= customStages.length) return
    setCustomStages(prev => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  function updateCustomStage(index: number, patch: Partial<{ name: string; color: string; wip_limit: number | null; is_final: boolean }>) {
    setCustomStages(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do quadro.'); return }
    if (board.type === 'sector_view' && selectedStageIds.length === 0) {
      setError('Selecione pelo menos uma etapa do Geral para a visão do setor.')
      return
    }
    if (board.type === 'custom' && customStages.some(s => !s.name.trim())) {
      setError('Todas as etapas personalizadas devem ter um nome.')
      return
    }

    setBusy(true)
    setError('')

    const updatedBoard: Board = {
      ...board,
      name: name.trim(),
      description: description.trim() || null,
      methodology,
      team_id: isShared ? null : (teamId || null),
      is_shared: isShared,
      stage_ids: board.type === 'sector_view' ? selectedStageIds : [],
      updated_at: new Date().toISOString(),
      on_completion_action: onCompletionAction,
      default_forward_board_id: defaultForwardBoardId || null,
      default_forward_stage_id: defaultForwardStageId || null,
    }

    const stagesToUpdate = board.type === 'custom'
      ? customStages.map((s, idx) => ({
          id: s.id,
          name: s.name.trim(),
          color: s.color,
          position: idx,
          wip_limit: s.wip_limit && s.wip_limit > 0 ? Number(s.wip_limit) : null,
          is_final: s.is_final,
        }))
      : []

    try {
      await onUpdate(updatedBoard, stagesToUpdate)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar quadro')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal board-create-modal" role="dialog" aria-modal="true" aria-label={`Editar Quadro — ${board.name}`}>
        <header className="board-modal-header">
          <div>
            <h2>Editar Quadro e Etapas</h2>
            <p>Gerencie o nome, colunas, limites WIP e regras do quadro <strong>{board.name}</strong>.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <form onSubmit={submit} className="board-modal-form">
          <label className="task-form-field">
            <span>Nome do Quadro *</span>
            <input
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Suporte N1, Comercial ou Sprint Mobile"
            />
          </label>

          <label className="task-form-field">
            <span>Descrição (opcional)</span>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Finalidade e escopo deste quadro..."
            />
          </label>

          {board.type === 'custom' && (
            <div className="task-form-field">
              <span>Metodologia Ágil</span>
              <div className="board-type-cards">
                <button
                  type="button"
                  className={`board-type-card ${methodology === 'kanban' ? 'selected' : ''}`}
                  onClick={() => setMethodology('kanban')}
                >
                  <Sparkles size={16} />
                  <strong>Kanban</strong>
                  <small>Fluxo contínuo com limites de trabalho em andamento (WIP)</small>
                </button>

                <button
                  type="button"
                  className={`board-type-card ${methodology === 'scrum' ? 'selected' : ''}`}
                  onClick={() => setMethodology('scrum')}
                >
                  <Zap size={16} />
                  <strong>Scrum</strong>
                  <small>Sprints temporais, planejamento de backlog e metas</small>
                </button>
              </div>
            </div>
          )}

          <div className="board-form-scope">
            <label className="board-checkbox-label">
              <input
                type="checkbox"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
              />
              <span>Quadro Corporativo (compartilhado com todas as equipes)</span>
            </label>

            {!isShared && (
              <label className="task-form-field">
                <span>Equipe Responsável</span>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                  {data.teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Configuração de Etapas */}
          {board.type === 'sector_view' ? (
            <fieldset className="board-sector-stages-box">
              <legend>Etapas do Geral a Espelhar</legend>
              <p>Selecione as etapas do Geral exibidas nesta visão de setor:</p>
              <div className="sector-stage-chips">
                {data.stages.map(s => {
                  const isChecked = selectedStageIds.includes(s.id)
                  return (
                    <label key={s.id} className={`sector-chip ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleStageSelection(s.id)}
                      />
                      <span className="stage-dot" style={{ background: s.color }} />
                      <span>{s.name}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : (
            <fieldset className="board-custom-stages-box">
              <legend>Colunas do Quadro (Etapas e Limites WIP)</legend>
              <p>Edite os nomes, cores, ordem e limites WIP de cada coluna:</p>
              <div className="custom-stage-list">
                {customStages.map((stg, index) => (
                  <div key={index} className="custom-stage-row">
                    <div className="stage-row-order-btns">
                      <button
                        type="button"
                        className="btn-order-step"
                        onClick={() => moveCustomStage(index, 'up')}
                        disabled={index === 0}
                        title="Mover para cima"
                        aria-label={`Mover ${stg.name} para cima`}
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        className="btn-order-step"
                        onClick={() => moveCustomStage(index, 'down')}
                        disabled={index === customStages.length - 1}
                        title="Mover para baixo"
                        aria-label={`Mover ${stg.name} para baixo`}
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                    <span className="stage-index">{index + 1}.</span>
                    <input
                      className="stage-name-input"
                      value={stg.name}
                      onChange={e => updateCustomStage(index, { name: e.target.value })}
                      placeholder="Nome da coluna"
                    />
                    <select
                      className="stage-color-select"
                      value={stg.color}
                      onChange={e => updateCustomStage(index, { color: e.target.value })}
                      title="Cor da coluna"
                    >
                      {colorPalette.map(c => (
                        <option key={c} value={c} style={{ color: c }}>● {c}</option>
                      ))}
                    </select>
                    <label className="stage-wip-field" title="Limite WIP: quantidade máxima de tarefas">
                      <span>WIP:</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={stg.wip_limit ?? ''}
                        onChange={e => updateCustomStage(index, { wip_limit: e.target.value ? parseInt(e.target.value, 10) : null })}
                        placeholder="Sem limite"
                      />
                    </label>
                    <label className="stage-final-field" title="Marcar como etapa final (conclusão)">
                      <input
                        type="checkbox"
                        checked={stg.is_final}
                        onChange={e => updateCustomStage(index, { is_final: e.target.checked })}
                      />
                      <span>Final</span>
                    </label>
                    {customStages.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-stage"
                        onClick={() => removeCustomStage(index)}
                        title="Remover etapa"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn-add-stage" onClick={addCustomStage}>
                <Plus size={14} /> Adicionar Coluna
              </button>
            </fieldset>
          )}

          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
            <label className="task-form-field" style={{ marginBottom: onCompletionAction === 'suggest_default' ? 10 : 0 }}>
              <span style={{ fontWeight: 600 }}>Ao Concluir Tarefas Neste Quadro:</span>
              <select
                value={onCompletionAction}
                onChange={e => setOnCompletionAction(e.target.value as BoardCompletionAction)}
              >
                <option value="ask">Perguntar sempre para onde encaminhar (Padrão)</option>
                <option value="suggest_default">Sugerir destino padrão</option>
                <option value="none">Não perguntar ao concluir (permitir apenas pelo botão)</option>
              </select>
            </label>

            {onCompletionAction === 'suggest_default' && (
              <div className="task-form-two" style={{ marginTop: 8 }}>
                <label className="task-form-field">
                  <span>Quadro de Destino Padrão</span>
                  <select
                    value={defaultForwardBoardId}
                    onChange={e => setDefaultForwardBoardId(e.target.value)}
                  >
                    <option value="">Selecione o quadro padrão...</option>
                    {data.boards.filter(b => b.id !== board.id).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label className="task-form-field">
                  <span>Etapa Padrão</span>
                  <select
                    value={defaultForwardStageId}
                    onChange={e => setDefaultForwardStageId(e.target.value)}
                  >
                    <option value="">Primeira etapa do quadro de destino</option>
                    {data.stages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {error && <p className="board-modal-error" role="alert">{error}</p>}

          <footer className="board-modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

type SprintPlanModalProps = {
  board: Board
  data: Data
  onClose: () => void
  onSaveSprint: (sprint: Sprint, taskIds: string[]) => Promise<void>
  onStartSprint: (sprintId: string) => Promise<void>
  onCompleteSprint: (sprintId: string) => Promise<void>
  onMoveTaskToSprint: (taskId: string, sprintId: string | null) => Promise<void>
}

export function SprintPlanModal({ board, data, onClose, onSaveSprint, onStartSprint, onCompleteSprint, onMoveTaskToSprint }: SprintPlanModalProps) {
  const boardSprints = data.sprints.filter(s => s.board_id === board.id)
  const boardTasks = data.tasks.filter(t => t.board_id === board.id)
  const backlogTasks = boardTasks.filter(t => !t.sprint_id)

  const [creatingSprint, setCreatingSprint] = useState(false)
  const [sprintName, setSprintName] = useState(`Sprint ${boardSprints.length + 1}`)
  const [sprintGoal, setSprintGoal] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function handleCreateSprint(e: FormEvent) {
    e.preventDefault()
    if (!sprintName.trim()) return
    setBusy(true)
    const newSprint: Sprint = {
      id: crypto.randomUUID(),
      board_id: board.id,
      name: sprintName.trim(),
      goal: sprintGoal.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    try {
      await onSaveSprint(newSprint, [])
      setCreatingSprint(false)
      setSprintName(`Sprint ${boardSprints.length + 2}`)
      setSprintGoal('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal sprint-plan-modal" role="dialog" aria-modal="true" aria-label="Planejamento de Sprints">
        <header className="board-modal-header">
          <div>
            <h2>Planejamento de Sprints — {board.name}</h2>
            <p>Gerencie o Backlog, crie novas sprints e ative o ciclo de execução.</p>
          </div>
          <div className="board-header-actions">
            {!creatingSprint && (
              <button type="button" className="btn-create-header" onClick={() => setCreatingSprint(true)}>
                <Plus size={15} /> Nova Sprint
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>
        </header>

        <div className="sprint-plan-body">
          {creatingSprint && (
            <form onSubmit={handleCreateSprint} className="sprint-create-form">
              <h3>Criar Nova Sprint</h3>
              <div className="sprint-form-row">
                <label className="task-form-field">
                  <span>Nome da Sprint *</span>
                  <input
                    required
                    value={sprintName}
                    onChange={e => setSprintName(e.target.value)}
                    placeholder="Ex: Sprint 14"
                  />
                </label>
                <label className="task-form-field">
                  <span>Início</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </label>
                <label className="task-form-field">
                  <span>Término</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </label>
              </div>
              <label className="task-form-field">
                <span>Meta da Sprint (Goal)</span>
                <input
                  value={sprintGoal}
                  onChange={e => setSprintGoal(e.target.value)}
                  placeholder="Ex: Finalizar autenticação biométrica"
                />
              </label>
              <div className="sprint-form-actions">
                <button type="button" onClick={() => setCreatingSprint(false)}>Cancelar</button>
                <button type="submit" disabled={busy || !sprintName.trim()}>{busy ? 'Salvando...' : 'Salvar Sprint'}</button>
              </div>
            </form>
          )}

          {/* Lista de Sprints */}
          <div className="sprints-list-section">
            <h3>Sprints do Quadro ({boardSprints.length})</h3>
            {boardSprints.length === 0 ? (
              <p className="empty-sprint-hint">Nenhuma sprint cadastrada. Crie uma sprint para iniciar o planejamento.</p>
            ) : (
              boardSprints.map(sprint => {
                const sprintTasks = boardTasks.filter(t => t.sprint_id === sprint.id)
                const isActive = sprint.status === 'active'
                const isCompleted = sprint.status === 'completed'

                return (
                  <div key={sprint.id} className={`sprint-box ${isActive ? 'active-sprint' : ''}`}>
                    <div className="sprint-box-head">
                      <div className="sprint-title-area">
                        <strong>{sprint.name}</strong>
                        <span className={`sprint-status-tag ${sprint.status}`}>
                          {isActive ? '⚡ Ativa' : isCompleted ? '✓ Concluída' : 'Planejada'}
                        </span>
                        {sprint.start_date && sprint.end_date && (
                          <span className="sprint-dates">
                            <CalendarDays size={13} /> {sprint.start_date} até {sprint.end_date}
                          </span>
                        )}
                      </div>
                      <div className="sprint-actions">
                        {!isActive && !isCompleted && (
                          <button
                            type="button"
                            className="btn-start-sprint"
                            onClick={() => void onStartSprint(sprint.id)}
                            title="Ativar esta sprint no quadro"
                          >
                            <Zap size={13} /> Iniciar Sprint
                          </button>
                        )}
                        {isActive && (
                          <button
                            type="button"
                            className="btn-complete-sprint"
                            onClick={() => void onCompleteSprint(sprint.id)}
                            title="Concluir esta sprint"
                          >
                            <CheckCircle2 size={13} /> Concluir Sprint
                          </button>
                        )}
                      </div>
                    </div>

                    {sprint.goal && <p className="sprint-goal"><strong>Meta:</strong> {sprint.goal}</p>}

                    <div className="sprint-tasks-list">
                      {sprintTasks.map(task => (
                        <div key={task.id} className="sprint-task-item">
                          <span>{task.title}</span>
                          <button
                            type="button"
                            className="btn-remove-from-sprint"
                            onClick={() => void onMoveTaskToSprint(task.id, null)}
                            title="Retornar para o Backlog"
                          >
                            Retirar da Sprint
                          </button>
                        </div>
                      ))}
                      {sprintTasks.length === 0 && (
                        <p className="empty-tasks-hint">Nenhuma tarefa alocada nesta sprint.</p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Seção de Backlog */}
          <div className="backlog-section">
            <h3>Backlog do Quadro ({backlogTasks.length} tarefas)</h3>
            <p className="backlog-hint">Tarefas aguardando alocação em uma sprint:</p>
            <div className="backlog-tasks-list">
              {backlogTasks.map(task => (
                <div key={task.id} className="backlog-task-item">
                  <div className="backlog-task-info">
                    <strong>{task.title}</strong>
                    <small>{task.description || 'Sem descrição'}</small>
                  </div>
                  {boardSprints.filter(s => s.status !== 'completed').length > 0 && (
                    <div className="backlog-task-actions">
                      <select
                        defaultValue=""
                        onChange={e => {
                          const val = e.target.value
                          if (val) void onMoveTaskToSprint(task.id, val)
                        }}
                      >
                        <option value="">Alocar na Sprint...</option>
                        {boardSprints.filter(s => s.status !== 'completed').map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.status === 'active' ? 'Ativa' : 'Planejada'})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
              {backlogTasks.length === 0 && (
                <p className="empty-tasks-hint">O backlog deste quadro está vazio.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
