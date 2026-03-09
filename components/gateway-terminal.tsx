'use client'

/**
 * Gateway Terminal — slash-command TUI for agent interaction.
 * Replaces xterm.js in TUI mode with a direct gateway WebSocket interface.
 *
 * Features:
 * - Slash command registry with autocomplete dropdown
 * - Streaming response rendering (delta → final)
 * - Tool use activity trail (Reading, Editing, Searching...)
 * - Markdown rendering for responses
 * - Command history (↑/↓)
 * - Raw RPC mode (> method.name key=val)
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useTheme } from '@/context/theme-context'
import { MarkdownPreview } from '@/components/markdown-preview'
import {
  SKILL_FIRST_OVERRIDE_TOKEN,
  buildSkillFirstBlockMessage,
  evaluateSkillFirstPolicy,
  updateSkillProbeFromMessage,
} from '@/lib/skill-first-policy'
import { getSkillBySlug, SKILLS_CATALOG } from '@/lib/skills/catalog'
import { buildSkillUseEnvelope } from '@/lib/skills/provider-adapter'
import {
  buildCatalogSummary,
  buildExecutionPlan,
  buildSkillCommandHelp,
  parseSkillSlashCommand,
} from '@/lib/skills/workflow'

// ─── Command registry ────────────────────────────────────

interface CommandDef {
  name: string
  aliases: string[]
  description: string
  category: 'status' | 'session' | 'options' | 'management' | 'tools'
}

const COMMANDS: CommandDef[] = [
  { name: 'help', aliases: [], description: 'Show available commands', category: 'status' },
  { name: 'status', aliases: ['/s'], description: 'Show current status', category: 'status' },
  { name: 'whoami', aliases: ['/id'], description: 'Show your sender id', category: 'status' },
  { name: 'stop', aliases: [], description: 'Stop the current run', category: 'session' },
  { name: 'reset', aliases: [], description: 'Reset the current session', category: 'session' },
  { name: 'new', aliases: [], description: 'Start a new session', category: 'session' },
  { name: 'compact', aliases: [], description: 'Compact session context', category: 'session' },
  { name: 'model', aliases: [], description: 'Show or set the model', category: 'options' },
  { name: 'models', aliases: [], description: 'List model providers', category: 'options' },
  { name: 'think', aliases: ['/t'], description: 'Set thinking level', category: 'options' },
  { name: 'verbose', aliases: ['/v'], description: 'Toggle verbose mode', category: 'options' },
  {
    name: 'reasoning',
    aliases: [],
    description: 'Toggle reasoning visibility',
    category: 'options',
  },
  { name: 'config', aliases: [], description: 'Show or set config values', category: 'management' },
  {
    name: 'subagents',
    aliases: [],
    description: 'List/stop/log subagent runs',
    category: 'management',
  },
  {
    name: 'skill',
    aliases: [],
    description: 'Find, install, update, or use skills',
    category: 'tools',
  },
  { name: 'restart', aliases: [], description: 'Restart OpenClaw', category: 'tools' },
  { name: 'bash', aliases: [], description: 'Run shell commands', category: 'tools' },
]

const CATEGORY_LABELS: Record<string, string> = {
  status: 'Status',
  session: 'Session',
  options: 'Options',
  management: 'Management',
  tools: 'Tools',
}
const CATEGORY_ORDER = ['status', 'session', 'options', 'management', 'tools']

// ─── Types ───────────────────────────────────────────────

interface TerminalEntry {
  id: string
  type: 'command' | 'response' | 'error' | 'system' | 'rpc-result' | 'streaming'
  text: string
  timestamp: number
}

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace"
const STORAGE_KEY = 'knot-code:gw-terminal-history'
const TERMINAL_SESSION_KEY = 'terminal:main'
const MAX_HISTORY = 100

function uid(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractText(msg: Record<string, unknown> | undefined): string {
  if (!msg) return ''
  const content = msg.content as string | Array<Record<string, unknown>> | undefined
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text' || b.type === 'output_text')
      .map((b) => (b.text as string) || '')
      .join('')
  }
  return ''
}

function extractEventText(payload: Record<string, unknown> | undefined): string {
  if (!payload) return ''
  const fromMessage = extractText(payload.message as Record<string, unknown> | undefined)
  if (fromMessage) return fromMessage
  if (typeof payload.reply === 'string') return payload.reply
  if (typeof payload.text === 'string') return payload.text
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.delta === 'string') return payload.delta
  return ''
}

function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) return incoming
  // Some gateways stream cumulative buffers; others stream per-chunk deltas.
  if (incoming.startsWith(previous)) return incoming
  if (previous.endsWith(incoming)) return previous
  return previous + incoming
}

function isNoReply(text: string | undefined): boolean {
  if (!text) return false
  return /^\s*(NO_REPLY|HEARTBEAT_OK)\s*$/i.test(text)
}

function buildHelpText(): string {
  const lines: string[] = ['# Gateway Terminal Commands\n']
  for (const cat of CATEGORY_ORDER) {
    const cmds = COMMANDS.filter((c) => c.category === cat)
    if (!cmds.length) continue
    lines.push(`## ${CATEGORY_LABELS[cat]}`)
    for (const cmd of cmds) {
      const aliases = cmd.aliases.length ? ` *(${cmd.aliases.join(', ')})*` : ''
      lines.push(`- \`/${cmd.name}\`${aliases} — ${cmd.description}`)
    }
    lines.push('')
  }
  lines.push('## RPC Mode')
  lines.push('- `> method.name [key=val]` — Send raw RPC request')
  lines.push('- `> health` — Gateway health check')
  lines.push('- `> sessions.list` — List sessions')
  return lines.join('\n')
}

function getMatchingCommands(query: string): CommandDef[] {
  const q = query.startsWith('/') ? query.slice(1).toLowerCase() : query.toLowerCase()
  const matches = COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().startsWith(q) ||
      cmd.aliases.some((a) => a.replace('/', '').toLowerCase().startsWith(q)),
  )
  const result: CommandDef[] = []
  for (const cat of CATEGORY_ORDER) {
    result.push(...matches.filter((c) => c.category === cat))
  }
  return result
}

function parseRpcLine(line: string): { method: string; params: Record<string, unknown> } {
  const parts = line.slice(1).trim().split(/\s+/)
  const method = parts[0] || ''
  const params: Record<string, unknown> = {}
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq > 0) {
      const key = parts[i].slice(0, eq)
      const val = parts[i].slice(eq + 1)
      if (val === 'true') params[key] = true
      else if (val === 'false') params[key] = false
      else if (/^\d+$/.test(val)) params[key] = parseInt(val, 10)
      else params[key] = val
    }
  }
  return { method, params }
}

// ─── Autocomplete ────────────────────────────────────────

function AutocompleteDropdown({
  query,
  selectedIndex,
  onSelect,
  visible,
}: {
  query: string
  selectedIndex: number
  onSelect: (name: string) => void
  visible: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => getMatchingCommands(query), [query])

  useEffect(() => {
    ref.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || !matches.length) return null

  let idx = 0
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl z-50"
    >
      {CATEGORY_ORDER.map((cat) => {
        const cmds = matches.filter((c) => c.category === cat)
        if (!cmds.length) return null
        return (
          <div key={cat}>
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                {CATEGORY_LABELS[cat]}
              </span>
            </div>
            {cmds.map((cmd) => {
              const isSelected = idx === selectedIndex
              const currentIdx = idx
              idx++
              return (
                <button
                  key={cmd.name}
                  data-selected={isSelected}
                  onClick={() => onSelect(cmd.name)}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]'
                      : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <span
                    className="text-[12px] font-medium text-[var(--brand)]"
                    style={{ fontFamily: MONO }}
                  >
                    /{cmd.name}
                  </span>
                  {cmd.aliases.length > 0 && (
                    <span
                      className="text-[10px] text-[var(--text-disabled)]"
                      style={{ fontFamily: MONO }}
                    >
                      {cmd.aliases.join(' ')}
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--text-tertiary)] ml-auto truncate max-w-[50%]">
                    {cmd.description}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Entry renderer ──────────────────────────────────────

const ENTRY_BACKDROP = 'backdrop-blur-md rounded-lg px-3 py-1.5'
const ENTRY_BG = 'color-mix(in srgb, var(--bg) 55%, transparent)'

function EntryView({ entry, hasBg }: { entry: TerminalEntry; hasBg: boolean }) {
  const backdrop = hasBg ? ENTRY_BACKDROP : ''
  const bgStyle = hasBg ? { background: ENTRY_BG } : undefined

  if (entry.type === 'command') {
    return (
      <div
        className={`text-[13px] leading-relaxed ${backdrop}`}
        style={{ fontFamily: MONO, ...bgStyle }}
      >
        <span className="text-[var(--brand)] font-semibold">❯ </span>
        <span className="text-[var(--text-primary)]">{entry.text}</span>
      </div>
    )
  }

  if (entry.type === 'system') {
    return (
      <div
        className={`text-[12px] leading-relaxed text-[var(--text-disabled)] ${backdrop}`}
        style={{ fontFamily: MONO, ...bgStyle }}
      >
        {entry.text}
      </div>
    )
  }

  if (entry.type === 'error') {
    return (
      <div
        className={`ml-2 pl-3 py-2 pr-8 rounded-lg text-[13px] leading-relaxed ${hasBg ? 'backdrop-blur-md' : ''}`}
        style={{
          borderLeft: '3px solid var(--error, #ef4444)',
          background: hasBg
            ? 'color-mix(in srgb, var(--bg) 60%, rgba(239, 68, 68, 0.08))'
            : 'rgba(239, 68, 68, 0.06)',
        }}
      >
        <span className="font-medium text-[var(--color-deletions)]">{entry.text}</span>
      </div>
    )
  }

  if (entry.type === 'rpc-result') {
    return (
      <div
        className={`ml-2 pl-3 py-2 pr-8 rounded-lg text-[13px] leading-relaxed overflow-x-auto ${hasBg ? 'backdrop-blur-md' : ''}`}
        style={{
          borderLeft: '3px solid var(--success, #10b981)',
          background: hasBg
            ? 'color-mix(in srgb, var(--bg) 60%, rgba(16, 185, 129, 0.06))'
            : 'rgba(16, 185, 129, 0.04)',
          fontFamily: MONO,
        }}
      >
        <pre className="text-[var(--text-secondary)] whitespace-pre-wrap">{entry.text}</pre>
      </div>
    )
  }

  if (entry.type === 'streaming') {
    return (
      <div
        className={`ml-2 pl-3 py-2 pr-8 rounded-lg text-[13px] leading-relaxed ${hasBg ? 'backdrop-blur-md' : ''}`}
        style={{
          borderLeft: '3px solid var(--brand)',
          background: hasBg
            ? 'color-mix(in srgb, var(--bg) 60%, color-mix(in srgb, var(--brand) 6%, transparent))'
            : 'color-mix(in srgb, var(--brand) 4%, transparent)',
        }}
      >
        <MarkdownPreview content={entry.text} className="terminal-md" />
        <span className="inline-block w-1.5 h-4 bg-[var(--brand)] animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      </div>
    )
  }

  // response
  return (
    <div
      className={`ml-2 pl-3 py-2 pr-8 rounded-lg text-[13px] leading-relaxed ${hasBg ? 'backdrop-blur-md' : ''}`}
      style={{
        borderLeft: '3px solid var(--success, #10b981)',
        background: hasBg
          ? 'color-mix(in srgb, var(--bg) 60%, rgba(16, 185, 129, 0.06))'
          : 'rgba(16, 185, 129, 0.04)',
      }}
    >
      <MarkdownPreview content={entry.text} className="terminal-md" />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────

export function GatewayTerminal() {
  const { status, sendRequest, onEvent } = useGateway()
  const { terminalBg, terminalBgOpacity } = useTheme()
  const isConnected = status === 'connected'
  const hasBgImage = !!terminalBg
  const terminalStyle = useMemo(
    () =>
      hasBgImage
        ? { fontFamily: MONO }
        : ({
            fontFamily: MONO,
            '--text-primary': '#e5e7eb',
            '--text-secondary': '#cbd5e1',
            '--text-tertiary': '#94a3b8',
            '--text-disabled': '#64748b',
            '--bg-subtle': 'rgba(255, 255, 255, 0.08)',
          } as CSSProperties),
    [hasBgImage],
  )

  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [acOpen, setAcOpen] = useState(false)
  const [acIdx, setAcIdx] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamBuf = useRef('')
  const streamId = useRef<string | null>(null)
  const pendingIdempotencyKeys = useRef(new Set<string>())

  // Hydrate history
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCmdHistory(JSON.parse(saved).slice(-MAX_HISTORY))
    } catch {}
  }, [])

  const saveHistory = useCallback((h: string[]) => {
    setCmdHistory(h)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-MAX_HISTORY)))
    } catch {}
  }, [])

  // Welcome
  useEffect(() => {
    setEntries([
      {
        id: uid(),
        type: 'system',
        text: '✨ Gateway Terminal — type / for commands or just ask a question',
        timestamp: Date.now(),
      },
    ])
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [entries])

  // Chat event listener (streaming + final)
  useEffect(() => {
    const unsub = onEvent('chat', (payload: unknown) => {
      const p = payload as Record<string, unknown>
      const state = p.state as string | undefined

      // Match events belonging to terminal requests
      const eventSessionKey = (p.sessionKey ??
        p.session_key ??
        (typeof p.session === 'object' && p.session !== null
          ? (p.session as Record<string, unknown>).key
          : undefined)) as string | undefined
      const eventIdempotencyKey = (p.idempotencyKey ??
        p.idempotency_key ??
        p.idemKey ??
        p.runId) as string | undefined

      // Accept if: idempotency key matches one we sent, OR session is terminal's, OR no session key
      const idempotencyMatch =
        eventIdempotencyKey && pendingIdempotencyKeys.current.has(eventIdempotencyKey)
      const sessionMatch = !eventSessionKey || eventSessionKey === TERMINAL_SESSION_KEY

      console.log('[GW-Terminal] chat event:', {
        state,
        sessionKey: eventSessionKey,
        idempotencyKey: eventIdempotencyKey,
        idempotencyMatch,
        sessionMatch,
      })

      if (!idempotencyMatch && !sessionMatch) {
        console.log('[GW-Terminal] skipping event — no match:', eventSessionKey)
        return
      }

      // Clean up idempotency key on final/error/aborted
      if (eventIdempotencyKey && (state === 'final' || state === 'error' || state === 'aborted')) {
        pendingIdempotencyKeys.current.delete(eventIdempotencyKey)
      }

      if (state === 'delta') {
        const text = extractEventText(p)
        if (text) {
          const merged = mergeStreamingText(streamBuf.current, text)
          streamBuf.current = merged
          if (!streamId.current) {
            const id = uid()
            streamId.current = id
            setEntries((prev) => [
              ...prev,
              { id, type: 'streaming', text: merged, timestamp: Date.now() },
            ])
          } else {
            const id = streamId.current
            setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text: merged } : e)))
          }
        }
      } else if (state === 'tool_use' || state === 'tool_start') {
        const toolName = (p.toolName || p.name || '') as string
        if (toolName) {
          const inp = p.input as Record<string, unknown> | undefined
          let step = `🔧 ${toolName}`
          if (/read/i.test(toolName)) {
            const path = (inp?.path || inp?.file_path || '') as string
            step = `📖 Reading ${path.split('/').pop() || path}`
          } else if (/search|grep/i.test(toolName)) {
            step = `🔍 Searching ${((inp?.query as string) || '').slice(0, 40)}`
          } else if (/write|edit/i.test(toolName)) {
            const path = (inp?.path || inp?.file_path || '') as string
            step = `✏️ Editing ${path.split('/').pop() || path}`
          } else if (/exec|bash/i.test(toolName)) {
            step = `⚡ Running command`
          }
          setEntries((prev) => [
            ...prev,
            { id: uid(), type: 'system', text: step, timestamp: Date.now() },
          ])
        }
      } else if (state === 'final') {
        const text = extractEventText(p) || streamBuf.current
        if (streamId.current) {
          const id = streamId.current
          if (text && !isNoReply(text)) {
            setEntries((prev) =>
              prev.map((e) => (e.id === id ? { ...e, type: 'response' as const, text } : e)),
            )
          } else {
            setEntries((prev) => prev.filter((e) => e.id !== id))
          }
        } else if (text && !isNoReply(text)) {
          setEntries((prev) => [
            ...prev,
            { id: uid(), type: 'response', text, timestamp: Date.now() },
          ])
        }
        streamBuf.current = ''
        streamId.current = null
        setSending(false)
      } else if (state === 'error') {
        if (streamId.current) setEntries((prev) => prev.filter((e) => e.id !== streamId.current))
        streamBuf.current = ''
        streamId.current = null
        const msg = (p.errorMessage as string) || 'Unknown error'
        setEntries((prev) => [
          ...prev,
          { id: uid(), type: 'error', text: msg, timestamp: Date.now() },
        ])
        setSending(false)
      } else if (state === 'aborted') {
        if (streamId.current && streamBuf.current) {
          const id = streamId.current
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? { ...e, type: 'response' as const, text: e.text + '\n\n*[aborted]*' }
                : e,
            ),
          )
        }
        streamBuf.current = ''
        streamId.current = null
        setSending(false)
      }
    })
    return unsub
  }, [onEvent])

  const addEntry = useCallback((type: TerminalEntry['type'], text: string) => {
    setEntries((prev) => [...prev, { id: uid(), type, text, timestamp: Date.now() }])
  }, [])

  const sendChatMessage = useCallback(
    async (message: string) => {
      setSending(true)
      streamBuf.current = ''
      streamId.current = null

      // Safety timeout — if nothing arrives via events within 3 min, stop waiting
      const safetyTimer = setTimeout(() => {
        setSending((prev) => {
          if (prev) {
            addEntry('system', '⏱ Response timed out — no reply received')
            return false
          }
          return prev
        })
      }, 180000)

      try {
        const idempotencyKey = `gw-term-${Date.now()}`
        pendingIdempotencyKeys.current.add(idempotencyKey)
        const resp = (await sendRequest('chat.send', {
          sessionKey: TERMINAL_SESSION_KEY,
          message,
          idempotencyKey,
        })) as Record<string, unknown> | undefined

        const respStatus = resp?.status as string | undefined
        console.log('[GW-Terminal] chat.send response:', {
          status: respStatus,
          keys: resp ? Object.keys(resp).join(',') : 'null',
        })

        // Check if the response contains an inline reply (synchronous path)
        const inlineReply = extractEventText(resp)
        if (inlineReply && !isNoReply(inlineReply)) {
          // If we haven't already rendered this via streaming events, add it
          if (!streamId.current) {
            addEntry('response', inlineReply)
          }
          clearTimeout(safetyTimer)
          setSending(false)
          return
        }

        if (isNoReply(inlineReply)) {
          clearTimeout(safetyTimer)
          setSending(false)
          return
        }

        // No inline reply — response will arrive via chat events (streaming)
        // setSending stays true; the event listener's 'final' handler clears it
        // Safety timer is still running as a backstop
      } catch (e) {
        // If streaming already started via events, don't kill it
        if (streamId.current) {
          console.log('[GW-Terminal] sendRequest errored but stream in progress, continuing')
          return
        }
        clearTimeout(safetyTimer)
        addEntry('error', e instanceof Error ? e.message : 'Send failed')
        setSending(false)
      }
    },
    [addEntry, sendRequest],
  )

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || sending) return
    setAcOpen(false)
    addEntry('command', trimmed)
    setInput('')
    setHistIdx(-1)

    const newHistory = [...cmdHistory.filter((h) => h !== trimmed), trimmed].slice(-MAX_HISTORY)
    saveHistory(newHistory)

    if (trimmed === '/help' || trimmed === '/commands') {
      addEntry('response', buildHelpText())
      return
    }

    // Raw RPC
    if (trimmed.startsWith('>')) {
      const { method, params } = parseRpcLine(trimmed)
      if (!method) {
        addEntry('error', 'Usage: > method.name [key=value ...]')
        return
      }
      setSending(true)
      try {
        const result = await sendRequest(method, Object.keys(params).length ? params : undefined)
        addEntry('rpc-result', JSON.stringify(result, null, 2))
      } catch (e) {
        addEntry('error', e instanceof Error ? e.message : 'RPC failed')
      } finally {
        setSending(false)
      }
      return
    }

    const parsedSkillCommand = parseSkillSlashCommand(trimmed)
    if (parsedSkillCommand) {
      if (parsedSkillCommand.kind === 'help') {
        addEntry('response', buildSkillCommandHelp())
        return
      }

      if (parsedSkillCommand.kind === 'list') {
        addEntry('response', buildCatalogSummary(SKILLS_CATALOG))
        return
      }

      if (parsedSkillCommand.kind === 'use') {
        const skill = parsedSkillCommand.skillSlug
          ? getSkillBySlug(parsedSkillCommand.skillSlug)
          : undefined
        if (!skill) {
          addEntry('error', `Unknown skill: ${parsedSkillCommand.skillSlug ?? 'unknown'}`)
          return
        }
        const request = parsedSkillCommand.request?.trim() || skill.starterPrompt
        const envelope = buildSkillUseEnvelope({
          skill,
          request,
          modelName: 'gateway',
        })
        await sendChatMessage(envelope.prompt)
        return
      }

      const plan = buildExecutionPlan(parsedSkillCommand, { preferTerminal: false })
      if (!plan?.message) {
        addEntry('error', 'Could not build a skill workflow for that command.')
        return
      }
      await sendChatMessage(plan.message)
      return
    }

    // Chat send (slash command or plain text)
    updateSkillProbeFromMessage(TERMINAL_SESSION_KEY, trimmed)
    const policy = evaluateSkillFirstPolicy({
      sessionKey: TERMINAL_SESSION_KEY,
      message: trimmed,
      mode: 'hard_with_override',
    })
    if (policy.blocked) {
      addEntry('error', buildSkillFirstBlockMessage(policy))
      return
    }
    if (policy.overrideUsed) {
      addEntry('system', `Skill-first override accepted via ${SKILL_FIRST_OVERRIDE_TOKEN}.`)
    }

    await sendChatMessage(trimmed)
  }, [input, sending, sendRequest, cmdHistory, saveHistory, addEntry, sendChatMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (acOpen) {
        const matches = getMatchingCommands(input)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setAcIdx((i) => (i + 1) % Math.max(matches.length, 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setAcIdx((i) => (i - 1 + matches.length) % Math.max(matches.length, 1))
          return
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && matches.length) {
          e.preventDefault()
          const sel = matches[acIdx]
          if (sel) {
            setInput('/' + sel.name + ' ')
            setAcOpen(false)
            setAcIdx(0)
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setAcOpen(false)
          return
        }
      }
      if (e.key === 'Enter' && !acOpen) {
        e.preventDefault()
        handleSubmit()
        return
      }
      if (e.key === 'ArrowUp' && !acOpen) {
        e.preventDefault()
        if (!cmdHistory.length) return
        const i = histIdx === -1 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1)
        setHistIdx(i)
        setInput(cmdHistory[i] || '')
        return
      }
      if (e.key === 'ArrowDown' && !acOpen) {
        e.preventDefault()
        if (histIdx === -1) return
        const i = histIdx + 1
        if (i >= cmdHistory.length) {
          setHistIdx(-1)
          setInput('')
        } else {
          setHistIdx(i)
          setInput(cmdHistory[i] || '')
        }
      }
    },
    [acOpen, input, acIdx, handleSubmit, cmdHistory, histIdx],
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    setHistIdx(-1)
    if (val.startsWith('/') && !val.includes(' ')) {
      setAcOpen(true)
      setAcIdx(0)
    } else setAcOpen(false)
  }, [])

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden relative ${hasBgImage ? '' : 'bg-black'}`}
      style={terminalStyle}
    >
      {hasBgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${terminalBg})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: `color-mix(in srgb, var(--bg) ${Math.max(terminalBgOpacity, 60)}%, transparent)`,
            }}
          />
        </>
      )}
      {/* Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 min-h-0 relative"
        onClick={() => inputRef.current?.focus()}
      >
        {entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} hasBg={hasBgImage} />
        ))}
        {sending && !streamId.current && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-disabled)] pl-1">
            <span className="inline-flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse"
                style={{ animationDelay: '200ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse"
                style={{ animationDelay: '400ms' }}
              />
            </span>
            <span>Processing…</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className={`relative z-[1] shrink-0 border-t border-[var(--border)] ${hasBgImage ? 'backdrop-blur-xl' : ''}`}
        style={
          hasBgImage ? { background: 'color-mix(in srgb, var(--bg) 70%, transparent)' } : undefined
        }
      >
        <AutocompleteDropdown
          query={input}
          selectedIndex={acIdx}
          onSelect={(name) => {
            setInput('/' + name + ' ')
            setAcOpen(false)
            setAcIdx(0)
            inputRef.current?.focus()
          }}
          visible={acOpen}
        />
        <div className="flex items-center px-4 py-2.5">
          <span className="text-[13px] text-[var(--brand)] mr-2 shrink-0 select-none font-semibold">
            ❯
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            placeholder={
              isConnected
                ? 'Type a command or ask a question…'
                : 'Not connected — waiting for gateway…'
            }
            className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
            style={{ fontFamily: MONO }}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          {sending && (
            <span className="text-[10px] text-[var(--text-disabled)] animate-pulse mr-2">
              running…
            </span>
          )}
          <button
            onClick={() => setEntries([])}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            title="Clear"
          >
            <Icon icon="lucide:trash-2" width={13} height={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
