import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { supabase } from './lib'
import type { Board, Profile, Sprint, Stage, Task } from './lib'
import type { Data } from './App'

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

const priorityNames: Record<Task['priority'],string> = { baixa:'Baixa', media:'Média', alta:'Alta', urgente:'Urgente' }

export default function NewTaskForm({data,userId,onClose,run,onDemoCreate,activeBoard,currentBoardStages,boardSprints,activeSprint}:Props) {
  const allowedTeams = data.teams.filter(team => data.profiles.find(person => person.id === userId)?.role === 'administrador' || data.members.some(member => member.team_id === team.id && member.user_id === userId && member.active))
  const isCustomBoard = activeBoard && activeBoard.type === 'custom'
  const boardStages = currentBoardStages && currentBoardStages.length > 0 ? currentBoardStages : data.stages
  const firstStage = boardStages[0]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('media')
  const [stageId, setStageId] = useState(firstStage?.id || '')
  const [due, setDue] = useState('')
  const [teamId, setTeamId] = useState(activeBoard?.team_id || allowedTeams[0]?.id || '')
  const [assigneeId, setAssigneeId] = useState('')
  const [sprintId, setSprintId] = useState(activeSprint?.id || '')
  const [storyPoints, setStoryPoints] = useState<number>(1)
  const [tags, setTags] = useState<string[]>([])
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const eligible = data.members.filter(member => member.team_id === teamId && member.active).map(member => data.profiles.find(person => person.id === member.user_id)).filter((person):person is Profile => Boolean(person))

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

  function toggleTemplate(id:string) { setSelectedTemplates(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]) }

  async function submit(event:FormEvent) {
    event.preventDefault()
    if(!title.trim()||!teamId||!stageId)return
    const tagList=tags
    // Apenas quadros personalizados independentes (custom) possuem board_id próprio na tarefa.
    // Visões por setor (sector_view) espelham o fluxo canônico (board_id: null),
    // garantindo que a tarefa apareça tanto no quadro do setor quanto no Quadro Geral.
    const targetBoardId = activeBoard && activeBoard.type === 'custom' ? activeBoard.id : null
    const targetSprintId = isCustomBoard && activeBoard.methodology === 'scrum' ? (sprintId || null) : null
    const targetStage = boardStages.find(s => s.id === stageId)
    const isFinal = Boolean(targetStage?.is_final)

    if(onDemoCreate){
      const now=new Date().toISOString()
      onDemoCreate({
        id:crypto.randomUUID(),
        title:title.trim(),
        description,
        team_id:teamId,
        assignee_id:assigneeId||null,
        client_id:clientId||null,
        stage_id:stageId,
        priority,
        due_at:due||null,
        tags:tagList,
        completed_at:isFinal?now:null,
        created_by:userId,
        created_at:now,
        updated_at:now,
        board_id:targetBoardId,
        sprint_id:targetSprintId,
        story_points:isCustomBoard && activeBoard.methodology === 'scrum' ? storyPoints : 0,
      },selectedTemplates)
      onClose()
      return
    }
    setBusy(true)
    const ok=await run(async()=>{
      const {error}=await supabase.rpc('create_task_with_templates',{
        p_title:title.trim(),
        p_description:description,
        p_team_id:teamId,
        p_assignee_id:assigneeId||null,
        p_client_id:clientId||null,
        p_stage_id:stageId,
        p_priority:priority,
        p_due_at:due||null,
        p_tags:tagList,
        p_template_ids:selectedTemplates,
        p_board_id:targetBoardId,
        p_sprint_id:targetSprintId,
      })
      if(error)throw error
    },'Tarefa criada com sucesso')
    setBusy(false)
    if(ok)onClose()
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)requestClose()}}>
    <div className="modal task-modal" role="dialog" aria-modal="true" aria-label="Nova Tarefa">
      <div className="task-modal-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2>Nova Tarefa</h2>
            {activeBoard && activeBoard.type !== 'general' && (
              <span className="active-tag" style={{ fontSize: 9 }}>
                {activeBoard.name}
              </span>
            )}
          </div>
          <p>Preencha os campos para criar uma nova tarefa.</p>
        </div>
        <button type="button" onClick={requestClose} aria-label="Fechar"><X size={18}/></button>
      </div>
      <form className="task-form" onSubmit={event=>void submit(event)}>
        <label className="task-form-field"><span>Título *</span><input required autoFocus value={title} onChange={event=>setTitle(event.target.value)} placeholder="Nome da tarefa"/></label>
        <label className="task-form-field"><span>Descrição</span><textarea rows={4} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Descrição detalhada..."/></label>
        <label className="task-form-field"><span>Cliente</span><select value={clientId} onChange={event=>setClientId(event.target.value)}><option value="">Selecione um cliente</option>{data.clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <div className="task-form-three">
          <label className="task-form-field"><span>Prioridade</span><select value={priority} onChange={event=>setPriority(event.target.value as Task['priority'])}>{(Object.entries(priorityNames) as [Task['priority'],string][]).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
          <label className="task-form-field"><span>Etapa</span><select value={stageId} onChange={event=>setStageId(event.target.value)}>{boardStages.map(stage=><option key={stage.id} value={stage.id}>● {stage.name}</option>)}</select></label>
          <label className="task-form-field"><span>Prazo</span><div className="date-input"><input type="date" value={due} onChange={event=>setDue(event.target.value)}/><CalendarDays size={16}/></div></label>
        </div>
        {activeBoard?.methodology === 'scrum' && (
          <div className="task-form-two">
            <label className="task-form-field">
              <span>Sprint (Scrum)</span>
              <select value={sprintId} onChange={event=>setSprintId(event.target.value)}>
                <option value="">No Backlog (sem sprint)</option>
                {(boardSprints || []).filter(s => s.status !== 'completed').map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status === 'active' ? 'Ativa' : 'Planejada'})
                  </option>
                ))}
              </select>
            </label>
            <label className="task-form-field">
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
        <fieldset className="template-selection"><legend>Templates de Subtarefas</legend><p>Selecione os templates que serão aplicados automaticamente ao criar a tarefa.</p><div className="template-checkboxes">{data.templateGroups.map(group=>{const count=data.templateItems.filter(item=>item.group_id===group.id).length;return <label key={group.id}><input type="checkbox" checked={selectedTemplates.includes(group.id)} onChange={()=>toggleTemplate(group.id)}/><span>{group.name} <small>({count} {count===1?'subtarefa':'subtarefas'})</small></span></label>})}</div></fieldset>
        <div className="task-form-additional"><div className="task-form-two"><label className="task-form-field"><span>Equipe *</span><select required value={teamId} onChange={event=>{setTeamId(event.target.value);setAssigneeId('')}}>{allowedTeams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="task-form-field"><span>Responsável</span><select value={assigneeId} onChange={event=>setAssigneeId(event.target.value)}><option value="">Sem responsável</option>{eligible.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label></div><label className="task-form-field"><span>Tags</span><select value="" onChange={event=>{const value=event.target.value;if(value)setTags(current=>[...current,value])}}><option value="">Selecione uma tag</option>{data.tags.filter(tag=>!tags.includes(tag.name)).map(tag=><option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label>{tags.length>0&&<div className="task-form-tag-list">{tags.map(name=>{const tag=data.tags.find(item=>item.name===name);return <span key={name} style={{'--tag-color':tag?.color||'#64748b'} as CSSProperties}>{name}<button type="button" onClick={()=>setTags(current=>current.filter(item=>item!==name))} aria-label={`Remover tag ${name}`}><X size={12}/></button></span>})}</div>}</div>
        <div className="task-form-actions"><button type="button" onClick={requestClose}>Cancelar</button><button type="submit" disabled={busy||!teamId}>{busy?'Criando...':'Criar tarefa'}</button></div>
      </form>
    </div>
  </div>
}
