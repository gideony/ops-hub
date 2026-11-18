import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PasswordInput, { passwordToggleLabel } from './PasswordInput'
import UserSettings from './UserSettings'
import { demoData } from './demo'

describe('Campo de senha com mostrar/ocultar', () => {
  it('rotula o botão conforme a visibilidade atual', () => {
    expect(passwordToggleLabel(false)).toBe('Ver senha')
    expect(passwordToggleLabel(true)).toBe('Ocultar senha')
  })

  it('inicia oculto, com botão acessível para revelar o valor', () => {
    const html = renderToStaticMarkup(
      <PasswordInput value="secreta" onChange={() => {}} autoComplete="current-password" />
    )
    expect(html).toContain('type="password"')
    expect(html).toContain('aria-label="Ver senha"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('type="text"')
  })

  it('pode iniciar visível quando o formulário pedir conferência imediata', () => {
    const html = renderToStaticMarkup(
      <PasswordInput initiallyVisible value="temporaria" onChange={() => {}} />
    )
    expect(html).toContain('type="text"')
    expect(html).toContain('aria-label="Ocultar senha"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('oferece o mesmo controle em Configurações ao alterar a senha', () => {
    const html = renderToStaticMarkup(
      <UserSettings
        profile={demoData.profiles[0]}
        email="admin@exemplo.com"
        teams={['Comercial']}
        preview={false}
        theme="light"
        onThemeChange={() => {}}
        onProfileSaved={() => {}}
        notify={() => {}}
      />
    )
    expect(html).toContain('Nova senha')
    expect(html).toContain('Confirmar nova senha')
    expect(html.match(/aria-label="Ver senha"/g)?.length).toBe(2)
  })
})
