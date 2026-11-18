import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, LockKeyhole, Moon, Save, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { maskPhone, messageError, supabase } from './lib'
import type { Profile } from './lib'
import PasswordInput from './PasswordInput'

type Props = {
  profile: Profile | null
  email: string
  teams: string[]
  preview: boolean
  theme: 'dark' | 'light'
  onThemeChange: (theme: 'dark' | 'light') => void
  onProfileSaved: (profile: Profile) => void
  notify: (message: string) => void
}

const roles: Record<Profile['role'], string> = {
  administrador: 'Administrador',
  gestor: 'Gestor',
  colaborador: 'Colaborador',
}

export default function UserSettings({ profile, email, teams, preview, theme, onThemeChange, onProfileSaved, notify }: Props) {
  const [name, setName] = useState(profile?.full_name || '')
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setName(profile?.full_name || '')
    setWhatsapp(profile?.whatsapp || '')
  }, [profile?.id, profile?.full_name, profile?.whatsapp])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profile) return
    const cleanName = name.trim()
    const digits = whatsapp.replace(/\D/g, '')
    const cleanWhatsapp = digits ? `+${digits.length === 10 || digits.length === 11 ? `55${digits}` : digits}` : ''
    if (cleanName.length < 2 || cleanName.length > 120) { setProfileError('Informe um nome entre 2 e 120 caracteres.'); return }
    if (cleanWhatsapp && !/^\+[0-9]{10,15}$/.test(cleanWhatsapp)) { setProfileError('Informe um número de telefone/WhatsApp válido com DDD.'); return }
    setProfileError('')
    setSavingProfile(true)
    try {
      if (!preview) {
        const { error } = await supabase.rpc('update_my_profile', { p_full_name: cleanName, p_whatsapp: cleanWhatsapp || null })
        if (error) throw error
      }
      onProfileSaved({ ...profile, full_name: cleanName, whatsapp: cleanWhatsapp || null })
      notify(preview ? 'Perfil atualizado nesta prévia local.' : 'Seu perfil foi atualizado.')
    } catch (error) { setProfileError(messageError(error)) }
    finally { setSavingProfile(false) }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    if (newPassword.length < 8) { setPasswordError('Use uma senha com pelo menos 8 caracteres.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('As senhas não coincidem.'); return }
    if (preview) { setPasswordError('A troca de senha exige uma conta conectada ao Supabase.'); return }
    setPasswordError('')
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      notify('Sua senha foi alterada.')
    } catch (error) { setPasswordError(messageError(error)) }
    finally { setSavingPassword(false) }
  }

  const initials = (profile?.full_name || email || 'U').trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('')

  return <section className="content account-settings">
    <div className="page-heading"><div><div className="eyebrow">MINHA CONTA</div><h1>Configurações</h1><p>Gerencie as informações e preferências da sua conta.</p></div></div>
    <div className="account-intro"><div className="account-avatar">{initials}</div><div><h2>{profile?.full_name || 'Usuário'}</h2><p>{email}</p><span className="account-role"><ShieldCheck size={13}/>{profile?.is_master ? 'Administrador master' : profile ? roles[profile.role] : 'Conta ativa'}</span></div></div>
    <div className="account-grid">
      <section className="account-panel"><div className="account-panel-heading"><UserRound size={18}/><div><h2>Dados pessoais</h2><p>Informações da conta conectada agora.</p></div></div>
        <form onSubmit={event => void saveProfile(event)} className="account-form">
          <label className="field"><span>Nome completo</span><input value={name} onChange={event => setName(event.target.value)} required maxLength={120} autoComplete="name"/></label>
          <label className="field"><span>E-mail de acesso</span><input value={email} type="email" readOnly aria-readonly="true"/></label>
          <label className="field"><span>WhatsApp</span><input value={whatsapp} onChange={event => setWhatsapp(maskPhone(event.target.value))} type="tel" placeholder="(00) 00000-0000" autoComplete="tel"/></label>
          <p className="account-hint">Para trocar o e-mail ou a função, peça ajuda a um administrador.</p>
          {profileError && <p className="form-error" role="alert">{profileError}</p>}
          <button className="btn btn-primary" type="submit" disabled={savingProfile || !profile}><Save size={15}/>{savingProfile ? 'Salvando...' : 'Salvar alterações'}</button>
        </form>
      </section>
      <div className="account-side">
        <section className="account-panel"><div className="account-panel-heading"><LockKeyhole size={18}/><div><h2>Segurança</h2><p>Altere sua senha de acesso.</p></div></div><form onSubmit={event => void savePassword(event)} className="account-form">
          <label className="field"><span>Nova senha</span><PasswordInput value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required/></label>
          <label className="field"><span>Confirmar nova senha</span><PasswordInput value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required/></label>
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          <button className="btn btn-secondary" type="submit" disabled={savingPassword || preview}>{savingPassword ? 'Alterando...' : 'Alterar senha'}</button>
          {preview && <p className="account-hint">A senha só pode ser alterada com o Supabase configurado.</p>}
        </form></section>
        <section className="account-panel"><div className="account-panel-heading"><Sun size={18}/><div><h2>Aparência</h2><p>Escolha como o hub aparece para você.</p></div></div><div className="account-appearance"><button type="button" className={theme === 'light' ? 'selected' : ''} onClick={() => onThemeChange('light')}><Sun size={17}/> Claro {theme === 'light' && <Check size={15}/>}</button><button type="button" className={theme === 'dark' ? 'selected' : ''} onClick={() => onThemeChange('dark')}><Moon size={17}/> Escuro {theme === 'dark' && <Check size={15}/>}</button></div></section>
        <section className="account-panel"><div className="account-panel-heading"><ShieldCheck size={18}/><div><h2>Acesso</h2><p>Sua função e equipes ativas.</p></div></div><div className="account-access"><div><span>Função</span><strong>{profile?.is_master ? 'Administrador master' : profile ? roles[profile.role] : '—'}</strong></div><div><span>Equipes</span><strong>{teams.length ? teams.join(', ') : 'Nenhuma equipe ativa'}</strong></div></div></section>
      </div>
    </div>
  </section>
}
