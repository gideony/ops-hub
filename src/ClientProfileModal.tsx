import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  GitBranch,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import type { Client, Profile, Stage, Task, Team } from './lib'

export interface ClientProfileModalProps {
  client: Client
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  onExport: () => void
  onDelete?: () => void
  tasks: Task[]
  teams: Team[]
  stages: Stage[]
  profiles: Profile[]
  canAdmin: boolean
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

function cleanDigits(value: string): string {
  return value.replace(/\D/g, '')
}

type ProfileTabKey = 'geral' | 'financeiro' | 'links' | 'integracao' | 'tarefas'

export function ClientProfileModal({
  client,
  isOpen,
  onClose,
  onEdit,
  onExport,
  onDelete,
  tasks,
  teams,
  stages,
  profiles,
  canAdmin,
  notify,
}: ClientProfileModalProps) {
  const [tab, setTab] = useState<ProfileTabKey>('geral')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const tabsList: { key: ProfileTabKey; label: string }[] = [
    { key: 'geral', label: 'Visão geral' },
    { key: 'financeiro', label: 'Financeiro' },
    { key: 'links', label: `Links e acessos (${client.links?.length || 0})` },
    { key: 'integracao', label: `Integrações (${client.integration_items?.length || 0})` },
    { key: 'tarefas', label: `Demandas (${tasks.length})` },
  ]

  function handleTabKeyDown(e: React.KeyboardEvent, index: number) {
    let nextIndex = index
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (index + 1) % tabsList.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (index - 1 + tabsList.length) % tabsList.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = tabsList.length - 1
    }

    if (nextIndex !== index) {
      setTab(tabsList[nextIndex].key)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  useEffect(() => {
    if (!showMoreMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreMenu])

  if (!isOpen) return null

  function handleDeleteClick() {
    setShowMoreMenu(false)
    if (tasks.length > 0) {
      notify(
        `Este cliente tem ${tasks.length} ${tasks.length === 1 ? 'demanda vinculada' : 'demandas vinculadas'}. Para excluí-lo, é necessário reatribuir ou excluir as demandas primeiro.`
      )
      return
    }
    if (!canAdmin) return
    if (onDelete) {
      onDelete()
    }
  }

  async function copyText(text: string, key: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      notify(`${label} copiado!`)
      setTimeout(() => setCopiedKey(null), 2500)
    } catch {
      notify('Erro ao copiar para a área de transferência.')
    }
  }

  // Estatísticas de tarefas do cliente
  const completedTasks = tasks.filter(t => Boolean(t.completed_at) || stages.find(s => s.id === t.stage_id)?.is_final)
  const activeTasks = tasks.filter(t => !t.completed_at && !stages.find(s => s.id === t.stage_id)?.is_final)

  function getTeam(teamId: string): Team | undefined {
    return teams.find(t => t.id === teamId)
  }

  function getStage(stageId: string): Stage | undefined {
    return stages.find(s => s.id === stageId)
  }

  function getAssignee(assigneeId: string | null): Profile | undefined {
    if (!assigneeId) return undefined
    return profiles.find(p => p.id === assigneeId)
  }

  const phoneDigits = client.contact_phone ? cleanDigits(client.contact_phone) : ''
  const financialWaDigits = client.financial_whatsapp ? cleanDigits(client.financial_whatsapp) : ''

  return (
    <div
      className="modal-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal modal-wide client-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil do Cliente: ${client.name}`}
      >
        {/* Cabeçalho do Perfil */}
        <div className="client-profile-header">
          <div className="client-profile-header-main">
            <div className="client-profile-avatar" aria-hidden="true">
              {initials(client.name)}
            </div>
            <div className="client-profile-title-block">
              <h2 className="client-profile-name">{client.name}</h2>
              <p className="client-profile-legal">
                {client.legal_name || 'Razão social não informada'}
              </p>
              <div className="client-profile-badges">
                <span className="profile-badge-outline">Cliente oficial</span>
                <span className="profile-badge-demands">
                  {tasks.length} {tasks.length === 1 ? 'demanda' : 'demandas'}
                </span>
              </div>
            </div>
          </div>

          <div className="client-profile-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onExport}
              title="Exportar dados cadastrais deste cliente (CSV)"
            >
              Exportar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onEdit}
              title={canAdmin ? 'Editar dados deste cliente' : 'Ver formulário de edição'}
            >
              Editar cadastro
            </button>
            {canAdmin && onDelete && (
              <div className="profile-more-menu-wrap" ref={moreMenuRef}>
                <button
                  type="button"
                  className="btn btn-secondary icon-btn-square"
                  onClick={() => setShowMoreMenu(prev => !prev)}
                  aria-label="Mais ações"
                  title="Mais ações"
                >
                  <MoreHorizontal size={17} />
                </button>
                {showMoreMenu && (
                  <div className="profile-more-dropdown" role="menu">
                    <button
                      type="button"
                      className="profile-dropdown-item danger"
                      onClick={handleDeleteClick}
                      role="menuitem"
                    >
                      <Trash2 size={14} /> Excluir cliente
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Abas de Navegação Interna */}
        <div
          className="client-profile-tablist"
          role="tablist"
          aria-label="Abas de navegação do perfil do cliente"
        >
          {tabsList.map((t, idx) => {
            const isSelected = tab === t.key
            return (
              <button
                key={t.key}
                ref={el => {
                  tabRefs.current[idx] = el
                }}
                type="button"
                role="tab"
                id={`client-tab-${t.key}`}
                aria-controls={`client-tabpanel-${t.key}`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className={`client-profile-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
                onKeyDown={e => handleTabKeyDown(e, idx)}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Conteúdo da Aba */}
        <div className="client-profile-body">
          {/* 1. VISÃO GERAL */}
          {tab === 'geral' && (
            <div
              className="client-profile-tabpanel"
              role="tabpanel"
              id="client-tabpanel-geral"
              aria-labelledby="client-tab-geral"
              tabIndex={0}
            >
              {/* Linha de três números em cartões pequenos */}
              <div className="client-profile-kpis-grid">
                <div className="client-kpi-card">
                  <span className="client-kpi-label">Total de demandas</span>
                  <span className="client-kpi-num">{tasks.length}</span>
                </div>
                <div className="client-kpi-card active-kpi">
                  <span className="client-kpi-label">Em andamento</span>
                  <span className="client-kpi-num">{activeTasks.length}</span>
                </div>
                <div className="client-kpi-card completed-kpi">
                  <span className="client-kpi-label">Concluídas</span>
                  <span className="client-kpi-num">{completedTasks.length}</span>
                </div>
              </div>

              {/* Dois cartões lado a lado */}
              <div className="client-profile-details-grid">
                {/* Identificação Cadastral */}
                <div className="client-profile-card">
                  <h3 className="profile-card-title">Identificação cadastral</h3>
                  <div className="profile-fields-list">
                    <div className="profile-field-block">
                      <span className="profile-field-label">Nome fantasia</span>
                      <span className="profile-field-val">{client.name}</span>
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">Razão social</span>
                      <span className="profile-field-val">
                        {client.legal_name || 'Não informada'}
                      </span>
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">ID interno</span>
                      <div className="profile-field-row">
                        <code className="profile-mono-code">{client.id}</code>
                        <button
                          type="button"
                          className="btn-copy-clean"
                          onClick={() => copyText(client.id, 'id', 'ID do cliente')}
                          aria-label="Copiar ID interno"
                          title="Copiar ID interno"
                        >
                          {copiedKey === 'id' ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedKey === 'id' ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contato Principal */}
                <div className="client-profile-card">
                  <h3 className="profile-card-title">Contato principal</h3>
                  <div className="profile-fields-list">
                    <div className="profile-field-block">
                      <span className="profile-field-label">Responsável</span>
                      <span className="profile-field-val">
                        {client.contact_name || 'Não informado'}
                      </span>
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">E-mail</span>
                      {client.contact_email ? (
                        <div className="profile-field-row">
                          <a href={`mailto:${client.contact_email}`} className="profile-link-clean">
                            {client.contact_email}
                          </a>
                          <button
                            type="button"
                            className="btn-copy-clean"
                            onClick={() => copyText(client.contact_email!, 'email', 'E-mail')}
                            aria-label="Copiar e-mail"
                            title="Copiar e-mail"
                          >
                            {copiedKey === 'email' ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedKey === 'email' ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      ) : (
                        <span className="profile-field-val muted">Não informado</span>
                      )}
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">Telefone / WhatsApp</span>
                      {client.contact_phone ? (
                        <div className="profile-field-row">
                          <span className="profile-field-val">{client.contact_phone}</span>
                          <div className="profile-btn-group">
                            {phoneDigits.length >= 10 && (
                              <a
                                href={`https://wa.me/${phoneDigits.length === 10 || phoneDigits.length === 11 ? `55${phoneDigits}` : phoneDigits}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-wa-clean"
                                title="Abrir conversa no WhatsApp"
                              >
                                <MessageSquare size={13} />
                                <span>Abrir WhatsApp</span>
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-copy-clean"
                              onClick={() => copyText(client.contact_phone!, 'phone', 'Telefone')}
                              aria-label="Copiar telefone"
                              title="Copiar telefone"
                            >
                              {copiedKey === 'phone' ? <Check size={13} /> : <Copy size={13} />}
                              <span>{copiedKey === 'phone' ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="profile-field-val muted">Não informado</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. FINANCEIRO */}
          {tab === 'financeiro' && (
            <div
              className="client-profile-tabpanel"
              role="tabpanel"
              id="client-tabpanel-financeiro"
              aria-labelledby="client-tab-financeiro"
              tabIndex={0}
            >
              {/* Linha de vencimento neutra (sem fundo amarelo nem alerta) */}
              <div className="client-profile-card profile-due-card">
                <div className="profile-due-info">
                  <span className="profile-field-label">Vencimento (dia do mês ou data)</span>
                  <span className="profile-field-val">
                    {client.financial_due_date || 'Não informado'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onEdit}
                >
                  {client.financial_due_date ? 'Alterar vencimento' : 'Definir vencimento'}
                </button>
              </div>

              {/* Dois cartões lado a lado */}
              <div className="client-profile-details-grid">
                {/* Contato Financeiro */}
                <div className="client-profile-card">
                  <h3 className="profile-card-title">Contato financeiro</h3>
                  <div className="profile-fields-list">
                    <div className="profile-field-block">
                      <span className="profile-field-label">Responsável financeiro</span>
                      {client.financial_contact_name ? (
                        <div className="profile-field-row">
                          <span className="profile-field-val">{client.financial_contact_name}</span>
                          <button
                            type="button"
                            className="btn-copy-clean"
                            onClick={() => copyText(client.financial_contact_name!, 'fin_name', 'Responsável financeiro')}
                            aria-label="Copiar responsável financeiro"
                            title="Copiar"
                          >
                            {copiedKey === 'fin_name' ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedKey === 'fin_name' ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="profile-field-row">
                          <span className="profile-field-val muted">—</span>
                          <button
                            type="button"
                            className="btn-add-inline"
                            onClick={onEdit}
                          >
                            <Plus size={12} />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">E-mail financeiro</span>
                      {client.financial_email ? (
                        <div className="profile-field-row">
                          <a href={`mailto:${client.financial_email}`} className="profile-link-clean">
                            {client.financial_email}
                          </a>
                          <button
                            type="button"
                            className="btn-copy-clean"
                            onClick={() => copyText(client.financial_email!, 'fin_email', 'E-mail financeiro')}
                            aria-label="Copiar e-mail financeiro"
                            title="Copiar"
                          >
                            {copiedKey === 'fin_email' ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedKey === 'fin_email' ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="profile-field-row">
                          <span className="profile-field-val muted">—</span>
                          <button
                            type="button"
                            className="btn-add-inline"
                            onClick={onEdit}
                          >
                            <Plus size={12} />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="profile-field-block">
                      <span className="profile-field-label">WhatsApp financeiro</span>
                      {client.financial_whatsapp ? (
                        <div className="profile-field-row">
                          <span className="profile-field-val">{client.financial_whatsapp}</span>
                          <div className="profile-btn-group">
                            {financialWaDigits.length >= 10 && (
                              <a
                                href={`https://wa.me/${financialWaDigits.length === 10 || financialWaDigits.length === 11 ? `55${financialWaDigits}` : financialWaDigits}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-wa-clean"
                                title="Abrir conversa no WhatsApp Financeiro"
                              >
                                <MessageSquare size={13} />
                                <span>Abrir WhatsApp</span>
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-copy-clean"
                              onClick={() => copyText(client.financial_whatsapp!, 'fin_phone', 'WhatsApp financeiro')}
                              aria-label="Copiar WhatsApp financeiro"
                              title="Copiar"
                            >
                              {copiedKey === 'fin_phone' ? <Check size={13} /> : <Copy size={13} />}
                              <span>{copiedKey === 'fin_phone' ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="profile-field-row">
                          <span className="profile-field-val muted">—</span>
                          <button
                            type="button"
                            className="btn-add-inline"
                            onClick={onEdit}
                          >
                            <Plus size={12} />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instruções de faturamento */}
                <div className="client-profile-card">
                  <h3 className="profile-card-title">Instruções de faturamento</h3>
                  {client.financial_notes ? (
                    <div className="profile-notes-content">
                      <p className="profile-notes-text">{client.financial_notes}</p>
                      <button
                        type="button"
                        className="btn-copy-clean"
                        onClick={() => copyText(client.financial_notes!, 'fin_notes', 'Instruções de faturamento')}
                        aria-label="Copiar instruções"
                        title="Copiar"
                        style={{ marginTop: '8px', alignSelf: 'flex-start' }}
                      >
                        {copiedKey === 'fin_notes' ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedKey === 'fin_notes' ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="profile-field-row" style={{ marginTop: '4px' }}>
                      <span className="profile-field-val muted">—</span>
                      <button
                        type="button"
                        className="btn-add-inline"
                        onClick={onEdit}
                      >
                        <Plus size={12} />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. LINKS & ACESSOS */}
          {tab === 'links' && (
            <div
              className="client-profile-tabpanel"
              role="tabpanel"
              id="client-tabpanel-links"
              aria-labelledby="client-tab-links"
              tabIndex={0}
            >
              <div className="client-profile-card">
                <div className="profile-card-header-clean">
                  <h3 className="profile-card-title" style={{ margin: 0 }}>
                    Links e acessos
                  </h3>
                  {client.links && client.links.length > 0 && (
                    <button
                      type="button"
                      className="btn-add-inline"
                      onClick={onEdit}
                    >
                      <Plus size={12} />
                      <span>Adicionar link</span>
                    </button>
                  )}
                </div>

                {client.links && client.links.length > 0 ? (
                  <div className="profile-links-clean-list">
                    {client.links.map((link, idx) => (
                      <div key={idx} className="profile-link-clean-row">
                        <div className="profile-link-clean-info">
                          <strong className="profile-link-clean-title">{link.label || 'Link'}</strong>
                          <span className="profile-link-clean-url" title={link.url}>
                            {link.url}
                          </span>
                        </div>
                        <div className="profile-link-clean-actions">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            title="Acessar link em nova aba"
                          >
                            <ExternalLink size={13} />
                            <span>Acessar</span>
                          </a>
                          <button
                            type="button"
                            className="btn-copy-clean"
                            onClick={() => copyText(link.url, `link_${idx}`, 'URL')}
                            aria-label={`Copiar link ${link.label || ''}`}
                            title="Copiar URL"
                          >
                            {copiedKey === `link_${idx}` ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedKey === `link_${idx}` ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="profile-empty-card">
                    <p>Nenhum link ou portal cadastrado para este cliente.</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={onEdit}
                    >
                      <Plus size={13} /> Adicionar link
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. INTEGRAÇÃO */}
          {tab === 'integracao' && (
            <div
              className="client-profile-tabpanel"
              role="tabpanel"
              id="client-tabpanel-integracao"
              aria-labelledby="client-tab-integracao"
              tabIndex={0}
            >
              <div className="client-profile-card">
                <div className="profile-card-header-clean">
                  <h3 className="profile-card-title" style={{ margin: 0 }}>
                    Parâmetros de integração técnica
                  </h3>
                  {client.integration_items && client.integration_items.length > 0 && (
                    <button
                      type="button"
                      className="btn-add-inline"
                      onClick={onEdit}
                    >
                      <Plus size={12} />
                      <span>Adicionar integração</span>
                    </button>
                  )}
                </div>

                <div className="profile-security-banner">
                  <ShieldAlert size={16} className="profile-security-icon" />
                  <span>Não registre senhas, tokens ou chaves secretas neste cadastro.</span>
                </div>

                {client.integration_items && client.integration_items.length > 0 ? (
                  <div className="profile-integration-table-wrap">
                    <table className="profile-integration-table-clean">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Chave</th>
                          <th style={{ textAlign: 'left' }}>Valor</th>
                          <th style={{ textAlign: 'left', width: '110px' }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.integration_items.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ textAlign: 'left' }}>
                              <strong className="profile-field-val" style={{ fontSize: '14px' }}>
                                {item.key}
                              </strong>
                            </td>
                            <td style={{ textAlign: 'left' }}>
                              <code className="profile-mono-code">{item.value}</code>
                            </td>
                            <td style={{ textAlign: 'left' }}>
                              <button
                                type="button"
                                className="btn-copy-clean"
                                onClick={() => copyText(item.value, `int_${idx}`, item.key)}
                                aria-label={`Copiar valor de ${item.key}`}
                                title="Copiar"
                              >
                                {copiedKey === `int_${idx}` ? <Check size={13} /> : <Copy size={13} />}
                                <span>{copiedKey === `int_${idx}` ? 'Copiado!' : 'Copiar'}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="profile-empty-card">
                    <p>Nenhuma chave ou parâmetro técnico registrado.</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={onEdit}
                    >
                      <Plus size={13} /> Adicionar integração
                    </button>
                  </div>
                )}
              </div>

              {/* Bloco Referências de integração abaixo, como cartão simples */}
              <div className="client-profile-card">
                <h3 className="profile-card-title">Referências de integração</h3>
                {client.integration_references ? (
                  <div className="profile-notes-content">
                    <p className="profile-notes-text">{client.integration_references}</p>
                    <button
                      type="button"
                      className="btn-copy-clean"
                      onClick={() => copyText(client.integration_references!, 'int_ref', 'Referências de integração')}
                      aria-label="Copiar referências"
                      title="Copiar"
                      style={{ marginTop: '8px', alignSelf: 'flex-start' }}
                    >
                      {copiedKey === 'int_ref' ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedKey === 'int_ref' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="profile-field-row" style={{ marginTop: '4px' }}>
                    <span className="profile-field-val muted">—</span>
                    <button
                      type="button"
                      className="btn-add-inline"
                      onClick={onEdit}
                    >
                      <Plus size={12} />
                      <span>Adicionar</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. DEMANDAS */}
          {tab === 'tarefas' && (
            <div
              className="client-profile-tabpanel"
              role="tabpanel"
              id="client-tabpanel-tarefas"
              aria-labelledby="client-tab-tarefas"
              tabIndex={0}
            >
              <div className="client-profile-card">
                <div className="profile-card-header-clean">
                  <h3 className="profile-card-title" style={{ margin: 0 }}>
                    Demandas vinculadas ({tasks.length})
                  </h3>
                  <div className="profile-tasks-kpis">
                    <span
                      className="profile-badge-demands"
                      style={{
                        background: 'var(--primary-subtle)',
                        color: 'var(--primary-main)',
                        borderColor: 'var(--border-main)',
                      }}
                    >
                      {activeTasks.length} ativas
                    </span>
                    <span className="profile-badge-demands">
                      {completedTasks.length} concluídas
                    </span>
                  </div>
                </div>

                {tasks.length > 0 ? (
                  <div className="profile-tasks-clean-list">
                    {tasks.map(t => {
                      const team = getTeam(t.team_id)
                      const stage = getStage(t.stage_id)
                      const assignee = getAssignee(t.assignee_id)
                      const isDone = Boolean(t.completed_at) || stage?.is_final
                      const isBranch = Boolean(t.origin_task_id)
                      const isForwarded = Boolean(t.forwarded_at)

                      return (
                        <div
                          key={t.id}
                          className={`profile-task-clean-row ${isDone ? 'is-completed' : ''}`}
                        >
                          <div className="profile-task-clean-left">
                            <div className="profile-task-clean-badges">
                              {team && (
                                <span
                                  className="profile-task-team-pill"
                                  style={{
                                    backgroundColor: `${team.color}1a`,
                                    color: team.color,
                                    borderColor: `${team.color}40`,
                                  }}
                                >
                                  {team.name}
                                </span>
                              )}
                              {isBranch && (
                                <span className="profile-task-branch-pill" title="Tarefa ramificada de outro fluxo">
                                  <GitBranch size={11} /> Ramificação
                                </span>
                              )}
                              {isForwarded && (
                                <span className="profile-task-forward-pill" title="Tarefa encaminhada para outro quadro">
                                  <ArrowRight size={11} /> Encaminhada
                                </span>
                              )}
                              {stage && (
                                <span
                                  className="profile-task-stage-pill"
                                  style={{
                                    backgroundColor: `${stage.color}1a`,
                                    color: stage.color,
                                    borderColor: `${stage.color}40`,
                                  }}
                                >
                                  {stage.name}
                                </span>
                              )}
                              <span className={`priority-badge ${t.priority}`}>
                                {t.priority}
                              </span>
                            </div>
                            <h4 className="profile-task-clean-title">{t.title}</h4>
                            {t.description && (
                              <p className="profile-task-clean-desc">{t.description}</p>
                            )}
                          </div>

                          <div className="profile-task-clean-right">
                            {assignee ? (
                              <div className="profile-task-assignee" title={`Responsável: ${assignee.full_name}`}>
                                <span className="avatar avatar-xs" aria-hidden="true">
                                  {initials(assignee.full_name)}
                                </span>
                                <span>{assignee.full_name}</span>
                              </div>
                            ) : (
                              <span className="profile-task-no-assignee">Sem responsável</span>
                            )}

                            {t.due_at && (
                              <div className="profile-task-due" title="Prazo da demanda">
                                <Clock size={12} />
                                <span>{new Date(t.due_at).toLocaleDateString('pt-BR')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="profile-empty-card">
                    <CheckCircle2 size={28} style={{ opacity: 0.4, color: 'var(--text-secondary)' }} />
                    <p>Nenhuma demanda vinculada a este cliente no momento.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="client-profile-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
