import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReportsPage from './ReportsPage'
import { demoData } from './demo'
import type { Data } from './App'
import type { Board } from './lib'

describe('QA: Estrutura e Acessibilidade da Tabela de Resumo por Quadro em Relatórios', () => {
  const dummyOnTask = () => {}

  it('renderiza o cabeçalho do painel com ícone inline e descrição abaixo', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    // Cabeçalho deve conter o wrapper inline com o título e o ícone
    expect(html).toContain('reports-title-inline')
    expect(html).toContain('reports-title-icon')
    expect(html).toContain('<h2>Resumo por Quadro</h2>')
    expect(html).toContain('<p>Concordância líquida de tarefas')
  })

  it('renderiza a tabela com o contêiner responsivo e classes semânticas isoladas', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    // Contêiner com rolagem horizontal e tabela com classe dedicada
    expect(html).toContain('table-wrap report-table-wrap')
    expect(html).toContain('data-table reports-summary-table report-board-table')
    // Não deve haver atributo style inline de altura forçada
    expect(html).not.toMatch(/<tr[^>]*style="[^"]*height/i)
    expect(html).not.toMatch(/<td[^>]*style="[^"]*height/i)
  })

  it('renderiza uma <tr> com role="button" e tabIndex="0" para cada quadro independente', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    // Verifica que as linhas clicáveis possuem acessibilidade por teclado
    expect(html).toContain('class="summary-row-clickable"')
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Filtrar pelo quadro')

    // Colunas do Resumo por Quadro simplificado (6 colunas: Quadro, Total, Em andamento, Pausadas, Concluídas, Atrasadas)
    expect(html).toContain('<th>Quadro</th>')
    expect(html).toContain('>Total</th>')
    expect(html).toContain('>Em andamento</th>')
    expect(html).toContain('>Pausadas</th>')
    expect(html).toContain('>Concluídas</th>')
    expect(html).toContain('>Atrasadas</th>')
    expect(html).not.toContain('<th>Tipo / Metodologia</th>')
    expect(html).not.toContain('>Backlog</th>')
    expect(html).toContain('Exportar resumo (CSV)')
  })

  it('renderiza linha de Total Consolidado e linhas de visão por setor', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('summary-row-total')
    expect(html).toContain('TOTAL CONSOLIDADO')
    expect(html).toContain('Soma líquida dos quadros')

    // Visões de setor
    expect(html).toContain('summary-row-mirror')
    expect(html).toContain('Lente do Quadro Geral')
  })

  it('formata colunas numéricas com classe tabular e distingue zeros de valores positivos', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('num-col')
    expect(html).toContain('num-zero')
    // Se houver tarefas atrasadas, exibe com ícone
    expect(html).toContain('text-danger')
  })

  it('renderiza corretamente cenário com exatamente 1 quadro independente', () => {
    const singleBoardData: Data = {
      ...(demoData as unknown as Data),
      boards: [
        {
          id: 'board-unico',
          name: 'Quadro Único',
          type: 'custom',
          methodology: 'kanban',
          is_shared: true,
          created_at: new Date().toISOString(),
          created_by: 'demo-admin'
        } as Board
      ],
      tasks: []
    }

    const html = renderToStaticMarkup(<ReportsPage data={singleBoardData} onTask={dummyOnTask} />)

    expect(html).toContain('Quadro Único')
    expect(html).toContain('TOTAL CONSOLIDADO')
  })

  it('renderiza corretamente cenário com 5 quadros independentes', () => {
    const fiveBoards: Board[] = Array.from({ length: 5 }, (_, i) => ({
      id: `board-${i + 1}`,
      name: `Quadro Operacional ${i + 1}`,
      type: 'custom',
      methodology: i % 2 === 0 ? 'kanban' : 'scrum',
      is_shared: true,
      created_at: new Date().toISOString(),
      created_by: 'demo-admin'
    } as Board))

    const fiveBoardsData: Data = {
      ...(demoData as unknown as Data),
      boards: fiveBoards,
      tasks: []
    }

    const html = renderToStaticMarkup(<ReportsPage data={fiveBoardsData} onTask={dummyOnTask} />)

    for (let i = 1; i <= 5; i++) {
      expect(html).toContain(`Quadro Operacional ${i}`)
    }
    expect(html).toContain('TOTAL CONSOLIDADO')
  })

  it('exibe estado vazio amigável quando não houver resumos de quadros disponíveis', async () => {
    const reportsModule = await import('./reports')
    const spy = vi.spyOn(reportsModule, 'buildReport').mockReturnValueOnce({
      totals: { all: 0, active: 0, done: 0, blocked: 0, backlog: 0, overdue: 0, progressPercent: 0, totalStoryPoints: 0, doneStoryPoints: 0 },
      teamCounts: new Map(),
      stageCounts: new Map(),
      rows: [],
      boardSummaries: [],
      punctualityMetrics: { onTimeRate: 100, completedTotalWithDueDate: 0, completedOnTimeCount: 0, completedLateCount: 0, averageLateDays: 0, riskTasks: [] },
      bottleneckMetrics: { stageRetentions: [], topBottleneckStage: null, stagnantTasks: [] },
      teamCapacityMetrics: { members: [], overloadedCount: 0, averageActivePerMember: 0 },
    })

    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('reports-empty-table')
    expect(html).toContain('Nenhum quadro encontrado para o filtro selecionado.')
    expect(html).toMatch(/colspan="6"/i)

    spy.mockRestore()
  })
})
