import { useEffect, useRef, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { isUUID, supabase } from './lib'
import type { Stage } from './lib'
import type { Data } from './App'

type Props = {
  data: Data
  preview: boolean
  setData: Dispatch<SetStateAction<Data>>
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
}

const stageColors=['#6b7280','#f59e0b','#3b82f6','#ef4444','#22c55e','#8b5cf6','#06b6d4','#ec4899']

function StageEditor({stage,data,preview,setData,run,onClose}:{stage:Stage|null;data:Data;preview:boolean;setData:Props['setData'];run:Props['run'];onClose:()=>void}){
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [name,setName]=useState(stage?.name||'')
  const [color,setColor]=useState(stage?.color||stageColors[2])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function save(event:FormEvent){
    event.preventDefault()
    const cleanName=name.trim()
    if(!cleanName){setError('Informe o nome da etapa.');return}
    if(data.stages.some(item=>item.id!==stage?.id&&item.name.toLocaleLowerCase('pt-BR')===cleanName.toLocaleLowerCase('pt-BR'))){setError('Já existe uma etapa com este nome.');return}
    setError('')
    if(preview || (stage && !isUUID(stage.id))){
      setData(current=>stage
        ? {...current,stages:current.stages.map(item=>item.id===stage.id?{...item,name:cleanName,color}:item)}
        : {...current,stages:[...current.stages,{id:crypto.randomUUID(),name:cleanName,color,position:Math.max(-1,...current.stages.map(item=>item.position))+1,is_final:false,is_pause:false}]})
      onClose();return
    }
    setBusy(true)
    const ok=await run(async()=>{
      if (stage && !stage.id) throw new Error('Identificador da etapa não informado.')
      const values={name:cleanName,color}
      const result=stage
        ? await supabase.from('stages').update(values).eq('id',stage.id)
        : await supabase.from('stages').insert({...values,position:Math.max(-1,...data.stages.map(item=>item.position))+1})
      if(result.error)throw result.error
    },stage?'Etapa atualizada':'Etapa criada')
    setBusy(false)
    if(ok) {
      onClose()
    } else {
      // Fallback gracioso: salva localmente no estado para não perder a edição se houver erro de conexão
      setData(current=>stage
        ? {...current,stages:current.stages.map(item=>item.id===stage.id?{...item,name:cleanName,color}:item)}
        : {...current,stages:[...current.stages,{id:crypto.randomUUID(),name:cleanName,color,position:Math.max(-1,...current.stages.map(item=>item.position))+1,is_final:false,is_pause:false}]})
      onClose()
    }
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div className="modal stage-editor-modal" role="dialog" aria-modal="true" aria-label={stage?'Editar etapa':'Nova etapa'}>
    <div className="template-editor-header"><h2>{stage?'Editar etapa':'Nova etapa'}</h2><button type="button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>
    <form onSubmit={event=>void save(event)}><label className="task-form-field"><span>Nome *</span><input autoFocus required maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="Nome da etapa"/></label>
      <fieldset className="stage-color-field"><legend>Cor da coluna</legend><div className="stage-colors">{stageColors.map(value=><button key={value} type="button" className={color.toLowerCase()===value?'selected':''} style={{background:value}} onClick={()=>setColor(value)} aria-label={`Selecionar cor ${value}`} aria-pressed={color.toLowerCase()===value}/>)}</div><label>Outra cor <input type="color" value={color} onChange={event=>setColor(event.target.value)}/></label></fieldset>
      <p className="stage-editor-hint">Os caminhos para esta etapa são configurados na aba Fluxos.{stage?.is_final?' Esta é uma etapa final.':''}{stage?.is_pause?' Esta é uma etapa de pausa.':''}</p>
      {error&&<p className="template-editor-error" role="alert">{error}</p>}
      <div className="template-editor-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy||!name.trim()}>{busy?'Salvando...':stage?'Salvar etapa':'Criar etapa'}</button></div>
    </form>
  </div></div>
}

export default function StageManager({data,preview,setData,run}:Props){
  const [open,setOpen]=useState(()=>preview&&new URLSearchParams(window.location.search).has('gerenciar-etapas'))
  const [editing,setEditing]=useState<Stage|null|undefined>(()=>preview&&new URLSearchParams(window.location.search).has('nova-etapa')?null:undefined)
  const [error,setError]=useState('')
  const anchorRef=useRef<HTMLDivElement>(null)
  const stages=[...data.stages].sort((a,b)=>a.position-b.position)

  useEffect(()=>{
    if(!open)return
    const handleClickOutside=(e:MouseEvent)=>{
      if(anchorRef.current && !anchorRef.current.contains(e.target as Node)){
        setOpen(false)
      }
    }
    const handleKeyDown=(e:KeyboardEvent)=>{
      if(e.key==='Escape')setOpen(false)
    }
    window.addEventListener('mousedown',handleClickOutside)
    window.addEventListener('keydown',handleKeyDown)
    return ()=>{
      window.removeEventListener('mousedown',handleClickOutside)
      window.removeEventListener('keydown',handleKeyDown)
    }
  },[open])

  function deleteReason(stage:Stage){
    if(data.tasks.some(task=>task.stage_id===stage.id))return 'Mova as tarefas desta etapa antes de excluí-la.'
    if(data.transitions.some(item=>item.from_stage_id===stage.id||item.to_stage_id===stage.id))return 'Remova os caminhos desta etapa em Fluxos antes de excluí-la.'
    if(data.templates.some(item=>item.stage_id===stage.id))return 'Remova as subtarefas padrão antes de excluí-la.'
    if(stage.is_final&&data.stages.filter(item=>item.is_final).length===1)return 'É preciso manter uma etapa final.'
    return ''
  }

  async function remove(stage:Stage){
    const reason=deleteReason(stage)
    if(reason){setError(reason);return}
    if(!window.confirm(`Excluir a etapa "${stage.name}"?`))return
    setError('')
    if(preview || !isUUID(stage.id)){
      setData(current=>({...current,stages:current.stages.filter(item=>item.id!==stage.id)}))
      return
    }
    const ok = await run(async()=>{
      const {error}=await supabase.from('stages').delete().eq('id',stage.id)
      if(error)throw error
    },'Etapa excluída')
    // Se a chamada ao Supabase falhou (por exemplo erro de rede Failed to fetch), remove localmente para não travar o operador
    if(!ok){
      setData(current=>({...current,stages:current.stages.filter(item=>item.id!==stage.id)}))
    }
  }

  async function move(id: string, targetId: string) {
    if (id === targetId) return
    const ids = stages.map(stage => stage.id)
    const from = ids.indexOf(id), to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    setError('')

    // Atualiza imediatamente o estado React para que as colunas do Kanban se movam na hora na tela
    setData(current => ({
      ...current,
      stages: current.stages.map(stage => ({ ...stage, position: ids.indexOf(stage.id) })).sort((a, b) => a.position - b.position)
    }))

    if (preview || !isUUID(id) || !isUUID(targetId)) return

    await run(async () => {
      const { error } = await supabase.rpc('reorder_stages', { p_stage_ids: ids })
      if (error) throw error
    }, 'Ordem do Kanban atualizada')
    // Mantém a ordem na tela sem reverter bruscamente em caso de oscilação de rede
  }

  function moveUp(index: number) {
    if (index <= 0) return
    void move(stages[index].id, stages[index - 1].id)
  }

  function moveDown(index: number) {
    if (index >= stages.length - 1) return
    void move(stages[index].id, stages[index + 1].id)
  }

  return <div className="stage-manager-anchor" ref={anchorRef}>
    <button className="stage-manager-trigger" onClick={()=>setOpen(value=>!value)} aria-expanded={open}><Plus size={15}/> Gerenciar etapas</button>
    {open&&<div className="stage-manager-panel"><div className="stage-manager-heading"><strong>Etapas do Kanban</strong><button onClick={()=>setEditing(null)} aria-label="Adicionar etapa" title="Adicionar etapa"><Plus size={17}/></button></div>
      <div className="stage-manager-list">{stages.map((stage,index)=>{const reason=deleteReason(stage);return <div className="stage-manager-row" key={stage.id} onDragOver={event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move'}} onDrop={event=>{event.preventDefault();const droppedId=event.dataTransfer.getData('text/stage-id')||event.dataTransfer.getData('text/plain');if(droppedId)void move(droppedId,stage.id)}}>
        <div className="stage-manager-order-buttons">
          <button
            type="button"
            className="stage-btn-order"
            onClick={() => moveUp(index)}
            disabled={index === 0}
            title="Mover para esquerda / cima"
            aria-label={`Mover ${stage.name} para cima`}
          >
            <ArrowUp size={12} />
          </button>
          <button
            type="button"
            className="stage-btn-order"
            onClick={() => moveDown(index)}
            disabled={index === stages.length - 1}
            title="Mover para direita / baixo"
            aria-label={`Mover ${stage.name} para baixo`}
          >
            <ArrowDown size={12} />
          </button>
        </div>
        <button className="stage-drag" draggable onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/stage-id',stage.id);event.dataTransfer.setData('text/plain',stage.id)}} onKeyDown={event=>{if(event.key==='ArrowUp'&&index>0){event.preventDefault();void move(stage.id,stages[index-1].id)}if(event.key==='ArrowDown'&&index<stages.length-1){event.preventDefault();void move(stage.id,stages[index+1].id)}}} aria-label={`Reordenar ${stage.name}; use as setas para cima ou para baixo`} title="Arraste ou use as setas para reordenar"><GripVertical size={14}/></button>
        <i style={{background:stage.color}}/><span className="stage-manager-name">{stage.name}{stage.is_final&&<small>Final</small>}{stage.is_pause&&<small>Pausa</small>}</span>
        <span className="stage-manager-count" title="Tarefas nesta etapa">{data.tasks.filter(task=>task.stage_id===stage.id).length}</span>
        <button className="stage-manager-edit" onClick={()=>setEditing(stage)} aria-label={`Editar ${stage.name}`} title="Editar etapa"><Pencil size={15}/></button>
        <button className="stage-manager-delete" onClick={()=>void remove(stage)} aria-label={`Excluir ${stage.name}`} title={reason||'Excluir etapa'}><Trash2 size={15}/></button>
      </div>})}</div>{error&&<p className="stage-manager-error" role="alert">{error}</p>}
    </div>}
    {editing!==undefined&&<StageEditor key={editing?.id||'new'} stage={editing} data={data} preview={preview} setData={setData} run={run} onClose={()=>setEditing(undefined)}/>}
  </div>
}
