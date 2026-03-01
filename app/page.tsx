'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useRepo } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useView, type ViewId } from '@/context/view-context'
import { WorkspaceSidebar } from '@/components/workspace-sidebar'
import { isTauri } from '@/lib/tauri'
import { fetchFileContentsByName as fetchFileContents, commitFilesByName as commitFiles } from '@/lib/github-api'

// View components — lazy loaded
const ChatView = dynamic(() => import('@/components/views/chat-view').then(m => ({ default: m.ChatView })), { ssr: false })
const EditorView = dynamic(() => import('@/components/views/editor-view').then(m => ({ default: m.EditorView })), { ssr: false })
const GitView = dynamic(() => import('@/components/views/git-view').then(m => ({ default: m.GitView })), { ssr: false })
const PrView = dynamic(() => import('@/components/views/pr-view').then(m => ({ default: m.PrView })), { ssr: false })
const SettingsPanel = dynamic(() => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })), { ssr: false })

// Overlay modals — lazy loaded
const QuickOpen = dynamic(() => import('@/components/quick-open').then(m => ({ default: m.QuickOpen })), { ssr: false })
const GlobalSearch = dynamic(() => import('@/components/global-search').then(m => ({ default: m.GlobalSearch })), { ssr: false })
const CommandPalette = dynamic(() => import('@/components/command-palette').then(m => ({ default: m.CommandPalette })), { ssr: false })
const ShortcutsOverlay = dynamic(() => import('@/components/shortcuts-overlay').then(m => ({ default: m.ShortcutsOverlay })), { ssr: false })
const Landing = dynamic(() => import('@/components/landing'), { ssr: false })

const VIEW_ICONS: Record<ViewId, { icon: string; label: string }> = {
  chat: { icon: 'lucide:message-square', label: 'Chat' },
  editor: { icon: 'lucide:code-2', label: 'Editor' },
  diff: { icon: 'lucide:git-compare', label: 'Diff' },
  git: { icon: 'lucide:git-branch', label: 'Git' },
  prs: { icon: 'lucide:git-pull-request', label: 'PRs' },
  settings: { icon: 'lucide:settings', label: 'Settings' },
}

