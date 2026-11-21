import { describe, expect, it, vi } from 'vitest'
import { demoData } from './demo'
import { completed, resolveTaskStage } from './lib'
import type { Task } from './lib'
import { buildReport, reportStatus } from './reports'

describe('PASSO 5: Unificação da Definição de Tarefas Concluídas e Concordância Geral', () => {
  const allStages = [...demoData.stages, ...demoData.boardStages]
  const today = '2026-11-17'

  it('1. Tarefa concluída em quadro personalizado aparece na lista de Concluídas', () => {
    // Tarefa em quadro personalizado (Suporte N1) na etapa Resolvido (is_final: true)
    const customTaskDone = demoData.tasks.find(t => t.id === 'tarefa-sup-3')!
    expect(customTaskDone).toBeDefined()
    expect(customTaskDone.board_id).toBe('board-suporte-n1')

    // Função canônica unificada
    const isDone = completed(customTaskDone, allStages, demoData.boardStages)
    expect(isDone).toBe(true)

    // Filtro da aba de concluídas
    const finishedList = demoData.tasks.filter(t => completed(t, allStages, demoData.boardStages))
    expect(finishedList.some(t => t.id === 'tarefa-sup-3')).toBe(true)
  })

  it('2. Tarefa reaberta (movida para etapa não-final) sai imediatamente da lista de concluídas', () => {
    // Tarefa que estava concluída e possui completed_at antigo, mas foi reaberta para etapa não-final
    const reopenedTask: Task = {
      ...demoData.tasks[0],
      id: 'tarefa-reaberta-teste',
      board_id: 'board-suporte-n1',
      stage_id: 'bstage-sup-2', // 'Em andamento' (is_final: false)
      completed_at: '2026-11-10T10:00:00Z', // timestamp residual
    }

    // Mesmo com completed_at preenchido, a etapa é não-final, portanto NÃO é concluída
    expect(completed(reopenedTask, allStages, demoData.boardStages)).toBe(false)

    const finishedList = [reopenedTask].filter(t => completed(t, allStages, demoData.boardStages))
    expect(finishedList).toHaveLength(0)
  })

  it('3. Tarefa encaminhada continua concluída no quadro de origem', () => {
    const originalTask = demoData.tasks.find(t => t.id === 'tarefa-008')!
    expect(originalTask).toBeDefined()
    expect(originalTask.forwarded_at).toBeTruthy()

    // No quadro de origem (Geral), a tarefa original permanece concluída
    expect(completed(originalTask, allStages, demoData.boardStages)).toBe(true)

    // A ramificação no quadro de destino (Implantação) começa na etapa inicial (Kick-off) e não está concluída
    const branchTask = demoData.tasks.find(t => t.id === 'tarefa-008-ramificacao')!
    expect(branchTask).toBeDefined()
    expect(completed(branchTask, allStages, demoData.boardStages)).toBe(false)
  })

  it('4. Dashboard, Concluídas e Relatórios dão o mesmo total no mesmo escopo', () => {
    const scopes = ['all', 'board-geral', 'board-suporte-n1', 'board-implantacao', 'board-comercial-funil', 'board-app-mobile']

    for (const scope of scopes) {
      // 1. Escopo de tarefas
      const scopedTasks = demoData.tasks.filter(t => {
        if (scope === 'all') return true
        if (scope === 'board-geral') return !t.board_id || t.board_id === 'board-geral'
        return t.board_id === scope
      })

      // 2. Total de concluídas via função canônica (Aba Concluídas / Cards)
      const countCompletedTab = scopedTasks.filter(t => completed(t, allStages, demoData.boardStages)).length

      // 3. Total de concluídas via Relatórios (buildReport)
      const report = buildReport(
        demoData.tasks,
        demoData.stages,
        {
          from: '',
          to: '',
          boardId: scope,
          status: 'all',
          teamId: '',
          assigneeId: '',
          clientId: '',
        },
        today,
        demoData.boardStages,
        demoData.boards,
        demoData.sprints
      )
      const countReports = report.totals.done

      // 4. Total de concluídas via reportStatus individual em cada tarefa do escopo
      const countReportStatus = scopedTasks.filter(t => {
        const st = reportStatus(t, demoData.stages, today, demoData.boardStages, demoData.boards, demoData.sprints)
        return st === 'done'
      }).length

      // 5. Total de concluídas via Dashboard (scopedTasks filtradas por completed)
      const countDashboard = scopedTasks.filter(t => completed(t, allStages, demoData.boardStages)).length

      // Todos devem ser RIGOROSAMENTE IDÊNTICOS!
      expect(countCompletedTab).toBe(countReports)
      expect(countCompletedTab).toBe(countReportStatus)
      expect(countCompletedTab).toBe(countDashboard)
    }
  })

  it('5. Nenhuma tarefa do demo.ts cai no fallback por etapa desconhecida', () => {
    const warnSpy = vi.spyOn(console, 'warn')

    for (const t of demoData.tasks) {
      const info = resolveTaskStage(t, demoData.stages, demoData.boardStages)
      expect(info.name).not.toBe('Etapa sem identificação')
      expect(info.name).not.toBe('Concluída (etapa não identificada)')
      expect(info.id).toBe(t.stage_id)
    }

    // Nenhuma mensagem de aviso de etapa não identificada deve ter sido emitida
    const stageWarnings = warnSpy.mock.calls.filter(args => String(args[0]).includes('[stages]'))
    expect(stageWarnings).toHaveLength(0)
    warnSpy.mockRestore()
  })
})
