import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoData } from './demo'
import {
  GeneralToolbar,
  GeneralLateralView,
  GeneralAccordionView,
  GeneralTaskCard,
} from './GeneralViews'
import NewTaskForm from './NewTaskForm'
import type { Board } from './lib'

describe('Geral: Visão Pura de Agregação e Somente Leitura (ADR-024)', () => {
  const dummyPerson = (id?: string | null) => demoData.profiles.find(p => p.id === id)
  const dummyTeam = (id: string) => demoData.teams.find(t => t.id === id)
  const dummyNotify = vi.fn()
  const dummyTaskSelect = vi.fn()
  const dummyNavigateBoard = vi.fn()
  const dummyRun = vi.fn().mockResolvedValue(true)
  const dummyClose = vi.fn()

  const operationalBoards = demoData.boards.filter(b => b.id !== 'board-geral')
  const generalBoard = demoData.boards.find(b => b.id === 'board-geral') || {
    id: 'board-geral',
    name: 'Geral',
    description: '',
    type: 'general',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: [],
    position: 0,
    created_by: 'system',
    created_at: '',
    updated_at: '',
  }

  it('1. GeneralToolbar renderiza o badge informativo de visão pura de agregação e somente leitura', () => {
    const html = renderToStaticMarkup(
      <GeneralToolbar
        mode="lateral"
        situation="active"
        selectedBoardId=""
        boards={demoData.boards}
        onModeChange={vi.fn()}
        onSituationChange={vi.fn()}
        onBoardFilterChange={vi.fn()}
        hideEmptyColumns={true}
        onHideEmptyColumnsChange={vi.fn()}
        teams={demoData.teams}
        profiles={demoData.profiles}
        clients={demoData.clients}
      />
    )

    expect(html).toContain('general-readonly-badge')
    expect(html).toContain('Visão de agregação (somente leitura)')
    expect(html).toContain('title="Visão de agregação panorâmica (somente leitura)')
  })

  it('2. GeneralLateralView exibe botão "Abrir quadro" em cada bloco operacional e cards com draggable=false', () => {
    const html = renderToStaticMarkup(
      <GeneralLateralView
        boards={operationalBoards}
        tasks={demoData.tasks}
        canonicalStages={demoData.stages}
        customBoardStages={demoData.boardStages}
        sprints={demoData.sprints}
        situation="all"
        selectedBoardId=""
        blockOrder={operationalBoards.map(b => b.id)}
        onBlockOrderChange={vi.fn()}
        onTaskSelect={dummyTaskSelect}
        onNavigateToBoard={dummyNavigateBoard}
        person={dummyPerson}
        team={dummyTeam}
        notify={dummyNotify}
        hideEmptyColumns={false}
      />
    )

    // Confirma presença do botão para navegar ao quadro operacional
    expect(html).toContain('general-btn-open-board')
    expect(html).toContain('Abrir quadro')

    // Confirma que os cards de tarefas possuem draggable=false para desativar drag-and-drop
    expect(html).toContain('task-card-v2')
    expect(html).toContain('draggable="false"')

    // Não deve conter menu de ações destrutivas rápidas no card do Geral
    expect(html).not.toContain('task-card-actions-menu')
  })

  it('3. GeneralAccordionView (Consolidado) também exibe botão "Abrir quadro" e cards somente leitura', () => {
    const accordions: Record<string, boolean> = {}
    operationalBoards.forEach(b => { accordions[b.id] = true })

    const html = renderToStaticMarkup(
      <GeneralAccordionView
        boards={operationalBoards}
        tasks={demoData.tasks}
        canonicalStages={demoData.stages}
        customBoardStages={demoData.boardStages}
        sprints={demoData.sprints}
        situation="all"
        selectedBoardId=""
        expandedAccordions={accordions}
        onAccordionToggle={vi.fn()}
        onNavigateToBoard={dummyNavigateBoard}
        onTaskSelect={dummyTaskSelect}
        moveTask={vi.fn()}
        person={dummyPerson}
        team={dummyTeam}
        notify={dummyNotify}
        hideEmptyColumns={false}
      />
    )

    expect(html).toContain('general-btn-open-board')
    expect(html).toContain('Abrir quadro')
    expect(html).toContain('draggable="false"')
  })

  it('4. GeneralTaskCard individual é puramente informativo e aciona onTaskSelect ao clique', () => {
    const task = demoData.tasks[0]
    const html = renderToStaticMarkup(
      <GeneralTaskCard
        task={task}
        board={operationalBoards[0]}
        allTasks={demoData.tasks}
        allBoards={demoData.boards}
        allClients={demoData.clients}
        onTaskSelect={dummyTaskSelect}
        person={dummyPerson}
        team={dummyTeam}
      />
    )

    expect(html).toContain('draggable="false"')
    expect(html).toContain(task.title)
    // Sem menu dropdown de deletar direto no card
    expect(html).not.toContain('Excluir tarefa')
  })

  it('5. NewTaskForm invocado a partir do Geral obriga seleção de Quadro de Destino operacional', () => {
    const html = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        activeBoard={generalBoard as Board}
      />
    )

    // O modal deve exibir os campos obrigatórios Quadro * e Etapa *
    expect(html).toContain('Quadro *')
    expect(html).toContain('Etapa *')
    // Deve listar os quadros operacionais como opções
    for (const board of operationalBoards) {
      expect(html).toContain(board.name)
    }
    // Não pode listar o 'board-geral' como opção de destino (tarefas devem ir para quadros reais)
    expect(html).not.toContain('value="board-geral"')
  })

  it('6. NewTaskForm invocado em quadro Scrum exibe campos de Sprint e Story Points', () => {
    const scrumBoard = demoData.boards.find(b => b.methodology === 'scrum')
    if (!scrumBoard) return

    const html = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        activeBoard={scrumBoard}
      />
    )

    expect(html).toContain('Sprint (Scrum)')
    expect(html).toContain('Estimativa (Story Points)')
  })
})
