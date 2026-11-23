import { useState, useCallback, useEffect } from 'react'
import type { FormEvent } from 'react'
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { maskPhone, supabase } from './lib'
import type { ClientLink, ClientRegistrationData, ClientRegistrationLink, ClientRegistrationSubmission, Team } from './lib'

type Run = (action: () => Promise<unknown>, success?: string) => Promise<boolean>

interface GenerateLinkModalProps {
  isOpen: boolean
  onClose: () => void
  teams: Team[]
  userId: string
  canAdmin: boolean
  canManageTeam: (teamId: string) => boolean
  preview: boolean
  onLinkCreated: (link: ClientRegistrationLink) => void
  run: Run
  notify: (msg: string) => void
}

export function GenerateLinkModal({
  isOpen,
  onClose,
  teams,
  userId,
  canAdmin,
  canManageTeam,
  preview,
  onLinkCreated,
  run,
  notify,
}: GenerateLinkModalProps) {
  const manageableTeams = canAdmin ? teams : teams.filter(t => canManageTeam(t.id))
  const [teamId, setTeamId] = useState<string>(manageableTeams[0]?.id || '')
  const [validityDays, setValidityDays] = useState<'1' | '3' | '7' | '15' | '30'>('7')
  const [singleUse, setSingleUse] = useState<boolean>(true)
  const [maxSubmissions, setMaxSubmissions] = useState<number>(1)
  const [includeFinancial, setIncludeFinancial] = useState<boolean>(false)
  const [notes, setNotes] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const handleClose = useCallback(() => {
    setGeneratedUrl(null)
    setCopied(false)
    setError('')
    onClose()
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

  if (!isOpen) return null

  function calculateExpirationDate(daysStr: '1' | '3' | '7' | '15' | '30'): string {
    const days = parseInt(daysStr, 10)
    const date = new Date()
    date.setDate(date.getDate() + days)
    return date.toISOString()
  }

  async function generateToken(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)

    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const expiresAt = calculateExpirationDate(validityDays)
    const limit = singleUse ? 1 : Math.min(Math.max(maxSubmissions, 1), 10)
    const selectedTeam = teamId ? teamId : null

    const newLink: ClientRegistrationLink = {
      id: crypto.randomUUID(),
      token,
      created_by: userId,
      team_id: selectedTeam,
      single_use: singleUse,
      max_submissions: limit,
      submission_count: 0,
      include_financial: includeFinancial,
      expires_at: expiresAt,
      is_active: true,
      notes: notes.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const fullUrl = `${window.location.origin}/cadastro/${token}`

    if (preview) {
      onLinkCreated(newLink)
      setGeneratedUrl(fullUrl)
      setBusy(false)
      notify('Link de auto-cadastro gerado na prévia local!')
      return
    }

    const ok = await run(async () => {
      const { data, error: insertError } = await supabase
        .from('client_registration_links')
        .insert({
          token,
          created_by: userId,
          team_id: selectedTeam,
          single_use: singleUse,
          max_submissions: limit,
          submission_count: 0,
          include_financial: includeFinancial,
          expires_at: expiresAt,
          is_active: true,
          notes: notes.trim() || null,
        })
        .select()
        .single()

      if (insertError) throw insertError
      if (data) {
        onLinkCreated(data as ClientRegistrationLink)
      }
    }, 'Link de cadastro gerado com sucesso!')

    setBusy(false)
    if (ok) {
      setGeneratedUrl(fullUrl)
    }
  }

  async function copyToClipboard() {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      notify('Link copiado para a área de transferência!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o texto acima.')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Gerar Link de Cadastro">
        <div className="modal-heading">
          <h2>Gerar Link de Auto-Cadastro</h2>
          <button type="button" className="icon-btn" onClick={handleClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        {generatedUrl ? (
          <div className="stack-form">
            <div className="link-generated-box">
              <span className="reg-info-pill success">
                <Check size={14} /> Link criado com sucesso
              </span>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Envie este link para o cliente. As informações preenchidas ficarão em quarentena aguardando aprovação.
              </p>
              <div className="link-copy-row">
                <input
                  type="text"
                  readOnly
                  value={generatedUrl}
                  className="link-copy-input"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button type="button" className="btn btn-primary" onClick={copyToClipboard}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleClose}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form className="stack-form" onSubmit={generateToken}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Crie um link seguro para o cliente preencher seus dados de forma autônoma. O cadastro só será oficializado após sua revisão humana.
            </p>

            <label className="field">
              <span>Equipe responsável</span>
              <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                {canAdmin && <option value="">Geral / Todas as equipes</option>}
                {manageableTeams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Validade do link</span>
              <select
                value={validityDays}
                onChange={e => setValidityDays(e.target.value as '1' | '3' | '7' | '15' | '30')}
              >
                <option value="1">24 horas</option>
                <option value="3">3 dias</option>
                <option value="7">7 dias (padrão)</option>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
              </select>
            </label>

            <label className="field">
              <span>Limite de envios</span>
              <select
                value={singleUse ? 'single' : 'multiple'}
                onChange={e => setSingleUse(e.target.value === 'single')}
              >
                <option value="single">Uso único (desativa após o 1º envio)</option>
                <option value="multiple">Permitir múltiplos envios (até 10)</option>
              </select>
            </label>

            {!singleUse && (
              <label className="field">
                <span>Número máximo de envios (1 a 10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxSubmissions}
                  onChange={e => setMaxSubmissions(parseInt(e.target.value, 10) || 1)}
                />
              </label>
            )}

            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={includeFinancial}
                  onChange={e => setIncludeFinancial(e.target.checked)}
                />
                <span>Solicitar dados financeiros (responsável, e-mail financeiro, dia de vencimento)</span>
              </label>
              <small style={{ color: 'var(--text-secondary)', display: 'block', marginLeft: '1.6rem', fontSize: '0.8rem' }}>
                Desligado por padrão. Habilite se precisar dos dados de faturamento já no cadastro inicial.
              </small>
            </div>

            <label className="field">
              <span>Observações internas (opcional)</span>
              <input
                type="text"
                maxLength={150}
                placeholder="Ex.: Enviado para o cliente via WhatsApp"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Gerando link...' : 'Gerar link de cadastro'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

interface PendingRegistrationsModalProps {
  isOpen: boolean
  onClose: () => void
  submissions: ClientRegistrationSubmission[]
  links: ClientRegistrationLink[]
  teams: Team[]
  preview: boolean
  onApprove: (subId: string, approvedData: ClientRegistrationData, reviewNotes?: string) => Promise<void>
  onReject: (subId: string, reviewNotes?: string) => Promise<void>
  notify: (msg: string) => void
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function PendingRegistrationsModal({
  isOpen,
  onClose,
  submissions,
  links,
  teams,
  onApprove,
  onReject,
  notify,
}: PendingRegistrationsModalProps) {
  const [filter, setFilter] = useState<'todos' | 'financeiro' | 'documento'>('todos')
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null)
  const [rejectingSub, setRejectingSub] = useState<ClientRegistrationSubmission | null>(null)
  const [rejectNotes, setRejectNotes] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)

  const pendingList = submissions.filter(s => s.status === 'pending')

  if (!isOpen) return null

  function getTeamName(linkId: string): string {
    const link = links.find(l => l.id === linkId)
    if (!link || !link.team_id) return 'Geral'
    return teams.find(t => t.id === link.team_id)?.name || 'Equipe'
  }

  const withFinancialCount = pendingList.filter(
    s =>
      Boolean(
        s.data.financial_contact_name ||
          s.data.financial_email ||
          s.data.financial_whatsapp ||
          s.data.financial_due_date ||
          s.data.financial_notes
      )
  ).length

  const withDocCount = pendingList.filter(s => Boolean(s.data.cnpj_cpf)).length

  const filteredSubs = pendingList.filter(sub => {
    if (filter === 'financeiro') {
      const d = sub.data
      return Boolean(
        d.financial_contact_name ||
          d.financial_email ||
          d.financial_whatsapp ||
          d.financial_due_date ||
          d.financial_notes
      )
    }
    if (filter === 'documento') {
      return Boolean(sub.data.cnpj_cpf)
    }
    return true
  })

  async function handleDirectApprove(sub: ClientRegistrationSubmission) {
    setBusy(true)
    try {
      await onApprove(sub.id, sub.data)
      notify('Cliente aprovado e cadastrado com sucesso!')
      if (expandedSubId === sub.id) setExpandedSubId(null)
    } catch {
      notify('Erro ao aprovar cadastro.')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmReject(e: FormEvent) {
    e.preventDefault()
    if (!rejectingSub) return
    setBusy(true)
    try {
      await onReject(rejectingSub.id, rejectNotes.trim() || undefined)
      notify('Submissão recusada com sucesso.')
      if (expandedSubId === rejectingSub.id) setExpandedSubId(null)
      setRejectingSub(null)
      setRejectNotes('')
    } catch {
      notify('Erro ao recusar submissão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Cadastros Pendentes"
      >
        <div className="modal-heading">
          <div>
            <h2>Cadastros pendentes ({pendingList.length})</h2>
            <p
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
              }}
            >
              Novos clientes enviados pelo link público, aguardando validação.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        {/* Faixa curta e informativa */}
        <div className="pending-notice-banner">
          <ShieldAlert size={16} className="pending-notice-icon" />
          <span>
            Aprovação humana obrigatória: os dados abaixo vieram de links externos e só viram
            clientes oficiais após sua validação.
          </span>
        </div>

        {/* Filtros em abas */}
        {pendingList.length > 0 && (
          <div
            className="client-profile-tablist"
            role="tablist"
            style={{ padding: 0, marginBottom: '16px' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'todos'}
              className={`client-profile-tab-btn ${filter === 'todos' ? 'active' : ''}`}
              onClick={() => setFilter('todos')}
            >
              Todos ({pendingList.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'financeiro'}
              className={`client-profile-tab-btn ${filter === 'financeiro' ? 'active' : ''}`}
              onClick={() => setFilter('financeiro')}
            >
              Com dados financeiros ({withFinancialCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'documento'}
              className={`client-profile-tab-btn ${filter === 'documento' ? 'active' : ''}`}
              onClick={() => setFilter('documento')}
            >
              Com CNPJ/CPF ({withDocCount})
            </button>
          </div>
        )}

        {pendingList.length === 0 ? (
          <div className="pending-empty-clean">
            <CheckCircle2 size={36} style={{ opacity: 0.4, color: 'var(--text-secondary)' }} />
            <h3>Nenhum cadastro pendente</h3>
            <p>Todos os cadastros enviados pelo link público já foram validados.</p>
          </div>
        ) : filteredSubs.length === 0 ? (
          <div className="pending-empty-clean">
            <CheckCircle2 size={32} style={{ opacity: 0.4, color: 'var(--text-secondary)' }} />
            <h3>Nenhum cadastro neste filtro</h3>
            <p>Não há envios pendentes com as características selecionadas.</p>
          </div>
        ) : (
          <div className="pending-subs-clean-list">
            {filteredSubs.map(sub => {
              const d = sub.data
              const hasFinancial = Boolean(
                d.financial_contact_name ||
                  d.financial_email ||
                  d.financial_whatsapp ||
                  d.financial_due_date ||
                  d.financial_notes
              )
              const isExpanded = expandedSubId === sub.id

              return (
                <div key={sub.id} className="pending-sub-clean-card">
                  <div className="pending-sub-clean-header">
                    <div className="pending-sub-avatar" aria-hidden="true">
                      {initials(d.name)}
                    </div>
                    <div className="pending-sub-clean-meta">
                      <div className="pending-sub-name-row">
                        <strong className="pending-sub-clean-name">{d.name}</strong>
                        <div className="pending-sub-pills">
                          {hasFinancial && (
                            <span className="profile-badge-demands">Financeiro</span>
                          )}
                          {d.cnpj_cpf && <span className="profile-badge-outline">CNPJ</span>}
                        </div>
                      </div>
                      <span className="pending-sub-clean-info">
                        Enviado pelo link de {getTeamName(sub.link_id)} em{' '}
                        {new Date(sub.created_at).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(sub.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setExpandedSubId(isExpanded ? null : sub.id)}
                    >
                      {isExpanded ? 'Recolher' : 'Revisar'}
                    </button>
                  </div>

                  {/* Expansão com detalhes e ações */}
                  {isExpanded && (
                    <div className="pending-sub-expansion">
                      <div className="pending-expansion-grid">
                        <div className="pending-expansion-col">
                          <div className="profile-field-block">
                            <span className="profile-field-label">Razão social</span>
                            <span className="profile-field-val">
                              {d.legal_name || 'Não informada'}
                            </span>
                          </div>
                          <div className="profile-field-block">
                            <span className="profile-field-label">CNPJ / CPF</span>
                            <span className="profile-field-val">
                              {d.cnpj_cpf || 'Não informado'}
                            </span>
                          </div>
                          <div className="profile-field-block">
                            <span className="profile-field-label">Contato / Responsável</span>
                            <span className="profile-field-val">
                              {d.contact_name || 'Não informado'}
                            </span>
                          </div>
                        </div>

                        <div className="pending-expansion-col">
                          <div className="profile-field-block">
                            <span className="profile-field-label">E-mail</span>
                            <span className="profile-field-val">
                              {d.contact_email || 'Não informado'}
                            </span>
                          </div>
                          <div className="profile-field-block">
                            <span className="profile-field-label">Telefone / WhatsApp</span>
                            <span className="profile-field-val">
                              {d.contact_phone ? maskPhone(d.contact_phone) : 'Não informado'}
                            </span>
                          </div>
                          <div className="profile-field-block">
                            <span className="profile-field-label">Vencimento</span>
                            <span className="profile-field-val">
                              {d.financial_due_date || 'Não informado'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {hasFinancial && (
                        <div className="pending-expansion-fin-box">
                          <span
                            className="profile-field-label"
                            style={{ display: 'block', marginBottom: '8px' }}
                          >
                            Dados financeiros complementares
                          </span>
                          <div className="pending-expansion-grid">
                            {d.financial_contact_name && (
                              <div className="profile-field-block">
                                <span className="profile-field-label">
                                  Responsável financeiro
                                </span>
                                <span className="profile-field-val">
                                  {d.financial_contact_name}
                                </span>
                              </div>
                            )}
                            {d.financial_email && (
                              <div className="profile-field-block">
                                <span className="profile-field-label">E-mail financeiro</span>
                                <span className="profile-field-val">
                                  {d.financial_email}
                                </span>
                              </div>
                            )}
                            {d.financial_whatsapp && (
                              <div className="profile-field-block">
                                <span className="profile-field-label">WhatsApp financeiro</span>
                                <span className="profile-field-val">
                                  {maskPhone(d.financial_whatsapp)}
                                </span>
                              </div>
                            )}
                          </div>
                          {d.financial_notes && (
                            <div className="profile-field-block" style={{ marginTop: '8px' }}>
                              <span className="profile-field-label">
                                Instruções de faturamento
                              </span>
                              <span
                                className="profile-field-val"
                                style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}
                              >
                                {d.financial_notes}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pending-expansion-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--chip-danger-text)' }}
                          onClick={() => {
                            setRejectingSub(sub)
                            setRejectNotes('')
                          }}
                          disabled={busy}
                        >
                          <XCircle size={14} /> Rejeitar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleDirectApprove(sub)}
                          disabled={busy}
                        >
                          <CheckCircle2 size={14} /> Aprovar e criar cliente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {/* Modal de Confirmação de Rejeição */}
        {rejectingSub && (
          <div
            className="modal-backdrop"
            onMouseDown={e => {
              if (e.target === e.currentTarget) setRejectingSub(null)
            }}
          >
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Recusar Submissão"
            >
              <div className="modal-heading">
                <h2>Recusar Cadastro: {rejectingSub.data.name}</h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setRejectingSub(null)}
                  aria-label="Fechar"
                >
                  <X size={19} />
                </button>
              </div>
              <form className="stack-form" onSubmit={handleConfirmReject}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  A submissão será descartada e não virará cliente oficial no sistema. Você pode
                  registrar uma justificativa interna abaixo:
                </p>
                <label className="field">
                  <span>Motivo da recusa (opcional)</span>
                  <textarea
                    rows={3}
                    placeholder="Ex.: Dados duplicados, teste inválido ou cliente não reconhecido."
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRejectingSub(null)}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={busy}>
                    {busy ? 'Recusando...' : 'Confirmar Recusa'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ReviewRegistrationModalProps {
  submission: ClientRegistrationSubmission
  onClose: () => void
  onApprove: (subId: string, approvedData: ClientRegistrationData, reviewNotes?: string) => Promise<void>
  onReject: (subId: string) => void
}

export function ReviewRegistrationModal({
  submission,
  onClose,
  onApprove,
  onReject,
}: ReviewRegistrationModalProps) {
  const d = submission.data
  const [name, setName] = useState(d.name || '')
  const [legalName, setLegalName] = useState(d.legal_name || '')
  const [cnpjCpf, setCnpjCpf] = useState(d.cnpj_cpf || '')
  const [contactName, setContactName] = useState(d.contact_name || '')
  const [contactEmail, setContactEmail] = useState(d.contact_email || '')
  const [contactPhone, setContactPhone] = useState(d.contact_phone || '')
  const [financialContact, setFinancialContact] = useState(d.financial_contact_name || '')
  const [financialEmail, setFinancialEmail] = useState(d.financial_email || '')
  const [financialWhatsapp, setFinancialWhatsapp] = useState(d.financial_whatsapp || '')
  const [financialDueDate, setFinancialDueDate] = useState(d.financial_due_date || '')
  const [financialNotes, setFinancialNotes] = useState(d.financial_notes || '')
  const [links, setLinks] = useState<ClientLink[]>(d.links || [])
  const [reviewNotes, setReviewNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  function handleAddLink() {
    setLinks(prev => [...prev, { label: '', url: '' }])
  }

  function handleUpdateLink(index: number, field: keyof ClientLink, value: string) {
    setLinks(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  function handleRemoveLink(index: number) {
    setLinks(prev => prev.filter((_, i) => i !== index))
  }

  async function handleApprove(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('O nome do cliente é obrigatório.')
      return
    }
    setFormError('')
    setBusy(true)

    const approvedData: ClientRegistrationData = {
      name: name.trim(),
      legal_name: legalName.trim() || null,
      cnpj_cpf: cnpjCpf.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      financial_contact_name: financialContact.trim() || null,
      financial_email: financialEmail.trim() || null,
      financial_whatsapp: financialWhatsapp.trim() || null,
      financial_due_date: financialDueDate.trim() || null,
      financial_notes: financialNotes.trim() || null,
      links: links.filter(l => l.label.trim() || l.url.trim()),
    }

    try {
      await onApprove(submission.id, approvedData, reviewNotes.trim() || undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Revisão de Cadastro">
        <div className="modal-heading">
          <div>
            <h2>Revisar e Aprovar Cadastro</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Submetido em {new Date(submission.created_at).toLocaleDateString('pt-BR')} às {new Date(submission.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        <form onSubmit={handleApprove}>
          <div className="quarantine-banner">
            <ShieldAlert size={20} className="quarantine-banner-icon" />
            <div className="quarantine-banner-text">
              <strong>Quarentena de Segurança</strong>
              <span>
                Estes dados foram preenchidos pelo cliente externo via link público. Revise ou complemente os campos antes de oficializar o cadastro na base oficial do OPSHUB.
              </span>
            </div>
          </div>

          <div className="submission-detail-grid">
            <div className="detail-block">
              <h4>
                <Building2 size={16} /> Dados Gerais da Empresa
              </h4>
              <label className="field">
                <span>Nome Fantasia / Operacional *</span>
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Aurora Café" />
              </label>
              <label className="field">
                <span>Razão Social</span>
                <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Ex.: Aurora Café Comércio Ltda." />
              </label>
              <label className="field">
                <span>CNPJ ou CPF</span>
                <input value={cnpjCpf} onChange={e => setCnpjCpf(e.target.value)} placeholder="00.000.000/0000-00" />
              </label>
            </div>

            <div className="detail-block">
              <h4>
                <User size={16} /> Contato Principal
              </h4>
              <label className="field">
                <span>Pessoa de Contato</span>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ex.: Marina Lopes" />
              </label>
              <label className="field">
                <span>E-mail de Contato</span>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="contato@empresa.com" />
              </label>
              <label className="field">
                <span>Telefone / WhatsApp</span>
                <input value={contactPhone} onChange={e => setContactPhone(maskPhone(e.target.value))} placeholder="(11) 90000-0000" />
              </label>
            </div>

            <div className="detail-block full-width">
              <h4>
                <CreditCard size={16} /> Dados Financeiros & Cobrança
              </h4>
              <div className="financial-grid">
                <label className="field">
                  <span>Responsável Financeiro</span>
                  <input value={financialContact} onChange={e => setFinancialContact(e.target.value)} placeholder="Nome do responsável" />
                </label>
                <label className="field">
                  <span>E-mail Financeiro</span>
                  <input type="email" value={financialEmail} onChange={e => setFinancialEmail(e.target.value)} placeholder="financeiro@empresa.com" />
                </label>
                <label className="field">
                  <span>WhatsApp Financeiro</span>
                  <input value={financialWhatsapp} onChange={e => setFinancialWhatsapp(maskPhone(e.target.value))} placeholder="(11) 90000-0000" />
                </label>
                <label className="field">
                  <span>Dia ou Data de Vencimento</span>
                  <input
                    value={financialDueDate}
                    onChange={e => setFinancialDueDate(e.target.value)}
                    placeholder="Ex.: Todo dia 10, 15 ou 2026-11-10"
                  />
                </label>
              </div>
              <label className="field" style={{ marginTop: '0.65rem' }}>
                <span>Observações Financeiras</span>
                <textarea
                  rows={2}
                  value={financialNotes}
                  onChange={e => setFinancialNotes(e.target.value)}
                  placeholder="Instruções de faturamento, NF ou dados bancários..."
                />
              </label>
            </div>

            {/* Links e Portais Informados */}
            <div className="detail-block full-width">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0 }}>
                  <ExternalLink size={16} /> Links e Portais Informados
                </h4>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddLink}
                  title="Adicionar mais um link"
                >
                  <Plus size={13} /> Adicionar link
                </button>
              </div>

              {links.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Nenhum link foi informado pelo cliente. Você pode adicionar portais ou links se desejar.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {links.map((link, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        style={{ flex: '1', fontSize: '0.85rem' }}
                        placeholder="Nome (Ex.: Site Oficial, Drive)"
                        value={link.label}
                        onChange={e => handleUpdateLink(idx, 'label', e.target.value)}
                      />
                      <input
                        style={{ flex: '2', fontSize: '0.85rem' }}
                        placeholder="URL (https://exemplo.com)"
                        value={link.url}
                        onChange={e => handleUpdateLink(idx, 'url', e.target.value)}
                      />
                      <button
                        type="button"
                        className="copy-mini-btn"
                        style={{ color: 'var(--chip-danger-text)' }}
                        onClick={() => handleRemoveLink(idx)}
                        title="Remover este link"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="review-notes-box">
            <h4>
              <FileText size={16} /> Anotações da Revisão Interna
            </h4>
            <label className="field" style={{ margin: 0 }}>
              <span>Parecer ou justificativa interna (opcional)</span>
              <input
                placeholder="Ex.: Telefone e CNPJ confirmados via WhatsApp; cadastro validado."
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
              />
            </label>
          </div>

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-main)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--chip-danger-text)', borderColor: 'var(--chip-danger-border)' }}
              onClick={() => onReject(submission.id)}
              disabled={busy}
            >
              <XCircle size={15} /> Recusar Cadastro
            </button>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? (
                  'Aprovando...'
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Aprovar e Criar Cliente
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ManageLinksModalProps {
  isOpen: boolean
  onClose: () => void
  links: ClientRegistrationLink[]
  teams: Team[]
  preview: boolean
  onDeactivate: (linkId: string) => Promise<void>
  onDelete?: (linkId: string) => Promise<void>
  notify: (msg: string) => void
}

export function ManageLinksModal({
  isOpen,
  onClose,
  links,
  teams,
  onDeactivate,
  onDelete,
  notify,
}: ManageLinksModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  if (!isOpen) return null

  function getStatus(link: ClientRegistrationLink): { label: string; class: string } {
    if (!link.is_active) return { label: 'Desativado', class: 'expired' }
    if (new Date(link.expires_at) <= new Date()) return { label: 'Expirado', class: 'expired' }
    if (link.submission_count >= link.max_submissions) return { label: 'Esgotado', class: 'warning' }
    return { label: 'Ativo', class: 'success' }
  }

  async function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/cadastro/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      notify('Link copiado!')
      setTimeout(() => setCopiedId(null), 3000)
    } catch {
      notify('Erro ao copiar link.')
    }
  }

  // Estatísticas de links
  const activeCount = links.filter(l => l.is_active && new Date(l.expires_at) > new Date() && l.submission_count < l.max_submissions).length
  const inactiveCount = links.length - activeCount
  const totalSubmissions = links.reduce((acc, l) => acc + (l.submission_count || 0), 0)

  // Filtragem de links
  const filteredLinks = links.filter(link => {
    const status = getStatus(link)
    if (statusFilter === 'active' && status.class !== 'success') return false
    if (statusFilter === 'inactive' && status.class === 'success') return false

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const teamName = link.team_id ? teams.find(t => t.id === link.team_id)?.name || '' : 'Geral'
      const match =
        link.token.toLowerCase().includes(q) ||
        (link.notes || '').toLowerCase().includes(q) ||
        teamName.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  function getTeam(teamId: string | null): Team | undefined {
    if (!teamId) return undefined
    return teams.find(t => t.id === teamId)
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Links de Cadastro Gerados">
        <div className="modal-heading">
          <div>
            <h2>Links de Cadastro Gerados ({links.length})</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Links públicos criados para captação externa e auto-cadastro de novos clientes.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        {/* Resumo de Métricas dos Links */}
        <div className="reg-link-stats-grid">
          <div className="reg-link-stat-box">
            <span className="reg-stat-num">{links.length}</span>
            <span className="reg-stat-lbl">Total de Links</span>
          </div>
          <div className="reg-link-stat-box active-stat">
            <span className="reg-stat-num">{activeCount}</span>
            <span className="reg-stat-lbl">Links Ativos</span>
          </div>
          <div className="reg-link-stat-box">
            <span className="reg-stat-num">{inactiveCount}</span>
            <span className="reg-stat-lbl">Inativos / Expirados</span>
          </div>
          <div className="reg-link-stat-box highlight-stat">
            <span className="reg-stat-num">{totalSubmissions}</span>
            <span className="reg-stat-lbl">Envios Realizados</span>
          </div>
        </div>

        {/* Barra de Filtro / Busca */}
        {links.length > 0 && (
          <div className="reg-link-filter-bar">
            <div className="search" style={{ flex: 1 }}>
              <Search size={15} />
              <input
                type="text"
                placeholder="Buscar por token, observação ou equipe..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Buscar links"
              />
            </div>
            <div className="view-switch">
              <button
                type="button"
                className={statusFilter === 'all' ? 'selected' : ''}
                onClick={() => setStatusFilter('all')}
              >
                Todos ({links.length})
              </button>
              <button
                type="button"
                className={statusFilter === 'active' ? 'selected' : ''}
                onClick={() => setStatusFilter('active')}
              >
                Ativos ({activeCount})
              </button>
              <button
                type="button"
                className={statusFilter === 'inactive' ? 'selected' : ''}
                onClick={() => setStatusFilter('inactive')}
              >
                Inativos ({inactiveCount})
              </button>
            </div>
          </div>
        )}

        {links.length === 0 ? (
          <div className="pending-empty-state">
            <Link2 size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
            <h3>Nenhum link gerado</h3>
            <p>Nenhum link de cadastro foi gerado ainda. Use o botão "Gerar link" para criar um novo link de auto-cadastro.</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="pending-empty-state">
            <Search size={28} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
            <h3>Nenhum link encontrado</h3>
            <p>Nenhum link corresponde aos critérios de busca selecionados.</p>
          </div>
        ) : (
          <div className="reg-link-list">
            {filteredLinks.map(link => {
              const status = getStatus(link)
              const team = getTeam(link.team_id)
              const teamName = team ? team.name : 'Geral'
              const isExpiredOrUsed = !link.is_active || new Date(link.expires_at) <= new Date() || link.submission_count >= link.max_submissions

              return (
                <div key={link.id} className={`reg-link-card ${isExpiredOrUsed ? 'is-inactive' : ''}`}>
                  <div className="reg-link-card-header">
                    <div className="reg-link-token-pill">
                      <Link2 size={14} className="reg-link-icon" />
                      <code>/cadastro/{link.token}</code>
                    </div>

                    <div className="reg-link-card-badges">
                      <span className={`reg-info-pill ${status.class}`}>
                        {status.label}
                      </span>
                      <span
                        className="reg-info-pill primary"
                        style={team ? { backgroundColor: `${team.color}15`, color: team.color, borderColor: `${team.color}35` } : {}}
                      >
                        {teamName}
                      </span>
                      <span className="reg-info-pill">
                        {link.single_use ? 'Uso Único' : `Limite: ${link.max_submissions}`}
                      </span>
                    </div>
                  </div>

                  <div className="reg-link-card-body">
                    {link.notes && <p className="reg-link-notes">{link.notes}</p>}

                    <div className="reg-link-details-grid">
                      <div className="reg-link-detail-col">
                        <span className="reg-link-detail-lbl">Submissões</span>
                        <strong className="reg-link-detail-val">
                          {link.submission_count} de {link.max_submissions} {link.single_use ? '(Único)' : ''}
                        </strong>
                      </div>
                      <div className="reg-link-detail-col">
                        <span className="reg-link-detail-lbl">Validade / Expiração</span>
                        <strong className="reg-link-detail-val">
                          {new Date(link.expires_at).toLocaleDateString('pt-BR')} às {new Date(link.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </strong>
                      </div>
                      <div className="reg-link-detail-col">
                        <span className="reg-link-detail-lbl">Coleta Financeira</span>
                        <strong className="reg-link-detail-val">
                          {link.include_financial ? 'Sim (Habilitada)' : 'Não (Apenas dados)'}
                        </strong>
                      </div>
                      <div className="reg-link-detail-col">
                        <span className="reg-link-detail-lbl">Criado em</span>
                        <span className="reg-link-detail-val" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {new Date(link.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="reg-link-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyLink(link.token, link.id)}
                      title="Copiar link completo para enviar ao cliente"
                    >
                      {copiedId === link.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedId === link.id ? 'Copiado!' : 'Copiar Link'}
                    </button>

                    {link.is_active && new Date(link.expires_at) > new Date() && link.submission_count < link.max_submissions && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ color: 'var(--chip-danger-text)', borderColor: 'var(--chip-danger-border)' }}
                        onClick={() => onDeactivate(link.id)}
                        title="Desativar este link imediatamente"
                      >
                        Desativar
                      </button>
                    )}

                    {onDelete && (
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-sm"
                        onClick={() => {
                          const msg = `Tem certeza de que deseja excluir permanentemente o link "/cadastro/${link.token.slice(0, 8)}..."? Esta ação não pode ser desfeita.`
                          if (window.confirm(msg)) {
                            void onDelete(link.id)
                          }
                        }}
                        title="Excluir este link de cadastro permanentemente"
                        aria-label="Excluir link"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
