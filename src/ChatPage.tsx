import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Search, Plus, X, Send, Paperclip, MoreHorizontal, Pencil,
  Trash2, Archive, RotateCcw, BellOff, Bell, Users, AtSign,
  ClipboardList, ArrowRight, ChevronDown, ChevronRight, AlertTriangle,
  Menu, CornerDownRight
} from 'lucide-react'
import {
  supabase, timeBR, messageError, unreadChannelMetrics, isMissingColumnError
} from './lib'
import type {
  Attachment, Channel, Data, Message, Task, ChannelMetrics
} from './lib'
import './chat.css'

interface ChatPageProps {
  data: Data
  session?: Session | null
  demoMode?: boolean
  canAdmin: boolean
  canManageTeam: (teamId: string) => boolean
  onTaskSelect?: (task: Task) => void
  onReload?: () => Promise<void>
  onNotify?: (message: string) => void
  onError?: (message: string) => void
}

function getInitials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDateSeparator(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    const isToday = d.toDateString() === today.toDateString()
    const isYesterday = d.toDateString() === yesterday.toDateString()

    if (isToday) return 'Hoje'
    if (isYesterday) return 'Ontem'

    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    }).format(d)
  } catch {
    return dateStr
  }
}

export default function ChatPage({
  data,
  session,
  demoMode = false,
  canAdmin,
  canManageTeam,
  onTaskSelect,
  onReload,
  onNotify,
  onError,
}: ChatPageProps) {
  const currentUserId = session?.user?.id || 'demo-user'
  const isDemo = demoMode || !session?.user?.id

  // 1. Estados de navegação e seleção de canal
  const [selectedChannelId, setSelectedChannelId] = useState<string>(() => {
    return data.channels[0]?.id || ''
  })
  const [channelSearch, setChannelSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedArchives, setExpandedArchives] = useState<Record<string, boolean>>({})
  const [mutedChannels, setMutedChannels] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('somax_muted_channels') || '{}')
    } catch {
      return {}
    }
  })

  // 2. Métricas de canais (não lidas e menções @n)
  const [channelMetrics, setChannelMetrics] = useState<Record<string, ChannelMetrics>>({})

  // 3. Mensagens e anexos
  const [messages, setMessages] = useState<Message[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [messageSearch, setMessageSearch] = useState('')
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)

  // 4. Edição de mensagens e respostas
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')

  // 5. Compositor e rascunhos por canal
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const currentDraft = drafts[selectedChannelId] || ''
  const [linkedTaskId, setLinkedTaskId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSending, setIsSending] = useState(false)

  // 6. Autocomplete de Menção (@)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  // 7. Modais de Gestão de Canal
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false)
  const [createChannelTeamId, setCreateChannelTeamId] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDescription, setNewChannelDescription] = useState('')

  const [editChannelModalOpen, setEditChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [editChannelDesc, setEditChannelDesc] = useState('')

  const [deleteChannelModalOpen, setDeleteChannelModalOpen] = useState(false)
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')
  const [isDeletingChannel, setIsDeletingChannel] = useState(false)

  const [membersModalOpen, setMembersModalOpen] = useState(false)

  // 8. Menus de contexto de canais
  const [activeMenuChannelId, setActiveMenuChannelId] = useState<string | null>(null)

  // 9. Refs
  const streamRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const latestMessageRef = useRef<string>('')
  const selectedChannelIdRef = useRef(selectedChannelId)
  selectedChannelIdRef.current = selectedChannelId

  // Garantir canal selecionado válido
  useEffect(() => {
    if (!data.channels.some(c => c.id === selectedChannelId)) {
      if (data.channels[0]) setSelectedChannelId(data.channels[0].id)
    }
  }, [data.channels, selectedChannelId])

  const currentChannel = useMemo(() => {
    return data.channels.find(c => c.id === selectedChannelId)
  }, [data.channels, selectedChannelId])

  const currentTeam = useMemo(() => {
    if (!currentChannel) return undefined
    return data.teams.find(t => t.id === currentChannel.team_id)
  }, [data.teams, currentChannel])

  const teamMembers = useMemo(() => {
    if (!currentChannel) return []
    return data.members
      .filter(m => m.team_id === currentChannel.team_id && m.active)
      .map(m => {
        const profile = data.profiles.find(p => p.id === m.user_id)
        return {
          member: m,
          profile: profile || {
            id: m.user_id,
            full_name: 'Usuário',
            role: 'colaborador',
            active: true
          }
        }
      })
  }, [data.members, data.profiles, currentChannel])

  // Salvar rascunho de texto por canal
  const updateDraft = (text: string) => {
    setDrafts(prev => ({ ...prev, [selectedChannelId]: text }))
  }

  // Alternar mudo de canal
  const toggleMuteChannel = (channelId: string) => {
    setMutedChannels(prev => {
      const next = { ...prev, [channelId]: !prev[channelId] }
      try {
        localStorage.setItem('somax_muted_channels', JSON.stringify(next))
      } catch {}
      return next
    })
    setActiveMenuChannelId(null)
    onNotify?.('Preferência de notificações do canal atualizada.')
  }

  // Carregar métricas de mensagens não lidas
  const refreshMetrics = useCallback(async () => {
    if (isDemo) {
      // Simulação em modo demo
      const simulated: Record<string, ChannelMetrics> = {}
      data.channels.forEach((c, idx) => {
        simulated[c.id] = {
          unread_count: idx === 1 ? 2 : 0,
          mention_count: idx === 1 ? 1 : 0
        }
      })
      setChannelMetrics(simulated)
      return
    }

    try {
      const metrics = await unreadChannelMetrics()
      setChannelMetrics(metrics)
    } catch {
      // Falha silenciosa
    }
  }, [isDemo, data.channels])

  useEffect(() => {
    void refreshMetrics()
  }, [refreshMetrics])

  // Marcar canal atual como lido
  const markChannelAsRead = useCallback(async (channelId: string) => {
    if (!channelId) return
    setChannelMetrics(prev => ({
      ...prev,
      [channelId]: { unread_count: 0, mention_count: 0 }
    }))

    if (!isDemo && session?.user?.id) {
      try {
        await supabase.from('message_reads').upsert({
          channel_id: channelId,
          user_id: session.user.id,
          last_read_at: new Date().toISOString()
        }, { onConflict: 'channel_id,user_id' })
      } catch {}
    }
  }, [isDemo, session])

  // Carregar anexos
  const loadAttachments = useCallback(async (messageIds: string[]) => {
    if (!messageIds.length || isDemo) return
    try {
      const { data: rows, error } = await supabase
        .from('attachments')
        .select('*')
        .in('message_id', messageIds)
      if (error) return
      if (rows) {
        setAttachments(prev => {
          const map = new Map(prev.map(a => [a.id, a]))
          rows.forEach((a: Attachment) => map.set(a.id, a))
          return Array.from(map.values())
        })
      }
    } catch {}
  }, [isDemo])

  // Mesclar mensagens evitando duplicações
  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages(prev => {
      const map = new Map(prev.map(m => [m.id, m]))
      incoming.forEach(m => map.set(m.id, m))
      return Array.from(map.values()).sort((a, b) => {
        return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      })
    })
  }, [])

  // Carregar mensagens do canal selecionado
  const loadChannelMessages = useCallback(async (channelId: string) => {
    if (!channelId) return

    if (isDemo) {
      // Mensagens de exemplo no modo demo
      const demoMessages: Message[] = [
        {
          id: `demo-msg-1-${channelId}`,
          channel_id: channelId,
          author_id: data.profiles[0]?.id || 'user-1',
          body: 'Olá equipe! Sejam bem-vindos a este canal de comunicação.',
          reply_to_id: null,
          task_id: null,
          created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          mentions: []
        },
        {
          id: `demo-msg-2-${channelId}`,
          channel_id: channelId,
          author_id: data.profiles[1]?.id || 'user-2',
          body: 'Tudo pronto para o alinhamento das entregas deste mês!',
          reply_to_id: null,
          task_id: null,
          created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          mentions: []
        }
      ]
      setMessages(demoMessages)
      setHasMoreMessages(false)
      void markChannelAsRead(channelId)
      return
    }

    try {
      const { data: rows, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(40)

      if (error) {
        onError?.(error.message)
        return
      }

      const items = (rows || []) as Message[]
      items.reverse()
      setMessages(items)
      setHasMoreMessages(items.length === 40)

      const latest = items[items.length - 1]?.created_at
      if (latest) latestMessageRef.current = latest

      void loadAttachments(items.map(m => m.id))
      void markChannelAsRead(channelId)
    } catch (e: unknown) {
      onError?.(messageError(e))
    }
  }, [isDemo, data.profiles, loadAttachments, markChannelAsRead, onError])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedChannelId || isDemo || isLoadingOlder || !hasMoreMessages || messages.length === 0) return
    setIsLoadingOlder(true)
    try {
      const oldestCreated = messages[0]?.created_at
      const { data: rows, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', selectedChannelId)
        .lt('created_at', oldestCreated)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(40)

      if (error) {
        onError?.(error.message)
        return
      }
      const older = ((rows || []) as Message[]).reverse()
      if (older.length < 40) setHasMoreMessages(false)
      if (older.length > 0) {
        setMessages(prev => [...older, ...prev])
        void loadAttachments(older.map(m => m.id))
      }
    } catch (e: unknown) {
      onError?.(messageError(e))
    } finally {
      setIsLoadingOlder(false)
    }
  }, [selectedChannelId, isDemo, isLoadingOlder, hasMoreMessages, messages, loadAttachments, onError])

  // Efeito ao trocar de canal
  useEffect(() => {
    if (!selectedChannelId) return
    setReplyingTo(null)
    setEditingMessageId(null)
    setMessageSearch('')
    void loadChannelMessages(selectedChannelId)
  }, [selectedChannelId, loadChannelMessages])

  // Assinatura em Tempo Real (INSERT, UPDATE, DELETE)
  useEffect(() => {
    if (isDemo || !selectedChannelId) return

    const channelSubscription = supabase
      .channel(`chat-realtime-${selectedChannelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${selectedChannelId}`
      }, payload => {
        const incoming = payload.new as Message
        mergeMessages([incoming])
        if (incoming.created_at > latestMessageRef.current) {
          latestMessageRef.current = incoming.created_at
        }
        void loadAttachments([incoming.id])
        void markChannelAsRead(selectedChannelId)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${selectedChannelId}`
      }, payload => {
        const updated = payload.new as Message
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${selectedChannelId}`
      }, payload => {
        const deletedId = (payload.old as { id: string })?.id
        if (deletedId) {
          setMessages(prev => prev.filter(m => m.id !== deletedId))
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'attachments'
      }, payload => {
        const newAttachment = payload.new as Attachment
        setAttachments(prev => [...prev.filter(a => a.id !== newAttachment.id), newAttachment])
      })
      .subscribe()

    const onOnline = () => void loadChannelMessages(selectedChannelId)
    window.addEventListener('online', onOnline)

    return () => {
      window.removeEventListener('online', onOnline)
      void supabase.removeChannel(channelSubscription)
    }
  }, [isDemo, selectedChannelId, mergeMessages, loadAttachments, markChannelAsRead, loadChannelMessages])

  // Rolagem automática inteligente
  useEffect(() => {
    const el = streamRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // ============================================================================
  // PASSO 3: GESTÃO DE CANAIS (CRIAR, EDITAR, ARQUIVAR, RESTAURAR, EXCLUIR)
  // ============================================================================

  const handleOpenCreateChannel = (teamId: string) => {
    setCreateChannelTeamId(teamId)
    setNewChannelName('')
    setNewChannelDescription('')
    setCreateChannelModalOpen(true)
  }

  const handleCreateChannel = async (e: FormEvent) => {
    e.preventDefault()
    const cleanName = newChannelName.trim()
    if (!cleanName || !createChannelTeamId) return

    if (cleanName.toLowerCase() === 'geral') {
      onError?.('O nome "Geral" é reservado para o canal padrão da equipe.')
      return
    }

    if (isDemo) {
      const newId = `channel-demo-${Date.now()}`
      const createdChan: Channel = {
        id: newId,
        team_id: createChannelTeamId,
        name: cleanName,
        description: newChannelDescription.trim() || null,
        created_at: new Date().toISOString()
      }
      data.channels.push(createdChan)
      setSelectedChannelId(newId)
      setCreateChannelModalOpen(false)
      onNotify?.(`Canal #${cleanName} criado com sucesso.`)
      return
    }

    try {
      let inserted: Channel | null = null
      const { data: fullInserted, error: fullError } = await supabase
        .from('channels')
        .insert({
          team_id: createChannelTeamId,
          name: cleanName,
          description: newChannelDescription.trim() || null,
          created_by: currentUserId
        })
        .select('*')
        .single()

      if (!fullError && fullInserted) {
        inserted = fullInserted as Channel
      } else if (fullError) {
        if (isMissingColumnError(fullError, 'description')) {
          const { data: basicInserted, error: basicError } = await supabase
            .from('channels')
            .insert({
              team_id: createChannelTeamId,
              name: cleanName,
              created_by: currentUserId
            })
            .select('*')
            .single()
          if (basicError) throw basicError
          inserted = basicInserted as Channel
        } else {
          throw fullError
        }
      }

      setCreateChannelModalOpen(false)
      await onReload?.()
      if (inserted?.id) setSelectedChannelId(inserted.id)
      onNotify?.(`Canal #${cleanName} criado com sucesso.`)
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  const handleOpenEditChannel = (channel: Channel) => {
    setEditingChannel(channel)
    setEditChannelName(channel.name)
    setEditChannelDesc(channel.description || '')
    setEditChannelModalOpen(true)
    setActiveMenuChannelId(null)
  }

  const handleSaveEditChannel = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingChannel) return
    const cleanName = editChannelName.trim()
    if (!cleanName) return

    if (editingChannel.name.toLowerCase() === 'geral' && cleanName.toLowerCase() !== 'geral') {
      onError?.('O canal Geral não pode ser renomeado.')
      return
    }

    if (isDemo) {
      editingChannel.name = cleanName
      editingChannel.description = editChannelDesc.trim() || null
      setEditChannelModalOpen(false)
      onNotify?.('Canal atualizado com sucesso.')
      return
    }

    try {
      const { error: fullError } = await supabase
        .from('channels')
        .update({
          name: cleanName,
          description: editChannelDesc.trim() || null
        })
        .eq('id', editingChannel.id)

      if (fullError) {
        if (isMissingColumnError(fullError, 'description')) {
          const { error: basicError } = await supabase
            .from('channels')
            .update({ name: cleanName })
            .eq('id', editingChannel.id)
          if (basicError) throw basicError
        } else {
          throw fullError
        }
      }

      setEditChannelModalOpen(false)
      await onReload?.()
      onNotify?.('Canal atualizado com sucesso.')
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  const handleToggleArchiveChannel = async (channel: Channel) => {
    if (channel.name.toLowerCase() === 'geral') {
      onError?.('O canal Geral não pode ser arquivado.')
      return
    }

    const isArchived = Boolean(channel.archived_at)
    const newArchivedAt = isArchived ? null : new Date().toISOString()

    if (isDemo) {
      channel.archived_at = newArchivedAt
      setActiveMenuChannelId(null)
      onNotify?.(isArchived ? `Canal #${channel.name} restaurado.` : `Canal #${channel.name} arquivado.`)
      return
    }

    try {
      const { error } = await supabase
        .from('channels')
        .update({ archived_at: newArchivedAt })
        .eq('id', channel.id)

      if (error) {
        if (isMissingColumnError(error, 'archived_at')) {
          onError?.('Para arquivar canais, aplique a migration de chat no Supabase (coluna archived_at pendente).')
          return
        }
        throw error
      }

      setActiveMenuChannelId(null)
      setEditChannelModalOpen(false)
      await onReload?.()
      onNotify?.(isArchived ? `Canal #${channel.name} restaurado.` : `Canal #${channel.name} arquivado.`)
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  const handleOpenDeleteChannel = (channel: Channel) => {
    if (channel.name.toLowerCase() === 'geral') {
      onError?.('O canal Geral não pode ser excluído.')
      return
    }
    setChannelToDelete(channel)
    setDeleteConfirmationText('')
    setDeleteChannelModalOpen(true)
    setActiveMenuChannelId(null)
  }

  const handleConfirmDeleteChannel = async (e: FormEvent) => {
    e.preventDefault()
    if (!channelToDelete) return

    if (deleteConfirmationText.trim().toLowerCase() !== channelToDelete.name.trim().toLowerCase()) {
      onError?.('O nome digitado não confere exatamente com o nome do canal.')
      return
    }

    setIsDeletingChannel(true)
    try {
      if (isDemo) {
        const idx = data.channels.findIndex(c => c.id === channelToDelete.id)
        if (idx !== -1) data.channels.splice(idx, 1)
        setDeleteChannelModalOpen(false)
        setEditChannelModalOpen(false)
        setSelectedChannelId(data.channels[0]?.id || '')
        onNotify?.(`Canal #${channelToDelete.name} excluído definitivamente.`)
        return
      }

      // 1. Tentar expurgar anexos do storage bucket 'chat-private' (se houver)
      try {
        const { data: messages } = await supabase
          .from('messages')
          .select('id')
          .eq('channel_id', channelToDelete.id)
        const messageIds = (messages || []).map((m: { id: string }) => m.id)
        if (messageIds.length > 0) {
          const { data: attachments } = await supabase
            .from('attachments')
            .select('storage_path')
            .in('message_id', messageIds)
          const paths = (attachments || [])
            .map((a: { storage_path?: string }) => a.storage_path)
            .filter((p): p is string => Boolean(p))
          if (paths.length > 0) {
            await supabase.storage.from('chat-private').remove(paths)
          }
        }
      } catch (storageErr) {
        console.warn('Aviso não impeditivo ao limpar arquivos físicos do storage:', storageErr)
      }

      // 2. Tentar exclusão atômica via RPC delete_channel_atomic
      let deleteSuccess = false
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_channel_atomic', {
        p_channel_id: channelToDelete.id,
        p_confirmation_name: deleteConfirmationText.trim()
      })

      if (!rpcError && (rpcData as { success?: boolean })?.success !== false) {
        deleteSuccess = true
      } else {
        // Fallback: se a RPC não existir ainda no banco ou der erro de função não encontrada,
        // realiza a exclusão direta pela tabela channels (protegida por RLS e trigger do canal Geral)
        const { error: directError } = await supabase
          .from('channels')
          .delete()
          .eq('id', channelToDelete.id)

        if (directError) {
          throw rpcError || directError
        }
        deleteSuccess = true
      }

      if (deleteSuccess) {
        setDeleteChannelModalOpen(false)
        setEditChannelModalOpen(false)
        await onReload?.()
        setSelectedChannelId(data.channels.find(c => c.id !== channelToDelete.id)?.id || '')
        onNotify?.(`Canal #${channelToDelete.name} e suas mensagens foram excluídos definitivamente.`)
      }
    } catch (err: unknown) {
      onError?.(messageError(err))
    } finally {
      setIsDeletingChannel(false)
    }
  }

  // ============================================================================
  // PASSO 4: MENSAGENS, EDIÇÃO, SOFT-DELETE E MARCAÇÕES (@)
  // ============================================================================

  // Processar texto digitado para busca de @menção
  const handleComposerChange = (text: string) => {
    updateDraft(text)
    const match = /@([\p{L}\p{N}_]*)$/u.exec(text)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setMentionOpen(true)
      setMentionIndex(0)
    } else {
      setMentionOpen(false)
    }
  }

  // Candidatos a menção filtrados
  const mentionCandidates = useMemo(() => {
    if (!mentionOpen) return []
    const q = mentionQuery.trim().toLowerCase()
    const list: { id: string; name: string; role: string; isAll?: boolean }[] = []

    if ('todos'.includes(q)) {
      list.push({ id: 'all', name: 'todos', role: 'Notifica toda a equipe', isAll: true })
    }

    teamMembers.forEach(({ profile, member }) => {
      if (!q || profile.full_name.toLowerCase().includes(q)) {
        list.push({
          id: profile.id,
          name: profile.full_name,
          role: member.is_manager ? 'Gestor' : profile.role === 'administrador' ? 'Admin' : 'Colaborador'
        })
      }
    })

    return list.slice(0, 7)
  }, [mentionOpen, mentionQuery, teamMembers])

  // Inserir menção no texto
  const insertMention = (candidate: { id: string; name: string; isAll?: boolean }) => {
    const text = currentDraft
    const replaced = text.replace(/@([\p{L}\p{N}_]*)$/u, `@${candidate.name.replace(/\s+/g, '_')} `)
    updateDraft(replaced)
    setMentionOpen(false)
    composerInputRef.current?.focus()
  }

  // Teclado na menção ou envio
  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(prev => (prev + 1) % mentionCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = mentionCandidates[mentionIndex]
        if (selected) insertMention(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendMessage()
    }
  }

  // Extrair IDs de menção a partir do texto
  const resolveMentionsFromText = (text: string) => {
    const mentions: string[] = []
    let mentionsAll = false

    const matches = text.match(/@([\p{L}\p{N}_]+)/gu) || []
    matches.forEach(m => {
      const name = m.slice(1).replace(/_/g, ' ').toLowerCase()
      if (name === 'todos') {
        mentionsAll = true
      } else {
        const found = teamMembers.find(tm => tm.profile.full_name.toLowerCase() === name)
        if (found && !mentions.includes(found.profile.id)) {
          mentions.push(found.profile.id)
        }
      }
    })

    return { mentions, mentionsAll }
  }

  // Enviar Mensagem
  const handleSendMessage = async () => {
    const text = currentDraft.trim()
    if ((!text && !linkedTaskId && !selectedFile) || !selectedChannelId || isSending) return

    if (currentChannel?.archived_at) {
      onError?.('Este canal está arquivado e não recebe novas mensagens.')
      return
    }

    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      onError?.('O arquivo selecionado deve ter até 10 MB.')
      return
    }

    setIsSending(true)
    const { mentions, mentionsAll } = resolveMentionsFromText(text)

    if (isDemo) {
      const newMsg: Message = {
        id: `demo-msg-${Date.now()}`,
        channel_id: selectedChannelId,
        author_id: currentUserId,
        body: text || (selectedFile ? `📎 ${selectedFile.name}` : ''),
        reply_to_id: replyingTo?.id || null,
        task_id: linkedTaskId || null,
        created_at: new Date().toISOString(),
        mentions,
        mentions_all: mentionsAll
      }
      mergeMessages([newMsg])
      updateDraft('')
      setReplyingTo(null)
      setLinkedTaskId('')
      setSelectedFile(null)
      setIsSending(false)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    let saved = false
    let uploadedPath = ''

    try {
      let created: Message | null = null

      const fullPayload = {
        channel_id: selectedChannelId,
        author_id: currentUserId,
        body: text || (selectedFile ? `📎 ${selectedFile.name}` : ''),
        reply_to_id: replyingTo?.id || null,
        task_id: linkedTaskId || null,
        mentions,
        mentions_all: mentionsAll
      }

      const { data: fullCreated, error: fullError } = await supabase
        .from('messages')
        .insert(fullPayload)
        .select('*')
        .single()

      if (!fullError && fullCreated) {
        created = fullCreated as Message
      } else if (fullError) {
        // Fallback gracioso caso a migration de mentions ainda não esteja aplicada no schema cache
        if (isMissingColumnError(fullError, 'mentions') || isMissingColumnError(fullError, 'mentions_all')) {
          const basicPayload = {
            channel_id: selectedChannelId,
            author_id: currentUserId,
            body: text || (selectedFile ? `📎 ${selectedFile.name}` : ''),
            reply_to_id: replyingTo?.id || null,
            task_id: linkedTaskId || null
          }
          const { data: basicCreated, error: basicError } = await supabase
            .from('messages')
            .insert(basicPayload)
            .select('*')
            .single()

          if (basicError) throw basicError
          created = {
            ...(basicCreated as Message),
            mentions,
            mentions_all: mentionsAll
          }
        } else {
          throw fullError
        }
      }

      if (!created) throw new Error('Não foi possível registrar a mensagem.')
      saved = true
      mergeMessages([created])

      updateDraft('')
      setReplyingTo(null)
      setLinkedTaskId('')

      // Upload de arquivo anexo
      if (selectedFile) {
        const cleanFileName = selectedFile.name.replace(/[^\w.\-]/g, '_')
        const path = `${currentUserId}/${selectedChannelId}/${created.id}/${crypto.randomUUID()}-${cleanFileName}`
        const upload = await supabase.storage
          .from('chat-private')
          .upload(path, selectedFile, { contentType: selectedFile.type, upsert: false })

        if (upload.error) throw upload.error
        uploadedPath = path

        const { data: attachRow, error: attachError } = await supabase
          .from('attachments')
          .insert({
            message_id: created.id,
            uploader_id: currentUserId,
            storage_path: path,
            file_name: selectedFile.name,
            content_type: selectedFile.type,
            size_bytes: selectedFile.size
          })
          .select('*')
          .single()

        if (attachError) throw attachError
        setAttachments(prev => [...prev, attachRow as Attachment])
        setSelectedFile(null)
      }

      await markChannelAsRead(selectedChannelId)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (err: unknown) {
      if (uploadedPath) {
        void supabase.storage.from('chat-private').remove([uploadedPath])
      }
      onError?.(
        `${saved ? 'Mensagem salva, mas o upload falhou' : 'Não foi possível enviar a mensagem'}: ${messageError(err)}`
      )
    } finally {
      setIsSending(false)
    }
  }

  // Iniciar Edição de Mensagem
  const handleStartEditMessage = (msg: Message) => {
    if (msg.deleted_at) return
    setEditingMessageId(msg.id)
    setEditingMessageText(msg.body)
  }

  // Salvar Edição de Mensagem
  const handleSaveEditMessage = async (msgId: string) => {
    const text = editingMessageText.trim()
    if (!text) return

    const { mentions, mentionsAll } = resolveMentionsFromText(text)

    if (isDemo) {
      setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
          return {
            ...m,
            body: text,
            edited_at: new Date().toISOString(),
            mentions,
            mentions_all: mentionsAll
          }
        }
        return m
      }))
      setEditingMessageId(null)
      onNotify?.('Mensagem editada.')
      return
    }

    try {
      let updated: Message | null = null
      const { data: fullUpdated, error: fullError } = await supabase
        .from('messages')
        .update({
          body: text,
          mentions,
          mentions_all: mentionsAll
        })
        .eq('id', msgId)
        .select('*')
        .single()

      if (!fullError && fullUpdated) {
        updated = fullUpdated as Message
      } else if (fullError) {
        if (isMissingColumnError(fullError, 'mentions') || isMissingColumnError(fullError, 'mentions_all') || isMissingColumnError(fullError, 'edited_at')) {
          const { data: basicUpdated, error: basicError } = await supabase
            .from('messages')
            .update({ body: text })
            .eq('id', msgId)
            .select('*')
            .single()
          if (basicError) throw basicError
          updated = {
            ...(basicUpdated as Message),
            body: text,
            edited_at: new Date().toISOString(),
            mentions,
            mentions_all: mentionsAll
          }
        } else {
          throw fullError
        }
      }

      if (updated) {
        setMessages(prev => prev.map(m => m.id === msgId ? updated! : m))
        setEditingMessageId(null)
        onNotify?.('Mensagem editada com sucesso.')
      }
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  // Excluir Mensagem (Soft-Delete com LGPD)
  const handleDeleteMessage = async (msg: Message) => {
    const confirmed = window.confirm('Deseja realmente remover esta mensagem?')
    if (!confirmed) return

    if (isDemo) {
      setMessages(prev => prev.map(m => {
        if (m.id === msg.id) {
          return {
            ...m,
            body: '',
            deleted_at: new Date().toISOString(),
            mentions: [],
            mentions_all: false
          }
        }
        return m
      }))
      onNotify?.('Mensagem removida.')
      return
    }

    try {
      let updated: Message | null = null
      const { data: fullUpdated, error: fullError } = await supabase
        .from('messages')
        .update({
          deleted_at: new Date().toISOString()
        })
        .eq('id', msg.id)
        .select('*')
        .single()

      if (!fullError && fullUpdated) {
        updated = fullUpdated as Message
      } else if (fullError) {
        if (isMissingColumnError(fullError, 'deleted_at')) {
          // Se deleted_at não existe no banco antigo, faz remoção física no banco legado
          const { error: delError } = await supabase
            .from('messages')
            .delete()
            .eq('id', msg.id)
          if (delError) throw delError
          setMessages(prev => prev.filter(m => m.id !== msg.id))
          onNotify?.('Mensagem removida com sucesso.')
          return
        } else {
          throw fullError
        }
      }

      if (updated) {
        setMessages(prev => prev.map(m => m.id === msg.id ? updated! : m))
        onNotify?.('Mensagem removida com sucesso.')
      }
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  // Abrir anexo assinado
  const handleOpenAttachment = async (a: Attachment) => {
    if (isDemo) {
      alert(`[Modo Demonstração] Visualizando anexo: ${a.file_name}`)
      return
    }
    try {
      const { data: link, error } = await supabase.storage
        .from('chat-private')
        .createSignedUrl(a.storage_path, 60)
      if (error) throw error
      if (link?.signedUrl) {
        window.open(link.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err: unknown) {
      onError?.(messageError(err))
    }
  }

  // Renderizar texto com Menções (@) seguras
  const renderMessageContent = (text: string, msgMentions?: string[], mentionsAll?: boolean) => {
    if (!text) return null

    const parts = text.split(/(@[\p{L}\p{N}_]+)/gu)
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const rawName = part.slice(1).replace(/_/g, ' ')
        const isAll = rawName.toLowerCase() === 'todos' || mentionsAll
        const isMe = !isAll && (
          Boolean(msgMentions?.includes(currentUserId)) ||
          teamMembers.some(
            tm => tm.profile.id === currentUserId && tm.profile.full_name.toLowerCase() === rawName.toLowerCase()
          )
        )

        return (
          <span
            key={index}
            className={`chat-mention-tag ${isMe || isAll ? 'is-me' : ''}`}
            title={isAll ? 'Mencionou toda a equipe' : `Mencionou @${rawName}`}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  // Filtragem de mensagens pela busca interna
  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase()
    return messages.filter(m => {
      if (m.deleted_at) return false // Ignora mensagens removidas na busca
      if (!q) return true
      const author = data.profiles.find(p => p.id === m.author_id)?.full_name?.toLowerCase() || ''
      const hasAttachment = attachments.some(
        a => a.message_id === m.id && a.file_name.toLowerCase().includes(q)
      )
      return m.body.toLowerCase().includes(q) || author.includes(q) || hasAttachment
    })
  }, [messages, messageSearch, data.profiles, attachments])

  // ============================================================================
  // RENDERIZAÇÃO
  // ============================================================================

  return (
    <div className="chat-container">
      {/* SIDEBAR DE CANAIS */}
      {sidebarOpen && (
        <div
          className="chat-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`chat-sidebar-panel ${sidebarOpen ? 'open' : ''}`}>
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title-row">
            <h1>Chat</h1>
            {sidebarOpen && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSidebarOpen(false)}
                aria-label="Fechar lista de canais"
                style={{ padding: 4 }}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <p className="chat-sidebar-desc">Conversas e canais da sua equipe</p>

          {/* Busca de Canais */}
          <div className="chat-channel-search">
            <Search size={14} />
            <input
              type="text"
              value={channelSearch}
              onChange={e => setChannelSearch(e.target.value)}
              placeholder="Buscar canais..."
              aria-label="Buscar canais"
            />
            {channelSearch && (
              <button
                type="button"
                onClick={() => setChannelSearch('')}
                aria-label="Limpar busca de canais"
                style={{ border: 0, background: 'transparent', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Árvore de Canais por Equipe */}
        <div className="chat-channel-tree">
          {data.teams.map(team => {
            const teamChannels = data.channels.filter(c => c.team_id === team.id)
            const activeChannels = teamChannels.filter(c => !c.archived_at)
            const archivedChannels = teamChannels.filter(c => Boolean(c.archived_at))

            const filteredActive = activeChannels.filter(c =>
              !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase())
            )
            const filteredArchived = archivedChannels.filter(c =>
              !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase())
            )

            const canManageThisTeam = canAdmin || canManageTeam(team.id)

            if (!teamChannels.length && !canManageThisTeam) return null

            return (
              <div className="chat-team-group" key={team.id}>
                <div className="chat-team-group-head">
                  <div className="chat-team-name-badge">
                    <span
                      className="chat-team-color-pip"
                      style={{ background: team.color }}
                    />
                    <span>{team.name}</span>
                  </div>
                  {canManageThisTeam && (
                    <button
                      type="button"
                      className="chat-btn-add-channel"
                      onClick={() => handleOpenCreateChannel(team.id)}
                      title={`Criar novo canal em ${team.name}`}
                      aria-label={`Criar novo canal em ${team.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>

                {/* Canais Ativos */}
                {filteredActive.map(channel => {
                  const isSelected = channel.id === selectedChannelId
                  const metrics = channelMetrics[channel.id]
                  const hasMentions = Boolean(metrics?.mention_count && metrics.mention_count > 0)
                  const hasUnread = Boolean(metrics?.unread_count && metrics.unread_count > 0)
                  const isMuted = Boolean(mutedChannels[channel.id])
                  const isGeral = channel.name.toLowerCase() === 'geral'

                  return (
                    <div
                      className={`chat-channel-row ${isSelected ? 'active' : ''}`}
                      key={channel.id}
                    >
                      <button
                        type="button"
                        className="chat-channel-button"
                        onClick={() => {
                          setSelectedChannelId(channel.id)
                          setSidebarOpen(false)
                        }}
                      >
                        <span className="chat-channel-prefix">#</span>
                        <span className="chat-channel-name">{channel.name}</span>
                        {isMuted && (
                          <BellOff size={11} style={{ opacity: 0.5, flex: 'none' }} />
                        )}

                        <div className="chat-badges-wrap">
                          {hasMentions && (
                            <span className="chat-badge-mention">@{metrics.mention_count}</span>
                          )}
                          {hasUnread && !hasMentions && (
                            <span className="chat-badge-unread">{metrics.unread_count}</span>
                          )}
                        </div>
                      </button>

                      {/* Menu de Contexto (...) */}
                      {canManageThisTeam && (
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className={`chat-channel-menu-trigger ${activeMenuChannelId === channel.id ? 'open' : ''}`}
                            onClick={e => {
                              e.stopPropagation()
                              setActiveMenuChannelId(prev => prev === channel.id ? null : channel.id)
                            }}
                            aria-label={`Opções do canal #${channel.name}`}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {activeMenuChannelId === channel.id && (
                            <div
                              className="chat-context-menu"
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                background: 'var(--bg-surface, #fff)',
                                border: '1px solid var(--border-strong, #cbd5e1)',
                                borderRadius: 8,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                zIndex: 40,
                                minWidth: 160,
                                padding: 4
                              }}
                            >
                              <button
                                type="button"
                                className="chat-mention-item"
                                onClick={() => handleOpenEditChannel(channel)}
                              >
                                <Pencil size={13} />
                                <span>Editar canal</span>
                              </button>
                              <button
                                type="button"
                                className="chat-mention-item"
                                onClick={() => toggleMuteChannel(channel.id)}
                              >
                                {isMuted ? <Bell size={13} /> : <BellOff size={13} />}
                                <span>{isMuted ? 'Ativar avisos' : 'Silenciar'}</span>
                              </button>
                              {!isGeral && (
                                <button
                                  type="button"
                                  className="chat-mention-item"
                                  onClick={() => void handleToggleArchiveChannel(channel)}
                                >
                                  <Archive size={13} />
                                  <span>Arquivar</span>
                                </button>
                              )}
                              {!isGeral && canAdmin && (
                                <button
                                  type="button"
                                  className="chat-mention-item"
                                  style={{ color: '#ef4444' }}
                                  onClick={() => handleOpenDeleteChannel(channel)}
                                >
                                  <Trash2 size={13} />
                                  <span>Excluir...</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Canais Arquivados (Apenas Gestor e Admin) */}
                {canManageThisTeam && filteredArchived.length > 0 && (
                  <div className="chat-archived-section">
                    <button
                      type="button"
                      className="chat-archived-toggle"
                      onClick={() => {
                        setExpandedArchives(prev => ({
                          ...prev,
                          [team.id]: !prev[team.id]
                        }))
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Archive size={12} />
                        <span>Arquivados ({filteredArchived.length})</span>
                      </span>
                      {expandedArchives[team.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>

                    {expandedArchives[team.id] && (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredArchived.map(archived => (
                          <div
                            key={archived.id}
                            className={`chat-channel-row archived ${archived.id === selectedChannelId ? 'active' : ''}`}
                          >
                            <button
                              type="button"
                              className="chat-channel-button"
                              onClick={() => {
                                setSelectedChannelId(archived.id)
                                setSidebarOpen(false)
                              }}
                            >
                              <span className="chat-channel-prefix">#</span>
                              <span className="chat-channel-name">{archived.name}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: 4, height: 'auto', minHeight: 'auto', fontSize: 10 }}
                              onClick={() => void handleToggleArchiveChannel(archived)}
                              title="Restaurar canal"
                              aria-label={`Restaurar canal #${archived.name}`}
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      {/* ÁREA DA CONVERSA */}
      <main className="chat-conversation-area">
        {currentChannel ? (
          <>
            {/* CABEÇALHO DO CANAL */}
            <header className="chat-conv-header">
              <div className="chat-conv-header-left">
                <button
                  type="button"
                  className="chat-toggle-sidebar-btn"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir canais"
                >
                  <Menu size={18} />
                </button>
                <div className="chat-header-hash-icon">#</div>
                <div className="chat-header-info">
                  <div className="chat-header-title-wrap">
                    <strong>{currentChannel.name}</strong>
                    {currentChannel.archived_at && (
                      <span className="tag-chip" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e' }}>
                        Arquivado
                      </span>
                    )}
                  </div>
                  <div className="chat-header-meta">
                    <span>{currentTeam?.name || 'Equipe'} · canal da equipe</span>
                    {currentChannel.description && (
                      <span>— {currentChannel.description}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="chat-conv-header-right">
                {/* Busca de mensagens no canal */}
                <div className="chat-channel-search" style={{ maxWidth: 200 }}>
                  <Search size={13} />
                  <input
                    type="text"
                    value={messageSearch}
                    onChange={e => setMessageSearch(e.target.value)}
                    placeholder="Buscar mensagens..."
                    aria-label="Buscar mensagens no canal"
                  />
                  {messageSearch && (
                    <button
                      type="button"
                      onClick={() => setMessageSearch('')}
                      aria-label="Limpar busca"
                      style={{ border: 0, background: 'transparent', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Botão de Membros */}
                <button
                  type="button"
                  className="chat-tool-btn"
                  onClick={() => setMembersModalOpen(true)}
                  title="Ver membros do canal"
                >
                  <Users size={14} />
                  <span>{teamMembers.length}</span>
                </button>

                {/* Botão Configurar Canal (Gestor / Admin) */}
                {(canAdmin || (currentTeam && canManageTeam(currentTeam.id))) && (
                  <button
                    type="button"
                    className="chat-tool-btn"
                    onClick={() => handleOpenEditChannel(currentChannel)}
                    title="Configurar canal"
                    aria-label="Configurar canal"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                )}
              </div>
            </header>

            {/* FLUXO DE MENSAGENS */}
            <div className="chat-message-stream" ref={streamRef}>
              {!messageSearch && hasMoreMessages && messages.length >= 40 && (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <button
                    type="button"
                    className="chat-action-btn"
                    onClick={() => void loadOlderMessages()}
                    disabled={isLoadingOlder}
                  >
                    {isLoadingOlder ? 'Carregando anteriores...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
              {messageSearch && (
                <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', padding: '4px 8px' }}>
                  Filtrando por "{messageSearch}": {filteredMessages.length} mensagem(ns) encontrada(s).
                </div>
              )}

              {filteredMessages.length === 0 ? (
                <div className="chat-search-empty" style={{ margin: 'auto' }}>
                  {messageSearch ? (
                    <p>Nenhuma mensagem corresponde a "{messageSearch}".</p>
                  ) : (
                    <div>
                      <div className="chat-header-hash-icon" style={{ margin: '0 auto 12px', width: 44, height: 44, fontSize: 20 }}>
                        #
                      </div>
                      <p style={{ fontWeight: 600, fontSize: 14 }}>
                        Este é o início do canal #{currentChannel.name}.
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                        Seja o primeiro a enviar uma mensagem para a equipe!
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                (() => {
                  let lastDate = ''
                  return filteredMessages.map(msg => {
                    const author = data.profiles.find(p => p.id === msg.author_id)
                    const isMine = msg.author_id === currentUserId
                    const isDeleted = Boolean(msg.deleted_at)
                    const isEdited = Boolean(msg.edited_at) && !isDeleted
                    const isEditing = editingMessageId === msg.id

                    const linkedTask = msg.task_id ? data.tasks.find(t => t.id === msg.task_id) : undefined
                    const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : undefined
                    const repliedAuthor = repliedMsg ? data.profiles.find(p => p.id === repliedMsg.author_id) : undefined
                    const msgAttachments = attachments.filter(a => a.message_id === msg.id)

                    const canManageMsg = isMine || canAdmin || (currentTeam && canManageTeam(currentTeam.id))

                    // Separador de Data
                    const msgDate = msg.created_at.slice(0, 10)
                    const showSeparator = msgDate !== lastDate
                    lastDate = msgDate

                    return (
                      <div key={msg.id}>
                        {showSeparator && (
                          <div className="chat-date-separator">
                            <span>{formatDateSeparator(msg.created_at)}</span>
                          </div>
                        )}

                        <div className={`chat-msg-row ${isMine ? 'mine' : ''} ${isDeleted ? 'deleted' : ''}`}>
                          {/* Avatar */}
                          <div className="avatar avatar-sm" style={{ flex: 'none' }}>
                            {getInitials(author?.full_name)}
                          </div>

                          {/* Conteúdo */}
                          <div className="chat-msg-body-wrap">
                            <div className="chat-msg-meta-row">
                              <span className="chat-msg-author">
                                {author?.full_name || 'Usuário'}
                              </span>
                              <time className="chat-msg-time">
                                {timeBR(msg.created_at)}
                              </time>
                              {isEdited && (
                                <span className="chat-msg-edited-tag">(editada)</span>
                              )}
                            </div>

                            {/* Resposta citada */}
                            {repliedMsg && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  fontSize: 11,
                                  color: 'var(--text-muted, #64748b)',
                                  marginBottom: 4,
                                  paddingLeft: 6,
                                  borderLeft: '2px solid var(--border-strong, #cbd5e1)'
                                }}
                              >
                                <CornerDownRight size={12} />
                                <span>
                                  <strong>{repliedAuthor?.full_name || 'Usuário'}</strong>: {repliedMsg.deleted_at ? 'Mensagem removida' : repliedMsg.body.slice(0, 75)}
                                </span>
                              </div>
                            )}

                            {/* Corpo ou Editor Inline */}
                            {isEditing ? (
                              <div style={{ marginTop: 6 }}>
                                <textarea
                                  rows={2}
                                  value={editingMessageText}
                                  onChange={e => setEditingMessageText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Escape') setEditingMessageId(null)
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault()
                                      void handleSaveEditMessage(msg.id)
                                    }
                                  }}
                                  className="chat-composer-textarea"
                                  style={{
                                    border: '1px solid var(--color-primary-base, #3b82f6)',
                                    borderRadius: 6,
                                    background: 'var(--bg-surface, #fff)'
                                  }}
                                  autoFocus
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '3px 8px', minHeight: 24, fontSize: 11 }}
                                    onClick={() => setEditingMessageId(null)}
                                  >
                                    Cancelar (Esc)
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ padding: '3px 10px', minHeight: 24, fontSize: 11 }}
                                    onClick={() => void handleSaveEditMessage(msg.id)}
                                  >
                                    Salvar (Enter)
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={`chat-msg-bubble ${isDeleted ? 'deleted-text' : ''}`}>
                                {isDeleted
                                  ? '🚫 Mensagem removida'
                                  : renderMessageContent(msg.body, msg.mentions, msg.mentions_all)}
                              </div>
                            )}

                            {/* Tarefa Vinculada */}
                            {!isDeleted && linkedTask && (
                              <button
                                type="button"
                                className="linked-task"
                                onClick={() => onTaskSelect?.(linkedTask)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  marginTop: 6,
                                  background: 'var(--bg-primary-subtle, #eff6ff)',
                                  border: '1px solid rgba(37,99,235,0.2)',
                                  borderRadius: 6,
                                  padding: '4px 10px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--color-primary-base, #2563eb)'
                                }}
                              >
                                <ClipboardList size={13} />
                                <span>{linkedTask.title}</span>
                                <ArrowRight size={12} />
                              </button>
                            )}

                            {/* Anexos */}
                            {!isDeleted && msgAttachments.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                {msgAttachments.map(att => (
                                  <button
                                    key={att.id}
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '4px 8px', minHeight: 26, fontSize: 11, display: 'inline-flex', gap: 6 }}
                                    onClick={() => void handleOpenAttachment(att)}
                                  >
                                    <Paperclip size={12} />
                                    <span>{att.file_name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Ações da Mensagem (Hover) */}
                          {!isDeleted && !isEditing && (
                            <div className="chat-msg-actions-bar">
                              <button
                                type="button"
                                className="chat-msg-action-btn"
                                onClick={() => {
                                  setReplyingTo(msg)
                                  composerInputRef.current?.focus()
                                }}
                                title="Responder mensagem"
                                aria-label="Responder mensagem"
                              >
                                <CornerDownRight size={13} />
                              </button>

                              {isMine && !currentChannel.archived_at && (
                                <button
                                  type="button"
                                  className="chat-msg-action-btn"
                                  onClick={() => handleStartEditMessage(msg)}
                                  title="Editar mensagem"
                                  aria-label="Editar mensagem"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}

                              {canManageMsg && (
                                <button
                                  type="button"
                                  className="chat-msg-action-btn delete"
                                  onClick={() => void handleDeleteMessage(msg)}
                                  title="Remover mensagem"
                                  aria-label="Remover mensagem"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                })()
              )}
              <div ref={bottomRef} />
            </div>

            {/* COMPOSITOR DE MENSAGENS */}
            <div className="chat-composer-box">
              {currentChannel.archived_at ? (
                <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                  <Archive size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Este canal está arquivado. Apenas leitura é permitida.
                </div>
              ) : (
                <>
                  {/* Contextos de Resposta, Tarefa e Arquivo */}
                  {replyingTo && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-surface-soft, #f8fafc)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        marginBottom: 6,
                        fontSize: 11,
                        color: 'var(--text-muted, #64748b)'
                      }}
                    >
                      <span>
                        Respondendo a <strong>{data.profiles.find(p => p.id === replyingTo.author_id)?.full_name || 'Usuário'}</strong>: {replyingTo.body.slice(0, 60)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {linkedTaskId && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-primary-subtle, #eff6ff)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        marginBottom: 6,
                        fontSize: 11,
                        color: 'var(--color-primary-base, #2563eb)'
                      }}
                    >
                      <span>
                        Tarefa vinculada: <strong>{data.tasks.find(t => t.id === linkedTaskId)?.title}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinkedTaskId('')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {selectedFile && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-surface-soft, #f8fafc)',
                        padding: '4px 10px',
                        borderRadius: 6,
                        marginBottom: 6,
                        fontSize: 11
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Paperclip size={12} />
                        <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Popover de Menção @ */}
                  {mentionOpen && mentionCandidates.length > 0 && (
                    <div className="chat-mention-popover">
                      {mentionCandidates.map((cand, idx) => (
                        <button
                          type="button"
                          key={cand.id}
                          className={`chat-mention-item ${idx === mentionIndex ? 'selected' : ''}`}
                          onClick={() => insertMention(cand)}
                        >
                          <div className="avatar avatar-xs">
                            {cand.isAll ? '@' : getInitials(cand.name)}
                          </div>
                          <div className="chat-mention-item-info">
                            <strong>@{cand.name}</strong>
                            <small>{cand.role}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="chat-composer-inner">
                    <textarea
                      ref={composerInputRef}
                      className="chat-composer-textarea"
                      rows={2}
                      value={currentDraft}
                      onChange={e => handleComposerChange(e.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Mensagem em #${currentChannel.name}... Digite @ para marcar.`}
                      aria-label={`Mensagem em #${currentChannel.name}`}
                    />

                    <div className="chat-composer-tools">
                      <div className="chat-composer-tools-left">
                        {/* Botão de Anexo */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          hidden
                          onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                        />
                        <button
                          type="button"
                          className="chat-tool-btn"
                          onClick={() => fileInputRef.current?.click()}
                          title="Anexar arquivo (até 10 MB)"
                        >
                          <Paperclip size={14} />
                          <span>Anexo</span>
                        </button>

                        {/* Botão de Menção @ */}
                        <button
                          type="button"
                          className="chat-tool-btn"
                          onClick={() => {
                            updateDraft(currentDraft + '@')
                            setMentionQuery('')
                            setMentionOpen(true)
                            composerInputRef.current?.focus()
                          }}
                          title="Mencionar membro (@)"
                        >
                          <AtSign size={14} />
                          <span>Marcar</span>
                        </button>

                        {/* Vincular Tarefa */}
                        <select
                          value={linkedTaskId}
                          onChange={e => setLinkedTaskId(e.target.value)}
                          aria-label="Vincular tarefa"
                          className="chat-tool-btn"
                          style={{
                            maxWidth: 160,
                            padding: '4px 6px',
                            border: '1px solid var(--border-subtle, #e2e8f0)',
                            borderRadius: 6
                          }}
                        >
                          <option value="">Vincular tarefa...</option>
                          {data.tasks
                            .filter(t => t.team_id === currentChannel.team_id)
                            .map(t => (
                              <option key={t.id} value={t.id}>
                                {t.title}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Botão Enviar */}
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleSendMessage()}
                        disabled={isSending || (!currentDraft.trim() && !linkedTaskId && !selectedFile)}
                        style={{ padding: '6px 14px', minHeight: 32 }}
                      >
                        {isSending ? 'Enviando...' : 'Enviar'}
                        <Send size={13} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="chat-search-empty" style={{ margin: 'auto' }}>
            <p>Selecione um canal ao lado para conversar.</p>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL: NOVO CANAL                                                   */}
      {/* ==================================================================== */}
      {createChannelModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Novo Canal</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCreateChannelModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={e => void handleCreateChannel(e)} className="stack-form">
              <div className="field">
                <label>Nome do canal *</label>
                <input
                  required
                  autoFocus
                  maxLength={60}
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  placeholder="Ex.: projetos, suporte-n1, lancamentos"
                />
              </div>

              <div className="field">
                <label>Descrição (opcional)</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={newChannelDescription}
                  onChange={e => setNewChannelDescription(e.target.value)}
                  placeholder="Para que serve este canal?"
                />
              </div>

              <div className="field">
                <label>Quem participa?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <input type="radio" checked readOnly name="channel_scope" />
                    <span><strong>Toda a equipe</strong> (todos os membros ativos participam)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.55 }}>
                    <input type="radio" disabled name="channel_scope" />
                    <span>Só membros que eu escolher <small style={{ color: '#6366f1' }}>(em breve)</small></span>
                  </label>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCreateChannelModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Criar canal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDITAR CANAL COM ZONA DE RISCO                              */}
      {/* ==================================================================== */}
      {editChannelModalOpen && editingChannel && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>Editar Canal #{editingChannel.name}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditChannelModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={e => void handleSaveEditChannel(e)} className="stack-form">
              <div className="field">
                <label>Nome do canal *</label>
                <input
                  required
                  disabled={editingChannel.name.toLowerCase() === 'geral'}
                  maxLength={60}
                  value={editChannelName}
                  onChange={e => setEditChannelName(e.target.value)}
                />
                {editingChannel.name.toLowerCase() === 'geral' && (
                  <small style={{ color: 'var(--text-muted, #64748b)' }}>
                    O canal Geral é protegido contra renomeação.
                  </small>
                )}
              </div>

              <div className="field">
                <label>Descrição</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={editChannelDesc}
                  onChange={e => setEditChannelDesc(e.target.value)}
                />
              </div>

              {/* Zona de Risco */}
              {editingChannel.name.toLowerCase() !== 'geral' && (
                <div
                  style={{
                    border: '1px solid #fee2e2',
                    background: '#fffafb',
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 8
                  }}
                >
                  <strong style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} /> Zona de Risco
                  </strong>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 10px' }}>
                    {editingChannel.archived_at
                      ? 'Este canal está arquivado. Você pode restaurá-lo a qualquer momento.'
                      : 'Arquivar esconde o canal sem apagar as mensagens.'}
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void handleToggleArchiveChannel(editingChannel)}
                      style={{ fontSize: 11, minHeight: 28 }}
                    >
                      <Archive size={12} />
                      {editingChannel.archived_at ? 'Restaurar canal' : 'Arquivar canal'}
                    </button>

                    {canAdmin && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ color: '#ef4444', borderColor: '#fca5a5', fontSize: 11, minHeight: 28 }}
                        onClick={() => handleOpenDeleteChannel(editingChannel)}
                      >
                        <Trash2 size={12} />
                        Excluir definitivamente...
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditChannelModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DEFINITIVA                           */}
      {/* ==================================================================== */}
      {deleteChannelModalOpen && channelToDelete && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} /> Excluir Canal Definitivamente
              </h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDeleteChannelModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={e => void handleConfirmDeleteChannel(e)} className="stack-form">
              <p style={{ fontSize: 12, lineHeight: 1.5 }}>
                Esta ação é <strong>irreversível</strong>. Todas as mensagens e arquivos anexos
                do canal <strong>#{channelToDelete.name}</strong> serão permanentemente excluídos.
              </p>

              <div className="field">
                <label>
                  Para confirmar, digite <strong>{channelToDelete.name}</strong> abaixo:
                </label>
                <input
                  required
                  autoFocus
                  value={deleteConfirmationText}
                  onChange={e => setDeleteConfirmationText(e.target.value)}
                  placeholder={`Digite ${channelToDelete.name}`}
                />
              </div>

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteChannelModalOpen(false)}
                  disabled={isDeletingChannel}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                  disabled={
                    isDeletingChannel ||
                    deleteConfirmationText.trim().toLowerCase() !== channelToDelete.name.trim().toLowerCase()
                  }
                >
                  {isDeletingChannel ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: LISTAGEM DE MEMBROS DA EQUIPE DO CANAL                       */}
      {/* ==================================================================== */}
      {membersModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Membros de #{currentChannel?.name}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMembersModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
              {teamMembers.map(({ profile, member }) => (
                <div
                  key={profile.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-surface-soft, #f8fafc)'
                  }}
                >
                  <div className="avatar avatar-sm">
                    {getInitials(profile.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 13, display: 'block' }}>{profile.full_name}</strong>
                    <small style={{ fontSize: 10, color: 'var(--text-muted, #64748b)' }}>
                      {member.is_manager ? 'Gestor da equipe' : profile.role === 'administrador' ? 'Administrador' : 'Colaborador'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary full"
                onClick={() => setMembersModalOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
