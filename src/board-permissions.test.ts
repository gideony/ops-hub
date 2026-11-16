import { describe, it, expect } from 'vitest'
import { canForwardToBoard, getPermittedDestinationBoards } from './board-permissions'
import type { Board, Member, Profile } from './lib'

describe('board-permissions: regras de permissão e destino de quadros', () => {
  const adminProfile: Profile = {
    id: 'user-admin',
    full_name: 'Administrador Master',
    role: 'administrador',
    active: true,
    is_master: true,
  }

  const memberProfile: Profile = {
    id: 'user-colab-1',
    full_name: 'Colaborador da Equipe A',
    role: 'colaborador',
    active: true,
    is_master: false,
  }

  const otherTeamProfile: Profile = {
    id: 'user-colab-2',
    full_name: 'Colaborador da Equipe B',
    role: 'colaborador',
    active: true,
    is_master: false,
  }

  const members: Member[] = [
    { team_id: 'team-a', user_id: 'user-colab-1', is_manager: false, active: true },
    { team_id: 'team-b', user_id: 'user-colab-2', is_manager: false, active: true },
    { team_id: 'team-inactive', user_id: 'user-colab-1', is_manager: false, active: false },
  ]

  const generalBoard: Board = {
    id: 'board-geral',
    name: 'Geral',
    description: 'Quadro canônico geral',
    type: 'general',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: ['stage-1', 'stage-2'],
    position: 0,
    created_by: 'system',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const sharedBoard: Board = {
    id: 'board-shared-1',
    name: 'Quadro Compartilhado Multi-equipes',
    description: 'Quadro de projetos intersetoriais',
    type: 'custom',
    methodology: 'kanban',
    team_id: null,
    is_shared: true,
    stage_ids: ['s-1', 's-2'],
    position: 1,
    created_by: 'user-admin',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const teamABoard: Board = {
    id: 'board-team-a',
    name: 'Quadro Operacional da Equipe A',
    description: 'Privado da Equipe A',
    type: 'custom',
    methodology: 'kanban',
    team_id: 'team-a',
    is_shared: false,
    stage_ids: ['sa-1', 'sa-2'],
    position: 2,
    created_by: 'user-colab-1',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const teamBBoardPrivate: Board = {
    id: 'board-team-b',
    name: 'Quadro Privado da Equipe B',
    description: 'Privado e restrito à Equipe B',
    type: 'custom',
    methodology: 'kanban',
    team_id: 'team-b',
    is_shared: false,
    stage_ids: ['sb-1', 'sb-2'],
    position: 3,
    created_by: 'user-colab-2',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const inactiveTeamBoard: Board = {
    id: 'board-team-inactive',
    name: 'Quadro de Equipe Desativada',
    description: 'Equipe inativa',
    type: 'custom',
    methodology: 'kanban',
    team_id: 'team-inactive',
    is_shared: false,
    stage_ids: ['si-1'],
    position: 4,
    created_by: 'user-other',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  describe('canForwardToBoard', () => {
    it('bloqueia se o usuário for nulo ou indefinido', () => {
      expect(canForwardToBoard(generalBoard, undefined, members, null)).toBe(false)
      expect(canForwardToBoard(teamABoard, '', members, null)).toBe(false)
    })

    it('administrador tem permissão para qualquer quadro (geral, compartilhado e privados)', () => {
      expect(canForwardToBoard(generalBoard, adminProfile.id, members, adminProfile)).toBe(true)
      expect(canForwardToBoard(sharedBoard, adminProfile.id, members, adminProfile)).toBe(true)
      expect(canForwardToBoard(teamABoard, adminProfile.id, members, adminProfile)).toBe(true)
      expect(canForwardToBoard(teamBBoardPrivate, adminProfile.id, members, adminProfile)).toBe(true)
    })

    it('colaborador pode encaminhar para o Quadro Geral se for membro ativo de alguma equipe', () => {
      expect(canForwardToBoard(generalBoard, memberProfile.id, members, memberProfile)).toBe(true)
    })

    it('colaborador pode encaminhar para quadros compartilhados (is_shared = true)', () => {
      expect(canForwardToBoard(sharedBoard, memberProfile.id, members, memberProfile)).toBe(true)
    })

    it('colaborador pode encaminhar para quadro privado da sua própria equipe', () => {
      expect(canForwardToBoard(teamABoard, memberProfile.id, members, memberProfile)).toBe(true)
    })

    it('CRÍTICO: colaborador NUNCA pode encaminhar para quadro privado de outra equipe', () => {
      // memberProfile pertence à team-a, NÃO à team-b
      expect(canForwardToBoard(teamBBoardPrivate, memberProfile.id, members, memberProfile)).toBe(false)
    })

    it('CRÍTICO: bloqueia encaminhamento se o usuário estiver inativo na equipe do quadro', () => {
      expect(canForwardToBoard(inactiveTeamBoard, memberProfile.id, members, memberProfile)).toBe(false)
    })

    it('PREVENÇÃO DE CICLOS: bloqueia encaminhamento se o quadro estiver na lista de exclusão (linhagem ancestral)', () => {
      // Usuário administrador ou colaborador não pode encaminhar para quadro que já está na linhagem
      expect(canForwardToBoard(teamABoard, adminProfile.id, members, adminProfile, ['board-team-a'])).toBe(false)
      expect(canForwardToBoard(generalBoard, memberProfile.id, members, memberProfile, ['board-geral'])).toBe(false)
    })
  })

  describe('getPermittedDestinationBoards', () => {
    const allBoards = [generalBoard, sharedBoard, teamABoard, teamBBoardPrivate, inactiveTeamBoard]

    it('retorna lista vazia se não houver perfil autenticado', () => {
      const allowed = getPermittedDestinationBoards(allBoards, members, null)
      expect(allowed).toEqual([])
    })

    it('PREVENÇÃO DE CICLOS: filtra e remove da lista quadros que já pertencem à jornada ancestral', () => {
      // Se a tarefa veio de board-shared-1 e board-team-a, esses quadros não aparecem como destino
      const allowed = getPermittedDestinationBoards(allBoards, members, adminProfile, ['board-shared-1', 'board-team-a'])
      const allowedIds = allowed.map(b => b.id)

      expect(allowedIds).not.toContain('board-shared-1')
      expect(allowedIds).not.toContain('board-team-a')
      expect(allowedIds).toContain('board-geral')
      expect(allowedIds).toContain('board-team-b')
    })

    it('administrador enxerga todos os quadros como destino elegível', () => {
      const allowed = getPermittedDestinationBoards(allBoards, members, adminProfile)
      expect(allowed.map(b => b.id)).toEqual([
        'board-geral',
        'board-shared-1',
        'board-team-a',
        'board-team-b',
        'board-team-inactive',
      ])
    })

    it('colaborador da Equipe A NUNCA recebe o quadro privado da Equipe B na lista de destinos', () => {
      const allowed = getPermittedDestinationBoards(allBoards, members, memberProfile)
      const allowedIds = allowed.map(b => b.id)

      expect(allowedIds).toContain('board-geral')
      expect(allowedIds).toContain('board-shared-1')
      expect(allowedIds).toContain('board-team-a')
      expect(allowedIds).not.toContain('board-team-b')
      expect(allowedIds).not.toContain('board-team-inactive')
    })

    it('colaborador da Equipe B enxerga o quadro da sua equipe, mas NUNCA o quadro privado da Equipe A', () => {
      const allowed = getPermittedDestinationBoards(allBoards, members, otherTeamProfile)
      const allowedIds = allowed.map(b => b.id)

      expect(allowedIds).toContain('board-geral')
      expect(allowedIds).toContain('board-shared-1')
      expect(allowedIds).toContain('board-team-b')
      expect(allowedIds).not.toContain('board-team-a')
      expect(allowedIds).not.toContain('board-team-inactive')
    })
  })
})