export default function EditorLayout() {
  const { status } = useGateway()
  const { repo } = useRepo()
  const { files, activeFile, openFile, setActiveFile, markClean, updateFileContent } = useEditor()
  const { localMode, readFile: localReadFile, rootPath: localRootPath, gitInfo } = useLocal()
  const { activeView, setView } = useView()

  // ─── Minimal state ──────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('code-editor:sidebar-collapsed') === 'true' } catch { return false }
  })
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)
  const [showLanding, setShowLanding] = useState(false)
  const [agentMode, setAgentMode] = useState<string>('agent')

  // Overlay modals
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)

  // ─── Tauri detection ───────────────────────────────────
  useEffect(() => {
    setIsTauriDesktop(isTauri())
    setIsMacTauri(isTauri() && navigator.platform?.includes('Mac'))
  }, [])

  // ─── Persist sidebar state ─────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('code-editor:sidebar-collapsed', String(sidebarCollapsed)) } catch {}
  }, [sidebarCollapsed])

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // ⌘P — Quick open
      if (meta && e.key === 'p' && !e.shiftKey) { e.preventDefault(); setQuickOpenVisible(v => !v) }
      // ⌘⇧P — Command palette
      if (meta && e.shiftKey && e.key === 'p') { e.preventDefault(); setCommandPaletteVisible(v => !v) }
      // ⌘⇧F — Global search
      if (meta && e.shiftKey && e.key === 'f') { e.preventDefault(); setGlobalSearchVisible(v => !v) }
      // ⌘\\ — Toggle sidebar
      if (meta && e.key === '\\') { e.preventDefault(); setSidebarCollapsed(v => !v) }
      // Esc — Close overlays
      if (e.key === 'Escape') {
        setQuickOpenVisible(false); setGlobalSearchVisible(false)
        setCommandPaletteVisible(false); setShortcutsVisible(false)
      }
      // ⌘1-5 — View switching
      if (meta && e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const views: ViewId[] = ['chat', 'editor', 'git', 'prs', 'settings']
        setView(views[parseInt(e.key) - 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView])

  // ─── Event listeners ───────────────────────────────────
  useEffect(() => {
    const openSettings = () => setSettingsVisible(true)
    const openFolder = () => { /* Handled by local context */ }
    window.addEventListener('open-settings', openSettings)
    window.addEventListener('open-folder', openFolder)
    return () => {
      window.removeEventListener('open-settings', openSettings)
      window.removeEventListener('open-folder', openFolder)
    }
  }, [])

  // ─── File open handler ─────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, sha, content: providedContent } = (e as CustomEvent).detail ?? {}
      if (!path) return

      // Already open — just switch to it
      const existing = files.find(f => f.path === path)
      if (existing) {
        setActiveFile(path)
        setView('editor')
        return
      }

      // Content provided directly (local mode)
      if (providedContent != null) {
        openFile(path, providedContent, sha ?? '')
        setView('editor')
        return
      }

      // Local mode — read from filesystem
      if (localMode && localReadFile) {
        try {
          const content = await localReadFile(path)
          openFile(path, content, '')
          setView('editor')
        } catch (err) {
          console.error('Failed to read local file:', path, err)
        }
        return
      }

      // Fetch from GitHub
      if (repo) {
        try {
          const result = await fetchFileContents(repo.fullName, path, repo.branch)
          openFile(path, result.content, result.sha ?? sha ?? '')
          setView('editor')
        } catch (err) {
          console.error('Failed to open file:', path, err)
        }
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, files, openFile, setActiveFile, setView])

  // ─── Commit handler ────────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { message } = (e as CustomEvent).detail ?? {}
      if (!message || !repo) return
      const dirtyFiles = files.filter(f => f.dirty)
      if (dirtyFiles.length === 0) return
      try {
        await commitFiles(repo.fullName, dirtyFiles.map(f => ({ path: f.path, content: f.content, sha: f.sha })), message, repo.branch)
        dirtyFiles.forEach(f => markClean(f.path))
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: true, message: `Committed ${dirtyFiles.length} file(s)` } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, message: String(err) } }))
      }
    }
    window.addEventListener('agent-commit', handler)
    return () => window.removeEventListener('agent-commit', handler)
  }, [repo, files, markClean])

  // ─── Save handler (⌘S) ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        // Auto-save already handles persistence
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ─── Landing check ─────────────────────────────────────
  useEffect(() => {
    const hasVisited = localStorage.getItem('code-editor:visited')
    if (!hasVisited && !isTauriDesktop) setShowLanding(true)
  }, [isTauriDesktop])

  if (showLanding) {
    return <Landing onEnter={() => { setShowLanding(false); localStorage.setItem('code-editor:visited', 'true') }} />
  }

  const dirtyCount = files.filter(f => f.dirty).length

  // ─── View tabs for sidebar ──────────────────────────────
  const visibleViews: ViewId[] = ['chat', 'editor', 'git', 'prs']

  return (
    <div className="flex h-full w-full bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden">
      {/* Tauri drag region */}
      {isTauriDesktop && (
        <div data-tauri-drag-region className="tauri-drag-region fixed top-0 left-0 right-0 h-3 z-[9999]" />
      )}

      {/* Workspace Sidebar */}
      <WorkspaceSidebar
        activeId={activeChatId ?? ''}
        onSelect={(id) => { setActiveChatId(id); window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id } })); setView('chat') }}
        onNew={() => { const newId = crypto.randomUUID(); setActiveChatId(newId); window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id: newId } })); setView('chat') }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        repoName={repo?.fullName || localRootPath?.split('/').pop()}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* View navigation bar */}
        <div className={`flex items-center h-8 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-2 gap-0.5 ${isMacTauri && sidebarCollapsed ? 'pl-20' : ''}`}>
          {/* View tabs */}
          {visibleViews.map((v, i) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                activeView === v
                  ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
              title={`${VIEW_ICONS[v].label} (⌘${i + 1})`}
            >
              <Icon icon={VIEW_ICONS[v].icon} width={12} height={12} />
              <span className="hidden sm:inline">{VIEW_ICONS[v].label}</span>
              {v === 'git' && dirtyCount > 0 && (
                <span className="px-1 min-w-[14px] text-center rounded-full bg-[var(--brand)] text-white text-[8px] leading-[14px]">{dirtyCount}</span>
              )}
            </button>
          ))}

          <div className="flex-1 tauri-drag-region" data-tauri-drag-region />

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {status === 'connected' && (
              <span className="flex items-center gap-1 text-[9px] text-[var(--color-additions)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-additions)]" />
                <span className="hidden sm:inline">Connected</span>
              </span>
            )}
            <button onClick={() => setSettingsVisible(true)} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer" title="Settings">
              <Icon icon="lucide:settings" width={12} height={12} />
            </button>
          </div>
        </div>

        {/* Active view */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {activeView === 'chat' && <ChatView />}
          {activeView === 'editor' && <EditorView />}
          {activeView === 'git' && <GitView />}
          {activeView === 'prs' && <PrView />}
          {activeView === 'settings' && (
            <div className="flex-1 flex items-center justify-center">
              <SettingsPanel open={true} onClose={() => setView('chat')} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <footer className="flex items-center justify-between px-3 h-6 border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[9px] text-[var(--text-tertiary)] shrink-0">
          <div className="flex items-center gap-3">
            {repo && (
              <span className="flex items-center gap-1">
                <Icon icon="lucide:git-branch" width={9} height={9} />
                {repo.branch}
              </span>
            )}
            {localMode && gitInfo?.branch && (
              <span className="flex items-center gap-1">
                <Icon icon="lucide:git-branch" width={9} height={9} />
                {gitInfo.branch}
              </span>
            )}
            {dirtyCount > 0 && (
              <span className="text-[var(--warning,#eab308)]">{dirtyCount} unsaved</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-disabled)]">Knot Code</span>
          </div>
        </footer>
      </div>

      {/* Modal overlays */}
      <QuickOpen
        open={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        onSelect={(path, sha) => { window.dispatchEvent(new CustomEvent('file-select', { detail: { path, sha } })); setQuickOpenVisible(false) }}
      />
      <GlobalSearch
        open={globalSearchVisible}
        onClose={() => setGlobalSearchVisible(false)}
        onNavigate={(path, line) => { window.dispatchEvent(new CustomEvent('file-select', { detail: { path } })); setGlobalSearchVisible(false) }}
      />
      <CommandPalette
        open={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onRun={() => setCommandPaletteVisible(false)}
      />
      <ShortcutsOverlay open={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
      {settingsVisible && activeView !== 'settings' && (
        <SettingsPanel open={settingsVisible} onClose={() => setSettingsVisible(false)} />
      )}
    </div>
  )
}
