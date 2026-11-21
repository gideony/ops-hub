import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CreateBoardModal, BOARD_TEMPLATES, NAMED_STAGE_COLORS, NAMED_BOARD_COLORS } from './BoardModals'
import { demoData } from './demo'
import type { Board } from './lib'

describe('Assistente de Criação de Quadros (Wizard de 2 Passos)', () => {
  const dummyClose = vi.fn()
  const dummyCreate = vi.fn().mockResolvedValue(undefined)

  describe('Passo 1: Configuração Inicial', () => {
    it('1. Renderiza o modal largo de 2 passos com indicador de progresso ativo no Passo 1', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      expect(html).toContain('board-wizard-modal')
      expect(html).toContain('Passo 1: Configuração')
      expect(html).toContain('Passo 2: Acesso e revisão')
      expect(html).toContain('wizard-step-badge active')
      expect(html).toContain('Criar Novo Quadro')
    })

    it('2. Exibe campo de Nome do Quadro com placeholder correto e paleta de cores nomeadas', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      expect(html).toContain('placeholder="Ex.: Suporte N1, Comercial ou Sprint Mobile"')
      expect(html).toContain('Cor do Quadro')

      // Deve conter todas as 8 cores nomeadas da paleta
      for (const c of NAMED_BOARD_COLORS) {
        expect(html).toContain(`aria-label="Cor ${c.name}"`)
      }
    })

    it('3. Disponibiliza os 5 modelos predefinidos de quadro com regras consistentes', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      expect(BOARD_TEMPLATES).toHaveLength(5)
      expect(html).toContain('Em branco')
      expect(html).toContain('Suporte')
      expect(html).toContain('Comercial')
      expect(html).toContain('Implantação')
      expect(html).toContain('Scrum padrão')

      // Cada modelo possui ao menos 2 etapas e pelo menos 1 etapa final
      for (const tpl of BOARD_TEMPLATES) {
        expect(tpl.stages.length).toBeGreaterThanOrEqual(2)
        expect(tpl.stages.some(s => s.is_final)).toBe(true)
      }

      // Modelo Comercial possui funil com 6 etapas e etapas finais Concluído e Perdido
      const commercial = BOARD_TEMPLATES.find(t => t.key === 'commercial')
      expect(commercial).toBeDefined()
      expect(commercial?.stages).toHaveLength(6)
      expect(commercial?.stages.find(s => s.name === 'Perdido')?.is_final).toBe(true)
      expect(commercial?.stages.find(s => s.name === 'Concluído')?.is_final).toBe(true)

      // Modelo Scrum possui metodologia 'scrum'
      const scrumTpl = BOARD_TEMPLATES.find(t => t.key === 'scrum_default')
      expect(scrumTpl?.methodology).toBe('scrum')
    })

    it('4. Exibe lista de etapas com alça de arrastar, botões de subir/descer e cores por NOME sem expor hexadecimais soltos', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      expect(html).toContain('Colunas do Quadro (Etapas)')
      expect(html).toContain('stage-drag-handle')
      expect(html).toContain('Mover para cima')
      expect(html).toContain('Mover para baixo')
      expect(html).toContain('Final')
      expect(html).toContain('+ Adicionar etapa')

      // As opções de cores das etapas usam os nomes em pt-BR
      for (const c of NAMED_STAGE_COLORS) {
        expect(html).toContain(`>${c.name}</option>`)
      }

      // Não deve conter mais a seção legada de origem das tarefas ou espelhar etapas do Geral
      expect(html).not.toContain('Origem das tarefas')
      expect(html).not.toContain('Espelhar etapas do Geral')
    })

    it('5. Exibe os botões de navegação Cancelar e Avançar no rodapé do Passo 1', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      expect(html).toContain('Passo 1 de 2: Configuração')
      expect(html).toContain('Cancelar')
      expect(html).toContain('Avançar')
    })
  })

  describe('Passo 2 e Robustez (Acesso, Revisão e Prévia Fiel)', () => {
    it('6. Paleta do sistema possui 8 cores semânticas com rótulos em português', () => {
      expect(NAMED_BOARD_COLORS.map(c => c.name)).toEqual([
        'Azul',
        'Roxo',
        'Verde',
        'Âmbar',
        'Rosa',
        'Vermelho',
        'Índigo',
        'Cinza',
      ])
    })

    it('7. Cores de etapas cobrem 8 tons harmonizados e identificáveis', () => {
      expect(NAMED_STAGE_COLORS.map(c => c.name)).toEqual([
        'Cinza',
        'Âmbar',
        'Verde',
        'Azul',
        'Vermelho',
        'Roxo',
        'Rosa',
        'Índigo',
      ])
    })

    it('8. Não expõe o campo Fase da Jornada quando inexistente no banco', () => {
      const html = renderToStaticMarkup(
        <CreateBoardModal
          data={demoData}
          userId="demo-admin"
          canAdmin={true}
          onClose={dummyClose}
          onCreate={dummyCreate}
        />
      )

      // Campo foi deliberadamente omitido para evitar migrations desnecessárias
      expect(html).not.toContain('Fase da jornada')
      expect(html).not.toContain('journey_phase')
    })

    it('9. Criação no modo demonstração preserva cores e configurações do novo quadro', async () => {
      const createdBoard: Board = {
        id: 'new-board-test',
        name: 'Quadro Teste QA',
        description: 'Descrição de teste',
        color: '#2563eb',
        type: 'custom',
        methodology: 'kanban',
        team_id: demoData.teams[0].id,
        is_shared: false,
        stage_ids: [],
        position: 10,
        created_by: 'demo-admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        on_completion_action: 'suggest_default',
        default_forward_board_id: demoData.boards[0]?.id || null,
        default_forward_stage_id: demoData.stages[0]?.id || null,
      }

      const stagesToCreate = [
        { name: 'Triagem', color: '#94a3b8', position: 0, wip_limit: 5, is_final: false },
        { name: 'Em atendimento', color: '#3b82f6', position: 1, wip_limit: 3, is_final: false },
        { name: 'Resolvido', color: '#10b981', position: 2, wip_limit: null, is_final: true },
      ]

      await dummyCreate(createdBoard, stagesToCreate)

      expect(dummyCreate).toHaveBeenCalledWith(createdBoard, stagesToCreate)
      expect(createdBoard.color).toBe('#2563eb')
      expect(createdBoard.on_completion_action).toBe('suggest_default')
      expect(stagesToCreate.some(s => s.is_final)).toBe(true)
    })
  })
})
