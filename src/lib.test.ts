import { describe, expect, it } from 'vitest'
import { completed, maskPhone, messageError, taskBuckets } from './lib'
import type { Stage, Task } from './lib'

const stages = [
  { id: 'doing', name: 'Faturamento', is_final: false, is_pause: false },
  { id: 'done', name: 'Concluído', is_final: true, is_pause: false },
  { id: 'paused', name: 'Pausado', is_final: false, is_pause: true },
] as Stage[]

function task(overrides: Partial<Task>): Task {
  return { id: 't1', title: 'Teste', description: '', team_id: 'team', assignee_id: 'user', client_id: null, stage_id: 'doing', priority: 'media', due_at: '2026-11-06', tags: [], completed_at: null, created_by: 'user', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', ...overrides }
}

describe('conclusão baseada na etapa', () => {
  const current = new Date(2026, 10, 7, 12)
  it('mostra a tarefa concluída na semana apenas na etapa final', () => {
    const finished = task({ stage_id: 'done', completed_at: new Date(2026,10,6,12).toISOString() })
    expect(completed(finished, stages)).toBe(true)
    const buckets = taskBuckets([finished], stages, 'user', current)
    expect(buckets.week.map(t => t.id)).toEqual(['t1'])
    expect(buckets.mine).toHaveLength(0)
    expect(buckets.overdue).toHaveLength(0)
  })
  it('retorna às listas ativas após reabrir, mesmo com timestamp antigo', () => {
    const reopened = task({ stage_id: 'doing', completed_at: new Date(2026,10,6,12).toISOString() })
    expect(completed(reopened, stages)).toBe(false)
    const buckets = taskBuckets([reopened], stages, 'user', current)
    expect(buckets.week).toHaveLength(0)
    expect(buckets.mine.map(t => t.id)).toEqual(['t1'])
    expect(buckets.overdue.map(t => t.id)).toEqual(['t1'])
  })
  it('inclui pausadas como bloqueadas sem considerá-las concluídas', () => {
    const paused = task({ stage_id: 'paused' })
    const buckets = taskBuckets([paused], stages, 'user', current)
    expect(buckets.blocked).toHaveLength(1)
    expect(buckets.week).toHaveLength(0)
  })

  it('formata erros do Supabase/Postgrest sem exibir [object Object]', () => {
    expect(messageError(new Error('Falha de conexão'))).toBe('Falha de conexão')
    expect(messageError('Erro texto')).toBe('Erro texto')
    expect(messageError({ message: 'Permissão negada', details: 'RLS check', hint: 'Verifique a política' })).toBe('Permissão negada (RLS check) - Dica: Verifique a política')
    expect(messageError({ message: 'Tabela não encontrada' })).toBe('Tabela não encontrada')
    expect(messageError({ error_description: 'Senha incorreta' })).toBe('Senha incorreta')
    expect(messageError({ error: 'unauthorized' })).toBe('unauthorized')
    expect(messageError({ outro_campo: 123 })).toBe('{"outro_campo":123}')
    expect(messageError(null)).toBe('Erro desconhecido')
    expect(messageError(new TypeError('Failed to fetch'))).toContain('Falha de conexão com o servidor Supabase')
  })

  it('aplica mascara em telefones e whatsapp corretamente', () => {
    expect(maskPhone('')).toBe('')
    expect(maskPhone('11')).toBe('(11')
    expect(maskPhone('119')).toBe('(11) 9')
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
    expect(maskPhone('(11) 98765-4321')).toBe('(11) 98765-4321')
  })
})
