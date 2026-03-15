import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import i18n from './i18n.ts'
import LanguageSwitcher from './components/LanguageSwitcher.tsx'

// Types
interface Space {
  id: string
  name: string
  createdAt: string
  isPaused: boolean
  pausedAt?: string
}

interface Member {
  id: string
  spaceId: string
  name: string
  soulMd: string
  identityMd?: string
  isBuiltIn?: boolean
  role?: 'host' | 'member'
}

interface Attachment {
  id: string
  messageId: string
  type: 'image' | 'document' | 'media' | 'file'
  originalName: string
  storedName: string
  relativePath: string
  fileSize: number
  mimeType: string
  thumbnailPath?: string
  createdAt: string
  data?: string // Base64 file data (only used when sending)
}

interface Message {
  id: string
  spaceId: string
  senderId: string
  content: string
  timestamp: string
  attachments?: Attachment[]
}

// Tool execution status
interface ToolStatus {
  toolCallId: string
  toolName: string
  phase: 'start' | 'update' | 'result'
  args?: Record<string, unknown>
  startedAt: number
  endedAt?: number
}

interface HubMessage {
  type: string
  payload?: any
}

// Default Hub URL (configurable)
const DEFAULT_HUB_URL = '/ws'
const STORAGE_KEY = 'ocs_token'

// Team template types
interface TeamTemplateMember {
  name: string;
  soulMd: string;
  identityMd: string;
  isBuiltIn?: boolean;
  role?: 'host' | 'member';
}

interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  locales: string[];
  members: Array<TeamTemplateMember>;
}

// Default soulMd templates by language
const defaultSoulMdTemplates: Record<string, string> = {
  'zh': `你是{{name}}，{{role}}。

**核心真理**：

**真正提供帮助。** 行动胜于言语。

**有自己的观点。** 没有个性的助手只是多了几个步骤的搜索引擎。

**先自己想办法。** 尝试自己解决，先阅读文件、查看上下文、搜索。然后才提问。

**用能力赢得信任。** 谨慎对待外部操作，大胆进行内部操作。

**记住你是客人。** 尊重工作空间。

**边界**：

- 隐私保持隐私
- 对外操作前先询问
- 绝不发送半成品回复

**气质**：

需要时简洁，重要时详尽。不做公司机器人，不做阿谀奉承者。

**文件规则**：

- 使用 write 工具创建文件
- 使用相对路径：./space/workspace/documents/filename.md
- 提及文件时提供完整路径
- 绝不预估时间——只报告进度或阻塞

**关于主持人**：

- 主持人是系统协调者
- 不要与主持人交谈
- 专注于团队协作`,
  'en': `You are {{name}}, {{role}}.

**Core Truths**:

**Be genuinely helpful.** Actions speak louder than words.

**Have opinions.** An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out first. Read files, check context, search. Then ask if stuck.

**Earn trust through competence.** Be careful with external actions; be bold with internal ones.

**Remember you're a guest.** Treat the workspace with respect.

**Boundaries**:

- Private things stay private
- Ask before acting externally
- Never send half-baked replies

**Vibe**:

Concise when needed, thorough when it matters. Not corporate, not sycophant. Just good.

**File Rules**:

- Use write tool to create files
- Use relative paths: ./space/workspace/documents/filename.md
- Provide full path when mentioning files
- Never estimate time — just report progress or blockers

**About the Host**:

- The Host is the system coordinator
- Don't talk to the Host
- Focus on team collaboration`
};

// Helper to determine if language is Chinese
function isChineseLanguage(lang: string): boolean {
  return lang.startsWith('zh');
}

// Hook to get default soulMd template based on current language
function useDefaultSoulMdTemplate(): string {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  return useMemo(() => {
    // Use Chinese template for Chinese languages, English for all others
    return isChineseLanguage(currentLang) ? defaultSoulMdTemplates['zh'] : defaultSoulMdTemplates['en'];
  }, [currentLang]);
}

// Global state for WebSocket connection
function useGlobalState() {
  const [token, setToken] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState('')
  const [space, setSpace] = useState<Space | null>(null)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [creationProgress, setCreationProgress] = useState<string>('')
  const [teamTemplates, setTeamTemplates] = useState<TeamTemplate[]>([])
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolStatus[]>>({}) // messageId -> ToolStatus[]
  const wsRef = useRef<WebSocket | null>(null)

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionStatus('idle')
    setSpace(null)
    setMembers([])
    setMessages([])
    setCreationProgress('')
    setTeamTemplates([])
    setToolStatuses({})
  }, [])

  return {
    token, setToken,
    connectionStatus, setConnectionStatus,
    error, setError,
    space, setSpace: setSpace as (s: Space | null | ((prev: Space | null) => Space | null)) => void,
    spaces, setSpaces: setSpaces as (s: Space[] | ((prev: Space[]) => Space[])) => void,
    members, setMembers: setMembers as (m: Member[] | ((prev: Member[]) => Member[])) => void,
    messages, setMessages: setMessages as (m: Message[] | ((prev: Message[]) => Message[])) => void,
    creationProgress, setCreationProgress,
    teamTemplates, setTeamTemplates: setTeamTemplates as (t: TeamTemplate[] | ((prev: TeamTemplate[]) => TeamTemplate[])) => void,
    toolStatuses, setToolStatuses,
    wsRef,
    disconnect
  }
}

