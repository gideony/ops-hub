import { useState, useRef, useEffect, useMemo } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X, Sparkles, FolderKanban } from 'lucide-react'
import { supabase } from './lib'
import type { BoardMethodology, BoardTemplate, BoardTemplateStage } from './lib'
import type { Data } from './App'
import { NAMED_BOARD_COLORS, NAMED_STAGE_COLORS } from './BoardModals'

type Props = {
  data: Data
  template: BoardTemplate | null
  preview: boolean
  userId?: string
  onClose: () => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  onDemoSave: (
    template: BoardTemplate | null,
    payload: {
      name: string
      description: string
      methodology: BoardMethodology
      color: string
      stages: BoardTemplateStage[]
    }
  ) => void
}

export default function BoardTemplateModal({
  data: _data,
  template,
  preview,
  userId,
  onClose,
  run,
  onDemoSave,
}: Props) {
  const isEditing = Boolean(template)

  const [name, setName] = useState(template?.name || template?.title || '')
  const [description, setDescription] = useState(template?.description || '')
  const [methodology, setMethodology] = useState<BoardMethodology>(template?.methodology || 'kanban')
  const [color, setColor] = useState<string>(template?.color || NAMED_BOARD_COLORS[0].hex)
  const [stages, setStages] = useState<BoardTemplateStage[]>(() => {
    if (template?.stages && template.stages.length > 0) {
      return template.stages.map(s => ({
        name: s.name,
        color: s.color,
        wip_limit: s.wip_limit ?? null,
        is_final: Boolean(s.is_final),
      }))
    }
    return [
      { name: 'Tarefas', color: '#94a3b8', wip_limit: null, is_final: false },
      { name: 'Em andamento', color: '#3b82f6', wip_limit: 3, is_final: false },
      { name: 'Concluído', color: '#10b981', wip_limit: null, is_final: true },
    ]
  })

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmDiscard, setShowConfirmDiscard] = useState(false)

  const isSubmittingRef = useRef(false)
  const modalContainerRef = useRef<HTMLDivElement>(null)

  const isDirty = useMemo(() => {
    if (!template) {
      return Boolean(name.trim() || description.trim() || stages.length !== 3)
    }
    const origName = template.name || template.title || ''
    const origDesc = template.description || ''
    return (
      name.trim() !== origName.trim() ||
      description.trim() !== origDesc.trim() ||
      methodology !== template.methodology ||
      color !== template.color ||
      stages.length !== template.stages.length
    )
  }, [template, name, description, methodology, color, stages])

  function handleAttemptClose() {
    if (busy) return
    if (isDirty) {
      setShowConfirmDiscard(true)
    } else {
      onClose()
    }
  }

  // Acessibilidade e teclado (Esc e trap focus)
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showConfirmDiscard) {
          setShowConfirmDiscard(false)
        } else {
          handleAttemptClose()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [showConfirmDiscard, isDirty, busy])

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
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

  function addStage() {
    setStages(prev => [
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

  function removeStage(index: number) {
    if (stages.length <= 2) {
      setFieldErrors(prev => ({ ...prev, stages: 'O modelo deve conter no mínimo 2 etapas.' }))
      return
    }
    setStages(prev => prev.filter((_, i) => i !== index))
  }

  function moveStage(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= stages.length) return
    setStages(prev => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(targetIndex, 0, item)
      return copy
    })
  }

  function updateStage(index: number, patch: Partial<BoardTemplateStage>) {
    setStages(prev =>
      prev.map((s, i) => {
        if (i !== index) return s
        return { ...s, ...patch }
      })
    )
    setFieldErrors(prev => {
      const copy = { ...prev }
      delete copy.stages
      delete copy.wip
      return copy
    })
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!name.trim()) {
      errors.name = 'O nome do modelo é obrigatório.'
    } else if (name.trim().length < 2) {
      errors.name = 'O nome deve ter no mínimo 2 caracteres.'
    }

    if (stages.length < 2) {
      errors.stages = 'O modelo deve possuir pelo menos 2 etapas.'
    }

    const hasEmptyStage = stages.some(s => !s.name.trim())
    if (hasEmptyStage) {
      errors.stages = 'Todas as etapas devem possuir um nome válido.'
    }

    const hasFinal = stages.some(s => s.is_final)
    if (!hasFinal) {
      errors.stages = 'Ao menos uma etapa deve ser marcada como etapa final de conclusão.'
    }

    const invalidWip = stages.some(
      s => s.wip_limit !== null && s.wip_limit !== undefined && (isNaN(Number(s.wip_limit)) || Number(s.wip_limit) <= 0)
    )
    if (invalidWip) {
      errors.wip = 'O limite WIP deve ser um número inteiro maior que zero.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || isSubmittingRef.current) return
    if (!validate()) return

    const payload = {
      name: name.trim(),
      description: description.trim(),
      methodology,
      color,
      stages: stages.map(s => ({
        name: s.name.trim(),
        color: s.color,
        wip_limit:
          s.wip_limit !== null && s.wip_limit !== undefined
            ? Math.max(1, Math.floor(Number(s.wip_limit)))
            : null,
        is_final: Boolean(s.is_final),
      })),
    }

    if (preview) {
      onDemoSave(template, payload)
      onClose()
      return
    }

    setBusy(true)
    isSubmittingRef.current = true
    setError('')

    const ok = await run(async () => {
      if (template?.id) {
        const { error: updateError } = await supabase
          .from('board_templates')
          .update({
            name: payload.name,
            description: payload.description || null,
            methodology: payload.methodology,
            color: payload.color,
            stages: payload.stages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('board_templates')
          .insert({
            name: payload.name,
            description: payload.description || null,
            methodology: payload.methodology,
            color: payload.color,
            stages: payload.stages,
            is_builtin: false,
            created_by: userId || null,
          })
        if (insertError) throw insertError
      }
    }, isEditing ? 'Modelo de quadro atualizado' : 'Modelo de quadro criado')

    setBusy(false)
    isSubmittingRef.current = false

    if (ok) {
      onClose()
    } else {
      setError('Ocorreu um erro ao salvar o modelo de quadro. Verifique sua conexão e permissões.')
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
        aria-label={isEditing ? 'Editar Modelo de Quadro' : 'Novo Modelo de Quadro'}
      >
        {/* Cabeçalho */}
        <header className="board-wizard-header">
          <div className="board-wizard-title-group">
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <FolderKanban size={18} style={{ color: 'var(--primary-main)' }} />
              {isEditing ? 'Editar Modelo de Quadro' : 'Novo Modelo de Quadro'}
            </h2>
            <p>
              Defina etapas, regras e metodologia que servirão como base reutilizável para novos quadros.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost-action"
            onClick={handleAttemptClose}
            aria-label="Fechar"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </header>

        {/* Corpo do formulário */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="board-wizard-body" style={{ flex: 1, overflowY: 'auto' }}>
            {error && (
              <div className="wizard-error-banner" role="alert">
                {error}
              </div>
            )}

            {/* Nome e Cor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
              <label className="task-form-field" style={{ minWidth: 0 }}>
                <span>Nome do Modelo *</span>
                <input
                  required
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }))
                  }}
                  placeholder="Ex.: Suporte N2, Comercial Avançado ou Sprint Mobile"
                  disabled={busy}
                />
                {fieldErrors.name && <span className="field-error-text">{fieldErrors.name}</span>}
              </label>

              <div className="task-form-field">
                <span>Cor do Quadro</span>
                <div className="board-color-swatches" role="radiogroup" aria-label="Cor do quadro">
                  {NAMED_BOARD_COLORS.map(c => {
                    const isSelected = color === c.hex
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`Cor ${c.name}`}
                        className={`board-color-swatch-btn ${isSelected ? 'selected' : ''}`}
                        style={{ background: c.hex }}
                        onClick={() => setColor(c.hex)}
                        title={c.name}
                        disabled={busy}
                      />
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
                placeholder="Finalidade, escopo ou objetivo das etapas deste modelo..."
                disabled={busy}
              />
            </label>

            {/* Metodologia */}
            <div className="task-form-field">
              <span style={{ fontWeight: 600 }}>Metodologia</span>
              <div className="board-methodology-grid">
                <button
                  type="button"
                  className={`board-methodology-btn ${methodology === 'kanban' ? 'selected' : ''}`}
                  onClick={() => setMethodology('kanban')}
                  disabled={busy}
                >
                  <div className="board-methodology-btn-head">
                    <span>Kanban</span>
                  </div>
                  <small>Fluxo contínuo com cartões, focado em throughput e WIP.</small>
                </button>
                <button
                  type="button"
                  className={`board-methodology-btn ${methodology === 'scrum' ? 'selected' : ''}`}
                  onClick={() => setMethodology('scrum')}
                  disabled={busy}
                >
                  <div className="board-methodology-btn-head">
                    <Sparkles size={14} style={{ color: 'var(--chip-warning-text)' }} />
                    <span>Scrum</span>
                  </div>
                  <small>Ciclos com sprints, backlog e metas de entrega incremental.</small>
                </button>
              </div>
            </div>

            {/* Etapas do Modelo */}
            <div className="task-form-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>Colunas do Modelo (Etapas) *</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Arraste ou use as setas para reordenar. Pelo menos uma deve ser final.
                </span>
              </div>

              {fieldErrors.stages && <span className="field-error-text">{fieldErrors.stages}</span>}
              {fieldErrors.wip && <span className="field-error-text">{fieldErrors.wip}</span>}

              <div className="wizard-stages-box">
                {stages.map((stg, index) => {
                  return (
                    <div
                      key={index}
                      className={`wizard-stage-item ${draggedIndex === index ? 'dragging' : ''}`}
                      draggable={!busy}
                      onDragStart={e => {
                        setDraggedIndex(index)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={e => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        if (draggedIndex === null || draggedIndex === index) return
                        const copy = [...stages]
                        const [moved] = copy.splice(draggedIndex, 1)
                        copy.splice(index, 0, moved)
                        setStages(copy)
                        setDraggedIndex(null)
                      }}
                      onDragEnd={() => setDraggedIndex(null)}
                    >
                      {/* Alça de arrastar */}
                      <span className="stage-drag-handle" title="Arraste para reordenar" aria-hidden="true">
                        <GripVertical size={16} />
                      </span>

                      {/* Botões de subir/descer por teclado */}
                      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                        <button
                          type="button"
                          className="btn-ghost-action"
                          style={{ padding: 2 }}
                          onClick={() => moveStage(index, 'up')}
                          disabled={index === 0 || busy}
                          aria-label={`Mover etapa ${stg.name} para cima`}
                          title="Mover para cima"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost-action"
                          style={{ padding: 2 }}
                          onClick={() => moveStage(index, 'down')}
                          disabled={index === stages.length - 1 || busy}
                          aria-label={`Mover etapa ${stg.name} para baixo`}
                          title="Mover para baixo"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>

                      {/* Nome da etapa */}
                      <input
                        type="text"
                        value={stg.name}
                        onChange={e => updateStage(index, { name: e.target.value })}
                        placeholder={`Nome da etapa ${index + 1}`}
                        style={{
                          flex: 1,
                          fontSize: 12,
                          padding: '6px 10px',
                          border: '1px solid var(--border-main)',
                          borderRadius: 6,
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                        aria-label={`Nome da etapa ${index + 1}`}
                        disabled={busy}
                      />

                      {/* Cor por nome */}
                      <select
                        value={stg.color}
                        onChange={e => updateStage(index, { color: e.target.value })}
                        style={{
                          fontSize: 11,
                          padding: '6px 8px',
                          border: '1px solid var(--border-main)',
                          borderRadius: 6,
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          width: 105,
                        }}
                        aria-label={`Cor da etapa ${stg.name}`}
                        disabled={busy}
                      >
                        {NAMED_STAGE_COLORS.map(c => (
                          <option key={c.hex} value={c.hex}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      {/* Limite WIP */}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}
                        title="Limite opcional de trabalho em progresso"
                      >
                        <span>WIP:</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={stg.wip_limit ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null
                            updateStage(index, { wip_limit: isNaN(val as number) ? null : val })
                          }}
                          placeholder="—"
                          style={{
                            width: 48,
                            fontSize: 11,
                            padding: '5px 6px',
                            border: '1px solid var(--border-main)',
                            borderRadius: 6,
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            textAlign: 'center',
                          }}
                          aria-label={`Limite WIP da etapa ${stg.name}`}
                          disabled={busy}
                        />
                      </label>

                      {/* Checkbox Etapa Final */}
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          cursor: 'pointer',
                          userSelect: 'none',
                          color: stg.is_final ? 'var(--chip-success-text)' : 'var(--text-secondary)',
                          fontWeight: stg.is_final ? 700 : 500,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={stg.is_final}
                          onChange={e => updateStage(index, { is_final: e.target.checked })}
                          style={{ accentColor: 'var(--primary-main)' }}
                          aria-label={`Marcar etapa ${stg.name} como final`}
                          disabled={busy}
                        />
                        <span>Final</span>
                      </label>

                      {/* Botão de remover etapa */}
                      <button
                        type="button"
                        className="btn-ghost-action text-danger"
                        onClick={() => removeStage(index)}
                        disabled={stages.length <= 2 || busy}
                        aria-label={`Remover etapa ${stg.name}`}
                        title="Remover etapa"
                        style={{ opacity: stages.length <= 2 ? 0.4 : 1 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}

                <button
                  type="button"
                  onClick={addStage}
                  disabled={busy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    border: '1px dashed var(--border-main)',
                    borderRadius: 6,
                    background: 'var(--bg-surface-subtle)',
                    color: 'var(--primary-main)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                  }}
                >
                  <Plus size={14} /> Adicionar etapa
                </button>
              </div>
            </div>
          </div>

          {/* Rodapé com ações */}
          <footer className="board-wizard-footer">
            <span className="wizard-footer-step-indicator">
              {stages.length} etapas ({stages.filter(s => s.is_final).length} final)
            </span>

            <div className="wizard-footer-buttons">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAttemptClose}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !name.trim()}
              >
                {busy ? 'Salvando...' : isEditing ? 'Salvar Modelo' : 'Criar Modelo'}
              </button>
            </div>
          </footer>
        </form>

        {/* Diálogo de confirmação de descarte de dados preenchidos */}
        {showConfirmDiscard && (
          <div
            className="wizard-confirm-backdrop"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-template-title"
          >
            <div className="wizard-confirm-dialog">
              <h3 id="discard-template-title">Descartar alterações?</h3>
              <p>Você preencheu dados deste modelo que ainda não foram salvos. Deseja mesmo sair e descartar?</p>
              <div className="wizard-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfirmDiscard(false)}
                >
                  Continuar editando
                </button>
                <button
                  type="button"
                  className="btn btn-primary text-danger"
                  style={{ background: 'var(--chip-danger-bg)', color: 'var(--chip-danger-text)', border: '1px solid var(--chip-danger-border)' }}
                  onClick={() => {
                    setShowConfirmDiscard(false)
                    onClose()
                  }}
                >
                  Sim, descartar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
