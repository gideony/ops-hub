import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReportsPage from './ReportsPage'
import { demoData } from './demo'
import type { Data } from './App'
import { getPresetDates, daysBetween } from './reports'

describe('QA: OPSHUB Analytics V3 — Placar Executivo, Presets e Novas Abas', () => {
  const dummyOnTask = () => {}

  it('renderiza os botões de presets rápidos de período no topo', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('reports-presets-bar')
    expect(html).toContain('Este Mês')
    expect(html).toContain('Esta Semana')
    expect(html).toContain('Últimos 30 dias')
    expect(html).toContain('Personalizado')
  })

  it('renderiza o Placar Executivo com os 3 cards topo das dores aprovadas', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('reports-executive-bar')
    // Card 1: Pontualidade / SLA de Entrega
    expect(html).toContain('SLA de Entrega')
    expect(html).toContain('no prazo')

    // Card 2: Gargalos na Esteira
    expect(html).toContain('Gargalo da Esteira')

    // Card 3: Equipe & Capacidade
    expect(html).toContain('Equipe &amp; Capacidade')
  })

  it('renderiza a barra de navegação com as 4 abas e suas pílulas indicadoras', () => {
    const html = renderToStaticMarkup(<ReportsPage data={demoData as unknown as Data} onTask={dummyOnTask} />)

    expect(html).toContain('reports-tabs-nav')
    expect(html).toContain('Quadros &amp; Detalhes')
    expect(html).toContain('Gargalos &amp; Fluxo')
    expect(html).toContain('Pessoas &amp; Carga')
    expect(html).toContain('Pontualidade &amp; Prazos')
  })

  it('calcula datas corretas para presets de período semanal, mensal e últimos 30 dias', () => {
    const baseDate = '2026-11-12' // Quinta-feira

    const weekPreset = getPresetDates('this_week', baseDate)
    expect(weekPreset.from).toBe('2026-11-09') // Segunda-feira
    expect(weekPreset.to).toBe('2026-11-15')   // Domingo

    const monthPreset = getPresetDates('this_month', baseDate)
    expect(monthPreset.from).toBe('2026-11-01')
    expect(monthPreset.to).toBe('2026-11-30')

    const last30Preset = getPresetDates('last_30_days', baseDate)
    expect(last30Preset.to).toBe(baseDate)
    expect(daysBetween(last30Preset.from, last30Preset.to)).toBe(30)
  })

  it('calcula corretamente a diferença em dias entre duas datas com daysBetween', () => {
    expect(daysBetween('2026-11-10', '2026-11-15')).toBe(5)
    expect(daysBetween('2026-11-15', '2026-11-10')).toBe(-5)
    expect(daysBetween('2026-11-12', '2026-11-12')).toBe(0)
    expect(daysBetween('', '2026-11-12')).toBe(0)
  })
})
