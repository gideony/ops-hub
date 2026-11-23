import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChatPage from './ChatPage'
import type { Data } from './lib'

describe('PASSO 7: QA e Testes de Interface do Chat (ChatPage)', () => {
  const now = new Date().toISOString()

  const mockData: Data = {
    profiles: [
      { id: 'user-admin', full_name: 'Administrador OPSHUB', role: 'gestor', is_master: true, active: true, email: 'admin@opshub.local' },
      { id: 'user-dev-1', full_name: 'Desenvolvedor Um', role: 'colaborador', is_master: false, active: true, email: 'dev1@opshub.local' },
      { id: 'user-dev-2', full_name: 'Desenvolvedor Dois', role: 'colaborador', is_master: false, active: true, email: 'dev2@opshub.local' }
    ],
    teams: [
      { id: 'team-ti', name: 'Tecnologia da Informação', color: '#0284c7' }
    ],
    members: [
      { team_id: 'team-ti', user_id: 'user-admin', is_manager: true, active: true },
      { team_id: 'team-ti', user_id: 'user-dev-1', is_manager: false, active: true },
      { team_id: 'team-ti', user_id: 'user-dev-2', is_manager: false, active: true }
    ],
    channels: [
      {
        id: 'channel-ti-geral',
        team_id: 'team-ti',
        name: 'Geral',
        description: 'Canal Geral de TI',
        archived_at: null,
        is_restricted: false,
        created_at: now
      },
      {
        id: 'channel-ti-deploy',
        team_id: 'team-ti',
        name: 'Deploys e Releases',
        description: 'Coordenação de publicações',
        archived_at: null,
        is_restricted: false,
        created_at: now
      },
      {
        id: 'channel-ti-legado',
        team_id: 'team-ti',
        name: 'Projetos 2024',
        description: 'Canal antigo arquivado',
        archived_at: '2025-01-01T00:00:00Z',
        is_restricted: false,
        created_at: '2024-01-01T00:00:00Z'
      }
    ],
    clients: [],
    stages: [],
    transitions: [],
    templates: [],
    templateGroups: [],
    templateItems: [],
    tags: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Deploy em Produção',
        description: 'Coordenação de release',
        team_id: 'team-ti',
        assignee_id: 'user-admin',
        client_id: null,
        stage_id: 'stage-doing',
        board_id: 'board-geral',
        priority: 'alta',
        due_at: null,
        tags: [],
        completed_at: null,
        created_by: 'user-admin',
        created_at: now,
        updated_at: now
      }
    ],
    reads: [],
    boards: [],
    boardStages: [],
    sprints: []
  }

  it('renderiza os canais da equipe agrupados por time', () => {
    const html = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )

    expect(html).toContain('Tecnologia da Informação')
    expect(html).toContain('Geral')
    expect(html).toContain('Deploys e Releases')
  })

  it('exibe a seção de canais arquivados para quem tem permissão quando houver arquivados', () => {
    const html = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )

    expect(html).toContain('chat-archived-section')
    expect(html).toContain('Arquivados (1)')
  })

  it('renderiza o campo de busca de canais com placeholder acessível', () => {
    const html = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )

    expect(html).toContain('placeholder="Buscar canais..."')
    expect(html).toContain('aria-label="Buscar canais"')
  })

  it('renderiza botão de criar novo canal (+) apenas quando usuário tem permissão para gerenciar o time', () => {
    const htmlWithAdmin = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )
    expect(htmlWithAdmin).toContain('aria-label="Criar novo canal em Tecnologia da Informação"')

    const htmlWithoutPerm = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={false}
        canManageTeam={() => false}
      />
    )
    expect(htmlWithoutPerm).not.toContain('aria-label="Criar novo canal em Tecnologia da Informação"')
  })

  it('renderiza o cabeçalho do canal selecionado com metadados e contagem de membros', () => {
    const html = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )

    expect(html).toContain('chat-header-info')
    expect(html).toContain('Tecnologia da Informação · canal da equipe')
    expect(html).toContain('Canal Geral de TI')
    expect(html).toContain('title="Ver membros do canal"')
    expect(html).toContain('<span>3</span>')
  })

  it('renderiza o compositor com botões reais de ação (Marcar @, Anexar, Vincular Tarefa, Enviar)', () => {
    const html = renderToStaticMarkup(
      <ChatPage
        data={mockData}
        demoMode={true}
        canAdmin={true}
        canManageTeam={() => true}
      />
    )

    expect(html).toContain('title="Mencionar membro (@)"')
    expect(html).toContain('title="Anexar arquivo (até 10 MB)"')
    expect(html).toContain('aria-label="Vincular tarefa"')
    expect(html).toContain('Enviar')
  })
})
