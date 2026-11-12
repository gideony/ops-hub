import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Utilitário de cálculo de Luminância Relativa e Taxa de Contraste WCAG 2.1
 * Fórmula: (L1 + 0.05) / (L2 + 0.05), onde L1 é a cor mais clara.
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16)
    ]
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ]
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(val => {
    const s = val / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const [r1, g1, b1] = parseHex(hex1)
  const [r2, g2, b2] = parseHex(hex2)
  const lum1 = relativeLuminance(r1, g1, b1)
  const lum2 = relativeLuminance(r2, g2, b2)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Design Tokens — Checagem de Contraste WCAG 2.1 (mínimo 4.5:1)', () => {
  // Paleta de tokens do Tema Claro
  const lightTokens = {
    bgPage: '#f8fafc',
    bgSurface: '#ffffff',
    bgSurfaceSubtle: '#f1f5f9',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#526071',
    primaryMain: '#1e40af',
    primaryContrast: '#ffffff',
    chipSuccessBg: '#dcfce7',
    chipSuccessText: '#14532d',
    chipWarningBg: '#fef3c7',
    chipWarningText: '#78350f',
    chipDangerBg: '#fee2e2',
    chipDangerText: '#991b1b',
    chipInfoBg: '#dbeafe',
    chipInfoText: '#1e3a8a',
    selectBg: '#ffffff',
    selectText: '#0f172a'
  }

  // Paleta de tokens do Tema Escuro
  const darkTokens = {
    bgPage: '#09090b',
    bgSurface: '#18181f',
    bgSurfaceSubtle: '#1c1c24',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    primaryMain: '#5556d8',
    primaryContrast: '#ffffff',
    chipSuccessBg: '#153422',
    chipSuccessText: '#86efac',
    chipWarningBg: '#3d2c12',
    chipWarningText: '#fde047',
    chipDangerBg: '#45141e',
    chipDangerText: '#fca5a5',
    chipInfoBg: '#1e293b',
    chipInfoText: '#93c5fd',
    selectBg: '#1f1f23',
    selectText: '#f8fafc'
  }

  describe('Tema Claro', () => {
    it('texto primário atende contraste WCAG AA (>= 4.5:1) sobre fundo de página e superfície', () => {
      const ratioPage = getContrastRatio(lightTokens.textPrimary, lightTokens.bgPage)
      const ratioSurface = getContrastRatio(lightTokens.textPrimary, lightTokens.bgSurface)
      expect(ratioPage).toBeGreaterThanOrEqual(4.5)
      expect(ratioSurface).toBeGreaterThanOrEqual(4.5)
    })

    it('texto secundário atende contraste WCAG AA (>= 4.5:1) sobre superfície', () => {
      const ratio = getContrastRatio(lightTokens.textSecondary, lightTokens.bgSurface)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('texto mutado atende contraste WCAG AA (>= 4.5:1) sobre superfície', () => {
      const ratio = getContrastRatio(lightTokens.textMuted, lightTokens.bgSurface)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('botão primário e chips de status atendem contraste WCAG AA (>= 4.5:1)', () => {
      expect(getContrastRatio(lightTokens.primaryContrast, lightTokens.primaryMain)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(lightTokens.chipSuccessText, lightTokens.chipSuccessBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(lightTokens.chipWarningText, lightTokens.chipWarningBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(lightTokens.chipDangerText, lightTokens.chipDangerBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(lightTokens.chipInfoText, lightTokens.chipInfoBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('select e dropdown atendem contraste WCAG AA (>= 4.5:1)', () => {
      expect(getContrastRatio(lightTokens.selectText, lightTokens.selectBg)).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('Tema Escuro', () => {
    it('texto primário atende contraste WCAG AA (>= 4.5:1) sobre fundo e superfície escura', () => {
      const ratioPage = getContrastRatio(darkTokens.textPrimary, darkTokens.bgPage)
      const ratioSurface = getContrastRatio(darkTokens.textPrimary, darkTokens.bgSurface)
      expect(ratioPage).toBeGreaterThanOrEqual(4.5)
      expect(ratioSurface).toBeGreaterThanOrEqual(4.5)
    })

    it('texto secundário atende contraste WCAG AA (>= 4.5:1) sobre superfície escura', () => {
      const ratio = getContrastRatio(darkTokens.textSecondary, darkTokens.bgSurface)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('texto mutado atende contraste WCAG AA (>= 4.5:1) sobre superfície escura', () => {
      const ratio = getContrastRatio(darkTokens.textMuted, darkTokens.bgSurface)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })

    it('chips de status escuros atendem contraste WCAG AA (>= 4.5:1)', () => {
      expect(getContrastRatio(darkTokens.primaryContrast, darkTokens.primaryMain)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(darkTokens.chipSuccessText, darkTokens.chipSuccessBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(darkTokens.chipWarningText, darkTokens.chipWarningBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(darkTokens.chipDangerText, darkTokens.chipDangerBg)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(darkTokens.chipInfoText, darkTokens.chipInfoBg)).toBeGreaterThanOrEqual(4.5)
    })

    it('selects escuros atendem contraste WCAG AA (>= 4.5:1)', () => {
      expect(getContrastRatio(darkTokens.selectText, darkTokens.selectBg)).toBeGreaterThanOrEqual(4.5)
    })
  })
})

describe('Regressão de Estilo — Falha se houver cores fixas fora de tokens nos componentes refatorados', () => {
  const cssPath = path.resolve(__dirname, 'reference-layout.css')
  const cssContent = fs.readFileSync(cssPath, 'utf-8')

  // Componentes novos e refatorados que OBRIGATORIAMENTE devem herdar cores de tokens
  const componentsToCheck = [
    '.kanban-col',
    '.kanban-head',
    '.kanban-head-title strong',
    '.task-card',
    '.task-card-main>strong',
    '.task-card-main>p',
    '.task-sector-chip',
    '.sector-info-banner',
    '.kanban-wip-badge',
    '.my-boards-head',
    '.my-boards-head h2',
    '.my-board-card',
    '.my-board-card-header h3',
    '.my-board-mini-col',
    '.my-board-dashed-card',
    '.board-create-modal',
    '.board-modal-header',
    '.board-type-card',
    '.custom-stage-row',
    '.scrum-backlog-toolbar',
    '.scrum-backlog-toolbar h3',
    '.quick-task-form',
    '.planning-sprint-box',
    '.backlog-main-card',
    '.backlog-task-row',
    '.task-title-cell strong',
    '.sprint-active-banner',
    '.burndown-modal',
    '.burndown-metrics-bar',
    '.sprint-complete-modal',
    '.sprint-summary-card',
    '.sprint-pending-box',
    '.assign-sprint-select',
    '.stage-color-select'
  ]

  componentsToCheck.forEach(selector => {
    it(`seletor "${selector}" não possui cor fixa hex (#...) em propriedades de texto ou fundo`, () => {
      // Encontra qualquer bloco de regra cujo seletor contenha o seletor alvo
      const ruleRegex = /([^{}]+)\{([^{}]+)\}/g
      const matches: string[] = []
      for (const m of cssContent.matchAll(ruleRegex)) {
        const selectorList = m[1].split(',')
        if (selectorList.some(s => s.trim() === selector || s.includes(selector))) {
          matches.push(m[2])
        }
      }

      expect(matches.length, `Seletor ${selector} deve existir no CSS`).toBeGreaterThan(0)

      for (const body of matches) {
        // Verifica se propriedades de cor (color:, background:, border-color:) usam hex hardcoded
        const forbiddenHexInColors = /(?:^|[^-])\b(color|background|background-color|border-color)\s*:\s*(#[0-9a-fA-F]{3,8})/gi
        const forbiddenMatches = [...body.matchAll(forbiddenHexInColors)]

        if (forbiddenMatches.length > 0) {
          const offenses = forbiddenMatches.map(m => `${m[1]}: ${m[2]}`).join(', ')
          throw new Error(
            `Violação encontrada no seletor "${selector}": propriedade com cor fixa "${offenses}". Deve utilizar var(--token).`
          )
        }
      }
    })
  })

  it('arquivo theme-tokens.css exporta tokens de texto, superfície, borda e chips nos temas claro e escuro', () => {
    const tokensPath = path.resolve(__dirname, 'theme-tokens.css')
    const tokensCss = fs.readFileSync(tokensPath, 'utf-8')

    expect(tokensCss).toContain(':root {')
    expect(tokensCss).toContain(":root[data-theme='dark'] {")
    expect(tokensCss).toContain('--text-primary:')
    expect(tokensCss).toContain('--text-secondary:')
    expect(tokensCss).toContain('--bg-surface:')
    expect(tokensCss).toContain('--border-main:')
    expect(tokensCss).toContain('--chip-success-bg:')
    expect(tokensCss).toContain('--chip-warning-bg:')
    expect(tokensCss).toContain('--chip-danger-bg:')
    expect(tokensCss).toContain('--select-bg:')
    expect(tokensCss).toContain('--select-text:')
  })
})
