'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { MarkdownPreview } from '@/components/markdown-preview'
import { DiffViewer } from '@/components/diff-viewer'
import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
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
    <div className="flex flex-col items-center justify-center text-center py-6 px-4">
      <div className="relative mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,transparent)] to-[color-mix(in_srgb,var(--brand)_6%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)] flex items-center justify-center shadow-lg">
          <Icon icon="lucide:cpu" width={26} height={26} className="text-[var(--brand)]" />
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--sidebar-bg)] ${
          isConnecting ? 'bg-[var(--warning,#eab308)] animate-pulse' : 'bg-[var(--text-disabled)]'
        }`} />
      </div>

      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Connect to Gateway</h3>
      <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-4 max-w-[240px]">
        Your OpenClaw gateway powers the AI agent. Connect to enable completions, chat, and slash commands.
      </p>

      <div className="w-full max-w-[260px] space-y-2">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
          placeholder="ws://localhost:4444"
          className="w-full px-2.5 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
          disabled={isConnecting}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
            placeholder="Password (optional)"
            className="w-full px-2.5 py-2 pr-7 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
            disabled={isConnecting}
          />
          <button
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
            tabIndex={-1}
          >
            <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} width={11} height={11} />
          </button>
        </div>
        <button
          onClick={handleConnect}
          disabled={!url.trim() || isConnecting}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--brand)',
            color: 'var(--brand-contrast, #fff)',
          }}
        >
          {isConnecting ? (
            <Icon icon="lucide:loader-2" width={12} height={12} className="animate-spin" />
          ) : (
            <Icon icon="lucide:plug" width={12} height={12} />
          )}
          {isConnecting ? 'Connecting…' : 'Connect'}
        </button>
      </div>

      {status === 'error' && error && (
        <div className="flex items-start gap-1.5 mt-3 text-[10px] text-[var(--color-deletions)] max-w-[260px] text-left">
          <Icon icon="lucide:alert-circle" width={11} height={11} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <div className="mt-5 space-y-1.5 text-[10px] text-[var(--text-disabled)] max-w-[220px]">
        <div className="flex items-center gap-1.5">
          <Icon icon="lucide:shield" width={10} height={10} />
          <span>Runs locally — code never leaves your machine</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon icon="lucide:zap" width={10} height={10} />
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

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [contextAttachments, setContextAttachments] = useState<Array<{ type: 'file' | 'selection'; path: string; content: string; startLine?: number; endLine?: number }>>([])
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atMenuIdx, setAtMenuIdx] = useState(0)
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

  // ─── Session initialization (inject system prompt once) ───────
  useEffect(() => {
    if (!isConnected || sessionInitRef.current) return

    const initKey = `${SESSION_INIT_STORAGE_KEY}:${CODE_EDITOR_SESSION_KEY}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
    const alreadyInit = typeof window !== 'undefined' && sessionStorage.getItem(initKey)
    if (alreadyInit) {
      sessionInitRef.current = true
      return
    }

    // Inject system prompt
    sendRequest('chat.inject', {
      sessionKey: CODE_EDITOR_SESSION_KEY,
      message: CODE_EDITOR_SYSTEM_PROMPT,
      label: 'Knot Code system prompt',
    }).then(() => {
      sessionInitRef.current = true
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(initKey, 'true')
      }
    }).catch(() => {
      // Non-fatal — session still works without explicit system prompt
    })

    // Label the session
    sendRequest('sessions.patch', {
      key: CODE_EDITOR_SESSION_KEY,
      label: 'Knot Code Agent',
    }).catch(() => { /* non-fatal */ })
  }, [isConnected, sendRequest])

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
      const matchesSession = !idempotencyKey && eventSessionKey === CODE_EDITOR_SESSION_KEY
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
        if (idempotencyKey) sentKeysRef.current.delete(idempotencyKey)
        setStreamBuffer(prev => {
          const text = finalText || prev || ''
          if (text && !/^NO_REPLY$/i.test(text.trim())) {
            const editProposals = parseEditProposals(text)
            // Auto-apply edits directly to the editor (Cursor-style)
            if (editProposals.length > 0) {
              for (const proposal of editProposals) {
                const existing = getFile(proposal.filePath)
                if (existing) {
                  updateFileContent(proposal.filePath, proposal.content)
                } else {
                  openFile(proposal.filePath, proposal.content, undefined)
                }
              }
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
    })
  }, [repo, activeFile, files, getFile])


  // ─── Message helpers ──────────────────────────────────────────
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setSending(true)

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() })

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
      const fullMessage = context ? `${context}\n\n${text}` : text
      const idemKey = `ce-${Date.now()}`
      sentKeysRef.current.add(idemKey)

      setIsStreaming(true)
      const resp = (await sendRequest('chat.send', {
        sessionKey: CODE_EDITOR_SESSION_KEY,
        message: fullMessage,
        idempotencyKey: idemKey,
      })) as Record<string, unknown> | undefined

      const respStatus = resp?.status as string | undefined
      if (respStatus === 'started' || respStatus === 'in_flight') {
        // Streaming — reply will arrive via onEvent('chat') handler
        return
      }

      // Synchronous reply (non-streaming fallback)
      // Only process if the event handler hasn't already consumed this key
      if (!sentKeysRef.current.has(idemKey)) return // already handled by event
      sentKeysRef.current.delete(idemKey)
      const reply = String(resp?.reply ?? resp?.text ?? '')
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
  }, [input, sending, isConnected, sendRequest, buildContext, appendMessage])

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
        sessionKey: CODE_EDITOR_SESSION_KEY,
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
  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--sidebar-bg)]">
      {/* Brand accent bar */}
      <div className="h-[2px] shrink-0 bg-gradient-to-r from-transparent via-[var(--brand)] to-[color-mix(in_srgb,var(--brand)_50%,transparent)] opacity-70" />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_4%,var(--sidebar-bg))] shrink-0">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:sparkles" width={14} height={14} className="text-[var(--brand)]" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">Agent</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">&middot;</span>
          <span className={`text-[10px] ${isConnected ? 'text-[var(--color-additions)]' : 'text-[var(--color-deletions)]'}`}>
            {isConnected ? 'connected' : 'offline'}
          </span>
        </div>
        {messages.length > 0 && (
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
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !isConnected && (
          <AgentConnectPrompt />
        )}

        {messages.length === 0 && isConnected && (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <div className="relative mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_15%,transparent)] to-[color-mix(in_srgb,var(--brand)_5%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] flex items-center justify-center">
                <Icon icon="lucide:sparkles" width={22} height={22} className="text-[var(--brand)] animate-sparkle" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--sidebar-bg)] bg-[var(--color-additions)]" />
            </div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Coding Agent</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1 max-w-[220px] leading-relaxed">
              Full-stack expert. Edit, explain, refactor, or generate code.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
              {[
                { cmd: '/edit', icon: 'lucide:pencil' },
                { cmd: '/explain', icon: 'lucide:book-open' },
                { cmd: '/refactor', icon: 'lucide:refresh-cw' },
                { cmd: '/generate', icon: 'lucide:plus' },
              ].map(({ cmd, icon }) => (
                <button
                  key={cmd}
                  onClick={() => setInput(cmd + ' ')}
                  className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_5%,transparent)] transition-all cursor-pointer"
                >
                  <Icon icon={icon} width={10} height={10} />
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

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
                {/* Thinking trail */}
                {thinkingTrail.length > 0 && (
                  <div className="flex flex-col gap-0.5 mb-1">
                    {thinkingTrail.map((step, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-[10px] transition-opacity duration-300 ${
                        i === thinkingTrail.length - 1 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'
                      }`}>
                        <Icon icon={
                          step.startsWith('Reading') ? 'lucide:file-text' :
                          step.startsWith('Searching') ? 'lucide:search' :
                          step.startsWith('Exploring') ? 'lucide:folder-open' :
                          step.startsWith('Editing') ? 'lucide:pencil' :
                          step.startsWith('Running') ? 'lucide:terminal' :
                          'lucide:sparkles'
                        } width={10} height={10} className="shrink-0" />
                        <span className="truncate">{step}</span>
                        {i === thinkingTrail.length - 1 && <span className="w-1 h-1 rounded-full bg-[var(--brand)] animate-pulse shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-typing-dot-2" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-typing-dot-3" />
                  </div>
                <span className="text-[10px] text-[var(--text-tertiary)] ml-1">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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

          {/* Context attachment chips */}
          {contextAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {contextAttachments.map((att, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)] text-[var(--brand)]"
                >
                  <Icon
                    icon={att.type === 'selection' ? 'lucide:text-cursor-input' : 'lucide:file-text'}
                    width={9} height={9}
                  />
                  {att.type === 'selection'
                    ? `${att.path.split('/').pop()}:${att.startLine}-${att.endLine}`
                    : att.path.split('/').pop()
                  }
                  <button
                    onClick={() => setContextAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={8} height={8} />
                  </button>
                </span>
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
            placeholder={activeFile ? `Ask about ${activeFile.split('/').pop()}...` : 'Ask or type /command...'}
            rows={1}
            className="w-full resize-none rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] px-3 py-2.5 pr-10 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand)_20%,transparent)] transition-all"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all cursor-pointer ${
              input.trim() && !sending
                ? 'bg-[var(--brand)] text-white hover:opacity-90'
                : 'text-[var(--text-disabled)] cursor-not-allowed'
            }`}
            title="Send (Enter)"
          >
            <Icon icon={isStreaming ? 'lucide:square' : 'lucide:arrow-up'} width={12} height={12} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[8px] text-[var(--text-disabled)]">
            {activeFile && (
              <>Context: <span className="text-[var(--text-tertiary)]">{activeFile.split('/').pop()}</span></>
            )}
          </span>
          <span className="text-[8px] text-[var(--text-disabled)]">
            <kbd className="px-1 rounded border border-[var(--border)] text-[7px]">Enter</kbd> send · <kbd className="px-1 rounded border border-[var(--border)] text-[7px]">Shift+Enter</kbd> newline
          </span>
        </div>
      </div>
    </div>
  )
}
