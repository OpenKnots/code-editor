'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { isTauri, tauriInvoke, tauriListen } from '@/lib/tauri'
import { useTheme } from '@/context/theme-context'
import { useLocal } from '@/context/local-context'
import { emit } from '@/lib/events'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  visible: boolean
  height: number
  onHeightChange: (h: number) => void
  floating?: boolean
  onToggleFloating?: () => void
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

function buildXtermTheme(hasBgImage?: boolean) {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  const dark = document.documentElement.classList.contains('dark')
  return {
    background: hasBgImage ? 'transparent' : SOLID_TERMINAL_BG,
    foreground: hasBgImage ? v('--text-primary') || (dark ? '#e5e5e5' : '#171717') : SOLID_TERMINAL_FG,
    cursor: v('--brand') || '#a855f7',
    cursorAccent: hasBgImage ? 'transparent' : SOLID_TERMINAL_BG,
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
  if (prev?.terminalId != null) {
    session.terminalId = prev.terminalId
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
}: TerminalPaneProps) {
  const hasBgImage = !!terminalBg
  const [activeId, setActiveId] = useState<number | null>(session.terminalId)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const onFileOpenRef = useRef(onFileOpen)
  const wasVisibleRef = useRef(false)
  const refreshTokenRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    onFileOpenRef.current = onFileOpen
  }, [onFileOpen])

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

  const createTerminal = useCallback(
    async (initialCommand?: string) => {
      if (!isDesktop) return
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
    },
    [isDesktop, cwd, listeners],
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
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        lineHeight: 1.4,
        scrollback: 10000,
        allowProposedApi: true,
        allowTransparency: hasBgImage,
        theme: buildXtermTheme(hasBgImage),
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
  }, [visible])

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
  }, [visible, isDesktop, activeId, createTerminal, refreshOnOpenOrMode])

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
    if (!isDesktop || !visible) return
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
      term.options.theme = buildXtermTheme(hasBgImage)
    })
    return () => cancelAnimationFrame(id)
  }, [themeVersion, hasBgImage])

  // Fit terminal on size or active tab change
  useEffect(() => {
    if (!visible || !session.fit) return
    const fit = () => {
      session.fit?.fit()
      if (session.terminalId != null && session.xterm) {
        const { cols, rows } = session.xterm
        tauriInvoke('resize_terminal', { id: session.terminalId, cols, rows })
      }
    }
    fit()
    const obs = new ResizeObserver(fit)
    if (termRef.current) obs.observe(termRef.current)
    return () => obs.disconnect()
  }, [visible, height, activeId])

  const resetTerminal = useCallback(async () => {
    session.manualClose = true
    await killSession()
    setActiveId(null)
    session.xterm?.clear()
  }, [])

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Header (single-terminal mode) — hidden in center/TUI mode */}
      {!hideHeader && (
        <div className="flex items-center h-9 bg-[var(--bg-secondary)] border-b border-[var(--border)] px-2 gap-1 shrink-0">
          <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mr-2 shrink-0">
            Terminal
          </span>

          <div className="flex-1" />

          {activeId != null && (
            <button
              onClick={async () => {
                await resetTerminal()
                session.manualClose = false
                void createTerminal()
              }}
              className="ml-1 p-1 rounded hover:bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)] text-[var(--text-secondary)] hover:text-[var(--color-deletions)] transition-colors shrink-0"
              title="Restart terminal"
            >
              <Icon icon="lucide:rotate-ccw" width={13} height={13} />
            </button>
          )}

          {onToggleFloating && (
            <button
              onClick={onToggleFloating}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
              title={floating ? 'Dock terminal' : 'Float terminal'}
            >
              <Icon icon={floating ? 'lucide:pin' : 'lucide:app-window'} width={13} height={13} />
            </button>
          )}
        </div>
      )}

      {/* Terminal viewport */}
      <div className={`flex-1 overflow-hidden relative ${hasBgImage ? '' : 'bg-black'}`}>
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
        {isDesktop ? (
          <div className="w-full h-full p-2 relative">
            <div ref={termRef} className="w-full h-full" />
            {terminalError && (
              <div className="absolute right-2 top-2 max-w-[70%] rounded border border-[color-mix(in_srgb,var(--color-deletions)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] px-2 py-1 text-[11px] text-[var(--color-deletions)]">
                {terminalError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
            <div className="text-center space-y-2">
              <Icon icon="lucide:terminal" width={32} height={32} className="mx-auto opacity-40" />
              <p>Terminal available in the desktop app</p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Run{' '}
                <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--brand)]">
                  pnpm desktop:dev
                </code>{' '}
                for native terminal
              </p>
            </div>
          </div>
        )}
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
  refreshOnOpenOrMode,
  refreshToken,
  startupCommand,
}: TerminalPanelProps) {
  const { version: themeVersion, terminalBg, terminalBgOpacity } = useTheme()
  const local = useLocal()
  const [isDesktop, setIsDesktop] = useState(false)
  const resizing = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

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
          isDesktop={isDesktop}
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
        />
      </div>
    </div>
  )
}
