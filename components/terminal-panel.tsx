'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { isTauri, tauriInvoke, tauriListen } from '@/lib/tauri'
import { useTheme } from '@/context/theme-context'
import { useLocal } from '@/context/local-context'
import '@xterm/xterm/css/xterm.css'

const MAX_TERMINALS = 3

interface TerminalTab {
  id: number
  label: string
}

interface TerminalPanelProps {
  visible: boolean
  height: number
  onHeightChange: (h: number) => void
  floating?: boolean
  onToggleFloating?: () => void
}

// Common file extensions used to identify file paths in terminal output
const FILE_EXT_PATTERN = '(?:tsx?|jsx?|mjs|cjs|json|md|mdx|css|scss|html|xml|yaml|yml|py|rs|go|rb|sh|bash|zsh|sql|graphql|toml|lock|txt|cfg|ini|env|svg|vue|svelte|astro|prisma|mdc)'

// Matches patterns like:
//   ./path/to/file.ts
//   path/to/file.ts:42
//   path/to/file.ts:42:10
//   /absolute/path/file.ts
//   ./src/components/Foo.tsx(10,5)   (TS-style)
const FILE_PATH_REGEX = new RegExp(
  `(?:^|\\s|\\(|'|"|=)` +                  // preceded by whitespace, quote, paren, etc.
  `(` +                                      // capture group 1: full path with line/col
    `\\.{0,2}/[\\w./@-]+\\.${FILE_EXT_PATTERN}` +  // relative or absolute path
    `(?::(\\d+)(?::(\\d+))?)?` +             // optional :line and :col
    `|` +
    `[\\w./@-]+\\.${FILE_EXT_PATTERN}` +     // bare file (no leading ./)
    `(?::(\\d+)(?::(\\d+))?)?` +             // optional :line and :col
  `)`,
  'g'
)

