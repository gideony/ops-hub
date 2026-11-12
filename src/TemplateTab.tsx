import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ChecklistTemplateGroup } from './lib'
import type { Data } from './App'

type Props = {
  data: Data
  canManage: boolean
  onCreate: () => void
  onEdit: (group: ChecklistTemplateGroup) => void
  onDelete: (group: ChecklistTemplateGroup) => void
}

export default function TemplateTab({data,canManage,onCreate,onEdit,onDelete}:Props) {
  const groups=[...data.templateGroups].sort((a,b)=>a.position-b.position)
  return <section className="templates-page"><div className="templates-page-head"><div><h2>Templates de Subtarefas</h2><p>Crie grupos de subtarefas prontos para aplicar em tarefas</p></div>{canManage&&<button onClick={onCreate}><Plus size={16}/> Novo Template</button>}</div><div className="template-card-grid">{groups.map(group=>{const items=data.templateItems.filter(item=>item.group_id===group.id).sort((a,b)=>a.position-b.position);return <article className="template-card" key={group.id}><div className="template-card-top"><h3>{group.name}</h3>{canManage&&<div className="template-card-actions"><button onClick={()=>onEdit(group)} aria-label={`Editar ${group.name}`}><Pencil size={14}/> Editar</button><button className="delete" onClick={()=>onDelete(group)} aria-label={`Excluir ${group.name}`}><Trash2 size={15}/></button></div>}</div>{group.description&&<p className="template-card-description">{group.description}</p>}<div className="template-card-count"><FolderOpen size={14}/>{items.length} {items.length===1?'item':'itens'}</div><div className="template-card-chips">{items.slice(0,3).map(item=><span key={item.id} title={item.title}>{item.title}</span>)}{items.length>3&&<span className="more">+{items.length-3}</span>}</div></article>})}</div>{groups.length===0&&<div className="template-card-empty">Nenhum template cadastrado.</div>}</section>
}
