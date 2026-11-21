import { describe, expect, it } from 'vitest'
import {
  buildBoardSummaryCsv,
  buildReport,
  computeTaskStatus,
  isTaskOverdue,
  reportCsvCell,
  reportStatus,
  resolveTaskStage,
} from './reports'
import type { ReportFilters } from './reports'
import type { Board, Sprint, Stage, Task } from './lib'
import { demoData } from './demo'

const stages: Stage[] = [
  { id: 'doing', name: 'Desenvolvimento', position: 0, color: '#3b82f6', is_final: false, is_pause: false },
  { id: 'done', name: 'Concluído', position: 1, color: '#10b981', is_final: true, is_pause: false },
  { id: 'paused', name: 'Pausado', position: 2, color: '#f59e0b', is_final: false, is_pause: true },
]
const filters: ReportFilters = { from: '', to: '', teamId: '', assigneeId: '', clientId: '', status: 'all' }
const today = '2026-11-09'

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    team_id: 'comercial',
    assignee_id: 'ana',
    client_id: 'cliente-a',
    stage_id: 'doing',
    priority: 'media',
    due_at: '2026-11-12',
    tags: [],
    completed_at: null,
    created_by: 'ana',
    created_at: '2026-11-05T12:00:00Z',
    updated_at: '2026-11-05T12:00:00Z',
    board_id: null,
    sprint_id: null,
    ...overrides,
  }
}

describe('relatório de tarefas: regras básicas', () => {
  it('usa a etapa para concluir e reabrir, ignorando uma data de conclusão antiga', () => {
    const finished = task('final', { stage_id: 'done', completed_at: '2026-11-08T12:00:00Z' })
    const reopened = task('reaberta', { stage_id: 'doing', completed_at: '2026-11-08T12:00:00Z' })
    const report = buildReport([finished, reopened], stages, filters, today)
    expect(report.totals).toMatchObject({ all: 2, active: 1, done: 1 })
    expect(reportStatus(reopened, stages, today)).toBe('active')
    expect(buildReport([finished, reopened], stages, { ...filters, status: 'done' }, today).rows.map(row => row.id)).toEqual(['final'])
  })

  it('conta uma tarefa pausada com status exclusivo blocked e indicador extra overdue', () => {
    const paused = task('pausada', { stage_id: 'paused', due_at: '2026-11-02' })
    const report = buildReport([paused], stages, filters, today)
    // Status mutuamente exclusivos: active(0) + done(0) + blocked(1) + backlog(0) = all(1)
    expect(report.totals).toMatchObject({ all: 1, active: 0, done: 0, blocked: 1, backlog: 0, overdue: 1 })
    expect(report.totals.active + report.totals.done + report.totals.blocked + report.totals.backlog).toBe(report.totals.all)
    expect(buildReport([paused], stages, { ...filters, status: 'overdue' }, today).rows).toHaveLength(1)
    expect(buildReport([paused], stages, { ...filters, status: 'blocked' }, today).rows).toHaveLength(1)
    expect(buildReport([paused], stages, { ...filters, status: 'active' }, today).rows).toHaveLength(0)
  })

  it('aplica período inclusivo, equipe, responsável e cliente antes dos totais', () => {
    const tasks = [
      task('alvo', { created_at: '2026-11-09T23:59:59Z' }),
      task('outra-equipe', { team_id: 'design' }),
      task('outro-responsavel', { assignee_id: 'bruno' }),
      task('outro-cliente', { client_id: 'cliente-b' }),
      task('fora-periodo', { created_at: '2026-11-10T00:00:00Z' }),
    ]
    const report = buildReport(tasks, stages, { ...filters, from: '2026-11-09', to: '2026-11-09', teamId: 'comercial', assigneeId: 'ana', clientId: 'cliente-a' }, today)
    expect(report.rows.map(row => row.id)).toEqual(['alvo'])
    expect(report.totals.all).toBe(1)
    expect(report.teamCounts.get('comercial')).toBe(1)
  })

  it('impede fórmulas em células CSV sem perder aspas do texto', () => {
    expect(reportCsvCell('=IMPORTXML("site")')).toBe('"\'=IMPORTXML(""site"")"')
    expect(reportCsvCell('Projeto "Aurora"')).toBe('"Projeto ""Aurora"""')
  })

  it('permite filtrar tarefas por data de conclusão ou de prazo', () => {
    const t1 = task('concluida-mes-atual', {
      created_at: '2026-10-01T10:00:00Z',
      stage_id: 'done',
      completed_at: '2026-11-05T15:00:00Z',
    })
    const t2 = task('concluida-mes-passado', {
      created_at: '2026-09-01T10:00:00Z',
      stage_id: 'done',
      completed_at: '2026-10-25T15:00:00Z',
    })
    const reportCompleted = buildReport([t1, t2], stages, {
      ...filters,
      dateField: 'completed',
      from: '2026-11-01',
      to: '2026-11-30',
    }, today)
    expect(reportCompleted.rows.map(r => r.id)).toEqual(['concluida-mes-atual'])
  })

  it('filtra tarefas por prazo (dateField: due) dentro do intervalo informado', () => {
    const dentroDoIntervalo = task('prazo-novembro', {
      due_at: '2026-11-10',
      created_at: '2026-10-01T08:00:00Z',
    })
    const foraDoIntervalo = task('prazo-dezembro', {
      due_at: '2026-12-01',
      created_at: '2026-10-01T08:00:00Z',
    })
    const semPrazo = task('sem-prazo', {
      due_at: null,
      created_at: '2026-10-01T08:00:00Z',
    })
    const reportDue = buildReport(
      [dentroDoIntervalo, foraDoIntervalo, semPrazo],
      stages,
      { ...filters, dateField: 'due', from: '2026-11-01', to: '2026-11-30' },
      today,
    )
    expect(reportDue.rows.map(r => r.id)).toEqual(['prazo-novembro'])
    expect(reportDue.rows.some(r => r.id === 'sem-prazo')).toBe(false)
  })
})

