import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, GitBranch, ShieldCheck, X } from 'lucide-react'
import type { Board, BoardStage, Profile, Stage, Task } from './lib'
import type { Data } from './App'
import { getPermittedDestinationBoards } from './board-permissions'

type Props = {
  task?: Task | null
  tasks?: Task[]
  data: Data
  currentProfile: Profile | null
  onClose: () => void
  onConfirmForward: (
    targetBoardId: string | null,
    targetStageId: string,
    targetTeamId?: string | null
  ) => Promise<void>
  onLater?: () => void
  defaultBoardId?: string | null
  defaultStageId?: string | null
}

export default function ForwardTaskModal({
  task,
  tasks,
  data,
  currentProfile,
  onClose,
  onConfirmForward,
  onLater,
  defaultBoardId,
  defaultStageId,
}: Props) {
  const isBatch = Boolean(tasks && tasks.length > 0)
  const taskList = useMemo(() => {
    if (tasks && tasks.length > 0) return tasks
    return task ? [task] : []
  }, [tasks, task])

  // Identificar quadros ancestrais a excluir para prevenção de ciclos
  const excludedBoardIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of taskList) {
      if (t.board_id) ids.add(t.board_id)
      else ids.add('board-geral')
    }
    return Array.from(ids)
  }, [taskList])

  const canonicalGeneralOption: Board = useMemo(() => ({
    id: 'board-geral',
    name: 'Quadro Geral',
    description: 'Quadro canônico geral',
    type: 'general',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: data.stages.map((s: Stage) => s.id),
    position: 0,
    created_by: 'system',
    created_at: '',
    updated_at: '',
  }), [data.stages])

  // Quadros destinos elegíveis (exclui privados de outra equipe e ancestrais da jornada)
  const availableBoards = useMemo(() => {
    const list = getPermittedDestinationBoards(data.boards, data.members, currentProfile, excludedBoardIds)
      .filter(b => b.id !== 'board-geral')
    // Se o Quadro Geral não estiver na lista de exclusão, inclui
    if (!excludedBoardIds.includes('board-geral')) {
      return [canonicalGeneralOption, ...list]
    }
    return list
  }, [data.boards, data.members, currentProfile, excludedBoardIds, canonicalGeneralOption])

  // Estado da seleção do quadro de destino
  const [selectedBoardId, setSelectedBoardId] = useState<string>(() => {
    if (defaultBoardId && availableBoards.some(b => b.id === defaultBoardId)) {
      return defaultBoardId
    }
    return availableBoards[0]?.id || ''
  })

  const targetBoard = useMemo(() => {
    return availableBoards.find(b => b.id === selectedBoardId) || availableBoards[0]
  }, [availableBoards, selectedBoardId])

  // Etapas disponíveis no quadro de destino
  const availableStages = useMemo(() => {
    if (!targetBoard) return []
    if (targetBoard.type === 'custom') {
      return data.boardStages
        .filter((s: BoardStage) => s.board_id === targetBoard.id)
        .sort((a: BoardStage, b: BoardStage) => a.position - b.position)
    }
    return data.stages.sort((a: Stage, b: Stage) => a.position - b.position)
  }, [targetBoard, data.boardStages, data.stages])

  // Estado da etapa de destino (padrão: a primeira etapa do quadro de destino)
  const [selectedStageId, setSelectedStageId] = useState<string>(() => {
    if (defaultStageId && availableStages.some((s: Stage | BoardStage) => s.id === defaultStageId)) {
      return defaultStageId
    }
    return availableStages[0]?.id || ''
  })

  // Se trocar de quadro, reajusta para a primeira etapa do novo quadro
  function handleBoardSelect(boardId: string) {
    setSelectedBoardId(boardId)
    const b = availableBoards.find(item => item.id === boardId)
    if (!b) return
    const stages = b.type === 'custom'
      ? data.boardStages.filter((s: BoardStage) => s.board_id === b.id).sort((x: BoardStage, y: BoardStage) => x.position - y.position)
      : data.stages.sort((x: Stage, y: Stage) => x.position - y.position)
    if (stages.length > 0) {
      setSelectedStageId(stages[0].id)
    }
  }

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedBoardId || !selectedStageId) {
      setError('Selecione o quadro e a etapa de destino.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const normBoardId = selectedBoardId === 'board-geral' ? null : selectedBoardId
      const targetTeamId = targetBoard?.team_id || null
      await onConfirmForward(normBoardId, selectedStageId, targetTeamId)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Falha ao encaminhar tarefa.')
      setBusy(false)
    }
  }

  const singleTitle = task?.title || 'esta tarefa'

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal task-modal" role="dialog" aria-modal="true" aria-label="Encaminhar tarefa concluída">
        <div className="task-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={20} style={{ color: 'var(--accent, #2563eb)' }} />
              <h2>Encaminhar {isBatch ? `${taskList.length} tarefas concluídas` : 'tarefa concluída'}?</h2>
            </div>
            <p>
              {isBatch
                ? `As ${taskList.length} tarefas originais permanecerão concluídas e salvas no quadro atual, gerando ramificações vinculadas no quadro de destino com a linha do tempo herdada.`
                : `A tarefa original continuará salva como concluída neste quadro. Uma nova ramificação será criada no destino com a linha do tempo herdada.`
              }
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>

        <form className="task-form" onSubmit={handleSubmit}>
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'color-mix(in srgb, #ef4444 15%, var(--bg-surface, #fff))',
              border: '1px solid #ef4444',
              color: '#b91c1c',
              fontSize: 13,
              marginBottom: 12
            }}>
              {error}
            </div>
          )}

          {!isBatch && task && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'var(--bg-muted, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              fontSize: 13,
              marginBottom: 12
            }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>
                Tarefa Concluída
              </span>
              <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>
                {singleTitle}
              </p>
            </div>
          )}

          {availableBoards.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
              <p>Não há outros quadros acessíveis para encaminhamento no momento.</p>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginTop: 12 }}>
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="task-form-two">
                <label className="task-form-field">
                  <span>Quadro de Destino *</span>
                  <select
                    value={selectedBoardId}
                    onChange={e => handleBoardSelect(e.target.value)}
                    disabled={busy}
                    required
                  >
                    {availableBoards.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.id === 'board-geral' ? '📌 Quadro Geral' : `📋 ${b.name}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="task-form-field">
                  <span>Etapa de Entrada *</span>
                  <select
                    value={selectedStageId}
                    onChange={e => setSelectedStageId(e.target.value)}
                    disabled={busy || availableStages.length === 0}
                    required
                  >
                    {availableStages.map((s: Stage | BoardStage) => (
                      <option key={s.id} value={s.id}>
                        ● {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Resumo do que será copiado */}
              <div style={{
                margin: '12px 0',
                padding: '12px 14px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--accent, #2563eb) 6%, var(--bg-surface, #fff))',
                border: '1px solid color-mix(in srgb, var(--accent, #2563eb) 20%, transparent)',
                fontSize: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--accent, #2563eb)' }}>
                  <ShieldCheck size={15} />
                  <span>Resumo do Contrato de Ramificação:</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div>
                    <strong style={{ color: '#16a34a' }}>✓ Copiado:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--text-secondary, #475569)' }}>
                      <li>Título e descrição</li>
                      <li>Cliente associado</li>
                      <li>Prioridade e tags</li>
                      <li>Equipe e responsável (se tiver acesso)</li>
                    </ul>
                  </div>
                  <div>
                    <strong style={{ color: '#d97706' }}>↺ Inicia limpo:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--text-secondary, #475569)' }}>
                      <li>Prazo (começa vazio)</li>
                      <li>Subtarefas (templates do novo quadro)</li>
                      <li>Comentários (histórico na linha do tempo)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                {onLater && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      onLater()
                      onClose()
                    }}
                    disabled={busy}
                  >
                    Agora não
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !selectedBoardId || !selectedStageId}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowRight size={16} />
                  {busy ? 'Encaminhando...' : `Encaminhar para ${targetBoard?.name || 'Destino'}`}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
