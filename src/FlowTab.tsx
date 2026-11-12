import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Info, Plus, Trash2 } from 'lucide-react'
import { supabase } from './lib'
import type { Stage, Transition } from './lib'
import type { Data } from './App'

type Props = {
  data: Data
  canManage: boolean
  preview: boolean
  setData: React.Dispatch<React.SetStateAction<Data>>
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
}

function stageLabel(stage:Stage) {
  if(stage.name==='Negociação')return 'Negociações'
  if(stage.name==='Backlog')return 'Backlog Desenvolvimento'
  if(stage.name==='Pausado')return 'Atividades em pausa'
  return stage.name
}

export default function FlowTab({data,canManage,preview,setData,run}:Props) {
  const [from,setFrom]=useState('')
  const [to,setTo]=useState('')
  const [description,setDescription]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const availableTargets=data.stages.filter(stage=>stage.id!==from&&!data.transitions.some(transition=>transition.from_stage_id===from&&transition.to_stage_id===stage.id))
  const configured=[...data.stages].filter(stage=>data.transitions.some(transition=>transition.from_stage_id===stage.id)).sort((a,b)=>{
    const rank=(stage:Stage)=>stage.name==='Backlog'?100:stage.is_pause?101:stage.position
    return rank(a)-rank(b)
  })

  async function add(event:FormEvent){
    event.preventDefault()
    if(!from||!to||from===to){setError('Selecione etapas diferentes.');return}
    if(data.transitions.some(transition=>transition.from_stage_id===from&&transition.to_stage_id===to)){setError('Este fluxo já existe.');return}
    const transition:Transition={from_stage_id:from,to_stage_id:to,description:description.trim()||null}
    setBusy(true);setError('')
    if(preview){setData(current=>({...current,transitions:[...current.transitions,transition]}));setFrom('');setTo('');setDescription('');setBusy(false);return}
    const ok=await run(async()=>{const {error}=await supabase.from('stage_transitions').insert(transition);if(error)throw error},'Fluxo adicionado')
    if(ok){setFrom('');setTo('');setDescription('')}
    setBusy(false)
  }
  async function remove(transition:Transition){
    if(preview){setData(current=>({...current,transitions:current.transitions.filter(item=>!(item.from_stage_id===transition.from_stage_id&&item.to_stage_id===transition.to_stage_id))}));return}
    await run(async()=>{const {error}=await supabase.from('stage_transitions').delete().eq('from_stage_id',transition.from_stage_id).eq('to_stage_id',transition.to_stage_id);if(error)throw error},'Fluxo removido')
  }
  function target(transition:Transition){return data.stages.find(stage=>stage.id===transition.to_stage_id)}
  function transitionRow(transition:Transition){const destination=target(transition);return <div className="flow-destination" key={transition.to_stage_id}><ArrowRight size={15}/><i style={{background:destination?.color}}/><span>{destination?stageLabel(destination):'Etapa removida'}{transition.description&&<small>— {transition.description}</small>}</span>{canManage&&<button onClick={()=>void remove(transition)} aria-label={`Remover fluxo para ${destination?.name||'etapa'}`} title="Remover fluxo"><Trash2 size={15}/></button>}</div>}

  return <div className="flows-page">
    <div className="flow-help"><h2><Info size={16}/> Como funciona?</h2><p>Defina qual etapa vem após outra. Assim, a equipe sabe para onde mover a tarefa ao concluir sua parte. O banco aceita somente transições configuradas aqui.</p></div>
    {canManage&&<form className="flow-create" onSubmit={event=>void add(event)}><div className="flow-card-heading"><h2>Adicionar Fluxo</h2><p>Defina a sequência entre as etapas do Kanban</p></div><div className="flow-create-pair"><label><span>De</span><select value={from} onChange={event=>{setFrom(event.target.value);setTo('')}}><option value="">Selecione a etapa de origem</option>{data.stages.map(stage=><option key={stage.id} value={stage.id}>{stageLabel(stage)}</option>)}</select></label><ArrowRight size={18}/><label><span>Para</span><select value={to} onChange={event=>setTo(event.target.value)} disabled={!from}><option value="">Selecione a próxima etapa</option>{availableTargets.map(stage=><option key={stage.id} value={stage.id}>{stageLabel(stage)}</option>)}</select></label></div><label className="flow-description"><span>Descrição (opcional)</span><input value={description} onChange={event=>setDescription(event.target.value)} maxLength={500} placeholder="Ex.: Após aprovação comercial, encaminhar para faturamento"/></label>{error&&<p className="flow-form-error" role="alert">{error}</p>}<button className="flow-add-button" disabled={busy||!from||!to} type="submit"><Plus size={16}/> {busy?'Adicionando...':'Adicionar Fluxo'}</button></form>}
    <div className="flow-configured"><div className="flow-card-heading"><h2>Fluxos Configurados</h2><p>Visualize todos os caminhos definidos para as tarefas</p></div><div className="flow-groups">{configured.map(stage=>{const transitions=data.transitions.filter(transition=>transition.from_stage_id===stage.id);const primary=transitions.filter(transition=>{const destination=target(transition);return destination&&!destination.is_pause&&destination.name!=='Backlog'}).sort((a,b)=>(target(a)?.position||0)-(target(b)?.position||0));const alternate=transitions.filter(transition=>!primary.includes(transition));return <section className="flow-group" key={stage.id}><h3><i style={{background:stage.color}}/>{stageLabel(stage)}</h3><div className="flow-destinations">{primary.map(transitionRow)}{alternate.length>0&&<details className="flow-alternates" open={primary.length===0}><summary>{alternate.length} {alternate.length===1?'caminho alternativo':'caminhos alternativos'} para pausa ou backlog</summary>{alternate.map(transitionRow)}</details>}</div></section>})}{configured.length===0&&<p className="flow-empty">Nenhum fluxo configurado.</p>}</div></div>
  </div>
}