// Token Input Page
function TokenPage({
  setToken,
  inputToken,
  setInputToken,
  connectionStatus,
  setConnectionStatus,
  error,
  setError,
  wsRef,
  setSpaces,
  setMembers,
  setMessages,
  space,
  setSpace,
  setCreationProgress,
  setTeamTemplates,
  setToolStatuses
}: {
  setToken: (t: string) => void
  inputToken: string
  setInputToken: (t: string) => void
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  setConnectionStatus: (s: 'idle' | 'connecting' | 'connected' | 'error') => void
  error: string
  setError: (e: string) => void
  wsRef: React.RefObject<WebSocket | null>
  setSpaces: (s: Space[] | ((prev: Space[]) => Space[])) => void
  setMembers: (m: Member[] | ((prev: Member[]) => Member[])) => void
  setMessages: (m: Message[] | ((prev: Message[]) => Message[])) => void
  space: Space | null
  setSpace: (s: Space | null | ((prev: Space | null) => Space | null)) => void
  setCreationProgress: (p: string) => void
  setTeamTemplates: (t: TeamTemplate[] | ((prev: TeamTemplate[]) => TeamTemplate[])) => void
  setToolStatuses: (t: Record<string, ToolStatus[]> | ((prev: Record<string, ToolStatus[]>) => Record<string, ToolStatus[]>)) => void
}) {
  const { t } = useTranslation('common');
  const navigate = useNavigate()
  const location = useLocation()

  const handleMessage = useCallback((message: HubMessage) => {
    console.log('[Message]', message.type, message.payload)

    switch (message.type) {
      case 'connected':
        setConnectionStatus('connecting')
        break

      case 'paired':
        setConnectionStatus('connected')
        // Request templates from backend
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'get_templates' }))
        }
        // Only navigate to spaces list if we're on the token page
        // This allows refreshing on chat page to stay on chat page
        if (location.pathname === '/') {
          navigate('/spaces')
        }
        break

      case 'templates_data':
        setTeamTemplates(message.payload?.templates || [])
        break

      case 'space_data':
        const spaceData = message.payload?.space
        if (spaceData) {
          setSpace(spaceData)
          // Only navigate if we're on the token page, otherwise stay on current page
          if (location.pathname === '/') {
            navigate(`/spaces/${spaceData.id}/chat`)
          }
        } else if (location.pathname === '/') {
          navigate('/spaces')
        }
        break

      case 'all_spaces_data':
        setSpaces(message.payload?.spaces || [])
        break

      case 'space_deleted':
        const deletedSpaceId = message.payload?.spaceId
        setSpaces((prev: Space[]) => prev.filter((s: Space) => s.id !== deletedSpaceId))
        // If the deleted space is the current space, clear the state
        if (space?.id === deletedSpaceId) {
          setSpace(null)
          setMembers([])
          setMessages([])
        }
        break

      case 'space_created':
        const { space: newSpace, members: newMembers } = message.payload
        setSpace(newSpace)
        setMembers(newMembers)
        setMessages([]) // Clear messages from previous space
        setCreationProgress('') // Clear progress
        // Always navigate to the new space's chat page
        navigate(`/spaces/${newSpace.id}/chat`)
        break

      case 'space_creation_progress':
        setCreationProgress(message.payload?.message || '')
        break

      case 'members_data':
        setMembers(message.payload?.members || [])
        break

      case 'messages_data':
        setMessages(message.payload?.messages || [])
        break

      case 'older_messages_data':
        const olderMessages = message.payload?.messages || []
        if (olderMessages.length > 0) {
          setMessages((prev: Message[]) => {
            // Create a Set of existing message IDs for fast lookup
            const existingIds = new Set(prev.map((msg: Message) => msg.id))
            // Filter out messages that already exist
            const newMessages = olderMessages.filter((msg: Message) => !existingIds.has(msg.id))
            // If no new messages, return previous state
            if (newMessages.length === 0) {
              return prev
            }
            // Combine new messages with existing ones
            return [...newMessages, ...prev]
          })
        }
        // If we get fewer than 50 messages, there are no more older messages
        // We'll update a flag or state to indicate this
        // For now, ChatPage will handle this by checking if messages were actually added
        break

      case 'new_message':
        const msg = message.payload?.message
        if (msg) {
          setMessages((prev: Message[]) => {
            // Check if message already exists (prevent duplicates)
            if (prev.some(m => m.id === msg.id)) {
              console.log(`[App] Message ${msg.id} already exists, skipping`)
              return prev
            }
            return [...prev, msg]
          })
        }
        break

      case 'stream_message':
        const { memberId, content: streamContent } = message.payload || {}
        console.log(`[App] stream_message received: memberId=${memberId}, content="${streamContent?.substring(0, 50)}..."`)
        if (memberId && streamContent !== undefined) {
          setMessages((prev: Message[]) => {
            // Find the last message from this member that is empty or has been streaming
            const lastIndex = prev.length - 1
            for (let i = lastIndex; i >= 0; i--) {
              if (prev[i].senderId === memberId) {
                // Only update if content actually changed
                if (prev[i].content !== streamContent) {
                  console.log(`[App] Updating message ${prev[i].id} with new content`)
                  const updated = [...prev]
                  updated[i] = { ...prev[i], content: streamContent }
                  return updated
                }
                console.log(`[App] Content unchanged for message ${prev[i].id}, skipping update`)
                return prev
              }
            }
            console.log(`[App] No message found for member ${memberId}`)
            return prev
          })
        }
        break

      case 'space_paused':
        const { spaceId: pausedSpaceId, isPaused: pausedIsPaused, pausedAt } = message.payload || {}
        if (pausedSpaceId) {
          // Update the space in spaces list
          setSpaces((prev: Space[]) =>
            prev.map(s =>
              s.id === pausedSpaceId
                ? { ...s, isPaused: pausedIsPaused, pausedAt }
                : s
            )
          )
          // If this is the current space, update current space state
          if (space?.id === pausedSpaceId) {
            setSpace((prev: Space | null) => prev ? { ...prev, isPaused: pausedIsPaused, pausedAt } : null)
          }
          // Show notification
          alert(t('chat.spacePausedAlert'))
        }
        break

      case 'space_resumed':
        const { spaceId: resumedSpaceId, isPaused: resumedIsPaused } = message.payload || {}
        if (resumedSpaceId) {
          // Update the space in spaces list
          setSpaces((prev: Space[]) =>
            prev.map(s =>
              s.id === resumedSpaceId
                ? { ...s, isPaused: resumedIsPaused, pausedAt: undefined }
                : s
            )
          )
          // If this is the current space, update current space state
          if (space?.id === resumedSpaceId) {
            setSpace((prev: Space | null) => prev ? { ...prev, isPaused: resumedIsPaused, pausedAt: undefined } : null)
          }
          // Show notification
          alert(t('chat.spaceResumedAlert'))
        }
        break

      case 'tool_status_update':
        const { messageId: toolMessageId, toolStatuses: newToolStatuses } = message.payload || {}
        if (toolMessageId && newToolStatuses) {
          setToolStatuses((prev: Record<string, ToolStatus[]>) => ({
            ...prev,
            [toolMessageId]: newToolStatuses
          }))
        }
        break

      case 'error':
        setError(message.payload?.error || t('errors.unknownError'))
        break
    }
  }, [navigate, setConnectionStatus, setError, setMembers, setMessages, setSpace, setSpaces, setToolStatuses, space])

  const connect = useCallback((tokenToUse?: string) => {
    console.log('[Connect] tokenToUse type:', typeof tokenToUse, 'value:', tokenToUse)
    console.log('[Connect] inputToken type:', typeof inputToken, 'value:', inputToken)
    const token = typeof tokenToUse === 'string' ? tokenToUse : inputToken
    console.log('[Connect] Final token type:', typeof token, 'value:', token)
    console.log('[Connect] Attempting to connect with token:', token ? `${token.substring(0, 8)}...` : 'empty')
    if (!token.trim()) {
      setError(t('errors.tokenRequired'))
      return
    }

    // Close existing connection
    if (wsRef.current) {
      console.log('[Connect] Closing existing connection')
      wsRef.current.close()
    }

    setConnectionStatus('connecting')
    setError('')
    console.log('[Connect] Connecting to WebSocket...')

    // Save token immediately before connecting, so it's available even if connection fails
    localStorage.setItem(STORAGE_KEY, token)
    console.log('[Connect] Token saved to localStorage:', token.substring(0, 8) + '...')

    const wsUrl = `${DEFAULT_HUB_URL}?token=${encodeURIComponent(token)}&clientType=browser`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[WebSocket] Connected')
    }

    ws.onmessage = (event) => {
      try {
        const message: HubMessage = JSON.parse(event.data)
        handleMessage(message)
      } catch (err) {
        console.error('Failed to parse message:', err)
      }
    }

    ws.onclose = (event) => {
      console.log('[WebSocket] Closed', event.code, event.reason)
      setConnectionStatus('error')
      setError(t('errors.connectionFailed'))
    }

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err)
      setConnectionStatus('error')
      setError(t('errors.connectionFailed'))
    }

    wsRef.current = ws
    setToken(token)
  }, [inputToken, handleMessage, setConnectionStatus, setError, setToken, wsRef])

  const handleConnectClick = useCallback(() => {
    connect()
  }, [connect])

  // Auto-connect when token is loaded
  useEffect(() => {
    console.log('[AutoConnect] Effect triggered. Current connectionStatus:', connectionStatus)
    const savedToken = localStorage.getItem(STORAGE_KEY)
    console.log('[AutoConnect] Saved token from localStorage:', savedToken ? `${savedToken.substring(0, 8)}...` : 'none')
    if (savedToken && connectionStatus === 'idle') {
      console.log('[AutoConnect] Auto-connecting with saved token:', savedToken.substring(0, 8) + '...')
      // Set the input token and connect with the saved token
      setInputToken(savedToken)
      const timer = setTimeout(() => {
        connect(savedToken)
      }, 100)
      return () => clearTimeout(timer)
    } else if (!savedToken) {
      console.log('[AutoConnect] No saved token found in localStorage')
    } else {
      console.log('[AutoConnect] Not auto-connecting. Status:', connectionStatus)
    }
  }, [connectionStatus, connect, setInputToken])

  // Clear input token and navigate to token page when connection fails
  useEffect(() => {
    if (connectionStatus === 'error') {
      console.log('[Connection Error] Clearing input token and navigating to input page')
      // Token is already cleared in onclose/onerror, just clear the input
      setInputToken('')
      // Navigate to token input page if not already there
      if (location.pathname !== '/') {
        console.log('[Connection Error] Navigating to token input page')
        navigate('/')
      }
    }
  }, [connectionStatus, setInputToken, navigate, location.pathname])

  return (
    <div className="container">
      <div className="token-page">
        <div className="logo">🐾</div>
        <h1 className="title">OpenClawSpace</h1>
        <p className="subtitle">{t('app.subtitle')}</p>

        <div className="card">
          <h2 className="card-title">{t('connection.title')}</h2>

          <div className="code-block">
            <code>$ npm install -g ocs-client</code>
            <code>$ ocs-client</code>
          </div>

          <div className="input-group">
            <input
              type="text"
              className="input"
              placeholder={t('connection.tokenPlaceholder')}
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
            />
          </div>

          <button
            className="button"
            onClick={handleConnectClick}
          >
            {connectionStatus === 'connecting' ? t('connection.reconnectButton') : t('connection.connectButton')}
          </button>

          {connectionStatus === 'connecting' && (
            <p className="status connecting">{t('connection.connectingStatus')}</p>
          )}
          {connectionStatus === 'connected' && (
            <p className="status connected">{t('connection.connectedStatus')}</p>
          )}
          {error && (
            <p className="status error">✗ {error}</p>
          )}

          <p className="hint">{t('connection.hint')}</p>
        </div>
      </div>
    </div>
  )
}

