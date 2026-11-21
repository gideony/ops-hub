import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TemplateTab from './TemplateTab'
import BoardTemplateModal from './BoardTemplateModal'
import { CreateBoardModal, BOARD_TEMPLATES } from './BoardModals'
import { demoData } from './demo'
import type { BoardTemplate } from './lib'

describe('Gerenciamento de Modelos de Quadro (Adicionar, Editar e Excluir)', () => {
  const dummyClose = vi.fn()
  const dummyRun = vi.fn().mockResolvedValue(true)
  const dummyDemoSave = vi.fn()
  const dummyOpenCreate = vi.fn()
  const dummyEdit = vi.fn()
  const dummyDelete = vi.fn()

  it('1. Renderiza a seção de Modelos de Quadro com botão "+ Novo Modelo de Quadro" e ações de Editar/Excluir', () => {
    const html = renderToStaticMarkup(
      <TemplateTab
        data={demoData}
        canManage={true}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenCreateBoard={dummyOpenCreate}
        onOpenCreateBoardTemplate={dummyOpenCreate}
        onEditBoardTemplate={dummyEdit}
        onDeleteBoardTemplate={dummyDelete}
      />
    )

    // Cabeçalho da seção
    expect(html).toContain('Modelos de Quadro')
    expect(html).toContain('Novo Modelo de Quadro')
    expect(html).toContain('Novo Quadro')

    // Cartões de modelo com ações de Editar e Excluir
    expect(html).toContain('Editar')
    expect(html).toContain('Excluir')
    expect(html).toContain('Criar quadro com este modelo')
  })

  it('2. Oculta botões de Novo Modelo, Editar e Excluir quando usuário não tem permissão de gestão (canManage: false)', () => {
    const html = renderToStaticMarkup(
      <TemplateTab
        data={demoData}
        canManage={false}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenCreateBoard={dummyOpenCreate}
        onOpenCreateBoardTemplate={dummyOpenCreate}
        onEditBoardTemplate={dummyEdit}
        onDeleteBoardTemplate={dummyDelete}
      />
    )

    expect(html).toContain('Modelos de Quadro')
    // Não deve conter os botões administrativos
    expect(html).not.toContain('Novo Modelo de Quadro')
    expect(html).not.toContain('aria-label="Editar ')
    expect(html).not.toContain('aria-label="Excluir ')
  })

  it('3. Renderiza BoardTemplateModal para novo modelo com campos de nome, descrição, metodologia e etapas', () => {
    const html = renderToStaticMarkup(
      <BoardTemplateModal
        data={demoData}
        template={null}
        preview={true}
        onClose={dummyClose}
        run={dummyRun}
        onDemoSave={dummyDemoSave}
      />
    )

    expect(html).toContain('Novo Modelo de Quadro')
    expect(html).toContain('Nome do Modelo *')
    expect(html).toContain('Cor do Quadro')
    expect(html).toContain('Metodologia')
    expect(html).toContain('Kanban')
    expect(html).toContain('Scrum')
    expect(html).toContain('Colunas do Modelo (Etapas) *')
    expect(html).toContain('Adicionar etapa')
    expect(html).toContain('Criar Modelo')
  })

  it('4. Renderiza BoardTemplateModal para edição preenchendo os dados do modelo existente', () => {
    const customTemplate: BoardTemplate = {
      id: 'tmpl-teste',
      key: 'tmpl-teste',
      name: 'Fluxo Jurídico',
      title: 'Fluxo Jurídico',
      description: 'Análise de minutas e contratos',
      methodology: 'kanban',
      color: '#7c3aed',
      stages: [
        { name: 'Recebido', color: '#3b82f6', wip_limit: null, is_final: false },
        { name: 'Parecer', color: '#f59e0b', wip_limit: 2, is_final: false },
        { name: 'Assinado', color: '#10b981', wip_limit: null, is_final: true },
      ],
    }

    const html = renderToStaticMarkup(
      <BoardTemplateModal
        data={demoData}
        template={customTemplate}
        preview={true}
        onClose={dummyClose}
        run={dummyRun}
        onDemoSave={dummyDemoSave}
      />
    )

    expect(html).toContain('Editar Modelo de Quadro')
    expect(html).toContain('value="Fluxo Jurídico"')
    expect(html).toContain('Análise de minutas e contratos')
    expect(html).toContain('value="Recebido"')
    expect(html).toContain('value="Parecer"')
    expect(html).toContain('value="Assinado"')
    expect(html).toContain('Salvar Modelo')
  })

  it('5. CreateBoardModal exibe modelos customizados adicionados em data.boardTemplates', () => {
    const customTemplate: BoardTemplate = {
      id: 'tmpl-custom-01',
      key: 'tmpl-custom-01',
      name: 'Suporte N2 Especializado',
      title: 'Suporte N2 Especializado',
      description: 'Atendimento técnico aprofundado',
      methodology: 'kanban',
      color: '#059669',
      stages: [
        { name: 'Triagem N2', color: '#3b82f6', wip_limit: null, is_final: false },
        { name: 'Investigação', color: '#f59e0b', wip_limit: 3, is_final: false },
        { name: 'Resolvido', color: '#10b981', wip_limit: null, is_final: true },
      ],
    }

    const customData = {
      ...demoData,
      boardTemplates: [...(demoData.boardTemplates || BOARD_TEMPLATES), customTemplate],
    }

    const html = renderToStaticMarkup(
      <CreateBoardModal
        data={customData}
        userId="demo-admin"
        canAdmin={true}
        onClose={dummyClose}
        onCreate={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // O novo modelo deve aparecer na lista de modelos de criação
    expect(html).toContain('Suporte N2 Especializado')
    expect(html).toContain('Atendimento técnico aprofundado')
  })

  it('6. CreateBoardModal inicializa com o modelo pré-selecionado quando initialTemplateId é informado', () => {
    const customTemplate: BoardTemplate = {
      id: 'tmpl-custom-02',
      key: 'tmpl-custom-02',
      name: 'Sprint Mobile',
      title: 'Sprint Mobile',
      description: 'Ciclos de releases mobile',
      methodology: 'scrum',
      color: '#6366f1',
      stages: [
        { name: 'Backlog App', color: '#94a3b8', wip_limit: null, is_final: false },
        { name: 'Dev App', color: '#6366f1', wip_limit: 4, is_final: false },
        { name: 'Publicado', color: '#10b981', wip_limit: null, is_final: true },
      ],
    }

    const customData = {
      ...demoData,
      boardTemplates: [...(demoData.boardTemplates || BOARD_TEMPLATES), customTemplate],
    }

    const html = renderToStaticMarkup(
      <CreateBoardModal
        data={customData}
        userId="demo-admin"
        canAdmin={true}
        initialTemplateId="tmpl-custom-02"
        onClose={dummyClose}
        onCreate={vi.fn().mockResolvedValue(undefined)}
      />
    )

    // O template customizado deve estar selecionado e suas etapas devem estar no formulário
    expect(html).toContain('value="Backlog App"')
    expect(html).toContain('value="Dev App"')
    expect(html).toContain('value="Publicado"')
  })
})
