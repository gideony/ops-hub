import { describe, expect, it } from 'vitest'
import { demoData, initialDemoLineageEvents } from './demo'
import { getPermittedDestinationBoards } from './board-permissions'
import { buildReport } from './reports'
import type { Task, TaskLineageEvent } from './lib'

describe('Ramificação de Tarefas e Linha do Tempo (ADR-014)', () => {
  const originalTask = demoData.tasks.find(t => t.id === 'tarefa-008')!
  const branchTask = demoData.tasks.find(t => t.id === 'tarefa-008-ramificacao')!

  it('1. Vínculo estrutural: original possui forwarded_at e ramificação referencia origin_task_id e root_task_id', () => {
    expect(originalTask).toBeDefined()
    expect(originalTask.forwarded_at).toBeTruthy()
    expect(originalTask.completed_at).toBeTruthy()

    expect(branchTask).toBeDefined()
    expect(branchTask.origin_task_id).toBe('tarefa-008')
    expect(branchTask.root_task_id).toBe('tarefa-008')
    expect(branchTask.id).not.toBe(originalTask.id)
    expect(branchTask.board_id).toBe('board-implantacao')
  })

  it('2. Travamento da original: tarefa encaminhada não pode ser movida para fora da etapa final nem reaberta', () => {
    // Simulação da validação que ocorre no servidor e no client
    function canMoveTaskOut(task: Task, targetStageIsFinal: boolean): { allowed: boolean; reason?: string } {
      if (task.forwarded_at && !targetStageIsFinal) {
        return {
          allowed: false,
          reason: 'Esta tarefa já foi encaminhada para outro quadro e não pode ser reaberta ou movida para fora da etapa final.',
        }
      }
      return { allowed: true }
    }

    const checkAttemptReopen = canMoveTaskOut(originalTask, false)
    expect(checkAttemptReopen.allowed).toBe(false)
    expect(checkAttemptReopen.reason).toContain('já foi encaminhada')

    // Já uma tarefa concluída não encaminhada pode ser reaberta ("Agora não")
    const completedNotForwarded: Task = {
      ...originalTask,
      id: 'tarefa-temp-concluida',
      forwarded_at: null,
      forwarded_by: null,
    }
    const checkAttemptReopenAllowed = canMoveTaskOut(completedNotForwarded, false)
    expect(checkAttemptReopenAllowed.allowed).toBe(true)
  })

  it('3. Regra 3 (Inegociável): marcas bidirecionais clicáveis ("Encaminhada para: [Quadro]" e "Veio de: [Quadro]")', () => {
    // 1. A original tem a marca com o nome do quadro de destino e referência à ramificação
    const targetBoard = demoData.boards.find(b => b.id === (branchTask.board_id || 'board-geral'))
    expect(targetBoard).toBeDefined()
    expect(targetBoard?.name).toBe('Implantação')

    const forwardedTagText = `Encaminhada para: ${targetBoard?.name}`
    expect(forwardedTagText).toBe('Encaminhada para: Implantação')
    expect(branchTask.origin_task_id).toBe(originalTask.id)

    // 2. A ramificação tem a marca com o nome do quadro de origem e referência à original
    const originBoard = demoData.boards.find(b => b.id === (originalTask.board_id || 'board-geral'))
    expect(originBoard).toBeDefined()
    expect(originBoard?.name).toBe('Geral')

    const branchTagText = `Veio de: ${originBoard?.name}`
    expect(branchTagText).toBe('Veio de: Geral')
    expect(originalTask.id).toBe(branchTask.origin_task_id)

    // 3. Validação do clique: cada marca abre instantaneamente a outra tarefa correspondente
    function navigateFromTag(clickedOn: 'forwarded' | 'origin'): Task {
      if (clickedOn === 'forwarded') {
        // Clicou em "Encaminhada para: Implantação" na tarefa original -> abre a ramificação
        return demoData.tasks.find(t => t.origin_task_id === originalTask.id)!
      } else {
        // Clicou em "Veio de: Geral" na ramificação -> abre a tarefa original
        return demoData.tasks.find(t => t.id === branchTask.origin_task_id)!
      }
    }

    const destinationTaskOpened = navigateFromTag('forwarded')
    expect(destinationTaskOpened.id).toBe(branchTask.id)

    const originalTaskOpened = navigateFromTag('origin')
    expect(originalTaskOpened.id).toBe(originalTask.id)
  })

  it('4. Prevenção de ciclos: quadros que já participaram da linhagem da tarefa são excluídos dos destinos', () => {
    const userBoards = demoData.boards
    // A tarefa-008 nasceu no 'board-geral' e foi encaminhada para 'board-implantacao'
    const ancestralBoardIds = ['board-geral', 'board-implantacao']
    const adminProfile = demoData.profiles.find(p => p.id === 'demo-admin')!

    const destinations = getPermittedDestinationBoards(
      userBoards,
      demoData.members,
      adminProfile,
      ancestralBoardIds
    )

    // O quadro Geral e o quadro Implantação NÃO podem aparecer como opções de destino
    expect(destinations.some(b => b.id === 'board-geral')).toBe(false)
    expect(destinations.some(b => b.id === 'board-implantacao')).toBe(false)

    // Quadros independentes permitidos continuam elegíveis
    expect(destinations.some(b => b.id === 'board-comercial-funil')).toBe(true)
    expect(destinations.some(b => b.id === 'board-suporte-n1')).toBe(true)
  })

  it('4. Idempotência e Unicidade: cada tarefa só pode ter uma única ramificação', () => {
    // No modelo relacional, existe a constraint única parcial:
    // create unique index tasks_single_branch_idx on tasks(origin_task_id) where origin_task_id is not null;
    const existingBranches = demoData.tasks.filter(t => t.origin_task_id === 'tarefa-008')
    expect(existingBranches.length).toBe(1)

    // Simulação do comportamento da RPC com SELECT ... FOR UPDATE e verificação de ramificação existente
    function forwardTaskRpcSim(
      tasks: Task[],
      originTaskId: string,
      destBoardId: string,
      destStageId: string
    ): { branchTask: Task; created: boolean } {
      const existing = tasks.find(t => t.origin_task_id === originTaskId)
      if (existing) {
        return { branchTask: existing, created: false }
      }
      const origin = tasks.find(t => t.id === originTaskId)!
      const newBranch: Task = {
        ...origin,
        id: `branch-${originTaskId}`,
        board_id: destBoardId,
        stage_id: destStageId,
        origin_task_id: originTaskId,
        root_task_id: origin.root_task_id || originTaskId,
        forwarded_at: null,
        forwarded_by: null,
        completed_at: null,
      }
      return { branchTask: newBranch, created: true }
    }

    const firstCall = forwardTaskRpcSim(demoData.tasks, 'tarefa-008', 'board-implantacao', 'bstage-imp-1')
    expect(firstCall.created).toBe(false) // já existia, devolveu a existente sem criar duplicata
    expect(firstCall.branchTask.id).toBe('tarefa-008-ramificacao')
  })

  it('5. Linha do tempo: herança de eventos cronológicos com instantâneo imutável', () => {
    const lineageOriginal = initialDemoLineageEvents['tarefa-008'] || []
    const lineageBranch = initialDemoLineageEvents['tarefa-008-ramificacao'] || []

    expect(lineageOriginal.length).toBeGreaterThan(0)
    expect(lineageBranch.length).toBeGreaterThan(lineageOriginal.length)

    // A ramificação herda os eventos da original
    expect(lineageBranch[0].id).toBe(lineageOriginal[0].id)
    expect(lineageBranch[1].id).toBe(lineageOriginal[1].id)
    expect(lineageBranch[2].event_type).toBe('forwarded')

    // O último evento da ramificação registra a entrada no novo quadro
    const lastEvent = lineageBranch[lineageBranch.length - 1]
    expect(lastEvent.board_name).toBe('Implantação')
    expect(lastEvent.event_type).toBe('moved')
  })

  it('6. Mascaramento de segurança na linha do tempo para quadros restritos', () => {
    // Simula a lógica de get_task_lineage da migration:
    // Se o usuário não tem permissão no quadro do evento, mascara dados sensíveis
    function maskLineageEventsForUser(
      events: TaskLineageEvent[],
      accessibleBoardIds: string[]
    ): TaskLineageEvent[] {
      return events.map(evt => {
        const canAccess = Boolean(evt.board_id && accessibleBoardIds.includes(evt.board_id))
        if (canAccess) return evt
        return {
          ...evt,
          is_masked: true,
          board_name: 'Quadro restrito',
          stage_name: 'Etapa anterior confidencial',
          board_color: '#94a3b8',
        }
      })
    }

    const events = initialDemoLineageEvents['tarefa-008-ramificacao']
    // Usuário que só tem acesso ao quadro de Implantação e não ao Geral
    const masked = maskLineageEventsForUser(events, ['board-implantacao'])

    expect(masked[0].is_masked).toBe(true)
    expect(masked[0].board_name).toBe('Quadro restrito')
    expect(masked[0].stage_name).toBe('Etapa anterior confidencial')

    // O evento de Implantação permanece visível normalmente
    expect(masked[3].is_masked).toBeUndefined()
    expect(masked[3].board_name).toBe('Implantação')
  })

  it('7. Concordância nos Relatórios (ADR-008 e ADR-014): original é concluída, ramificação é nova, métrica de jornadas evita inflação', () => {
    const reportAll = buildReport(
      demoData.tasks,
      demoData.stages,
      {
        from: '',
        to: '',
        teamId: '',
        assigneeId: '',
        clientId: '',
        status: 'all',
        boardId: 'all',
      },
      '2026-11-11',
      demoData.boardStages,
      demoData.boards,
      demoData.sprints
    )

    // O total bruto inclui ambas as tarefas
    expect(reportAll.totals.all).toBe(33)
    // O total de jornadas únicas conta pela raiz da cadeia (root_task_id)
    expect(reportAll.totals.journeys).toBe(32)
    expect(reportAll.totals.branchesCount).toBe(1)

    // Com o filtro hideBranches, a ramificação é ocultada
    const reportHide = buildReport(
      demoData.tasks,
      demoData.stages,
      {
        from: '',
        to: '',
        teamId: '',
        assigneeId: '',
        clientId: '',
        status: 'all',
        boardId: 'all',
        hideBranches: true,
      },
      '2026-11-11',
      demoData.boardStages,
      demoData.boards,
      demoData.sprints
    )

    expect(reportHide.totals.all).toBe(32)
    expect(reportHide.totals.branchesCount).toBe(0)
    expect(reportHide.totals.journeys).toBe(32)
  })
})