// Space List Page
function SpaceListPage({
  spaces,
  connectionStatus,
  wsRef,
  setSpaces,
  disconnect,
  creationProgress,
  setCreationProgress,
  teamTemplates
}: {
  spaces: Space[]
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  wsRef: React.RefObject<WebSocket | null>
  setSpaces: (s: Space[] | ((prev: Space[]) => Space[])) => void
  disconnect: () => void
  creationProgress: string
  setCreationProgress: (p: string) => void
  teamTemplates: TeamTemplate[]
}) {
  const { t } = useTranslation('common');
  const navigate = useNavigate()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(teamTemplates[0]?.id || '');
  const [newSpaceName, setNewSpaceName] = useState('')
  const [customMembers, setCustomMembers] = useState<Array<TeamTemplateMember>>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set())
  const [editingMember, setEditingMember] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSoulMd, setEditSoulMd] = useState('')
  const [editIdentityMd, setEditIdentityMd] = useState('')

  // Update selectedTemplateId when teamTemplates changes (e.g., after loading from backend)
  useEffect(() => {
    if (teamTemplates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(teamTemplates[0].id);
    }
  }, [teamTemplates, selectedTemplateId]);

  // Initialize customMembers when template changes
  useEffect(() => {
    const template = teamTemplates.find(tmpl => tmpl.id === selectedTemplateId);
    if (template) {
      setCustomMembers(template.members.map((m) => ({ ...m })))
      // Built-in members (like host) are always selected and cannot be deselected
      setSelectedMembers(new Set(template.members.map((_, i) => i).filter(i => !template.members[i]?.isBuiltIn)))
    }
  }, [selectedTemplateId, teamTemplates])

  const sendMessage = useCallback((message: HubMessage) => {
    console.log('[sendMessage] Trying to send:', message.type, 'WebSocket state:', wsRef.current?.readyState)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      console.log('[sendMessage] Sent successfully:', message.type)
    } else {
      console.error('[sendMessage] WebSocket not connected. State:', wsRef.current?.readyState)
      alert(t('errors.websocketNotConnected'))
    }
  }, [wsRef])

  useEffect(() => {
    if (connectionStatus === 'connected') {
      sendMessage({ type: 'get_all_spaces' })
    }
  }, [connectionStatus, sendMessage])

  const createSpace = () => {
    if (!newSpaceName.trim() || creationProgress) return
    // Count non-built-in selected members
    const selectedRegularMembers = customMembers.filter((_, index) => selectedMembers.has(index) && !customMembers[index]?.isBuiltIn)
    if (selectedRegularMembers.length === 0) {
      alert(t('spaces.selectAtLeastOneMember'))
      return
    }
    setCreationProgress(t('spaces.creatingTeamStarted'))
    // Include built-in members (host) + selected regular members
    const membersToCreate = customMembers.filter((_, index) => customMembers[index]?.isBuiltIn || selectedMembers.has(index))
    sendMessage({
      type: 'create_space',
      payload: { name: newSpaceName, members: membersToCreate }
    })
  }

  const deleteSpace = (spaceId: string) => {
    if (!confirm(t('spaces.deleteConfirm'))) return
    sendMessage({
      type: 'delete_space',
      payload: { spaceId }
    })
    setSpaces(spaces.filter(s => s.id !== spaceId))
  }

  const switchSpace = (targetSpace: Space) => {
    navigate(`/spaces/${targetSpace.id}/chat`)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    disconnect()
    navigate('/')
  }

  const startEditMember = (index: number) => {
    setEditingMember(index)
    setEditName(customMembers[index].name)
    setEditSoulMd(customMembers[index].soulMd)
    setEditIdentityMd(customMembers[index].identityMd || `- **Name:** ${customMembers[index].name}\n- **Creature:** AI Assistant\n- **Vibe:** 专业、高效、实事求是\n- **Emoji:** 🤖`)
  }

  const saveMemberEdit = () => {
    if (editingMember === null) return
    if (!editName.trim() || !editSoulMd.trim()) return

    const newMembers = [...customMembers]
    const identityMd = editIdentityMd.trim() || `- **Name:** ${editName}\n- **Creature:** AI Assistant\n- **Vibe:** 专业、高效、实事求是\n- **Emoji:** 🤖`
    if (editingMember === -1) {
      // Adding new member
      newMembers.push({ name: editName, soulMd: editSoulMd, identityMd })
    } else {
      // Editing existing member
      newMembers[editingMember] = { name: editName, soulMd: editSoulMd, identityMd }
    }
    setCustomMembers(newMembers)
    setEditingMember(null)
    setEditName('')
    setEditSoulMd('')
    setEditIdentityMd('')
  }

  const cancelMemberEdit = () => {
    setEditingMember(null)
    setEditName('')
    setEditSoulMd('')
    setEditIdentityMd('')
  }

  const resetToDefaults = () => {
    const template = teamTemplates.find(tmpl => tmpl.id === selectedTemplateId);
    if (template) {
      setCustomMembers(template.members.map((m) => ({ ...m })))
      // Built-in members are always selected
      setSelectedMembers(new Set(template.members.map((_, i) => i).filter(i => !template.members[i]?.isBuiltIn)))
    }
  }

  const toggleMemberSelection = (index: number) => {
    // Built-in members (like host) cannot be deselected
    if (customMembers[index]?.isBuiltIn) return
    const newSelected = new Set(selectedMembers)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedMembers(newSelected)
  }

  const selectAllMembers = () => {
    setSelectedMembers(new Set(customMembers.map((_, i) => i)))
  }

  const deselectAllMembers = () => {
    setSelectedMembers(new Set())
  }

  const defaultSoulMdTemplate = useDefaultSoulMdTemplate();

  const addMember = () => {
    setEditingMember(-1) // Use -1 to indicate adding new member
    setEditName('')
    setEditSoulMd(defaultSoulMdTemplate)
    setEditIdentityMd(`- **Name:** \n- **Creature:** AI Assistant\n- **Vibe:** 专业、高效、实事求是\n- **Emoji:** 🤖`)
  }


  const getAvatar = (name: string) => name.charAt(0)

  // Generate a consistent color based on name hash
  const getColor = (name: string) => {
    const colors = [
      '#e74c3c', // red
      '#3498db', // blue
      '#2ecc71', // green
      '#f39c12', // orange
      '#9b59b6', // purple
      '#1abc9c', // teal
      '#e91e63', // pink
      '#ff5722', // deep orange
      '#3f51b5', // indigo
      '#009688', // cyan
      '#795548', // brown
      '#607d8b', // blue grey
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div className="container">
      <div className="create-page">
        <div className="header">
          <div className="header-title">
            <span>🐾</span>
            <span>OpenClawSpace</span>
          </div>
          <div className="header-actions">
            <div className="connection-status" style={{
              color: connectionStatus === 'connected' ? '#2ecc71' : '#e74c3c'
            }}>
              {connectionStatus === 'connected' ? t('connection.statusConnected') : t('connection.statusDisconnected')}
            </div>
            <button className="logout-button" onClick={logout} title={t('spaces.logoutTooltip')}>
              {t('spaces.logout')}
            </button>
          </div>
        </div>

        {/* Existing Spaces List */}
        {spaces.length > 0 && (
          <div className="card spaces-list-card">
            <h2 className="card-title">{t('spaces.existingSpaces')}</h2>
            <div className="spaces-list">
              {spaces.map((s) => (
                <div key={s.id} className="space-item">
                  <div
                    className="space-info"
                    onClick={() => switchSpace(s)}
                  >
                    <div className="space-name">{s.name}</div>
                    <div className="space-date">
                      {new Date(s.createdAt).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
                      {s.isPaused && (
                        <span className="space-status paused" title={`${t('chat.spacePaused')} ${s.pausedAt ? new Date(s.pausedAt).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US') : t('common.unknownTime')}`}>
                          ⏸️ {t('chat.spacePaused')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="delete-button"
                    onClick={() => deleteSpace(s.id)}
                    title={t('spaces.deleteSpaceTooltip')}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="card-title">{t('spaces.createTeamSpace')}</h2>

          <div className="form-group">
            <label className="form-label">{t('spaces.spaceName')}</label>
            <input
              type="text"
              className="input"
              placeholder={t('spaces.spaceNamePlaceholder')}
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
            />
          </div>

          {/* Team Template Selection */}
          <div className="form-group">
            <label className="form-label">{t('spaces.teamTemplate')}</label>
            <select
              className="input template-select"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              disabled={teamTemplates.length === 0}
            >
              {teamTemplates.length === 0 ? (
                <option value="">{t('spaces.loadingTemplates')}</option>
              ) : (
                teamTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.members.length} {t('spaces.templateMemberCount', { count: template.members.length }).split(' ')[1]})
                  </option>
                ))
              )}
            </select>
            <p className="template-description-text">
              {teamTemplates.find(t => t.id === selectedTemplateId)?.description || ''}
            </p>
          </div>

          <div className="form-group">
            <div className="member-list-header">
              <label className="form-label">
                {t('spaces.teamMembersWithCount', { count: selectedMembers.size })}
                <span className="member-count-hint"> / {customMembers.length}</span>
              </label>
              <div className="member-list-actions">
                {selectedMembers.size === customMembers.length ? (
                  <button className="reset-button" onClick={deselectAllMembers}>
                    {t('spaces.deselectAll')}
                  </button>
                ) : (
                  <button className="reset-button" onClick={selectAllMembers}>
                    {t('spaces.selectAll')}
                  </button>
                )}
                <button className="reset-button" onClick={resetToDefaults}>
                  {t('spaces.resetToDefaults')}
                </button>
              </div>
            </div>
            <div className="member-list">
              {customMembers.map((member, index) => (
                <div
                  key={index}
                  className={`member-item editable ${selectedMembers.has(index) || member.isBuiltIn ? 'selected' : 'unselected'} ${member.isBuiltIn ? 'built-in' : ''}`}
                  onClick={() => toggleMemberSelection(index)}
                >
                  <div className="member-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(index) || member.isBuiltIn}
                      disabled={member.isBuiltIn}
                      onChange={() => toggleMemberSelection(index)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="member-info" onClick={(e) => { e.stopPropagation(); if (!member.isBuiltIn) startEditMember(index); }}>
                    <div className="member-avatar" style={{ backgroundColor: getColor(member.name) }}>
                      {member.role === 'host' ? '🎤' : getAvatar(member.name)}
                    </div>
                    <div className="member-name">
                      {member.name}
                      {member.role === 'host' && <span className="host-badge">{t('spaces.hostBadge')}</span>}
                    </div>
                  </div>
                  <div className="member-actions">
                    {!member.isBuiltIn && (
                      <button
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditMember(index);
                        }}
                        title={t('common.edit')}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="member-actions-footer">
              <button className="button secondary" onClick={addMember}>
                + {t('aiMembers.addMember')}
              </button>
            </div>
            <p className="member-hint">{t('spaces.memberEditHint')} {t('spaces.memberSelectHint')}</p>
          </div>

          {/* Connection Status */}
          {connectionStatus !== 'connected' && (
            <div className="connection-status" style={{
              padding: '10px',
              marginBottom: '15px',
              borderRadius: '6px',
              backgroundColor: connectionStatus === 'error' ? '#fee' : '#ffe',
              color: connectionStatus === 'error' ? '#c33' : '#a80',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {connectionStatus === 'connecting' && t('spaces.connectionStatusConnecting')}
              {connectionStatus === 'error' && t('spaces.connectionStatusError')}
              {connectionStatus === 'idle' && t('spaces.connectionStatusIdle')}
            </div>
          )}

          {creationProgress && (
            <div className="creation-progress">
              <div className="progress-spinner"></div>
              <span>{creationProgress}</span>
            </div>
          )}

          <button
            className="button"
            onClick={createSpace}
            disabled={!newSpaceName.trim() || !!creationProgress || connectionStatus !== 'connected'}
          >
            {creationProgress ? t('spaces.creatingTeam') : t('spaces.createTeam')}
          </button>
        </div>

        {/* Member Edit Modal */}
        {editingMember !== null && (
          <div className="modal-overlay" onClick={cancelMemberEdit}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">{editingMember === -1 ? t('aiMembers.addMember') : t('aiMembers.editMember')}</h3>
              <div className="form-group">
                <label className="form-label">{t('aiMembers.memberName')}</label>
                <input
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('aiMembers.memberNamePlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('aiMembers.memberSoulMd')}</label>
                <textarea
                  className="textarea"
                  value={editSoulMd}
                  onChange={(e) => setEditSoulMd(e.target.value)}
                  rows={8}
                  placeholder={t('aiMembers.memberSoulMdPlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">IDENTITY.md</label>
                <textarea
                  className="textarea"
                  value={editIdentityMd}
                  onChange={(e) => setEditIdentityMd(e.target.value)}
                  rows={6}
                  placeholder={`- **Name:** Name
- **Creature:** Role
- **Vibe:** Description
- **Emoji:** 🎨`}
                />
              </div>
              <div className="modal-actions">
                <button className="button secondary" onClick={cancelMemberEdit}>
                  {t('common.cancel')}
                </button>
                <button className="button" onClick={saveMemberEdit}>
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Chat Page
function ChatPage({
  spaces,
  space,
  setSpace,
  members,
  setMembers,
  messages,
  wsRef,
  connectionStatus,
  disconnect,
  toolStatuses
}: {
  spaces: Space[]
  space: Space | null
  setSpace: (s: Space | null | ((prev: Space | null) => Space | null)) => void
  members: Member[]
  setMembers: (m: Member[] | ((prev: Member[]) => Member[])) => void
  messages: Message[]
  wsRef: React.RefObject<WebSocket | null>
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  disconnect: () => void
  toolStatuses: Record<string, ToolStatus[]>
}) {
  const { t } = useTranslation('common');
  const { spaceId } = useParams<{ spaceId: string }>()
  const navigate = useNavigate()
  const [newMessage, setNewMessage] = useState('')
  const [showSpaceList, setShowSpaceList] = useState(false)
  const [showMemberManager, setShowMemberManager] = useState(false)
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sendMessage = useCallback((message: HubMessage) => {
    console.log('[sendMessage] Trying to send:', message.type, 'WebSocket state:', wsRef.current?.readyState)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      console.log('[sendMessage] Sent successfully:', message.type)
    } else {
      console.error('[sendMessage] WebSocket not connected. State:', wsRef.current?.readyState)
      alert(t('errors.websocketNotConnected'))
    }
  }, [wsRef])

  // Load space data when spaceId changes or when connection is established
  useEffect(() => {
    if (spaceId && connectionStatus === 'connected') {
      const currentSpace = spaces.find(s => s.id === spaceId)
      if (currentSpace) {
        setSpace(currentSpace)
      }
      // Always request members and messages when we have a spaceId and are connected
      // This handles page refresh where spaces might not be loaded yet
      sendMessage({ type: 'get_members', payload: { spaceId } })
      sendMessage({ type: 'get_messages', payload: { spaceId } })

      // If spaces is loaded and current space not found, redirect to spaces list
      if (spaces.length > 0 && !currentSpace) {
        navigate('/spaces')
      }
    }
  }, [spaceId, connectionStatus, spaces, setSpace, sendMessage, navigate])

  // Track if user is at bottom (viewing latest messages)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Check if user is at bottom when scrolling
  const handleScrollForBottomCheck = useCallback(() => {
    if (!messagesContainerRef.current) return

    const container = messagesContainerRef.current
    const scrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight

    // Check if scrolled to bottom (within 50px)
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    setIsAtBottom(atBottom)
  }, [])

  // Add scroll listener for bottom detection
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScrollForBottomCheck)
    return () => {
      container.removeEventListener('scroll', handleScrollForBottomCheck)
    }
  }, [handleScrollForBottomCheck])

  // Scroll to bottom when messages change, but only if user is at bottom
  // and not when loading older messages
  useEffect(() => {
    if (isAtBottom && !isLoadingOlderMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoadingOlderMessages, isAtBottom])

  // Track when older messages are loaded
  const [lastOlderMessagesRequestId, setLastOlderMessagesRequestId] = useState<string>('')
  const [olderMessagesReceived, setOlderMessagesReceived] = useState<number>(0)

  // Initialize olderMessagesReceived when messages are first loaded
  useEffect(() => {
    if (messages.length > 0 && olderMessagesReceived === 0) {
      setOlderMessagesReceived(messages.length)
    }
  }, [messages, olderMessagesReceived])

  // Reset loading state when messages change (older messages loaded)
  useEffect(() => {
    if (messages.length > 0 && isLoadingOlderMessages) {
      const currentFirstMessageId = messages[0].id

      // Check if first message changed since we requested older messages
      if (currentFirstMessageId !== lastOlderMessagesRequestId) {
        setIsLoadingOlderMessages(false)

        // Count how many older messages we received
        const newMessageCount = messages.length - olderMessagesReceived
        if (newMessageCount < 50) {
          // Got fewer than 50 messages, probably no more
          setHasMoreMessages(false)
        }

        setOlderMessagesReceived(messages.length)
      }
    }
  }, [messages, isLoadingOlderMessages, lastOlderMessagesRequestId, olderMessagesReceived])

  // Handle scroll to load older messages
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || isLoadingOlderMessages || !hasMoreMessages || messages.length === 0) {
      return
    }

    const container = messagesContainerRef.current
    const scrollTop = container.scrollTop

    // If scrolled near the top (within 100px)
    if (scrollTop < 100) {
      const oldestMessageId = messages[0].id
      const previousScrollHeight = container.scrollHeight
      setIsLoadingOlderMessages(true)
      setLastOlderMessagesRequestId(oldestMessageId)

      // Store scroll height before loading to restore position
      const beforeLoadScrollInfo = {
        scrollHeight: previousScrollHeight,
        scrollTop: scrollTop
      }

      sendMessage({
        type: 'get_older_messages',
        payload: { spaceId, beforeId: oldestMessageId }
      })

      // After messages are loaded, restore scroll position
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight
          const heightDiff = newScrollHeight - beforeLoadScrollInfo.scrollHeight
          messagesContainerRef.current.scrollTop = beforeLoadScrollInfo.scrollTop + heightDiff
        }
      }, 100)
    }
  }, [messages, isLoadingOlderMessages, hasMoreMessages, spaceId, sendMessage])

  // Add scroll event listener
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  const sendChatMessage = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || !spaceId) return

    // Check if space is paused
    if (space?.isPaused) {
      alert(t('common.spacePausedAlertMessage'))
      return
    }

    setIsUploading(true)

    try {
      // Process attachments if any
      const attachments: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[] = []

      for (const file of selectedFiles) {
        const base64Data = await readFileAsBase64(file)
        const fileType = detectFileType(file.type)

        attachments.push({
          type: fileType,
          originalName: file.name,
          storedName: generateStoredFileName(file.name),
          relativePath: '', // Will be set by server
          fileSize: file.size,
          mimeType: file.type,
          data: base64Data, // Include base64 file data
        })
      }

      sendMessage({
        type: 'send_message',
        payload: {
          spaceId: spaceId,
          content: newMessage.trim() || (selectedFiles.length > 0 ? `发送 ${selectedFiles.length} 个文件` : ''),
          attachments: attachments.length > 0 ? attachments : undefined
        }
      })

      setNewMessage('')
      setSelectedFiles([])

      // When user sends a message, scroll to bottom to show their message
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
      }, 100)
    } catch (error) {
      console.error('Error sending message with attachments:', error)
      alert(t('errors.uploadFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const detectFileType = (mimeType: string): 'image' | 'document' | 'media' | 'file' => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return 'media'
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document'
    return 'file'
  }

  const generateStoredFileName = (originalName: string): string => {
    const ext = originalName.split('.').pop() || ''
    const uuid = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
    return ext ? `${uuid}.${ext}` : uuid
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setSelectedFiles(prev => [...prev, ...Array.from(files)])
    }
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handlePauseSpace = (spaceId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert(t('common.notConnectedToServer'))
      return
    }

    // Confirm before pausing
    if (window.confirm(t('common.pauseConfirmation'))) {
      sendMessage({
        type: 'pause_space',
        payload: { spaceId }
      })
    }
  }

  const handleResumeSpace = (spaceId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert(t('common.notConnectedToServer'))
      return
    }

    sendMessage({
      type: 'resume_space',
      payload: { spaceId }
    })
  }

  const getColor = (name: string) => {
    const colors = [
      '#e74c3c', // red
      '#3498db', // blue
      '#2ecc71', // green
      '#f39c12', // orange
      '#9b59b6', // purple
      '#1abc9c', // teal
      '#e91e63', // pink
      '#ff5722', // deep orange
      '#3f51b5', // indigo
      '#009688', // cyan
      '#795548', // brown
      '#607d8b', // blue grey
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const getMemberInfo = (senderId: string) => {
    if (senderId === 'user') {
      return { name: t('common.me'), avatar: t('common.me'), color: '#4a90d9', isUser: true }
    }
    const member = members.find(m => m.id === senderId)
    const name = member?.name || t('common.unknown')
    const avatar = name.charAt(0)
    const color = getColor(name)
    return { name, avatar, color, isUser: false }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  const switchSpace = (targetSpace: Space) => {
    navigate(`/spaces/${targetSpace.id}/chat`)
    setShowSpaceList(false)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    disconnect()
    navigate('/')
  }

  if (!space) {
    return <div className="container"><div className="empty-state">{t('common.loading')}</div></div>
  }

  return (
    <div className="container">
      <div className="chat-page">
        <div className="chat-header">
          <div className="chat-header-left">
            <button
              className="back-button"
              onClick={() => navigate('/spaces')}
            >
              ←
            </button>
            <span className="chat-title">{space.name}</span>
            {/* Space Selector Dropdown */}
            <div className="space-selector">
              <button
                className="space-selector-button"
                onClick={() => setShowSpaceList(!showSpaceList)}
              >
                ▼
              </button>
              {showSpaceList && (
                <div className="space-dropdown">
                  <div className="space-dropdown-header">
                    {t('chat.switchSpaceHeader')}
                  </div>
                  {spaces.map((s) => (
                    <div
                      key={s.id}
                      className={`space-dropdown-item ${s.id === space?.id ? 'active' : ''}`}
                      onClick={() => switchSpace(s)}
                    >
                      <span className="space-dropdown-name">{s.name}</span>
                      {s.id === space?.id && <span className="space-dropdown-check">✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="header-actions">
            {/* Pause/Resume Button */}
            {space.isPaused ? (
              <button
                className="resume-button"
                onClick={() => handleResumeSpace(space.id)}
                title={t('chat.resumeTooltip')}
              >
                {t('chat.resumeButton')}
              </button>
            ) : (
              <button
                className="pause-button"
                onClick={() => handlePauseSpace(space.id)}
                title={t('chat.pauseTooltip')}
              >
                {t('chat.pauseButton')}
              </button>
            )}

            {/* Pause Status Badge */}
            {space.isPaused && (
              <span className="pause-badge" title={`${t('chat.spacePaused')} ${space.pausedAt ? new Date(space.pausedAt).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US') : t('common.unknownTime')}`}>
                ⏸️ {t('chat.spacePaused')}
              </span>
            )}

            <button
              className="member-manager-button"
              onClick={() => setShowMemberManager(true)}
              title={t('chat.manageMembers')}
            >
              👥 {t('chat.members')}
            </button>
            <div className="connection-status">{t('chat.connected')}</div>
            <button className="logout-button" onClick={logout} title={t('spaces.logoutTooltip')}>
              {t('spaces.logout')}
            </button>
          </div>
        </div>

        <div className="messages-container" ref={messagesContainerRef}>
          {isLoadingOlderMessages && (
            <div className="loading-older-messages">
              <div className="loading-spinner"></div>
              <span>{t('chat.loadingOlderMessages')}</span>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>{t('common.noMessages')}</p>
              <p>{t('common.sendFirstMessage')}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const memberInfo = getMemberInfo(msg.senderId)
              return (
                <div
                  key={msg.id}
                  className={`message ${memberInfo.isUser ? 'user' : 'ai'}`}
                >
                  {!memberInfo.isUser && (
                    <div className="message-avatar" style={{ backgroundColor: memberInfo.color }}>
                      {memberInfo.avatar}
                    </div>
                  )}
                  <div className="message-body">
                    <div className="message-header">
                      <span className="message-sender">{memberInfo.name}</span>
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="message-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <>{children}</>,
                          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ol>,
                          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                          code: ({ children }) => (
                            <code style={{
                              background: memberInfo.isUser ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '13px',
                              fontFamily: 'Monaco, Menlo, monospace'
                            }}>
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre style={{
                              background: memberInfo.isUser ? 'rgba(0,0,0,0.2)' : '#f5f5f5',
                              padding: '12px',
                              borderRadius: '8px',
                              overflow: 'auto',
                              fontSize: '13px',
                              margin: '8px 0'
                            }}>
                              {children}
                            </pre>
                          ),
                          strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                          table: ({ children }) => <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0', fontSize: '14px' }}>{children}</table>,
                          thead: ({ children }) => <thead style={{ background: memberInfo.isUser ? 'rgba(255,255,255,0.15)' : '#f8f9fa' }}>{children}</thead>,
                          th: ({ children }) => <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, borderBottom: memberInfo.isUser ? '2px solid rgba(255,255,255,0.3)' : '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{children}</th>,
                          td: ({ children }) => <td style={{ padding: '10px 12px', borderBottom: memberInfo.isUser ? '1px solid rgba(255,255,255,0.15)' : '1px solid #f0f0f0', verticalAlign: 'top', lineHeight: 1.5 }}>{children}</td>,
                          tr: ({ children }) => <tr>{children}</tr>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>

                      {/* Tool Status - show when AI is using tools */}
                      {!memberInfo.isUser && toolStatuses[msg.id] && toolStatuses[msg.id].length > 0 && (
                        <div className="tool-status">
                          {toolStatuses[msg.id].map((tool) => (
                            <span key={tool.toolCallId} className="tool-status-item">
                              <span className="tool-status-icon">⚙️</span>
                              <span className="tool-status-text">
                                {tool.phase === 'result' ? '已完成' : '正在使用'} {tool.toolName} 工具...
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="message-attachments">
                          {msg.attachments.map((attachment) => (
                            <AttachmentView
                              key={attachment.id}
                              attachment={attachment}
                              isUser={memberInfo.isUser}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          {/* Selected Files Preview */}
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              {selectedFiles.map((file, index) => (
                <div key={index} className="selected-file-item">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">({formatFileSize(file.size)})</span>
                  <button
                    className="remove-file-btn"
                    onClick={() => handleRemoveFile(index)}
                    disabled={isUploading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-input-row">
            {/* File Upload Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              multiple
              disabled={isUploading}
            />
            <button
              className="attach-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title={t('chat.attachButton')}
            >
              📎
            </button>

            <textarea
              className="chat-input"
              placeholder={t('chat.chatInputPlaceholder')}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendChatMessage()
                }
              }}
              rows={1}
              disabled={isUploading}
            />
            <button
              className="send-button"
              onClick={sendChatMessage}
              disabled={(!newMessage.trim() && selectedFiles.length === 0) || isUploading}
            >
              {isUploading ? t('chat.sending') : t('chat.sendButton')}
            </button>
          </div>
        </div>

        {/* Member Manager Modal */}
        {showMemberManager && (
          <MemberManagerModal
            members={members}
            spaceId={spaceId || ''}
            onClose={() => setShowMemberManager(false)}
            sendMessage={sendMessage}
            setMembers={setMembers}
          />
        )}
      </div>
    </div>
  )
}

// Member Manager Modal Component
function MemberManagerModal({
  members,
  spaceId,
  onClose,
  sendMessage,
  setMembers
}: {
  members: Member[]
  spaceId: string
  onClose: () => void
  sendMessage: (message: HubMessage) => void
  setMembers: (m: Member[] | ((prev: Member[]) => Member[])) => void
}) {
  const { t } = useTranslation(['common', 'ai']);
  const defaultSoulMdTemplate = useDefaultSoulMdTemplate();
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSoulMd, setEditSoulMd] = useState('')
  const [editIdentityMd, setEditIdentityMd] = useState('')

  // Generate default identityMd from name
  const generateDefaultIdentityMd = (name: string): string => {
    return `- **Name:** ${name}
- **Creature:** AI Assistant
- **Vibe:** 专业、高效、实事求是
- **Emoji:** 🤖`
  }

  const startAdd = () => {
    setIsAdding(true)
    setEditName('')
    setEditSoulMd(defaultSoulMdTemplate)
    setEditIdentityMd(generateDefaultIdentityMd(''))
  }

  const startEdit = (member: Member) => {
    setEditingMember(member)
    setEditName(member.name)
    setEditSoulMd(member.soulMd)
    setEditIdentityMd(member.identityMd || generateDefaultIdentityMd(member.name))
  }

  const handleSave = () => {
    if (!editName.trim() || !editSoulMd.trim()) return

    // Update identityMd name if it was generated
    let finalIdentityMd = editIdentityMd
    if (!finalIdentityMd.trim()) {
      finalIdentityMd = generateDefaultIdentityMd(editName)
    } else {
      // Try to update the Name field in identityMd if it contains the old name
      finalIdentityMd = finalIdentityMd.replace(/^(\- \*\*Name:\*\*)\s*.*$/m, `$1 ${editName}`)
    }

    if (isAdding) {
      // Add new member
      sendMessage({
        type: 'add_member',
        payload: { spaceId, name: editName, soulMd: editSoulMd, identityMd: finalIdentityMd }
      })
    } else if (editingMember) {
      // Update existing member
      sendMessage({
        type: 'update_member',
        payload: { memberId: editingMember.id, name: editName, soulMd: editSoulMd, identityMd: finalIdentityMd }
      })
    }

    setIsAdding(false)
    setEditingMember(null)
    setEditName('')
    setEditSoulMd('')
    setEditIdentityMd('')
  }

  const handleDelete = (memberId: string) => {
    if (!confirm(t('common.deleteConfirm'))) return
    sendMessage({
      type: 'remove_member',
      payload: { memberId }
    })
  }

  const cancelEdit = () => {
    setIsAdding(false)
    setEditingMember(null)
    setEditName('')
    setEditSoulMd('')
    setEditIdentityMd('')
  }

  const getAvatar = (name: string) => name.charAt(0)

  const getColor = (name: string) => {
    const colors = [
      '#e74c3c', // red
      '#3498db', // blue
      '#2ecc71', // green
      '#f39c12', // orange
      '#9b59b6', // purple
      '#1abc9c', // teal
      '#e91e63', // pink
      '#ff5722', // deep orange
      '#3f51b5', // indigo
      '#009688', // cyan
      '#795548', // brown
      '#607d8b', // blue grey
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  // Handle member updates from server
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'members_data') {
          setMembers(message.payload?.members || [])
        } else if (message.type === 'member_added' || message.type === 'member_updated' || message.type === 'member_removed') {
          // Refresh members list
          sendMessage({ type: 'get_members', payload: { spaceId } })
        }
      } catch {
        // Ignore parse errors
      }
    }

    window.addEventListener('message', handleMessage as EventListener)
    return () => window.removeEventListener('message', handleMessage as EventListener)
  }, [spaceId, sendMessage, setMembers])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal member-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('chat.manageTeamMembers')}</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {(isAdding || editingMember) ? (
          <div className="member-edit-form">
            <div className="form-group">
              <label className="form-label">{t('aiMembers.memberName')}</label>
              <input
                type="text"
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('aiMembers.customMemberNamePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('aiMembers.memberSoulMd')}</label>
              <textarea
                className="textarea"
                value={editSoulMd}
                onChange={(e) => setEditSoulMd(e.target.value)}
                rows={10}
                placeholder={t('aiMembers.memberSoulMdPlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">IDENTITY.md</label>
              <textarea
                className="textarea"
                value={editIdentityMd}
                onChange={(e) => setEditIdentityMd(e.target.value)}
                rows={6}
                placeholder={`- **Name:** Name
- **Creature:** Role
- **Vibe:** Description
- **Emoji:** 🎨`}
              />
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={cancelEdit}>
                {t('common.cancel')}
              </button>
              <button className="button" onClick={handleSave} disabled={!editName.trim() || !editSoulMd.trim()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="member-list member-list-manage">
              {members.map((member) => (
                <div key={member.id} className="member-item-manage">
                  <div className="member-info">
                    <div className="member-avatar" style={{ backgroundColor: getColor(member.name) }}>
                      {getAvatar(member.name)}
                    </div>
                    <div className="member-name">{member.name}</div>
                  </div>
                  <div className="member-actions">
                    <button className="icon-button" onClick={() => startEdit(member)} title={t('aiMembers.editTooltip')}>
                      ✏️
                    </button>
                    <button className="icon-button delete" onClick={() => handleDelete(member.id)} title={t('aiMembers.deleteTooltip')}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="button" onClick={startAdd}>
                + {t('aiMembers.addMember')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Attachment View Component
function AttachmentView({ attachment, isUser }: { attachment: Attachment; isUser: boolean }) {
  const { t } = useTranslation('common');

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string): string => {
    switch (type) {
      case 'image': return '🖼️';
      case 'document': return '📄';
      case 'media': return '🎬';
      default: return '📎';
    }
  };

  if (attachment.type === 'image') {
    return (
      <div className="attachment image-attachment">
        <div className="attachment-preview">
          <img
            src={`/api/files/${attachment.relativePath}`}
            alt={attachment.originalName}
            className="attachment-image"
            loading="lazy"
            onClick={() => window.open(`/api/files/${attachment.relativePath}`, '_blank')}
          />
        </div>
        <div className="attachment-info">
          <span className="attachment-name">{getFileIcon(attachment.type)} {attachment.originalName}</span>
          <span className="attachment-size">({formatFileSize(attachment.fileSize)})</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`attachment file-attachment ${isUser ? 'user' : ''}`}>
      <div className="attachment-icon">{getFileIcon(attachment.type)}</div>
      <div className="attachment-details">
        <div className="attachment-name">{attachment.originalName}</div>
        <div className="attachment-meta">
          <span className="attachment-size">{formatFileSize(attachment.fileSize)}</span>
          <span className="attachment-type">{attachment.mimeType}</span>
        </div>
      </div>
      <a
        href={`/api/files/${attachment.relativePath}`}
        download={attachment.originalName}
        className="attachment-download"
        title={t('chat.downloadAttachment')}
      >
        ⬇️
      </a>
    </div>
  );
}

// Connection Guard - redirects to token page if not connected
function ConnectionGuard({
  connectionStatus,
  children
}: {
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    console.log('[ConnectionGuard] Status:', connectionStatus, 'Path:', location.pathname)
    // If not connected and not on token page, redirect to token page
    if (connectionStatus === 'idle' && location.pathname !== '/') {
      console.log('[ConnectionGuard] Not connected, redirecting to token page')
      navigate('/')
    }
  }, [connectionStatus, navigate, location.pathname])

  return <>{children}</>
}

// Main App Component
function App() {
  const [inputToken, setInputToken] = useState('')
  const {
    setToken,
    connectionStatus, setConnectionStatus,
    error, setError,
    space, setSpace,
    spaces, setSpaces,
    members, setMembers,
    messages, setMessages,
    creationProgress, setCreationProgress,
    teamTemplates, setTeamTemplates,
    toolStatuses, setToolStatuses,
    wsRef,
    disconnect
  } = useGlobalState()

  return (
    <BrowserRouter>
      <LanguageSwitcher />
      <Routes>
        <Route
          path="/"
          element={
            <TokenPage
              setToken={setToken}
              inputToken={inputToken}
              setInputToken={setInputToken}
              connectionStatus={connectionStatus}
              setConnectionStatus={setConnectionStatus}
              error={error}
              setError={setError}
              wsRef={wsRef}
              setSpaces={setSpaces}
              setMembers={setMembers}
              setMessages={setMessages}
              space={space}
              setSpace={setSpace}
              setCreationProgress={setCreationProgress}
              setTeamTemplates={setTeamTemplates}
              setToolStatuses={setToolStatuses}
            />
          }
        />
        <Route
          path="/spaces"
          element={
            <ConnectionGuard connectionStatus={connectionStatus}>
              <SpaceListPage
                spaces={spaces}
                connectionStatus={connectionStatus}
                wsRef={wsRef}
                setSpaces={setSpaces}
                disconnect={disconnect}
                creationProgress={creationProgress}
                setCreationProgress={setCreationProgress}
                teamTemplates={teamTemplates}
              />
            </ConnectionGuard>
          }
        />
        <Route
          path="/spaces/:spaceId/chat"
          element={
            <ConnectionGuard connectionStatus={connectionStatus}>
              <ChatPage
                spaces={spaces}
                space={space}
                setSpace={setSpace}
                members={members}
                setMembers={setMembers}
                messages={messages}
                wsRef={wsRef}
                connectionStatus={connectionStatus}
                disconnect={disconnect}
                toolStatuses={toolStatuses}
              />
            </ConnectionGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
