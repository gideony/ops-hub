import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from './lib'
import type { ChecklistTemplateGroup } from './lib'
import type { Data } from './App'

type Props = {
  data: Data
  group: ChecklistTemplateGroup | null
  preview: boolean
  onClose: () => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  onDemoSave: (group: ChecklistTemplateGroup | null, name: string, description: string, items: string[]) => void
}

export default function TemplateEditor({data,group,preview,onClose,run,onDemoSave}:Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [name,setName]=useState(group?.name||'')
  const [description,setDescription]=useState(group?.description||'')
  const [items,setItems]=useState<string[]>(group?data.templateItems.filter(item=>item.group_id===group.id).sort((a,b)=>a.position-b.position).map(item=>item.title):[])
  const [itemInput,setItemInput]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  function addItem(){const value=itemInput.trim();if(!value)return;setItems(current=>[...current,value]);setItemInput('')}
  async function save(event:FormEvent){
    event.preventDefault()
    if(!name.trim()){setError('Informe o nome do template.');return}
    const cleanItems=[...items,itemInput].map(item=>item.trim()).filter(Boolean)
    if(cleanItems.length===0){setError('Adicione ao menos uma subtarefa.');return}
    setError('')
    if(preview){onDemoSave(group,name.trim(),description.trim(),cleanItems);onClose();return}
    setBusy(true)
    const ok=await run(async()=>{const {error}=await supabase.rpc('save_checklist_template',{p_group_id:group?.id||null,p_name:name.trim(),p_description:description.trim()||null,p_items:cleanItems});if(error)throw error},group?'Template atualizado':'Template criado')
    setBusy(false)
    if(ok)onClose()
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div className="modal template-editor-modal" role="dialog" aria-modal="true" aria-label={group?'Editar Template de Subtarefas':'Criar Template de Subtarefas'}>
    <div className="template-editor-header"><h2>{group?'Editar Template de Subtarefas':'Criar Template de Subtarefas'}</h2><button type="button" onClick={onClose} aria-label="Fechar"><X size={17}/></button></div>
    <form onSubmit={event=>void save(event)}><label className="task-form-field"><span>Nome *</span><input required autoFocus value={name} onChange={event=>setName(event.target.value)} placeholder="Ex: Checklist de Design"/></label><label className="task-form-field"><span>Descrição</span><textarea value={description} onChange={event=>setDescription(event.target.value)} rows={3} maxLength={1000} placeholder="Descrição do template..."/></label><div className="template-editor-items"><h3>Itens do Template</h3>{items.map((item,index)=><div className="template-edit-item" key={index}><span>{index+1}.</span><input value={item} onChange={event=>setItems(current=>current.map((value,i)=>i===index?event.target.value:value))} aria-label={`Subtarefa ${index+1}`}/><button type="button" onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))} aria-label={`Remover subtarefa ${index+1}`}><X size={15}/></button></div>)}<div className="template-add-item"><input value={itemInput} onChange={event=>setItemInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addItem()}}} placeholder="Nova subtarefa..."/><button type="button" onClick={addItem} aria-label="Adicionar subtarefa"><Plus size={18}/></button></div></div>{error&&<p className="template-editor-error" role="alert">{error}</p>}<div className="template-editor-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy||!name.trim()||(items.length===0&&!itemInput.trim())}>{busy?'Salvando...':group?'Salvar Template':'Criar Template'}</button></div></form>
  </div></div>
}
