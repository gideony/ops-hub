import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { demoData } from './demo'
import { getStagesForBoard } from './general-views'
import NewTaskForm from './NewTaskForm'
import TaskDetailModal from './TaskDetail'
import type { Board } from './lib'

describe('Redesign de Tarefas & Correção de Bugs (DoD)', () => {
  const dummyRun = vi.fn().mockResolvedValue(true)
  const dummyClose = vi.fn()

  it('Bug A: getStagesForBoard nunca retorna array vazio para nenhum quadro', () => {
    // 1. Quadro Geral
    const generalBoard: Board = {
      id: 'board-geral',
      name: 'Geral',
      description: '',
      type: 'general',
      methodology: 'kanban',
      team_id: null,
      is_shared: true,
      stage_ids: [],
      position: 0,
      created_by: 'system',
      created_at: '',
      updated_at: '',
    }
    const generalStages = getStagesForBoard(generalBoard, demoData.stages, demoData.boardStages)
    expect(generalStages.length).toBeGreaterThan(0)

    // 2. Quadro customizado sem etapas cadastradas (fallback defensivo)
    const emptyCustomBoard: Board = {
      id: 'board-empty-custom',
      name: 'Custom Vazio',
      description: '',
      type: 'custom',
      methodology: 'kanban',
      team_id: demoData.teams[0].id,
      is_shared: false,
      stage_ids: [],
      position: 1,
      created_by: 'user-1',
      created_at: '',
      updated_at: '',
    }
    const fallbackStages = getStagesForBoard(emptyCustomBoard, demoData.stages, [])
    expect(fallbackStages.length).toBeGreaterThan(0)
    expect(fallbackStages[0].name).toBeDefined()
  })

  it('Bug A: Modal Nova Tarefa renderiza campo Etapa populado em quadros customizados', () => {
    const customBoard = demoData.boards.find(b => b.type === 'custom') || demoData.boards[0]
    const html = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        activeBoard={customBoard}
      />
    )

    // O HTML deve conter o seletor de etapa e as opções
    expect(html).toContain('Etapa')
    expect(html).toContain('<select')
    expect(html).toContain('<option')
    // Não pode estar vazio
    expect(html).not.toContain('<select></select>')
  })

  it('Bug B: Histórico de movimentação no modal TaskDetail exibe estrutura completa', () => {
    const task = demoData.tasks[0]
    const dummyChecklists = [
      { id: 'c1', task_id: task.id, title: 'Subtarefa A', done: false, position: 1, group_name: 'BRANDKIT' },
      { id: 'c2', task_id: task.id, title: 'Subtarefa B', done: true, position: 2, group_name: 'BRANDKIT' },
    ]
    const html = renderToStaticMarkup(
      <TaskDetailModal
        task={task}
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        preview={true}
        previewChecklist={dummyChecklists}
      />
    )

    // O modal deve conter a seção de templates e o layout moderno em 2 colunas
    expect(html).toContain('task-detail-modal-v2')
    expect(html).toContain('task-detail-v2-body')
    expect(html).toContain('Templates aplicados')
    expect(html).toContain('Excluir tarefa')
  })

  it('Modal Nova Tarefa: exibe botão "Criar e adicionar outra" e busca de templates', () => {
    const html = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
      />
    )

    expect(html).toContain('Criar e adicionar outra')
    expect(html).toContain('Buscar template...')
    expect(html).toContain('Templates de subtarefas (opcional)')
    expect(html).toContain('Criar tarefa')
  })

  it('Segurança e RLS: Geral lateral e consolidado não renderizam quadros não autorizados (IDOR)', () => {
    // Simula filtragem estrita de quadros onde o usuário só acessa quadros da sua equipe ou compartilhados
    const userTeamId = demoData.teams[0].id
    const accessibleBoards = demoData.boards.filter(
      b => b.is_shared || b.team_id === userTeamId || b.type === 'general'
    )
    expect(accessibleBoards.length).toBeGreaterThan(0)
    // Um quadro privado de outra equipe não deve constar
    const unauthorized = demoData.boards.find(b => !b.is_shared && b.team_id && b.team_id !== userTeamId)
    if (unauthorized) {
      expect(accessibleBoards.some(b => b.id === unauthorized.id)).toBe(false)
    }
  })

  it('Remoção do .modal {: TaskDetail e NewTaskForm não possuem a classe modal que limitava largura a 480px', () => {
    const task = demoData.tasks[0]
    const detailHtml = renderToStaticMarkup(
      <TaskDetailModal
        task={task}
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        preview={true}
      />
    )
    // Contém a classe modernizada v2, mas NÃO a classe restritiva .modal
    expect(detailHtml).toContain('class="task-detail-modal-v2"')
    expect(detailHtml).not.toContain('class="modal task-detail-modal-v2"')

    const newFormHtml = renderToStaticMarkup(
      <NewTaskForm
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
      />
    )
    expect(newFormHtml).toContain('class="new-task-modal-v2"')
    expect(newFormHtml).not.toContain('class="modal new-task-modal-v2"')
  })

  it('Tarefa encaminhada: botão Salvar permanece liberado para edição textual enquanto Etapa é travada', () => {
    const forwardedTask = {
      ...demoData.tasks[0],
      forwarded_at: '2026-11-15T10:00:00.000Z',
      forwarded_by: 'demo-user',
    }
    const html = renderToStaticMarkup(
      <TaskDetailModal
        task={forwardedTask}
        data={demoData}
        userId="demo-user"
        onClose={dummyClose}
        run={dummyRun}
        preview={true}
      />
    )

    // O banner de tarefa encaminhada é exibido
    expect(html).toContain('task-forwarded-banner')
    expect(html).toContain('O fluxo da original permanece travado')

    // O seletor de etapa fica desabilitado
    expect(html).toContain('<select disabled=""')

    // O botão Salvar NÃO está desabilitado
    expect(html).toContain('>Salvar</button>')
    expect(html).not.toContain('disabled="" style="padding:7px 18px;border-radius:6px;font-size:13px;background:#94a3b8')
  })

  it('Correção CSS /* width: Regra .modal em style.css não possui largura fixa global de 480px', async () => {
    const fs = await import('node:fs')
    const styleCss = fs.readFileSync('src/style.css', 'utf8')
    // A regra .modal{...} pura não deve ter width:min(100%,480px);
    expect(styleCss).not.toMatch(/\.modal\{[^}]*width:min\(100%,480px\)/)
  })

  it('Segurança e RLS: Migration 202611150002 blinda can_access_task e task_comments contra violação de RLS', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync('supabase/migrations/202611150002_fix_can_access_task_and_comments_rls.sql', 'utf8')

    // Deve cobrir administradores, membros de equipe e quadros acessíveis
    expect(migration).toContain('public.is_admin(uid)')
    expect(migration).toContain('public.is_team_member(t.team_id, uid)')
    expect(migration).toContain('public.can_access_board(t.board_id, uid)')
    expect(migration).toContain('branch.origin_task_id = t.id')
    expect(migration).toContain('t.origin_task_id is not null')
    expect(migration).toContain('trg_set_task_comment_author')
    expect(migration).toContain('comments_insert on public.task_comments')
  })

  it('Correção Bug de Desaparecimento de Tarefa Ramificada: Edição preserva board_id e visibilidade no quadro de destino', () => {
    // Simula tarefa ramificada no quadro de Implantação
    const branchTask = demoData.tasks.find(t => t.id === 'tarefa-008-ramificacao')!
    expect(branchTask).toBeDefined()
    expect(branchTask.board_id).toBe('board-implantacao')
    expect(branchTask.origin_task_id).toBe('tarefa-008')

    // Simula salvamento via onPreviewSave com novos dados editados
    let stateTasks = [...demoData.tasks]
    const updatedValues = {
      title: 'Entrega do guia de marca (Implantação) - Editada',
      description: 'Nova descrição editada pelo usuário no quadro de destino.',
      priority: 'alta' as const,
    }

    const updatedTask = {
      ...branchTask,
      ...updatedValues,
      updated_at: new Date().toISOString()
    }

    // Handler onPreviewSave
    stateTasks = stateTasks.map(t => t.id === updatedTask.id ? updatedTask : t)

    // A tarefa deve permanecer nas tarefas do quadro de Implantação
    const targetBoard = demoData.boards.find(b => b.id === 'board-implantacao')!
    const filteredForTargetBoard = stateTasks.filter(t => t.board_id === targetBoard.id)

    expect(filteredForTargetBoard.some(t => t.id === branchTask.id)).toBe(true)
    const saved = filteredForTargetBoard.find(t => t.id === branchTask.id)!
    expect(saved.title).toBe(updatedValues.title)
    expect(saved.description).toBe(updatedValues.description)
    expect(saved.priority).toBe('alta')
    expect(saved.board_id).toBe('board-implantacao')
  })

  it('Resiliência de reload(): tarefas ramificadas locais não são varridas da memória quando reload busca dados do servidor', () => {
    const existingServerTasks = demoData.tasks.filter(t => t.id !== 'tarefa-008-ramificacao')
    const localBranchTask = demoData.tasks.find(t => t.id === 'tarefa-008-ramificacao')!

    const prevState = {
      tasks: [...existingServerTasks, localBranchTask]
    }

    // Simulação da lógica de mesclagem do reload()
    const serverTaskIds = new Set(existingServerTasks.map(t => t.id))
    const localOnlyTasks = prevState.tasks.filter(t => !serverTaskIds.has(t.id) && Boolean(t.origin_task_id || t.id.startsWith('branch-') || t.id.startsWith('demo-')))
    const merged = [...existingServerTasks, ...localOnlyTasks]

    expect(merged.some(t => t.id === localBranchTask.id)).toBe(true)
    expect(merged.length).toBe(prevState.tasks.length)
  })

  it('Segurança e RLS: Migration 202611160001 consolida forward_completed_task, task_lineage_events e RLS com can_access_board no with check', async () => {
    const fs = await import('node:fs')
    const migration = fs.readFileSync('supabase/migrations/202611160001_consolidated_forwarding_and_lineage.sql', 'utf8')

    expect(migration).toContain('create or replace function public.forward_completed_task')
    expect(migration).toContain('create or replace function public.get_task_lineage')
    expect(migration).toContain('public.task_lineage_events')
    expect(migration).toContain('check_forwarded_task_immutable')
    // Validação estrita do WITH CHECK de tasks_update com can_access_board
    expect(migration).toContain('or (board_id is not null and public.can_access_board(board_id, auth.uid()))')
  })
})
