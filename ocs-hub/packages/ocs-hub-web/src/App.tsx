import { useState, useEffect, useRef, useCallback } from 'react'
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
}

interface Message {
  id: string
  spaceId: string
  senderId: string
  content: string
  timestamp: string
}

interface HubMessage {
  type: string
  payload?: any
}

// Default Hub URL (configurable)
const DEFAULT_HUB_URL = '/ws'
const STORAGE_KEY = 'ocs_token'

// Default robot templates will be loaded from i18n translations

// Hook to get default robots based on current language
function useDefaultRobots(): Array<{ name: string; soulMd: string }> {
  const { t } = useTranslation('ai');
  const defaultRobots = t('roles.defaultRobots', { returnObjects: true }) as Array<{ name: string; soulMd: string }>;

  // Ensure we always return valid data even if translation fails
  if (!Array.isArray(defaultRobots) || defaultRobots.length === 0) {
    // Fallback to English defaults if translation fails
    return [
      { name: 'Ma Liang (CEO)', soulMd: 'You are Ma Liang, CEO...' },
      { name: 'Xi He (Product Manager)', soulMd: 'You are Xi He, Product Manager...' },
      { name: 'Lu Ban (Programmer)', soulMd: 'You are Lu Ban, Programmer...' },
      { name: 'Luo Zhou (QA)', soulMd: 'You are Luo Zhou, QA Engineer...' },
    ];
  }

  return defaultRobots;
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
  setCreationProgress
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
        // Only navigate to spaces list if we're on the token page
        // This allows refreshing on chat page to stay on chat page
        if (location.pathname === '/') {
          navigate('/spaces')
        }
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

      case 'new_message':
        const msg = message.payload?.message
        if (msg) {
          setMessages((prev: Message[]) => [...prev, msg])
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

      case 'error':
        setError(message.payload?.error || t('errors.unknownError'))
        break
    }
  }, [navigate, setConnectionStatus, setError, setMembers, setMessages, setSpace, setSpaces, space])

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
  setCreationProgress
}: {
  spaces: Space[]
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error'
  wsRef: React.RefObject<WebSocket | null>
  setSpaces: (s: Space[] | ((prev: Space[]) => Space[])) => void
  disconnect: () => void
  creationProgress: string
  setCreationProgress: (p: string) => void
}) {
  const { t } = useTranslation('common');
  const navigate = useNavigate()
  const defaultRobots = useDefaultRobots();
  const [newSpaceName, setNewSpaceName] = useState('')
  const [customMembers, setCustomMembers] = useState(defaultRobots.map(r => ({ ...r })))
  const [editingMember, setEditingMember] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editSoulMd, setEditSoulMd] = useState('')

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
    setCreationProgress(t('spaces.creatingTeamStarted'))
    sendMessage({
      type: 'create_space',
      payload: { name: newSpaceName, members: customMembers }
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
  }

  const saveMemberEdit = () => {
    if (editingMember === null) return
    const newMembers = [...customMembers]
    newMembers[editingMember] = { name: editName, soulMd: editSoulMd }
    setCustomMembers(newMembers)
    setEditingMember(null)
  }

  const cancelMemberEdit = () => {
    setEditingMember(null)
    setEditName('')
    setEditSoulMd('')
  }

  const resetToDefaults = () => {
    setCustomMembers(defaultRobots.map(r => ({ ...r })))
  }

  const getAvatar = (name: string) => name.charAt(0)

  const getColor = (name: string) => {
    if (name.includes('CEO') || name.includes('马良')) return '#e74c3c'
    if (name.includes('产品经理') || name.includes('羲和')) return '#3498db'
    if (name.includes('程序员') || name.includes('鲁班')) return '#2ecc71'
    if (name.includes('测试') || name.includes('螺舟')) return '#f39c12'
    return '#888'
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

          <div className="form-group">
            <div className="member-list-header">
              <label className="form-label">{t('spaces.teamMembersWithCount', { count: customMembers.length })}</label>
              <button className="reset-button" onClick={resetToDefaults}>
                {t('spaces.resetToDefaults')}
              </button>
            </div>
            <div className="member-list">
              {customMembers.map((member, index) => (
                <div key={index} className="member-item editable" onClick={() => startEditMember(index)}>
                  <div className="member-avatar" style={{ backgroundColor: getColor(member.name) }}>
                    {getAvatar(member.name)}
                  </div>
                  <div className="member-name">{member.name}</div>
                  <div className="member-edit-icon">✏️</div>
                </div>
              ))}
            </div>
            <p className="member-hint">{t('spaces.memberEditHint')}</p>
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
              <h3 className="modal-title">{t('aiMembers.editMember')}</h3>
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
  disconnect
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
}) {
  const { t } = useTranslation('common');
  const { spaceId } = useParams<{ spaceId: string }>()
  const navigate = useNavigate()
  const [newMessage, setNewMessage] = useState('')
  const [showSpaceList, setShowSpaceList] = useState(false)
  const [showMemberManager, setShowMemberManager] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendChatMessage = () => {
    if (!newMessage.trim() || !spaceId) return

    // Check if space is paused
    if (space?.isPaused) {
      alert(t('common.spacePausedAlertMessage'))
      return
    }

    sendMessage({
      type: 'send_message',
      payload: {
        spaceId: spaceId,
        content: newMessage
      }
    })
    setNewMessage('')
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

  const getMemberInfo = (senderId: string) => {
    if (senderId === 'user') {
      return { name: t('common.me'), avatar: t('common.me'), color: '#4a90d9', isUser: true }
    }
    const member = members.find(m => m.id === senderId)
    const name = member?.name || t('common.unknown')
    const avatar = name.charAt(0)
    let color = '#888'
    if (name.includes('CEO') || name.includes('马良')) color = '#e74c3c'
    else if (name.includes('产品经理') || name.includes('羲和')) color = '#3498db'
    else if (name.includes('程序员') || name.includes('鲁班')) color = '#2ecc71'
    else if (name.includes('测试') || name.includes('螺舟')) color = '#f39c12'
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

        <div className="messages-container">
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
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
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
          />
          <button
            className="send-button"
            onClick={sendChatMessage}
            disabled={!newMessage.trim()}
          >
            {t('chat.sendButton')}
          </button>
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
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSoulMd, setEditSoulMd] = useState('')

  const startAdd = () => {
    setIsAdding(true)
    setEditName('')
    setEditSoulMd(t('roles.defaultSoulMdTemplate', { ns: 'ai' }))
  }

  const startEdit = (member: Member) => {
    setEditingMember(member)
    setEditName(member.name)
    setEditSoulMd(member.soulMd)
  }

  const handleSave = () => {
    if (!editName.trim() || !editSoulMd.trim()) return

    if (isAdding) {
      // Add new member
      sendMessage({
        type: 'add_member',
        payload: { spaceId, name: editName, soulMd: editSoulMd }
      })
    } else if (editingMember) {
      // Update existing member
      sendMessage({
        type: 'update_member',
        payload: { memberId: editingMember.id, name: editName, soulMd: editSoulMd }
      })
    }

    setIsAdding(false)
    setEditingMember(null)
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
  }

  const getAvatar = (name: string) => name.charAt(0)

  const getColor = (name: string) => {
    if (name.includes('CEO') || name.includes('马良')) return '#e74c3c'
    if (name.includes('产品经理') || name.includes('羲和')) return '#3498db'
    if (name.includes('程序员') || name.includes('鲁班')) return '#2ecc71'
    if (name.includes('测试') || name.includes('螺舟')) return '#f39c12'
    return '#888'
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
              />
            </ConnectionGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
