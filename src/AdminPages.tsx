import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { ArrowRight, Clock, Download, LayoutGrid, Link2, List, Plus, Search, Share2, Trash2, X } from 'lucide-react'
import { maskPhone, messageError, supabase } from './lib'
import type { Client, ClientRegistrationData, ClientRegistrationLink, ClientRegistrationSubmission, Profile, Team } from './lib'
import type { Data } from './App'
import UserEditor from './UserEditor'
import { clearDraft, getDraft, saveDraft } from './drafts'
import { GenerateLinkModal, ManageLinksModal, PendingRegistrationsModal } from './ClientRegistrationModals'
import { ClientProfileModal } from './ClientProfileModal'
import { downloadClientsCsv } from './client-export'
import PasswordInput from './PasswordInput'

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>
type BaseProps = { data: Data; preview: boolean; setData: Dispatch<SetStateAction<Data>>; run: Run; notify: (message:string)=>void }
type Entry = { first: string; second: string }
interface ClientDraftData {
  name?: string
  legal?: string
  contact?: string
  email?: string
  phone?: string
  financialContact?: string
  financialEmail?: string
  financialWhatsapp?: string
  financialDueDate?: string
  financial?: string
  links?: Entry[]
}

function Modal({title,onClose,children,wide=false,dirty=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;dirty?:boolean}){
  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('Você tem alterações não salvas. Deseja realmente descartar e fechar?')) return
    onClose()
  }, [dirty, onClose])
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose])
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)handleClose()}}><div className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-btn" onClick={handleClose} aria-label="Fechar"><X size={19}/></button></div>{children}</div></div>
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'?'}
function Empty({text}:{text:string}){return <div className="empty"><p>{text}</p></div>}
function EntryList({entries,onChange,addLabel,firstLabel,secondLabel,firstPlaceholder,secondPlaceholder,canEdit}:{entries:Entry[];onChange:(entries:Entry[])=>void;addLabel:string;firstLabel:string;secondLabel:string;firstPlaceholder:string;secondPlaceholder:string;canEdit:boolean}){
  const update=(index:number,key:keyof Entry,value:string)=>onChange(entries.map((entry,itemIndex)=>itemIndex===index?{...entry,[key]:value}:entry))
  return <div className="entry-list">{entries.map((entry,index)=><div className="entry-row" key={index}><Field label={firstLabel}><input value={entry.first} onChange={event=>update(index,'first',event.target.value)} placeholder={firstPlaceholder} readOnly={!canEdit}/></Field><Field label={secondLabel}><input value={entry.second} onChange={event=>update(index,'second',event.target.value)} placeholder={secondPlaceholder} readOnly={!canEdit}/></Field>{canEdit&&<button type="button" className="entry-remove" onClick={()=>onChange(entries.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remover ${entry.first||'item'}`}><X size={16}/></button>}</div>)}{canEdit&&<button type="button" className="btn btn-secondary entry-add" onClick={()=>onChange([...entries,{first:'',second:''}])}><Plus size={15}/>{addLabel}</button>}</div>
}
const roleNames:Record<Profile['role'],string>={administrador:'Administrador',gestor:'Gestor',colaborador:'Colaborador'}

export function ClientsPage({
  data,
  canAdmin,
  canManageTeam,
  preview,
  setData,
  run,
  notify,
  hasMore = false,
  loadMore,
  loadingMore = false,
  userId = '',
}: BaseProps & {
  canAdmin: boolean
  canManageTeam?: (id: string) => boolean
  hasMore?: boolean
  loadMore?: () => Promise<void> | void
  loadingMore?: boolean
  userId?: string
}) {
  const [view, setView] = useState<'cards' | 'list'>(() => preview && new URLSearchParams(window.location.search).get('visao') === 'lista' ? 'list' : 'cards')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [viewingClient, setViewingClient] = useState<Client | null>(null)
  const [editing, setEditing] = useState(() => preview && new URLSearchParams(window.location.search).has('novo-cliente'))
  const [tab, setTab] = useState<'geral' | 'financeiro' | 'links' | 'integracao'>('geral')
  const [name, setName] = useState('')
  const [legal, setLegal] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [financialContact, setFinancialContact] = useState('')
  const [financialEmail, setFinancialEmail] = useState('')
  const [financialWhatsapp, setFinancialWhatsapp] = useState('')
  const [financialDueDate, setFinancialDueDate] = useState('')
  const [financial, setFinancial] = useState('')
  const [links, setLinks] = useState<Entry[]>([])
  const [integrations, setIntegrations] = useState<Entry[]>([])
  const [formError, setFormError] = useState('')

  // Modais de Auto-Cadastro de Clientes
  const [showGenerateLink, setShowGenerateLink] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [registrationLinks, setRegistrationLinks] = useState<ClientRegistrationLink[]>(() => data.registrationLinks || [])
  const [registrationSubmissions, setRegistrationSubmissions] = useState<ClientRegistrationSubmission[]>(() => data.registrationSubmissions || [])

  const canManageAny = Boolean(canAdmin || (canManageTeam && data.teams.some(t => canManageTeam(t.id))))

  useEffect(() => {
    if (preview) {
      if (data.registrationLinks) setRegistrationLinks(data.registrationLinks)
      if (data.registrationSubmissions) setRegistrationSubmissions(data.registrationSubmissions)
      return
    }
    if (!canManageAny) return
    async function loadRegData() {
      try {
        const [linksRes, subsRes] = await Promise.all([
          supabase.from('client_registration_links').select('*').order('created_at', { ascending: false }),
          supabase.from('client_registration_submissions').select('*').order('created_at', { ascending: false }),
        ])
        if (linksRes.data) setRegistrationLinks(linksRes.data as ClientRegistrationLink[])
        if (subsRes.data) setRegistrationSubmissions(subsRes.data as ClientRegistrationSubmission[])
      } catch (err) {
        console.error('Erro ao carregar links e cadastros:', err)
      }
    }
    loadRegData()
  }, [preview, canManageAny, data.registrationLinks, data.registrationSubmissions])

  const pendingCount = registrationSubmissions.filter(s => s.status === 'pending').length

  const filtered = data.clients.filter(client => `${client.name} ${client.legal_name || ''} ${client.contact_name || ''} ${client.contact_email || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  function openProfile(client: Client) {
    setViewingClient(client)
  }

  function open(client: Client | null) {
    setSelected(client); setEditing(true); setTab('geral'); setFormError('')
    if (client) {
      setName(client.name || ''); setLegal(client.legal_name || ''); setContact(client.contact_name || ''); setEmail(client.contact_email || ''); setPhone(client.contact_phone || '')
      setFinancialContact(client.financial_contact_name || ''); setFinancialEmail(client.financial_email || ''); setFinancialWhatsapp(client.financial_whatsapp || ''); setFinancialDueDate(client.financial_due_date || ''); setFinancial(client.financial_notes || ''); setLinks((client.links || []).map(item => ({ first: item.label, second: item.url }))); setIntegrations((client.integration_items || []).map(item => ({ first: item.key, second: item.value })))
    } else {
      const draft = userId ? getDraft<ClientDraftData>(userId, 'client_new') : null
      setName(draft?.name || ''); setLegal(draft?.legal || ''); setContact(draft?.contact || ''); setEmail(draft?.email || ''); setPhone(draft?.phone || '')
      setFinancialContact(draft?.financialContact || ''); setFinancialEmail(draft?.financialEmail || ''); setFinancialWhatsapp(draft?.financialWhatsapp || ''); setFinancialDueDate(draft?.financialDueDate || ''); setFinancial(draft?.financial || ''); setLinks(draft?.links || [])
      setIntegrations([])
    }
  }

  useEffect(() => {
    if (!editing || selected !== null || !userId) return
    const hasContent = Boolean(name.trim() || legal.trim() || contact.trim() || email.trim() || phone.trim() || financialContact.trim() || financialEmail.trim() || financialWhatsapp.trim() || financialDueDate || financial.trim() || links.length)
    if (hasContent) {
      saveDraft(userId, 'client_new', {
        name,
        legal,
        contact,
        email,
        phone,
        financialContact,
        financialEmail,
        financialWhatsapp,
        financialDueDate,
        financial,
        links,
      })
    }
  }, [editing, selected, userId, name, legal, contact, email, phone, financialContact, financialEmail, financialWhatsapp, financialDueDate, financial, links])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) { setFormError('Informe o nome do cliente.'); setTab('geral'); return }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) { setFormError('Informe um e-mail de contato válido.'); setTab('geral'); return }
    if (financialEmail.trim() && !/^\S+@\S+\.\S+$/.test(financialEmail.trim())) { setFormError('Informe um e-mail financeiro válido.'); setTab('financeiro'); return }
    setFormError('')
    const values = { name: name.trim(), legal_name: legal.trim() || null, contact_name: contact.trim() || null, contact_email: email.trim() || null, contact_phone: phone.trim() || null, financial_contact_name: financialContact.trim() || null, financial_email: financialEmail.trim() || null, financial_whatsapp: financialWhatsapp.trim() || null, financial_due_date: financialDueDate || null, financial_notes: financial.trim() || null, links: links.map(item => ({ label: item.first.trim(), url: item.second.trim() })).filter(item => item.label || item.url), integration_references: selected?.integration_references || null, integration_items: integrations.map(item => ({ key: item.first.trim(), value: item.second.trim() })).filter(item => item.key || item.value) }
    if (preview) {
      setData(current => ({ ...current, clients: selected ? current.clients.map(item => item.id === selected.id ? { ...item, ...values } : item) : [...current.clients, { id: crypto.randomUUID(), ...values }] }))
      if (userId && !selected) clearDraft(userId, 'client_new')
      setEditing(false)
      notify(selected ? 'Cliente atualizado na prévia local' : 'Cliente criado na prévia local')
      return
    }
    const ok = await run(async () => {
      if (selected && !selected.id) throw new Error('Identificador do cliente não informado para atualização.')
      const result = selected
        ? await supabase.from('clients').update(values).eq('id', selected.id)
        : await supabase.from('clients').insert(values);
      if (result.error) throw result.error
    }, selected ? 'Cliente atualizado' : 'Cliente criado')
    if (ok) {
      if (userId && !selected) clearDraft(userId, 'client_new')
      setEditing(false)
    }
  }

  async function deleteClient(client: Client) {
    if (!canAdmin) return
    const clientTasks = data.tasks.filter(t => t.client_id === client.id)
    if (clientTasks.length > 0) {
      const blockMsg = `Este cliente tem ${clientTasks.length} ${clientTasks.length === 1 ? 'demanda vinculada' : 'demandas vinculadas'}. Para excluí-lo, é necessário reatribuir ou excluir as demandas primeiro.`
      notify(blockMsg)
      return
    }

    const msg = `Tem certeza de que deseja excluir o cliente "${client.name}"? Esta ação não pode ser desfeita.`
    if (!window.confirm(msg)) return

    if (preview) {
      setData(prev => ({
        ...prev,
        clients: prev.clients.filter(c => c.id !== client.id),
      }))
      if (selected?.id === client.id) {
        setEditing(false)
        setSelected(null)
      }
      notify('Cliente excluído na prévia local')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.from('clients').delete().eq('id', client.id)
      if (error) throw error
      setData(prev => ({
        ...prev,
        clients: prev.clients.filter(c => c.id !== client.id),
      }))
    }, 'Cliente excluído com sucesso')

    if (ok) {
      if (selected?.id === client.id) {
        setEditing(false)
        setSelected(null)
      }
      notify('Cliente excluído com sucesso!')
    }
  }

  function handleExportClients() {
    if (filtered.length === 0) {
      notify('Nenhum cliente disponível para exportação.')
      return
    }
    downloadClientsCsv(filtered)
    notify(
      filtered.length === 1
        ? '1 cliente exportado com sucesso!'
        : `${filtered.length} clientes exportados com sucesso!`
    )
  }

  function handleExportSingleClient(client: Client) {
    const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
    const today = new Date().toISOString().slice(0, 10)
    downloadClientsCsv([client], `somax-cliente-${slug || 'ficha'}-${today}.csv`)
    notify(`Dados do cliente "${client.name}" exportados com sucesso!`)
  }

  function handleLinkCreated(link: ClientRegistrationLink) {
    setRegistrationLinks(prev => [link, ...prev])
    if (preview) {
      setData(prev => ({
        ...prev,
        registrationLinks: [link, ...(prev.registrationLinks || [])],
      }))
    }
  }

  async function handleApproveSubmission(subId: string, approvedData: ClientRegistrationData, reviewNotes?: string) {
    if (preview) {
      const newClientId = crypto.randomUUID()
      const newClient: Client = {
        id: newClientId,
        name: approvedData.name,
        legal_name: approvedData.legal_name || null,
        contact_name: approvedData.contact_name || null,
        contact_email: approvedData.contact_email || null,
        contact_phone: approvedData.contact_phone || null,
        financial_contact_name: approvedData.financial_contact_name || null,
        financial_email: approvedData.financial_email || null,
        financial_whatsapp: approvedData.financial_whatsapp || null,
        financial_due_date: approvedData.financial_due_date || null,
        financial_notes: approvedData.financial_notes || null,
        links: approvedData.links || [],
        integration_references: null,
        integration_items: [],
      }
      setData(prev => ({
        ...prev,
        clients: [newClient, ...prev.clients],
        registrationSubmissions: (prev.registrationSubmissions || []).map(s =>
          s.id === subId ? { ...s, status: 'approved' as const, client_id: newClientId, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null } : s
        ),
      }))
      setRegistrationSubmissions(prev =>
        prev.map(s => s.id === subId ? { ...s, status: 'approved' as const, client_id: newClientId, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null } : s)
      )
      notify('Cliente aprovado e cadastrado na prévia local!')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase.rpc('review_client_registration', {
        p_submission_id: subId,
        p_action: 'approve',
        p_approved_data: approvedData,
        p_review_notes: reviewNotes || null,
      })
      if (error) throw error

      const { data: refreshedClients } = await supabase.from('clients').select('*').order('name', { ascending: true })
      if (refreshedClients) {
        setData(prev => ({ ...prev, clients: refreshedClients as Client[] }))
      }

      setRegistrationSubmissions(prev =>
        prev.map(s => s.id === subId ? { ...s, status: 'approved' as const, reviewed_at: new Date().toISOString() } : s)
      )
    }, 'Cliente aprovado e cadastrado com sucesso!')

    if (ok) {
      notify('Cliente cadastrado com sucesso!')
    }
  }

  async function handleRejectSubmission(subId: string, reviewNotes?: string) {
    if (preview) {
      setData(prev => ({
        ...prev,
        registrationSubmissions: (prev.registrationSubmissions || []).map(s =>
          s.id === subId ? { ...s, status: 'rejected' as const, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null } : s
        ),
      }))
      setRegistrationSubmissions(prev =>
        prev.map(s => s.id === subId ? { ...s, status: 'rejected' as const, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null } : s)
      )
      notify('Submissão rejeitada na prévia local.')
      return
    }

    await run(async () => {
      const { error } = await supabase.rpc('review_client_registration', {
        p_submission_id: subId,
        p_action: 'reject',
        p_review_notes: reviewNotes || null,
      })
      if (error) throw error
      setRegistrationSubmissions(prev =>
        prev.map(s => s.id === subId ? { ...s, status: 'rejected' as const, reviewed_at: new Date().toISOString() } : s)
      )
    }, 'Submissão rejeitada com sucesso.')
  }

  async function handleDeactivateLink(linkId: string) {
    if (preview) {
      setData(prev => ({
        ...prev,
        registrationLinks: (prev.registrationLinks || []).map(l => l.id === linkId ? { ...l, is_active: false } : l),
      }))
      setRegistrationLinks(prev => prev.map(l => l.id === linkId ? { ...l, is_active: false } : l))
      notify('Link desativado na prévia local.')
      return
    }

    await run(async () => {
      const { error } = await supabase
        .from('client_registration_links')
        .update({ is_active: false })
        .eq('id', linkId)
      if (error) throw error
      setRegistrationLinks(prev => prev.map(l => l.id === linkId ? { ...l, is_active: false } : l))
    }, 'Link desativado com sucesso.')
  }

  async function handleDeleteLink(linkId: string) {
    if (preview) {
      setData(prev => ({
        ...prev,
        registrationLinks: (prev.registrationLinks || []).filter(l => l.id !== linkId),
        registrationSubmissions: (prev.registrationSubmissions || []).filter(s => s.link_id !== linkId),
      }))
      setRegistrationLinks(prev => prev.filter(l => l.id !== linkId))
      setRegistrationSubmissions(prev => prev.filter(s => s.link_id !== linkId))
      notify('Link de cadastro excluído na prévia local.')
      return
    }

    const ok = await run(async () => {
      const { error } = await supabase
        .from('client_registration_links')
        .delete()
        .eq('id', linkId)
      if (error) throw error
      setRegistrationLinks(prev => prev.filter(l => l.id !== linkId))
      setRegistrationSubmissions(prev => prev.filter(s => s.link_id !== linkId))
    }, 'Link excluído com sucesso.')

    if (ok) {
      notify('Link de cadastro excluído com sucesso!')
    }
  }

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">RELACIONAMENTO</div>
          <h1>Clientes</h1>
          <p>Informações organizadas para cada parceria.</p>
        </div>
        <div className="client-actions-bar">
          {canManageAny && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-badge-wrap"
                onClick={() => setShowPending(true)}
                title="Ver cadastros aguardando validação humana"
              >
                <Clock size={15} /> Cadastros pendentes
                {pendingCount > 0 && (
                  <span className={`badge-counter ${pendingCount > 0 ? 'badge-urgent' : ''}`}>
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLinks(true)}
                title="Ver links gerados"
              >
                <Link2 size={15} /> Links ativos
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowGenerateLink(true)}
                title="Gerar link de auto-cadastro para envio ao cliente"
              >
                <Share2 size={15} /> Gerar link
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportClients}
            title="Exportar clientes com todos os dados por coluna (CSV para Excel)"
            disabled={filtered.length === 0}
          >
            <Download size={15} /> Exportar clientes
          </button>
          {canAdmin && (
            <button className="btn btn-primary" onClick={() => open(null)}>
              <Plus size={16} /> Novo cliente
            </button>
          )}
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar clientes..."
            aria-label="Buscar clientes"
          />
        </div>
        <div className="view-switch">
          <button className={view === 'cards' ? 'selected' : ''} onClick={() => setView('cards')}>
            <LayoutGrid size={15} /> Cartões
          </button>
          <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>
            <List size={15} /> Lista
          </button>
        </div>
      </div>

      {view === 'cards' ? (
        <div className="client-grid">
          {filtered.map(client => (
            <button key={client.id} className="client-card" onClick={() => openProfile(client)}>
              <div className="client-logo">{initials(client.name)}</div>
              <div>
                <h2>{client.name}</h2>
                <p>{client.legal_name || 'Cliente Somax'}</p>
              </div>
              <ArrowRight size={17} />
              <div className="client-meta">
                <span>Contato</span>
                <strong>{client.contact_name || 'Não informado'}</strong>
                <small>{client.contact_email || '—'}</small>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => (
                <tr key={client.id}>
                  <td>
                    <button className="table-title" onClick={() => openProfile(client)}>
                      {client.name}
                      <small>{client.legal_name || '—'}</small>
                    </button>
                  </td>
                  <td>{client.contact_name || '—'}</td>
                  <td>{client.contact_email || '—'}</td>
                  <td>{client.contact_phone || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button className="text-link" onClick={() => openProfile(client)}>
                        Ver Perfil
                      </button>
                      {canAdmin && (
                        <button className="text-link" onClick={() => open(client)} title="Editar dados">
                          Editar
                        </button>
                      )}
                      {canAdmin && (
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ color: 'var(--chip-danger-text)', padding: '4px' }}
                          onClick={e => {
                            e.stopPropagation()
                            void deleteClient(client)
                          }}
                          title={`Excluir cliente ${client.name}`}
                          aria-label={`Excluir cliente ${client.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && (
        <Empty text={query ? 'Nenhum cliente corresponde à busca.' : 'Nenhum cliente cadastrado.'} />
      )}

      {hasMore && (
        <div className="admin-pagination">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadMore?.()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Carregando mais clientes...' : 'Carregar mais clientes'}
          </button>
        </div>
      )}

      {/* Modal de Criação / Edição Direta de Cliente */}
      {editing && (
        <Modal
          title={selected ? `Editar cliente: ${selected.name}` : 'Novo cliente'}
          onClose={() => setEditing(false)}
          wide
          dirty={Boolean(name.trim() || legal.trim() || contact.trim() || email.trim() || phone.trim() || financialContact.trim() || financialEmail.trim() || financialWhatsapp.trim() || financialDueDate || financial.trim())}
        >
          <form onSubmit={event => void save(event)}>
            <div className="tabs">
              {([['geral', 'Dados gerais'], ['financeiro', 'Financeiro'], ['links', 'Links'], ['integracao', 'Integração']] as const).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={tab === key ? 'active' : ''}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="tab-content">
              {tab === 'geral' && (
                <div className="form-grid">
                  <Field label="Nome do cliente *">
                    <input value={name} onChange={event => setName(event.target.value)} readOnly={!canAdmin} />
                  </Field>
                  <Field label="Razão social">
                    <input value={legal} onChange={event => setLegal(event.target.value)} readOnly={!canAdmin} />
                  </Field>
                  <div className="form-two">
                    <Field label="Contato">
                      <input value={contact} onChange={event => setContact(event.target.value)} readOnly={!canAdmin} />
                    </Field>
                    <Field label="E-mail">
                      <input type="email" value={email} onChange={event => setEmail(event.target.value)} readOnly={!canAdmin} />
                    </Field>
                  </div>
                  <Field label="Telefone">
                    <input value={phone} onChange={event => setPhone(maskPhone(event.target.value))} placeholder="(00) 0000-0000" readOnly={!canAdmin} />
                  </Field>
                </div>
              )}

              {tab === 'financeiro' && (
                <div className="form-grid">
                  <Field label="Nome do responsável financeiro">
                    <input value={financialContact} onChange={event => setFinancialContact(event.target.value)} placeholder="Nome completo" readOnly={!canAdmin} />
                  </Field>
                  <div className="form-two">
                    <Field label="E-mail do financeiro">
                      <input type="email" value={financialEmail} onChange={event => setFinancialEmail(event.target.value)} placeholder="financeiro@exemplo.com" readOnly={!canAdmin} />
                    </Field>
                    <Field label="WhatsApp financeiro">
                      <input type="tel" value={financialWhatsapp} onChange={event => setFinancialWhatsapp(maskPhone(event.target.value))} placeholder="(00) 00000-0000" readOnly={!canAdmin} />
                    </Field>
                  </div>
                  <Field label="Data ou dia de vencimento">
                    <input
                      type="text"
                      value={financialDueDate}
                      onChange={event => setFinancialDueDate(event.target.value)}
                      placeholder="Ex.: Todo dia 10, 15 ou 2026-11-10"
                      readOnly={!canAdmin}
                    />
                  </Field>
                  <Field label="Observações financeiras">
                    <textarea rows={4} value={financial} onChange={event => setFinancial(event.target.value)} readOnly={!canAdmin} />
                  </Field>
                </div>
              )}

              {tab === 'links' && (
                <EntryList
                  entries={links}
                  onChange={setLinks}
                  addLabel="Adicionar link"
                  firstLabel="Nome"
                  secondLabel="Link"
                  firstPlaceholder="Ex.: Portal do cliente"
                  secondPlaceholder="https://exemplo.com"
                  canEdit={canAdmin}
                />
              )}

              {tab === 'integracao' && (
                <>
                  <EntryList
                    entries={integrations}
                    onChange={setIntegrations}
                    addLabel="Adicionar integração"
                    firstLabel="Chave"
                    secondLabel="Valor"
                    firstPlaceholder="Ex.: URL da API"
                    secondPlaceholder="https://api.exemplo.com"
                    canEdit={canAdmin}
                  />
                  <p className="hint">Não registre senhas, tokens ou chaves secretas neste cadastro.</p>
                </>
              )}

              {formError && <p className="form-error" role="alert">{formError}</p>}
            </div>

            <div className="form-actions admin-modal-actions" style={{ display: 'flex', justifyContent: selected ? 'space-between' : 'flex-end', alignItems: 'center' }}>
              {selected && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {canAdmin && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ color: 'var(--chip-danger-text)', borderColor: 'var(--chip-danger-border)' }}
                      onClick={() => void deleteClient(selected)}
                      title={`Excluir cliente ${selected.name}`}
                    >
                      <Trash2 size={15} /> Excluir cliente
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleExportSingleClient(selected)}
                    title={`Exportar dados de ${selected.name} em CSV`}
                  >
                    <Download size={15} /> Exportar dados
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                  Fechar
                </button>
                {canAdmin && (
                  <button type="submit" className="btn btn-primary">
                    {selected ? 'Salvar alterações' : 'Criar cliente'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Gerar Link de Cadastro */}
      <GenerateLinkModal
        isOpen={showGenerateLink}
        onClose={() => setShowGenerateLink(false)}
        teams={data.teams}
        userId={userId}
        canAdmin={canAdmin}
        canManageTeam={canManageTeam || (() => false)}
        preview={preview}
        onLinkCreated={handleLinkCreated}
        run={run}
        notify={notify}
      />

      {/* Modal: Cadastros Pendentes */}
      <PendingRegistrationsModal
        isOpen={showPending}
        onClose={() => setShowPending(false)}
        submissions={registrationSubmissions}
        links={registrationLinks}
        teams={data.teams}
        preview={preview}
        onApprove={handleApproveSubmission}
        onReject={handleRejectSubmission}
        notify={notify}
      />

      {/* Modal: Gerenciar Links Criados */}
      <ManageLinksModal
        isOpen={showLinks}
        onClose={() => setShowLinks(false)}
        links={registrationLinks}
        teams={data.teams}
        preview={preview}
        onDeactivate={handleDeactivateLink}
        onDelete={handleDeleteLink}
        notify={notify}
      />

      {/* Modal: Perfil Detalhado do Cliente */}
      {viewingClient && (
        <ClientProfileModal
          client={viewingClient}
          isOpen={Boolean(viewingClient)}
          onClose={() => setViewingClient(null)}
          onEdit={() => {
            const c = viewingClient
            setViewingClient(null)
            open(c)
          }}
          onExport={() => handleExportSingleClient(viewingClient)}
          onDelete={canAdmin ? () => {
            const c = viewingClient
            setViewingClient(null)
            void deleteClient(c)
          } : undefined}
          tasks={data.tasks.filter(t => t.client_id === viewingClient.id)}
          teams={data.teams}
          stages={data.stages}
          profiles={data.profiles}
          canAdmin={canAdmin}
          notify={notify}
        />
      )}
    </section>
  )
}

export function TeamsPage({data,canAdmin,canManageTeam,preview,setData,run,notify,userId}:BaseProps&{canAdmin:boolean;canManageTeam:(id:string)=>boolean;userId:string}){
  const [selected,setSelected]=useState<Team|null>(null)
  const [editing,setEditing]=useState<Team|null|undefined>(()=>typeof window !== 'undefined' && preview && new URLSearchParams(window.location.search).has('nova-equipe')?null:undefined)
  const [name,setName]=useState('')
  const [color,setColor]=useState('#6366f1')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  function openEditor(team:Team|null){setSelected(null);setEditing(team);setName(team?.name||'');setColor(team?.color||'#6366f1');setError('')}
  async function save(event:FormEvent){
    event.preventDefault()
    const cleanName=name.trim()
    if(!cleanName){setError('Informe o nome da equipe.');return}
    if(data.teams.some(item=>item.id!==editing?.id&&item.name.toLocaleLowerCase('pt-BR')===cleanName.toLocaleLowerCase('pt-BR'))){setError('Já existe uma equipe com este nome.');return}
    if(preview){
      if(editing){setData(current=>({...current,teams:current.teams.map(item=>item.id===editing.id?{...item,name:cleanName,color}:item)}))}
      else{const id=crypto.randomUUID();setData(current=>({...current,teams:[...current.teams,{id,name:cleanName,color}],members:[...current.members,{team_id:id,user_id:userId,is_manager:true,active:true}],channels:[...current.channels,{id:crypto.randomUUID(),team_id:id,name:'Geral',created_at:new Date().toISOString()}]}))}
      setEditing(undefined);notify(editing?'Equipe atualizada na prévia local':'Equipe criada na prévia local');return
    }
    setBusy(true)
    const ok=await run(async()=>{const {error}=await supabase.rpc('save_team',{p_team_id:editing?.id||null,p_name:cleanName,p_color:color});if(error)throw error},editing?'Equipe atualizada':'Equipe criada')
    setBusy(false)
    if(ok)setEditing(undefined)
  }
  async function deleteTeam(team:Team){
    if(!team||!team.id)return
    const linkedTasks=data.tasks.filter(t=>t.team_id===team.id)
    if(linkedTasks.length>0){
      alert(`Não é possível excluir a equipe "${team.name}" pois existem ${linkedTasks.length} tarefa(s) vinculada(s) a ela. Reatribua ou finalize essas tarefas antes de excluir.`)
      return
    }
    if(!window.confirm(`Tem certeza que deseja excluir a equipe "${team.name}"? Os membros e canais vinculados serão removidos.`))return
    if(preview){
      setData(current=>({
        ...current,
        teams:current.teams.filter(t=>t.id!==team.id),
        members:current.members.filter(m=>m.team_id!==team.id),
        channels:current.channels.filter(c=>c.team_id!==team.id),
        boards:current.boards.filter(b=>b.team_id!==team.id),
      }))
      setSelected(null)
      setEditing(undefined)
      notify('Equipe excluída com sucesso.')
      return
    }
    setBusy(true)
    const ok=await run(async()=>{
      const {error:rpcError}=await supabase.rpc('delete_team',{p_team_id:team.id})
      if(rpcError){
        await supabase.from('team_members').delete().eq('team_id',team.id)
        await supabase.from('channels').delete().eq('team_id',team.id)
        await supabase.from('boards').delete().eq('team_id',team.id)
        const {error:delError}=await supabase.from('teams').delete().eq('id',team.id)
        if(delError)throw delError
      }
      setData(current=>({
        ...current,
        teams:current.teams.filter(t=>t.id!==team.id),
        members:current.members.filter(m=>m.team_id!==team.id),
        channels:current.channels.filter(c=>c.team_id!==team.id),
        boards:current.boards.filter(b=>b.team_id!==team.id),
      }))
    },'Equipe excluída com sucesso')
    setBusy(false)
    if(ok){
      setSelected(null)
      setEditing(undefined)
    }
  }
  async function toggleMember(teamId:string,memberId:string,active:boolean){
    if (!teamId || !memberId) return
    if(preview){setData(current=>({...current,members:current.members.map(item=>item.team_id===teamId&&item.user_id===memberId?{...item,active:!active}:item)}));return}
    await run(async()=>{const {error}=await supabase.from('team_members').update({active:!active}).eq('team_id',teamId).eq('user_id',memberId);if(error)throw error},'Acesso à equipe atualizado')
  }
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">PESSOAS</div><h1>Equipes</h1><p>Times que fazem a Somax acontecer.</p></div>{canAdmin&&<button className="btn btn-primary" onClick={()=>openEditor(null)}><Plus size={16}/> Nova equipe</button>}</div>
    <div className="team-grid">{data.teams.map(team=>{const members=data.members.filter(item=>item.team_id===team.id&&item.active);return <button key={team.id} className="team-card" onClick={()=>setSelected(team)}><div className="team-icon" style={{background:team.color}}>{initials(team.name)}</div><h2>{team.name}</h2><p>{members.length} {members.length===1?'membro':'membros'}</p><div className="team-avatars">{members.slice(0,4).map(member=><span className="avatar avatar-xs" key={member.user_id}>{initials(data.profiles.find(person=>person.id===member.user_id)?.full_name||'?')}</span>)}</div><span className="team-view">Ver equipe <ArrowRight size={15}/></span></button>})}</div>
    {selected&&<Modal title={selected.name} onClose={()=>setSelected(null)}><div className="team-members"><div className="team-modal-head"><span>{data.members.filter(item=>item.team_id===selected.id&&item.active).length} membros ativos</span><div style={{display:'flex',gap:10,alignItems:'center'}}>{(preview||canManageTeam(selected.id))&&<button className="text-link" onClick={()=>openEditor(selected)}>Editar equipe</button>}{(preview||canAdmin)&&<button className="text-link text-danger" style={{color:'var(--chip-danger-text)'}} onClick={()=>void deleteTeam(selected)}>Excluir equipe</button>}</div></div>{data.members.filter(member=>member.team_id===selected.id).map(member=><div className="member-row" key={member.user_id}><span className="avatar avatar-xs">{initials(data.profiles.find(person=>person.id===member.user_id)?.full_name||'?')}</span><div><strong>{data.profiles.find(person=>person.id===member.user_id)?.full_name}</strong><small>{member.is_manager?'Gestor':'Colaborador'} · {member.active?'Ativo':'Inativo'}</small></div>{(preview||canManageTeam(selected.id))&&<button className="text-link" onClick={()=>void toggleMember(selected.id,member.user_id,member.active)}>{member.active?'Desativar':'Ativar'}</button>}</div>)}{!data.members.some(member=>member.team_id===selected.id)&&<Empty text="Ainda não há membros nesta equipe."/>}</div></Modal>}
    {editing!==undefined&&<Modal title={editing?'Editar equipe':'Nova equipe'} onClose={()=>setEditing(undefined)} dirty={Boolean(name.trim())}><form className="stack-form" onSubmit={event=>void save(event)}><Field label="Nome da equipe *"><input required autoFocus maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="Ex.: Suporte"/></Field><Field label="Cor"><input className="team-color-input" type="color" value={color} onChange={event=>setColor(event.target.value)}/></Field>{!editing&&<p className="hint">A equipe terá um canal privado Geral e você será seu gestor.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div>{editing&&(preview||canAdmin)&&<button type="button" className="btn btn-ghost text-danger" style={{color:'var(--chip-danger-text)'}} onClick={()=>void deleteTeam(editing)} disabled={busy}>Excluir equipe</button>}</div><div style={{display:'flex',gap:8}}><button type="button" className="btn btn-secondary" onClick={()=>setEditing(undefined)} disabled={busy}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'Salvando...':editing?'Salvar equipe':'Criar equipe'}</button></div></div></form></Modal>}
  </section>
}

export function UsersPage({data,canAdmin,canMaster,currentUserId,canManageTeam,preview,setData,run,notify,setError,onUserSaved}:BaseProps&{canAdmin:boolean;canMaster:boolean;currentUserId:string;canManageTeam:(id:string)=>boolean;setError:(message:string)=>void;onUserSaved:(user:Profile)=>void}){
  const [creating,setCreating]=useState(()=>typeof window !== 'undefined' && preview && new URLSearchParams(window.location.search).has('novo-usuario'))
  const [editing,setEditing]=useState<Profile|null>(null)
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [whatsapp,setWhatsapp]=useState('')
  const [role,setRole]=useState<Profile['role']>('colaborador')
  const [teamId,setTeamId]=useState(data.teams[0]?.id||'')
  const [busy,setBusy]=useState(false)
  const [formError,setFormError]=useState('')
  const manageable=preview?data.teams:data.teams.filter(team=>canManageTeam(team.id))
  function close(){setCreating(false);setPassword('');setFormError('')}
  function open(){setTeamId(manageable[0]?.id||'');setName('');setEmail('');setPassword('');setWhatsapp('');setRole('colaborador');setFormError('');setCreating(true)}
  async function create(event:FormEvent){
    event.preventDefault()
    const digits=whatsapp.replace(/\D/g,'')
    const normalized=`+${digits.length===10||digits.length===11?`55${digits}`:digits}`
    if(name.trim().length<2||!/^\S+@\S+\.\S+$/.test(email.trim())||password.length<8||!/^\+[0-9]{10,15}$/.test(normalized)||!teamId){setFormError('Confira nome, e-mail, WhatsApp, senha com 8 caracteres ou mais, função e equipe.');return}
    if(data.profiles.some(person=>person.email?.toLocaleLowerCase('pt-BR')===email.trim().toLocaleLowerCase('pt-BR'))){setFormError('Este e-mail já está cadastrado.');return}
    setFormError('')
    if(preview){const id=crypto.randomUUID();setData(current=>({...current,profiles:[...current.profiles,{id,full_name:name.trim(),email:email.trim().toLowerCase(),whatsapp:normalized,role,active:true}],members:[...current.members,{team_id:teamId,user_id:id,is_manager:role==='gestor',active:true}]}));close();notify('Usuário criado na prévia local. A senha não foi armazenada.');return}
    setBusy(true)
    try{
      const {data:result,error}=await supabase.functions.invoke('invite-user',{body:{email:email.trim().toLowerCase(),full_name:name.trim(),password,whatsapp:normalized,role,team_id:teamId}})
      if(error)throw error
      if(result?.error)throw new Error(result.error)
      close()
      await run(async()=>{},'Usuário criado. Entregue a senha temporária por um canal seguro.')
    }catch(error){setError(messageError(error))}finally{setBusy(false)}
  }
  async function deleteUser(person:Profile){
    if(!person||!person.id)return
    if(person.is_master){
      alert('Não é permitido excluir o Administrador Master da organização.')
      return
    }
    if(person.id===currentUserId){
      alert('Você não pode excluir seu próprio usuário logado.')
      return
    }
    if(!canMaster&&person.role==='administrador'){
      alert('Apenas o Administrador Master pode excluir outro administrador.')
      return
    }
    const assignedTasks=data.tasks.filter(t=>t.assignee_id===person.id)
    const promptMessage=assignedTasks.length>0
      ? `O usuário "${person.full_name}" possui ${assignedTasks.length} tarefa(s) atribuída(s) a ele. Ao excluir, essas tarefas ficarão sem responsável.\n\nDeseja realmente excluir este usuário?`
      : `Tem certeza que deseja excluir o usuário "${person.full_name}"? O acesso ao sistema será revogado e os vínculos de equipe removidos.`
    if(!window.confirm(promptMessage))return
    if(preview){
      setData(current=>({
        ...current,
        profiles:current.profiles.filter(p=>p.id!==person.id),
        members:current.members.filter(m=>m.user_id!==person.id),
        tasks:current.tasks.map(t=>t.assignee_id===person.id?{...t,assignee_id:null}:t),
      }))
      setEditing(null)
      notify('Usuário excluído com sucesso.')
      return
    }
    setBusy(true)
    try{
      const {data:result,error:invokeError}=await supabase.functions.invoke('manage-user',{body:{action:'delete',user_id:person.id}})
      if(invokeError)throw invokeError
      if(result?.error)throw new Error(result.error)
      setData(current=>({
        ...current,
        profiles:current.profiles.filter(p=>p.id!==person.id),
        members:current.members.filter(m=>m.user_id!==person.id),
        tasks:current.tasks.map(t=>t.assignee_id===person.id?{...t,assignee_id:null}:t),
      }))
      setEditing(null)
      notify('Usuário excluído com sucesso.')
    }catch(err){
      try{
        const {error:rpcError}=await supabase.rpc('delete_managed_user',{p_user_id:person.id})
        if(rpcError)throw rpcError
        setData(current=>({
          ...current,
          profiles:current.profiles.filter(p=>p.id!==person.id),
          members:current.members.filter(m=>m.user_id!==person.id),
          tasks:current.tasks.map(t=>t.assignee_id===person.id?{...t,assignee_id:null}:t),
        }))
        setEditing(null)
        notify('Usuário excluído com sucesso.')
      }catch(innerErr){
        setError(messageError(err||innerErr))
      }
    }finally{
      setBusy(false)
    }
  }
  return <section className="content"><div className="page-heading"><div><div className="eyebrow">ACESSO</div><h1>Usuários</h1><p>Gerencie os acessos por função e equipe.</p></div>{manageable.length>0&&<button className="btn btn-primary" onClick={open}><Plus size={16}/> Novo usuário</button>}</div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>WhatsApp</th><th>Função</th><th>Equipe</th><th>Status</th>{canAdmin&&<th>Ações</th>}</tr></thead><tbody>{data.profiles.map(person=><tr key={person.id}><td><div className="user-cell"><span className="avatar avatar-xs">{initials(person.full_name)}</span><strong>{person.full_name}</strong></div></td><td>{person.email||'—'}</td><td>{person.whatsapp||'—'}</td><td><span className="role-pill">{person.is_master?'Administrador master':roleNames[person.role]}</span></td><td>{data.members.filter(member=>member.user_id===person.id&&member.active).map(member=>data.teams.find(team=>team.id===member.team_id)?.name).join(', ')||'—'}</td><td><span className={`status ${person.active?'active':'inactive'}`}>{person.active?'Ativo':'Inativo'}</span></td>{canAdmin&&<td><div style={{display:'flex',gap:10,alignItems:'center'}}>{(canMaster || (person.role !== 'administrador' && !person.is_master) || person.id === currentUserId) && <button className="text-link" onClick={()=>setEditing(person)}>Editar</button>}{person.id !== currentUserId && !person.is_master && (canMaster || person.role !== 'administrador') && <button className="text-link text-danger" style={{color:'var(--chip-danger-text)'}} onClick={()=>void deleteUser(person)}>Excluir</button>}</div></td>}</tr>)}</tbody></table></div>
    {creating&&<Modal title="Criar Novo Usuário" onClose={close} dirty={Boolean(name.trim()||email.trim()||password.trim()||whatsapp.trim())}><form className="stack-form" onSubmit={event=>void create(event)}><p className="admin-form-intro">Preencha os dados para criar um novo usuário no sistema.</p><Field label="Nome Completo *"><input required autoFocus maxLength={120} value={name} onChange={event=>setName(event.target.value)} placeholder="Nome do usuário"/></Field><Field label="E-mail *"><input required type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="email@exemplo.com"/></Field><Field label="Senha temporária *"><PasswordInput required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo 8 caracteres"/></Field><Field label="WhatsApp *"><input required type="tel" value={whatsapp} onChange={event=>setWhatsapp(maskPhone(event.target.value))} placeholder="(00) 00000-0000"/></Field><Field label="Função *"><select required value={role} onChange={event=>setRole(event.target.value as Profile['role'])}><option value="colaborador">Colaborador</option><option value="gestor">Gestor</option>{canAdmin&&<option value="administrador">Administrador</option>}</select></Field><Field label="Equipe *"><select required value={teamId} onChange={event=>setTeamId(event.target.value)}>{manageable.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></Field><p className="hint">A senha é temporária e será trocada no primeiro acesso. Ela não aparece na lista de usuários.</p>{formError&&<p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="btn btn-secondary" onClick={close}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy?'Criando...':'Criar usuário'}</button></div></form></Modal>}
    {editing&&<UserEditor key={editing.id} user={editing} data={data} preview={preview} canMaster={canMaster} currentUserId={currentUserId} setData={setData} run={run} notify={notify} onSaved={onUserSaved} onDelete={deleteUser} onClose={()=>setEditing(null)}/>}
  </section>
}
