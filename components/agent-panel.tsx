'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { ModeSelector } from '@/components/mode-selector'
import { ChatHome } from '@/components/chat-home'
import { ChatHeader } from '@/components/chat-header'
import type { AgentMode } from '@/components/mode-selector'
import { usePermissions } from '@/components/permissions-toggle'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { DiffViewer } from '@/components/diff-viewer'
import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
import { showInlineDiff, type InlineDiffResult } from '@/lib/inline-diff'
import { diffEngine } from '@/lib/streaming-diff'
import { handleChatEvent, type ChatMessage, type StreamState } from '@/lib/chat-stream'
import { MessageList } from '@/components/chat/message-list'
import { ChatInputBar } from '@/components/chat/chat-input-bar'
import { emit, on } from '@/lib/events'
import { copyToClipboard } from '@/lib/clipboard'
import type { PlanStep } from '@/components/plan-view'
import { navigateToLine } from '@/lib/line-links'
import {
  CODE_EDITOR_SESSION_KEY,
  SESSION_INIT_STORAGE_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  CODE_EDITOR_SYSTEM_PROMPT,
  buildEditorContext,
} from '@/lib/agent-session'

// ChatMessage type imported from @/lib/chat-stream

function AgentConnectPrompt() {
  const { status, error, connect } = useGateway()
  const [showManual, setShowManual] = useState(false)
  const [url, setUrl] = useState('ws://localhost:18789')
  const [password, setPassword] = useState('')

  const isConnecting = status === 'connecting' || status === 'authenticating'

  const handleConnect = () => {
    if (!url.trim()) return
    connect(url.trim(), password)
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,transparent)] to-[color-mix(in_srgb,var(--brand)_6%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)] flex items-center justify-center shadow-lg">
          <Icon
            icon={isConnecting ? 'lucide:loader-2' : 'lucide:cpu'}
            width={28}
            height={28}
            className={`text-[var(--brand)] ${isConnecting ? 'animate-spin' : ''}`}
          />
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg)] ${
            isConnecting ? 'bg-[var(--warning,#eab308)] animate-pulse' : 'bg-[var(--text-disabled)]'
          }`}
        />
      </div>

      {isConnecting ? (
        <>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1.5">
            Connecting…
          </h3>
          <p className="text-[13px] text-[var(--text-tertiary)]">Looking for OpenClaw gateway</p>
        </>
      ) : (
        <>
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1.5">
            Gateway not found
          </h3>
          <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed mb-4 max-w-[280px]">
            Make sure OpenClaw is running on this machine.
          </p>

          <div className="space-y-2.5 w-full max-w-[280px]">
            <button
              onClick={() => connect('ws://localhost:18789', '')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast, #fff)' }}
            >
              <Icon icon="lucide:refresh-cw" width={14} height={14} />
              Retry connection
            </button>

            <button
              onClick={() => setShowManual((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:settings-2" width={12} height={12} />
              {showManual ? 'Hide' : 'Manual connection'}
            </button>

            {showManual && (
              <div className="space-y-2 pt-1">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect()
                  }}
                  placeholder="ws://localhost:18789"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect()
                  }}
                  placeholder="Password (if set)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)]"
                />
                <button
                  onClick={handleConnect}
                  disabled={!url.trim()}
                  className="w-full py-2 rounded-lg text-[12px] font-medium bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 mt-3 text-[11px] text-[var(--color-deletions)] max-w-[280px] text-left">
              <Icon icon="lucide:alert-circle" width={12} height={12} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <p className="mt-5 text-[11px] text-[var(--text-disabled)]">
            Run{' '}
            <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--brand)]">
              openclaw gateway start
            </code>{' '}
            to start
          </p>
        </>
      )}
    </div>
  )
}

export function AgentPanel() {
  const { sendRequest, onEvent, status } = useGateway()
  const { files, activeFile, getFile, openFile, updateFileContent } = useEditor()
  const { repo, tree: repoTree } = useRepo()
  const local = useLocal()
  const permissions = usePermissions()

  // Single persistent session — no multi-chat
  const sessionKey = CODE_EDITOR_SESSION_KEY
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('code-editor:chat:main')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [contextAttachments, setContextAttachments] = useState<
    Array<{
      type: 'file' | 'selection'
      path: string
      content: string
      startLine?: number
      endLine?: number
    }>
  >([])
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atMenuIdx, setAtMenuIdx] = useState(0)
  const [imageAttachments, setImageAttachments] = useState<
    Array<{ name: string; dataUrl: string }>
  >([])
  const [modelInfo, setModelInfo] = useState<{ current: string; available: string[] }>({
    current: '',
    available: [],
  })
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const [agentMode, setAgentMode] = useState<AgentMode>('agent')
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([])
  const [contextTokens, setContextTokens] = useState(0)
  const inlineDiffRef = useRef<InlineDiffResult | null>(null)
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingTrail, setThinkingTrail] = useState<string[]>([])
  const [activeDiff, setActiveDiff] = useState<{
    proposal: EditProposal
    messageId: string
    original: string
  } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionInitRef = useRef(false)
  const sentKeysRef = useRef(new Set<string>())
  const handledKeysRef = useRef(new Set<string>())
  const lastFinalRef = useRef<{ content: string; ts: number } | null>(null)
  const sendingRef = useRef(false)
  const sessionKeyRef = useRef(sessionKey)
  const [streamBuffer, setStreamBuffer] = useState('')
  const logChatDebug = useCallback((stage: string, details?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    if (details) {
      console.debug('[knot-chat]', stage, details)
      return
    }
    console.debug('[knot-chat]', stage)
  }, [])

  useEffect(() => {
    sessionKeyRef.current = sessionKey
  }, [sessionKey])
  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  // Build flat file list for @ mentions
  const allFilePaths = useMemo(() => {
    if (local.localMode && local.localTree.length > 0) {
      return local.localTree.filter((e) => !e.is_dir).map((e) => e.path)
    }
    return repoTree.filter((n) => n.type === 'blob').map((n) => n.path)
  }, [local.localMode, local.localTree, repoTree])

  const atResults = useMemo(() => {
    if (!atQuery) return allFilePaths.slice(0, 8)
    const q = atQuery.toLowerCase()
    return allFilePaths
      .filter((p) => p.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.split('/').pop()!.toLowerCase()
        const bName = b.split('/').pop()!.toLowerCase()
        const aStarts = aName.startsWith(q) ? 0 : 1
        const bStarts = bName.startsWith(q) ? 0 : 1
        return aStarts - bStarts || a.length - b.length
      })
      .slice(0, 8)
  }, [atQuery, allFilePaths])

  const isConnected = status === 'connected'

  // ─── Fetch model info from gateway ────────────────────────
  useEffect(() => {
    if (!isConnected) return
    ;(async () => {
      try {
        // Get current session status for model info
        const status = (await sendRequest('sessions.status', { sessionKey })) as
          | Record<string, unknown>
          | undefined
        const model = (status?.model as string) || (status?.defaultModel as string) || ''

        // Get available models/agents
        const agentsResp = (await sendRequest('agents.list', {})) as
          | Record<string, unknown>
          | undefined
        const agents = (agentsResp?.agents as Array<Record<string, unknown>>) || []
        const models = agents
          .map((a) => (a.model as string) || (a.id as string))
          .filter(Boolean)
          .slice(0, 4)

        // Fallback: try config for default model
        if (!models.length) {
          const configResp = (await sendRequest('config.get', { key: 'defaultModel' })) as
            | Record<string, unknown>
            | undefined
          const defaultModel = configResp?.value as string
          if (defaultModel) models.push(defaultModel)
        }

        setModelInfo({
          current: model || 'unknown',
          available: models.length ? models : [model || 'claude-sonnet-4-5'],
        })
      } catch {
        setModelInfo({ current: 'claude-sonnet-4-5', available: ['claude-sonnet-4-5'] })
      }
    })()
  }, [isConnected, sendRequest])

  // ─── Lazy session initialization (only on first message) ──────
  const ensureSessionInit = useCallback(async () => {
    if (sessionInitRef.current) return

    const initKey = `${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
    const alreadyInit = typeof window !== 'undefined' && sessionStorage.getItem(initKey)
    if (alreadyInit) {
      sessionInitRef.current = true
      return
    }

    try {
      await sendRequest('chat.inject', {
        sessionKey,
        message: CODE_EDITOR_SYSTEM_PROMPT,
        label: 'Knot Code system prompt',
      })
      sessionInitRef.current = true
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(initKey, 'true')
      }
      // Label the session only after init succeeds
      sendRequest('sessions.patch', {
        key: sessionKey,
        label: 'Knot Code',
      }).catch(() => {})
    } catch {
      // Non-fatal — session still works without explicit system prompt
    }
  }, [sendRequest, sessionKey])

  // ─── Stream state for chat-stream handler ──────────────────────
  const streamStateRef = useRef<StreamState>({
    sentKeys: sentKeysRef.current,
    handledKeys: handledKeysRef.current,
    lastFinal: null,
    sessionKey,
    isSending: false,
  })
  // Keep stream state in sync
  useEffect(() => {
    streamStateRef.current.sessionKey = sessionKey
  }, [sessionKey])
  useEffect(() => {
    streamStateRef.current.isSending = sending
  }, [sending])

  // ─── Listen for chat events (streaming replies) ───────────────
  useEffect(() => {
    const callbacks = {
      setStreamBuffer,
      setIsStreaming,
      setSending,
      setThinkingTrail,
      setMessages,
      getFile,
    }
    const unsub = onEvent('chat', (payload: unknown) => {
      const evt = payload as Record<string, unknown>
      logChatDebug('chat event received', {
        state: evt?.state,
        idempotencyKey: evt?.idempotencyKey ?? evt?.idempotency_key,
        sessionKey: evt?.sessionKey ?? evt?.session_key,
        hasMessage: Boolean(evt?.message),
        hasText: typeof evt?.text === 'string',
        hasReply: typeof evt?.reply === 'string',
      })
      handleChatEvent(payload, streamStateRef.current, callbacks)
    })
    return unsub
  }, [onEvent, getFile, logChatDebug])

  // ─── @ mention file selection ──────────────────────────────
  const selectAtFile = useCallback(
    async (filePath: string) => {
      // Replace @query with @filename in input
      const textarea = inputRef.current
      if (textarea) {
        const cursor = textarea.selectionStart ?? input.length
        const before = input.slice(0, cursor)
        const after = input.slice(cursor)
        const newBefore = before.replace(/@[\w./\-]*$/, '')
        setInput(newBefore + after)
      }

      // Load file content and add as context attachment
      const existing = getFile(filePath)
      if (existing) {
        setContextAttachments((prev) => {
          if (prev.some((a) => a.path === filePath && a.type === 'file')) return prev
          return [...prev, { type: 'file', path: filePath, content: existing.content }]
        })
      } else {
        // Try to read from open files or fetch
        setContextAttachments((prev) => {
          if (prev.some((a) => a.path === filePath && a.type === 'file')) return prev
          return [
            ...prev,
            {
              type: 'file',
              path: filePath,
              content: `[File: ${filePath} — content will be fetched on send]`,
            },
          ]
        })
      }
      setAtMenuOpen(false)
      setAtQuery('')
      inputRef.current?.focus()
    },
    [input, getFile],
  )

  // ─── ⌘L: Send selection to agent panel ────────────────────
  useEffect(() => {
    return on('add-to-chat', (detail) => {
      setContextAttachments((prev) => [
        ...prev,
        {
          type: 'selection',
          path: detail.path,
          content: detail.content,
          startLine: detail.startLine,
          endLine: detail.endLine,
        },
      ])
      inputRef.current?.focus()
    })
  }, [])

  // ─── File handling (drag & drop, paste, file picker) ─────
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).slice(0, 5)
    for (const file of dropped) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setImageAttachments((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string },
          ])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setContextAttachments((prev) => [
            ...prev,
            {
              type: 'file' as const,
              path: file.name,
              content: (reader.result as string).slice(0, 12000),
            },
          ])
        }
        reader.readAsText(file)
      }
    }
  }, [])

  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'))
    if (items.length === 0) return
    e.preventDefault()
    for (const item of items.slice(0, 3)) {
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        setImageAttachments((prev) => [
          ...prev,
          { name: `screenshot-${Date.now()}.png`, dataUrl: reader.result as string },
        ])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleFileAttach = useCallback(() => {
    const picker = document.createElement('input')
    picker.type = 'file'
    picker.multiple = true
    picker.onchange = () => {
      const selected = Array.from(picker.files || []).slice(0, 5)
      for (const file of selected) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = () => {
            setImageAttachments((prev) => [
              ...prev,
              { name: file.name, dataUrl: reader.result as string },
            ])
          }
          reader.readAsDataURL(file)
        } else {
          const reader = new FileReader()
          reader.onload = () => {
            setContextAttachments((prev) => [
              ...prev,
              {
                type: 'file' as const,
                path: file.name,
                content: (reader.result as string).slice(0, 12000),
              },
            ])
          }
          reader.readAsText(file)
        }
      }
    }
    picker.click()
  }, [])

  // ─── Estimate context token usage ──────────────────────────
  useEffect(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    const fileTokens = file ? Math.ceil(Math.min(file.content.length, 8000) / 4) : 0
    const attachTokens = contextAttachments.reduce(
      (sum, a) => sum + Math.ceil(Math.min(a.content.length, 6000) / 4),
      0,
    )
    const imageTokens = imageAttachments.length * 1000 // ~1k tokens per image estimate
    setContextTokens(fileTokens + attachTokens + imageTokens)
  }, [activeFile, getFile, contextAttachments, imageAttachments])

  // ─── Listen for set-agent-input events ─────────────────────
  useEffect(() => {
    return on('set-agent-input', (detail) => {
      if (detail.text) setInput(detail.text)
      inputRef.current?.focus()
    })
  }, [])

  // ─── Listen for focus-agent-input (⌘L from anywhere) ──────
  useEffect(() => {
    return on('focus-agent-input', () => inputRef.current?.focus())
  }, [])

  // ─── Build per-message context ────────────────────────────────
  const buildContext = useCallback(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    return buildEditorContext({
      repoFullName: repo?.fullName,
      branch: repo?.branch,
      activeFilePath: file?.path,
      activeFileContent: file?.content,
      activeFileLanguage: file?.language,
      openFiles: files.map((f) => ({ path: f.path, dirty: f.dirty })),
      runtime: 'local',
      permissions,
    })
  }, [repo, activeFile, files, getFile, permissions])

  // ─── Message helpers ──────────────────────────────────────────
  // parsePlanSteps moved to components/chat/message-list.tsx

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem('code-editor:chat:main', JSON.stringify(messages.slice(-50)))
      } catch {}
    }
  }, [messages])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (
        last &&
        last.role === msg.role &&
        last.content === msg.content &&
        Math.abs(last.timestamp - msg.timestamp) < 2000
      ) {
        return prev
      }
      return [...prev, msg]
    })
  }, [])

  // ─── Commit result listener ──────────────────────────────────
  useEffect(() => {
    return on('agent-commit-result', (detail) => {
      if (detail.success) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: `Committed ${detail.fileCount} file(s) successfully.`,
          timestamp: Date.now(),
        })
      } else {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: `Commit failed: ${detail.error}`,
          timestamp: Date.now(),
        })
      }
    })
  }, [appendMessage])

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    logChatDebug('send attempt', {
      textLength: text.length,
      mode: agentMode,
      connected: isConnected,
      gatewayStatus: status,
      sessionKey,
      attachmentCount: contextAttachments.length,
      imageCount: imageAttachments.length,
    })
    setInput('')

    // ─── Slash command interception ───────────────────────────
    if (text.startsWith('/commit')) {
      const commitMsg = text.replace(/^\/commit\s*/, '').trim()
      if (!commitMsg) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: 'Usage: /commit <message>',
          timestamp: Date.now(),
        })
        return
      }
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      emit('agent-commit', { message: commitMsg })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'status',
        content: 'Committing...',
        timestamp: Date.now(),
      })
      return
    }
    if (text === '/changes') {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      emit('open-changes-panel')
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'status',
        content: 'Opening pre-commit review...',
        timestamp: Date.now(),
      })
      return
    }
    if (text === '/diff') {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      const changes = diffEngine.getChanges()
      if (changes.length > 0) {
        const summary = diffEngine.getSummary()
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: `${summary.fileCount} file(s) changed: +${summary.additions} -${summary.deletions}\nFiles: ${changes.map((c) => c.path).join(', ')}`,
          timestamp: Date.now(),
        })
      } else {
        const dirtyFiles = files.filter((f) => f.dirty)
        if (dirtyFiles.length > 0) {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'status',
            content: `${dirtyFiles.length} unsaved file(s): ${dirtyFiles.map((f) => f.path).join(', ')}`,
            timestamp: Date.now(),
          })
        } else {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'status',
            content: 'No changes detected.',
            timestamp: Date.now(),
          })
        }
      }
      return
    }
    if (text === '/unstage') {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: 'Unstage requires a local git repository.',
          timestamp: Date.now(),
        })
        return
      }
      const staged = local.gitInfo.status?.filter((s) => s.status !== '??').map((s) => s.path) ?? []
      if (staged.length === 0) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: 'No staged files to unstage.',
          timestamp: Date.now(),
        })
        return
      }
      try {
        await local.unstageFiles(staged)
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: `Unstaged ${staged.length} file(s).`,
          timestamp: Date.now(),
        })
      } catch (err) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: `Unstage failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        })
      }
      return
    }
    if (text === '/undo') {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: 'Undo commit requires a local git repository.',
          timestamp: Date.now(),
        })
        return
      }
      try {
        await local.undoLastCommit()
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: 'Undid last commit. Changes are back in the working tree.',
          timestamp: Date.now(),
        })
      } catch (err) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: `Undo failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        })
      }
      return
    }
    if (text === '/push') {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: text,
        timestamp: Date.now(),
      })
      if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: 'Push requires a local git repository.',
          timestamp: Date.now(),
        })
        return
      }
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'status',
        content: `Pushing ${local.gitInfo.branch} to origin...`,
        timestamp: Date.now(),
      })
      try {
        await local.push()
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: `Pushed ${local.gitInfo.branch} to origin.`,
          timestamp: Date.now(),
        })
      } catch (err) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: `Push failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        })
      }
      return
    }
    setSending(true)
    streamStateRef.current.isSending = true

    // Ensure session is initialized before first message
    logChatDebug('ensuring chat session initialization', { sessionKey })
    await ensureSessionInit()

    // Build visual label for attachments
    const attachLabels: string[] = []
    for (const att of contextAttachments) {
      attachLabels.push(
        att.type === 'selection'
          ? `📝 ${att.path.split('/').pop()}:${att.startLine}-${att.endLine}`
          : `📄 ${att.path.split('/').pop()}`,
      )
    }
    for (const img of imageAttachments) {
      attachLabels.push(`🖼 ${img.name}`)
    }
    const displayText = attachLabels.length > 0 ? `[${attachLabels.join(' · ')}]\n${text}` : text
    appendMessage({
      id: crypto.randomUUID(),
      role: 'user',
      type: 'text',
      content: displayText,
      timestamp: Date.now(),
    })

    if (!isConnected) {
      logChatDebug('send blocked: gateway disconnected', {
        gatewayStatus: status,
        sessionKey,
      })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'error',
        content: 'Gateway disconnected — cannot reach agent.',
        timestamp: Date.now(),
      })
      setSending(false)
      streamStateRef.current.isSending = false
      return
    }

    try {
      const context = buildContext()
      // Build attachment context
      let attachCtx = ''
      for (const att of contextAttachments) {
        if (att.type === 'file') {
          const ext = att.path.split('.').pop() ?? ''
          attachCtx +=
            `\n\n[Referenced file: ${att.path}]\n` +
            '```' +
            ext +
            '\n' +
            att.content.slice(0, 6000) +
            '\n```'
        } else if (att.type === 'selection') {
          const ext = att.path.split('.').pop() ?? ''
          attachCtx +=
            `\n\n[Selected code: ${att.path}:${att.startLine}-${att.endLine}]\n` +
            '```' +
            ext +
            '\n' +
            att.content +
            '\n```'
        }
      }
      for (const img of imageAttachments) {
        attachCtx += `\n\n[Attached screenshot: ${img.name}]`
      }
      const modePrefix =
        agentMode === 'ask'
          ? '[Mode: Ask — discuss and answer questions. Do not make code changes unless explicitly asked.]\n'
          : agentMode === 'plan'
            ? '[Mode: Plan — outline a step-by-step plan before making changes. Present the plan to the user for approval before executing.]\n'
            : '[Mode: Agent — make direct code changes and edits autonomously.]\n'
      const fullMessage = modePrefix + (context || '') + attachCtx + '\n\n' + text
      setContextAttachments([])
      setImageAttachments([])
      const idemKey = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      sentKeysRef.current.add(idemKey)

      setIsStreaming(true)
      logChatDebug('chat.send request', {
        sessionKey,
        idempotencyKey: idemKey,
        promptChars: fullMessage.length,
        contextChars: context.length,
        attachmentChars: attachCtx.length,
      })
      const resp = (await sendRequest('chat.send', {
        sessionKey,
        message: fullMessage,
        idempotencyKey: idemKey,
      })) as Record<string, unknown> | undefined

      const respStatus = resp?.status as string | undefined
      logChatDebug('chat.send response', {
        status: respStatus ?? 'unknown',
        hasReply: Boolean(resp?.reply || resp?.text || resp?.content),
        responseKeys: resp ? Object.keys(resp) : [],
      })
      if (respStatus === 'started' || respStatus === 'in_flight' || respStatus === 'streaming') {
        // Streaming — reply will arrive via onEvent('chat') handler
        logChatDebug('waiting for streamed reply', {
          idempotencyKey: idemKey,
          status: respStatus,
        })
        return
      }

      // Synchronous reply (non-streaming fallback)
      // Only process if the event handler hasn't already consumed this key
      if (!sentKeysRef.current.has(idemKey) || handledKeysRef.current.has(idemKey)) return
      sentKeysRef.current.delete(idemKey)
      handledKeysRef.current.add(idemKey)
      setTimeout(() => handledKeysRef.current.delete(idemKey), 10000)
      const reply = String(resp?.reply ?? resp?.text ?? resp?.content ?? '')
      if (!reply && respStatus) {
        // Gateway acknowledged but no inline reply — likely streaming
        logChatDebug('response acknowledged without inline reply', {
          idempotencyKey: idemKey,
          status: respStatus,
        })
        return
      }
      if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
        const editProposals = parseEditProposals(reply)
        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          type: editProposals.length > 0 ? 'edit' : 'text',
          content: reply,
          timestamp: Date.now(),
          editProposals: editProposals.length > 0 ? editProposals : undefined,
        })
        emit('agent-reply')
        logChatDebug('assistant reply appended from direct response', {
          idempotencyKey: idemKey,
          replyChars: reply.length,
          editProposalCount: editProposals.length,
        })
      }
      setIsStreaming(false)
      setSending(false)
      streamStateRef.current.isSending = false
    } catch (err) {
      logChatDebug('chat.send failed', {
        error: err instanceof Error ? err.message : String(err),
        sessionKey,
      })
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'error',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
      setIsStreaming(false)
      setSending(false)
      streamStateRef.current.isSending = false
    }
  }, [
    input,
    sending,
    agentMode,
    isConnected,
    status,
    sessionKey,
    contextAttachments,
    imageAttachments,
    local,
    files,
    sendRequest,
    buildContext,
    appendMessage,
    ensureSessionInit,
    logChatDebug,
  ])

  // ─── Handle ⌘K inline edit requests ────────────────────────────
  useEffect(() => {
    const handler = (detail: {
      filePath: string
      instruction: string
      selectedText: string
      startLine: number
      endLine: number
    }) => {
      const { filePath, instruction, selectedText, startLine, endLine } = detail
      if (!isConnected || sending) return
      logChatDebug('inline edit request', {
        filePath,
        startLine,
        endLine,
        instructionChars: instruction.length,
        connected: isConnected,
      })

      const prompt = [
        `[Inline Edit Request]`,
        `File: ${filePath}`,
        `Lines ${startLine}-${endLine}:`,
        '```',
        selectedText,
        '```',
        '',
        `Instruction: ${instruction}`,
        '',
        'Respond with [EDIT ' + filePath + '] containing the complete updated file.',
      ].join('\n')

      // Inject as user message and send
      setInput('')
      setSending(true)
      streamStateRef.current.isSending = true
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: `⌘K: ${instruction}`,
        timestamp: Date.now(),
      })

      const context = buildContext()
      const fullMessage = context ? `${context}\n\n${prompt}` : prompt
      const idemKey = `ce-inline-${Date.now()}`
      sentKeysRef.current.add(idemKey)
      setIsStreaming(true)
      logChatDebug('inline chat.send request', {
        sessionKey,
        idempotencyKey: idemKey,
        promptChars: fullMessage.length,
      })

      sendRequest('chat.send', {
        sessionKey,
        message: fullMessage,
        idempotencyKey: idemKey,
      })
        .then((resp) => {
          const r = resp as Record<string, unknown> | undefined
          const status = r?.status as string | undefined
          logChatDebug('inline chat.send response', {
            status: status ?? 'unknown',
            idempotencyKey: idemKey,
            hasReply: Boolean(r?.reply || r?.text),
          })
          if (status === 'started' || status === 'in_flight') return
          if (!sentKeysRef.current.has(idemKey) || handledKeysRef.current.has(idemKey)) return
          sentKeysRef.current.delete(idemKey)
          handledKeysRef.current.add(idemKey)
          setTimeout(() => handledKeysRef.current.delete(idemKey), 10000)
          const reply = String(r?.reply ?? r?.text ?? '')
          if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
            const editProposals = parseEditProposals(reply)
            appendMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: reply,
              timestamp: Date.now(),
              type: editProposals.length > 0 ? 'edit' : 'text',
              editProposals: editProposals.length > 0 ? editProposals : undefined,
            })
            emit('agent-reply')
          }
          setIsStreaming(false)
          setSending(false)
          streamStateRef.current.isSending = false
        })
        .catch((err: unknown) => {
          logChatDebug('inline chat.send failed', {
            idempotencyKey: idemKey,
            error: err instanceof Error ? err.message : String(err),
          })
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'error',
            content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: Date.now(),
          })
          setIsStreaming(false)
          setSending(false)
          streamStateRef.current.isSending = false
        })
    }
    return on('inline-edit-request', handler)
  }, [isConnected, sending, sendRequest, buildContext, appendMessage, sessionKey, logChatDebug])

  // ─── Diff review flow ─────────────────────────────────────────
  const handleShowDiff = useCallback(
    (proposal: EditProposal, messageId: string) => {
      const existing = getFile(proposal.filePath)
      setActiveDiff({ proposal, messageId, original: existing?.content ?? '' })
    },
    [getFile],
  )

  const handleQuickApply = useCallback(
    (proposal: EditProposal) => {
      const existing = getFile(proposal.filePath)
      if (existing) {
        updateFileContent(proposal.filePath, proposal.content)
      } else {
        openFile(proposal.filePath, proposal.content, undefined)
      }
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'tool',
        content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
        timestamp: Date.now(),
      })
    },
    [getFile, updateFileContent, openFile, appendMessage],
  )

  const handleApplyEdit = useCallback(() => {
    if (!activeDiff) return
    const { proposal } = activeDiff
    const existing = getFile(proposal.filePath)
    if (existing) {
      updateFileContent(proposal.filePath, proposal.content)
    } else {
      openFile(proposal.filePath, proposal.content, undefined)
    }
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'tool',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, getFile, updateFileContent, openFile, appendMessage])

  const handleRejectEdit = useCallback(() => {
    if (!activeDiff) return
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'status',
      content: `Rejected edit to \`${activeDiff.proposal.filePath}\`.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, appendMessage])

  // ─── Auto-apply when full access is enabled ──────────────────
  const autoAppliedRef = useRef(new Set<string>())
  useEffect(() => {
    if (permissions !== 'full') return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.editProposals?.length) return
    if (autoAppliedRef.current.has(last.id)) return
    autoAppliedRef.current.add(last.id)
    for (const proposal of last.editProposals) {
      const existing = getFile(proposal.filePath)
      if (existing) {
        updateFileContent(proposal.filePath, proposal.content)
      } else {
        openFile(proposal.filePath, proposal.content, undefined)
      }
    }
    const fileNames = last.editProposals.map((p) => `\`${p.filePath}\``).join(', ')
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'tool',
      content: `Auto-applied edits to ${fileNames} (full access mode).`,
      timestamp: Date.now(),
    })
  }, [messages, permissions, getFile, updateFileContent, openFile, appendMessage])

  // ─── Slash command suggestions ────────────────────────────────
  const suggestions = useMemo(() => {
    if (!input.startsWith('/')) return []
    const cmds = [
      { cmd: '/edit', desc: 'Edit current file', icon: 'lucide:pencil' },
      { cmd: '/explain', desc: 'Explain code', icon: 'lucide:book-open' },
      { cmd: '/refactor', desc: 'Refactor code', icon: 'lucide:refresh-cw' },
      { cmd: '/generate', desc: 'Generate new code', icon: 'lucide:plus' },
      { cmd: '/search', desc: 'Search across repo', icon: 'lucide:search' },
      { cmd: '/commit', desc: 'Commit changes', icon: 'lucide:git-commit-horizontal' },
      { cmd: '/diff', desc: 'Show changes', icon: 'lucide:git-compare' },
      { cmd: '/changes', desc: 'Pre-commit review', icon: 'lucide:eye' },
      { cmd: '/unstage', desc: 'Unstage all staged files', icon: 'lucide:minus-circle' },
      { cmd: '/undo', desc: 'Undo last commit', icon: 'lucide:undo-2' },
      { cmd: '/push', desc: 'Push to origin', icon: 'lucide:arrow-up-circle' },
      { cmd: '/pr', desc: 'View pull requests', icon: 'lucide:git-pull-request' },
      {
        cmd: '/pr create',
        desc: 'Create pull request',
        icon: 'lucide:git-pull-request-create-arrow',
      },
    ]
    const term = input.toLowerCase()
    return cmds.filter((c) => c.cmd.startsWith(term))
  }, [input])

  // ─── Keyboard ─────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveSuggestionIdx((i) => (i + 1) % suggestions.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveSuggestionIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
          return
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault()
          const idx = activeSuggestionIdx >= 0 ? activeSuggestionIdx : 0
          setInput(suggestions[idx].cmd + ' ')
          setActiveSuggestionIdx(-1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setActiveSuggestionIdx(-1)
          setInput('')
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [suggestions, activeSuggestionIdx, sendMessage],
  )

  // ─── Message actions ────────────────────────────────────────────
  const handleDeleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const handleRegenerate = useCallback(
    (msgId: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId)
        if (idx < 0) return prev
        let userIdx = idx - 1
        while (userIdx >= 0 && prev[userIdx].role !== 'user') userIdx--
        if (userIdx < 0) return prev
        const userMsg = prev[userIdx]
        queueMicrotask(() => {
          setInput(userMsg.content)
          setTimeout(() => sendMessage(), 50)
        })
        return prev.slice(0, idx)
      })
    },
    [sendMessage],
  )

  const handleEditAndResend = useCallback(
    (msgId: string) => {
      const idx = messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return
      const userMsg = messages[idx]
      setInput(userMsg.content)
      setMessages((prev) => prev.slice(0, idx))
      inputRef.current?.focus()
    },
    [messages],
  )

  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    // Clear everything — single session reset
    setMessages([])
    setStreamBuffer('')
    setSending(false)
    streamStateRef.current.isSending = false
    setIsStreaming(false)
    setThinkingTrail([])
    setInput('')
    setContextAttachments([])
    setImageAttachments([])
    setPlanSteps([])
    setActiveDiff(null)
    setConfirmClear(false)
    diffEngine.clear()
    sessionInitRef.current = false
    try {
      localStorage.removeItem('code-editor:chat:main')
    } catch {}
    try {
      sessionStorage.removeItem(
        `${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`,
      )
    } catch {}
  }, [confirmClear, sessionKey])

  // ─── Diff overlay ─────────────────────────────────────────────
  if (activeDiff) {
    return (
      <DiffViewer
        filePath={activeDiff.proposal.filePath}
        original={activeDiff.original}
        modified={activeDiff.proposal.content}
        onApply={handleApplyEdit}
        onReject={handleRejectEdit}
      />
    )
  }

  // ─── Render ───────────────────────────────────────────────────
  const chatTitle =
    messages
      .find((m) => m.role === 'user')
      ?.content.slice(0, 50)
      .replace(/\n/g, ' ') || null

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--sidebar-bg)]">
      {/* Header — children are no-drag so they stay clickable above drag region */}
      <ChatHeader title={chatTitle ?? undefined} messageCount={messages.length} />
      {messages.length > 0 && (
        <div className="flex items-center justify-end px-3 py-1 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
          <button
            onClick={handleClear}
            className={`p-1 rounded text-[10px] transition-colors cursor-pointer ${
              confirmClear
                ? 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={confirmClear ? 'Click again to clear' : 'Clear chat'}
          >
            <Icon
              icon={confirmClear ? 'lucide:alert-triangle' : 'lucide:eraser'}
              width={13}
              height={13}
            />
          </button>
        </div>
      )}

      {/* Empty states — full bleed */}
      {messages.length === 0 && !isConnected && (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <AgentConnectPrompt />
        </div>
      )}
      {messages.length === 0 && isConnected && (
        <ChatHome
          onSend={(text, mode) => {
            setAgentMode(mode)
            setInput(text)
            setTimeout(() => {
              sendMessage()
            }, 50)
          }}
          onSelectFolder={() => emit('open-folder')}
          onCloneRepo={() => emit('open-folder')}
        />
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <MessageList
          messages={messages}
          streamBuffer={streamBuffer}
          isStreaming={isStreaming}
          thinkingTrail={thinkingTrail}
          agentMode={agentMode}
          onShowDiff={handleShowDiff}
          onQuickApply={handleQuickApply}
          onDeleteMessage={handleDeleteMessage}
          onRegenerate={handleRegenerate}
          onEditAndResend={handleEditAndResend}
          onSendMessage={sendMessage}
        />
      )}

      {/* Input section — hidden when ChatHome is showing */}
      {(messages.length > 0 || !isConnected) && (
        <ChatInputBar
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          sending={sending}
          isStreaming={isStreaming}
          isConnected={isConnected}
          suggestions={suggestions}
          agentMode={agentMode}
          setAgentMode={setAgentMode}
          contextAttachments={contextAttachments}
          setContextAttachments={setContextAttachments}
          imageAttachments={imageAttachments}
          setImageAttachments={setImageAttachments}
          contextTokens={contextTokens}
          modelInfo={modelInfo}
          activeFile={activeFile}
          atMenuOpen={atMenuOpen}
          setAtMenuOpen={setAtMenuOpen}
          atResults={atResults}
          atMenuIdx={atMenuIdx}
          setAtMenuIdx={setAtMenuIdx}
          setAtQuery={setAtQuery}
          selectAtFile={selectAtFile}
          onSend={sendMessage}
          onKeyDown={handleKeyDown}
          onFileDrop={handleFileDrop}
          onImagePaste={handleImagePaste}
          onFileAttach={handleFileAttach}
        />
      )}
    </div>
  )
}
