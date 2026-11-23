import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Dashboard from './Dashboard'
import { demoData } from './demo'
import { taskBuckets } from './lib'
import type { Data, DashboardFilter } from './App'

describe('QA: Dashboard Aprimorado do OPSHUB', () => {
  const adminProfile = demoData.profiles[0] // Administrador Master
  const dummyOpenMetric = (_: Exclude<DashboardFilter, null>) => {}
  const dummyOnTask = () => {}
  const dummyPerson = (id?: string | null) => demoData.profiles.find(p => p.id === id)
  const dummyTeam = (id: string) => demoData.teams.find(t => t.id === id)
  const dummyStage = (id: string) => demoData.stages.find(s => s.id === id)
  const dummyNewTask = () => {}
  const dummyNavigatePage = () => {}
  const dummyNavigateBoard = () => {}

  const defaultBuckets = taskBuckets(
    demoData.tasks,
    demoData.stages,
    adminProfile.id,
    demoData.boardStages
  )

  it('renderiza o cabeçalho com saudação e ações rápidas (+ Nova Tarefa, Ver Tarefas, Relatórios)', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
        onNewTask={dummyNewTask}
        onNavigateToPage={dummyNavigatePage}
        onNavigateToBoard={dummyNavigateBoard}
      />
    )

    expect(html).toContain('dashboard-heading')
    expect(html).toContain('Administrador')
    expect(html).toContain('Nova Tarefa')
    expect(html).toContain('Ver Tarefas')
    expect(html).toContain('Relatórios')
  })

  it('renderiza a barra de seletor de escopo do dashboard com todos os quadros acessíveis', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
      />
    )

    expect(html).toContain('dashboard-scope-bar')
    expect(html).toContain('Escopo do Dashboard:')
    expect(html).toContain('Todos os meus quadros (Consolidado)')
    expect(html).toContain('Quadro Geral (Canônico)')
    expect(html).toContain('Suporte N1')
    expect(html).toContain('App Mobile')
  })

  it('renderiza os 5 cartões de métricas rápidas com valores coerentes', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
      />
    )

    expect(html).toContain('Minhas tarefas')
    expect(html).toContain('Atrasadas')
    expect(html).toContain('Próximas do prazo')
    expect(html).toContain('Bloqueadas')
    expect(html).toContain('Concluídas na semana')
  })

  it('renderiza o widget de Sprint Ativa (Scrum) com meta, pontos e progresso', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
        onNavigateToBoard={dummyNavigateBoard}
      />
    )

    expect(html).toContain('dashboard-sprint-widget')
    expect(html).toContain('Sprint Ativa')
    expect(html).toContain('Sprint 14 - Biometria e Push')
    expect(html).toContain('Acessar Sprint')
    expect(html).toContain('Story Points')
  })

  it('renderiza o painel de Atividade Recente e Panorama do Fluxo', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
      />
    )

    expect(html).toContain('Atividade recente')
    expect(html).toContain('recent-list')
    expect(html).toContain('Panorama do fluxo')
    expect(html).toContain('progress-number')
    expect(html).toContain('tarefas em andamento')
  })

  it('renderiza a lista de Suas Prioridades com chip do quadro e badges de prioridade', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
      />
    )

    expect(html).toContain('Suas prioridades')
    expect(html).toContain('priority-list')
    expect(html).toContain('priority-board-chip')
  })

  it('renderiza o painel de distribuição por equipe para perfil administrador / gestor', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        data={demoData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
      />
    )

    expect(html).toContain('team-load-panel')
    expect(html).toContain('Distribuição por Equipe')
    expect(html).toContain('Comercial')
    expect(html).toContain('Desenvolvimento')
  })

  it('renderiza alerta visual quando houver etapa que ultrapassou o limite WIP', () => {
    // Injeta propositalmente uma tarefa extra na etapa 'bstage-sup-2' (limite wip: 2) para estourar o limite
    const overloadedData = {
      ...demoData,
      tasks: [
        ...demoData.tasks,
        {
          id: 'tarefa-sup-overflow-1',
          title: 'Chamado Extra 1',
          description: '',
          stage_id: 'bstage-sup-2',
          team_id: 'desenvolvimento',
          assignee_id: 'demo-diego',
          client_id: 'aurora',
          priority: 'alta' as const,
          due_at: '2026-11-20',
          tags: ['wip'],
          completed_at: null,
          created_by: adminProfile.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          board_id: 'board-suporte-n1',
          sprint_id: null,
        },
      ],
    }

    const html = renderToStaticMarkup(
      <Dashboard
        data={overloadedData as unknown as Data}
        profile={adminProfile}
        dashboard={defaultBuckets}
        openMetric={dummyOpenMetric}
        onTask={dummyOnTask}
        person={dummyPerson}
        team={dummyTeam}
        stage={dummyStage}
        onNavigateToBoard={dummyNavigateBoard}
      />
    )

    expect(html).toContain('dashboard-wip-alert')
    expect(html).toContain('Atenção ao fluxo:')
    expect(html).toContain('Suporte N1 · Em andamento')
  })
})
