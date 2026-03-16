'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { isIOSTauri, isTauri, tauriInvoke, tauriListen } from '@/lib/tauri'
import { useTheme } from '@/context/theme-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'
import { emit } from '@/lib/events'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  visible: boolean
  height: number
  onHeightChange: (h: number) => void
  floating?: boolean
  onToggleFloating?: () => void
  forceGatewayFallback?: boolean
  /** Restart terminal session whenever pane opens or mode changes. */
  refreshOnOpenOrMode?: boolean
  /** Token that changes when app mode changes. */
  refreshToken?: string
  /** Optional command to run after a refresh/open. */
  startupCommand?: string
}

const FILE_EXT_PATTERN =
  '(?:tsx?|jsx?|mjs|cjs|json|md|mdx|css|scss|html|xml|yaml|yml|py|rs|go|rb|sh|bash|zsh|sql|graphql|toml|lock|txt|cfg|ini|env|svg|vue|svelte|astro|prisma|mdc)'

const FILE_PATH_REGEX = new RegExp(
  `(?:^|\\s|\\(|'|"|=)` +
    `(` +
    `\\.{0,2}/[\\w./@-]+\\.${FILE_EXT_PATTERN}` +
    `(?::(\\d+)(?::(\\d+))?)?` +
    `|` +
    `[\\w./@-]+\\.${FILE_EXT_PATTERN}` +
    `(?::(\\d+)(?::(\\d+))?)?` +
    `)`,
  'g',
)

const SOLID_TERMINAL_BG = '#000000'
const SOLID_TERMINAL_FG = '#e5e7eb'

function findFileLinksInLine(
  lineText: string,
): Array<{ text: string; startCol: number; endCol: number; line?: number; col?: number }> {
  const results: Array<{
    text: string
    startCol: number
    endCol: number
    line?: number
    col?: number
  }> = []
  const regex = new RegExp(FILE_PATH_REGEX.source, FILE_PATH_REGEX.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(lineText)) !== null) {
    const fullMatch = match[1]
    if (!fullMatch) continue
    const pathOnly = fullMatch.replace(/:\d+(?::\d+)?$/, '')
    if (/^https?:\/\//i.test(pathOnly)) continue
    if (/^\d+\.\d+\.\d+/.test(pathOnly)) continue

    const lineNum = match[2]
      ? parseInt(match[2], 10)
      : match[4]
        ? parseInt(match[4], 10)
        : undefined
    const colNum = match[3] ? parseInt(match[3], 10) : match[5] ? parseInt(match[5], 10) : undefined

    const startIndex = match.index + match[0].indexOf(fullMatch)
    results.push({
      text: fullMatch,
      startCol: startIndex,
      endCol: startIndex + fullMatch.length,
      line: lineNum,
      col: colNum,
    })
  }
  return results
}

function buildXtermTheme(hasBgImage?: boolean, bgColor?: string | null) {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  const dark = document.documentElement.classList.contains('dark')
  const solidBg = bgColor || SOLID_TERMINAL_BG
  return {
    background: hasBgImage ? 'transparent' : solidBg,
    foreground: hasBgImage
      ? v('--text-primary') || (dark ? '#e5e5e5' : '#171717')
      : SOLID_TERMINAL_FG,
    cursor: v('--brand') || '#a855f7',
    cursorAccent: hasBgImage ? 'transparent' : solidBg,
    selectionBackground: (v('--brand') || '#a855f7') + '40',
    black: dark ? '#1e1e1e' : '#d4d4d4',
    red: dark ? '#f87171' : '#dc2626',
    green: dark ? '#4ade80' : '#16a34a',
    yellow: dark ? '#facc15' : '#ca8a04',
    blue: dark ? '#60a5fa' : '#2563eb',
    magenta: dark ? '#c084fc' : '#9333ea',
    cyan: dark ? '#22d3ee' : '#0891b2',
    white: dark ? '#e5e5e5' : '#171717',
    brightBlack: dark ? '#525252' : '#a3a3a3',
    brightRed: dark ? '#fca5a5' : '#ef4444',
    brightGreen: dark ? '#86efac' : '#22c55e',
    brightYellow: dark ? '#fde047' : '#eab308',
    brightBlue: dark ? '#93c5fd' : '#3b82f6',
    brightMagenta: dark ? '#d8b4fe' : '#a855f7',
    brightCyan: dark ? '#67e8f9' : '#06b6d4',
    brightWhite: dark ? '#fafafa' : '#0a0a0a',
  }
}