function findFileLinksInLine(lineText: string): Array<{ text: string; startCol: number; endCol: number; line?: number; col?: number }> {
  const results: Array<{ text: string; startCol: number; endCol: number; line?: number; col?: number }> = []
  const regex = new RegExp(FILE_PATH_REGEX.source, FILE_PATH_REGEX.flags)
  let match: RegExpExecArray | null
  while ((match = regex.exec(lineText)) !== null) {
    const fullMatch = match[1]
    if (!fullMatch) continue
    // Extract just the file path (without :line:col)
    const pathOnly = fullMatch.replace(/:\d+(?::\d+)?$/, '')
    // Skip things that look like URLs (http://, https://, etc.)
    if (/^https?:\/\//i.test(pathOnly)) continue
    // Skip if it looks like a version number (e.g. 1.2.3)
    if (/^\d+\.\d+\.\d+/.test(pathOnly)) continue

    const lineNum = match[2] ? parseInt(match[2], 10) : (match[4] ? parseInt(match[4], 10) : undefined)
    const colNum = match[3] ? parseInt(match[3], 10) : (match[5] ? parseInt(match[5], 10) : undefined)

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

function buildXtermTheme() {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  const dark = document.documentElement.classList.contains('dark')
  return {
    background: v('--bg') || (dark ? '#0a0a0a' : '#fafafa'),
    foreground: v('--text-primary') || (dark ? '#e5e5e5' : '#171717'),
    cursor: v('--brand') || '#a855f7',
    cursorAccent: v('--bg') || (dark ? '#0a0a0a' : '#fafafa'),
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

// ─── Single Terminal Pane ──────────────────────────────────────────────────

interface TerminalPaneProps {
  visible: boolean
  height: number
  isDesktop: boolean
  themeVersion: number
  floating?: boolean
  onToggleFloating?: () => void
  showSplitButton: boolean
  onSplit: () => void
  onClose?: () => void
  cwd?: string | null
  onFileOpen?: (path: string, line?: number, col?: number) => void
}

function TerminalPane({
  visible,
  height,
  isDesktop,
  themeVersion,
  floating,
  onToggleFloating,
  showSplitButton,
  onSplit,
  onClose,
  cwd,
  onFileOpen,
}: TerminalPaneProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const manualCloseAll = useRef(false)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitRef = useRef<any>(null)
  const activeTabRef = useRef<number | null>(null)
  const tabsRef = useRef<TerminalTab[]>([])
  const onFileOpenRef = useRef(onFileOpen)
  const exitUnlisteners = useRef<Map<number, () => void>>(new Map())

  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { onFileOpenRef.current = onFileOpen }, [onFileOpen])

  // Keyboard-first: allow global shortcuts to focus the active terminal.
  useEffect(() => {
    const handler = () => {
      if (!visible) return
      try { xtermRef.current?.focus?.() } catch {}
    }
    window.addEventListener('focus-terminal', handler)
    return () => window.removeEventListener('focus-terminal', handler)
  }, [visible])

  // Kill all PTY sessions and dispose xterm on unmount
  useEffect(() => {
    return () => {
      for (const tab of tabsRef.current) {
        tauriInvoke('kill_terminal', { id: tab.id }).catch(() => {})
      }
      for (const unsub of exitUnlisteners.current.values()) unsub()
      exitUnlisteners.current.clear()
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [])

  const createTerminal = useCallback(async (label?: string, initialCommand?: string) => {
    if (!isDesktop) return
    // Enforce max terminal limit
    if (tabsRef.current.length >= MAX_TERMINALS) {
      setTerminalError(`Maximum of ${MAX_TERMINALS} terminals allowed. Close one first.`)
      return
    }
    manualCloseAll.current = false
    try {
      setTerminalError(null)
      const id = await tauriInvoke<number>('create_terminal', { cols: 80, rows: 24, cwd: cwd ?? undefined })
      if (id == null) {
        setTerminalError('Terminal is unavailable outside the desktop runtime.')
        return
      }
      const tab: TerminalTab = { id, label: label ?? `Terminal ${id}` }
      setTabs(prev => [...prev, tab])
      setActiveTab(id)

      // Listen for this terminal's exit event so it auto-closes
      const unlistenExit = await tauriListen<{ id: number; code: number }>(`terminal-exit-${id}`, (payload) => {
        if (activeTabRef.current === payload.id) {
          xtermRef.current?.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
        }
        setTimeout(() => {
          exitUnlisteners.current.get(payload.id)?.()
          exitUnlisteners.current.delete(payload.id)
          setTabs(prev => {
            const next = prev.filter(t => t.id !== payload.id)
            if (activeTabRef.current === payload.id) {
              setActiveTab(next.length > 0 ? next[next.length - 1].id : null)
            }
            return next
          })
        }, 800)
      })
      exitUnlisteners.current.set(id, unlistenExit)

      if (initialCommand) {
        setTimeout(async () => {
          await tauriInvoke('write_terminal', { id, data: initialCommand + '\n' })
        }, 600)
      }
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Failed to create terminal session')
    }
  }, [isDesktop, cwd])

  // Initialize xterm (once per pane mount)
  useEffect(() => {
    if (!visible || !termRef.current || xtermRef.current) return
    let cancelled = false
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
        theme: buildXtermTheme(),
      })
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        const meta = e.metaKey || e.ctrlKey
        if (meta && ['l','p','j','\\','`','1','2','3','4','5','6'].includes(e.key)) return false
        if (meta && e.shiftKey && ['p','f'].includes(e.key)) return false
        return true
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(termRef.current!)
      fit.fit()
      xtermRef.current = term
      fitRef.current = fit
      term.onData(async (data: string) => {
        if (activeTabRef.current != null) {
          await tauriInvoke('write_terminal', { id: activeTabRef.current, data })
        }
      })

      // Register file path link provider for Cmd+Click / Ctrl+Click navigation
      term.registerLinkProvider({
        provideLinks(bufferLineNumber: number, callback: (links: any[] | undefined) => void) {
          const line = term.buffer.active.getLine(bufferLineNumber - 1)
          if (!line) { callback(undefined); return }
          const lineText = line.translateToString(true)
          const found = findFileLinksInLine(lineText)
          if (found.length === 0) { callback(undefined); return }

          const links = found.map(f => ({
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
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Auto-create first terminal when pane becomes ready (skip if user closed all)
  useEffect(() => {
    if (!visible || !isDesktop || tabs.length > 0 || manualCloseAll.current) return
    void createTerminal()
  }, [visible, isDesktop, tabs.length, createTerminal])

  // Listen for script run requests from the preview panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { name, cwd: scriptCwd } = (e as CustomEvent).detail ?? {}
      if (!name || !isDesktop) return
      const cmd = `pnpm run ${name}`
      void createTerminal(name, cmd)
    }
    window.addEventListener('run-script-in-terminal', handler)
    return () => window.removeEventListener('run-script-in-terminal', handler)
  }, [isDesktop, createTerminal])

  // Subscribe to PTY output for the active tab
  useEffect(() => {
    if (activeTab == null || !xtermRef.current) return
    let unlisten: (() => void) | null = null
    ;(async () => {
      unlisten = await tauriListen<{ data: string }>(`terminal-output-${activeTab}`, (payload) => {
        xtermRef.current?.write(payload.data)
      })
    })()
    xtermRef.current.clear()
    xtermRef.current.focus()
    return () => { unlisten?.() }
  }, [activeTab])

  // Reapply xterm theme when mode/theme changes
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return
    const id = requestAnimationFrame(() => { term.options.theme = buildXtermTheme() })
    return () => cancelAnimationFrame(id)
  }, [themeVersion])

  // Fit terminal on size or active tab change
  useEffect(() => {
    if (!visible || !fitRef.current) return
    const fit = () => {
      fitRef.current?.fit()
      if (activeTab != null && xtermRef.current) {
        const { cols, rows } = xtermRef.current
        tauriInvoke('resize_terminal', { id: activeTab, cols, rows })
      }
    }
    fit()
    const obs = new ResizeObserver(fit)
    if (termRef.current) obs.observe(termRef.current)
    return () => obs.disconnect()
  }, [visible, height, activeTab])

  const closeTab = useCallback(async (id: number) => {
    exitUnlisteners.current.get(id)?.()
    exitUnlisteners.current.delete(id)
    await tauriInvoke('kill_terminal', { id })
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTab === id) setActiveTab(next.length > 0 ? next[next.length - 1].id : null)
      return next
    })
  }, [activeTab])

  const closeAllTabs = useCallback(async () => {
    manualCloseAll.current = true
    const current = tabsRef.current
    for (const unsub of exitUnlisteners.current.values()) unsub()
    exitUnlisteners.current.clear()
    await Promise.all(current.map(t => tauriInvoke('kill_terminal', { id: t.id }).catch(() => {})))
    setTabs([])
    setActiveTab(null)
    xtermRef.current?.clear()
  }, [])

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center h-9 bg-[var(--bg-secondary)] border-b border-[var(--border)] px-2 gap-1 shrink-0 overflow-x-auto">
        <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mr-2 shrink-0">
          Terminal
        </span>

        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] transition-colors shrink-0
              ${activeTab === tab.id
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <Icon
              icon={tab.label === 'Gateway Engine' ? 'lucide:cpu' : 'lucide:terminal'}
              width={12}
              height={12}
              className={tab.label === 'Gateway Engine' ? 'text-[var(--brand)]' : ''}
            />
            <span>{tab.label}</span>
            <span
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              className="ml-1 hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Icon icon="lucide:x" width={12} height={12} />
            </span>
          </button>
        ))}

        {isDesktop && (
          <>
            <button
              onClick={() => createTerminal()}
              disabled={tabs.length >= MAX_TERMINALS}
              className="ml-1 p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              title={tabs.length >= MAX_TERMINALS ? `Max ${MAX_TERMINALS} terminals` : "New Terminal"}
            >
              <Icon icon="lucide:plus" width={14} height={14} />
            </button>
            <button
              onClick={() => createTerminal('Gateway Engine', 'openclaw logs')}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--brand)] transition-colors shrink-0"
              title="Open Gateway Engine logs"
            >
              <Icon icon="lucide:cpu" width={13} height={13} />
            </button>
          </>
        )}

        {tabs.length > 0 && (
          <button
            onClick={closeAllTabs}
            className="ml-1 p-1 rounded hover:bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)] text-[var(--text-secondary)] hover:text-[var(--color-deletions)] transition-colors shrink-0"
            title="Close all terminals"
          >
            <Icon icon="lucide:trash-2" width={13} height={13} />
          </button>
        )}

        <div className="flex-1" />

        {onToggleFloating && (
          <button
            onClick={onToggleFloating}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            title={floating ? 'Dock terminal' : 'Float terminal'}
          >
            <Icon icon={floating ? 'lucide:pin' : 'lucide:app-window'} width={13} height={13} />
          </button>
        )}

        {showSplitButton && (
          <button
            onClick={onSplit}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            title="Split terminal"
          >
            <Icon icon="lucide:panel-right" width={13} height={13} />
          </button>
        )}

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            title="Close pane"
          >
            <Icon icon="lucide:x" width={13} height={13} />
          </button>
        )}

        <span className="text-[10px] text-[var(--text-tertiary)] font-mono ml-1 shrink-0">
          {isDesktop ? 'PTY' : 'web'}
        </span>
      </div>

      {/* Terminal viewport */}
      <div className="flex-1 overflow-hidden bg-[var(--bg)]">
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
                Run <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--brand)]">pnpm tauri:dev</code> for native terminal
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Terminal Panel (host for 1 or 2 panes) ───────────────────────────────

