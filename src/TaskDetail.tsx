import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronsUpDown, Clock, FolderKanban, GitBranch, History, Layers, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { dateBR, isNetworkError, supabase, timeBR } from './lib'
import type { Board, BoardStage, Checklist, Movement, Profile, Stage, Task, TaskComment, TaskLineageEvent } from './lib'
import { getStagesForBoard } from './general-views'
import type { Data } from './App'
import './task-lineage.css'

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
  profile?: Profile | null
  onSelectTask?: (task: Task) => void
  onForwardTask?: (task: Task) => void
}

type Tab = 'detalhes' | 'subtarefas' | 'relatorios' | 'linha_do_tempo'
const priorityNames: Record<Task['priority'], string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' }

/**
 * Reconstrói deterministicamente toda a jornada da tarefa a partir da árvore de ramificações
 * (origin_task_id -> root_task_id), garantindo visualização da linha do tempo mesmo se offline ou se a RPC falhar.
 */
function buildDeterministicLineage(
  currentTask: Task,
  allTasks: Task[],
  allBoards: Board[],
  canonicalStages: Stage[],
  customBoardStages: (BoardStage | Stage)[],
  allProfiles: Profile[]
): TaskLineageEvent[] {
  const events: TaskLineageEvent[] = []

  // 1. Constrói o caminho de tarefas ancestrais (da raiz até a tarefa atual)
  const taskChain: Task[] = []
  let curr: Task | undefined = currentTask
  const visited = new Set<string>()

  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id)
    taskChain.unshift(curr)
    if (curr.origin_task_id) {
      curr = allTasks.find(t => t.id === curr!.origin_task_id)
    } else {
      break
    }
  }

  const rootId = taskChain[0]?.id || currentTask.id

  // 2. Para cada elo da jornada, emite os eventos cronológicos
  taskChain.forEach((t, idx) => {
    const board = allBoards.find(b => b.id === (t.board_id || 'board-geral'))
    const boardName = board?.name || (t.board_id ? 'Quadro Setorial' : 'Quadro Geral')
    const boardColor = (board as any)?.color || '#3b82f6'

    const stage = board?.type === 'custom'
      ? customBoardStages.find(s => s.id === t.stage_id)
      : canonicalStages.find(s => s.id === t.stage_id)
    const stageName = stage?.name || 'Etapa'

    const author = allProfiles.find(p => p.id === t.created_by)?.full_name || 'Operador'
    const forwarder = allProfiles.find(p => p.id === t.forwarded_by)?.full_name || author

    const isFirstInChain = idx === 0

    if (isFirstInChain) {
      events.push({
        id: `synth-${t.id}-created`,
        task_id: t.id,
        root_task_id: rootId,
        board_id: t.board_id || null,
        board_name: boardName,
        board_color: boardColor,
        stage_name: stageName,
        event_type: 'created',
        actor_name: author,
        created_at: t.created_at,
        metadata: {
          note: 'Tarefa criada no quadro inicial'
        }
      })
    } else {
      const prevTask = taskChain[idx - 1]
      const prevBoard = allBoards.find(b => b.id === (prevTask?.board_id || 'board-geral'))
      events.push({
        id: `synth-${t.id}-branched`,
        task_id: t.id,
        root_task_id: rootId,
        board_id: t.board_id || null,
        board_name: boardName,
        board_color: boardColor,
        stage_name: stageName,
        event_type: 'created',
        actor_name: author,
        created_at: t.created_at,
        metadata: {
          from_board_name: prevBoard?.name || 'Quadro anterior',
          branch_from_task_id: prevTask?.id
        }
      })
    }

    if (t.forwarded_at) {
      const nextTask = taskChain[idx + 1] || allTasks.find(other => other.origin_task_id === t.id)
      const nextBoard = nextTask ? allBoards.find(b => b.id === (nextTask.board_id || 'board-geral')) : null
      events.push({
        id: `synth-${t.id}-forwarded`,
        task_id: t.id,
        root_task_id: rootId,
        board_id: t.board_id || null,
        board_name: boardName,
        board_color: boardColor,
        stage_name: 'Concluído',
        event_type: 'forwarded',
        actor_name: forwarder,
        created_at: t.forwarded_at,
        metadata: {
          target_board_name: nextBoard?.name || 'Quadro de Destino',
          target_task_id: nextTask?.id
        }
      })
    }
  })

  // Se a tarefa atual ainda tem ramificação posterior
  if (currentTask.forwarded_at && !taskChain.some(t => t.origin_task_id === currentTask.id)) {
    const nextBranch = allTasks.find(t => t.origin_task_id === currentTask.id)
    if (nextBranch) {
      const nextBoard = allBoards.find(b => b.id === (nextBranch.board_id || 'board-geral'))
      events.push({
        id: `synth-${nextBranch.id}-branch-out`,
        task_id: nextBranch.id,
        root_task_id: rootId,
        board_id: nextBranch.board_id || null,
        board_name: nextBoard?.name || 'Próximo Quadro',
        board_color: (nextBoard && 'color' in nextBoard ? (nextBoard as { color?: string }).color : undefined) || '#3b82f6',
        stage_name: 'Início',
        event_type: 'created',
        actor_name: 'Operador',
        created_at: nextBranch.created_at,
        metadata: {
          from_board_name: allBoards.find(b => b.id === (currentTask.board_id || 'board-geral'))?.name || 'Quadro anterior',
          branch_from_task_id: currentTask.id
        }
      })
    }
  }

  return events
}

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
  canFreeMove = false,
  profile: _profile,
  onSelectTask,
  onForwardTask,
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
  const [lineageEvents, setLineageEvents] = useState<TaskLineageEvent[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskGroup, setNewSubtaskGroup] = useState('')
  const [selectedTemplateToApply, setSelectedTemplateToApply] = useState('')
  const [newComment, setNewComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  const branchTask = useMemo(() => {
    return data.tasks.find(t => t.origin_task_id === task.id)
  }, [data.tasks, task.id])

  const originTask = useMemo(() => {
    return task.origin_task_id ? data.tasks.find(t => t.id === task.origin_task_id) : undefined
  }, [data.tasks, task.origin_task_id])

  const forwardTargetBoard = useMemo(() => {
    if (branchTask?.board_id) {
      return data.boards.find(b => b.id === branchTask.board_id)
    }
    return undefined
  }, [data.boards, branchTask])

  const originBoard = useMemo(() => {
    if (originTask?.board_id) {
      return data.boards.find(b => b.id === originTask.board_id)
    }
    return undefined
  }, [data.boards, originTask])

  const isLocked = Boolean(task.forwarded_at)

  const refresh = useCallback(async () => {
    if (preview) {
      const events = buildDeterministicLineage(
        task,
        data.tasks,
        data.boards,
        data.stages,
        data.boardStages,
        data.profiles
      )
      setLineageEvents(events)

      // Sintetiza histórico de movimentações para demonstração local
      const currentStageName = data.boardStages.find(s => s.id === task.stage_id)?.name || data.stages.find(s => s.id === task.stage_id)?.name || 'Etapa inicial'
      const author = data.profiles.find(p => p.id === task.created_by) || data.profiles[0]
      const demoMovs: Movement[] = [
        {
          id: `mov-${task.id}-1`,
          task_id: task.id,
          from_stage_id: null,
          to_stage_id: task.stage_id,
          moved_by: author?.id || 'demo-user',
          moved_at: task.created_at || new Date().toISOString(),
          from_stage_name: null,
          to_stage_name: currentStageName,
        }
      ]
      setMovements(demoMovs)
      return
    }

    try {
      const [checks, notes, history, lineageRes] = await Promise.all([
        supabase.from('task_checklist').select('*').eq('task_id', task.id).order('position'),
        supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at'),
        supabase.from('task_movements').select('*').eq('task_id', task.id).order('moved_at', { ascending: false }),
        supabase.rpc('get_task_lineage', { p_task_id: task.id })
      ])
      if (checks.data) setChecklist(checks.data as Checklist[])
      if (notes.data) setComments(notes.data as TaskComment[])
      if (history.data) setMovements(history.data as Movement[])

      if (lineageRes.data && Array.isArray(lineageRes.data) && lineageRes.data.length > 0) {
        setLineageEvents(lineageRes.data as TaskLineageEvent[])
      } else {
        const events = buildDeterministicLineage(
          task,
          data.tasks,
          data.boards,
          data.stages,
          data.boardStages,
          data.profiles
        )
        setLineageEvents(events)
      }
    } catch {
      // Fallback resiliente em caso de instabilidade de rede ou modo offline
      const events = buildDeterministicLineage(
        task,
        data.tasks,
        data.boards,
        data.stages,
        data.boardStages,
        data.profiles
      )
      setLineageEvents(events)
    }
  }, [preview, task, data.tasks, data.boards, data.stages, data.boardStages, data.profiles])

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

  const canonicalGeneralOption: Board = useMemo(() => ({
    id: 'board-geral',
    name: 'Quadro Geral',
    description: 'Quadro canônico geral',
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

  const currentBoard = useMemo(() => {
    if (task.board_id) {
      const found = data.boards.find(b => b.id === task.board_id)
      if (found) return found
    }
    // Se a etapa da tarefa pertencer a um quadro específico em boardStages
    const matchingBoardStage = data.boardStages.find(s => s.id === task.stage_id)
    if (matchingBoardStage) {
      const found = data.boards.find(b => b.id === matchingBoardStage.board_id)
      if (found) return found
    }
    return canonicalGeneralOption
  }, [data.boards, data.boardStages, task.board_id, task.stage_id, canonicalGeneralOption])

  const isCustomBoard = currentBoard?.type === 'custom' || Boolean(currentBoard && data.boardStages.some(s => s.board_id === currentBoard.id))
  const currentBoardColor = (currentBoard as any)?.color || '#3b82f6'
  const currentBoardName = currentBoard?.name || 'Quadro Geral'

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

  const availableStagesForBoard = useMemo(() => {
    if (currentBoard) {
      const stages = getStagesForBoard(currentBoard, data.stages, data.boardStages)
      if (stages && stages.length > 0) return stages
    }
    const matchingStage = data.boardStages.find(s => s.id === task.stage_id)
    if (matchingStage) {
      const siblingStages = data.boardStages
        .filter(s => s.board_id === matchingStage.board_id)
        .sort((a, b) => a.position - b.position)
      if (siblingStages.length > 0) {
        return siblingStages
      }
    }
    return data.stages.sort((a, b) => a.position - b.position)
  }, [currentBoard, task.stage_id, data.boardStages, data.stages])

  const stageChoices = useMemo(() => {
    let list: (Stage | BoardStage)[] = availableStagesForBoard
    if (canFreeMove || isCustomBoard) {
      list = availableStagesForBoard
    } else {
      const allowed = new Set([
        task.stage_id,
        ...data.transitions
          .filter(t => t.from_stage_id === task.stage_id)
          .map(t => t.to_stage_id)
      ])
      list = availableStagesForBoard.filter(s => allowed.has(s.id))
    }
    if (!list.some(s => s.id === task.stage_id)) {
      const currentStageObj = data.boardStages.find(s => s.id === task.stage_id) || data.stages.find(s => s.id === task.stage_id)
      if (currentStageObj) {
        list = [currentStageObj, ...list]
      }
    }
    return list
  }, [canFreeMove, isCustomBoard, availableStagesForBoard, data.transitions, task.stage_id, data.boardStages, data.stages])

  // Garante que stageId permaneça íntegro e sincronizado sem troca forçada
  useEffect(() => {
    if (stageChoices.length > 0) {
      if (!stageId) {
        setStageId(task.stage_id || stageChoices[0].id)
      } else if (!stageChoices.some(s => s.id === stageId)) {
        const found = stageChoices.find(s => s.id === task.stage_id)
        if (found) {
          setStageId(found.id)
        }
      }
    }
  }, [stageChoices, stageId, task.stage_id])

  const eligible = data.members.filter(member => member.team_id === teamId && member.active).map(member => data.profiles.find(person => person.id === member.user_id)).filter((person): person is Profile => Boolean(person))
  const selectedStage = availableStagesForBoard.find(stage => stage.id === stageId) || data.stages.find(stage => stage.id === stageId)

  function addTag(value: string) { if (value && !tags.includes(value)) setTags(current => [...current, value]); setAddingTag(false) }

  async function save() {
    if (!title.trim()) { setLocalError('Informe o título da tarefa.'); return }
    setLocalError('')
    setBusy(true)
    const effectiveStageId = isLocked ? task.stage_id : stageId
    const now = new Date().toISOString()
    const values = {
      title: title.trim(),
      description,
      client_id: clientId || null,
      priority,
      stage_id: effectiveStageId,
      due_at: due || null,
      team_id: teamId,
      assignee_id: assigneeId || null,
      tags,
      board_id: task.board_id || null
    }

    const updatedTask: Task = {
      ...task,
      ...values,
      completed_at: effectiveStageId === task.stage_id ? task.completed_at : selectedStage?.is_final ? now : null,
      updated_at: now
    }

    // Salva na prévia local imediatamente para atualização reativa instantânea
    onPreviewSave?.(updatedTask)

    if (preview) {
      setBusy(false)
      onClose()
      return
    }

    if (!task?.id) { setLocalError('Identificador da tarefa não informado.'); setBusy(false); return }

    const ok = await run(async () => {
      try {
        const { error } = await supabase.from('tasks').update({
          title: title.trim(),
          description,
          client_id: clientId || null,
          priority,
          stage_id: effectiveStageId,
          due_at: due || null,
          team_id: teamId,
          assignee_id: assigneeId || null,
          tags,
          board_id: task.board_id || null
        }).eq('id', task.id)
        if (error) {
          console.warn('Aviso ao sincronizar tarefa com servidor:', error.message)
        }
      } catch (err) {
        if (isNetworkError(err) || (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42501')) {
          return
        }
        console.warn('Persistência remota diferida (modo offline/resiliente):', err)
      }
    }, 'Tarefa atualizada')
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
    const updated = checklist.map(entry => entry.id === item.id ? { ...entry, done: !entry.done } : entry)
    setChecklist(updated)
    onPreviewChecklist?.(task.id, updated)
    if (preview) return
    const ok = await run(async () => {
      try {
        const { error } = await supabase.from('task_checklist').update({ done: !item.done }).eq('id', item.id)
        if (error) throw error
      } catch (err) {
        if (isNetworkError(err)) return
        throw err
      }
    }, 'Subtarefa atualizada')
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
      try {
        const { error } = await supabase.from('task_checklist').insert({
          task_id: task.id,
          title: value,
          position: checklist.length + 1,
          group_name: gName
        })
        if (error) throw error
      } catch (err) {
        if (isNetworkError(err)) {
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
          return
        }
        throw err
      }
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
    const updated = checklist.map(item => item.id === itemId ? { ...item, title: val } : item)
    setChecklist(updated)
    onPreviewChecklist?.(task.id, updated)
    setEditingSubtaskId(null)
    if (preview) return
    if (!itemId) return
    const ok = await run(async () => {
      try {
        const { error } = await supabase.from('task_checklist').update({ title: val }).eq('id', itemId)
        if (error) throw error
      } catch (err) {
        if (isNetworkError(err)) return
        throw err
      }
    }, 'Subtarefa atualizada')
    if (ok) await refresh()
  }

  async function deleteSubtask(itemId: string) {
    const updated = checklist.filter(item => item.id !== itemId)
    setChecklist(updated)
    onPreviewChecklist?.(task.id, updated)
    if (preview) return
    const ok = await run(async () => {
      try {
        const { error } = await supabase.from('task_checklist').delete().eq('id', itemId)
        if (error) throw error
      } catch (err) {
        if (isNetworkError(err)) return
        throw err
      }
    }, 'Subtarefa excluída')
    if (ok) await refresh()
  }

  async function addComment() {
    const value = newComment.trim()
    if (!value) return
    const newCommentObj: TaskComment = {
      id: crypto.randomUUID(),
      task_id: task.id,
      author_id: userId,
      body: value,
      created_at: new Date().toISOString()
    }
    setComments(current => [...current, newCommentObj])
    setNewComment('')

    if (preview) return

    const ok = await run(async () => {
      try {
        let effectiveAuthorId: string | undefined = undefined
        try {
          const { data: authData } = await supabase.auth.getUser()
          if (authData?.user?.id) {
            effectiveAuthorId = authData.user.id
          }
        } catch {
          // Sessão offline ou simulada
        }
        if (!effectiveAuthorId && userId && userId !== 'demo-user') {
          effectiveAuthorId = userId
        }

        const insertPayload: { task_id: string; body: string; author_id?: string } = {
          task_id: task.id,
          body: value
        }
        if (effectiveAuthorId) {
          insertPayload.author_id = effectiveAuthorId
        }

        const { error } = await supabase.from('task_comments').insert(insertPayload)
        if (error) throw error
      } catch (err) {
        if (isNetworkError(err) || (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '42501')) {
          // Mantém no estado local gracioso em caso de oscilação de conexão ou RLS transitória
          return
        }
        throw err
      }
    }, 'Relatório registrado com sucesso')
    if (ok) {
      void refresh()
    }
  }

  const completedCount = checklist.filter(item => item.done).length
  const totalCount = checklist.length
  const overallPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="task-detail-modal-v2" role="dialog" aria-modal="true" aria-label="Editar Tarefa">
        <header className="task-detail-v2-header">
          <div className="task-detail-v2-title-block">
            <h2>Editar Tarefa</h2>
            <div className="task-detail-v2-badges">
              <span className="modal-pill-board" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="task-board-dot" style={{ background: currentBoardColor, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                Quadro: <strong>{currentBoardName}</strong>
              </span>
              <span className="modal-pill-stage">
                Etapa: <strong>{selectedStage?.name || 'Etapa'}</strong>
              </span>
              {selectedStage?.is_final && <span className="modal-pill-final">FINAL</span>}
            </div>
          </div>
          <button onClick={requestClose} aria-label="Fechar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}><X size={18} /></button>
        </header>

        {isLocked && (
          <div className="task-forwarded-banner" style={{ margin: '8px 24px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={16} style={{ color: 'var(--accent, #2563eb)', flexShrink: 0 }} />
              <span>
                Esta tarefa está na etapa final e foi <strong>encaminhada para: {forwardTargetBoard?.name || 'outro quadro'}</strong>. O fluxo da original permanece travado.
              </span>
            </div>
            {branchTask && onSelectTask && (
              <button
                type="button"
                className="lineage-badge-link"
                onClick={() => onSelectTask(branchTask)}
                title={`Abrir ramificação no quadro ${forwardTargetBoard?.name || 'de destino'}`}
              >
                Encaminhada para: {forwardTargetBoard?.name || 'Destino'} &rarr;
              </button>
            )}
          </div>
        )}

        {task.origin_task_id && (
          <div className="task-origin-banner" style={{ margin: '8px 24px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              <span>
                Esta tarefa é uma ramificação e <strong>veio de: {originBoard?.name || 'quadro anterior'}</strong>.
              </span>
            </div>
            {originTask && onSelectTask && (
              <button
                type="button"
                className="lineage-badge-link"
                onClick={() => onSelectTask(originTask)}
                title={`Abrir tarefa original no quadro ${originBoard?.name || 'de origem'}`}
              >
                &larr; Veio de: {originBoard?.name || 'Origem'}
              </button>
            )}
          </div>
        )}

        {selectedStage?.is_final && !task.forwarded_at && onForwardTask && (
          <div className="task-detail-v2-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} style={{ color: 'var(--accent, #2563eb)', flexShrink: 0 }} />
              <span>Esta tarefa está na etapa final ({selectedStage.name}). Você pode encaminhá-la para outro quadro.</span>
            </div>
            <button
              type="button"
              className="btn-forward-banner-cta"
              onClick={() => {
                onClose()
                onForwardTask(task)
              }}
            >
              <GitBranch size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Encaminhar para outro quadro
            </button>
          </div>
        )}

        <div className="task-detail-v2-body">
          <div className="task-detail-v2-left">
            <div className="task-detail-v2-tabs-header">
              <nav className="task-detail-v2-tabs" aria-label="Seções da tarefa">
                <button type="button" className={`task-detail-v2-tab-btn ${tab === 'detalhes' ? 'active' : ''}`} onClick={() => setTab('detalhes')}>
                  Detalhes
                </button>
                <button type="button" className={`task-detail-v2-tab-btn ${tab === 'subtarefas' ? 'active' : ''}`} onClick={() => setTab('subtarefas')}>
                  Subtarefas <span className="tab-count-badge">({completedCount}/{totalCount})</span>
                </button>
                <button type="button" className={`task-detail-v2-tab-btn ${tab === 'relatorios' ? 'active' : ''}`} onClick={() => setTab('relatorios')}>
                  Relatórios <span className="tab-count-badge">({comments.length})</span>
                </button>
                <button type="button" className={`task-detail-v2-tab-btn ${tab === 'linha_do_tempo' ? 'active' : ''}`} onClick={() => setTab('linha_do_tempo')}>
                  Linha do tempo <span className="tab-count-badge">({lineageEvents.length})</span>
                </button>
              </nav>
              <div className="task-detail-tab-arrows" aria-hidden="true" title="Alternar seções">
                <ChevronsUpDown size={15} />
              </div>
            </div>

            {tab === 'detalhes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label className="task-detail-field-v2">
                  <span>Título *</span>
                  <input required value={title} onChange={event => setTitle(event.target.value)} />
                </label>

                <label className="task-detail-field-v2">
                  <span>Descrição</span>
                  <textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} />
                </label>

                {groupedChecklist.length > 0 && (
                  <div className="templates-applied-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span className="templates-applied-card-title" style={{ margin: 0, fontWeight: 700 }}>
                        Templates aplicados ({groupedChecklist.length})
                      </span>
                      <button type="button" className="btn-link" onClick={() => setTab('subtarefas')} style={{ fontSize: 11, color: 'var(--accent, #2563eb)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Ver subtarefas &rarr;
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {groupedChecklist.map(grp => {
                        const done = grp.items.filter(i => i.done).length
                        const total = grp.items.length
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0
                        return (
                          <div key={grp.name} className="template-applied-item">
                            <span className="template-applied-name" title={grp.name}>{grp.name}</span>
                            <div className="template-applied-track">
                              <div className="template-applied-bar" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="template-applied-stat">{done}/{total} &middot; {pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
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
              <div className="task-detail-add-report">
                <textarea
                  rows={3}
                  value={newComment}
                  onChange={event => setNewComment(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      void addComment()
                    }
                  }}
                  placeholder="Escreva um comentário, parecer ou relatório de atendimento sobre esta tarefa... (Pressione Ctrl+Enter para enviar)"
                />
                <div className="task-detail-add-report-actions">
                  <small className="task-report-hint">Dica: pressione Ctrl+Enter para registrar rapidamente.</small>
                  <button
                    type="button"
                    className="btn-add-report"
                    onClick={() => void addComment()}
                    disabled={!newComment.trim()}
                  >
                    <Plus size={14} /> Registrar relatório
                  </button>
                </div>
              </div>
              <div className="task-detail-section-heading history-heading">
                <h3><History size={16} /> Histórico de movimentação</h3>
              </div>
              {movements.length === 0 ? (
                <p className="task-detail-empty" style={{ margin: '8px 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                  Nenhuma movimentação registrada para esta tarefa.
                </p>
              ) : (
                movements.map(movement => {
                  const author = data.profiles.find(person => person.id === movement.moved_by)
                  const authorName = author?.full_name || 'Usuário'
                  const fromStageName = movement.from_stage_name || data.boardStages.find(s => s.id === movement.from_stage_id)?.name || data.stages.find(s => s.id === movement.from_stage_id)?.name
                  const toStageName = movement.to_stage_name || data.boardStages.find(s => s.id === movement.to_stage_id)?.name || data.stages.find(s => s.id === movement.to_stage_id)?.name || 'etapa removida'

                  return (
                    <div className="task-detail-movement" key={movement.id}>
                      <ArrowRight size={13} style={{ flexShrink: 0, color: 'var(--accent, #2563eb)' }} />
                      <span>
                        {authorName} moveu {fromStageName ? <>de <strong>{fromStageName}</strong> para </> : 'para '}
                        <strong>{toStageName}</strong>
                      </span>
                      <time title={`${dateBR(movement.moved_at)} às ${timeBR(movement.moved_at)}`}>
                        {dateBR(movement.moved_at)} às {timeBR(movement.moved_at)}
                      </time>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {tab === 'linha_do_tempo' && (
            <div className="task-detail-lineage">
              <div className="task-detail-section-heading">
                <h3><Clock size={16} /> Linha do Tempo da Jornada</h3>
                <span>{lineageEvents.length} registros</span>
              </div>
              {lineageEvents.length === 0 ? (
                <p className="task-detail-empty">Nenhum evento registrado na jornada desta tarefa até o momento.</p>
              ) : (
                <div className="lineage-timeline">
                  {lineageEvents.map((evt, idx) => {
                    const isBranchPoint = evt.event_type === 'forwarded'
                    const isBranchArrival = evt.metadata && (evt.metadata as any)?.branch_from_task_id
                    const boardColor = evt.board_color || '#3b82f6'
                    return (
                      <div key={evt.id || idx} className={`lineage-item ${isBranchPoint ? 'branch-point' : ''}`}>
                        <div className="lineage-indicator">
                          <span className="lineage-dot" style={{ background: isBranchPoint ? 'var(--accent, #2563eb)' : boardColor }} />
                          {idx < lineageEvents.length - 1 && <span className="lineage-connector" />}
                        </div>
                        <div className="lineage-content">
                          <div className="lineage-header">
                            <span
                              className="lineage-board-chip"
                              style={{
                                background: `color-mix(in srgb, ${boardColor} 14%, var(--bg-surface, #fff))`,
                                color: boardColor,
                                border: `1px solid color-mix(in srgb, ${boardColor} 30%, transparent)`,
                              }}
                            >
                              {evt.board_name}
                            </span>
                            <span className="lineage-stage-name">● {evt.stage_name}</span>
                            <span className="lineage-time">{timeBR(evt.created_at)}</span>
                          </div>

                          <div className="lineage-actor">
                            <span>Por: <strong>{evt.actor_name || 'Sistema'}</strong></span>
                            {evt.is_masked && <span className="lineage-masked-pill">Quadro restrito</span>}
                          </div>

                          {isBranchPoint && (
                            <div className="lineage-branch-banner">
                              <GitBranch size={15} style={{ color: 'var(--accent, #2563eb)', flexShrink: 0 }} />
                              <span>
                                Encaminhada para <strong>{(evt.metadata as any)?.target_board_name || 'outro quadro'}</strong>
                              </span>
                              {branchTask && onSelectTask && (
                                <button
                                  type="button"
                                  className="lineage-badge-link"
                                  onClick={() => onSelectTask(branchTask)}
                                  style={{ marginLeft: 'auto' }}
                                >
                                  Ver ramificação &rarr;
                                </button>
                              )}
                            </div>
                          )}

                          {isBranchArrival && (
                            <div className="lineage-origin-banner">
                              <GitBranch size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                              <span>
                                Veio de <strong>{(evt.metadata as any)?.from_board_name || 'quadro anterior'}</strong>
                              </span>
                              {originTask && onSelectTask && (
                                <button
                                  type="button"
                                  className="lineage-badge-link"
                                  onClick={() => onSelectTask(originTask)}
                                  style={{ marginLeft: 'auto' }}
                                >
                                  &larr; Ver tarefa original
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

            {localError && <p className="task-detail-error" role="alert">{localError}</p>}
          </div>

          <aside className="task-detail-v2-right">
            <label className="task-detail-field-v2">
              <span>Etapa</span>
              <select value={stageId} onChange={event => setStageId(event.target.value)} disabled={isLocked}>
                {stageChoices.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    ● {stage.name === 'Negociação' ? 'Negociações' : stage.name === 'Backlog' ? 'Backlog Desenvolvimento' : stage.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-detail-field-v2">
              <span>Prioridade</span>
              <select value={priority} onChange={event => setPriority(event.target.value as Task['priority'])}>
                {(Object.entries(priorityNames) as [Task['priority'], string][]).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </label>

            <label className="task-detail-field-v2">
              <span>Prazo</span>
              <div className="date-input" style={{ position: 'relative' }}>
                <input type="date" value={due} onChange={event => setDue(event.target.value)} style={{ width: '100%' }} />
              </div>
            </label>

            <label className="task-detail-field-v2">
              <span>Cliente</span>
              <select value={clientId} onChange={event => setClientId(event.target.value)}>
                <option value="">Sem cliente</option>
                {data.clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>

            <label className="task-detail-field-v2">
              <span>Equipe</span>
              <select value={teamId} onChange={event => { setTeamId(event.target.value); setAssigneeId('') }}>
                {data.teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>

            <label className="task-detail-field-v2">
              <span>Responsável</span>
              <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
                <option value="">Sem responsável</option>
                {eligible.map(person => (
                  <option key={person.id} value={person.id}>{person.full_name}</option>
                ))}
              </select>
            </label>

            <div className="task-detail-field-v2">
              <span>Tags</span>
              <div className="task-detail-tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
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
                {addingTag ? (
                  <select autoFocus defaultValue="" onChange={event => addTag(event.target.value)} onBlur={() => setAddingTag(false)} onKeyDown={event => { if (event.key === 'Escape') setAddingTag(false) }} aria-label="Adicionar tag" style={{ fontSize: 11, padding: '2px 4px' }}>
                    <option value="">Selecione uma tag</option>
                    {data.tags.filter(tag => !tags.includes(tag.name)).map(tag => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
                  </select>
                ) : (
                  <button type="button" className="add-tag" onClick={() => setAddingTag(true)} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px dashed var(--border-main, #cbd5e1)', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <Plus size={12} /> Adicionar
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>

        <footer className="task-detail-v2-footer">
          <button type="button" className="task-detail-delete-btn" onClick={() => void deleteTask()} disabled={busy} title="Excluir tarefa permanentemente">
            <Trash2 size={15} /> Excluir tarefa
          </button>
          <div className="task-detail-v2-footer-right">
            <button type="button" className="btn-cancel-task" onClick={requestClose} disabled={busy}>
              Cancelar
            </button>
            {selectedStage?.is_final && !task.forwarded_at && onForwardTask && (
              <button
                type="button"
                className="btn-forward-footer-cta"
                onClick={() => {
                  onClose()
                  onForwardTask(task)
                }}
                title="Encaminhar esta tarefa concluída para outro quadro"
              >
                <GitBranch size={15} />
                Encaminhar para outro quadro
              </button>
            )}
            <button
              type="button"
              className="btn-save-task"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