// ─── Module-level singleton session state ──────────────────────────────────
// Survives React remounts and HMR — only one PTY session exists at a time.

interface SessionState {
  terminalId: number | null
  remoteSessionId: string | null
  remoteLifecycle: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'closed'
  creating: boolean
  lastKilledAt: number
  exitUnlisten: (() => void) | null
  outputUnlisten: (() => void) | null
  xterm: any | null
  fit: any | null
  manualClose: boolean
}

const session: SessionState = {
  terminalId: null,
  remoteSessionId: null,
  remoteLifecycle: 'idle',
  creating: false,
  lastKilledAt: 0,
  exitUnlisten: null,
  outputUnlisten: null,
  xterm: null,
  fit: null,
  manualClose: false,
}

// Prevent HMR from double-creating: if the module reloads but the old session
// is still alive in the Tauri backend, we keep the id.
if (typeof window !== 'undefined') {
  const prev = (window as any).__terminalSession as SessionState | undefined
  if (prev) {
    session.terminalId = prev.terminalId
    session.remoteSessionId = prev.remoteSessionId
    session.remoteLifecycle = prev.remoteLifecycle
    session.exitUnlisten = prev.exitUnlisten
    session.outputUnlisten = prev.outputUnlisten
    session.manualClose = prev.manualClose
  }
  ;(window as any).__terminalSession = session
}

const CREATE_DEBOUNCE_MS = 400

// Clean up orphaned backend sessions on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    tauriInvoke('kill_all_terminals').catch(() => {})
  })
}

async function ensureSession(
  cwd?: string | null,
  listeners?: {
    onOutput: (data: string) => void
    onExit: () => void
  },
): Promise<number | null> {
  if (session.terminalId != null) return session.terminalId
  if (session.creating) return null
  if (Date.now() - session.lastKilledAt < CREATE_DEBOUNCE_MS) return null

  session.creating = true
  session.manualClose = false
  try {
    const id = await tauriInvoke<number>('create_terminal', {
      cols: 80,
      rows: 24,
      cwd: cwd ?? undefined,
    })
    if (id == null) {
      session.creating = false
      return null
    }
    session.terminalId = id

    session.exitUnlisten?.()
    session.exitUnlisten = await tauriListen<{ id: number; code: number }>(
      `terminal-exit-${id}`,
      (payload) => {
        if (session.terminalId === payload.id) {
          session.xterm?.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
          setTimeout(() => {
            session.terminalId = null
            listeners?.onExit()
          }, 800)
        }
      },
    )

    session.outputUnlisten?.()
    session.outputUnlisten = await tauriListen<{ data: string }>(
      `terminal-output-${id}`,
      (payload) => {
        listeners?.onOutput(payload.data)
      },
    )

    session.creating = false
    return id
  } catch {
    session.creating = false
    return null
  }
}

async function killSession() {
  session.lastKilledAt = Date.now()
  const id = session.terminalId
  session.terminalId = null
  session.creating = false
  session.exitUnlisten?.()
  session.exitUnlisten = null
  session.outputUnlisten?.()
  session.outputUnlisten = null
  if (id != null) {
    await tauriInvoke('kill_terminal', { id }).catch(() => {})
  }
}

// ─── Single Terminal Pane ──────────────────────────────────────────────────