export function TerminalPanel({ visible, height, onHeightChange, floating, onToggleFloating }: TerminalPanelProps) {
  const { version: themeVersion } = useTheme()
  const local = useLocal()
  const [splitEnabled, setSplitEnabled] = useState(() => {
    try { return localStorage.getItem('code-editor:terminal-split') === 'true' } catch { return false }
  })
  const [isDesktop, setIsDesktop] = useState(false)
  const resizing = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  useEffect(() => { setIsDesktop(isTauri()) }, [])
  useEffect(() => {
    try { localStorage.setItem('code-editor:terminal-split', String(splitEnabled)) } catch {}
  }, [splitEnabled])

  const handleFileOpen = useCallback((path: string, line?: number) => {
    window.dispatchEvent(new CustomEvent('file-select', { detail: { path } }))
    if (line != null) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('editor-navigate', { detail: { startLine: line } }))
      }, 200)
    }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
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
  }, [height, onHeightChange])

  return (
    <div
      className={`flex flex-col border-t border-[var(--border)] ${visible ? '' : 'hidden'}`}
      style={{ height: `${height}px`, minHeight: 120 }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors shrink-0"
      />

      {/* Pane area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <TerminalPane
          visible={visible}
          height={height}
          isDesktop={isDesktop}
          themeVersion={themeVersion}
          floating={floating}
          onToggleFloating={onToggleFloating}
          showSplitButton={!splitEnabled}
          onSplit={() => setSplitEnabled(true)}
          cwd={local.localMode ? local.rootPath : null}
          onFileOpen={handleFileOpen}
        />

        {splitEnabled && (
          <>
            <div className="w-px bg-[var(--border)] shrink-0" />
            <TerminalPane
              visible={visible}
              height={height}
              isDesktop={isDesktop}
              themeVersion={themeVersion}
              floating={floating}
              onToggleFloating={onToggleFloating}
              showSplitButton={false}
              onSplit={() => {}}
              onClose={() => setSplitEnabled(false)}
              cwd={local.localMode ? local.rootPath : null}
              onFileOpen={handleFileOpen}
            />
          </>
        )}
      </div>
    </div>
  )
}
