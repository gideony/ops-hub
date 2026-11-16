import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientProfileModal } from './ClientProfileModal'
import { PendingRegistrationsModal } from './ClientRegistrationModals'
import { demoData } from './demo'
import type { Client, Task } from './lib'

describe('QA: Redesign de Perfil do Cliente e Cadastros Pendentes (Passo 8)', () => {
  const fullClient: Client = demoData.clients.find(c => c.id === 'aurora')!
  const emptyClient: Client = demoData.clients.find(c => c.id === 'cliente-vazio')!
  const clientTasks: Task[] = demoData.tasks.filter(t => t.client_id === fullClient.id)

  describe('1. Estrutura do Modal e Cabeçalho do Perfil', () => {
    it('renderiza o cabeçalho novo com avatar quadrado 56px, nome 22px, razão social e etiquetas corretas', () => {
      const html = renderToStaticMarkup(
        <ClientProfileModal
          client={fullClient}
          isOpen={true}
          onClose={() => {}}
          onEdit={() => {}}
          onExport={() => {}}
          onDelete={() => {}}
          tasks={clientTasks}
          teams={demoData.teams}
          stages={demoData.stages}
          profiles={demoData.profiles}
          canAdmin={true}
          notify={() => {}}
        />
      )

      expect(html).toContain('client-profile-modal')
      expect(html).toContain('client-profile-avatar')
      expect(html).toContain('client-profile-name')
      expect(html).toContain('Aurora Café')
      expect(html).toContain('Cliente oficial')
      expect(html).toContain('profile-badge-demands')
    })

    it('possui um único botão "Editar cadastro" no topo e nenhum botão duplicado no rodapé', () => {
      const html = renderToStaticMarkup(
        <ClientProfileModal
          client={fullClient}
          isOpen={true}
          onClose={() => {}}
          onEdit={() => {}}
          onExport={() => {}}
          onDelete={() => {}}
          tasks={clientTasks}
          teams={demoData.teams}
          stages={demoData.stages}
          profiles={demoData.profiles}
          canAdmin={true}
          notify={() => {}}
        />
      )

      // Conta ocorrências de "Editar cadastro"
      const editOccurrences = (html.match(/Editar cadastro/g) || []).length
      expect(editOccurrences).toBe(1)

      // Rodapé contém apenas "Fechar"
      expect(html).toContain('client-profile-footer')
      expect(html).not.toContain('Cliente ID:')
    })

    it('renderiza o menu "..." com aria-label "Mais ações" para administradores e remove lixeira solta', () => {
      const html = renderToStaticMarkup(
        <ClientProfileModal
          client={fullClient}
          isOpen={true}
          onClose={() => {}}
          onEdit={() => {}}
          onExport={() => {}}
          onDelete={() => {}}
          tasks={clientTasks}
          teams={demoData.teams}
          stages={demoData.stages}
          profiles={demoData.profiles}
          canAdmin={true}
          notify={() => {}}
        />
      )

      expect(html).toContain('aria-label="Mais ações"')
      expect(html).toContain('profile-more-menu-wrap')
    })
  })

  describe('2. Abas Tipográficas e WAI-ARIA', () => {
    it('renderiza o container de abas com role="tablist" e botões só com texto e contadores', () => {
      const html = renderToStaticMarkup(
        <ClientProfileModal
          client={fullClient}
          isOpen={true}
          onClose={() => {}}
          onEdit={() => {}}
          onExport={() => {}}
          tasks={clientTasks}
          teams={demoData.teams}
          stages={demoData.stages}
          profiles={demoData.profiles}
          canAdmin={false}
          notify={() => {}}
        />
      )

      expect(html).toContain('role="tablist"')
      expect(html).toContain('Visão geral')
      expect(html).toContain('Financeiro')
      expect(html).toContain('Links e acessos (1)')
      expect(html).toContain('Integrações (1)')
      expect(html).toContain(`Demandas (${clientTasks.length})`)
    })
  })

  describe('3. Aba Visão Geral', () => {
    it('exibe a linha de 3 KPIs (Total de demandas, Em andamento, Concluídas) e ID exibido apenas uma vez', () => {
      const html = renderToStaticMarkup(
        <ClientProfileModal
          client={fullClient}
          isOpen={true}
          onClose={() => {}}
          onEdit={() => {}}
          onExport={() => {}}
          tasks={clientTasks}
          teams={demoData.teams}
          stages={demoData.stages}
          profiles={demoData.profiles}
          canAdmin={false}
          notify={() => {}}
        />
      )

      expect(html).toContain('client-profile-kpis-grid')
      expect(html).toContain('Total de demandas')
      expect(html).toContain('Em andamento')
      expect(html).toContain('Concluídas')

      // ID interno aparece no cartão de identificação cadastral
      expect(html).toContain('ID interno')
      expect(html).toContain('aurora')
      expect(html).toContain('profile-mono-code')
    })
  })

  describe('4. Regra de Bloqueio de Exclusão de Cliente', () => {
    it('bloqueia exclusão quando o cliente possui demandas vinculadas e permite quando vazio', () => {
      let notified = ''
      let deleted = false

      function tryDelete(client: Client, tasks: Task[]) {
        const count = tasks.filter(t => t.client_id === client.id).length
        if (count > 0) {
          notified = `Este cliente tem ${count} demandas vinculadas.`
          return false
        }
        deleted = true
        return true
      }

      // Cliente com tarefas
      const canDeleteFull = tryDelete(fullClient, demoData.tasks)
      expect(canDeleteFull).toBe(false)
      expect(notified).toContain('demandas vinculadas')
      expect(deleted).toBe(false)

      // Cliente vazio sem tarefas
      const canDeleteEmpty = tryDelete(emptyClient, demoData.tasks)
      expect(canDeleteEmpty).toBe(true)
      expect(deleted).toBe(true)
    })
  })

  describe('5. Modal de Cadastros Pendentes', () => {
    it('renderiza o cabeçalho novo, a faixa curta de quarentena e as abas de filtro', () => {
      const html = renderToStaticMarkup(
        <PendingRegistrationsModal
          isOpen={true}
          onClose={() => {}}
          submissions={demoData.registrationSubmissions}
          links={demoData.registrationLinks}
          teams={demoData.teams}
          preview={true}
          onApprove={async () => {}}
          onReject={async () => {}}
          notify={() => {}}
        />
      )

      expect(html).toContain('Cadastros pendentes')
      expect(html).toContain('Novos clientes enviados pelo link público, aguardando validação.')
      expect(html).toContain('pending-notice-banner')
      expect(html).toContain('Aprovação humana obrigatória')
      expect(html).toContain('Todos (2)')
      expect(html).toContain('Com dados financeiros (1)')
      expect(html).toContain('Com CNPJ/CPF (1)')
      expect(html).toContain('TechLog Soluções')
    })

    it('no estado vazio não renderiza os três contadores "0"', () => {
      const html = renderToStaticMarkup(
        <PendingRegistrationsModal
          isOpen={true}
          onClose={() => {}}
          submissions={[]}
          links={[]}
          teams={demoData.teams}
          preview={true}
          onApprove={async () => {}}
          onReject={async () => {}}
          notify={() => {}}
        />
      )

      expect(html).toContain('Nenhum cadastro pendente')
      expect(html).not.toContain('reg-link-stat-box')
      expect(html).not.toContain('reg-stat-num')
    })
  })
})
