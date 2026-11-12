import { useEffect, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import { X } from 'lucide-react'
import { supabase } from './lib'
import type { Tag } from './lib'
import type { Data } from './App'

export const tagColors=['#a855f7','#ef4444','#10b981','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#64748b']

type Props = {
  data: Data
  tag: Tag | null
  preview: boolean
  onClose: () => void
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  onDemoSave: (tag: Tag | null, name: string, color: string) => void
}

export default function TagEditor({data,tag,preview,onClose,run,onDemoSave}:Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [name,setName]=useState(tag?.name||'')
  const [color,setColor]=useState(tag?.color||tagColors[0])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  async function save(event:FormEvent){
    event.preventDefault()
    const cleanName=name.trim()
    if(!cleanName){setError('Informe o nome da tag.');return}
    if(data.tags.some(item=>item.id!==tag?.id&&item.name.toLocaleLowerCase('pt-BR')===cleanName.toLocaleLowerCase('pt-BR'))){setError('Já existe uma tag com este nome.');return}
    setError('')
    if(preview){onDemoSave(tag,cleanName,color);onClose();return}
    setBusy(true)
    const ok=await run(async()=>{const {error}=await supabase.rpc('save_tag',{p_tag_id:tag?.id||null,p_name:cleanName,p_color:color});if(error)throw error},tag?'Tag atualizada':'Tag criada')
    setBusy(false)
    if(ok)onClose()
  }

  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div className="modal tag-editor-modal" role="dialog" aria-modal="true" aria-label={tag?'Editar Tag':'Criar Tag'}>
    <div className="template-editor-header"><h2>{tag?'Editar Tag':'Criar Tag'}</h2><button type="button" onClick={onClose} aria-label="Fechar"><X size={17}/></button></div>
    <form onSubmit={event=>void save(event)}>
      <label className="task-form-field"><span>Nome *</span><input required autoFocus maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="Nome da tag"/></label>
      <fieldset className="tag-color-field"><legend>Cor</legend><div className="tag-color-options">{tagColors.map(value=><button type="button" key={value} className={color===value?'selected':''} style={{'--tag-color':value} as CSSProperties} onClick={()=>setColor(value)} aria-label={`Selecionar cor ${value}`} aria-pressed={color===value}/>)}</div></fieldset>
      <div className="tag-editor-preview"><span>Prévia</span><strong style={{'--tag-color':color} as CSSProperties}>{name.trim()||'Nome da tag'}</strong></div>
      {error&&<p className="template-editor-error" role="alert">{error}</p>}
      <div className="template-editor-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={busy||!name.trim()}>{busy?'Salvando...':tag?'Salvar Tag':'Criar Tag'}</button></div>
    </form>
  </div></div>
}