describe('Regras de Concordância e Dimensão de Quadros (Critérios de Aceite)', () => {
  const demoToday = '2026-11-11'

  it('critério 1: soma exatamente 33 tarefas em Todos os meus quadros (17 Geral + 3 Suporte N1 + 6 App Mobile + 3 Comercial + 4 Implantação, sendo 1 ramificação)', () => {
    const report = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'all' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    // Total líquido de todas as tarefas nos quadros (inclui a ramificação no destino)
    expect(report.totals.all).toBe(33)
    expect(report.totals.branchesCount).toBe(1)
    // O total de jornadas únicas desconsidera inflação por ramificação (root_task_id)
    expect(report.totals.journeys).toBe(32)

    // Verificação de linhas do resumo por quadro
    const summaryGeral = report.boardSummaries.find(b => b.boardId === 'board-geral-legado')
    const summarySup = report.boardSummaries.find(b => b.boardId === 'board-suporte-n1')
    const summaryApp = report.boardSummaries.find(b => b.boardId === 'board-app-mobile')
    const summaryCom = report.boardSummaries.find(b => b.boardId === 'board-comercial-funil')
    const summaryImp = report.boardSummaries.find(b => b.boardId === 'board-implantacao')

    expect(summaryGeral).toBeDefined()
    expect(summaryGeral?.total).toBe(17)

    expect(summarySup).toBeDefined()
    expect(summarySup?.total).toBe(3)

    expect(summaryApp).toBeDefined()
    expect(summaryApp?.total).toBe(6)

    expect(summaryCom).toBeDefined()
    expect(summaryCom?.total).toBe(3)

    expect(summaryImp).toBeDefined()
    expect(summaryImp?.total).toBe(4) // 3 nativas + 1 ramificada de Comercial

    // Soma das tarefas dos quadros independentes bate com o total geral
    const somaQuadros =
      (summaryGeral?.total || 0) +
      (summarySup?.total || 0) +
      (summaryApp?.total || 0) +
      (summaryCom?.total || 0) +
      (summaryImp?.total || 0)
    expect(somaQuadros).toBe(33)
  })

  it('critério 1.1: filtro hideBranches oculta ramificações e totaliza as 32 jornadas originais', () => {
    const reportSemRamificacoes = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'all', hideBranches: true },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    expect(reportSemRamificacoes.totals.all).toBe(32)
    expect(reportSemRamificacoes.totals.branchesCount).toBe(0)
    expect(reportSemRamificacoes.totals.journeys).toBe(32)

    const summaryImp = reportSemRamificacoes.boardSummaries.find(b => b.boardId === 'board-implantacao')
    expect(summaryImp?.total).toBe(3) // 3 nativas (ramificação ocultada)
  })

  it('critério 2: relatórios consideram apenas quadros reais ativos e excluem visões de setor do resumo consolidado', () => {
    const report = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'all' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    // Visão comercial (sector_view) não entra na lista de quadros reais
    const summaryComercial = report.boardSummaries.find(b => b.boardId === 'board-comercial')
    expect(summaryComercial).toBeUndefined()

    // O total das linhas do resumo por quadro fecha exatamente com o total consolidado (33 tarefas)
    const totalSomaQuadros = report.boardSummaries.reduce((acc, row) => acc + row.total, 0)
    expect(totalSomaQuadros).toBe(33)
    expect(totalSomaQuadros).toBe(report.totals.all)
  })

  it('critério 3: status mutuamente exclusivos somam exatamente o total (active + done + blocked + backlog = all)', () => {
    const report = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'all' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    const { all, active, done, blocked, backlog } = report.totals
    expect(active + done + blocked + backlog).toBe(all)
  })

  it('critério 4: nenhuma tarefa do demoData cai no fallback "Etapa sem identificação" ou "Etapa removida"', () => {
    for (const task of demoData.tasks) {
      const stage = resolveTaskStage(task, demoData.stages, demoData.boardStages)
      expect(stage.name).not.toBe('Etapa sem identificação')
      expect(stage.name).not.toBe('Etapa removida')
      expect(stage.id).toBeTruthy()
    }
  })

  it('critério 5: tarefa-sup-3 e tarefa-app-3 contam como Concluídas nos relatórios', () => {
    const sup3 = demoData.tasks.find(t => t.id === 'tarefa-sup-3')
    const app3 = demoData.tasks.find(t => t.id === 'tarefa-app-3')
    expect(sup3).toBeDefined()
    expect(app3).toBeDefined()

    if (sup3 && app3) {
      const statusSup3 = reportStatus(sup3, demoData.stages, demoToday, demoData.boardStages, demoData.boards, demoData.sprints)
      const statusApp3 = reportStatus(app3, demoData.stages, demoToday, demoData.boardStages, demoData.boards, demoData.sprints)

      expect(statusSup3).toBe('done')
      expect(statusApp3).toBe('done')
    }

    // Filtrando apenas concluídas, ambas devem estar nas rows
    const doneReport = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, status: 'done' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )
    const doneIds = doneReport.rows.map(r => r.id)
    expect(doneIds).toContain('tarefa-sup-3')
    expect(doneIds).toContain('tarefa-app-3')
  })

  it('critério 6: total por etapa no relatório é igual ao número de cards da coluna correspondente', () => {
    // Para o quadro Suporte N1
    const reportSup = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'board-suporte-n1' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    const etapasSuporte = demoData.boardStages.filter(s => s.board_id === 'board-suporte-n1')
    for (const etapa of etapasSuporte) {
      const cardsNaColuna = demoData.tasks.filter(t => t.board_id === 'board-suporte-n1' && t.stage_id === etapa.id).length
      const contagemNoRelatorio = reportSup.stageCounts.get(etapa.id)?.count || 0
      expect(contagemNoRelatorio).toBe(cardsNaColuna)
    }

    // Para o quadro Geral
    const reportGeral = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'board-geral' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints,
    )

    for (const etapa of demoData.stages) {
      const cardsNoGeral = demoData.tasks.filter(
        t => (!t.board_id || t.board_id === 'board-geral') && t.stage_id === etapa.id
      ).length
      const contagemNoRelatorio = reportGeral.stageCounts.get(etapa.id)?.count || 0
      expect(contagemNoRelatorio).toBe(cardsNoGeral)
    }
  })

  it('critério 7: teste de borda de prazos no fuso America/Fortaleza (ontem é atrasada; hoje e amanhã NÃO são atrasadas)', () => {
    const fusoReferenceToday = '2026-11-11'

    const tOntem = task('t-ontem', { due_at: '2026-11-10', stage_id: 'doing' })
    const tHoje = task('t-hoje', { due_at: '2026-11-11', stage_id: 'doing' })
    const tAmanha = task('t-amanha', { due_at: '2026-11-12', stage_id: 'doing' })
    const tOntemConcluida = task('t-ontem-concluida', { due_at: '2026-11-10', stage_id: 'done' })

    const statusDoing = computeTaskStatus(tOntem, { id: 'doing', name: 'Dev', color: '#000', isFinal: false, isPause: false }, undefined)
    const statusDone = computeTaskStatus(tOntemConcluida, { id: 'done', name: 'Done', color: '#000', isFinal: true, isPause: false }, undefined)

    // Ontem: vencida estritamente menor que hoje
    expect(isTaskOverdue(tOntem, statusDoing, fusoReferenceToday)).toBe(true)

    // Hoje: NÃO é atrasada (o usuário tem até o fim do dia)
    expect(isTaskOverdue(tHoje, statusDoing, fusoReferenceToday)).toBe(false)

    // Amanhã: NÃO é atrasada
    expect(isTaskOverdue(tAmanha, statusDoing, fusoReferenceToday)).toBe(false)

    // Concluída com prazo anterior: NÃO é atrasada
    expect(isTaskOverdue(tOntemConcluida, statusDone, fusoReferenceToday)).toBe(false)
  })

  it('critério 8: tratamento de Backlog e Sprints no Scrum', () => {
    const scrumBoard: Board = {
      id: 'board-scrum',
      name: 'Scrum Dev',
      description: '',
      type: 'custom',
      methodology: 'scrum',
      team_id: 'desenvolvimento',
      is_shared: true,
      stage_ids: [],
      position: 0,
      created_by: 'admin',
      created_at: '',
      updated_at: '',
    }

    const sprints: Sprint[] = [
      { id: 'sp-active', board_id: 'board-scrum', name: 'Sprint Ativa', goal: '', start_date: '2026-11-01', end_date: '2026-11-15', status: 'active', created_at: '', updated_at: '' },
      { id: 'sp-planning', board_id: 'board-scrum', name: 'Sprint Planejada', goal: '', start_date: '2026-11-16', end_date: '2026-11-30', status: 'planning', created_at: '', updated_at: '' },
    ]

    const stageDoing = { id: 's-dev', name: 'Dev', color: '#000', isFinal: false, isPause: false }

    const taskSemSprint = task('t-sem-sprint', { board_id: 'board-scrum', sprint_id: null })
    const taskSprintPlanejada = task('t-sprint-planejada', { board_id: 'board-scrum', sprint_id: 'sp-planning' })
    const taskSprintAtiva = task('t-sprint-ativa', { board_id: 'board-scrum', sprint_id: 'sp-active' })

    // Tarefa sem sprint vira backlog
    expect(computeTaskStatus(taskSemSprint, stageDoing, scrumBoard, sprints)).toBe('backlog')

    // Tarefa em sprint planejada ainda não começou, entra como backlog (Sprint planejada)
    expect(computeTaskStatus(taskSprintPlanejada, stageDoing, scrumBoard, sprints)).toBe('backlog')

    // Tarefa em sprint ativa entra como active
    expect(computeTaskStatus(taskSprintAtiva, stageDoing, scrumBoard, sprints)).toBe('active')

    // Filtro de escopo: Apenas sprint ativa deve excluir as tarefas de backlog
    const tasksScrum = [taskSemSprint, taskSprintPlanejada, taskSprintAtiva]
    const reportAllScrum = buildReport(tasksScrum, stages, { ...filters, boardId: 'board-scrum', scrumScope: 'all' }, today, [], [scrumBoard], sprints)
    expect(reportAllScrum.totals.all).toBe(3)
    expect(reportAllScrum.totals.backlog).toBe(2)
    expect(reportAllScrum.totals.active).toBe(1)

    const reportActiveOnly = buildReport(tasksScrum, stages, { ...filters, boardId: 'board-scrum', scrumScope: 'active_sprint' }, today, [], [scrumBoard], sprints)
    expect(reportActiveOnly.totals.all).toBe(1)
    expect(reportActiveOnly.totals.active).toBe(1)
    expect(reportActiveOnly.totals.backlog).toBe(0)
    expect(reportActiveOnly.rows.map(r => r.id)).toEqual(['t-sprint-ativa'])
  })

  it('critério 9: auditoria de segurança e IDOR (quadro privado de outra equipe não vaza nos relatórios)', () => {
    // Simula usuário restrito à equipe comercial
    const userTeams = new Set(['comercial'])
    const userId = 'user-comercial-1'

    const allBoards: Board[] = [
      { id: 'board-geral', name: 'Geral', description: '', type: 'general', methodology: 'kanban', team_id: null, is_shared: true, stage_ids: [], position: 0, created_by: 'system', created_at: '', updated_at: '' },
      { id: 'board-comercial', name: 'Comercial', description: '', type: 'sector_view', methodology: 'kanban', team_id: 'comercial', is_shared: true, stage_ids: [], position: 1, created_by: userId, created_at: '', updated_at: '' },
      { id: 'board-dev-secreto', name: 'Dev Confidencial', description: '', type: 'custom', methodology: 'kanban', team_id: 'desenvolvimento', is_shared: false, stage_ids: [], position: 2, created_by: 'outro-user', created_at: '', updated_at: '' },
    ]

    const allTasks: Task[] = [
      task('t-geral', { board_id: 'board-geral', team_id: 'comercial' }),
      task('t-dev-secreta', { board_id: 'board-dev-secreto', team_id: 'desenvolvimento' }),
    ]

    // RLS filtra os quadros permitidos para o usuário antes de entregar à camada de relatórios
    const allowedBoards = allBoards.filter(b => {
      if (b.is_shared) return true
      if (b.created_by === userId) return true
      if (b.team_id && userTeams.has(b.team_id)) return true
      return false
    })

    // RLS filtra as tarefas das equipes autorizadas
    const allowedTasks = allTasks.filter(t => userTeams.has(t.team_id))

    const report = buildReport(allowedTasks, stages, { ...filters, boardId: 'all' }, today, [], allowedBoards)

    // O quadro confidencial de Dev não deve aparecer nos resumos nem nas tarefas
    expect(report.boardSummaries.some(b => b.boardId === 'board-dev-secreto')).toBe(false)
    expect(report.boardSummaries.some(b => b.boardName === 'Dev Confidencial')).toBe(false)
    expect(report.rows.some(r => r.id === 't-dev-secreta')).toBe(false)
    expect(report.totals.all).toBe(1)
  })

  it('critério 10: calcula porcentagem de progresso e story points corretamente por quadro e total consolidado', () => {
    const scrumBoard: Board = {
      id: 'board-scrum-test',
      name: 'Time Scrum',
      description: '',
      type: 'custom',
      methodology: 'scrum',
      team_id: 'comercial',
      is_shared: true,
      stage_ids: [],
      position: 1,
      created_by: 'system',
      created_at: '',
      updated_at: '',
    }
    const kanbanBoard: Board = {
      id: 'board-kanban-test',
      name: 'Time Kanban',
      description: '',
      type: 'custom',
      methodology: 'kanban',
      team_id: 'comercial',
      is_shared: true,
      stage_ids: [],
      position: 2,
      created_by: 'system',
      created_at: '',
      updated_at: '',
    }

    const testTasks: Task[] = [
      // Scrum: 3 tarefas, total 13 story points, 1 concluída (5 pts) -> 33% progresso
      task('scrum-1', { board_id: 'board-scrum-test', stage_id: 'done', story_points: 5 }),
      task('scrum-2', { board_id: 'board-scrum-test', stage_id: 'doing', story_points: 3 }),
      task('scrum-3', { board_id: 'board-scrum-test', stage_id: 'doing', story_points: 5 }),
      // Kanban: 2 tarefas, 2 concluídas -> 100% progresso, story_points 0
      task('kanban-1', { board_id: 'board-kanban-test', stage_id: 'done', story_points: 0 }),
      task('kanban-2', { board_id: 'board-kanban-test', stage_id: 'done', story_points: 0 }),
    ]

    const report = buildReport(
      testTasks,
      stages,
      { ...filters, boardId: 'all' },
      today,
      [],
      [scrumBoard, kanbanBoard]
    )

    const scrumRow = report.boardSummaries.find(b => b.boardId === 'board-scrum-test')
    expect(scrumRow).toBeDefined()
    expect(scrumRow?.total).toBe(3)
    expect(scrumRow?.done).toBe(1)
    expect(scrumRow?.progressPercent).toBe(33) // 1/3 = 33%
    expect(scrumRow?.totalStoryPoints).toBe(13)
    expect(scrumRow?.doneStoryPoints).toBe(5)

    const kanbanRow = report.boardSummaries.find(b => b.boardId === 'board-kanban-test')
    expect(kanbanRow).toBeDefined()
    expect(kanbanRow?.total).toBe(2)
    expect(kanbanRow?.done).toBe(2)
    expect(kanbanRow?.progressPercent).toBe(100) // 2/2 = 100%
    expect(kanbanRow?.totalStoryPoints).toBe(0)
    expect(kanbanRow?.doneStoryPoints).toBe(0)

    // Total consolidado: 5 tarefas, 3 concluídas -> 60%
    expect(report.totals.all).toBe(5)
    expect(report.totals.done).toBe(3)
    expect(report.totals.progressPercent).toBe(60)
    expect(report.totals.totalStoryPoints).toBe(13)
    expect(report.totals.doneStoryPoints).toBe(5)
  })

  it('critério 11: gera CSV de resumo por quadro seguro com BOM UTF-8 e cabeçalhos completos', () => {
    const report = buildReport(
      demoData.tasks,
      demoData.stages,
      { ...filters, boardId: 'all' },
      demoToday,
      demoData.boardStages,
      demoData.boards,
      demoData.sprints
    )

    const csv = buildBoardSummaryCsv(report.boardSummaries, report.totals)

    // Deve começar com BOM UTF-8
    expect(csv.startsWith('\uFEFF')).toBe(true)

    // Cabeçalhos essenciais presentes
    expect(csv).toContain('Quadro;Tipo;Metodologia;Visão;Total;Em andamento;Pausadas;Backlog;Concluídas;Atrasadas;Progresso (%);Story Points Concluídos;Story Points Totais')

    // Deve conter linhas de quadros e a linha de total
    expect(csv).toContain('"Geral (legado)"')
    expect(csv).toContain('"TOTAL CONSOLIDADO"')
    expect(csv).toContain('Scrum')
    expect(csv).toContain('Kanban')
  })
})
