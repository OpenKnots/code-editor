'use client'

import { useEffect, useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useAuth } from '@workos-inc/authkit-nextjs/components'
import { useGateway } from '@/context/gateway-context'
import { useRepo } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { useLocal, getRecentFolders } from '@/context/local-context'
import { GitHubAuthBadge } from '@/components/github-auth'
import { FileExplorer } from '@/components/file-explorer'
import { EditorTabs } from '@/components/editor-tabs'
import { CodeEditor } from '@/components/code-editor'
import { AgentPanel } from '@/components/agent-panel'
import { RepoSelector } from '@/components/repo-selector'
import { SourceSwitcher } from '@/components/source-switcher'
import { ResizeHandle } from '@/components/resize-handle'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { QuickOpen } from '@/components/quick-open'
import { ShortcutsOverlay } from '@/components/shortcuts-overlay'
import { CommandPalette, type CommandId } from '@/components/command-palette'
import { fetchFileContents, createOrUpdateFile, commitFiles } from '@/lib/github-client'
import { TerminalPanel } from '@/components/terminal-panel'
import { ChangesPanel } from '@/components/changes-panel'
import Landing from '@/components/landing'
import { EnginePanel } from '@/components/engine-panel'

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
}

function getMediaMeta(path: string): { kind: 'image' | 'video' | 'audio'; mimeType: string } | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const imageMime = IMAGE_MIME_BY_EXT[ext]
  if (imageMime) return { kind: 'image', mimeType: imageMime }
  const videoMime = VIDEO_MIME_BY_EXT[ext]
  if (videoMime) return { kind: 'video', mimeType: videoMime }
  const audioMime = AUDIO_MIME_BY_EXT[ext]
  if (audioMime) return { kind: 'audio', mimeType: audioMime }
  return null
}

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64.replace(/\n/g, '')}`
}

// ─── Access Gate ────────────────────────────────────────────────

type AccessStatus =
  | { state: 'loading' }
  | { state: 'ok' }
  | { state: 'error'; message: string }

function SponsorGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth()
  const [access, setAccess] = useState<AccessStatus>({ state: 'loading' })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (authLoading || !user) return
    setAccess({ state: 'loading' })

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/check-sponsor')
        if (cancelled) return
        if (res.ok) {
          setAccess({ state: 'ok' })
        } else {
          const data = await res.json() as { message?: string }
          setAccess({
            state: 'error',
            message: data.message ?? 'Access verification failed.',
          })
        }
      } catch {
        if (!cancelled) {
          setAccess({ state: 'error', message: 'Could not verify access. Please try again.' })
        }
      }
    })()
    return () => { cancelled = true }
  }, [user, authLoading, retryCount])

  if (authLoading || access.state === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg)]">
        <div className="flex items-center gap-3 text-[var(--text-tertiary)]">
          <Icon icon="lucide:loader-2" width={18} height={18} className="animate-spin" />
          <span className="text-sm">Verifying access…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center space-y-3 text-[var(--text-tertiary)]">
          <p className="text-sm">You need to sign in to continue.</p>
          <a href="/callback" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--brand)] text-white hover:opacity-90 transition-opacity">
            Sign In
          </a>
        </div>
      </div>
    )
  }

  if (access?.state === 'error') {
    return (
      <div className="h-full overflow-hidden flex items-center justify-center px-4 bg-[var(--bg)]">
        <div className="w-full max-w-[420px] space-y-5 animate-fade-in-up">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand)] to-transparent opacity-40" />

            <div className="text-center mb-6">
              <div className="relative w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-gradient-to-br from-[var(--brand)] to-[color-mix(in_srgb,var(--brand)_80%,#000)] shadow-lg">
                <Icon icon="lucide:lock" width={22} height={22} className="text-white" />
                <div className="absolute -inset-1 rounded-xl bg-[var(--brand)] opacity-15 blur-md" />
              </div>

              <h1 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                Pro Access Required
              </h1>
              <p className="text-sm mt-2 text-[var(--text-tertiary)] leading-relaxed">
                {access.message}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setRetryCount(c => c + 1)}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Retry
              </button>

              <button
                onClick={() => signOut()}
                className="w-full py-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-[var(--text-tertiary)]">
              Signed in as <span className="text-[var(--text-secondary)]">{user.email}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// ─── Editor Layout ──────────────────────────────────────────────

const EXPLORER_MIN = 160
const EXPLORER_MAX = 480
const AGENT_MIN = 260
const AGENT_MAX = 600

function EditorLayout() {
  const { repo } = useRepo()
  const { files, activeFile, openFile, closeFile, getFile, markClean } = useEditor()
  const { status } = useGateway()
  const local = useLocal()
  const [explorerWidth, setExplorerWidth] = useState(240)
  const [agentWidth, setAgentWidth] = useState(360)
  const [agentOpen, setAgentOpen] = useState(false)
  const [explorerVisible, setExplorerVisible] = useState(true)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [changesVisible, setChangesVisible] = useState(false)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(260)
  const [engineVisible, setEngineVisible] = useState(false)
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)

  const dirtyCount = files.filter(f => f.dirty).length

  const saveActiveFile = useCallback(async () => {
    if (!repo || !activeFile) return
    const file = getFile(activeFile)
    if (!file || file.kind !== 'text' || !file.dirty) return
    try {
      const { sha } = await createOrUpdateFile(repo.fullName, file.path, {
        content: file.content,
        message: `Update ${file.path}`,
        sha: file.sha,
        branch: repo.branch,
      })
      markClean(file.path, sha)
    } catch (err) {
      console.error('Failed to save file:', err)
    }
  }, [repo, activeFile, getFile, markClean])

  // Handle native menu actions from Tauri
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as Record<string, unknown>
    if (!w.__TAURI_INTERNALS__ && !w.__TAURI__) return

    let unlisten: (() => void) | null = null
    ;(async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<string>('menu-action', (event) => {
        switch (event.payload) {
          case 'save': {
            const active = files.find(f => f.path === activeFile)
            if (active?.dirty) {
              window.dispatchEvent(new CustomEvent('save-file', { detail: { path: active.path } }))
            }
            break
          }
          case 'save-all':
            files.filter(f => f.dirty).forEach(f => {
              window.dispatchEvent(new CustomEvent('save-file', { detail: { path: f.path } }))
            })
            break
          case 'close-tab':
            if (activeFile) closeFile(activeFile)
            break
          case 'toggle-explorer':
            setExplorerVisible(v => !v)
            break
          case 'toggle-agent':
            setAgentOpen(v => !v)
            break
          case 'toggle-terminal':
            setTerminalVisible(v => !v)
            break
          case 'toggle-engine':
            setEngineVisible(v => !v)
            break
          case 'quick-open':
            setQuickOpenVisible(v => !v)
            break
          case 'open-docs':
            window.open('https://github.com/OpenKnots/code-editor/tree/main/docs', '_blank')
            break
        }
      })
    })()

    return () => { unlisten?.() }
  }, [files, activeFile])

  // Handle save-file events (⌘S or Save button)
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path } = (e as CustomEvent).detail
      if (!repo) return
      const file = files.find(f => f.path === path)
      if (!file || file.kind !== 'text' || !file.dirty) return
      try {
        const { sha } = await createOrUpdateFile(repo.fullName, file.path, {
          content: file.content,
          message: `Update ${path}`,
          sha: file.sha,
          branch: repo.branch,
        })
        markClean(path, sha)
      } catch (err) {
        console.error('Save failed:', err)
      }
    }
    window.addEventListener('save-file', handler)
    return () => window.removeEventListener('save-file', handler)
  }, [repo, files])

  // Handle local file-select events
  useEffect(() => {
    if (!local.localMode) return
    const handler = async (e: Event) => {
      const { path } = (e as CustomEvent).detail
      try {
        const content = await local.readFile(path)
        openFile(path, content, undefined, { kind: 'text' })
      } catch (err) {
        console.error('Failed to open local file:', err)
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [local.localMode, local.readFile, openFile])

  // Handle local save-file events
  useEffect(() => {
    if (!local.localMode) return
    const handler = async (e: Event) => {
      const { path } = (e as CustomEvent).detail
      const file = files.find(f => f.path === path)
      if (!file || !file.dirty) return
      try {
        await local.writeFile(path, file.content)
        markClean(path)
        await local.refresh()
      } catch (err) {
        console.error('Local save failed:', err)
      }
    }
    window.addEventListener('save-file', handler)
    return () => window.removeEventListener('save-file', handler)
  }, [local.localMode, local.writeFile, local.refresh, files, markClean])

  // Handle file-select events from explorer (GitHub mode)
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, sha } = (e as CustomEvent).detail
      if (!repo) return
      try {
        const data = await fetchFileContents(repo.fullName, path, repo.branch)
        const media = getMediaMeta(path)

        if (media) {
          const content = data.encoding === 'base64' && typeof data.content === 'string' && data.content.length > 0
            ? toDataUrl(data.content, media.mimeType)
            : typeof data.download_url === 'string' && data.download_url.length > 0
              ? data.download_url
              : ''
          openFile(path, content, data.sha ?? sha, media)
          return
        }

        const content = data.content ?? ''
        openFile(path, content, data.sha ?? sha, { kind: 'text' })
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, openFile])

  const handleExplorerResize = useCallback((delta: number) => {
    setExplorerWidth(w => Math.min(EXPLORER_MAX, Math.max(EXPLORER_MIN, w + delta)))
  }, [])

  const handleAgentResize = useCallback((delta: number) => {
    setAgentWidth(w => Math.min(AGENT_MAX, Math.max(AGENT_MIN, w - delta)))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (!e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandPaletteVisible(true); return }
        if (e.key === 's') { e.preventDefault(); void saveActiveFile(); return }
        if (e.key === 's') {
          e.preventDefault()
          const active = files.find(f => f.path === activeFile)
          if (active?.dirty) {
            window.dispatchEvent(new CustomEvent('save-file', { detail: { path: active.path } }))
          }
          return
        }
        if (e.key === 'b') { e.preventDefault(); setExplorerVisible(v => !v) }
        if (e.key === 'j') { e.preventDefault(); setAgentOpen(v => !v) }
        if (e.key === 'p') { e.preventDefault(); setQuickOpenVisible(v => !v) }
      }
      // ⌘` toggle terminal
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); setTerminalVisible(v => !v); return }
      // ⌘⇧E toggle Gateway Engine
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setEngineVisible(v => !v); return }
      // ? key (not in input)
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setShortcutsVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveActiveFile])

  useEffect(() => {
    const tauriWindow = window as Window & {
      __TAURI__?: unknown
      __TAURI_INTERNALS__?: unknown
    }
    const runningInTauri = Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__)
    const isMacOS = navigator.userAgent.includes('Mac')
    setIsTauriDesktop(runningInTauri)
    setIsMacTauri(runningInTauri && isMacOS)

    // Add vibrancy class for transparent backgrounds
    if (runningInTauri) {
      document.body.classList.add('tauri-vibrancy')
    }

    // Restore window state
    if (runningInTauri) {
      import('@tauri-apps/plugin-window-state').then(({ restoreStateCurrent }) => {
        restoreStateCurrent().catch(() => {})
      }).catch(() => {})
    }
  }, [])

  const handleRunCommand = useCallback((commandId: CommandId) => {
    if (commandId === 'find-files') {
      setQuickOpenVisible(true)
      return
    }
    window.dispatchEvent(new CustomEvent('editor-command', { detail: { commandId } }))
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header data-tauri-drag-region className={`flex items-center justify-between h-11 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 ${isTauriDesktop ? 'tauri-drag-region' : ''} ${isMacTauri ? 'pl-20 pr-4' : 'px-4'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 group">
            <div className="relative">
              <Icon icon="lucide:code" width={18} height={18} className="text-[var(--brand)] transition-transform duration-300 group-hover:scale-110" />
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--bg-elevated)] transition-colors ${
                status === 'connected' ? 'bg-[var(--color-additions)]' : 'bg-[var(--text-tertiary)]'
              }`} />
            </div>
            <span className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">code-editor</span>
          </div>
          <div className="w-px h-5 bg-[var(--border)]" />
          <div className={isTauriDesktop ? 'tauri-no-drag' : ''}>
            {local.available ? <SourceSwitcher /> : <RepoSelector />}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className={isTauriDesktop ? 'tauri-no-drag' : ''}>
            <GitHubAuthBadge />
          </div>
          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
          <div className={isTauriDesktop ? 'tauri-no-drag' : ''}>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File Explorer */}
        {explorerVisible && (
          <div className="shrink-0 bg-[var(--sidebar-bg)] overflow-hidden border-r border-[color-mix(in_srgb,var(--brand)_28%,var(--border))]" style={{ width: explorerWidth }}>
            <FileExplorer />
          </div>
        )}

        {/* Explorer resize handle — only when open */}
        {explorerVisible && <ResizeHandle direction="horizontal" onResize={handleExplorerResize} />}

        {/* Left panel edge trigger — always visible, sits at the right edge of the explorer section */}
        <button
          onClick={() => setExplorerVisible(v => !v)}
          className="group relative shrink-0 self-stretch w-3.5 flex items-center justify-center cursor-pointer transition-colors duration-200 border-r border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)]"
          title={`${explorerVisible ? 'Hide' : 'Show'} file explorer (\u2318B)`}
          aria-label={explorerVisible ? 'Collapse file explorer' : 'Expand file explorer'}
        >
          {/* Active accent line on the right edge */}
          <span className={`absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full transition-all duration-300 ${
            explorerVisible
              ? 'bg-[var(--brand)] opacity-60 group-hover:opacity-90'
              : 'bg-[var(--text-tertiary)] opacity-0 group-hover:opacity-30'
          }`} />
          {/* Direction chevron — appears on hover */}
          <Icon
            icon={explorerVisible ? 'lucide:chevron-left' : 'lucide:chevron-right'}
            width={9} height={9}
            className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          />
        </button>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <EditorTabs />
          <CodeEditor />
        </div>

        {/* Right panel edge trigger — always visible, sits at the left edge of the agent section */}
        <button
          onClick={() => setAgentOpen(v => !v)}
          className={`group relative shrink-0 self-stretch w-3.5 flex items-center justify-center cursor-pointer transition-colors duration-200 border-l border-[var(--border)] ${
            agentOpen
              ? 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-subtle)]'
              : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)]'
          }`}
          title={`${agentOpen ? 'Hide' : 'Show'} agent (\u2318J)`}
          aria-label={agentOpen ? 'Collapse agent panel' : 'Expand agent panel'}
        >
          {/* Active accent line on the left edge */}
          <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full transition-all duration-300 ${
            agentOpen
              ? 'bg-[var(--brand)] opacity-60 group-hover:opacity-90'
              : 'bg-[var(--text-tertiary)] opacity-0 group-hover:opacity-30'
          }`} />
          {/* Direction chevron — appears on hover */}
          <Icon
            icon={agentOpen ? 'lucide:chevron-right' : 'lucide:chevron-left'}
            width={9} height={9}
            className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          />
        </button>

        {/* Sidebar: Agent */}
        {agentOpen && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleAgentResize} />
            <div className="shrink-0 flex flex-col overflow-hidden border-l-2 border-[color-mix(in_srgb,var(--brand)_40%,var(--border))]" style={{ width: agentWidth }}>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AgentPanel />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Open (⌘P) */}
      <QuickOpen
        open={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        onSelect={(path, sha) => {
          const event = new CustomEvent('file-select', { detail: { path, sha } })
          window.dispatchEvent(event)
        }}
      />

      {/* Shortcuts Overlay (?) */}
      <ShortcutsOverlay
        open={shortcutsVisible}
        onClose={() => setShortcutsVisible(false)}
      />

      {/* Command Palette (⌘K) */}
      <CommandPalette
        open={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onRun={handleRunCommand}
      />

      {/* Changes Panel (pre-commit diff) */}
      <ChangesPanel
        open={changesVisible}
        onClose={() => setChangesVisible(false)}
        onCommit={async (message) => {
          if (!repo) return
          const dirtyFiles = files.filter(f => f.dirty && f.kind === 'text')
          if (dirtyFiles.length === 0) return
          try {
            await commitFiles(
              repo.fullName,
              dirtyFiles.map(f => ({ path: f.path, content: f.content, sha: f.sha })),
              message,
              repo.branch,
            )
            dirtyFiles.forEach(f => markClean(f.path))
            setChangesVisible(false)
          } catch (err) {
            console.error('Commit failed:', err)
          }
        }}
      />

      {/* Terminal Panel (⌘\`) */}
      <TerminalPanel
        visible={terminalVisible}
        height={terminalHeight}
        onHeightChange={setTerminalHeight}
      />

      {/* Gateway Engine Panel */}
      {engineVisible && (
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden" style={{ height: 320 }}>
          <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              <Icon icon="lucide:cpu" width={12} height={12} />
              Gateway Engine
            </div>
            <button
              onClick={() => setEngineVisible(false)}
              className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
              title="Close"
            >
              <Icon icon="lucide:x" width={12} height={12} />
            </button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto">
            <EnginePanel />
          </div>
        </div>
      )}

      {/* Status bar */}
      <footer className="flex items-center justify-between px-3 h-6 border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[9px] text-[var(--text-tertiary)] shrink-0">
        <div className="flex items-center gap-2.5">
          <span className={`flex items-center gap-1 ${
            status === 'connected' ? 'text-[var(--color-additions)]' : 'text-[var(--text-tertiary)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
              status === 'connected' ? 'bg-[var(--color-additions)] animate-breathe' : 'bg-[var(--text-disabled)]'
            }`} />
            {status === 'connected' ? 'Gateway' : 'Offline'}
          </span>
          <div className="w-px h-3 bg-[var(--border)]" />
          {local.localMode && local.rootPath && (
            <span className="font-mono flex items-center gap-1">
              <Icon icon="lucide:folder" width={9} height={9} />
              {local.rootPath.split('/').pop()}
            </span>
          )}
          {local.localMode && local.gitInfo?.is_repo && (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:git-branch" width={9} height={9} />
              {local.gitInfo.branch}
            </span>
          )}
          {!local.localMode && repo && (
            <span className="font-mono flex items-center gap-1">
              <Icon icon="lucide:github" width={9} height={9} />
              {repo.fullName}
            </span>
          )}
          {!local.localMode && repo && (
            <span className="flex items-center gap-1">
              <Icon icon="lucide:git-branch" width={9} height={9} />
              {repo.branch}
            </span>
          )}
          {dirtyCount > 0 && (
            <>
              <div className="w-px h-3 bg-[var(--border)]" />
              <button
                onClick={() => setChangesVisible(true)}
                className="flex items-center gap-1 text-[var(--brand)] hover:underline cursor-pointer transition-colors"
                title="Review changes before committing"
              >
                <Icon icon="lucide:file-pen" width={9} height={9} />
                {dirtyCount} modified
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFile && (
            <>
              <span className="font-mono text-[var(--text-tertiary)]">
                {activeFile.split('.').pop()?.toUpperCase()}
              </span>
              <div className="w-px h-3 bg-[var(--border)]" />
            </>
          )}
          <button
            onClick={() => setTerminalVisible(v => !v)}
            className={`flex items-center gap-1 cursor-pointer hover:text-[var(--text-secondary)] transition-colors ${terminalVisible ? 'text-[var(--brand)]' : ''
              }`}
            title="Toggle terminal (⌘\`)"
          >
            <Icon icon="lucide:terminal" width={10} height={10} />
            <span>Terminal</span>
          </button>
          <button
            onClick={() => setEngineVisible(v => !v)}
            className={`flex items-center gap-1 cursor-pointer hover:text-[var(--text-secondary)] transition-colors ${engineVisible ? 'text-[var(--brand)]' : ''
              }`}
            title="Toggle Gateway Engine (⌘⇧E)"
          >
            <Icon icon="lucide:cpu" width={10} height={10} />
            <span>Engine</span>
          </button>
          <div className="w-px h-3 bg-[var(--border)]" />
          <span className="text-[var(--text-disabled)]">v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}


// ─── Root Page ──────────────────────────────────────────────────

export default function EditorPage() {
  const { user, loading } = useAuth()
  const [showEditor, setShowEditor] = useState(false)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg)]">
        <Icon icon="lucide:loader-2" width={20} height={20} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  // Unauthenticated users see the landing page
  if (!user) {
    if (showEditor) {
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in'
      }
      return (
        <div className="h-full flex items-center justify-center bg-[var(--bg)]">
          <Icon icon="lucide:loader-2" width={20} height={20} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      )
    }
    return <Landing onEnter={() => setShowEditor(true)} />
  }

  // Authenticated users go through sponsor gate → editor
  return (
    <SponsorGate>
      <EditorLayout />
    </SponsorGate>
  )
}
