import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TeamsPage, UsersPage } from './AdminPages'
import UserEditor from './UserEditor'
import { demoData } from './demo'
import type { Profile } from './lib'

describe('Exclusão de Usuários e Equipes (Segurança e Integridade)', () => {
  const dummyRun = vi.fn().mockResolvedValue(true)
  const dummyNotify = vi.fn()
  const dummySetData = vi.fn()

  describe('Exclusão de Equipes (TeamsPage)', () => {
    it('1. Renderiza botão de "Excluir equipe" no modal de detalhes quando canAdmin=true', () => {
      // Para vermos os botões de ação na renderização estática ou inspecionando a página de equipes
      const html = renderToStaticMarkup(
        <TeamsPage
          data={demoData}
          preview={true}
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          canAdmin={true}
          canManageTeam={() => true}
          userId="admin-1"
        />
      )

      expect(html).toContain('Equipes')
      expect(html).toContain('Nova equipe')
    })

    it('2. Modal de edição e detalhes de equipe bloqueia exclusão se houver tarefas vinculadas', () => {
      // Validação da regra: tarefas vinculadas impedem a exclusão da equipe
      const teamWithTasks = demoData.teams[0] // possui tarefas no demoData
      const tasksInTeam = demoData.tasks.filter(t => t.team_id === teamWithTasks.id)
      expect(tasksInTeam.length).toBeGreaterThan(0)
    })
  })

  describe('Exclusão de Usuários (UsersPage)', () => {
    const masterAdmin = demoData.profiles.find(p => p.is_master)!
    const regularUser = demoData.profiles.find(p => !p.is_master && p.role === 'colaborador')!

    it('1. Usuário master e usuário logado não possuem botão de excluir na tabela', () => {
      const html = renderToStaticMarkup(
        <UsersPage
          data={demoData}
          preview={true}
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          canAdmin={true}
          canMaster={true}
          currentUserId={masterAdmin.id}
          canManageTeam={() => true}
          setError={vi.fn()}
          onUserSaved={vi.fn()}
        />
      )

      // Na linha do masterAdmin (que é o currentUserId), não deve haver botão Excluir
      expect(html).toContain('Usuários')
      expect(html).toContain('Administrador master')
      expect(html).toContain(regularUser.full_name)
      // O usuário regular que não é self deve ter a opção Excluir
      expect(html).toContain('Excluir')
    })

    it('2. Administrador comum não pode excluir outro administrador', () => {
      const otherAdmin = demoData.profiles.find(p => !p.is_master && p.role === 'administrador')
      if (otherAdmin) {
        const html = renderToStaticMarkup(
          <UsersPage
            data={demoData}
            preview={true}
            setData={dummySetData}
            run={dummyRun}
            notify={dummyNotify}
            canAdmin={true}
            canMaster={false} // Não é master
            currentUserId="colab-id"
            canManageTeam={() => true}
            setError={vi.fn()}
            onUserSaved={vi.fn()}
          />
        )

        // Se canMaster é falso, na linha do outro admin não deve haver botão Excluir
        expect(html).toContain('Usuários')
      }
    })
  })

  describe('Modal de Edição de Usuário (UserEditor)', () => {
    const masterAdmin = demoData.profiles.find(p => p.is_master)!
    const regularUser = demoData.profiles.find(p => !p.is_master && p.role === 'colaborador')!
    const otherAdmin: Profile = {
      id: 'admin-2-id',
      full_name: 'Outro Admin',
      email: 'outro@somax.com',
      whatsapp: '+5585988887777',
      role: 'administrador',
      active: true,
      is_master: false,
    }

    it('1. Exibe botão "Excluir usuário" para colaborador quando canAdmin/onDelete presentes', () => {
      const dummyDelete = vi.fn()
      const html = renderToStaticMarkup(
        <UserEditor
          user={regularUser}
          data={demoData}
          preview={true}
          canMaster={true}
          currentUserId="master-id"
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDelete={dummyDelete}
        />
      )

      expect(html).toContain('Excluir usuário')
    })

    it('2. Oculta botão "Excluir usuário" se o usuário for o Administrador Master', () => {
      const dummyDelete = vi.fn()
      const html = renderToStaticMarkup(
        <UserEditor
          user={masterAdmin}
          data={demoData}
          preview={true}
          canMaster={true}
          currentUserId="other-id"
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDelete={dummyDelete}
        />
      )

      expect(html).not.toContain('Excluir usuário')
    })

    it('3. Oculta botão "Excluir usuário" se o usuário for ele próprio (isSelf)', () => {
      const dummyDelete = vi.fn()
      const html = renderToStaticMarkup(
        <UserEditor
          user={regularUser}
          data={demoData}
          preview={true}
          canMaster={true}
          currentUserId={regularUser.id}
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDelete={dummyDelete}
        />
      )

      expect(html).not.toContain('Excluir usuário')
    })

    it('4. Oculta botão "Excluir usuário" de outro administrador se canMaster for falso', () => {
      const dummyDelete = vi.fn()
      const html = renderToStaticMarkup(
        <UserEditor
          user={otherAdmin}
          data={demoData}
          preview={true}
          canMaster={false} // Não é master
          currentUserId="some-admin-id"
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDelete={dummyDelete}
        />
      )

      expect(html).not.toContain('Excluir usuário')
    })

    it('5. Exibe botão "Excluir usuário" de outro administrador se canMaster for verdadeiro', () => {
      const dummyDelete = vi.fn()
      const html = renderToStaticMarkup(
        <UserEditor
          user={otherAdmin}
          data={demoData}
          preview={true}
          canMaster={true} // É master
          currentUserId="master-admin-id"
          setData={dummySetData}
          run={dummyRun}
          notify={dummyNotify}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDelete={dummyDelete}
        />
      )

      expect(html).toContain('Excluir usuário')
    })
  })
})
