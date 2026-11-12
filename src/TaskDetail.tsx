import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { ArrowRight, CalendarDays, Check, FolderKanban, History, Layers, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { completed, dateBR, supabase, timeBR } from './lib'
import type { Checklist, Movement, Profile, Task, TaskComment } from './lib'
import type { Data } from './App'

type Props = {
  task: Task
  data: Data
  userId: string
  onClose: () => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  preview?: boolean
  previewChecklist?: Checklist[]
  onPreviewChecklist?: (taskId: string, items: Checklist[]) => void
  onPreviewSave?: (task: Task) => void
  onPreviewDelete?: (taskId: string) => void
  canFreeMove?: boolean
}

type Tab = 'detalhes' | 'subtarefas' | 'relatorios'
const priorityNames: Record<Task['priority'], string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

export default function TaskDetail({
  task,
  data,
  userId,
  onClose,
  run,
  preview = false,
  previewChecklist = [],
  onPreviewChecklist,
  onPreviewSave,
  onPreviewDelete,
  canFreeMove = false
}: Props) {
  const [tab, setTab] = useState<Tab>('detalhes')
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [clientId, setClientId] = useState(task.client_id || '')
  const [priority, setPriority] = useState<Task['priority']>(task.priority)
  const [stageId, setStageId] = useState(task.stage_id)
  const [due, setDue] = useState(task.due_at || '')
  const [teamId, setTeamId] = useState(task.team_id)
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || '')
  const [tags, setTags] = useState(task.tags)
  const [addingTag, setAddingTag] = useState(false)
  const [checklist, setChecklist] = useState<Checklist[]>(previewChecklist)
  const [comments, setComments] = useState<TaskComment[]>(preview ? [{ id: 'demo-comment', task_id: task.id, author_id: task.created_by, body: 'Tarefa em acompanhamento pela equipe.', created_at: task.created_at }] : [])
  const [movements, setMovements] = useState<Movement[]>(preview ? [{ id: 'demo-movement', task_id: task.id, from_stage_id: null, to_stage_id: task.stage_id, moved_by: task.created_by, moved_at: task.created_at }] : [])
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskGroup, setNewSubtaskGroup] = useState('')
  const [selectedTemplateToApply, setSelectedTemplateToApply] = useState('')
  const [newComment, setNewComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  const refresh = useCallback(async () => {
    if (preview) return
    const [checks, notes, history] = await Promise.all([
      supabase.from('task_checklist').select('*').eq('task_id', task.id).order('position'),
      supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at'),
      supabase.from('task_movements').select('*').eq('task_id', task.id).order('moved_at', { ascending: false }),
    ])
    const error = checks.error || notes.error || history.error
    if (error) { setLocalError(error.message); return }
    setChecklist((checks.data || []) as Checklist[])
    setComments((notes.data || []) as TaskComment[])
    setMovements((history.data || []) as Movement[])
  }, [preview, task.id])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (preview) setChecklist(previewChecklist) }, [preview, previewChecklist])

  // Helper para identificar o grupo/template da subtarefa
  const getGroupName = useCallback((item: Checklist): string => {
    if (item.group_name && item.group_name.trim()) return item.group_name.trim()
    const tItem = data.templateItems.find(ti => ti.title.trim().toLowerCase() === item.title.trim().toLowerCase())
    if (tItem) {
      const grp = data.templateGroups.find(g => g.id === tItem.group_id)
      if (grp) return grp.name
    }
    const sItem = data.templates.find(st => st.title.trim().toLowerCase() === item.title.trim().toLowerCase())
    if (sItem) {
      const stg = data.stages.find(s => s.id === sItem.stage_id)
      if (stg) return stg.name
    }
    return 'Subtarefas Avulsas'
  }, [data.templateItems, data.templateGroups, data.templates, data.stages])

  // Agrupamento de subtarefas por template/etapa
  const groupedChecklist = useMemo(() => {
    const map = new Map<string, Checklist[]>()

    for (const item of checklist) {
      const gName = getGroupName(item)
      if (!map.has(gName)) {
        map.set(gName, [])
      }
      map.get(gName)!.push(item)
    }

    const templateOrder = new Map(data.templateGroups.map(g => [g.name.toLowerCase(), g.position]))

    const sortedGroupNames = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Subtarefas Avulsas') return 1
      if (b === 'Subtarefas Avulsas') return -1
      const posA = templateOrder.get(a.toLowerCase()) ?? 999
      const posB = templateOrder.get(b.toLowerCase()) ?? 999
      if (posA !== posB) return posA - posB
      return a.localeCompare(b, 'pt-BR')
    })

    return sortedGroupNames.map(name => ({
      name,
      items: map.get(name)!
    }))
  }, [checklist, getGroupName, data.templateGroups])

  const isDirty = (
    title !== task.title ||
    description !== task.description ||
    clientId !== (task.client_id || '') ||
    priority !== task.priority ||
    stageId !== task.stage_id ||
    due !== (task.due_at || '') ||
    teamId !== task.team_id ||
    assigneeId !== (task.assignee_id || '') ||
    tags.length !== task.tags.length ||
    tags.some(t => !task.tags.includes(t)) ||
    newSubtask.trim().length > 0 ||
    newComment.trim().length > 0
  )

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm('Você tem alterações não salvas. Deseja realmente descartar e fechar?')) {
      return
    }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !addingTag && !editingSubtaskId) requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose, addingTag, editingSubtaskId])

  const allowedStageIds = canFreeMove
    ? new Set(data.stages.map(stage => stage.id))
    : new Set([task.stage_id, ...data.transitions.filter(transition => transition.from_stage_id === task.stage_id).map(transition => transition.to_stage_id)])
  const stageChoices = data.stages.filter(stage => allowedStageIds.has(stage.id)).sort((a, b) => a.position - b.position)
  const eligible = data.members.filter(member => member.team_id === teamId && member.active).map(member => data.profiles.find(person => person.id === member.user_id)).filter((person): person is Profile => Boolean(person))
  const selectedStage = data.stages.find(stage => stage.id === stageId)

  function addTag(value: string) { if (value && !tags.includes(value)) setTags(current => [...current, value]); setAddingTag(false) }

  async function save() {
    if (!title.trim()) { setLocalError('Informe o título da tarefa.'); return }
    setLocalError('')
    setBusy(true)
    const values = { title: title.trim(), description, client_id: clientId || null, priority, stage_id: stageId, due_at: due || null, team_id: teamId, assignee_id: assigneeId || null, tags }
    if (preview) {
      const now = new Date().toISOString()
      onPreviewSave?.({ ...task, ...values, completed_at: stageId === task.stage_id ? task.completed_at : selectedStage?.is_final ? now : null, updated_at: now })
      setBusy(false); onClose(); return
    }
    if (!task?.id) { setLocalError('Identificador da tarefa não informado.'); setBusy(false); return }
    const ok = await run(async () => { const { error } = await supabase.from('tasks').update(values).eq('id', task.id); if (error) throw error }, 'Tarefa atualizada')
    setBusy(false)
    if (ok) onClose()
  }

  async function deleteTask() {
    if (!window.confirm('Tem certeza de que deseja excluir esta tarefa permanentemente? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    if (preview) {
      onPreviewDelete?.(task.id)
      setBusy(false)
      onClose()
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) throw error
    }, 'Tarefa excluída com sucesso')
    setBusy(false)
    if (ok) onClose()
  }

  async function toggleSubtask(item: Checklist) {
    if (!item?.id) return
    if (preview) { const updated = checklist.map(entry => entry.id === item.id ? { ...entry, done: !entry.done } : entry); setChecklist(updated); onPreviewChecklist?.(task.id, updated); return }
    const ok = await run(async () => { const { error } = await supabase.from('task_checklist').update({ done: !item.done }).eq('id', item.id); if (error) throw error }, 'Subtarefa atualizada')
    if (ok) await refresh()
  }

  async function addSubtask(targetGroupName?: string) {
    const value = newSubtask.trim()
    if (!value) return
    const gName = targetGroupName || newSubtaskGroup || null
    if (preview) {
      const updated = [...checklist, {
        id: crypto.randomUUID(),
        task_id: task.id,
        title: value,
        done: false,
        position: checklist.length + 1,
        group_name: gName
      }]
      setChecklist(updated)
      onPreviewChecklist?.(task.id, updated)
      setNewSubtask('')
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('task_checklist').insert({
        task_id: task.id,
        title: value,
        position: checklist.length + 1,
        group_name: gName
      })
      if (error) throw error
    }, 'Subtarefa adicionada')
    if (ok) { setNewSubtask(''); await refresh() }
  }

  async function applyTemplate(templateId: string) {
    if (!templateId) return
    const group = data.templateGroups.find(g => g.id === templateId)
    if (!group) return

    setBusy(true)
    if (preview) {
      const itemsToAdd = data.templateItems
        .filter(ti => ti.group_id === group.id)
        .filter(ti => !checklist.some(c => c.title.trim().toLowerCase() === ti.title.trim().toLowerCase()))

      if (itemsToAdd.length === 0) {
        setLocalError(`Todas as subtarefas do template "${group.name}" já estão aplicadas nesta tarefa.`)
        setBusy(false)
        setSelectedTemplateToApply('')
        return
      }

      const updated = [
        ...checklist,
        ...itemsToAdd.map((ti, index) => ({
          id: crypto.randomUUID(),
          task_id: task.id,
          title: ti.title,
          done: false,
          position: checklist.length + index + 1,
          group_name: group.name,
        }))
      ]
      setChecklist(updated)
      onPreviewChecklist?.(task.id, updated)
      setBusy(false)
      setSelectedTemplateToApply('')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.rpc('apply_template_to_task', {
        p_task_id: task.id,
        p_template_id: templateId
      })
      if (error) throw error
    }, `Template "${group.name}" aplicado à tarefa`)

    setBusy(false)
    setSelectedTemplateToApply('')
    if (ok) await refresh()
  }

  async function removeTemplateGroup(groupName: string, items: Checklist[]) {
    if (!window.confirm(`Tem certeza de que deseja remover todas as ${items.length} subtarefa(s) do template "${groupName}"?`)) return
    setBusy(true)
    const itemIds = items.map(i => i.id)
    if (preview) {
      const updated = checklist.filter(i => !itemIds.includes(i.id))
      setChecklist(updated)
      onPreviewChecklist?.(task.id, updated)
      setBusy(false)
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('task_checklist').delete().in('id', itemIds)
      if (error) throw error
    }, `Subtarefas do template "${groupName}" removidas`)
    setBusy(false)
    if (ok) await refresh()
  }

  function startEditSubtask(item: Checklist) {
    setEditingSubtaskId(item.id)
    setEditingSubtaskTitle(item.title)
  }

  async function saveSubtaskTitle(itemId: string, e?: FormEvent) {
    if (e) e.preventDefault()
    const val = editingSubtaskTitle.trim()
    if (!val) { setEditingSubtaskId(null); return }
    if (preview) {
      const updated = checklist.map(item => item.id === itemId ? { ...item, title: val } : item)
      setChecklist(updated)
      onPreviewChecklist?.(task.id, updated)
      setEditingSubtaskId(null)
      return
    }
    if (!itemId) return
    const ok = await run(async () => {
      const { error } = await supabase.from('task_checklist').update({ title: val }).eq('id', itemId)
      if (error) throw error
    }, 'Subtarefa atualizada')
    setEditingSubtaskId(null)
    if (ok) await refresh()
  }

  async function deleteSubtask(itemId: string) {
    if (preview) {
      const updated = checklist.filter(item => item.id !== itemId)
      setChecklist(updated)
      onPreviewChecklist?.(task.id, updated)
      return
    }
    const ok = await run(async () => {
      const { error } = await supabase.from('task_checklist').delete().eq('id', itemId)
      if (error) throw error
    }, 'Subtarefa excluída')
    if (ok) await refresh()
  }

  async function addComment() {
    const value = newComment.trim(); if (!value) return
    if (preview) { setComments(current => [...current, { id: crypto.randomUUID(), task_id: task.id, author_id: userId, body: value, created_at: new Date().toISOString() }]); setNewComment(''); return }
    const ok = await run(async () => { const { error } = await supabase.from('task_comments').insert({ task_id: task.id, author_id: userId, body: value }); if (error) throw error }, 'Comentário adicionado')
    if (ok) { setNewComment(''); await refresh() }
  }

  const completedCount = checklist.filter(item => item.done).length
  const totalCount = checklist.length
  const overallPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="modal task-detail-modal" role="dialog" aria-modal="true" aria-label="Editar Tarefa">
        <header className="task-detail-header">
          <div>
            <h2>Editar Tarefa</h2>
            <p>Edite os detalhes da tarefa, gerencie subtarefas por templates e adicione relatórios.</p>
          </div>
          <button onClick={requestClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        <nav className="task-detail-tabs" aria-label="Seções da tarefa">
          <button className={tab === 'detalhes' ? 'active' : ''} onClick={() => setTab('detalhes')}>
            Detalhes
          </button>
          <button className={tab === 'subtarefas' ? 'active' : ''} onClick={() => setTab('subtarefas')}>
            Subtarefas {totalCount > 0 && <span className="tab-count-badge">({completedCount}/{totalCount})</span>}
          </button>
          <button className={tab === 'relatorios' ? 'active' : ''} onClick={() => setTab('relatorios')}>
            Relatórios {comments.length > 0 && <span className="tab-count-badge">({comments.length})</span>}
          </button>
        </nav>

        <div className="task-detail-body">
          {tab === 'detalhes' && (
            <div className="task-detail-fields">
              <div className="task-detail-tags">
                <div><Tags size={14} /> <strong>Tags</strong></div>
                <div className="task-detail-tag-list">
                  {tags.map(name => {
                    const tag = data.tags.find(item => item.name === name)
                    return (
                      <span key={name} style={{ '--tag-color': tag?.color || '#64748b' } as CSSProperties}>
                        {name}
                        <button onClick={() => setTags(current => current.filter(item => item !== name))} aria-label={`Remover tag ${name}`}><X size={11} /></button>
                      </span>
                    )
                  })}
                  {addingTag ? (
                    <select autoFocus defaultValue="" onChange={event => addTag(event.target.value)} onBlur={() => setAddingTag(false)} onKeyDown={event => { if (event.key === 'Escape') setAddingTag(false) }} aria-label="Adicionar tag">
                      <option value="">Selecione uma tag</option>
                      {data.tags.filter(tag => !tags.includes(tag.name)).map(tag => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                    </select>
                  ) : (
                    <button className="add-tag" onClick={() => setAddingTag(true)}><Plus size={15} /> Adicionar</button>
                  )}
                </div>
              </div>

              {groupedChecklist.length > 0 && (
                <div className="task-detail-templates-summary">
                  <div className="task-detail-templates-heading">
                    <span><FolderKanban size={14} /> Templates Aplicados ({groupedChecklist.length})</span>
                    <button type="button" className="btn-link" onClick={() => setTab('subtarefas')}>
                      Ver subtarefas &rarr;
                    </button>
                  </div>
                  <div className="task-detail-template-badges">
                    {groupedChecklist.map(grp => {
                      const done = grp.items.filter(i => i.done).length
                      const total = grp.items.length
                      const percent = total > 0 ? Math.round((done / total) * 100) : 0
                      return (
                        <button
                          key={grp.name}
                          type="button"
                          className="task-detail-template-badge"
                          onClick={() => setTab('subtarefas')}
                          title={`Ver subtarefas do template ${grp.name}`}
                        >
                          <FolderKanban size={13} />
                          <strong>{grp.name}</strong>
                          <span className="badge-count">{done}/{total} &bull; {percent}%</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <label className="task-form-field"><span>Título *</span><input required value={title} onChange={event => setTitle(event.target.value)} /></label>
              <label className="task-form-field"><span>Descrição</span><textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} /></label>
              <label className="task-form-field"><span>Cliente</span><select value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Sem cliente</option>{data.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
              <div className="task-form-three">
                <label className="task-form-field"><span>Prioridade</span><select value={priority} onChange={event => setPriority(event.target.value as Task['priority'])}>{(Object.entries(priorityNames) as [Task['priority'], string][]).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
                <label className="task-form-field"><span>Etapa</span><select value={stageId} onChange={event => setStageId(event.target.value)}>{stageChoices.map(stage => <option key={stage.id} value={stage.id}>{stage.name === 'Negociação' ? '● Negociações' : stage.name === 'Backlog' ? '● Backlog Desenvolvimento' : `● ${stage.name}`}</option>)}</select></label>
                <label className="task-form-field"><span>Prazo</span><div className="date-input"><input type="date" value={due} onChange={event => setDue(event.target.value)} /><CalendarDays size={16} /></div></label>
              </div>
              <details className="task-detail-more">
                <summary>Equipe e responsável</summary>
                <div className="task-form-two">
                  <label className="task-form-field"><span>Equipe</span><select value={teamId} onChange={event => { setTeamId(event.target.value); setAssigneeId('') }}>{data.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                  <label className="task-form-field"><span>Responsável</span><select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Sem responsável</option>{eligible.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
                </div>
              </details>
            </div>
          )}

          {tab === 'subtarefas' && (
            <div className="task-detail-subtasks">
              <div className="task-detail-section-heading">
                <h3>Subtarefas</h3>
                <span>{completedCount} de {totalCount} concluídas ({overallPercent}%)</span>
              </div>
              <div className="check-progress">
                <i style={{ width: `${overallPercent}%` }} />
              </div>

              {/* Barra para aplicar novos templates diretamente nesta tarefa */}
              <div className="task-detail-apply-bar">
                <span><Layers size={14} /> Aplicar template:</span>
                <select
                  value={selectedTemplateToApply}
                  onChange={e => {
                    const val = e.target.value
                    setSelectedTemplateToApply(val)
                    if (val) void applyTemplate(val)
                  }}
                  disabled={busy}
                >
                  <option value="">Selecione um template de subtarefas...</option>
                  {data.templateGroups.map(grp => {
                    const count = data.templateItems.filter(item => item.group_id === grp.id).length
                    return (
                      <option key={grp.id} value={grp.id}>
                        {grp.name} ({count} subtarefas)
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Lista de subtarefas agrupadas por Template */}
              {groupedChecklist.length > 0 ? (
                groupedChecklist.map(group => {
                  const doneCount = group.items.filter(i => i.done).length
                  const count = group.items.length
                  const percent = count > 0 ? Math.round((doneCount / count) * 100) : 0

                  return (
                    <div key={group.name} className="task-template-group">
                      <div className="task-template-header">
                        <div className="task-template-header-left">
                          <span className="task-template-icon"><FolderKanban size={15} /></span>
                          <span className="task-template-title">{group.name}</span>
                        </div>
                        <div className="task-template-header-right">
                          <span className="task-template-progress-badge">
                            {doneCount} / {count} &bull; {percent}%
                          </span>
                          <div className="task-template-progress-bar">
                            <i style={{ width: `${percent}%` }} />
                          </div>
                          <button
                            type="button"
                            className="task-template-remove-btn"
                            onClick={() => void removeTemplateGroup(group.name, group.items)}
                            title={`Remover template "${group.name}" desta tarefa`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="task-template-items">
                        {group.items.map(item => {
                          const isEditing = editingSubtaskId === item.id
                          return (
                            <div key={item.id} className="task-detail-subtask-row">
                              {isEditing ? (
                                <form className="task-detail-subtask-edit-form" onSubmit={e => void saveSubtaskTitle(item.id, e)}>
                                  <input
                                    autoFocus
                                    value={editingSubtaskTitle}
                                    onChange={e => setEditingSubtaskTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') setEditingSubtaskId(null) }}
                                  />
                                  <button type="submit" className="save" title="Salvar alteração"><Check size={14} /></button>
                                  <button type="button" className="cancel" onClick={() => setEditingSubtaskId(null)} title="Cancelar"><X size={14} /></button>
                                </form>
                              ) : (
                                <>
                                  <div className="task-detail-subtask-left">
                                    <input type="checkbox" checked={item.done} onChange={() => void toggleSubtask(item)} />
                                    <span className={item.done ? 'done' : ''} onDoubleClick={() => startEditSubtask(item)} title="Duplo clique para editar">
                                      {item.title}
                                    </span>
                                  </div>
                                  <div className="task-detail-subtask-actions">
                                    <button type="button" onClick={() => startEditSubtask(item)} title="Editar texto da subtarefa"><Pencil size={13} /></button>
                                    <button type="button" className="btn-subtask-delete" onClick={() => void deleteSubtask(item.id)} title="Excluir subtarefa"><Trash2 size={13} /></button>
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="task-detail-empty">Esta tarefa ainda não tem subtarefas. Selecione um template acima ou adicione uma subtarefa abaixo.</p>
              )}

              {/* Formulário para adicionar nova subtarefa avulsa ou a um grupo */}
              <div className="task-detail-add-section">
                <div className="task-detail-add">
                  {groupedChecklist.length > 0 && (
                    <select
                      className="task-detail-group-select"
                      value={newSubtaskGroup}
                      onChange={e => setNewSubtaskGroup(e.target.value)}
                      title="Vincular ao template"
                    >
                      <option value="">Template (Automático / Geral)</option>
                      {groupedChecklist.map(grp => (
                        <option key={grp.name} value={grp.name}>{grp.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    value={newSubtask}
                    onChange={event => setNewSubtask(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addSubtask() } }}
                    placeholder="Adicionar subtarefa..."
                  />
                  <button onClick={() => void addSubtask()}><Plus size={15} /> Adicionar</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'relatorios' && (
            <div className="task-detail-reports">
              <div className="task-detail-section-heading">
                <h3>Comentários e relatórios</h3>
                <span>{comments.length} registros</span>
              </div>
              {comments.map(comment => (
                <div className="task-detail-report" key={comment.id}>
                  <div className="avatar avatar-xs">{(data.profiles.find(person => person.id === comment.author_id)?.full_name || '?').slice(0, 1)}</div>
                  <div>
                    <strong>{data.profiles.find(person => person.id === comment.author_id)?.full_name || 'Usuário'}</strong>
                    <time>{timeBR(comment.created_at)}</time>
                    <p>{comment.body}</p>
                  </div>
                </div>
              ))}
              <div className="task-detail-add">
                <input
                  value={newComment}
                  onChange={event => setNewComment(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addComment() } }}
                  placeholder="Adicionar comentário ou relatório"
                />
                <button onClick={() => void addComment()}><Plus size={15} /> Adicionar</button>
              </div>
              <div className="task-detail-section-heading history-heading">
                <h3><History size={16} /> Histórico de movimentação</h3>
              </div>
              {movements.map(movement => (
                <div className="task-detail-movement" key={movement.id}>
                  <ArrowRight size={13} />
                  <span>{data.profiles.find(person => person.id === movement.moved_by)?.full_name || 'Usuário'} moveu para <strong>{data.stages.find(stage => stage.id === movement.to_stage_id)?.name}</strong></span>
                  <time>{timeBR(movement.moved_at)}</time>
                </div>
              ))}
            </div>
          )}

          {localError && <p className="task-detail-error" role="alert">{localError}</p>}
        </div>

        <footer className="task-detail-actions">
          <div className="task-detail-actions-left">
            <button type="button" className="task-detail-delete-btn" onClick={() => void deleteTask()} disabled={busy} title="Excluir tarefa permanentemente">
              <Trash2 size={14} /> Excluir tarefa
            </button>
            <span>{completed(task, data.stages) && task.completed_at ? `Concluída em ${dateBR(task.completed_at)}` : ''}</span>
          </div>
          <div className="task-detail-actions-right">
            <button type="button" onClick={requestClose} disabled={busy}>Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
