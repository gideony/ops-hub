import type { Board, Member, Profile } from './lib'

/**
 * Retorna se um usuário tem permissão para criar ou encaminhar tarefas para determinado quadro.
 * Regra:
 * - Administradores têm acesso total;
 * - O Quadro Geral (canônico) é sempre destino válido se o usuário pertencer a alguma equipe ativa;
 * - Quadros compartilhados (is_shared = true) são destinos válidos para quem tem acesso;
 * - Quadros vinculados a uma equipe (custom ou setor): OBRIGATORIAMENTE o usuário deve ser membro ATIVO daquela equipe;
 * - Quadro privado de outra equipe NUNCA é permitido e NUNCA deve aparecer como destino;
 * - Prevenção de ciclos: quadros já presentes na jornada (excludedBoardIds) são bloqueados.
 */
export function canForwardToBoard(
  board: Board | null | undefined,
  userId: string | undefined,
  members: Member[],
  profile: Profile | null | undefined,
  excludedBoardIds?: (string | null | undefined)[]
): boolean {
  if (!userId) return false

  // Prevenção de ciclos ou encaminhamento para o próprio quadro
  if (excludedBoardIds && excludedBoardIds.length > 0) {
    const bId = (!board || board.id === 'board-geral' || board.type === 'general') ? 'board-geral' : board.id
    const isExcluded = excludedBoardIds.some(id => {
      const norm = (id === null || id === undefined || id === 'board-geral') ? 'board-geral' : id
      return norm === bId
    })
    if (isExcluded) return false
  }

  const isAdmin = profile?.role === 'administrador' || Boolean(profile?.is_master)
  if (isAdmin) return true

  // Se null ou 'board-geral', é o Quadro Geral canônico
  if (!board || board.id === 'board-geral' || board.type === 'general') {
    return members.some(m => m.user_id === userId && m.active)
  }

  // Quadro compartilhado explicitamente
  if (board.is_shared) {
    return true
  }

  // Quadro com equipe associada: o usuário DEVE ser membro ativo daquela equipe
  if (board.team_id) {
    return members.some(m => m.team_id === board.team_id && m.user_id === userId && m.active)
  }

  // Se não tiver equipe e não for compartilhado, apenas o próprio criador
  return board.created_by === userId
}

/**
 * Filtra a lista de quadros para exibir estritamente aqueles que o usuário
 * enxerga e onde pode criar/encaminhar tarefas.
 * Quadros privados de outra equipe e quadros na lista de exclusão (ciclos) são sumariamente omitidos.
 */
export function getPermittedDestinationBoards(
  boards: Board[],
  members: Member[],
  profile: Profile | null | undefined,
  excludedBoardIds?: (string | null | undefined)[]
): Board[] {
  if (!profile) return []
  return boards.filter(b => canForwardToBoard(b, profile.id, members, profile, excludedBoardIds))
}
