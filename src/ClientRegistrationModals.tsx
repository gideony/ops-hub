import { useState, useCallback, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { maskPhone, supabase } from './lib'
import type { ClientRegistrationData, ClientRegistrationLink, ClientRegistrationSubmission, Team } from './lib'

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
  const [selectedSub, setSelectedSub] = useState<ClientRegistrationSubmission | null>(null)
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

  async function handleConfirmReject(e: FormEvent) {
    e.preventDefault()
    if (!rejectingSub) return
    setBusy(true)
    try {
      await onReject(rejectingSub.id, rejectNotes.trim() || undefined)
      notify('Submissão rejeitada com sucesso.')
      setRejectingSub(null)
      setRejectNotes('')
    } catch {
      notify('Erro ao rejeitar submissão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Cadastros Pendentes">
        <div className="modal-heading">
          <h2>Cadastros Pendentes de Validação ({pendingList.length})</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        {pendingList.length === 0 ? (
          <div className="empty">
            <p>Não há cadastros pendentes de validação no momento.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="pending-subs-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Equipe</th>
                  <th>Data Envio</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map(sub => {
                  const d = sub.data
                  return (
                    <tr key={sub.id}>
                      <td>
                        <strong>{d.name}</strong>
                        {d.legal_name && <small style={{ display: 'block', color: 'var(--text-secondary)' }}>{d.legal_name}</small>}
                      </td>
                      <td>{d.contact_name || '—'}</td>
                      <td>{d.contact_email || '—'}</td>
                      <td>{d.contact_phone || '—'}</td>
                      <td>
                        <span className="reg-info-pill">{getTeamName(sub.link_id)}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(sub.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => setSelectedSub(sub)}
                          >
                            Revisar
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => { setRejectingSub(sub); setRejectNotes('') }}
                          >
                            Recusar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {/* Modal de Revisão do Cadastro */}
        {selectedSub && (
          <ReviewRegistrationModal
            submission={selectedSub}
            onClose={() => setSelectedSub(null)}
            onApprove={async (subId, approvedData, notes) => {
              await onApprove(subId, approvedData, notes)
              setSelectedSub(null)
            }}
            onReject={() => {
              setSelectedSub(null)
              setRejectingSub(selectedSub)
            }}
          />
        )}

        {/* Modal de Confirmação de Rejeição */}
        {rejectingSub && (
          <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setRejectingSub(null) }}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Rejeitar Submissão">
              <div className="modal-heading">
                <h2>Rejeitar Cadastro: {rejectingSub.data.name}</h2>
                <button type="button" className="icon-btn" onClick={() => setRejectingSub(null)} aria-label="Fechar">
                  <X size={19} />
                </button>
              </div>
              <form className="stack-form" onSubmit={handleConfirmReject}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  A submissão será descartada e não virará cliente oficial. Você pode registrar uma justificativa interna abaixo:
                </p>
                <label className="field">
                  <span>Motivo da recusa (opcional)</span>
                  <textarea
                    rows={3}
                    placeholder="Ex.: Dados duplicados ou teste inválido."
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                  />
                </label>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setRejectingSub(null)} disabled={busy}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={busy}>
                    {busy ? 'Rejeitando...' : 'Confirmar Rejeição'}
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
  const [reviewNotes, setReviewNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

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
      links: d.links || [],
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
          <h2>Revisar e Aprovar Cadastro</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        <form onSubmit={handleApprove}>
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '6px', fontSize: '0.85rem' }}>
            <strong>Quarentena de Segurança:</strong> Verifique as informações preenchidas pelo cliente externo. Você pode fazer ajustes antes de oficializar o cadastro na base Somax.
          </div>

          <div className="submission-detail-grid">
            <div className="detail-block">
              <h4>Dados Gerais</h4>
              <label className="field">
                <span>Nome / Nome Fantasia *</span>
                <input required value={name} onChange={e => setName(e.target.value)} />
              </label>
              <label className="field">
                <span>Razão Social</span>
                <input value={legalName} onChange={e => setLegalName(e.target.value)} />
              </label>
              <label className="field">
                <span>CNPJ / CPF</span>
                <input value={cnpjCpf} onChange={e => setCnpjCpf(e.target.value)} />
              </label>
            </div>

            <div className="detail-block">
              <h4>Contato</h4>
              <label className="field">
                <span>Pessoa de Contato</span>
                <input value={contactName} onChange={e => setContactName(e.target.value)} />
              </label>
              <label className="field">
                <span>E-mail</span>
                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </label>
              <label className="field">
                <span>Telefone / WhatsApp</span>
                <input value={contactPhone} onChange={e => setContactPhone(maskPhone(e.target.value))} />
              </label>
            </div>

            {(d.financial_contact_name || d.financial_email || d.financial_due_date || d.financial_notes) && (
              <div className="detail-block" style={{ gridColumn: '1 / -1' }}>
                <h4>Dados Financeiros</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <label className="field">
                    <span>Responsável Financeiro</span>
                    <input value={financialContact} onChange={e => setFinancialContact(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>E-mail Financeiro</span>
                    <input type="email" value={financialEmail} onChange={e => setFinancialEmail(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>WhatsApp Financeiro</span>
                    <input value={financialWhatsapp} onChange={e => setFinancialWhatsapp(maskPhone(e.target.value))} />
                  </label>
                  <label className="field">
                    <span>Dia de Vencimento</span>
                    <input value={financialDueDate} onChange={e => setFinancialDueDate(e.target.value)} />
                  </label>
                </div>
                <label className="field" style={{ marginTop: '0.5rem' }}>
                  <span>Observações Financeiras</span>
                  <textarea rows={2} value={financialNotes} onChange={e => setFinancialNotes(e.target.value)} />
                </label>
              </div>
            )}
          </div>

          <label className="field">
            <span>Anotações da Revisão (interno)</span>
            <input
              placeholder="Ex.: Telefone confirmado por WhatsApp; cadastro validado."
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
            />
          </label>

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <div className="form-actions" style={{ justifyContent: 'space-between', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onReject(submission.id)}
              disabled={busy}
            >
              Rejeitar Cadastro
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Aprovando...' : 'Aprovar e Criar Cliente'}
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
  notify: (msg: string) => void
}

export function ManageLinksModal({
  isOpen,
  onClose,
  links,
  teams,
  onDeactivate,
  notify,
}: ManageLinksModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Links de Cadastro Gerados">
        <div className="modal-heading">
          <h2>Links de Cadastro Gerados ({links.length})</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={19} />
          </button>
        </div>

        {links.length === 0 ? (
          <div className="empty">
            <p>Nenhum link de cadastro foi gerado ainda.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="pending-subs-table">
              <thead>
                <tr>
                  <th>Token / Link</th>
                  <th>Equipe</th>
                  <th>Envios</th>
                  <th>Expira em</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => {
                  const status = getStatus(link)
                  const teamName = link.team_id ? teams.find(t => t.id === link.team_id)?.name || 'Equipe' : 'Geral'
                  return (
                    <tr key={link.id}>
                      <td>
                        <code style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                          /cadastro/{link.token.slice(0, 8)}...
                        </code>
                        {link.notes && <small style={{ display: 'block', color: 'var(--text-secondary)' }}>{link.notes}</small>}
                      </td>
                      <td>{teamName}</td>
                      <td>
                        {link.submission_count} / {link.max_submissions} {link.single_use ? '(Único)' : ''}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(link.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className={`reg-info-pill ${status.class}`}>{status.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => copyLink(link.token, link.id)}
                            title="Copiar URL completa"
                          >
                            {copiedId === link.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === link.id ? 'Copiado' : 'Copiar'}
                          </button>
                          {link.is_active && new Date(link.expires_at) > new Date() && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              onClick={() => onDeactivate(link.id)}
                              title="Desativar este link imediatamente"
                            >
                              Desativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
