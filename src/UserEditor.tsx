import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import {
  AlertCircle,
  Check,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { maskPhone, messageError, supabase } from './lib'
import type { Profile } from './lib'
import type { Data } from './App'
import PasswordInput from './PasswordInput'
import './user-editor.css'

type Props = {
  user: Profile
  data: Data
  preview: boolean
  canMaster: boolean
  currentUserId: string
  setData: Dispatch<SetStateAction<Data>>
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>
  notify: (message: string) => void
  onSaved: (user: Profile) => void
  onClose: () => void
  onDelete?: (user: Profile) => Promise<void> | void
}

const roleLabels: Record<Profile['role'], string> = {
  administrador: 'Administrador',
  gestor: 'Gestor',
  colaborador: 'Colaborador',
}

export default function UserEditor({
  user,
  data,
  preview,
  canMaster,
  currentUserId,
  setData,
  run,
  notify,
  onSaved,
  onClose,
  onDelete,
}: Props) {
  const [name, setName] = useState(user.full_name)
  const [email, setEmail] = useState(user.email || '')
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '')
  const [role, setRole] = useState<Profile['role']>(user.role)
  const [active, setActive] = useState(user.active)
  const [teamIds, setTeamIds] = useState<string[]>(
    data.members
      .filter(member => member.user_id === user.id && member.active)
      .map(member => member.team_id)
  )
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isDirty = (
    name !== user.full_name ||
    email !== (user.email || '') ||
    whatsapp !== (user.whatsapp || '') ||
    role !== user.role ||
    active !== user.active ||
    Boolean(temporaryPassword)
  )

  const requestClose = useCallback(() => {
    if (isDirty && !window.confirm('Você tem alterações não salvas no usuário. Deseja realmente descartar e fechar?')) {
      return
    }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestClose])

  const isSelf = user.id === currentUserId
  const locked = user.is_master || isSelf
  const canDeleteUser =
    Boolean(onDelete) &&
    !user.is_master &&
    !isSelf &&
    (canMaster || user.role !== 'administrador')

  const initials =
    user.full_name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0]?.toUpperCase())
      .join('') || 'U'

  function toggleTeam(targetId: string) {
    setTeamIds(current =>
      current.includes(targetId)
        ? current.filter(id => id !== targetId)
        : [...current, targetId]
    )
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const fullName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    const digits = whatsapp.replace(/\D/g, '')
    const cleanWhatsapp = `+${digits.length === 10 || digits.length === 11 ? `55${digits}` : digits}`

    if (
      fullName.length < 2 ||
      fullName.length > 120 ||
      !/^\S+@\S+\.\S+$/.test(cleanEmail) ||
      !/^\+[0-9]{10,15}$/.test(cleanWhatsapp)
    ) {
      setError('Confira nome, e-mail e WhatsApp.')
      return
    }

    if (
      temporaryPassword &&
      (temporaryPassword.length < 8 || temporaryPassword.length > 128)
    ) {
      setError('A senha temporária deve ter de 8 a 128 caracteres.')
      return
    }

    if (
      data.profiles.some(
        person => person.id !== user.id && person.email?.toLowerCase() === cleanEmail
      )
    ) {
      setError('Este e-mail já está cadastrado.')
      return
    }

    if (locked && (role !== user.role || !active)) {
      setError('A função e o acesso desta conta não podem ser alterados aqui.')
      return
    }

    setError('')
    setBusy(true)
    const saved = {
      ...user,
      full_name: fullName,
      email: cleanEmail,
      whatsapp: cleanWhatsapp,
      role,
      active,
    }

    if (preview) {
      setData(current => ({
        ...current,
        profiles: current.profiles.map(person =>
          person.id === user.id ? saved : person
        ),
        members: [
          ...current.members.map(member =>
            member.user_id === user.id
              ? {
                  ...member,
                  active: teamIds.includes(member.team_id),
                  is_manager: teamIds.includes(member.team_id) && role === 'gestor',
                }
              : member
          ),
          ...teamIds
            .filter(
              teamId =>
                !current.members.some(
                  member => member.user_id === user.id && member.team_id === teamId
                )
            )
            .map(teamId => ({
              team_id: teamId,
              user_id: user.id,
              active: true,
              is_manager: role === 'gestor',
            })),
        ],
      }))
      onSaved(saved)
      notify('Usuário atualizado na prévia local. A senha não foi armazenada.')
      setBusy(false)
      onClose()
      return
    }

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        'manage-user',
        {
          body: {
            user_id: user.id,
            full_name: fullName,
            email: cleanEmail,
            whatsapp: cleanWhatsapp,
            role,
            active,
            team_ids: teamIds,
            temporary_password: temporaryPassword || null,
          },
        }
      )
      if (invokeError) throw invokeError
      if (result?.error) throw new Error(result.error)
      const ok = await run(async () => {}, 'Usuário atualizado.')
      if (ok) onClose()
    } catch (cause) {
      setError(messageError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        className="modal user-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${user.full_name}`}
      >
        <div className="user-editor-header">
          <div className="user-editor-header-title">
            <div className="header-icon">
              <UserRound size={18} />
            </div>
            <div>
              <h2>Editar Usuário</h2>
              <p>Atualize os dados, função, equipes e credenciais.</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={requestClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form className="user-editor-form" onSubmit={event => void save(event)}>
          <div className="user-editor-scroll">
            {/* Banner de Identidade */}
            <div className="user-editor-identity">
              <div className="user-editor-avatar">{initials}</div>
              <div className="user-editor-identity-info">
                <h3>{user.full_name}</h3>
                <p>{user.email || 'Sem e-mail cadastrado'}</p>
                <div className="user-editor-badges">
                  <span
                    className={`user-editor-badge ${
                      user.is_master ? 'master' : 'role'
                    }`}
                  >
                    <ShieldCheck size={12} />
                    {user.is_master
                      ? 'Administrador Master'
                      : roleLabels[user.role]}
                  </span>
                  <span
                    className={`user-editor-badge status-${
                      active ? 'active' : 'inactive'
                    }`}
                  >
                    <span
                      className={`user-status-indicator ${
                        active ? 'active' : ''
                      }`}
                    />
                    {active ? 'Conta Ativa' : 'Acesso Suspenso'}
                  </span>
                </div>
              </div>
            </div>

            {/* Aviso quando os privilégios estão protegidos */}
            {user.is_master && (
              <div className="user-editor-locked-notice">
                <LockKeyhole size={16} />
                <span>
                  <strong>Conta Master Protegida:</strong> A função e o status de
                  acesso desta conta não podem ser alterados pelo painel.
                </span>
              </div>
            )}
            {!user.is_master && isSelf && (
              <div className="user-editor-locked-notice">
                <LockKeyhole size={16} />
                <span>
                  <strong>Sua Própria Conta:</strong> Para evitar bloqueios
                  acidentais, a função e o status da sua própria conta não podem ser
                  alterados aqui.
                </span>
              </div>
            )}

            {/* Seção 1: Dados Pessoais & Contato */}
            <div className="user-editor-section">
              <div className="user-editor-section-head">
                <h4 className="user-editor-section-title">Dados Cadastrais</h4>
              </div>
              <div className="user-editor-grid">
                <label className="user-editor-field col-full">
                  <span>
                    <UserRound size={13} /> Nome completo *
                  </span>
                  <input
                    value={name}
                    onChange={event => setName(event.target.value)}
                    required
                    maxLength={120}
                    placeholder="Nome completo do usuário"
                  />
                </label>

                <label className="user-editor-field">
                  <span>
                    <Mail size={13} /> E-mail de acesso *
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    required
                    placeholder="usuario@somax.com.br"
                  />
                </label>

                <label className="user-editor-field">
                  <span>
                    <Phone size={13} /> WhatsApp *
                  </span>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={event => setWhatsapp(maskPhone(event.target.value))}
                    required
                    placeholder="(00) 00000-0000"
                  />
                </label>
              </div>
            </div>

            {/* Seção 2: Permissões & Status */}
            <div className="user-editor-section">
              <div className="user-editor-section-head">
                <h4 className="user-editor-section-title">Função & Acesso</h4>
              </div>
              <div className="user-editor-grid">
                <label className="user-editor-field">
                  <span>
                    <ShieldCheck size={13} /> Função no Sistema *
                  </span>
                  <select
                    value={role}
                    onChange={event =>
                      setRole(event.target.value as Profile['role'])
                    }
                    disabled={locked}
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="gestor">Gestor</option>
                    {(canMaster || user.role === 'administrador') && (
                      <option value="administrador">Administrador</option>
                    )}
                  </select>
                </label>

                <div className="user-editor-field">
                  <span>
                    <UserCheck size={13} /> Status do Acesso
                  </span>
                  <div
                    className={`user-status-card ${locked ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!locked) setActive(curr => !curr)
                    }}
                    role="checkbox"
                    aria-checked={active}
                    aria-disabled={locked}
                    tabIndex={locked ? -1 : 0}
                    onKeyDown={e => {
                      if (!locked && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault()
                        setActive(curr => !curr)
                      }
                    }}
                  >
                    <div className="user-status-label">
                      <span
                        className={`user-status-indicator ${
                          active ? 'active' : ''
                        }`}
                      />
                      <span>{active ? 'Acesso Ativo' : 'Acesso Bloqueado'}</span>
                    </div>
                    <span
                      className={`user-status-pill ${
                        active ? 'active' : 'inactive'
                      }`}
                    >
                      {active ? 'Habilitado' : 'Desativado'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seção 3: Equipes */}
            <div className="user-editor-section">
              <div className="user-editor-section-head">
                <h4 className="user-editor-section-title">
                  <Users size={12} style={{ display: 'inline', marginRight: 5 }} />
                  Equipes Vinculadas
                </h4>
                <span className="user-editor-counter">
                  {teamIds.length}{' '}
                  {teamIds.length === 1 ? 'equipe' : 'equipes'}
                </span>
              </div>
              <div className="user-teams-grid">
                {data.teams.map(team => {
                  const isSelected = teamIds.includes(team.id)
                  return (
                    <div
                      key={team.id}
                      className={`user-team-chip ${
                        isSelected ? 'selected' : ''
                      }`}
                      onClick={() => toggleTeam(team.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          toggleTeam(team.id)
                        }
                      }}
                    >
                      <span
                        className="user-team-dot"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="user-team-name">{team.name}</span>
                      <div className="user-team-check">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Seção 4: Redefinição de Senha */}
            <div className="user-editor-section">
              <div className="user-password-box">
                <div className="user-password-box-title">
                  <KeyRound size={14} />
                  <span>Nova senha temporária (opcional)</span>
                </div>
                <PasswordInput
                  wrapClassName="user-password-input-wrap user-editor-field"
                  value={temporaryPassword}
                  onChange={event => setTemporaryPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Deixe em branco para manter a senha atual"
                />
                <p className="user-password-hint">
                  Ao definir uma nova senha temporária, a pessoa receberá a instrução
                  de alterá-la obrigatoriamente no primeiro acesso.
                </p>
              </div>
            </div>

            {error && (
              <div className="user-editor-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="user-editor-footer">
            {canDeleteUser ? (
              <button
                type="button"
                className="btn btn-ghost text-danger"
                disabled={busy}
                onClick={async () => {
                  if (onDelete) {
                    await onDelete(user)
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--chip-danger-text, #ef4444)',
                  marginRight: 'auto',
                }}
              >
                <Trash2 size={15} />
                Excluir usuário
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={requestClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
