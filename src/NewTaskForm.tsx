import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from './lib'
import type { Board, Profile, Sprint, Stage, Task } from './lib'
import type { Data } from './App'
import { getStagesForBoard } from './general-views'

type Props = {
  data: Data
  userId: string
  onClose: () => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  onDemoCreate?: (task: Task, templateIds: string[]) => void
  activeBoard?: Board
  currentBoardStages?: Stage[]
  boardSprints?: Sprint[]
  activeSprint?: Sprint | null
}

const priorityNames: Record<Task['priority'], string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

export default function NewTaskForm({ data, userId, onClose, run, onDemoCreate, activeBoard, currentBoardStages, boardSprints, activeSprint }: Props) {
  const allowedTeams = data.teams.filter(team => data.profiles.find(person => person.id === userId)?.role === 'administrador' || data.members.some(member => member.team_id === team.id && member.user_id === userId && member.active))

  const operationalBoards = useMemo(() => {
    const profile = data.profiles.find(p => p.id === userId)
    const isAdmin = !profile || profile.role === 'administrador'
    return (data.boards || []).filter(b => {
      if (b.id === 'board-geral' || b.type === 'general' || b.type === 'sector_view') return false
      // @ts-expect-error is_active pode estar presente em boards atualizados
      if (b.is_active === false) return false
      if (isAdmin) return true
      if (b.is_shared) return true
      if (b.team_id && allowedTeams.some(t => t.id === b.team_id)) return true
      return false
    })
  }, [data.boards, data.profiles, userId, allowedTeams])

  const LAST_BOARD_STORAGE_KEY = `somax_last_task_board_${userId}`

  const [selectedBoardId, setSelectedBoardId] = useState<string>(() => {
    // Se o usuário está dentro de um quadro real (não Geral), pré-seleciona ele
    if (activeBoard && activeBoard.id !== 'board-geral' && activeBoard.type !== 'general' && activeBoard.type !== 'sector_view') {
      return activeBoard.id
    }
    // No Geral, Dashboard ou lista: tenta recuperar o último quadro usado pelo usuário
    try {
      const saved = localStorage.getItem(LAST_BOARD_STORAGE_KEY)
      if (saved && operationalBoards.some(b => b.id === saved)) {
        return saved
      }
    } catch {
      // fallback silencioso
    }
    return operationalBoards[0]?.id || ''
  })

  const currentEffectiveBoard = useMemo(() => {
    return operationalBoards.find(b => b.id === selectedBoardId) || operationalBoards[0] || activeBoard
  }, [operationalBoards, selectedBoardId, activeBoard])

  const isCustomBoard = currentEffectiveBoard && currentEffectiveBoard.type === 'custom'
  
  const boardStages = useMemo(() => {
    if (currentEffectiveBoard) {
      const stages = getStagesForBoard(currentEffectiveBoard, data.stages, data.boardStages)
      if (stages && stages.length > 0) return stages
    }
    if (currentBoardStages && currentBoardStages.length > 0) return currentBoardStages
    return data.stages
  }, [currentEffectiveBoard, currentBoardStages, data.stages, data.boardStages])

  const effectiveBoardSprints = useMemo(() => {
    if (currentEffectiveBoard) {
      return data.sprints.filter(s => s.board_id === currentEffectiveBoard.id)
    }
    return boardSprints || []
  }, [data.sprints, currentEffectiveBoard, boardSprints])

  const titleInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('media')
  const [stageId, setStageId] = useState(boardStages[0]?.id || '')
  const [due, setDue] = useState('')
  const [teamId, setTeamId] = useState(currentEffectiveBoard?.team_id || activeBoard?.team_id || allowedTeams[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState('')
  const [sprintId, setSprintId] = useState(activeSprint?.id || '')
  const [storyPoints, setStoryPoints] = useState<number>(1)
  const [tags, setTags] = useState<string[]>([])
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const eligible = data.members.filter(member => member.team_id === teamId && member.active).map(member => data.profiles.find(person => person.id === member.user_id)).filter((person): person is Profile => Boolean(person))

  // Validação estrita do Bug A: garante que stageId nunca seja vazio e pertença às etapas do quadro
  useEffect(() => {
    if (boardStages.length > 0) {
      if (!stageId || !boardStages.some(s => s.id === stageId)) {
        setStageId(boardStages[0].id)
      }
    }
  }, [boardStages, stageId])

  // Sincroniza sprintId quando o quadro efetivo ou a metodologia mudar
  useEffect(() => {
    if (currentEffectiveBoard?.methodology !== 'scrum') {
      if (sprintId) setSprintId('')
    } else if (sprintId && !effectiveBoardSprints.some(s => s.id === sprintId)) {
      setSprintId('')
    }
  }, [currentEffectiveBoard, effectiveBoardSprints, sprintId])

  const isDirty = Boolean(title.trim() || description.trim() || clientId || due || tags.length > 0 || selectedTemplates.length > 0)

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm('Você começou a preencher os dados da nova tarefa. Deseja realmente descartar e fechar?')) {
      return
    }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  function toggleTemplate(id: string) {
    setSelectedTemplates(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  async function submit(event: FormEvent, createAnother = false) {
    event.preventDefault()
    if (!title.trim() || !teamId || !stageId) return
    const tagList = tags
    const targetBoardId = currentEffectiveBoard?.id || selectedBoardId || operationalBoards[0]?.id
    const targetSprintId = isCustomBoard && currentEffectiveBoard?.methodology === 'scrum' ? (sprintId || null) : null
    const targetStage = boardStages.find(s => s.id === stageId)
    const isFinal = Boolean(targetStage?.is_final)

    if (onDemoCreate) {
      const now = new Date().toISOString()
      onDemoCreate({
        id: crypto.randomUUID(),
        title: title.trim(),
        description,
        team_id: teamId,
        assignee_id: assigneeId || null,
        client_id: clientId || null,
        stage_id: stageId,
        priority,
        due_at: due || null,
        tags: tagList,
        completed_at: isFinal ? now : null,
        created_by: userId,
        created_at: now,
        updated_at: now,
        board_id: targetBoardId,
        sprint_id: targetSprintId,
        story_points: isCustomBoard && currentEffectiveBoard?.methodology === 'scrum' ? storyPoints : 0,
      }, selectedTemplates)

      if (createAnother) {
        setTitle('')
        setDescription('')
        setTags([])
        setSelectedTemplates([])
        setTimeout(() => titleInputRef.current?.focus(), 50)
      } else {
        onClose()
      }
      return
    }

    setBusy(true)
    const ok = await run(async () => {
      const { error } = await supabase.rpc('create_task_with_templates', {
        p_title: title.trim(),
        p_description: description,
        p_team_id: teamId,
        p_assignee_id: assigneeId || null,
        p_client_id: clientId || null,
        p_stage_id: stageId,
        p_priority: priority,
        p_due_at: due || null,
        p_tags: tagList,
        p_template_ids: selectedTemplates,
        p_board_id: targetBoardId,
        p_sprint_id: targetSprintId,
      })
      if (error) throw error
    }, 'Tarefa criada com sucesso')
    setBusy(false)

    if (ok) {
      if (createAnother) {
        setTitle('')
        setDescription('')
        setTags([])
        setSelectedTemplates([])
        setTimeout(() => titleInputRef.current?.focus(), 50)
      } else {
        onClose()
      }
    }
  }

  const selectedTemplatesCount = selectedTemplates.length
  const selectedSubtasksCount = data.templateItems.filter(item => selectedTemplates.includes(item.group_id)).length
  const filteredTemplates = data.templateGroups.filter(group => group.name.toLowerCase().includes(templateSearch.toLowerCase()))

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="new-task-modal-v2" role="dialog" aria-modal="true" aria-label="Nova Tarefa">
        <header className="task-detail-v2-header" style={{ padding: '16px 24px 12px' }}>
          <div className="task-detail-v2-title-block">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Nova Tarefa</h2>
              <span className="modal-pill-board" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: currentEffectiveBoard?.color || '#2563eb' }} />
                Quadro: <strong>{currentEffectiveBoard ? currentEffectiveBoard.name : 'Geral'}</strong>
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>Preencha os campos para criar uma nova tarefa.</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}><X size={18} /></button>
        </header>

        <form onSubmit={event => void submit(event, false)} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="new-task-v2-body">
            {/* Cascata: Quadro e Etapa obrigatórios */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="task-detail-field-v2">
                <span>Quadro *</span>
                <select
                  required
                  value={selectedBoardId}
                  onChange={event => {
                    const newId = event.target.value
                    setSelectedBoardId(newId)
                    try {
                      localStorage.setItem(LAST_BOARD_STORAGE_KEY, newId)
                    } catch {
                      // fallback silencioso
                    }
                    const b = operationalBoards.find(board => board.id === newId)
                    if (b?.team_id) {
                      setTeamId(b.team_id)
                      setAssigneeId('')
                    }
                  }}
                >
                  {operationalBoards.map(board => (
                    <option key={board.id} value={board.id}>
                      {board.name} ({board.methodology === 'scrum' ? 'Scrum' : 'Kanban'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="task-detail-field-v2">
                <span>Etapa *</span>
                <select required value={stageId} onChange={event => setStageId(event.target.value)}>
                  {boardStages.map(stage => <option key={stage.id} value={stage.id}>● {stage.name}</option>)}
                </select>
              </label>
            </div>

            <label className="task-detail-field-v2">
              <span>Título *</span>
              <input ref={titleInputRef} required autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex: Ajustar layout de faturamento" />
            </label>

            <label className="task-detail-field-v2">
              <span>Descrição</span>
              <textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Detalhes, especificações e contexto da tarefa..." style={{ padding: '8px 10px', fontSize: 12, border: '1px solid var(--border-main, #cbd5e1)', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="task-detail-field-v2">
                <span>Prazo</span>
                <div className="date-input" style={{ position: 'relative' }}>
                  <input type="date" value={due} onChange={event => setDue(event.target.value)} style={{ width: '100%' }} />
                </div>
              </label>
              <label className="task-detail-field-v2">
                <span>Cliente</span>
                <select value={clientId} onChange={event => setClientId(event.target.value)}>
                  <option value="">Selecione um cliente</option>
                  {data.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="task-detail-field-v2">
                <span>Prioridade</span>
                <select value={priority} onChange={event => setPriority(event.target.value as Task['priority'])}>
                  {(Object.entries(priorityNames) as [Task['priority'], string][]).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
              </label>
              <label className="task-detail-field-v2">
                <span>Equipe *</span>
                <select required value={teamId} onChange={event => { setTeamId(event.target.value); setAssigneeId('') }}>
                  {allowedTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
            </div>

            <label className="task-detail-field-v2">
              <span>Responsável</span>
              <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
                <option value="">Sem responsável</option>
                {eligible.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
              </select>
            </label>

            {currentEffectiveBoard?.methodology === 'scrum' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="task-detail-field-v2">
                  <span>Sprint (Scrum)</span>
                  <select value={sprintId} onChange={event => setSprintId(event.target.value)}>
                    <option value="">No Backlog (sem sprint)</option>
                    {(effectiveBoardSprints || []).filter(s => s.status !== 'completed').map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status === 'active' ? 'Ativa' : 'Planejada'})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-detail-field-v2">
                  <span>Estimativa (Story Points)</span>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={storyPoints}
                    onChange={event => setStoryPoints(parseInt(event.target.value, 10) || 0)}
                  />
                </label>
              </div>
            )}

            <div className="task-detail-field-v2">
              <span>Tags</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value=""
                  onChange={event => {
                    const val = event.target.value
                    if (val && !tags.includes(val)) setTags(current => [...current, val])
                  }}
                  style={{ flex: 1 }}
                >
                  <option value="">Selecione uma tag</option>
                  {data.tags.filter(tag => !tags.includes(tag.name)).map(tag => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                </select>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {tags.map(name => {
                    const tag = data.tags.find(item => item.name === name)
                    return (
                      <span key={name} style={{ '--tag-color': tag?.color || '#64748b' } as CSSProperties} className="tag-chip">
                        {name}
                        <button type="button" onClick={() => setTags(current => current.filter(item => item !== name))} aria-label={`Remover tag ${name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 3, verticalAlign: 'middle', display: 'inline-flex' }}>
                          <X size={11} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Templates de Subtarefas com busca e contagem (Imagem 4) */}
            <div className="template-selection-box-v2">
              <div className="template-selection-header-v2">
                <strong>Templates de subtarefas (opcional)</strong>
                <span>
                  {selectedTemplatesCount} {selectedTemplatesCount === 1 ? 'selecionado' : 'selecionados'} &middot; {selectedSubtasksCount} {selectedSubtasksCount === 1 ? 'subtarefa' : 'subtarefas'}
                </span>
              </div>

              <div className="template-search-input-v2">
                <Search size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
                <input
                  type="text"
                  placeholder="Buscar template..."
                  value={templateSearch}
                  onChange={event => setTemplateSearch(event.target.value)}
                />
              </div>

              <div className="template-checkbox-grid-v2">
                {filteredTemplates.map(group => {
                  const count = data.templateItems.filter(item => item.group_id === group.id).length
                  const isChecked = selectedTemplates.includes(group.id)
                  return (
                    <label key={group.id} className={`template-checkbox-item-v2 ${isChecked ? 'is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTemplate(group.id)}
                      />
                      <span title={group.name}>{group.name}</span>
                      <small>({count} {count === 1 ? 'subtarefa' : 'subtarefas'})</small>
                    </label>
                  )
                })}
                {filteredTemplates.length === 0 && (
                  <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted, #94a3b8)', textAlign: 'center', margin: '8px 0' }}>
                    Nenhum template encontrado.
                  </p>
                )}
              </div>
            </div>
          </div>

          <footer className="task-detail-v2-footer">
            <button
              type="button"
              onClick={event => void submit(event, true)}
              disabled={busy || !title.trim() || !teamId}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-main, #cbd5e1)',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary, #0f172a)',
                cursor: (busy || !title.trim() || !teamId) ? 'not-allowed' : 'pointer'
              }}
            >
              Criar e adicionar outra
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={requestClose}
                disabled={busy}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-main, #cbd5e1)',
                  borderRadius: 6,
                  padding: '7px 16px',
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim() || !teamId}
                style={{
                  background: 'var(--accent, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (busy || !title.trim() || !teamId) ? 'not-allowed' : 'pointer'
                }}
              >
                {busy ? 'Criando...' : 'Criar tarefa'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
