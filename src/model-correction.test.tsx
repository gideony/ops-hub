import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoData } from './demo'
import TemplateTab from './TemplateTab'
import NewTaskForm from './NewTaskForm'
import { BOARD_TEMPLATES } from './BoardModals'
import { buildReport } from './reports'
import { getStagesForBoard } from './general-views'

describe('Correção de Modelo: Geral como Agregação Pura e Modelos de Quadro (ADR-025)', () => {
  it('1. Todas as tarefas do demo pertencem a um quadro real (board_id !== "board-geral" e não nulo)', () => {
    expect(demoData.tasks.length).toBeGreaterThan(0)
    for (const t of demoData.tasks) {
      expect(t.board_id).toBeDefined()
      expect(t.board_id).not.toBeNull()
      expect(t.board_id).not.toBe('board-geral')
    }
  })

  it('2. Existe o quadro "Geral (legado)" com as 15 etapas copiadas e as 17 tarefas legadas preservadas', () => {
    const legacyBoard = demoData.boards.find(b => b.id === 'board-geral-legado')
    expect(legacyBoard).toBeDefined()
    expect(legacyBoard?.name).toBe('Geral (legado)')

    const stages = getStagesForBoard(legacyBoard!, demoData.stages, demoData.boardStages)
    expect(stages.length).toBe(15)

    const legacyTasks = demoData.tasks.filter(t => t.board_id === 'board-geral-legado')
    expect(legacyTasks.length).toBe(17)
  })

  it('3. TemplateTab renderiza os 5 modelos de quadro com suas etapas e metodologias', () => {
    const html = renderToStaticMarkup(
      <TemplateTab
        data={demoData}
        canManage={true}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenCreateBoard={vi.fn()}
      />
    )

    // Deve conter a navegação de subabas
    expect(html).toContain('Modelos de Quadro')
    expect(html).toContain('Templates de Subtarefas')

    // Deve renderizar os 5 modelos pré-definidos
    expect(BOARD_TEMPLATES).toHaveLength(5)
    expect(html).toContain('Em branco')
    expect(html).toContain('Suporte')
    expect(html).toContain('Comercial')
    expect(html).toContain('Implantação')
    expect(html).toContain('Scrum padrão')

    // Deve conter badges de metodologia
    expect(html).toContain('Kanban')
    expect(html).toContain('Scrum')

    // Deve conter atalho para criar quadro
    expect(html).toContain('Criar quadro com este modelo')
  })

  it('4. NewTaskForm proíbe seleção de board-geral e carrega etapas dinamicamente via getStagesForBoard', () => {
    const legacyBoard = demoData.boards.find(b => b.id === 'board-geral-legado')!
    const html = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={vi.fn()}
        run={vi.fn()}
        activeBoard={legacyBoard}
      />
    )

    // Quadro e Etapa obrigatórios
    expect(html).toContain('Quadro *')
    expect(html).toContain('Etapa *')

    // Não contém board-geral como opção selecionável
    expect(html).not.toContain('value="board-geral"')

    // As etapas do quadro Geral (legado) aparecem nas opções
    const stages = getStagesForBoard(legacyBoard, demoData.stages, demoData.boardStages)
    for (const stage of stages.slice(0, 5)) {
      expect(html).toContain(stage.name)
    }
  })

  it('5. Relatórios e Dashboard: buildReport ignora board-geral e setor_view, somando apenas quadros reais', () => {
    const filters = {
      from: '',
      to: '',
      period: 'all' as const,
      teamId: '',
      assigneeId: '',
      clientId: '',
      boardId: 'all',
      status: 'all' as const,
      groupBy: 'none' as const,
      sortBy: 'recent' as const,
      dateField: 'created' as const,
      scrumScope: 'all' as const,
      hideBranches: false,
    }
    const report = buildReport(
      demoData.tasks,
      demoData.stages,
      filters,
      '2026-11-19',
      demoData.boardStages,
      demoData.boards,
      demoData.sprints
    )

    // Nenhum resumo de quadro deve ser do Geral canônico
    const summaryBoards = report.boardSummaries.map(bs => bs.boardId)
    expect(summaryBoards).not.toContain('board-geral')

    // O total consolidado é a soma exata dos quadros reais
    const sumOfBoards = report.boardSummaries.reduce((acc, bs) => acc + bs.total, 0)
    expect(sumOfBoards).toBe(report.totals.all)
    expect(report.totals.all).toBe(demoData.tasks.length)
  })
})
