import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Tag } from './lib'
import type { Data } from './App'

type Props = {
  data: Data
  canManage: boolean
  onCreate: () => void
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag) => void
  onSelect: (tag: Tag) => void
}

export default function TagTab({data,canManage,onCreate,onEdit,onDelete,onSelect}:Props) {
  const tags=[...data.tags].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
  return <section className="tags-page">
    <div className="tags-page-head"><div><h2>Tags</h2><p>Crie tags para categorizar e organizar suas tarefas</p></div>{canManage&&<button onClick={onCreate}><Plus size={16}/> Nova Tag</button>}</div>
    <div className="tag-card-grid">{tags.map(tag=><article className="tag-card" key={tag.id} style={{'--tag-color':tag.color} as CSSProperties}>
      <button className="tag-card-label" onClick={()=>onSelect(tag)} title={`Ver tarefas com a tag ${tag.name}`}><span>{tag.name}</span></button>
      {canManage&&<div className="tag-card-actions"><button onClick={()=>onEdit(tag)} aria-label={`Editar tag ${tag.name}`} title="Editar tag"><Pencil size={15}/></button><button className="delete" onClick={()=>onDelete(tag)} aria-label={`Excluir tag ${tag.name}`} title="Excluir tag"><Trash2 size={15}/></button></div>}
    </article>)}</div>
    {tags.length===0&&<div className="template-card-empty">Nenhuma tag cadastrada.</div>}
  </section>
}
