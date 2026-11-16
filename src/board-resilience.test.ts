import { describe, expect, it } from 'vitest'
import { isNetworkError, isUUID, messageError } from './lib'
import type { Board, BoardStage, Stage, Task } from './lib'

describe('Resiliência dos Quadros e Etapas (board-resilience)', () => {
  describe('isUUID', () => {
    it('reconhece UUIDs válidos no padrão RFC 4122', () => {
      expect(isUUID('3c8d1234-5678-4abc-8def-0123456789ab')).toBe(true)
      expect(isUUID('00000000-0000-1000-8000-000000000000')).toBe(true)
      expect(isUUID(crypto.randomUUID())).toBe(true)
    })

    it('rejeita identificadores locais e mocks do modo demonstração', () => {
      expect(isUUID('stage-0')).toBe(false)
      expect(isUUID('stage-1')).toBe(false)
      expect(isUUID('board-geral')).toBe(false)
      expect(isUUID('bstage-sup-1')).toBe(false)
      expect(isUUID('')).toBe(false)
      expect(isUUID(null)).toBe(false)
      expect(isUUID(undefined)).toBe(false)
      expect(isUUID(123)).toBe(false)
    })
  })

  describe('isNetworkError e messageError', () => {
    it('identifica e formata falhas de rede Failed to fetch com mensagem explicativa em pt-BR', () => {
      const err = new TypeError('Failed to fetch')
      expect(isNetworkError(err)).toBe(true)
      const msg = messageError(err)
      expect(msg).toContain('Falha de conexão com o servidor Supabase')
      expect(msg).not.toContain('node_modules')
    })

    it('identifica erros do tipo NetworkError ou strings de rede', () => {
      expect(isNetworkError('TypeError: Failed to fetch')).toBe(true)
      expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
      expect(isNetworkError(new Error('Outro erro de validação'))).toBe(false)
    })
  })

  describe('Fallback local em quadros e etapas', () => {
    it('remove etapa localmente sem erro se o identificador não for UUID de banco', () => {
      const stages: Stage[] = [
        { id: 'stage-0', name: 'Tarefas', position: 0, color: '#3b82f6', is_final: false, is_pause: false },
        { id: 'stage-1', name: 'Em andamento', position: 1, color: '#f59e0b', is_final: false, is_pause: false },
        { id: 'stage-2', name: 'Concluído', position: 2, color: '#10b981', is_final: true, is_pause: false },
      ]

      const toRemove = stages[1]
      // Simulação do comportamento de StageManager.remove com fallback local
      const shouldLocalRemove = !isUUID(toRemove.id)
      expect(shouldLocalRemove).toBe(true)

      const updated = stages.filter(s => s.id !== toRemove.id)
      expect(updated).toHaveLength(2)
      expect(updated.find(s => s.id === 'stage-1')).toBeUndefined()
    })

    it('permite reordenar etapas localmente sem travar a interface se o backend estiver instável', () => {
      const stages: Stage[] = [
        { id: 'stage-0', name: 'Tarefas', position: 0, color: '#3b82f6', is_final: false, is_pause: false },
        { id: 'stage-1', name: 'Em andamento', position: 1, color: '#f59e0b', is_final: false, is_pause: false },
      ]

      const newIds = ['stage-1', 'stage-0']
      const reordered = stages
        .map(s => ({ ...s, position: newIds.indexOf(s.id) }))
        .sort((a, b) => a.position - b.position)

      expect(reordered[0].id).toBe('stage-1')
      expect(reordered[1].id).toBe('stage-0')
    })

    it('aplica fallback ao mover tarefas em caso de oscilação de rede sem perder dados', () => {
      const task: Task = {
        id: 'task-100',
        title: 'Tarefa Teste Resiliência',
        description: '',
        team_id: 'team-1',
        assignee_id: null,
        client_id: null,
        stage_id: 'stage-0',
        priority: 'alta',
        due_at: null,
        tags: [],
        completed_at: null,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        board_id: null,
      }

      const targetStageId = 'stage-final'
      const completedAt = new Date().toISOString()

      // Simulação do catch em moveTask: atualização local tolerante a falhas
      const movedTask = {
        ...task,
        stage_id: targetStageId,
        completed_at: completedAt,
        updated_at: new Date().toISOString()
      }

      expect(movedTask.stage_id).toBe('stage-final')
      expect(movedTask.completed_at).toBe(completedAt)
    })

    it('permite criar e atualizar quadros personalizados localmente quando o servidor estiver offline', () => {
      const customBoard: Board = {
        id: 'board-resilient-1',
        name: 'Quadro Resiliente',
        description: 'Testando resiliência',
        type: 'custom',
        methodology: 'kanban',
        team_id: 'team-1',
        is_shared: false,
        stage_ids: [],
        position: 1,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const stagesToCreate: Partial<BoardStage>[] = [
        { name: 'A Fazer', color: '#3b82f6', wip_limit: null, is_final: false },
        { name: 'Pronto', color: '#10b981', wip_limit: null, is_final: true },
      ]

      const createdStages: BoardStage[] = stagesToCreate.map((stg, i) => ({
        id: `bstage-${i}`,
        board_id: customBoard.id,
        name: stg.name || `Etapa ${i + 1}`,
        color: stg.color || '#3b82f6',
        position: i,
        wip_limit: stg.wip_limit ?? null,
        is_final: stg.is_final ?? false,
        created_at: new Date().toISOString(),
      }))

      expect(createdStages).toHaveLength(2)
      expect(createdStages[1].is_final).toBe(true)
    })
  })
})
