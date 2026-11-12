import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Plus, ShieldCheck, X } from 'lucide-react'
import { maskPhone, supabase } from './lib'
import type { ClientLink, ClientRegistrationData } from './lib'
import { demoRegistrationLinks, demoRegistrationSubmissions } from './demo'

interface PublicClientRegistrationPageProps {
  token: string
  preview?: boolean
}

type PageState = 'checking' | 'ready' | 'submitted' | 'error'

export function PublicClientRegistrationPage({ token, preview = false }: PublicClientRegistrationPageProps) {
  const [state, setState] = useState<PageState>('checking')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [includeFinancial, setIncludeFinancial] = useState<boolean>(false)

  // Form fields
  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [cnpjCpf, setCnpjCpf] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [links, setLinks] = useState<ClientLink[]>([])

  // Financial fields (optional, conditional)
  const [financialContact, setFinancialContact] = useState('')
  const [financialEmail, setFinancialEmail] = useState('')
  const [financialWhatsapp, setFinancialWhatsapp] = useState('')
  const [financialDueDate, setFinancialDueDate] = useState('')
  const [financialNotes, setFinancialNotes] = useState('')

  // Honeypot anti-bot
  const [honeypot, setHoneypot] = useState('')

  // LGPD consent
  const [lgpdAccepted, setLgpdAccepted] = useState(false)

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Anti-leak, no-referrer & no-index
  useEffect(() => {
    document.title = 'Cadastro de Parceiro | Somax'

    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    let createdRobots = false
    if (!metaRobots) {
      metaRobots = document.createElement('meta')
      metaRobots.name = 'robots'
      metaRobots.content = 'noindex, nofollow'
      document.head.appendChild(metaRobots)
      createdRobots = true
    } else {
      metaRobots.content = 'noindex, nofollow'
    }

    let metaReferrer = document.querySelector('meta[name="referrer"]') as HTMLMetaElement | null
    let createdReferrer = false
    if (!metaReferrer) {
      metaReferrer = document.createElement('meta')
      metaReferrer.name = 'referrer'
      metaReferrer.content = 'no-referrer'
      document.head.appendChild(metaReferrer)
      createdReferrer = true
    } else {
      metaReferrer.content = 'no-referrer'
    }

    return () => {
      document.title = 'Somax Hub'
      if (createdRobots && metaRobots) metaRobots.remove()
      if (createdReferrer && metaReferrer) metaReferrer.remove()
    }
  }, [])

  // Check link validity on load
  useEffect(() => {
    let active = true

    async function checkLink() {
      if (!token) {
        if (active) {
          setErrorMessage('Link de cadastro não informado ou inválido.')
          setState('error')
        }
        return
      }

      if (preview) {
        const found = demoRegistrationLinks.find(l => l.token === token)
        if (!found) {
          if (active) {
            setErrorMessage('Link de cadastro não encontrado ou inválido.')
            setState('error')
          }
          return
        }
        if (!found.is_active) {
          if (active) {
            setErrorMessage('Este link de cadastro já foi utilizado ou foi revogado.')
            setState('error')
          }
          return
        }
        if (new Date(found.expires_at) <= new Date()) {
          if (active) {
            setErrorMessage('Este link de cadastro expirou.')
            setState('error')
          }
          return
        }
        if (found.submission_count >= found.max_submissions) {
          if (active) {
            setErrorMessage('O limite de envios deste link foi atingido.')
            setState('error')
          }
          return
        }
        if (active) {
          setIncludeFinancial(found.include_financial)
          setState('ready')
        }
        return
      }

      try {
        const { data, error } = await supabase.rpc('get_registration_link_public_info', {
          p_token: token.trim(),
        })

        if (!active) return

        if (error) {
          setErrorMessage('Não foi possível verificar a validade deste link. Tente novamente mais tarde.')
          setState('error')
          return
        }

        const info = data as { valid: boolean; error?: string; include_financial?: boolean }
        if (!info || !info.valid) {
          setErrorMessage(info?.error || 'Link de cadastro inválido ou expirado.')
          setState('error')
          return
        }

        setIncludeFinancial(Boolean(info.include_financial))
        setState('ready')
      } catch {
        if (active) {
          setErrorMessage('Ocorreu um erro ao conectar aos serviços da Somax. Verifique sua conexão.')
          setState('error')
        }
      }
    }

    checkLink()
    return () => { active = false }
  }, [token, preview])

  function addLinkRow() {
    setLinks(prev => [...prev, { label: '', url: '' }])
  }

  function updateLinkRow(index: number, field: keyof ClientLink, val: string) {
    setLinks(prev => prev.map((item, i) => i === index ? { ...item, [field]: val } : item))
  }

  function removeLinkRow(index: number) {
    setLinks(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError('')

    // Honeypot bot protection
    if (honeypot && honeypot.trim() !== '') {
      setState('submitted')
      return
    }

    if (!name.trim()) {
      setFormError('Informe o nome da sua empresa.')
      return
    }

    if (!contactEmail.trim() || !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      setFormError('Informe um e-mail de contato válido.')
      return
    }

    if (!contactPhone.trim() || contactPhone.replace(/\D/g, '').length < 10) {
      setFormError('Informe um telefone de contato com DDD válido.')
      return
    }

    if (includeFinancial && financialEmail.trim() && !/^\S+@\S+\.\S+$/.test(financialEmail.trim())) {
      setFormError('Informe um e-mail financeiro válido.')
      return
    }

    if (!lgpdAccepted) {
      setFormError('Você deve aceitar os termos de consentimento para prosseguir.')
      return
    }

    setSubmitting(true)

    const payload: ClientRegistrationData = {
      name: name.trim(),
      legal_name: legalName.trim() || null,
      cnpj_cpf: cnpjCpf.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      financial_contact_name: includeFinancial ? (financialContact.trim() || null) : null,
      financial_email: includeFinancial ? (financialEmail.trim() || null) : null,
      financial_whatsapp: includeFinancial ? (financialWhatsapp.trim() || null) : null,
      financial_due_date: includeFinancial ? (financialDueDate.trim() || null) : null,
      financial_notes: includeFinancial ? (financialNotes.trim() || null) : null,
      links: links.map(l => ({ label: l.label.trim(), url: l.url.trim() })).filter(l => l.label && l.url),
    }

    if (preview) {
      const demoLink = demoRegistrationLinks.find(l => l.token === token)
      if (demoLink) {
        demoLink.submission_count += 1
        if (demoLink.single_use || demoLink.submission_count >= demoLink.max_submissions) {
          demoLink.is_active = false
        }
      }
      demoRegistrationSubmissions.push({
        id: crypto.randomUUID(),
        link_id: demoLink?.id || 'demo-link',
        client_id: null,
        data: payload,
        status: 'pending',
        lgpd_accepted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      setSubmitting(false)
      setState('submitted')
      return
    }

    try {
      const { data, error } = await supabase.rpc('submit_client_registration', {
        p_token: token.trim(),
        p_payload: payload,
        p_honeypot: honeypot.trim() || null,
      })

      if (error) throw error

      const res = data as { success: boolean; error?: string; message?: string }
      if (!res.success) {
        setFormError(res.error || 'Não foi possível enviar as informações.')
        setSubmitting(false)
        return
      }

      setState('submitted')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar cadastro.'
      setFormError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="public-reg-wrapper">
      {state === 'checking' && (
        <div className="public-state-card">
          <div className="brand-mark" style={{ margin: '0 auto 1.5rem', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3b82f6', color: '#fff', borderRadius: 8, fontWeight: 'bold' }}>
            S
          </div>
          <h2>Verificando link de cadastro...</h2>
          <p>Por favor, aguarde enquanto validamos seu link de acesso seguro.</p>
        </div>
      )}

      {state === 'error' && (
        <div className="public-state-card">
          <div className="public-state-icon error">
            <AlertCircle size={32} />
          </div>
          <h2>Link Indisponível</h2>
          <p>{errorMessage || 'Este link de cadastro expirou ou não está mais ativo.'}</p>
          <small style={{ color: 'var(--text-secondary)', display: 'block' }}>
            Caso precise realizar o cadastro, solicite um novo link diretamente ao seu responsável de atendimento na Somax.
          </small>
        </div>
      )}

      {state === 'submitted' && (
        <div className="public-state-card">
          <div className="public-state-icon success">
            <CheckCircle2 size={32} />
          </div>
          <h2>Cadastro Recebido!</h2>
          <p>
            Agradecemos pelo envio dos seus dados. As informações foram recebidas com sucesso e já estão na fila de homologação da nossa equipe.
          </p>
          <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 8, padding: '1rem', fontSize: '0.85rem', color: '#86efac', textAlign: 'left', lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontWeight: 600 }}>
              <ShieldCheck size={16} /> Próximos passos
            </div>
            Nossa equipe revisará as informações fornecidas e entrará em contato pelos canais informados para dar seguimento ao seu projeto.
          </div>
        </div>
      )}

      {state === 'ready' && (
        <div className="public-reg-card">
          <div className="public-reg-header">
            <div className="brand-mark">S</div>
            <h1>Cadastro de Parceiro</h1>
            <p>Preencha os dados da sua empresa para iniciarmos nossa colaboração na Somax.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {/* Honeypot field (hidden from humans, catches bots) */}
            <input
              type="text"
              name="website_url_hp"
              tabIndex={-1}
              autoComplete="off"
              className="hp-field"
              value={honeypot}
              onChange={e => setHoneypot(e.target.value)}
              aria-hidden="true"
            />

            {/* SEÇÃO 1: Dados Gerais */}
            <div className="public-reg-section">
              <h3>1. Dados da Empresa</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Nome da Empresa / Nome Fantasia *</span>
                  <input
                    required
                    placeholder="Ex.: Aurora Café"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </label>

                <div className="form-two">
                  <label className="field">
                    <span>Razão Social</span>
                    <input
                      placeholder="Razão social completa"
                      value={legalName}
                      onChange={e => setLegalName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>CNPJ ou CPF</span>
                    <input
                      placeholder="00.000.000/0000-00"
                      value={cnpjCpf}
                      onChange={e => setCnpjCpf(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: Contato Principal */}
            <div className="public-reg-section">
              <h3>2. Contato Principal</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Nome do Responsável / Ponto Focal</span>
                  <input
                    placeholder="Seu nome completo"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                  />
                </label>

                <div className="form-two">
                  <label className="field">
                    <span>E-mail Corporativo *</span>
                    <input
                      required
                      type="email"
                      placeholder="contato@empresa.com"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Telefone / WhatsApp *</span>
                    <input
                      required
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={contactPhone}
                      onChange={e => setContactPhone(maskPhone(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* SEÇÃO 3: Canais e Links (Opcional) */}
            <div className="public-reg-section">
              <h3>3. Canais e Links Úteis</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Informe seu website institucional, redes sociais ou links de catálogos.
              </p>
              {links.map((item, index) => (
                <div key={index} className="form-two" style={{ marginBottom: '0.5rem', alignItems: 'flex-end' }}>
                  <label className="field" style={{ flex: 1 }}>
                    <span>Tipo / Rótulo</span>
                    <input
                      placeholder="Ex.: Website, Instagram"
                      value={item.label}
                      onChange={e => updateLinkRow(index, 'label', e.target.value)}
                    />
                  </label>
                  <label className="field" style={{ flex: 2 }}>
                    <span>URL Completa</span>
                    <input
                      placeholder="https://suaempresa.com"
                      value={item.url}
                      onChange={e => updateLinkRow(index, 'url', e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => removeLinkRow(index)}
                    aria-label="Remover link"
                    style={{ marginBottom: '0.1rem', height: '40px' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addLinkRow}
                style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
              >
                <Plus size={15} /> Adicionar link
              </button>
            </div>

            {/* SEÇÃO 4: Dados Financeiros (Condicional ao Link) */}
            {includeFinancial && (
              <div className="public-reg-section">
                <h3>4. Informações Financeiras</h3>
                <div className="form-grid">
                  <label className="field">
                    <span>Nome do Responsável Financeiro</span>
                    <input
                      placeholder="Contato financeiro"
                      value={financialContact}
                      onChange={e => setFinancialContact(e.target.value)}
                    />
                  </label>
                  <div className="form-two">
                    <label className="field">
                      <span>E-mail para Faturamento / NF</span>
                      <input
                        type="email"
                        placeholder="financeiro@empresa.com"
                        value={financialEmail}
                        onChange={e => setFinancialEmail(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>WhatsApp Financeiro</span>
                      <input
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={financialWhatsapp}
                        onChange={e => setFinancialWhatsapp(maskPhone(e.target.value))}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Melhor Dia de Vencimento</span>
                    <input
                      placeholder="Ex.: Todo dia 10"
                      value={financialDueDate}
                      onChange={e => setFinancialDueDate(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Instruções ou Observações Financeiras</span>
                    <textarea
                      rows={2}
                      placeholder="Informações adicionais para emissão de notas ou faturamento"
                      value={financialNotes}
                      onChange={e => setFinancialNotes(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Termo de Consentimento LGPD */}
            <div className="public-reg-consent">
              <label>
                <input
                  type="checkbox"
                  required
                  checked={lgpdAccepted}
                  onChange={e => setLgpdAccepted(e.target.checked)}
                />
                <span>
                  Declaro que sou representante autorizado desta empresa e concordo com o tratamento dos dados informados para fins de contato comercial, cadastro e prestação de serviços pela <strong>Somax</strong>, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
                </span>
              </label>
            </div>

            {formError && (
              <p className="form-error" role="alert" style={{ marginTop: '1rem' }}>
                {formError}
              </p>
            )}

            <div className="form-actions" style={{ marginTop: '1.75rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
                disabled={submitting}
              >
                {submitting ? 'Enviando dados...' : 'Enviar Cadastro'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