interface TerminalPaneProps {
  visible: boolean
  height: number
  isDesktop: boolean
  themeVersion: number
  floating?: boolean
  onToggleFloating?: () => void
  cwd?: string | null
  onFileOpen?: (path: string, line?: number, col?: number) => void
  /** Hide internal header (used when parent provides its own header, e.g. TUI center mode) */
  hideHeader?: boolean
  refreshOnOpenOrMode?: boolean
  refreshToken?: string
  startupCommand?: string
  terminalBg?: string | null
  terminalBgOpacity?: number
  terminalBgColor?: string | null
  onChangeBgColor?: (color: string | null) => void
}

function TerminalPane({
  visible,
  height,
  isDesktop,
  themeVersion,
  floating,
  onToggleFloating,
  cwd,
  onFileOpen,
  hideHeader,
  refreshOnOpenOrMode,
  refreshToken,
  startupCommand,
  terminalBg,
  terminalBgOpacity = 15,
  terminalBgColor,
  onChangeBgColor,
}: TerminalPaneProps) {
  const { status: gatewayStatus, sendRequest, onEvent } = useGateway()
  const hasBgImage = !!terminalBg
  const [showBgPicker, setShowBgPicker] = useState(false)
  const [activeId, setActiveId] = useState<number | string | null>(
    session.terminalId ?? session.remoteSessionId,
  )
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [remoteLifecycle, setRemoteLifecycle] = useState<SessionState['remoteLifecycle']>(
    session.remoteLifecycle,
  )
  const termRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const remoteWriteBufferRef = useRef('')
  const remoteFlushPromiseRef = useRef<Promise<void> | null>(null)
  const onFileOpenRef = useRef(onFileOpen)
  const wasVisibleRef = useRef(false)
  const refreshTokenRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    onFileOpenRef.current = onFileOpen
  }, [onFileOpen])

  useEffect(() => {
    if (!visible) return
    const updateViewport = () => {
      const node = containerRef.current
      const width = node?.clientWidth ?? window.innerWidth ?? 0
      const height = node?.clientHeight ?? window.innerHeight ?? 0
      setViewportSize({ width, height })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
    }
  }, [visible])

  const setRemoteState = useCallback((next: SessionState['remoteLifecycle']) => {
    session.remoteLifecycle = next
    setRemoteLifecycle(next)
  }, [])

  const isMobileTerminal = !isDesktop
  const isLandscape = viewportSize.width > viewportSize.height && viewportSize.height > 0
  const compactChrome = isMobileTerminal && isLandscape
  const terminalMetrics = useMemo(() => {
    if (!isMobileTerminal) {
      return { fontSize: 13, lineHeight: 1.4, paddingY: 8, paddingX: 12 }
    }
    if (isLandscape) {
      return { fontSize: 12, lineHeight: 1.24, paddingY: 4, paddingX: 8 }
    }
    return { fontSize: 12.5, lineHeight: 1.3, paddingY: 6, paddingX: 10 }
  }, [isLandscape, isMobileTerminal])

  const flushRemoteWrites = useCallback(async () => {
    if (remoteFlushPromiseRef.current) return remoteFlushPromiseRef.current
    const run = (async () => {
      while (
        remoteWriteBufferRef.current &&
        session.remoteSessionId &&
        gatewayStatus === 'connected'
      ) {
        const chunk = remoteWriteBufferRef.current.slice(0, 8192)
        try {
          await sendRequest('pty.write', { sessionId: session.remoteSessionId, data: chunk })
          remoteWriteBufferRef.current = remoteWriteBufferRef.current.slice(chunk.length)
          setRemoteState('connected')
        } catch {
          setRemoteState('disconnected')
          break
        }
      }
    })().finally(() => {
      remoteFlushPromiseRef.current = null
    })
    remoteFlushPromiseRef.current = run
    return run
  }, [gatewayStatus, sendRequest, setRemoteState])

  // Keyboard-first: allow global shortcuts to focus the active terminal.
  useEffect(() => {
    const handler = () => {
      if (!visible) return
      try {
        session.xterm?.focus?.()
      } catch {}
    }
    window.addEventListener('focus-terminal', handler)
    return () => window.removeEventListener('focus-terminal', handler)
  }, [visible])

  // On unmount, detach xterm from DOM but do NOT kill the PTY session.
  // The session lives in module-level state and persists across remounts.
  useEffect(() => {
    return () => {
      if (session.xterm) {
        // Detach from current DOM container without disposing
        try {
          session.xterm.element?.remove()
        } catch {}
      }
    }
  }, [])

  const listeners = useCallback(
    () => ({
      onOutput: (data: string) => {
        session.xterm?.write(data)
      },
      onExit: () => {
        setActiveId(null)
      },
    }),
    [],
  )

  useEffect(() => {
    if (isDesktop) return
    const offOutput = onEvent('pty.output', (payload) => {
      const typed = (payload ?? {}) as { sessionId?: string; data?: string }
      if (!typed.sessionId || typed.sessionId !== session.remoteSessionId) return
      if (typeof typed.data === 'string') {
        session.xterm?.write(typed.data)
      }
    })
    const offExit = onEvent('pty.exit', (payload) => {
      const typed = (payload ?? {}) as { sessionId?: string; code?: number | null }
      if (!typed.sessionId || typed.sessionId !== session.remoteSessionId) return
      session.xterm?.write('\r\n\x1b[90m[Remote process exited]\x1b[0m\r\n')
      session.remoteSessionId = null
      setRemoteState('closed')
      setActiveId(null)
    })
    return () => {
      offOutput()
      offExit()
    }
  }, [isDesktop, onEvent, setRemoteState])

  const createTerminal = useCallback(
    async (initialCommand?: string) => {
      if (isDesktop) {
        if (session.terminalId != null) {
          try {
            session.xterm?.focus?.()
          } catch {}
          if (initialCommand) {
            await tauriInvoke('write_terminal', {
              id: session.terminalId,
              data: initialCommand + '\n',
            }).catch(() => {})
          }
          return
        }

        setTerminalError(null)
        const id = await ensureSession(cwd, listeners())
        if (id == null) {
          if (!session.creating) {
            const sinceKill = Date.now() - session.lastKilledAt
            const inDebounceWindow = sinceKill < CREATE_DEBOUNCE_MS
            if (inDebounceWindow) {
              const retryIn = Math.max(50, CREATE_DEBOUNCE_MS - sinceKill)
              setTimeout(() => {
                void createTerminal(initialCommand)
              }, retryIn)
              return
            }
            setTerminalError('Terminal is unavailable outside the desktop runtime.')
          }
          return
        }
        setActiveId(id)

        if (initialCommand) {
          setTimeout(async () => {
            await tauriInvoke('write_terminal', { id, data: initialCommand + '\n' })
          }, 600)
        }
        return
      }

      setTerminalError(null)
      if (session.remoteSessionId) {
        if (initialCommand) {
          remoteWriteBufferRef.current += initialCommand + '\n'
          await flushRemoteWrites()
        }
        try {
          session.xterm?.focus?.()
        } catch {}
        return
      }

      try {
        setRemoteState('connecting')
        const res = (await sendRequest('pty.create', {
          cols: session.xterm?.cols ?? 80,
          rows: session.xterm?.rows ?? 24,
          cwd: cwd ?? undefined,
        })) as { sessionId?: string }
        const sessionId = res?.sessionId
        if (!sessionId) throw new Error('Gateway did not return a PTY session id')
        session.remoteSessionId = sessionId
        setRemoteState('connected')
        setActiveId(sessionId)
        if (initialCommand) {
          remoteWriteBufferRef.current += initialCommand + '\n'
          await flushRemoteWrites()
        }
      } catch (error) {
        setRemoteState('disconnected')
        setTerminalError(error instanceof Error ? error.message : 'Remote terminal unavailable')
      }
    },
    [isDesktop, cwd, listeners, sendRequest, flushRemoteWrites, setRemoteState],
  )

  // Initialize xterm (once per pane mount), re-use if it already exists
  useEffect(() => {
    if (!visible || !termRef.current) return
    let cancelled = false

    // If xterm already exists (HMR / remount), re-attach it to the new DOM node
    if (session.xterm) {
      const el = session.xterm.element
      if (el && termRef.current && !termRef.current.contains(el)) {
        termRef.current.appendChild(el)
        session.fit?.fit()
      }
      return
    }

    ;(async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled || !termRef.current) return
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: terminalMetrics.fontSize,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        lineHeight: terminalMetrics.lineHeight,
        letterSpacing: isMobileTerminal ? -0.1 : 0,
        scrollback: 10000,
        allowProposedApi: true,
        allowTransparency: hasBgImage,
        theme: buildXtermTheme(hasBgImage, terminalBgColor),
      })
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        const meta = e.metaKey || e.ctrlKey
        if (meta && ['l', 'p', 'j', '\\', '`', '1', '2', '3', '4', '5', '6'].includes(e.key))
          return false
        if (meta && e.shiftKey && ['p', 'f'].includes(e.key)) return false
        return true
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(termRef.current!)
      fit.fit()
      session.xterm = term
      session.fit = fit
      term.onData(async (data: string) => {
        if (session.terminalId != null) {
          await tauriInvoke('write_terminal', { id: session.terminalId, data })
          return
        }
        if (session.remoteSessionId) {
          remoteWriteBufferRef.current += data
          void flushRemoteWrites()
        }
      })

      term.registerLinkProvider({
        provideLinks(bufferLineNumber: number, callback: (links: any[] | undefined) => void) {
          const line = term.buffer.active.getLine(bufferLineNumber - 1)
          if (!line) {
            callback(undefined)
            return
          }
          const lineText = line.translateToString(true)
          const found = findFileLinksInLine(lineText)
          if (found.length === 0) {
            callback(undefined)
            return
          }

          const links = found.map((f) => ({
            range: {
              start: { x: f.startCol + 1, y: bufferLineNumber },
              end: { x: f.endCol + 1, y: bufferLineNumber },
            },
            text: f.text,
            decorations: { pointerCursor: true, underline: true },
            activate(event: MouseEvent, text: string) {
              if (!event.metaKey && !event.ctrlKey) return
              const pathOnly = text.replace(/:\d+(?::\d+)?$/, '')
              onFileOpenRef.current?.(pathOnly, f.line, f.col)
            },
          }))
          callback(links)
        },
      })
    })()
    return () => {
      cancelled = true
    }
  }, [
    visible,
    hasBgImage,
    isMobileTerminal,
    terminalBgColor,
    terminalMetrics.fontSize,
    terminalMetrics.lineHeight,
    flushRemoteWrites,
  ])

  useEffect(() => {
    const term = session.xterm
    if (!term) return
    const id = requestAnimationFrame(() => {
      term.options.fontSize = terminalMetrics.fontSize
      term.options.lineHeight = terminalMetrics.lineHeight
      term.options.letterSpacing = isMobileTerminal ? -0.1 : 0
      session.fit?.fit()
    })
    return () => cancelAnimationFrame(id)
  }, [terminalMetrics.fontSize, terminalMetrics.lineHeight, isMobileTerminal])

  // Auto-create first terminal when pane becomes ready (skip if user manually closed)
  useEffect(() => {
    if (refreshOnOpenOrMode) return
    if (!visible || !isDesktop || activeId != null || session.manualClose) return

    // Debounce: wait for HMR churn to settle
    const timer = setTimeout(
      () => {
        void createTerminal()
      },
      session.lastKilledAt > 0 ? CREATE_DEBOUNCE_MS : 0,
    )
    return () => clearTimeout(timer)
  }, [visible, activeId, createTerminal, refreshOnOpenOrMode])

  // Optional auto-refresh behavior for flaky PTY state:
  // recreate the backend session on pane-open and on mode changes.
  useEffect(() => {
    const wasVisible = wasVisibleRef.current
    const previousToken = refreshTokenRef.current
    const opened = visible && !wasVisible
    const modeChangedWhileVisible =
      visible && previousToken !== undefined && refreshToken !== previousToken
    wasVisibleRef.current = visible
    refreshTokenRef.current = refreshToken

    if (!refreshOnOpenOrMode) return
    if (!visible) return
    if (!opened && !modeChangedWhileVisible) return

    let cancelled = false
    ;(async () => {
      session.manualClose = false
      await killSession()
      if (cancelled) return
      setActiveId(null)
      const sinceKill = Date.now() - session.lastKilledAt
      const delay = Math.max(0, CREATE_DEBOUNCE_MS - sinceKill)
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      if (cancelled) return
      await createTerminal(startupCommand)
    })().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [visible, isDesktop, refreshOnOpenOrMode, refreshToken, startupCommand, createTerminal])

  useEffect(() => {
    if (!isDesktop && remoteLifecycle === 'connected' && terminalError) {
      setTerminalError(null)
    }
  }, [isDesktop, remoteLifecycle, terminalError])

  useEffect(() => {
    if (isDesktop) return
    if (gatewayStatus !== 'connected') {
      if (session.remoteSessionId) setRemoteState('disconnected')
      return
    }
    if (!session.remoteSessionId) return

    let cancelled = false
    ;(async () => {
      try {
        const res = (await sendRequest('pty.list')) as { sessions?: Array<{ sessionId?: string }> }
        const exists = Array.isArray(res?.sessions)
          ? res.sessions.some((entry) => entry?.sessionId === session.remoteSessionId)
          : false
        if (cancelled) return
        if (exists) {
          setRemoteState('connected')
          setActiveId(session.remoteSessionId)
          if (session.xterm) {
            await sendRequest('pty.resize', {
              sessionId: session.remoteSessionId,
              cols: session.xterm.cols,
              rows: session.xterm.rows,
            }).catch(() => {})
          }
          await flushRemoteWrites()
          return
        }
      } catch {
        if (cancelled) return
      }

      const lostSessionId = session.remoteSessionId
      session.remoteSessionId = null
      setActiveId(null)
      setRemoteState('disconnected')
      if (!session.manualClose && visible) {
        session.xterm?.write(
          '\r\n\x1b[90m[Connection drifted — restoring terminal session]\x1b[0m\r\n',
        )
        await createTerminal().catch(() => {})
        if (!cancelled && session.remoteSessionId) {
          setTerminalError('Previous remote session expired. Reconnected with a fresh terminal.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    isDesktop,
    gatewayStatus,
    sendRequest,
    visible,
    createTerminal,
    flushRemoteWrites,
    setRemoteState,
  ])

  // Listen for script run requests from the preview panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { name } = (e as CustomEvent).detail ?? {}
      if (!name || !isDesktop) return
      const cmd = `pnpm run ${name}`
      void createTerminal(cmd)
    }
    window.addEventListener('run-script-in-terminal', handler)
    return () => window.removeEventListener('run-script-in-terminal', handler)
  }, [isDesktop, createTerminal])

  useEffect(() => {
    const handler = (e: Event) => {
      const { command } = (e as CustomEvent).detail ?? {}
      if (!command || !isDesktop) return
      void createTerminal(command)
    }
    window.addEventListener('run-command-in-terminal', handler)
    return () => window.removeEventListener('run-command-in-terminal', handler)
  }, [createTerminal, isDesktop])

  // Reapply xterm theme when mode/theme/background changes
  useEffect(() => {
    const term = session.xterm
    if (!term) return
    const id = requestAnimationFrame(() => {
      term.options.allowTransparency = hasBgImage
      term.options.theme = buildXtermTheme(hasBgImage, terminalBgColor)
      term.options.fontSize = terminalMetrics.fontSize
      term.options.lineHeight = terminalMetrics.lineHeight
      term.options.letterSpacing = isMobileTerminal ? -0.1 : 0
      session.fit?.fit()
    })
    return () => cancelAnimationFrame(id)
  }, [
    themeVersion,
    hasBgImage,
    terminalBgColor,
    terminalMetrics.fontSize,
    terminalMetrics.lineHeight,
    isMobileTerminal,
  ])

  // Fit terminal on size or active tab change
  useEffect(() => {
    if (!visible || !session.fit) return
    const fit = () => {
      session.fit?.fit()
      if (session.terminalId != null && session.xterm) {
        const { cols, rows } = session.xterm
        tauriInvoke('resize_terminal', { id: session.terminalId, cols, rows })
      } else if (session.remoteSessionId && session.xterm && gatewayStatus === 'connected') {
        const { cols, rows } = session.xterm
        void sendRequest('pty.resize', { sessionId: session.remoteSessionId, cols, rows }).catch(
          () => {
            setRemoteState('disconnected')
          },
        )
      }
    }
    fit()
    const obs = new ResizeObserver(fit)
    if (termRef.current) obs.observe(termRef.current)
    return () => obs.disconnect()
  }, [visible, height, activeId, gatewayStatus, sendRequest, setRemoteState])

  const resetTerminal = useCallback(async () => {
    session.manualClose = true
    if (session.remoteSessionId) {
      const sessionId = session.remoteSessionId
      session.remoteSessionId = null
      setRemoteState('closed')
      await sendRequest('pty.kill', { sessionId }).catch(() => {})
    }
    await killSession()
    setActiveId(null)
    session.xterm?.clear()
  }, [sendRequest, setRemoteState])

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Header (single-terminal mode) — hidden in center/TUI mode */}
      {!hideHeader && (
        <div
          className={`flex items-center border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--sidebar-bg)_86%,transparent)] px-3 gap-1.5 shrink-0 backdrop-blur-xl ${compactChrome ? 'h-8' : 'h-10'}`}
        >
          <div className="min-w-0 flex items-center gap-2 mr-2 shrink">
            <span
              className={`font-medium text-[var(--text-secondary)] shrink-0 ${compactChrome ? 'text-[12px]' : 'text-[13px]'}`}
            >
              Terminal
            </span>
          </div>

          <div className="flex-1" />

          {activeId != null && (
            <button
              onClick={async () => {
                await resetTerminal()
                session.manualClose = false
                void createTerminal()
              }}
              className="ml-1 p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--color-deletions)] transition-colors shrink-0"
              title="Restart terminal"
            >
              <Icon icon="lucide:rotate-ccw" width={13} height={13} />
            </button>
          )}

          {onChangeBgColor && (
            <div className="relative">
              <button
                onClick={() => setShowBgPicker((v) => !v)}
                className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                title="Terminal background color"
              >
                <Icon icon="lucide:palette" width={13} height={13} />
              </button>
              {showBgPicker && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[99]"
                    onClick={() => setShowBgPicker(false)}
                    aria-label="Close picker"
                  />
                  <div className="absolute right-0 top-full mt-1 z-[100] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl p-3 w-[200px]">
                    <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                      Background
                    </p>
                    <div className="grid grid-cols-6 gap-1.5 mb-2">
                      {[
                        '#000000',
                        '#0a0a0a',
                        '#1a1a2e',
                        '#0d1117',
                        '#1e1e2e',
                        '#2d1b2e',
                        '#0b132b',
                        '#1b2a1b',
                        '#2a1a0b',
                        '#1a0a0a',
                        '#0a1a2a',
                        '#2a2a1a',
                      ].map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            onChangeBgColor(c)
                            setShowBgPicker(false)
                          }}
                          className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${terminalBgColor === c ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : 'border-[var(--border)]'}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={terminalBgColor || '#000000'}
                        onChange={(e) => onChangeBgColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-[var(--border)] bg-transparent p-0"
                        title="Custom color"
                      />
                      <span className="text-[10px] text-[var(--text-disabled)] font-mono flex-1">
                        {terminalBgColor || '#000000'}
                      </span>
                      {terminalBgColor && (
                        <button
                          onClick={() => {
                            onChangeBgColor(null)
                            setShowBgPicker(false)
                          }}
                          className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {onToggleFloating && (
            <button
              onClick={onToggleFloating}
              className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
              title={floating ? 'Dock terminal' : 'Float terminal'}
            >
              <Icon icon={floating ? 'lucide:pin' : 'lucide:app-window'} width={13} height={13} />
            </button>
          )}
        </div>
      )}

      {/* Terminal viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ backgroundColor: hasBgImage ? undefined : terminalBgColor || '#000000' }}
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
                backgroundColor: `color-mix(in srgb, var(--bg) ${terminalBgOpacity}%, transparent)`,
              }}
            />
          </>
        )}
        <div className={`w-full h-full relative ${compactChrome ? 'p-1.5' : 'p-2'}`}>
          <div
            ref={termRef}
            className="terminal-container w-full h-full overflow-hidden rounded-[18px] border border-white/6 bg-[color-mix(in_srgb,black_82%,transparent)] shadow-[0_20px_48px_rgba(0,0,0,0.22)]"
            style={
              {
                '--terminal-pad-y': `${terminalMetrics.paddingY}px`,
                '--terminal-pad-x': `${terminalMetrics.paddingX}px`,
              } as React.CSSProperties
            }
          />
          {terminalError && (
            <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-end">
              <div className="max-w-[85%] rounded-2xl border border-[color-mix(in_srgb,var(--color-warnings)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-warnings)_12%,black)] px-3 py-2 text-[11px] leading-4 text-[color-mix(in_srgb,white_90%,var(--color-warnings))] shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-md">
                {terminalError}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Terminal Panel (host for 1 or 2 panes) ───────────────────────────────

export function TerminalPanel({
  visible,
  height,
  onHeightChange,
  floating,
  onToggleFloating,
  forceGatewayFallback,
  refreshOnOpenOrMode,
  refreshToken,
  startupCommand,
}: TerminalPanelProps) {
  const {
    version: themeVersion,
    terminalBg,
    terminalBgOpacity,
    terminalBgColor,
    setTerminalBgColor,
  } = useTheme()
  const local = useLocal()
  const [isDesktop] = useState(() => isTauri() && !isIOSTauri())
  const resizing = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)
  const canUseNativeTerminal = isDesktop && !forceGatewayFallback

  const handleFileOpen = useCallback((path: string, line?: number) => {
    emit('file-select', { path })
    if (line != null) {
      setTimeout(() => {
        emit('editor-navigate', { startLine: line })
      }, 200)
    }
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizing.current = true
      startY.current = e.clientY
      startH.current = height
      const onMove = (ev: MouseEvent) => {
        if (!resizing.current) return
        const delta = startY.current - ev.clientY
        const newH = Math.max(120, Math.min(600, startH.current + delta))
        onHeightChange(newH)
      }
      const onUp = () => {
        resizing.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [height, onHeightChange],
  )

  const isCenter = height >= 9000 // TUI center mode — fill parent flex

  return (
    <div
      className={`flex flex-col ${isCenter ? 'flex-1' : 'border-t border-[var(--border)]'} ${visible ? '' : 'hidden'}`}
      style={isCenter ? undefined : { height: `${height}px`, minHeight: 120 }}
    >
      {/* Resize handle — hidden in center mode */}
      {!isCenter && (
        <div
          onMouseDown={onMouseDown}
          className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors shrink-0"
        />
      )}

      {/* Pane area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <TerminalPane
          visible={visible}
          height={height}
          isDesktop={canUseNativeTerminal}
          themeVersion={themeVersion}
          floating={floating}
          onToggleFloating={isCenter ? undefined : onToggleFloating}
          cwd={local.localMode ? local.rootPath : null}
          onFileOpen={handleFileOpen}
          hideHeader={isCenter}
          refreshOnOpenOrMode={refreshOnOpenOrMode}
          refreshToken={refreshToken}
          startupCommand={startupCommand}
          terminalBg={terminalBg}
          terminalBgOpacity={terminalBgOpacity}
          terminalBgColor={terminalBgColor}
          onChangeBgColor={setTerminalBgColor}
        />
      </div>
    </div>
  )
}
