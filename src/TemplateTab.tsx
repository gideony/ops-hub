import { useState } from 'react'
import { CheckSquare, FolderKanban, FolderOpen, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import type { BoardTemplate, ChecklistTemplateGroup } from './lib'
import type { Data } from './App'
import { BOARD_TEMPLATES } from './BoardModals'

type Props = {
  data: Data
  canManage: boolean
  onCreate: () => void
  onEdit: (group: ChecklistTemplateGroup) => void
  onDelete: (group: ChecklistTemplateGroup) => void
  onOpenCreateBoard?: (initialTemplate?: BoardTemplate | string) => void
  onOpenCreateBoardTemplate?: () => void
  onEditBoardTemplate?: (template: BoardTemplate) => void
  onDeleteBoardTemplate?: (template: BoardTemplate) => void
}

export default function TemplateTab({
  data,
  canManage,
  onCreate,
  onEdit,
  onDelete,
  onOpenCreateBoard,
  onOpenCreateBoardTemplate,
  onEditBoardTemplate,
  onDeleteBoardTemplate,
}: Props) {
  const [activeSection, setActiveSection] = useState<'boards' | 'subtasks'>('boards')
  const groups = [...data.templateGroups].sort((a, b) => a.position - b.position)

  const boardTemplates: BoardTemplate[] =
    data.boardTemplates && data.boardTemplates.length > 0 ? data.boardTemplates : BOARD_TEMPLATES

  return (
    <section className="templates-page">
      {/* Navegação entre seções da aba Templates */}
      <div
        className="template-sections-nav"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-main)',
          paddingBottom: '10px',
        }}
        role="tablist"
        aria-label="Seções de templates"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'boards'}
          onClick={() => setActiveSection('boards')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: activeSection === 'boards' ? 600 : 500,
            cursor: 'pointer',
            border: activeSection === 'boards' ? '1px solid var(--primary-main)' : '1px solid var(--border-main)',
            background: activeSection === 'boards' ? 'var(--primary-subtle)' : 'var(--bg-surface)',
            color: activeSection === 'boards' ? 'var(--primary-text)' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          <FolderKanban size={15} />
          <span>Modelos de Quadro</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: activeSection === 'boards' ? 'var(--primary-main)' : 'var(--bg-surface-subtle)',
              color: activeSection === 'boards' ? 'var(--primary-contrast, #ffffff)' : 'var(--text-muted)',
            }}
          >
            {boardTemplates.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSection === 'subtasks'}
          onClick={() => setActiveSection('subtasks')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: activeSection === 'subtasks' ? 600 : 500,
            cursor: 'pointer',
            border: activeSection === 'subtasks' ? '1px solid var(--primary-main)' : '1px solid var(--border-main)',
            background: activeSection === 'subtasks' ? 'var(--primary-subtle)' : 'var(--bg-surface)',
            color: activeSection === 'subtasks' ? 'var(--primary-text)' : 'var(--text-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          <CheckSquare size={15} />
          <span>Templates de Subtarefas</span>
          <span
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: activeSection === 'subtasks' ? 'var(--primary-main)' : 'var(--bg-surface-subtle)',
              color: activeSection === 'subtasks' ? 'var(--primary-contrast, #ffffff)' : 'var(--text-muted)',
            }}
          >
            {groups.length}
          </span>
        </button>
      </div>

      {/* Seção 1: Modelos de Quadro */}
      {activeSection === 'boards' && (
        <>
          <div className="templates-page-head">
            <div>
              <h2>Modelos de Quadro</h2>
              <p>
                Modelos prontos de etapas e regras para novos fluxos. Ao criar um quadro, escolha um modelo para começar.
              </p>
            </div>
            {canManage && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {onOpenCreateBoardTemplate && (
                  <button onClick={onOpenCreateBoardTemplate}>
                    <Plus size={16} /> Novo Modelo de Quadro
                  </button>
                )}
                {onOpenCreateBoard && (
                  <button
                    type="button"
                    onClick={() => onOpenCreateBoard()}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-main)',
                      color: 'var(--text-primary)',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <FolderKanban size={15} /> Novo Quadro
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="template-card-grid">
            {boardTemplates.map(tpl => {
              const tplKey = tpl.key || tpl.id
              const tplTitle = tpl.title || tpl.name
              return (
                <article
                  className="template-card"
                  key={tplKey}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div className="template-card-top">
                      <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: tpl.color || '#3b82f6',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        {tplTitle}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            letterSpacing: '0.04em',
                            background: tpl.methodology === 'scrum' ? 'var(--chip-purple-bg)' : 'var(--chip-info-bg)',
                            color: tpl.methodology === 'scrum' ? 'var(--chip-purple-text)' : 'var(--chip-info-text)',
                            border: `1px solid ${tpl.methodology === 'scrum' ? 'var(--chip-purple-border)' : 'var(--chip-info-border)'}`,
                          }}
                        >
                          {tpl.methodology === 'scrum' ? 'Scrum' : 'Kanban'}
                        </span>
                        {canManage && (
                          <div className="template-card-actions">
                            {onEditBoardTemplate && (
                              <button
                                onClick={() => onEditBoardTemplate(tpl)}
                                aria-label={`Editar ${tplTitle}`}
                                title="Editar modelo de quadro"
                              >
                                <Pencil size={14} /> Editar
                              </button>
                            )}
                            {onDeleteBoardTemplate && (
                              <button
                                className="delete"
                                onClick={() => onDeleteBoardTemplate(tpl)}
                                aria-label={`Excluir ${tplTitle}`}
                                title="Excluir modelo de quadro"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="template-card-description">{tpl.description}</p>

                    <div className="template-card-count" style={{ marginTop: '8px', marginBottom: '8px' }}>
                      <Layers size={14} />
                      <span>{tpl.stages.length} etapas</span>
                    </div>

                    <div
                      className="template-card-chips"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        marginBottom: '12px',
                      }}
                    >
                      {tpl.stages.map((stage, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--bg-surface-subtle)',
                            color: 'var(--text-primary)',
                            borderLeft: `3px solid ${stage.color}`,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                          title={stage.name}
                        >
                          <span>{stage.name}</span>
                          {stage.is_final && (
                            <small
                              style={{
                                color: 'var(--color-success, #059669)',
                                fontSize: '9px',
                                fontWeight: 600,
                              }}
                            >
                              (Final)
                            </small>
                          )}
                          {stage.wip_limit && (
                            <small
                              style={{
                                color: 'var(--color-warning, #d97706)',
                                fontSize: '9px',
                                fontWeight: 600,
                              }}
                            >
                              WIP:{stage.wip_limit}
                            </small>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {onOpenCreateBoard && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => onOpenCreateBoard(tpl.id || tpl.key)}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--primary-text)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0,
                        }}
                      >
                        <Plus size={13} /> Criar quadro com este modelo
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      {/* Seção 2: Templates de Subtarefas */}
      {activeSection === 'subtasks' && (
        <>
          <div className="templates-page-head">
            <div>
              <h2>Templates de Subtarefas</h2>
              <p>Crie grupos de subtarefas prontos para aplicar em tarefas</p>
            </div>
            {canManage && (
              <button onClick={onCreate}>
                <Plus size={16} /> Novo Template
              </button>
            )}
          </div>

          <div className="template-card-grid">
            {groups.map(group => {
              const items = data.templateItems
                .filter(item => item.group_id === group.id)
                .sort((a, b) => a.position - b.position)
              return (
                <article className="template-card" key={group.id}>
                  <div className="template-card-top">
                    <h3>{group.name}</h3>
                    {canManage && (
                      <div className="template-card-actions">
                        <button onClick={() => onEdit(group)} aria-label={`Editar ${group.name}`}>
                          <Pencil size={14} /> Editar
                        </button>
                        <button
                          className="delete"
                          onClick={() => onDelete(group)}
                          aria-label={`Excluir ${group.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  {group.description && <p className="template-card-description">{group.description}</p>}
                  <div className="template-card-count">
                    <FolderOpen size={14} />
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </div>
                  <div className="template-card-chips">
                    {items.slice(0, 3).map(item => (
                      <span key={item.id} title={item.title}>
                        {item.title}
                      </span>
                    ))}
                    {items.length > 3 && <span className="more">+{items.length - 3}</span>}
                  </div>
                </article>
              )
            })}
          </div>

          {groups.length === 0 && (
            <div className="template-card-empty">Nenhum template de subtarefa cadastrado.</div>
          )}
        </>
      )}
    </section>
  )
}
