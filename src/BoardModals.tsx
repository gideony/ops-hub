import { useRef, useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, GripVertical, Info, Plus, Settings2, Sparkles, Trash2, X, Zap } from 'lucide-react'
import type { Board, BoardCompletionAction, BoardMethodology, BoardStage, Sprint } from './lib'
import type { Data } from './App'
import { getStagesForBoard } from './general-views'

export type NamedColor = {
  name: string
  hex: string
}

export const NAMED_STAGE_COLORS: NamedColor[] = [
  { name: 'Cinza', hex: '#94a3b8' },
  { name: 'Âmbar', hex: '#f59e0b' },
  { name: 'Verde', hex: '#10b981' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Roxo', hex: '#8b5cf6' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Índigo', hex: '#6366f1' },
]

export const NAMED_BOARD_COLORS: NamedColor[] = [
  { name: 'Azul', hex: '#2563eb' },
  { name: 'Roxo', hex: '#7c3aed' },
  { name: 'Verde', hex: '#059669' },
  { name: 'Âmbar', hex: '#d97706' },
  { name: 'Rosa', hex: '#db2777' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Índigo', hex: '#4f46e5' },
  { name: 'Cinza', hex: '#475569' },
]

export type BoardTemplateKey = 'blank' | 'support' | 'commercial' | 'deployment' | 'scrum_default' | string

export type BoardTemplate = {
  id: string
  key: string
  name: string
  title: string
  description: string
  methodology: BoardMethodology
  color: string
  stages: { name: string; color: string; wip_limit: number | null; is_final: boolean }[]
  is_builtin?: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'tmpl-blank',
    key: 'blank',
    name: 'Em branco',
    title: 'Em branco',
    description: 'Quadro limpo para configurar do seu jeito',
    methodology: 'kanban',
    color: '#94a3b8',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-suporte',
    key: 'support',
    name: 'Suporte',
    title: 'Suporte',
    description: 'Atendimento, triagem e resolução de chamados',
    methodology: 'kanban',
    color: '#0d9488',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Resolvido', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-comercial',
    key: 'commercial',
    name: 'Comercial',
    title: 'Comercial',
    description: 'Funil de vendas e fechamento de novos clientes',
    methodology: 'kanban',
    color: '#2563eb',
    is_builtin: true,
    stages: [
      { name: 'Lead', color: '#3b82f6', wip_limit: null, is_final: false },
      { name: 'Negociações', color: '#f59e0b', wip_limit: 4, is_final: false },
      { name: 'Follow-up', color: '#8b5cf6', wip_limit: 3, is_final: false },
      { name: 'Assinatura de Contrato', color: '#ec4899', wip_limit: 2, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
      { name: 'Perdido', color: '#ef4444', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-implantacao',
    key: 'deployment',
    name: 'Implantação',
    title: 'Implantação',
    description: 'Onboarding e entrega estruturada de projetos',
    methodology: 'kanban',
    color: '#7c3aed',
    is_builtin: true,
    stages: [
      { name: 'Kick-off', color: '#3b82f6', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#f59e0b', wip_limit: 3, is_final: false },
      { name: 'Aguardando aprovação', color: '#8b5cf6', wip_limit: 2, is_final: false },
      { name: 'Entrega', color: '#ec4899', wip_limit: 2, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
  {
    id: 'tmpl-scrum',
    key: 'scrum_default',
    name: 'Scrum padrão',
    title: 'Scrum padrão',
    description: 'Ciclos com sprints, backlog e metas',
    methodology: 'scrum',
    color: '#6366f1',
    is_builtin: true,
    stages: [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ],
  },
]

type CreateBoardProps = {
  data: Data
  userId: string
  canAdmin: boolean
  onClose: () => void
  onCreate: (board: Board, stages: Partial<BoardStage>[]) => Promise<void>
  initialTemplateId?: string | null
}

export function CreateBoardModal({ data, userId, canAdmin: _canAdmin, onClose, onCreate, initialTemplateId }: CreateBoardProps) {
  const availableTemplates = useMemo<BoardTemplate[]>(() => {
    if (data.boardTemplates && data.boardTemplates.length > 0) {
      return data.boardTemplates.map(t => ({
        id: t.id,
        key: t.key || t.id,
        title: t.name || t.title || 'Modelo',
        name: t.name || t.title || 'Modelo',
        description: t.description || '',
        methodology: t.methodology,
        color: t.color || '#3b82f6',
        stages: t.stages.map(s => ({
          name: s.name,
          color: s.color,
          wip_limit: s.wip_limit ?? null,
          is_final: Boolean(s.is_final),
        })),
        is_builtin: t.is_builtin,
      }))
    }
    return BOARD_TEMPLATES
  }, [data.boardTemplates])

  const initialTpl = useMemo(() => {
    if (initialTemplateId) {
      const match = availableTemplates.find(t => t.id === initialTemplateId || t.key === initialTemplateId)
      if (match) return match
    }
    return availableTemplates.find(t => t.key === 'blank') || availableTemplates[0] || BOARD_TEMPLATES[0]
  }, [availableTemplates, initialTemplateId])

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(initialTpl?.color || NAMED_BOARD_COLORS[0].hex)
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<BoardTemplateKey | null>(initialTpl?.key || 'blank')
  const [methodology, setMethodology] = useState<BoardMethodology>(initialTpl?.methodology || 'kanban')
  const [teamId, setTeamId] = useState<string>(data.teams[0]?.id || '')
  const [isShared, setIsShared] = useState(false)
  const [onCompletionAction, setOnCompletionAction] = useState<BoardCompletionAction>('ask')
  const [defaultForwardBoardId, setDefaultForwardBoardId] = useState<string>('')
  const [defaultForwardStageId, setDefaultForwardStageId] = useState<string>('')
  const [customStages, setCustomStages] = useState<{ name: string; color: string; wip_limit: number | null; is_final: boolean }[]>(
    initialTpl?.stages
      ? initialTpl.stages.map(s => ({ ...s }))
      : [
          { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
          { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
          { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
        ]
  )
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false)

  const isSubmittingRef = useRef(false)
  const modalContainerRef = useRef<HTMLDivElement>(null)

  // Verifica se o usuário alterou dados para confirmação de descarte
  const isDirty = useMemo(() => {
    return Boolean(
      name.trim() ||
      description.trim() ||
      selectedTemplate !== 'blank' ||
      color !== NAMED_BOARD_COLORS[0].hex ||
      customStages.length !== 3 ||
      customStages[0]?.name !== 'Tarefas' ||
      customStages[1]?.name !== 'Em andamento' ||
      customStages[2]?.name !== 'Concluído'
    )
  }, [name, description, selectedTemplate, color, customStages])

  // Etapas disponíveis no quadro de destino padrão selecionado
  const targetBoard = useMemo(() => {
    return data.boards.find(b => b.id === defaultForwardBoardId)
  }, [data.boards, defaultForwardBoardId])

  const targetBoardStages = useMemo(() => {
    if (!targetBoard) return []
    return getStagesForBoard(targetBoard, data.stages, data.boardStages)
  }, [targetBoard, data.stages, data.boardStages])

  // Informações para o resumo
  const selectedTeamName = useMemo(() => {
    return data.teams.find(t => t.id === teamId)?.name || 'Equipe'
  }, [data.teams, teamId])

  const finalStagesNames = useMemo(() => {
    const finals = customStages.filter(s => s.is_final).map(s => s.name)
    return finals.length > 0 ? finals.join(', ') : 'Nenhuma definida'
  }, [customStages])

  function handleAttemptClose() {
    if (busy) return
    if (isDirty) {
      setShowConfirmDiscard(true)
    } else {
      onClose()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (showConfirmDiscard) {
        setShowConfirmDiscard(false)
      } else {
        handleAttemptClose()
      }
      return
    }

    // Trap focus dentro do modal
    if (e.key === 'Tab' && modalContainerRef.current) {
      const focusable = modalContainerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  function handleSelectTemplate(tpl: BoardTemplate) {
    setSelectedTemplate(tpl.key)
    setMethodology(tpl.methodology)
    setCustomStages(tpl.stages.map(s => ({ ...s })))
    setFieldErrors(prev => {
      const copy = { ...prev }
      delete copy.stages
      delete copy.wip
      return copy
    })
  }

  function handleMethodologyChange(newMethodology: BoardMethodology) {
    setMethodology(newMethodology)
  }

  function addCustomStage() {
    setCustomStages(prev => [
      ...prev,
      {
        name: `Etapa ${prev.length + 1}`,
        color: NAMED_STAGE_COLORS[prev.length % NAMED_STAGE_COLORS.length].hex,
        wip_limit: null,
        is_final: false,
      },
    ])
    setFieldErrors(prev => {
      const copy = { ...prev }
      delete copy.stages
      return copy
    })
  }

  function removeCustomStage(index: number) {
    if (customStages.length <= 2) return
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
    if (patch.name !== undefined || patch.is_final !== undefined) {
      setFieldErrors(prev => {
        const copy = { ...prev }
        delete copy.stages
        return copy
      })
    }
  }

  function handleDragStart(index: number, e: React.DragEvent) {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(targetIndex: number, e: React.DragEvent) {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      return
    }
    setCustomStages(prev => {
      const next = [...prev]
      const [moved] = next.splice(draggedIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDraggedIndex(null)
  }

  function validateStep1(): boolean {
    const newErrors: Record<string, string> = {}
    if (!name.trim()) {
      newErrors.name = 'Informe o nome do quadro.'
    }
    if (customStages.length < 2) {
      newErrors.stages = 'O quadro deve ter pelo menos duas etapas.'
    } else if (customStages.some(s => !s.name.trim())) {
      newErrors.stages = 'Todas as etapas devem ter um nome preenchido.'
    } else if (!customStages.some(s => s.is_final)) {
      newErrors.stages = 'Marque pelo menos uma etapa como final (conclusão).'
    }

    const hasInvalidWip = customStages.some(
      s => s.wip_limit !== null && (isNaN(s.wip_limit) || s.wip_limit < 1)
    )
    if (hasInvalidWip) {
      newErrors.wip = 'O limite WIP deve ser um número inteiro maior que zero.'
    }

    setFieldErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNextStep() {
    if (validateStep1()) {
      setStep(2)
    }
  }

  async function submit(e?: FormEvent) {
    if (e) e.preventDefault()
    if (isSubmittingRef.current || busy) return

    if (!validateStep1()) {
      setStep(1)
      return
    }

    isSubmittingRef.current = true
    setBusy(true)
    setError('')

    const newBoard: Board = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || null,
      color,
      type: 'custom',
      methodology,
      team_id: isShared ? null : (teamId || null),
      is_shared: isShared,
      stage_ids: [],
      position: data.boards.length + 1,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      on_completion_action: onCompletionAction,
      default_forward_board_id: defaultForwardBoardId || null,
      default_forward_stage_id: defaultForwardStageId || null,
    }

    const stagesToCreate = customStages.map((s, idx) => ({
      name: s.name.trim(),
      color: s.color,
      position: idx,
      wip_limit: s.wip_limit && s.wip_limit > 0 ? Number(s.wip_limit) : null,
      is_final: s.is_final,
    }))

    try {
      await onCreate(newBoard, stagesToCreate)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar quadro')
    } finally {
      setBusy(false)
      isSubmittingRef.current = false
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) handleAttemptClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalContainerRef}
        className="board-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Criar Novo Quadro"
      >
        {/* Cabeçalho com indicador de progresso */}
        <header className="board-wizard-header">
          <div className="board-wizard-title-group">
            <h2>Criar Novo Quadro</h2>
            <p>Configure etapas, metodologia e permissões em dois passos simples.</p>
          </div>
          <div className="board-wizard-stepper">
            <div className={`wizard-step-badge ${step === 1 ? 'active' : 'completed'}`}>
              <span className="wizard-step-dot">1</span>
              <span>Passo 1: Configuração</span>
            </div>
            <div className={`wizard-step-badge ${step === 2 ? 'active' : ''}`}>
              <span className="wizard-step-dot">2</span>
              <span>Passo 2: Acesso e revisão</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            aria-label="Fechar"
            className="btn-ghost-action"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </header>

        {step === 1 ? (
          /* PASSO 1: CONFIGURAÇÃO */
          <div className="board-wizard-body">
            {error && <p className="wizard-error-banner" role="alert">{error}</p>}

            {/* Nome do Quadro e Cor */}
            <div className="board-form-grid" style={{ alignItems: 'flex-start' }}>
              <label className="task-form-field">
                <span style={{ fontWeight: 600 }}>Nome do Quadro *</span>
                <input
                  required
                  autoFocus
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    if (fieldErrors.name) {
                      setFieldErrors(prev => {
                        const copy = { ...prev }
                        delete copy.name
                        return copy
                      })
                    }
                  }}
                  placeholder="Ex.: Suporte N1, Comercial ou Sprint Mobile"
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && <span className="field-error-text">{fieldErrors.name}</span>}
              </label>

              <div className="task-form-field">
                <span style={{ fontWeight: 600 }}>Cor do Quadro</span>
                <div className="board-color-swatches" role="radiogroup" aria-label="Seletor de cor do quadro">
                  {NAMED_BOARD_COLORS.map(c => {
                    const isSelected = color === c.hex
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`Cor ${c.name}`}
                        title={c.name}
                        className={`board-color-swatch-btn ${isSelected ? 'selected' : ''}`}
                        style={{ backgroundColor: c.hex }}
                        onClick={() => setColor(c.hex)}
                      >
                        {isSelected && <Check size={14} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Descrição */}
            <label className="task-form-field">
              <span>Descrição (opcional)</span>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Finalidade, escopo ou objetivo deste quadro..."
              />
            </label>

            {/* Começar de um modelo */}
            <div className="task-form-field">
              <span style={{ fontWeight: 600 }}>Começar de um modelo</span>
              <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Escolha uma estrutura pronta para começar ou monte suas etapas livres.
              </small>
              <div className="board-templates-grid">
                {availableTemplates.map(tpl => {
                  const isSelected = selectedTemplate === tpl.key
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      className={`board-template-card-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectTemplate(tpl)}
                    >
                      <strong>{tpl.title}</strong>
                      <small>{tpl.description}</small>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Metodologia */}
            <div className="task-form-field">
              <span style={{ fontWeight: 600 }}>Metodologia</span>
              <div className="board-methodology-grid">
                <button
                  type="button"
                  className={`board-methodology-btn ${methodology === 'kanban' ? 'selected' : ''}`}
                  onClick={() => handleMethodologyChange('kanban')}
                >
                  <div className="board-methodology-btn-head">
                    <Sparkles size={16} />
                    <span>Kanban</span>
                  </div>
                  <small>Fluxo contínuo com limite de trabalho em andamento (WIP opcional).</small>
                </button>

                <button
                  type="button"
                  className={`board-methodology-btn ${methodology === 'scrum' ? 'selected' : ''}`}
                  onClick={() => handleMethodologyChange('scrum')}
                >
                  <div className="board-methodology-btn-head">
                    <Zap size={16} />
                    <span>Scrum</span>
                  </div>
                  <small>Sprints temporais, planejamento de backlog, metas e burndown.</small>
                </button>
              </div>

              {methodology === 'scrum' && (
                <div className="board-scrum-callout" role="note">
                  <Info size={16} style={{ flexShrink: 0 }} />
                  <span>
                    No Scrum, o <strong>Backlog</strong> e os ciclos de <strong>Sprints</strong> são criados e gerenciados automaticamente para este quadro.
                  </span>
                </div>
              )}
            </div>

            {/* Etapas do Quadro */}
            <fieldset className="wizard-stages-box">
              <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', padding: '0 6px' }}>
                Colunas do Quadro (Etapas)
              </legend>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                Arraste pela alça ou use as setas para reordenar. Defina o nome, cor, WIP e marque a etapa de conclusão.
              </p>

              {fieldErrors.stages && <p className="wizard-error-banner" role="alert">{fieldErrors.stages}</p>}
              {fieldErrors.wip && <p className="wizard-error-banner" role="alert">{fieldErrors.wip}</p>}

              <div className="custom-stage-list" style={{ marginBottom: 6 }}>
                {customStages.map((stg, index) => (
                  <div
                    key={index}
                    className={`custom-stage-row wizard-stage-item ${draggedIndex === index ? 'dragging' : ''}`}
                    draggable
                    onDragStart={e => handleDragStart(index, e)}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(index, e)}
                  >
                    <span
                      className="stage-drag-handle"
                      title="Arrastar para reordenar"
                      aria-label={`Arrastar etapa ${stg.name}`}
                    >
                      <GripVertical size={14} />
                    </span>

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
                      aria-label={`Nome da etapa ${index + 1}`}
                    />

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span className="stage-dot" style={{ backgroundColor: stg.color, width: 9, height: 9, borderRadius: '50%' }} />
                      <select
                        className="stage-color-select"
                        value={stg.color}
                        onChange={e => updateCustomStage(index, { color: e.target.value })}
                        aria-label={`Cor da etapa ${stg.name}`}
                      >
                        {NAMED_STAGE_COLORS.map(c => (
                          <option key={c.hex} value={c.hex}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="stage-wip-field" title="Limite WIP: quantidade máxima de tarefas ativas">
                      <span>WIP:</span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={stg.wip_limit ?? ''}
                        onChange={e => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null
                          updateCustomStage(index, { wip_limit: val })
                        }}
                        placeholder="Sem limite"
                        aria-label={`Limite WIP da etapa ${stg.name}`}
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

                    <button
                      type="button"
                      className="btn-remove-stage"
                      onClick={() => removeCustomStage(index)}
                      disabled={customStages.length <= 2}
                      title={customStages.length <= 2 ? 'Mínimo de 2 etapas' : 'Remover etapa'}
                      aria-label={`Remover etapa ${stg.name}`}
                      style={{ opacity: customStages.length <= 2 ? 0.3 : 1, cursor: customStages.length <= 2 ? 'not-allowed' : 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <button type="button" className="btn-add-stage" onClick={addCustomStage}>
                  <Plus size={14} /> + Adicionar etapa
                </button>
              </div>
            </fieldset>
          </div>
        ) : (
          /* PASSO 2: ACESSO E REVISÃO */
          <div className="board-wizard-body">
            {error && <p className="wizard-error-banner" role="alert">{error}</p>}

            <div className="board-wizard-step2-grid">
              {/* COLUNA ESQUERDA: ACESSO, EQUIPE E CONDUTA AO CONCLUIR */}
              <div className="board-step2-col">
                {/* Acesso e Visibilidade */}
                <div className="task-form-field">
                  <span style={{ fontWeight: 600 }}>Acesso ao Quadro</span>
                  <div className="board-access-cards">
                    <label className={`board-access-card ${!isShared ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="board_access_type"
                        checked={!isShared}
                        onChange={() => setIsShared(false)}
                      />
                      <div className="board-access-card-content">
                        <strong>Privado da equipe (padrão)</strong>
                        <small>Apenas colaboradores da equipe responsável terão acesso operacional a este quadro.</small>
                      </div>
                    </label>

                    <label className={`board-access-card ${isShared ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="board_access_type"
                        checked={isShared}
                        onChange={() => setIsShared(true)}
                      />
                      <div className="board-access-card-content">
                        <strong>Corporativo</strong>
                        <small>Visível e compartilhado com todas as equipes da organização.</small>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Equipe Responsável */}
                {!isShared && (
                  <label className="task-form-field">
                    <span style={{ fontWeight: 600 }}>Equipe Responsável *</span>
                    <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                      {data.teams.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Ao concluir uma tarefa */}
                <div style={{ padding: '14px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-main)' }}>
                  <span style={{ fontWeight: 600, fontSize: 12, display: 'block', marginBottom: 4 }}>
                    Ao Concluir uma Tarefa:
                  </span>
                  <small style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block', marginBottom: 10 }}>
                    Defina o comportamento do fluxo quando uma tarefa alcançar a etapa final.
                  </small>

                  <select
                    value={onCompletionAction}
                    onChange={e => setOnCompletionAction(e.target.value as BoardCompletionAction)}
                    style={{ width: '100%', marginBottom: onCompletionAction === 'suggest_default' ? 12 : 0 }}
                  >
                    <option value="ask">Perguntar se encaminha (Padrão)</option>
                    <option value="suggest_default">Sugerir destino padrão</option>
                    <option value="none">Nunca perguntar ao concluir (permitir apenas pelo botão)</option>
                  </select>

                  {onCompletionAction === 'suggest_default' && (
                    <div style={{ display: 'grid', gap: 10, marginTop: 10, padding: 10, background: 'var(--bg-surface-subtle)', borderRadius: 6, border: '1px solid var(--border-main)' }}>
                      <label className="task-form-field" style={{ margin: 0 }}>
                        <span style={{ fontSize: 11 }}>Quadro de Destino Padrão</span>
                        <select
                          value={defaultForwardBoardId}
                          onChange={e => {
                            setDefaultForwardBoardId(e.target.value)
                            setDefaultForwardStageId('')
                          }}
                        >
                          <option value="">Selecione o quadro padrão...</option>
                          {data.boards
                            .filter(b => b.id !== 'board-geral' && (b as { is_active?: boolean }).is_active !== false)
                            .map(b => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                        </select>
                      </label>

                      {defaultForwardBoardId && (
                        <label className="task-form-field" style={{ margin: 0 }}>
                          <span style={{ fontSize: 11 }}>Etapa Padrão</span>
                          <select
                            value={defaultForwardStageId}
                            onChange={e => setDefaultForwardStageId(e.target.value)}
                          >
                            <option value="">Primeira etapa do quadro de destino</option>
                            {targetBoardStages.map(s => (
                              <option key={s.id} value={s.id}>
                                ● {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* COLUNA DIREITA: PRÉVIA FIEL, RESUMO E CHECKLIST */}
              <div className="board-step2-col">
                {/* Como o quadro vai ficar */}
                <div className="board-preview-container">
                  <div className="board-preview-header">
                    <strong>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
                      Como o quadro vai ficar
                    </strong>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {customStages.length} {customStages.length === 1 ? 'coluna' : 'colunas'}
                    </span>
                  </div>

                  <div className="board-preview-viewport">
                    {customStages.map((stg, i) => (
                      <div key={i} className="board-preview-col">
                        <div className="board-preview-col-head">
                          <div className="board-preview-col-title">
                            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stg.color, flexShrink: 0 }} />
                            <span title={stg.name}>{stg.name}</span>
                          </div>
                          <div className="board-preview-badges">
                            {stg.wip_limit && <span className="board-preview-badge wip">WIP {stg.wip_limit}</span>}
                            {stg.is_final && <span className="board-preview-badge final">Final</span>}
                          </div>
                        </div>

                        <div className="board-preview-mock-card">
                          <span className="board-preview-mock-title">Exemplo de Demanda</span>
                          <div className="board-preview-mock-meta">
                            <span>#10{i + 1}</span>
                            <span>Normal</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumo da Configuração */}
                <div className="board-summary-card">
                  <strong>Resumo da Configuração</strong>
                  <ul className="board-summary-list">
                    <li className="board-summary-item">
                      <span>Nome do Quadro:</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
                        {name}
                      </span>
                    </li>
                    <li className="board-summary-item">
                      <span>Metodologia:</span>
                      <span>{methodology === 'scrum' ? 'Scrum (Sprints & Backlog)' : 'Kanban contínuo'}</span>
                    </li>
                    <li className="board-summary-item">
                      <span>Visibilidade:</span>
                      <span>{isShared ? 'Corporativo (Todas as equipes)' : `Privado (${selectedTeamName})`}</span>
                    </li>
                    <li className="board-summary-item">
                      <span>Etapas Finais:</span>
                      <span>{finalStagesNames}</span>
                    </li>
                    <li className="board-summary-item">
                      <span>Ao concluir:</span>
                      <span>
                        {onCompletionAction === 'ask'
                          ? 'Perguntar se encaminha'
                          : onCompletionAction === 'suggest_default'
                          ? 'Sugerir destino padrão'
                          : 'Nunca perguntar'}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Lista Antes de criar */}
                <div className="board-checklist-card">
                  <strong>
                    <CheckCircle2 size={14} /> Antes de criar
                  </strong>
                  <ul className="board-checklist-items">
                    <li>As colunas e limites WIP podem ser ajustados depois nas configurações do quadro.</li>
                    <li>Colaboradores autorizados já poderão criar tarefas assim que o quadro for salvo.</li>
                    {methodology === 'scrum' && (
                      <li>Backlog e ciclos de Sprint estarão ativos e preparados para planejamento.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé com navegação entre os passos */}
        <footer className="board-wizard-footer">
          <div className="wizard-footer-step-indicator">
            {step === 1 ? 'Passo 1 de 2: Configuração' : 'Passo 2 de 2: Acesso e revisão'}
          </div>

          <div className="wizard-footer-buttons">
            {step === 1 ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAttemptClose}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleNextStep}>
                  Avançar <ChevronRight size={15} style={{ marginLeft: 4 }} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  disabled={busy}
                >
                  <ChevronLeft size={15} style={{ marginRight: 4 }} /> Voltar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void submit()}
                  disabled={busy}
                >
                  {busy ? 'Criando quadro...' : 'Criar quadro'}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>

      {/* Diálogo de confirmação de descarte de dados */}
      {showConfirmDiscard && (
        <div
          className="wizard-confirm-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirmar descarte de alterações"
        >
          <div className="wizard-confirm-dialog">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} style={{ color: 'var(--chip-danger-text)' }} />
              <h3>Descartar novo quadro?</h3>
            </div>
            <p>
              Você preencheu dados para este novo quadro. Se fechar agora, todas as etapas e configurações digitadas serão perdidas.
            </p>
            <div className="wizard-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmDiscard(false)}
              >
                Continuar configurando
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  background: 'var(--chip-danger-bg)',
                  color: 'var(--chip-danger-text)',
                  border: '1px solid var(--chip-danger-border)',
                }}
                onClick={() => {
                  setShowConfirmDiscard(false)
                  onClose()
                }}
              >
                Descartar e fechar
              </button>
            </div>
          </div>
        </div>
      )}
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
      description: 'Quadro canônico oficial do OPSHUB com todas as 15 etapas.',
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

          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-main)' }}>
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
