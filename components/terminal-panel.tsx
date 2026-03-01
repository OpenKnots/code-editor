'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { isTauri, tauriInvoke, tauriListen } from '@/lib/tauri'
import { useTheme } from '@/context/theme-context'
import '@xterm/xterm/css/xterm.css'

interface TerminalTab {
  id: number
  label: string
  alive: boolean
}

interface TerminalPanelProps {
  visible: boolean
  height: number
  onHeightChange: (h: number) => void
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

export function TerminalPanel({ visible, height, onHeightChange }: TerminalPanelProps) {
  const { version: themeVersion } = useTheme()
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)     // Terminal instance
  const fitRef = useRef<any>(null)       // FitAddon instance
  const resizing = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  // Detect Tauri on mount (client-side only)
  useEffect(() => { setIsDesktop(isTauri()) }, [])

  // Create a new terminal session
  const createTerminal = useCallback(async () => {
    if (!isDesktop) return

    try {
      setTerminalError(null)
      const id = await tauriInvoke<number>('create_terminal', {
        cols: 80,
        rows: 24,
      })
      if (id == null) {
        setTerminalError('Terminal is unavailable outside the desktop runtime.')
        return
      }

      const tab: TerminalTab = { id, label: `Terminal ${id}`, alive: true }
      setTabs(prev => [...prev, tab])
      setActiveTab(id)
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Failed to create terminal session')
    }
  }, [isDesktop])

  // Initialize xterm.js (once)
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

      const fit = new FitAddon()
      term.loadAddon(fit)

      term.open(termRef.current!)
      fit.fit()

      xtermRef.current = term
      fitRef.current = fit

      // Handle user input → send to PTY
      term.onData(async (data: string) => {
        if (activeTabRef.current != null) {
          await tauriInvoke('write_terminal', { id: activeTabRef.current, data })
        }
      })

    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Ensure first terminal exists when panel opens in desktop mode.
  useEffect(() => {
    if (!visible || !isDesktop || tabs.length > 0) return
    void createTerminal()
  }, [visible, isDesktop, tabs.length, createTerminal])

  // Ref for activeTab (used inside xterm onData callback)
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  // Listen for PTY output from active tab
  useEffect(() => {
    if (activeTab == null || !xtermRef.current) return

    let unlisten: (() => void) | null = null
    let unlistenExit: (() => void) | null = null

    ;(async () => {
      unlisten = await tauriListen<{ data: string }>(`terminal-output-${activeTab}`, (payload) => {
        xtermRef.current?.write(payload.data)
      })
      unlistenExit = await tauriListen<{ id: number }>(`terminal-exit-${activeTab}`, (payload) => {
        setTabs(prev => prev.map(t => t.id === payload.id ? { ...t, alive: false } : t))
        xtermRef.current?.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
      })
    })()

    // Clear and focus terminal on tab switch
    xtermRef.current.clear()
    xtermRef.current.focus()

    return () => {
      unlisten?.()
      unlistenExit?.()
    }
  }, [activeTab])

  // Reapply xterm theme live when mode/theme changes
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return
    const id = requestAnimationFrame(() => {
      term.options.theme = buildXtermTheme()
    })
    return () => cancelAnimationFrame(id)
  }, [themeVersion])

  // Fit on resize
  useEffect(() => {
    if (!visible || !fitRef.current) return

    const fit = () => {
      fitRef.current?.fit()
      // Notify PTY of new size
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

  // Vertical resize handle
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

  // Close a terminal tab
  const closeTab = useCallback(async (id: number) => {
    await tauriInvoke('kill_terminal', { id })
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTab === id) {
        setActiveTab(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeTab])

  if (!visible) return null

  return (
    <div
      className="flex flex-col border-t border-[var(--border)]"
      style={{ height: `${height}px`, minHeight: 120 }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors shrink-0"
      />

      {/* Tab bar */}
      <div className="flex items-center h-9 bg-[var(--bg-secondary)] border-b border-[var(--border)] px-2 gap-1 shrink-0">
        <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mr-2">
          Terminal
        </span>

        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] transition-colors
              ${activeTab === tab.id
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }
              ${!tab.alive ? 'opacity-50' : ''}
            `}
          >
            <Icon icon="lucide:terminal" width={12} height={12} />
            <span>{tab.label}</span>
            <span
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              className="ml-1 hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Icon icon="lucide:x" width={10} height={10} />
            </span>
          </button>
        ))}

        {/* New terminal button */}
        {isDesktop && (
          <button
            onClick={createTerminal}
            className="ml-1 p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="New Terminal"
          >
            <Icon icon="lucide:plus" width={14} height={14} />
          </button>
        )}

        {/* Spacer + close */}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
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
