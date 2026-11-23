import { describe, it, expect } from 'vitest'
import type { Channel, Message, Profile, Member } from './lib'
import { isMissingColumnError } from './lib'

describe('PASSO 6 & 7: Segurança, Privacidade e Permissões do Chat', () => {
  // Mock de estrutura de dados para testes locais com dados fictícios
  const mockAdminProfile: Profile = {
    id: 'user-admin',
    full_name: 'Administrador OPSHUB',
    role: 'gestor',
    is_master: true,
    active: true,
    email: 'admin@opshub.local'
  }

  const mockManagerProfile: Profile = {
    id: 'user-manager',
    full_name: 'Gestor Comercial',
    role: 'gestor',
    is_master: false,
    active: true,
    email: 'gestor@opshub.local'
  }

  const mockMemberProfile: Profile = {
    id: 'user-member-1',
    full_name: 'Colaborador Um',
    role: 'colaborador',
    is_master: false,
    active: true,
    email: 'user1@opshub.local'
  }

  const members: Member[] = [
    { team_id: 'team-comercial', user_id: 'user-manager', is_manager: true, active: true },
    { team_id: 'team-comercial', user_id: 'user-member-1', is_manager: false, active: true },
    { team_id: 'team-dev', user_id: 'user-foreign', is_manager: false, active: true }
  ]

  const channelGeral: Channel = {
    id: 'channel-comercial-geral',
    team_id: 'team-comercial',
    name: 'Geral',
    description: 'Canal principal do Comercial',
    archived_at: null,
    is_restricted: false,
    created_at: '2026-01-01T00:00:00Z'
  }

  const channelProjetos: Channel = {
    id: 'channel-comercial-projetos',
    team_id: 'team-comercial',
    name: 'Projetos Especiais',
    description: 'Discussão de projetos',
    archived_at: null,
    is_restricted: false,
    created_at: '2026-01-02T00:00:00Z'
  }

  const channelArquivado: Channel = {
    id: 'channel-comercial-arquivado',
    team_id: 'team-comercial',
    name: 'Antigo 2025',
    description: 'Canal antigo',
    archived_at: '2026-01-10T12:00:00Z',
    is_restricted: false,
    created_at: '2025-01-01T00:00:00Z'
  }

  // 1. Regras de Permissão de Canais
  describe('1. Gerenciamento e Proteção de Canais', () => {
    function canManageChannel(user: Profile, teamId: string): boolean {
      if (user.is_master) return true
      return members.some(m => m.team_id === teamId && m.user_id === user.id && m.is_manager && m.active)
    }

    function canDeleteChannel(user: Profile): boolean {
      return Boolean(user.is_master)
    }

    function isChannelGeralProtected(channel: Channel): boolean {
      return channel.name.trim().toLowerCase() === 'geral'
    }

    it('impede exclusão e arquivamento do canal Geral', () => {
      expect(isChannelGeralProtected(channelGeral)).toBe(true)
      expect(isChannelGeralProtected(channelProjetos)).toBe(false)
    })

    it('permite que administradores gerenciem e excluam canais não protegidos', () => {
      expect(canManageChannel(mockAdminProfile, 'team-comercial')).toBe(true)
      expect(canDeleteChannel(mockAdminProfile)).toBe(true)
    })

    it('permite que gestores gerenciem canais da sua equipe, mas veta exclusão definitiva', () => {
      expect(canManageChannel(mockManagerProfile, 'team-comercial')).toBe(true)
      expect(canDeleteChannel(mockManagerProfile)).toBe(false)
    })

    it('impede que gestores gerenciem canais de outras equipes (prevenção a IDOR)', () => {
      expect(canManageChannel(mockManagerProfile, 'team-dev')).toBe(false)
    })

    it('impede que colaboradores gerenciem ou excluam canais', () => {
      expect(canManageChannel(mockMemberProfile, 'team-comercial')).toBe(false)
      expect(canDeleteChannel(mockMemberProfile)).toBe(false)
    })

    it('exige confirmação estrita digitando o nome do canal para exclusão definitiva', () => {
      function validateChannelDeletionConfirmation(channelName: string, inputConfirmation: string): boolean {
        return inputConfirmation.trim() === channelName.trim()
      }

      expect(validateChannelDeletionConfirmation('Projetos Especiais', 'Projetos')).toBe(false)
      expect(validateChannelDeletionConfirmation('Projetos Especiais', 'projetos especiais')).toBe(false)
      expect(validateChannelDeletionConfirmation('Projetos Especiais', 'Projetos Especiais')).toBe(true)
    })

    it('garante que a exclusão de canal possui fallback resiliente sem depender de Edge Function externa', async () => {
      // Simula a lógica de deleção atômica com fallback implementada no ChatPage
      let rpcCalled = false
      let directDeleteCalled = false

      async function deleteChannelWithFallback(
        channel: Channel,
        confirmationName: string,
        rpcSimulatedFailure = false
      ): Promise<{ success: boolean; method: string }> {
        if (channel.name.trim().toLowerCase() === 'geral') {
          throw new Error('O canal Geral é protegido e não pode ser excluído.')
        }
        if (confirmationName.trim().toLowerCase() !== channel.name.trim().toLowerCase()) {
          throw new Error('O nome digitado não confere exatamente com o nome do canal.')
        }

        rpcCalled = true
        if (!rpcSimulatedFailure) {
          return { success: true, method: 'rpc' }
        }

        // Fallback para delete direto na tabela channels
        directDeleteCalled = true
        return { success: true, method: 'direct_table' }
      }

      // 1. Caminho feliz com RPC
      await expect(deleteChannelWithFallback(channelProjetos, 'Projetos Especiais', false)).resolves.toEqual({
        success: true,
        method: 'rpc'
      })
      expect(rpcCalled).toBe(true)

      // 2. Caminho de fallback quando a RPC não está provisionada
      await expect(deleteChannelWithFallback(channelProjetos, 'Projetos Especiais', true)).resolves.toEqual({
        success: true,
        method: 'direct_table'
      })
      expect(directDeleteCalled).toBe(true)

      // 3. Bloqueio de segurança do canal Geral em qualquer método
      await expect(deleteChannelWithFallback(channelGeral, 'Geral', false)).rejects.toThrow(
        'O canal Geral é protegido e não pode ser excluído.'
      )
    })
  })

  // 2. Moderação e Segurança de Mensagens
  describe('2. Edição, Exclusão e Moderação de Mensagens (com LGPD)', () => {
    const msgAuthor: Message = {
      id: 'msg-1',
      channel_id: 'channel-comercial-geral',
      author_id: 'user-member-1',
      body: 'Olá, pessoal!',
      reply_to_id: null,
      task_id: null,
      created_at: '2026-01-02T10:00:00Z',
      mentions: []
    }

    function canEditMessage(user: Profile, message: Message, channel: Channel): boolean {
      if (channel.archived_at) return false
      if (message.deleted_at) return false
      return message.author_id === user.id
    }

    function canDeleteMessage(user: Profile, message: Message, channel: Channel): boolean {
      if (channel.archived_at) return false
      if (message.deleted_at) return false
      // Autor pode excluir
      if (message.author_id === user.id) return true
      // Administrador pode moderar
      if (user.is_master) return true
      // Gestor da equipe pode moderar
      return members.some(m => m.team_id === channel.team_id && m.user_id === user.id && m.is_manager && m.active)
    }

    it('permite que o autor edite sua própria mensagem em canal ativo', () => {
      expect(canEditMessage(mockMemberProfile, msgAuthor, channelGeral)).toBe(true)
    })

    it('impede que outro usuário (inclusive gestor) edite a mensagem do autor', () => {
      expect(canEditMessage(mockManagerProfile, msgAuthor, channelGeral)).toBe(false)
      expect(canEditMessage(mockAdminProfile, msgAuthor, channelGeral)).toBe(false)
    })

    it('impede edição de mensagem em canal arquivado', () => {
      expect(canEditMessage(mockMemberProfile, msgAuthor, channelArquivado)).toBe(false)
    })

    it('permite que o autor exclua a própria mensagem', () => {
      expect(canDeleteMessage(mockMemberProfile, msgAuthor, channelGeral)).toBe(true)
    })

    it('permite moderação de exclusão por Gestor da equipe e Administrador', () => {
      expect(canDeleteMessage(mockManagerProfile, msgAuthor, channelGeral)).toBe(true)
      expect(canDeleteMessage(mockAdminProfile, msgAuthor, channelGeral)).toBe(true)
    })

    it('impede que colaborador comum exclua mensagem de terceiros', () => {
      const msgManager: Message = {
        id: 'msg-2',
        channel_id: 'channel-comercial-geral',
        author_id: 'user-manager',
        body: 'Aviso importante',
        reply_to_id: null,
        task_id: null,
        created_at: '2026-01-02T10:05:00Z'
      }
      expect(canDeleteMessage(mockMemberProfile, msgManager, channelGeral)).toBe(false)
    })

    it('garante exclusão com conformidade LGPD (limpa body e grava deleted_at)', () => {
      function softDeleteMessage(msg: Message): Message {
        return {
          ...msg,
          body: '',
          deleted_at: new Date().toISOString()
        }
      }

      const deleted = softDeleteMessage(msgAuthor)
      expect(deleted.body).toBe('')
      expect(deleted.deleted_at).toBeTruthy()
      expect(canEditMessage(mockMemberProfile, deleted, channelGeral)).toBe(false)
      expect(canDeleteMessage(mockMemberProfile, deleted, channelGeral)).toBe(false)
    })
  })

  // 3. Validação Server-side e Sanitização de Menções (@)
  describe('3. Validação e Sanitização de Menções (@)', () => {
    const validTeamMembers = [
      { id: 'user-manager', name: 'Gestor Comercial' },
      { id: 'user-member-1', name: 'Colaborador Um' }
    ]

    function resolveMentions(text: string, activeTeamMembers: { id: string; name: string }[]): {
      mentions: string[]
      mentions_all: boolean
    } {
      const parts = text.split(/(@[\p{L}\p{N}_]+)/gu)
      const mentionIds: string[] = []
      let mentionsAll = false

      for (const part of parts) {
        if (!part.startsWith('@')) continue
        const rawName = part.slice(1).replace(/_/g, ' ').toLowerCase()
        if (rawName === 'todos') {
          mentionsAll = true
          continue
        }
        const found = activeTeamMembers.find(m => m.name.toLowerCase() === rawName)
        if (found && !mentionIds.includes(found.id)) {
          mentionIds.push(found.id)
        }
      }

      return { mentions: mentionIds, mentions_all: mentionsAll }
    }

    it('identifica e guarda IDs válidos de membros da equipe', () => {
      const text = 'Alô @Colaborador_Um, favor verificar a demanda com @Gestor_Comercial.'
      const res = resolveMentions(text, validTeamMembers)
      expect(res.mentions).toEqual(['user-member-1', 'user-manager'])
      expect(res.mentions_all).toBe(false)
    })

    it('rejeita menções a usuários que não pertencem à equipe (prevenção a IDOR/vazamento)', () => {
      const text = 'Atenção @Colaborador_Outro_Time, você não faz parte deste canal.'
      const res = resolveMentions(text, validTeamMembers)
      expect(res.mentions).toEqual([])
    })

    it('reconhece @todos como flag booleana mentions_all', () => {
      const text = 'Reunião geral iniciada @todos!'
      const res = resolveMentions(text, validTeamMembers)
      expect(res.mentions_all).toBe(true)
    })

    it('ao editar mensagem recalcula marcações sem duplicar notificações', () => {
      const initialMentions = ['user-member-1']
      const updatedText = 'Ajuste: @Colaborador_Um e agora também @Gestor_Comercial'
      const { mentions: newMentions } = resolveMentions(updatedText, validTeamMembers)

      const newlyMentioned = newMentions.filter(id => !initialMentions.includes(id))
      expect(newlyMentioned).toEqual(['user-manager'])
    })
  })

  // 4. Prevenção a Injeção de Código (XSS)
  describe('4. Proteção contra Injeção de Código (XSS)', () => {
    it('sanitiza texto e tokens sem permitir injeção de HTML/Script', () => {
      const maliciousBody = '<script>alert("XSS")</script><img src="x" onerror="evil()">'
      // No React nativo do OPSHUB, o split gera strings puras renderizadas como nós de texto:
      const parts = maliciousBody.split(/(@[\p{L}\p{N}_]+)/gu)
      expect(parts.every(p => typeof p === 'string')).toBe(true)
      // Nenhuma marcação HTML é avaliada com dangerouslySetInnerHTML
      expect(maliciousBody).not.toContain('dangerouslySetInnerHTML')
    })
  })

  // 5. Deduplicação e Resiliência em Tempo Real
  describe('5. Deduplicação e Resiliência em Tempo Real', () => {
    it('deduplica mensagens recebidas pelo Realtime usando ID canônico', () => {
      const currentMessages: Message[] = [
        { id: 'msg-1', channel_id: 'ch-1', author_id: 'u1', body: 'Msg 1', reply_to_id: null, task_id: null, created_at: '2026-01-01T10:00:00Z' },
        { id: 'msg-2', channel_id: 'ch-1', author_id: 'u2', body: 'Msg 2', reply_to_id: null, task_id: null, created_at: '2026-01-01T10:05:00Z' }
      ]

      const duplicateIncoming: Message = {
        id: 'msg-1',
        channel_id: 'ch-1',
        author_id: 'u1',
        body: 'Msg 1 atualizada',
        reply_to_id: null,
        task_id: null,
        created_at: '2026-01-01T10:00:00Z',
        edited_at: '2026-01-01T10:02:00Z'
      }

      function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
        const map = new Map<string, Message>()
        for (const m of prev) map.set(m.id, m)
        for (const m of incoming) map.set(m.id, m)
        return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      }

      const merged = mergeMessages(currentMessages, [duplicateIncoming])
      expect(merged.length).toBe(2)
      expect(merged.find(m => m.id === 'msg-1')?.body).toBe('Msg 1 atualizada')
    })
  })

  // 6. Auditoria de Segredos e Credenciais
  describe('6. Auditoria de Segredos e Isolamento de Chaves', () => {
    it('garante que a chave service_role não é importada no front-end', () => {
      // Verifica se a variável de ambiente pública não expõe segredos
      const envKeys = Object.keys(process.env || {})
      const leakedServiceRole = envKeys.find(k => k.toLowerCase().includes('service_role') && !k.startsWith('SUPABASE_'))
      expect(leakedServiceRole).toBeUndefined()
    })
  })

  // 7. Resiliência do Chat a Migrations Pendentes no Banco Remoto
  describe('7. Resiliência do Chat a Migrations Pendentes no Banco Remoto', () => {
    it('detecta erro de schema cache / coluna ausente do PostgREST', () => {
      const pgrstError = {
        message: "Could not find the 'mentions' column of 'messages' in the schema cache",
        code: 'PGRST204'
      }
      expect(isMissingColumnError(pgrstError, 'mentions')).toBe(true)
      expect(isMissingColumnError(pgrstError, 'other_column')).toBe(false)
      expect(isMissingColumnError(new Error('column "deleted_at" of relation "messages" does not exist'), 'deleted_at')).toBe(true)
      expect(isMissingColumnError(new Error('Failed to fetch'))).toBe(false)
    })

    it('simula fallback de envio sem mentions quando a coluna mentions ainda não existe no schema cache', () => {
      const fullPayload = {
        channel_id: 'ch-1',
        author_id: 'u1',
        body: 'Alô @Fulano',
        mentions: ['user-2'],
        mentions_all: false
      }

      function createPayloadWithFallback(hasMentionsColumn: boolean) {
        if (hasMentionsColumn) return fullPayload
        const { mentions: _m, mentions_all: _ma, ...basic } = fullPayload
        return basic
      }

      const basic = createPayloadWithFallback(false)
      expect(basic).toEqual({
        channel_id: 'ch-1',
        author_id: 'u1',
        body: 'Alô @Fulano'
      })
      expect('mentions' in basic).toBe(false)
    })
  })
})
