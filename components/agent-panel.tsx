'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { ModeSelector } from '@/components/mode-selector'
import { ChatHome } from '@/components/chat-home'
import { ChatHeader } from '@/components/chat-header'
import type { AgentMode } from '@/components/mode-selector'
import { PermissionsToggle, usePermissions } from '@/components/permissions-toggle'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { MarkdownPreview } from '@/components/markdown-preview'
import { DiffViewer } from '@/components/diff-viewer'
import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
import { showInlineDiff, type InlineDiffResult } from '@/lib/inline-diff'
import { diffEngine } from '@/lib/streaming-diff'
import { PlanView } from '@/components/plan-view'
import type { PlanStep } from '@/components/plan-view'
import { navigateToLine } from '@/lib/line-links'
import {
  CODE_EDITOR_SESSION_KEY,
  SESSION_INIT_STORAGE_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  CODE_EDITOR_SYSTEM_PROMPT,
  buildEditorContext,
} from '@/lib/agent-session'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  editProposals?: EditProposal[]
}

function AgentConnectPrompt() {
  const { status, error, connect, gatewayUrl } = useGateway()
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isConnecting = status === 'connecting' || status === 'authenticating'

  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('code-flow:gateway-url')
      if (savedUrl && !url) setUrl(savedUrl)
    } catch {}
    if (gatewayUrl && !url) setUrl(gatewayUrl)
  }, [gatewayUrl])

  const handleConnect = () => {
    if (!url.trim()) return
    connect(url.trim(), password)
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4">
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,transparent)] to-[color-mix(in_srgb,var(--brand)_6%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)] flex items-center justify-center shadow-lg">
          <Icon icon="lucide:cpu" width={28} height={28} className="text-[var(--brand)]" />
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--sidebar-bg)] ${
          isConnecting ? 'bg-[var(--warning,#eab308)] animate-pulse' : 'bg-[var(--text-disabled)]'
        }`} />
      </div>

      <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1.5">Connect to Gateway</h3>
      <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed mb-5 max-w-[280px]">
        Your OpenClaw gateway powers the AI agent. Connect to enable completions, chat, and slash commands.
      </p>

      <div className="w-full max-w-[300px] space-y-2.5">
        <input
          type="text"
          value={url || 'ws://openclaw.local:18789'}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
          placeholder="ws://openclaw.local:18789"
          className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[13px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
          disabled={isConnecting}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
            placeholder="Password (optional)"
            className="w-full px-3 py-2.5 pr-9 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[13px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
            disabled={isConnecting}
          />
          <button
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
            tabIndex={-1}
          >
            <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} width={14} height={14} />
          </button>
        </div>
        <button
          onClick={handleConnect}
          disabled={!url.trim() || isConnecting}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--brand)',
            color: 'var(--brand-contrast, #fff)',
          }}
        >
          {isConnecting ? (
            <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />
          ) : (
            <Icon icon="lucide:plug" width={14} height={14} />
          )}
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
      </div>

      {status === 'error' && error && (
        <div className="flex items-start gap-2 mt-4 text-[12px] text-[var(--color-deletions)] max-w-[300px] text-left">
          <Icon icon="lucide:alert-circle" width={14} height={14} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <div className="mt-6 space-y-2 text-[12px] text-[var(--text-disabled)] max-w-[260px]">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:shield" width={13} height={13} />
          <span>Runs locally. Code never leaves your machine</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon icon="lucide:zap" width={13} height={13} />
          <span>Works with any LLM provider</span>
        </div>
      </div>
    </div>
  )
}

export function AgentPanel() {
  const { sendRequest, onEvent, status } = useGateway()
  const { files, activeFile, getFile, openFile, updateFileContent } = useEditor()
  const { repo, tree: repoTree } = useRepo()
  const local = useLocal()
  const permissions = usePermissions()

  const [chatId, setChatId] = useState(() => crypto.randomUUID())
  // Each chat gets its own gateway session for isolation
  const sessionKey = `${CODE_EDITOR_SESSION_KEY}:${chatId.slice(0, 8)}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('code-editor:chat:' + chatId)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [contextAttachments, setContextAttachments] = useState<Array<{ type: 'file' | 'selection'; path: string; content: string; startLine?: number; endLine?: number }>>([])
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atMenuIdx, setAtMenuIdx] = useState(0)
  const [imageAttachments, setImageAttachments] = useState<Array<{ name: string; dataUrl: string }>>([])
  const [modelInfo, setModelInfo] = useState<{ current: string; available: string[] }>({ current: '', available: [] })
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuPos, setModelMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const [agentMode, setAgentMode] = useState<AgentMode>('agent')
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([])
  const [contextTokens, setContextTokens] = useState(0)
  const inlineDiffRef = useRef<InlineDiffResult | null>(null)
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingTrail, setThinkingTrail] = useState<string[]>([])
  const [activeDiff, setActiveDiff] = useState<{
    proposal: EditProposal
    messageId: string
    original: string
  } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionInitRef = useRef(false)
  const sentKeysRef = useRef(new Set<string>())
  const handledKeysRef = useRef(new Set<string>())
  const [streamBuffer, setStreamBuffer] = useState('')

  // Build flat file list for @ mentions
  const allFilePaths = useMemo(() => {
    if (local.localMode && local.localTree.length > 0) {
      return local.localTree.filter(e => !e.is_dir).map(e => e.path)
    }
    return repoTree.filter(n => n.type === 'blob').map(n => n.path)
  }, [local.localMode, local.localTree, repoTree])

  const atResults = useMemo(() => {
    if (!atQuery) return allFilePaths.slice(0, 8)
    const q = atQuery.toLowerCase()
    return allFilePaths
      .filter(p => p.toLowerCase().includes(q))
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
        const status = (await sendRequest('sessions.status', { sessionKey })) as Record<string, unknown> | undefined
        const model = (status?.model as string) || (status?.defaultModel as string) || ''
        
        // Get available models/agents
        const agentsResp = (await sendRequest('agents.list', {})) as Record<string, unknown> | undefined
        const agents = (agentsResp?.agents as Array<Record<string, unknown>>) || []
        const models = agents.map(a => (a.model as string) || (a.id as string)).filter(Boolean).slice(0, 4)
        
        // Fallback: try config for default model
        if (!models.length) {
          const configResp = (await sendRequest('config.get', { key: 'defaultModel' })) as Record<string, unknown> | undefined
          const defaultModel = configResp?.value as string
          if (defaultModel) models.push(defaultModel)
        }
        
        setModelInfo({ current: model || 'unknown', available: models.length ? models : [model || 'claude-sonnet-4-5'] })
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
        label: `Knot Code — ${chatId.slice(0, 8)}`,
      }).catch(() => {})
    } catch {
      // Non-fatal — session still works without explicit system prompt
    }
  }, [sendRequest, sessionKey, chatId])

  // ─── Listen for chat events (streaming replies) ───────────────
  useEffect(() => {
    const unsub = onEvent('chat', (payload: unknown) => {
      const p = payload as Record<string, unknown>
      const state = p.state as string | undefined
      const idempotencyKey = p.idempotencyKey as string | undefined
      const eventSessionKey = p.sessionKey as string | undefined

      // Ignore inline-completion traffic (separate session)
      if (idempotencyKey?.startsWith('completion-')) return

      // Match by idempotency key or session key fallback
      const matchesIdem = !!(idempotencyKey && sentKeysRef.current.has(idempotencyKey))
      const matchesSession = !idempotencyKey && eventSessionKey === sessionKey
      if (typeof window !== 'undefined' && state) {
        console.debug('[knot-code] chat event:', { state, idempotencyKey, eventSessionKey, matchesIdem, matchesSession, sentKeys: [...sentKeysRef.current] })
      }
      if (!matchesIdem && !matchesSession) return

      // Track tool_use events for thinking trail
      if (state === 'tool_use' || state === 'tool_start') {
        const toolName = p.toolName as string || p.name as string || ''
        const toolInput = p.input as Record<string, unknown> | undefined
        if (toolName) {
          let step = toolName
          if (toolName === 'read' || toolName === 'Read') {
            const path = (toolInput?.path || toolInput?.file_path || '') as string
            step = `Reading ${path.split('/').pop() || path}`
          } else if (toolName.includes('search') || toolName === 'Grep') {
            step = `Searching ${(toolInput?.query as string)?.slice(0, 30) || 'files'}`
          } else if (toolName === 'write' || toolName === 'Write' || toolName === 'edit' || toolName === 'Edit') {
            const path = (toolInput?.path || toolInput?.file_path || '') as string
            step = `Editing ${path.split('/').pop() || path}`
          } else if (toolName.includes('exec') || toolName === 'Bash') {
            step = 'Running command'
          }
          setThinkingTrail(prev => [...prev.slice(-5), step])
          setIsStreaming(true)
        }
        return
      }

      if (state === 'delta') {
        const message = p.message as Record<string, unknown> | undefined
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          let text = ''
          if (typeof content === 'string') text = content
          else if (Array.isArray(content)) {
            text = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
          if (text) {
            setStreamBuffer(text)
            setIsStreaming(true)
            // Extract thinking trail from streamed content
            const trailPatterns = [
              { re: /Reading\s+`([^`]+)`/g, fmt: (m: RegExpExecArray) => `Reading ${m[1].split('/').pop()}` },
              { re: /searching\s+(?:for\s+)?["']([^"']+)["']/gi, fmt: (m: RegExpExecArray) => `Searching "${m[1]}"` },
              { re: /(?:Exploring|Looking at|Checking)\s+`?([^`\n]+)`?/gi, fmt: (m: RegExpExecArray) => `Exploring ${m[1].split('/').pop()}` },
              { re: /(?:Creating|Writing|Editing)\s+`([^`]+)`/g, fmt: (m: RegExpExecArray) => `Editing ${m[1].split('/').pop()}` },
            ]
            for (const { re, fmt } of trailPatterns) {
              let match
              while ((match = re.exec(text)) !== null) {
                const step = fmt(match)
                setThinkingTrail(prev => prev.includes(step) ? prev : [...prev.slice(-4), step])
              }
            }
          }
        }
      } else if (state === 'final') {
        setThinkingTrail([])
        const message = p.message as Record<string, unknown> | undefined
        let finalText = ''
        if (message) {
          const content = message.content as string | Array<Record<string, unknown>> | undefined
          if (typeof content === 'string') finalText = content
          else if (Array.isArray(content)) {
            finalText = content
              .filter((b) => b.type === 'text' || b.type === 'output_text')
              .map((b) => (b.text as string) || '')
              .join('')
          }
        }
        if (idempotencyKey) {
          sentKeysRef.current.delete(idempotencyKey)
          if (handledKeysRef.current.has(idempotencyKey)) return // already handled — prevent duplicate
          handledKeysRef.current.add(idempotencyKey)
          // Clean up after 10s
          setTimeout(() => handledKeysRef.current.delete(idempotencyKey), 10000)
        }
        setStreamBuffer(prev => {
          const text = finalText || prev || ''
          if (text && !/^NO_REPLY$/i.test(text.trim())) {
            const editProposals = parseEditProposals(text)
            // Feed edit proposals to streaming diff engine
            if (editProposals.length > 0) {
              for (const proposal of editProposals) {
                const existing = getFile(proposal.filePath)
                diffEngine.registerOriginal(proposal.filePath, existing?.content ?? '')
                diffEngine.updateProposed(proposal.filePath, proposal.content)
                diffEngine.finalize(proposal.filePath)
              }
              diffEngine.finalizeAll()
              // Also show inline diff in editor for the first file
              window.dispatchEvent(new CustomEvent('show-inline-diff', {
                detail: { proposals: editProposals }
              }))
            }
            setMessages(msgs => [...msgs, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: text,
              timestamp: Date.now(),
              editProposals: editProposals.length > 0 ? editProposals : undefined,
            }])
          }
          return ''
        })
        setIsStreaming(false)
        setSending(false)
      } else if (state === 'error') {
        setThinkingTrail([])
        const errorMsg = (p.errorMessage as string) || 'Unknown error'
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer('')
        setMessages(msgs => [...msgs, {
          id: crypto.randomUUID(),
          role: 'system' as const,
          content: 'Error: ' + errorMsg,
          timestamp: Date.now(),
        }])
        setIsStreaming(false)
        setSending(false)
      } else if (state === 'aborted') {
        setThinkingTrail([])
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer(prev => {
          if (prev) {
            setMessages(msgs => [...msgs, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: prev + ' [cancelled]',
              timestamp: Date.now(),
            }])
          }
          return ''
        })
        setIsStreaming(false)
        setSending(false)
      }
    })
    return unsub
  }, [onEvent])

  // ─── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamBuffer])

  // ─── @ mention file selection ──────────────────────────────
  const selectAtFile = useCallback(async (filePath: string) => {
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
      setContextAttachments(prev => {
        if (prev.some(a => a.path === filePath && a.type === 'file')) return prev
        return [...prev, { type: 'file', path: filePath, content: existing.content }]
      })
    } else {
      // Try to read from open files or fetch
      setContextAttachments(prev => {
        if (prev.some(a => a.path === filePath && a.type === 'file')) return prev
        return [...prev, { type: 'file', path: filePath, content: `[File: ${filePath} — content will be fetched on send]` }]
      })
    }
    setAtMenuOpen(false)
    setAtQuery('')
    inputRef.current?.focus()
  }, [input, getFile])

  // ─── ⌘L: Send selection to agent panel ────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        path: string
        content: string
        startLine: number
        endLine: number
      }
      if (!detail) return
      setContextAttachments(prev => [
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
    }
    window.addEventListener('add-to-chat', handler)
    return () => window.removeEventListener('add-to-chat', handler)
  }, [])

  // ─── Image handling (drag & drop, paste, file picker) ────
  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    for (const file of files.slice(0, 3)) {
      const reader = new FileReader()
      reader.onload = () => {
        setImageAttachments(prev => [...prev, { name: file.name, dataUrl: reader.result as string }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
    if (items.length === 0) return
    e.preventDefault()
    for (const item of items.slice(0, 3)) {
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        setImageAttachments(prev => [...prev, { name: `screenshot-${Date.now()}.png`, dataUrl: reader.result as string }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleImageSelect = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || []).slice(0, 3)
      for (const file of files) {
        const reader = new FileReader()
        reader.onload = () => {
          setImageAttachments(prev => [...prev, { name: file.name, dataUrl: reader.result as string }])
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }, [])

  // ─── Estimate context token usage ──────────────────────────
  useEffect(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    const fileTokens = file ? Math.ceil(Math.min(file.content.length, 8000) / 4) : 0
    const attachTokens = contextAttachments.reduce((sum, a) => sum + Math.ceil(Math.min(a.content.length, 6000) / 4), 0)
    const imageTokens = imageAttachments.length * 1000 // ~1k tokens per image estimate
    setContextTokens(fileTokens + attachTokens + imageTokens)
  }, [activeFile, getFile, contextAttachments, imageAttachments])

  // ─── Listen for set-agent-input events ─────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text as string
      if (text) setInput(text)
      inputRef.current?.focus()
    }
    window.addEventListener('set-agent-input', handler)
    return () => window.removeEventListener('set-agent-input', handler)
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
      openFiles: files.map(f => ({ path: f.path, dirty: f.dirty })),
      runtime: 'local',
      permissions,
    })
  }, [repo, activeFile, files, getFile, permissions])


  // ─── Message helpers ──────────────────────────────────────────
  // Parse plan steps from agent text
  const parsePlanSteps = useCallback((text: string): PlanStep[] => {
    const steps: PlanStep[] = []
    // Match numbered lists: 1. **Title** — description
    const matches = text.matchAll(/^(\d+)\.\s+\*{0,2}([^*]+?)\*{0,2}\s*$/gm)
    for (const m of matches) {
      steps.push({
        id: `step-${m[1]}`,
        title: m[2].trim(),
        description: undefined,
        status: 'pending',
      })
    }
    return steps
  }, [])

  // Emit session update to workspace sidebar
  const emitSessionUpdate = useCallback((msg: ChatMessage) => {
    const summary = diffEngine.getSummary()
    window.dispatchEvent(new CustomEvent('chat-session-update', {
      detail: {
        id: 'current',
        title: msg.content.slice(0, 40).replace(/\n/g, ' ') || 'New Chat',
        preview: msg.content.slice(0, 80),
        timestamp: Date.now(),
        fileCount: summary.fileCount || undefined,
        additions: summary.additions || undefined,
        deletions: summary.deletions || undefined,
        mode: agentMode,
      }
    }))
  }, [agentMode])

  // Persist messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try { localStorage.setItem('code-editor:chat:' + chatId, JSON.stringify(messages.slice(-50))) } catch {}
    }
  }, [messages, chatId])

  // Listen for chat switch from workspace sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const newId = (e as CustomEvent).detail?.id
      if (newId && newId !== chatId) {
        // Save current messages
        try { localStorage.setItem('code-editor:chat:' + chatId, JSON.stringify(messages.slice(-50))) } catch {}
        // Load new chat
        setChatId(newId)
        try {
          const saved = localStorage.getItem('code-editor:chat:' + newId)
          setMessages(saved ? JSON.parse(saved) : [])
        } catch { setMessages([]) }
        setStreamBuffer('')
        // Reset init flag so system prompt gets injected for new session
        sessionInitRef.current = false
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(`${SESSION_INIT_STORAGE_KEY}:${CODE_EDITOR_SESSION_KEY}:${newId.slice(0, 8)}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`)
        }
      }
    }
    window.addEventListener('switch-chat', handler)
    return () => window.removeEventListener('switch-chat', handler)
  }, [chatId, messages])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const next = [...prev, msg]
      if (msg.role === 'user' && next.filter(m => m.role === 'user').length === 1) {
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('chat-session-update', {
            detail: { id: chatId, title: msg.content.slice(0, 40), preview: msg.content.slice(0, 80), timestamp: Date.now() }
          }))
        })
      }
      return next
    })
  }, [chatId])

  // ─── Commit result listener ──────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { success: boolean; fileCount?: number; error?: string }
      if (detail.success) {
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: `Committed ${detail.fileCount} file(s) successfully.`, timestamp: Date.now() })
      } else {
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: `Commit failed: ${detail.error}`, timestamp: Date.now() })
      }
    }
    window.addEventListener('agent-commit-result', handler)
    return () => window.removeEventListener('agent-commit-result', handler)
  }, [appendMessage])

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')

    // ─── Slash command interception ───────────────────────────
    if (text.startsWith('/commit')) {
      const commitMsg = text.replace(/^\/commit\s*/, '').trim()
      if (!commitMsg) {
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: 'Usage: /commit <message>', timestamp: Date.now() })
        return
      }
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })
      // Dispatch commit event — page.tsx handles the actual commit
      window.dispatchEvent(new CustomEvent('agent-commit', { detail: { message: commitMsg } }))
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: 'Committing...', timestamp: Date.now() })
      return
    }
    if (text === '/changes') {
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })
      window.dispatchEvent(new CustomEvent('open-changes-panel'))
      appendMessage({ id: crypto.randomUUID(), role: 'system', content: 'Opening pre-commit review...', timestamp: Date.now() })
      return
    }
    if (text === '/diff') {
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })
      const changes = diffEngine.getChanges()
      if (changes.length > 0) {
        const summary = diffEngine.getSummary()
        appendMessage({ id: crypto.randomUUID(), role: 'system', content: `${summary.fileCount} file(s) changed: +${summary.additions} -${summary.deletions}\nFiles: ${changes.map(c => c.path).join(', ')}`, timestamp: Date.now() })
      } else {
        const dirtyFiles = files.filter(f => f.dirty)
        if (dirtyFiles.length > 0) {
          appendMessage({ id: crypto.randomUUID(), role: 'system', content: `${dirtyFiles.length} unsaved file(s): ${dirtyFiles.map(f => f.path).join(', ')}`, timestamp: Date.now() })
        } else {
          appendMessage({ id: crypto.randomUUID(), role: 'system', content: 'No changes detected.', timestamp: Date.now() })
        }
      }
      return
    }

    setSending(true)

    // Ensure session is initialized before first message
    await ensureSessionInit()

    // Build visual label for attachments
    const attachLabels: string[] = []
    for (const att of contextAttachments) {
      attachLabels.push(att.type === 'selection' ? `📝 ${att.path.split('/').pop()}:${att.startLine}-${att.endLine}` : `📄 ${att.path.split('/').pop()}`)
    }
    for (const img of imageAttachments) {
      attachLabels.push(`🖼 ${img.name}`)
    }
    const displayText = attachLabels.length > 0 ? `[${attachLabels.join(' · ')}]\n${text}` : text
    appendMessage({ id: crypto.randomUUID(), role: 'user', content: displayText, timestamp: Date.now() })

    if (!isConnected) {
      appendMessage({
        id: crypto.randomUUID(), role: 'system',
        content: 'Gateway disconnected — cannot reach agent.',
        timestamp: Date.now(),
      })
      setSending(false)
      return
    }

    try {
      const context = buildContext()
      // Build attachment context
      let attachCtx = ''
      for (const att of contextAttachments) {
        if (att.type === 'file') {
          const ext = att.path.split('.').pop() ?? ''
          attachCtx += `\n\n[Referenced file: ${att.path}]\n` + '```' + ext + '\n' + att.content.slice(0, 6000) + '\n```'
        } else if (att.type === 'selection') {
          const ext = att.path.split('.').pop() ?? ''
          attachCtx += `\n\n[Selected code: ${att.path}:${att.startLine}-${att.endLine}]\n` + '```' + ext + '\n' + att.content + '\n```'
        }
      }
      for (const img of imageAttachments) {
        attachCtx += `\n\n[Attached screenshot: ${img.name}]`
      }
      const modePrefix = agentMode === 'plan' ? '[Mode: Plan — discuss and plan, do not write code yet]\n' : agentMode === 'code' ? '[Mode: Code — make direct changes]\n' : ''
      const fullMessage = modePrefix + (context || '') + attachCtx + '\n\n' + text
      setContextAttachments([])
      setImageAttachments([])
      const idemKey = `ce-${Date.now()}`
      sentKeysRef.current.add(idemKey)

      setIsStreaming(true)
      const resp = (await sendRequest('chat.send', {
        sessionKey,
        message: fullMessage,
        idempotencyKey: idemKey,
      })) as Record<string, unknown> | undefined

      if (typeof window !== 'undefined') console.debug('[knot-code] chat.send response:', resp)
      const respStatus = resp?.status as string | undefined
      if (respStatus === 'started' || respStatus === 'in_flight' || respStatus === 'streaming') {
        // Streaming — reply will arrive via onEvent('chat') handler
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
        return
      }
      if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
        const editProposals = parseEditProposals(reply)
        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
          editProposals: editProposals.length > 0 ? editProposals : undefined,
        })
      }
      setIsStreaming(false)
      setSending(false)
    } catch (err) {
      appendMessage({
        id: crypto.randomUUID(), role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
      setIsStreaming(false)
      setSending(false)
    }
  }, [input, sending, isConnected, sendRequest, buildContext, appendMessage, ensureSessionInit])

  // ─── Handle ⌘K inline edit requests ────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { filePath, instruction, selectedText, startLine, endLine } = (e as CustomEvent).detail
      if (!isConnected || sending) return

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
      appendMessage({ id: crypto.randomUUID(), role: 'user', content: `⌘K: ${instruction}`, timestamp: Date.now() })

      const context = buildContext()
      const fullMessage = context ? `${context}\n\n${prompt}` : prompt
      const idemKey = `ce-inline-${Date.now()}`
      sentKeysRef.current.add(idemKey)
      setIsStreaming(true)

      sendRequest('chat.send', {
        sessionKey,
        message: fullMessage,
        idempotencyKey: idemKey,
      }).then((resp) => {
        const r = resp as Record<string, unknown> | undefined
        const status = r?.status as string | undefined
        if (status === 'started' || status === 'in_flight') return
        if (!sentKeysRef.current.has(idemKey)) return
        sentKeysRef.current.delete(idemKey)
        const reply = String(r?.reply ?? r?.text ?? '')
        if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
          const editProposals = parseEditProposals(reply)
          appendMessage({
            id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: Date.now(),
            editProposals: editProposals.length > 0 ? editProposals : undefined,
          })
        }
        setIsStreaming(false)
        setSending(false)
      }).catch((err: unknown) => {
        appendMessage({
          id: crypto.randomUUID(), role: 'system',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        })
        setIsStreaming(false)
        setSending(false)
      })
    }
    window.addEventListener('inline-edit-request', handler)
    return () => window.removeEventListener('inline-edit-request', handler)
  }, [isConnected, sending, sendRequest, buildContext, appendMessage])



    // ─── Diff review flow ─────────────────────────────────────────
  const handleShowDiff = useCallback((proposal: EditProposal, messageId: string) => {
    const existing = getFile(proposal.filePath)
    setActiveDiff({ proposal, messageId, original: existing?.content ?? '' })
  }, [getFile])

  const handleQuickApply = useCallback((proposal: EditProposal) => {
    const existing = getFile(proposal.filePath)
    if (existing) {
      updateFileContent(proposal.filePath, proposal.content)
    } else {
      openFile(proposal.filePath, proposal.content, undefined)
    }
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
  }, [getFile, updateFileContent, openFile, appendMessage])

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
      id: crypto.randomUUID(), role: 'system',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, getFile, updateFileContent, openFile, appendMessage])

  const handleRejectEdit = useCallback(() => {
    if (!activeDiff) return
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
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
    const fileNames = last.editProposals.map(p => `\`${p.filePath}\``).join(', ')
    appendMessage({
      id: crypto.randomUUID(), role: 'system',
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
    ]
    const term = input.toLowerCase()
    return cmds.filter(c => c.cmd.startsWith(term))
  }, [input])

  // ─── Keyboard ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestionIdx(i => (i + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestionIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1))
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
  }, [suggestions, activeSuggestionIdx, sendMessage])

  // ─── Clear chat ───────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false)
  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setMessages([])
    setConfirmClear(false)
  }, [confirmClear])

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
  const chatTitle = messages.find(m => m.role === 'user')?.content.slice(0, 50).replace(/\n/g, ' ') || null

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
            <Icon icon={confirmClear ? 'lucide:alert-triangle' : 'lucide:eraser'} width={13} height={13} />
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
              // Emit session to sidebar immediately
              window.dispatchEvent(new CustomEvent('chat-session-update', {
                detail: {
                  id: chatId,
                  title: text.slice(0, 40),
                  preview: text.slice(0, 80),
                  timestamp: Date.now(),
                  mode,
                }
              }))
              setTimeout(() => { sendMessage() }, 50)
            }}
            onSelectFolder={() => window.dispatchEvent(new CustomEvent('open-folder'))}
            onCloneRepo={() => window.dispatchEvent(new CustomEvent('open-folder'))}
          />
      )}

      {/* Messages */}
      {messages.length > 0 && (
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 scroll-shadow"
        onScroll={e => {
          const el = e.currentTarget
          el.classList.toggle('has-scroll-top', el.scrollTop > 8)
          el.classList.toggle('has-scroll-bottom', el.scrollTop + el.clientHeight < el.scrollHeight - 8)
        }}
      >
        {messages.map(msg => (
          <div key={msg.id} className={`group/msg flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up`} style={{ animationDuration: '0.2s' }}>
            <div className={`max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--text-primary)] rounded-br-sm'
                : msg.role === 'system'
                  ? 'px-2.5 py-1.5 text-[10px] border-l-2 border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] text-[var(--text-secondary)]'
                  : 'bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-bl-sm'
            }`}>
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div
                  className="prose-chat"
                  onClick={(e) => {
                    // Click-to-navigate: detect line references in clicked text
                    const target = e.target as HTMLElement
                    const text = target.textContent ?? ''
                    // Match "line N", "lines N-M", "LN", path:N patterns
                    const lineMatch = text.match(/(?:lines?\s+|L)(\d+)(?:\s*[-–]\s*L?(\d+))?/i)
                      || text.match(/([\w./\-]+\.\w+)[:#]L?(\d+)/)
                    if (lineMatch) {
                      const start = parseInt(lineMatch[1] ?? '', 10)
                      const end = lineMatch[2] ? parseInt(lineMatch[2], 10) : undefined
                      if (!isNaN(start)) {
                        e.preventDefault()
                        navigateToLine(start, end)
                      }
                    }
                  }}
                >
                  <MarkdownPreview content={msg.content} />
                  {/* Render plan view if message contains numbered steps */}
                  {msg.role === 'assistant' && parsePlanSteps(msg.content).length >= 3 && (
                    <PlanView
                      steps={parsePlanSteps(msg.content)}
                      interactive={agentMode === 'plan'}
                      onApprove={() => {
                        setInput('Continue with the plan')
                        sendMessage()
                      }}
                      onSkip={() => {
                        setInput('Skip to coding')
                        sendMessage()
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Timestamp — shows on hover */}
            <span className="text-[8px] text-[var(--text-disabled)] mt-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity font-mono">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            {/* Edit proposal buttons */}
            {msg.editProposals && msg.editProposals.length > 0 && (
              <div className="flex flex-col gap-1 mt-1.5">
                {msg.editProposals.map((proposal, i) => (
                  <div key={i} className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => handleQuickApply(proposal)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors cursor-pointer"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--color-additions) 40%, transparent)',
                        backgroundColor: 'color-mix(in srgb, var(--color-additions) 12%, transparent)',
                        color: 'var(--color-additions)',
                      }}
                      title="Apply changes to editor"
                    >
                      <Icon icon="lucide:play" width={12} height={12} />
                      Apply to {proposal.filePath.split('/').pop()}
                    </button>
                    <button
                      onClick={() => handleShowDiff(proposal, msg.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      title="Review changes in diff viewer first"
                    >
                      <Icon icon="lucide:git-compare" width={12} height={12} />
                      Diff
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="flex flex-col items-start animate-fade-in" style={{ animationDuration: '0.15s' }}>
            {streamBuffer ? (
              <div className="max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-[12px] leading-relaxed bg-[var(--bg-subtle)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] text-[var(--text-primary)] rounded-bl-sm">
                <div className="prose-chat">
                  <MarkdownPreview content={streamBuffer} />
                </div>
                <span className="inline-block w-1.5 h-3.5 bg-[var(--brand)] animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] rounded-bl-sm max-w-[90%]">
                {/* Thinking trail — timeline style */}
                {thinkingTrail.length > 0 && (
                  <div className="relative flex flex-col gap-0 mb-1.5 ml-1">
                    {/* Continuous timeline line */}
                    <div className="absolute left-[4px] top-1 bottom-1 w-px bg-[color-mix(in_srgb,var(--brand)_20%,transparent)]" />
                    {thinkingTrail.map((step, i) => {
                      const isLast = i === thinkingTrail.length - 1
                      const age = thinkingTrail.length - 1 - i
                      const icon = step.startsWith('Reading') ? 'lucide:file-text' :
                        step.startsWith('Searching') ? 'lucide:search' :
                        step.startsWith('Exploring') ? 'lucide:folder-open' :
                        step.startsWith('Editing') || step.startsWith('Writing') ? 'lucide:pencil' :
                        step.startsWith('Running') || step.startsWith('Executing') ? 'lucide:terminal' :
                        step.startsWith('Creating') ? 'lucide:plus' :
                        step.startsWith('Analyzing') ? 'lucide:scan' :
                        'lucide:sparkles'
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[10px] py-0.5 plan-step-enter"
                          style={{
                            opacity: isLast ? 1 : Math.max(0.3, 1 - age * 0.2),
                            transform: isLast ? 'scale(1)' : `scale(${Math.max(0.96, 1 - age * 0.01)})`,
                            filter: age > 2 ? `blur(${Math.min(0.4, (age - 2) * 0.2)}px)` : 'none',
                            transition: 'all 0.3s ease',
                          }}
                        >
                          {/* Timeline dot */}
                          <div className="relative z-[1] shrink-0">
                            {isLast ? (
                              <span className="relative flex h-[9px] w-[9px]">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-50" />
                                <span className="relative inline-flex rounded-full h-[9px] w-[9px] bg-[var(--brand)]" />
                              </span>
                            ) : (
                              <span className="block w-[9px] h-[9px] rounded-full border-2 border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[var(--bg-subtle)]" />
                            )}
                          </div>
                          <Icon icon={icon} width={10} height={10} className={`shrink-0 ${isLast ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`} />
                          <span className={`truncate flex-1 ${isLast ? 'text-[var(--text-secondary)] font-medium' : 'text-[var(--text-disabled)]'}`}>{step}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {thinkingTrail.length > 0 ? thinkingTrail[thinkingTrail.length - 1] : 'Thinking...'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Input section — hidden when ChatHome is showing */}
      {(messages.length > 0 || !isConnected) && <>
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-3 pb-1 shrink-0">
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s, i) => (
              <button
                key={s.cmd}
                onClick={() => { setInput(s.cmd + ' '); setActiveSuggestionIdx(-1) }}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  i === activeSuggestionIdx
                    ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]'
                }`}
              >
                <Icon icon={s.icon} width={10} height={10} className="text-[var(--brand)]" />
                <span className="font-mono text-[var(--brand)]">{s.cmd}</span>
                <span className="text-[var(--text-tertiary)]">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="relative group/input">
          {/* @ mention dropdown */}
          {atMenuOpen && atResults.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-[200px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl z-50">
              {atResults.map((path, i) => {
                const name = path.split('/').pop() || path
                const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
                return (
                  <button
                    key={path}
                    onMouseDown={(e) => { e.preventDefault(); selectAtFile(path) }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                      i === atMenuIdx
                        ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <Icon icon="lucide:file-text" width={12} height={12} className="text-[var(--text-tertiary)] shrink-0" />
                    <span className="font-mono truncate">{name}</span>
                    {dir && <span className="text-[9px] text-[var(--text-disabled)] truncate ml-auto">{dir}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Image + context attachment chips */}
          {(contextAttachments.length > 0 || imageAttachments.length > 0) && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {imageAttachments.map((img, i) => (
                <div
                  key={`img-${i}`}
                  className="relative group/chip rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden"
                  style={{ width: 72, height: 52 }}
                >
                  <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-2">
                    <span className="text-[7px] text-white/90 font-mono truncate block">{img.name.split('.')[0]}</span>
                  </div>
                  <button
                    onClick={() => setImageAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/50 text-white/80 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={7} height={7} />
                  </button>
                </div>
              ))}
              {contextAttachments.map((att, i) => (
                <div
                  key={i}
                  className="relative group/chip flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] overflow-hidden"
                  style={{ width: att.type === 'selection' ? 180 : 140, maxHeight: 56 }}
                >
                  {/* File/selection header */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
                    <Icon
                      icon={att.type === 'selection' ? 'lucide:text-cursor-input' : 'lucide:file-text'}
                      width={8} height={8} className="text-[var(--text-tertiary)] shrink-0"
                    />
                    <span className="text-[8px] font-mono text-[var(--text-secondary)] truncate">
                      {att.type === 'selection'
                        ? `${att.path.split('/').pop()}:${att.startLine}-${att.endLine}`
                        : att.path.split('/').pop()
                      }
                    </span>
                  </div>
                  {/* Content preview */}
                  <div className="px-1.5 py-0.5 overflow-hidden flex-1">
                    <pre className="text-[7px] leading-[1.3] font-mono text-[var(--text-disabled)] whitespace-pre overflow-hidden" style={{ maxHeight: 28 }}>
                      {att.content.slice(0, 120)}
                    </pre>
                  </div>
                  <button
                    onClick={() => setContextAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={7} height={7} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              const val = e.target.value
              setInput(val)
              setActiveSuggestionIdx(-1)
              // Detect @ trigger
              const cursor = e.target.selectionStart ?? val.length
              const before = val.slice(0, cursor)
              const atMatch = before.match(/@([\w./\-]*)$/)
              if (atMatch) {
                setAtMenuOpen(true)
                setAtQuery(atMatch[1])
                setAtMenuIdx(0)
              } else {
                setAtMenuOpen(false)
                setAtQuery('')
              }
            }}
            onKeyDown={(e) => {
              // @ menu navigation
              if (atMenuOpen) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAtMenuIdx(i => Math.min(i + 1, atResults.length - 1)); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setAtMenuIdx(i => Math.max(i - 1, 0)); return }
                if (e.key === 'Tab' || e.key === 'Enter') {
                  if (atResults.length > 0) {
                    e.preventDefault()
                    selectAtFile(atResults[atMenuIdx])
                    return
                  }
                }
                if (e.key === 'Escape') { e.preventDefault(); setAtMenuOpen(false); return }
              }
              handleKeyDown(e)
            }}
            onDrop={handleImageDrop}
            onDragOver={e => e.preventDefault()}
            onPaste={handleImagePaste}
            placeholder={activeFile ? `Ask about ${activeFile.split('/').pop()}...` : 'Ask or type /command...'}
            rows={1}
            className="w-full resize-none rounded-lg bg-[var(--bg)] border border-[var(--border)] pl-3 pr-20 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-colors"
          />
          {/* Action buttons — inside input, right side */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button
              onClick={handleImageSelect}
              className="p-1.5 rounded-md text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
              title="Attach image"
            >
              <Icon icon="lucide:image-plus" width={14} height={14} />
            </button>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                input.trim() && !sending
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90'
                  : 'text-[var(--text-disabled)] cursor-not-allowed'
              }`}
              title="Send (Enter)"
            >
              <Icon icon={isStreaming ? 'lucide:square' : 'lucide:arrow-up'} width={14} height={14} />
            </button>
          </div>
        </div>
        {/* Bottom bar — runtime + permissions + mode selector + model + context tokens */}
        <div className="flex flex-col gap-1 mt-1.5">
          {/* Row 1: Mode selector centered */}
          <div className="flex items-center justify-center">
            <ModeSelector mode={agentMode} onChange={setAgentMode} />
          </div>
          {/* Row 2: Runtime, permissions, model, context */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <PermissionsToggle />
            </div>
            <div className="flex items-center gap-2">
              {modelInfo.current && (
                <div className="relative">
                  <button
                    ref={modelBtnRef}
                    onClick={() => {
                      setModelMenuOpen(v => {
                        if (!v && modelBtnRef.current) {
                          const rect = modelBtnRef.current.getBoundingClientRect()
                          setModelMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 })
                        }
                        return !v
                      })
                    }}
                    className="flex items-center gap-1 text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:sparkles" width={11} height={11} />
                    {modelInfo.current.replace(/^.*\//, '').replace(/(claude-|gpt-)/, '').slice(0, 12)}
                    <Icon icon="lucide:chevron-down" width={9} height={9} />
                  </button>
                  {modelMenuOpen && modelMenuPos && (
                    <>
                      <div className="fixed inset-0 z-[9990]" onClick={() => setModelMenuOpen(false)} />
                      <div
                        className="fixed z-[9991] w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl py-1"
                        style={{ left: modelMenuPos.left, bottom: modelMenuPos.bottom }}
                      >
                        {modelInfo.available.slice(0, 4).map(m => (
                          <button
                            key={m}
                            onClick={() => { setModelMenuOpen(false) }}
                            className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] transition-colors cursor-pointer ${
                              m === modelInfo.current ? 'text-[var(--brand)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {m === modelInfo.current && <Icon icon="lucide:check" width={12} height={12} />}
                              <span className="font-mono">{m.replace(/^.*\//, '')}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {contextTokens > 0 && (
                <span className="text-[10px] text-[var(--text-disabled)] tabular-nums">
                  ~{(contextTokens / 1000).toFixed(1)}k ctx
                </span>
              )}
              <span className="text-[10px] text-[var(--text-disabled)]">
                <kbd className="px-1 py-px rounded border border-[var(--border)] text-[9px] font-mono">@</kbd>
                <span className="mx-1">·</span>
                <kbd className="px-1 py-px rounded border border-[var(--border)] text-[9px] font-mono">/</kbd>
              </span>
            </div>
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}
