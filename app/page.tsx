'use client'

import { useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useRepo } from '@/context/repo-context'
import { useEditor, detectFileKind, getMimeType } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useView, type ViewId } from '@/context/view-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { useAppMode } from '@/context/app-mode-context'
import { WorkspaceSidebar } from '@/components/workspace-sidebar'
import { FloatingPanel } from '@/components/floating-panel'
import { isTauri } from '@/lib/tauri'
import {
  fetchFileContentsByName as fetchFileContents,
  commitFilesByName as commitFiles,
} from '@/lib/github-api'
import { usePlugins } from '@/context/plugin-context'
import { SpotifyPlugin } from '@/components/plugins/spotify/spotify-plugin'
import { YouTubePlugin } from '@/components/plugins/youtube/youtube-plugin'
import { isOnboardingComplete } from '@/components/onboarding-tour'
import { PreviewProvider } from '@/context/preview-context'
import { ViewRouter } from '@/components/view-router'
import { StatusBar } from '@/components/status-bar'
import { useKeyboardShortcuts } from '@/components/keyboard-handler'
import { emit, on } from '@/lib/events'
import { KnotLogo } from '@/components/knot-logo'
import type { AppMode } from '@/lib/mode-registry'
import { openNewEditorInstance } from '@/lib/tauri'

const GitSidebarPanel = dynamic(
  () => import('@/components/git-sidebar-panel').then((m) => ({ default: m.GitSidebarPanel })),
  { ssr: false },
)

// Overlay modals — lazy loaded
const QuickOpen = dynamic(
  () => import('@/components/quick-open').then((m) => ({ default: m.QuickOpen })),
  { ssr: false },
)
const GlobalSearch = dynamic(
  () => import('@/components/global-search').then((m) => ({ default: m.GlobalSearch })),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('@/components/command-palette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
)
const ShortcutsOverlay = dynamic(
  () => import('@/components/shortcuts-overlay').then((m) => ({ default: m.ShortcutsOverlay })),
  { ssr: false },
)
const TerminalPanel = dynamic(
  () => import('@/components/terminal-panel').then((m) => ({ default: m.TerminalPanel })),
  { ssr: false },
)
const GatewayTerminalLazy = dynamic(
  () => import('@/components/gateway-terminal').then((m) => ({ default: m.GatewayTerminal })),
  { ssr: false },
)
const PipWindow = dynamic(
  () => import('@/components/preview/pip-window').then((m) => ({ default: m.PipWindow })),
  { ssr: false },
)
const WidgetPipWindow = dynamic(
  () =>
    import('@/components/plugins/widget-pip-window').then((m) => ({ default: m.WidgetPipWindow })),
  { ssr: false },
)
const SettingsPanel = dynamic(
  () => import('@/components/settings-panel').then((m) => ({ default: m.SettingsPanel })),
  { ssr: false },
)
const OnboardingTour = dynamic(
  () => import('@/components/onboarding-tour').then((m) => ({ default: m.OnboardingTour })),
  { ssr: false },
)
const PluginSlotRenderer = dynamic(
  () => import('@/context/plugin-context').then((m) => ({ default: m.PluginSlotRenderer })),
  { ssr: false },
)

const VIEW_ICONS: Record<string, { icon: string; label: string }> = {
  chat: { icon: 'lucide:message-square', label: 'Chat' },
  editor: { icon: 'lucide:code-2', label: 'Editor' },
  preview: { icon: 'lucide:eye', label: 'Preview' },
  diff: { icon: 'lucide:git-compare', label: 'Diff' },
  git: { icon: 'lucide:git-branch', label: 'Git' },
  workshop: { icon: 'lucide:bot', label: 'Workshop' },
  skills: { icon: 'lucide:sparkles', label: 'Skills' },
  prism: { icon: 'lucide:file-text', label: 'Prism' },
  settings: { icon: 'lucide:settings', label: 'Settings' },
}

const MODE_BUTTONS: Array<{ id: AppMode; icon: string; label: string }> = [
  { id: 'classic', icon: 'lucide:code-2', label: 'Classic' },
  { id: 'chat', icon: 'lucide:message-square', label: 'Chat' },
  { id: 'tui', icon: 'lucide:terminal', label: 'TUI' },
]

const TERMINAL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

export default function EditorLayout() {
  const { status } = useGateway()
  const { repo, setRepo } = useRepo()
  const local = useLocal()
  const { files, activeFile, openFile, setActiveFile, markClean, updateFileContent } = useEditor()
  const {
    localMode,
    readFile: localReadFile,
    readFileBase64: localReadFileBase64,
    writeFile: localWriteFile,
    rootPath: localRootPath,
    gitInfo,
    openFolder: localOpenFolder,
    setRootPath: localSetRootPath,
    commitFiles: localCommitFiles,
  } = local
  const { activeView, setView, direction } = useView()
  const { mode, spec: modeSpec, setMode } = useAppMode()
  const layout = useLayout()
  const visibleViews = modeSpec.visibleViews
  const isMobile = layout.isAtMost('lte768')
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const sidebarCollapsed = !layout.isVisible('sidebar')
  const terminalVisible = layout.isVisible('terminal')
  const terminalHeight = layout.getSize('terminal')
  const terminalFloating = layout.isFloating('terminal')
  const viewportHeight = layout.viewport.height
  const terminalRefreshToken = mode
  const terminalStartupCommand = modeSpec.terminalCenter ? 'openclaw tui' : undefined
  const usePrismShell = activeView === 'prism'
  const mobileViewTabs = useMemo(() => visibleViews.slice(0, 5), [visibleViews])
  const activeViewMeta = VIEW_ICONS[activeView] ?? {
    icon: 'lucide:layout-panel-top',
    label: 'Workspace',
  }
  const workspaceLabel = useMemo(
    () => repo?.fullName?.split('/').pop() ?? localRootPath?.split('/').pop() ?? 'KnotCode',
    [repo?.fullName, localRootPath],
  )
  const showMobileBottomTabs = isMobile && !modeSpec.terminalCenter && keyboardOffset === 0
  const showMobileSidebarButton = isMobile && mode !== 'tui' && !usePrismShell
  const mobileTerminalOffset = showMobileBottomTabs
    ? 'calc(env(safe-area-inset-bottom) + 5.75rem)'
    : 'calc(env(safe-area-inset-bottom) + 0.5rem)'

  // ─── Minimal state ──────────────────────────────────
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)
  const [flashedTab, setFlashedTab] = useState<ViewId | null>(null)
  const [connectionAnim, setConnectionAnim] = useState<'pop' | 'pulse' | null>(null)
  const prevStatusRef = useRef(status)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  })
  const [agentActive, setAgentActive] = useState(false)

  // Overlay modals
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    'general' | 'editor' | 'agent' | 'keybindings' | 'plugins' | undefined
  >(undefined)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])
  const ensureTuiTerminalVisible = useCallback(() => {
    layout.setFloating('terminal', false)
    layout.show('terminal')
  }, [layout])

  // Entering TUI should always surface the terminal view.
  useEffect(() => {
    if (!modeSpec.terminalCenter) return
    ensureTuiTerminalVisible()
  }, [modeSpec.terminalCenter, ensureTuiTerminalVisible])

  // ─── Tauri detection ───────────────────────────────────
  useEffect(() => {
    setIsTauriDesktop(isTauri())
    setIsMacTauri(isTauri() && navigator.platform?.includes('Mac'))
  }, [])

  useEffect(() => {
    if (!isMobile || mode === 'tui' || usePrismShell) {
      setMobileSidebarOpen(false)
    }
  }, [isMobile, mode, usePrismShell])

  // ─── iOS keyboard: shrink layout when virtual keyboard opens ───
  useEffect(() => {
    if (!isMobile) return
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const offset = window.innerHeight - vv.height
      setKeyboardOffset(offset > 50 ? offset : 0) // only respond to real keyboard
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [isMobile])

  // ─── Onboarding ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isOnboardingComplete()) setOnboardingOpen(true)
    return on('open-onboarding' as keyof import('@/lib/events').AppEvents, () =>
      setOnboardingOpen(true),
    )
  }, [])

  // ─── Auto-populate RepoContext from local git remote ───
  useEffect(() => {
    if (local.remoteRepo && local.gitInfo?.branch) {
      const [owner, repoName] = local.remoteRepo.split('/')
      if (owner && repoName) {
        if (repo?.fullName !== local.remoteRepo || repo?.branch !== local.gitInfo.branch) {
          setRepo({
            owner,
            repo: repoName,
            branch: local.gitInfo.branch,
            fullName: local.remoteRepo,
          })
        }
      }
    }
  }, [local.remoteRepo, local.gitInfo?.branch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sliding tab indicator measurement ─────────────────
  useLayoutEffect(() => {
    const idx = visibleViews.indexOf(activeView)
    const tab = tabRefs.current[idx]
    const container = tabContainerRef.current
    if (tab && container) {
      const cRect = container.getBoundingClientRect()
      const tRect = tab.getBoundingClientRect()
      setIndicatorStyle({ left: tRect.left - cRect.left, width: tRect.width })
    }
  }, [activeView, sidebarCollapsed, visibleViews])

  // ─── Connection state transitions ─────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (status === 'connected' && prev !== 'connected') {
      setConnectionAnim('pop')
      const t = setTimeout(() => setConnectionAnim(null), 600)
      return () => clearTimeout(t)
    }
  }, [status])

  // ─── Agent activity detection ─────────────────────────
  useEffect(() => {
    return on('engine-status', (detail) => {
      setAgentActive(detail?.running ?? false)
    })
  }, [])

  // ─── Save file handler ─────────────────────────────────
  const saveFile = useCallback(
    async (path: string) => {
      const file = files.find((f) => f.path === path)
      if (!file || !file.dirty) return

      if (localMode && localWriteFile) {
        try {
          await localWriteFile(path, file.content)
          markClean(path)
        } catch (err) {
          console.error('Failed to save file:', path, err)
        }
        return
      }

      if (repo) {
        try {
          await commitFiles(
            repo.fullName,
            [{ path: file.path, content: file.content, sha: file.sha }],
            `Update ${path.split('/').pop()}`,
            repo.branch,
          )
          markClean(path)
        } catch (err) {
          console.error('Failed to save file to GitHub:', path, err)
        }
      }
    },
    [files, localMode, localWriteFile, markClean, repo],
  )

  // ─── Keyboard shortcuts ────────────────────────────────
  useKeyboardShortcuts({
    onQuickOpen: () => setQuickOpenVisible((v) => !v),
    onCommandPalette: () => setCommandPaletteVisible((v) => !v),
    onGlobalSearch: () => setGlobalSearchVisible((v) => !v),
    onNewWindow: () => {
      openNewEditorInstance().catch((err) => console.error('Failed to open new window:', err))
    },
    onFlashTab: (v) => {
      setFlashedTab(v)
      setTimeout(() => setFlashedTab(null), 400)
    },
    saveFile,
  })

  // ─── Event listeners ───────────────────────────────────
  useEffect(() => {
    const unsubs = [
      on('open-settings', () => {
        setSettingsTab(undefined)
        setSettingsVisible(true)
      }),
      on('open-agent-settings', () => {
        setSettingsTab('agent')
        setSettingsVisible(true)
      }),
      on('open-folder', () => localOpenFolder()),
      on('open-recent', (detail) => {
        if (detail.path) localSetRootPath(detail.path)
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [localOpenFolder, localSetRootPath])

  // ─── File open handler ─────────────────────────────────
  useEffect(() => {
    return on('file-select', async (detail) => {
      const { path, sha, content: providedContent } = detail ?? {}
      if (!path) return

      const existing = files.find((f) => f.path === path)
      if (existing) {
        setActiveFile(path)
        setView('editor')
        return
      }

      if (providedContent != null) {
        openFile(path, providedContent, sha ?? '')
        setView('editor')
        return
      }

      const fileKind = detectFileKind(path)
      const isBinary = fileKind !== 'text'

      if (localMode && localReadFile) {
        try {
          if (isBinary && localReadFileBase64) {
            const base64 = await localReadFileBase64(path)
            const mime = getMimeType(path)
            const dataUrl = `data:${mime};base64,${base64}`
            openFile(path, dataUrl, '', { kind: fileKind, mimeType: mime })
          } else {
            const content = await localReadFile(path)
            openFile(path, content, '')
          }
          setView('editor')
        } catch (err) {
          console.error('Failed to read local file:', path, err)
        }
        return
      }

      if (repo) {
        try {
          const result = await fetchFileContents(repo.fullName, path, repo.branch)
          if (isBinary && result.rawBase64) {
            const mime = getMimeType(path)
            const dataUrl = `data:${mime};base64,${result.rawBase64}`
            openFile(path, dataUrl, result.sha ?? sha ?? '', { kind: fileKind, mimeType: mime })
          } else {
            openFile(path, result.content, result.sha ?? sha ?? '')
          }
          setView('editor')
        } catch (err) {
          console.error('Failed to open file:', path, err)
        }
      }
    })
  }, [repo, files, openFile, setActiveFile, setView, localMode, localReadFile, localReadFileBase64])

  // ─── Commit handler ────────────────────────────────────
  useEffect(() => {
    return on('agent-commit', async (detail) => {
      const { message } = detail ?? {}
      if (!message) return

      if (localMode && localRootPath && gitInfo?.is_repo) {
        const dirtyFiles = files.filter((f) => f.dirty)
        const gitPaths = gitInfo.status?.map((s) => s.path) ?? []
        const allPaths = [...new Set([...dirtyFiles.map((f) => f.path), ...gitPaths])]
        if (allPaths.length === 0) {
          emit('agent-commit-result', { success: false, error: 'No changes to commit' })
          return
        }
        try {
          await localCommitFiles(message, allPaths)
          dirtyFiles.forEach((f) => markClean(f.path))
          emit('agent-commit-result', { success: true, fileCount: allPaths.length })
        } catch (err) {
          emit('agent-commit-result', { success: false, error: String(err) })
        }
        return
      }

      if (!repo) return
      const dirtyFiles = files.filter((f) => f.dirty)
      if (dirtyFiles.length === 0) return
      try {
        await commitFiles(
          repo.fullName,
          dirtyFiles.map((f) => ({ path: f.path, content: f.content, sha: f.sha })),
          message,
          repo.branch,
        )
        dirtyFiles.forEach((f) => markClean(f.path))
        emit('agent-commit-result', { success: true, fileCount: dirtyFiles.length })
      } catch (err) {
        emit('agent-commit-result', { success: false, error: String(err) })
      }
    })
  }, [repo, files, markClean, localMode, localRootPath, gitInfo, localCommitFiles])

  // ─── Git panel navigation ───
  useEffect(() => {
    const unsubs = [
      on('open-git-panel', () => {
        setView('git')
        layout.show('gitPanel')
      }),
      on('open-changes-panel', () => setView('git')),
    ]
    return () => unsubs.forEach((u) => u())
  }, [setView])

  // ─── Push handler ─────────────────────────────────────
  useEffect(() => {
    return on('agent-push', async () => {
      try {
        await local.push()
        emit('agent-push-result', { success: true })
      } catch (err) {
        emit('agent-push-result', { success: false, error: String(err) })
      }
    })
  }, [local])

  return (
    <div
      className={`app-shell flex h-full w-full overflow-hidden bg-[var(--bg)] text-[var(--text-primary)] ${
        isMobile ? 'gap-0 p-0' : 'gap-1.5 p-1.5'
      }`}
      style={keyboardOffset > 0 ? { height: `calc(100% - ${keyboardOffset}px)` } : undefined}
    >
      {/* Tauri drag region */}
      {isTauriDesktop && (
        <div
          data-tauri-drag-region
          className="tauri-drag-region fixed top-0 left-0 right-0 h-10 z-[9999] pointer-events-none"
        />
      )}

      {/* Workspace Sidebar — always visible in chat mode, toggleable otherwise */}
      {!isMobile && mode !== 'tui' && !usePrismShell && (
        <WorkspaceSidebar
          collapsed={mode !== 'chat' && sidebarCollapsed}
          onToggle={() => layout.toggle('sidebar')}
          repoName={repo?.fullName || localRootPath?.split('/').pop()}
        />
      )}

      {/* Main content area */}
      <div
        className={`shell-frame flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          isMobile
            ? 'rounded-none border-0 shadow-none'
            : 'border border-[var(--border)] shadow-[var(--shadow-sm)] rounded-xl'
        }`}
      >
        {/* Mode accent line */}
        <div
          className="h-[2px] shrink-0 transition-colors duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, var(--mode-accent, var(--brand)), transparent)`,
            opacity: 0.4,
          }}
        />

        {/* View navigation bar — folder tabs */}
        {isMobile ? (
          <div
            className="shrink-0 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,black)] px-3 pb-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                    {workspaceLabel === 'KnotCode' ? 'Knot Code' : workspaceLabel}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      status === 'connected'
                        ? 'bg-emerald-400'
                        : status === 'connecting'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-[var(--text-disabled)]'
                    }`}
                  />
                </div>
              </div>

              {!modeSpec.terminalCenter && (
                <button
                  type="button"
                  onClick={() => layout.toggle('terminal')}
                  className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${
                    terminalVisible
                      ? 'border-[color-mix(in_srgb,var(--brand)_36%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                      : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                  }`}
                  title={`${terminalVisible ? 'Hide' : 'Show'} terminal`}
                >
                  <Icon icon="lucide:terminal" width={18} height={18} />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSettingsTab(undefined)
                  setSettingsVisible(true)
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]"
                title="Settings"
              >
                <Icon icon="lucide:settings-2" width={18} height={18} />
              </button>
            </div>

            {/* Gateway status text removed — dot in header is sufficient */}
          </div>
        ) : (
          <div
            data-tauri-drag-region
            className={`shell-topbar flex items-center h-12 shrink-0 px-4 gap-2 tauri-drag-region ${isMacTauri && sidebarCollapsed ? 'pl-20' : ''}`}
          >
            {/* Folder-style tab strip — hidden in TUI mode */}
            {!modeSpec.hideTabs && (
              <div ref={tabContainerRef} className="folder-tab-strip tauri-no-drag">
                {visibleViews.map((v, i) => {
                  const isActive = activeView === v
                  return (
                    <motion.button
                      key={v}
                      ref={(el) => {
                        tabRefs.current[i] = el
                      }}
                      onClick={() => setView(v)}
                      className={`folder-tab ${isActive ? 'folder-tab--active' : ''} ${flashedTab === v ? 'folder-tab--flash' : ''}`}
                      style={
                        {
                          '--color': isActive ? 'var(--text-primary)' : 'var(--text-disabled)',
                        } as React.CSSProperties
                      }
                      title={`${VIEW_ICONS[v].label} (\u2318${i + 1})`}
                      whileTap={{ scale: 0.95 }}
                      layout
                    >
                      <span className="flex items-center gap-2">
                        <Icon
                          icon={VIEW_ICONS[v].icon}
                          width={17}
                          height={17}
                          className="folder-tab__icon"
                        />
                        <span className="hidden sm:inline">{VIEW_ICONS[v].label}</span>
                        {v === 'git' && dirtyCount > 0 && (
                          <span className="px-2 min-w-[22px] text-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-[11px] leading-[22px] font-bold animate-badge-pop">
                            {dirtyCount}
                          </span>
                        )}
                      </span>
                    </motion.button>
                  )
                })}
                <motion.span
                  className="folder-tab-strip__slider"
                  animate={{
                    left: indicatorStyle.left + 6,
                    width: Math.max(0, indicatorStyle.width - 12),
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ '--opacity': indicatorStyle.width > 0 ? 1 : 0 } as React.CSSProperties}
                />
              </div>
            )}

            {/* Codex-style header with Open + Commit dropdowns when tabs are hidden */}
            {modeSpec.hideTabs && (
              <div className="flex items-center gap-1.5 tauri-no-drag">
                {/* Open dropdown */}
                <button
                  onClick={() => emit('open-folder')}
                  className="codex-header-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <Icon icon="lucide:folder-open" width={14} height={14} />
                  Open
                  <Icon icon="lucide:chevron-down" width={10} height={10} className="opacity-50" />
                </button>

                <span className="text-[var(--text-disabled)] text-[11px]">&middot;</span>

                {/* Commit dropdown */}
                <button
                  onClick={() => setView('git')}
                  className="codex-header-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  <Icon icon="lucide:git-commit-horizontal" width={14} height={14} />
                  Commit
                  <Icon icon="lucide:chevron-down" width={10} height={10} className="opacity-50" />
                </button>
              </div>
            )}

            <div className="flex-1 tauri-drag-region" data-tauri-drag-region />

            {/* Mode switcher — 3D pill group */}
            <div className="shell-mode-switcher tauri-no-drag">
              {MODE_BUTTONS.map((m, index) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`shell-mode-button ${mode === m.id ? 'shell-mode-button--active' : ''}`}
                  title={`${m.label} mode (⌘⇧${index + 1})`}
                >
                  <Icon icon={m.icon} width={15} height={15} />
                </button>
              ))}
            </div>

            {/* Change count badges */}
            {dirtyCount > 0 && (
              <div className="tauri-no-drag flex items-center gap-1.5 mr-1">
                <span className="codex-header-badge text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-[var(--color-additions,#22c55e)] bg-[color-mix(in_srgb,var(--color-additions,#22c55e)_10%,transparent)]">
                  +{dirtyCount}
                </span>
                <span className="codex-header-badge text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-[var(--color-deletions,#ef4444)] bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_10%,transparent)]">
                  -{dirtyCount}
                </span>
              </div>
            )}

            {/* Settings */}
            <button
              onClick={() => setSettingsVisible(true)}
              className="shell-utility-button tauri-no-drag"
              title="Settings"
            >
              <Icon icon="lucide:settings" width={18} height={18} className="animate-gear-sway" />
            </button>
          </div>
        )}

        {/* Mode transition wrapper */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`mode-${mode}-${modeSpec.terminalCenter && terminalVisible ? 'term' : 'view'}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
          >
            {/* TUI mode: gateway terminal fills center */}
            {modeSpec.terminalCenter ? (
              <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden rounded-xl border border-[var(--border)]">
                <GatewayTerminalLazy />
              </div>
            ) : (
              <ViewRouter />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Terminal — docked (desktop) / drawer (mobile) / floating */}
        {!modeSpec.terminalCenter && !isMobile ? (
          <motion.div
            initial={false}
            animate={{ height: terminalVisible && !terminalFloating ? terminalHeight + 3 : 0 }}
            transition={TERMINAL_SPRING}
            style={{ '--overflow': 'hidden' } as React.CSSProperties}
            className="shrink-0"
          >
            <div
              className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors opacity-0 hover:opacity-50 shrink-0"
              onMouseDown={(e) => {
                e.preventDefault()
                const startY = e.clientY
                const startH = terminalHeight
                const onMove = (ev: MouseEvent) =>
                  layout.resize('terminal', startH - (ev.clientY - startY))
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
            />
            {!terminalFloating && (
              <div
                className="shrink-0 border-t border-[var(--border)]"
                style={{ height: terminalHeight }}
              >
                <TerminalPanel
                  visible={terminalVisible && !terminalFloating}
                  height={terminalHeight}
                  onHeightChange={(h: number) => layout.resize('terminal', h)}
                  floating={terminalFloating}
                  onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
                  refreshOnOpenOrMode={true}
                  refreshToken={terminalRefreshToken}
                  startupCommand={terminalStartupCommand}
                />
              </div>
            )}
          </motion.div>
        ) : !modeSpec.terminalCenter ? (
          <AnimatePresence initial={false}>
            {terminalVisible && !terminalFloating && (
              <>
                <motion.button
                  key="terminal-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[70] bg-black/40"
                  onClick={() => layout.hide('terminal')}
                  aria-label="Close terminal"
                />
                <motion.div
                  key="terminal-drawer"
                  initial={{ y: 520 }}
                  animate={{ y: 0 }}
                  exit={{ y: 520 }}
                  transition={TERMINAL_SPRING}
                  className="fixed left-1.5 right-1.5 z-[80] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
                  style={
                    {
                      bottom: mobileTerminalOffset,
                      '--height': Math.min(
                        Math.max(terminalHeight, 260),
                        Math.floor(viewportHeight * 0.72),
                      ),
                    } as React.CSSProperties
                  }
                >
                  <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2.5">
                      <Icon
                        icon="lucide:terminal"
                        width={16}
                        height={16}
                        className="text-[var(--brand)]"
                      />
                      Terminal
                    </span>
                    <button
                      onClick={() => layout.hide('terminal')}
                      className="p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer tauri-no-drag hover:scale-110 transition-all"
                      title="Close"
                    >
                      <Icon icon="lucide:x" width={16} height={16} />
                    </button>
                  </div>
                  <div className="h-[calc(100%-48px)]">
                    <TerminalPanel
                      visible={terminalVisible && !terminalFloating}
                      height={terminalHeight}
                      onHeightChange={(h: number) => layout.resize('terminal', h)}
                      floating={terminalFloating}
                      onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
                      refreshOnOpenOrMode={true}
                      refreshToken={terminalRefreshToken}
                      startupCommand={terminalStartupCommand}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        ) : null}

        {terminalVisible && terminalFloating && !modeSpec.terminalCenter && (
          <FloatingPanel
            panel="terminal"
            title="Terminal"
            icon="lucide:terminal"
            onDock={() => layout.setFloating('terminal', false)}
            onClose={() => {
              layout.setFloating('terminal', false)
              layout.hide('terminal')
            }}
            minW={520}
            minH={280}
          >
            <TerminalPanel
              visible={terminalVisible}
              height={terminalHeight}
              onHeightChange={(h: number) => layout.resize('terminal', h)}
              floating={terminalFloating}
              onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
              refreshOnOpenOrMode={true}
              refreshToken={terminalRefreshToken}
              startupCommand={terminalStartupCommand}
            />
          </FloatingPanel>
        )}

        {showMobileBottomTabs && (
          <div
            className="shrink-0 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,black)] px-2 pt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${mobileViewTabs.length}, minmax(0, 1fr))`,
              }}
            >
              {mobileViewTabs.map((v) => {
                const isActive = activeView === v
                return (
                  <motion.button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    whileTap={{ scale: 0.97 }}
                    className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] px-2 py-2.5 text-[10px] font-medium transition ${
                      isActive
                        ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                        : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                    } ${flashedTab === v ? 'animate-badge-pop' : ''}`}
                    title={VIEW_ICONS[v].label}
                  >
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border ${
                        isActive
                          ? 'border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)]'
                          : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <Icon icon={VIEW_ICONS[v].icon} width={18} height={18} />
                      {v === 'git' && dirtyCount > 0 && (
                        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[var(--brand)] px-1 text-center text-[9px] font-bold leading-[18px] text-[var(--brand-contrast)]">
                          {dirtyCount > 9 ? '9+' : dirtyCount}
                        </span>
                      )}
                    </span>
                    <span className="max-w-full truncate">{VIEW_ICONS[v].label}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        {/* Status bar */}
        {!isMobile && <StatusBar agentActive={agentActive} />}
      </div>

      {/* Git sidebar panel — Codex-style always-visible right panel */}
      {!isMobile && mode !== 'tui' && !usePrismShell && layout.isVisible('gitPanel') && (
        <GitSidebarPanel />
      )}

      {/* Plugins */}
      <SpotifyPlugin />
      <YouTubePlugin />
      <PipWindow />
      <WidgetPipWindow />
      <PluginSlotRenderer slot="floating" />

      <AnimatePresence initial={false}>
        {showMobileSidebarButton && mobileSidebarOpen && (
          <>
            <motion.button
              key="mobile-sidebar-backdrop"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close workspace drawer"
            />
            <motion.div
              key="mobile-sidebar-drawer"
              initial={{ x: -32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -32, opacity: 0 }}
              transition={TERMINAL_SPRING}
              className="fixed left-2 z-[90]"
              style={{
                top: 'calc(env(safe-area-inset-top) + 0.5rem)',
                bottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)',
              }}
            >
              <div
                className="relative h-full"
                onClickCapture={(event) => {
                  const target = event.target as HTMLElement
                  if (target.closest('button')) {
                    requestAnimationFrame(() => setMobileSidebarOpen(false))
                  }
                }}
              >
                <WorkspaceSidebar
                  collapsed={false}
                  repoName={repo?.fullName || localRootPath?.split('/').pop()}
                />
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]"
                  aria-label="Close workspace drawer"
                >
                  <Icon icon="lucide:x" width={16} height={16} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal overlays */}
      <QuickOpen
        open={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        onSelect={(path, sha) => {
          emit('file-select', { path, sha })
          setQuickOpenVisible(false)
        }}
      />
      <GlobalSearch
        open={globalSearchVisible}
        onClose={() => setGlobalSearchVisible(false)}
        onNavigate={(path, line) => {
          emit('file-select', { path })
          setGlobalSearchVisible(false)
        }}
      />
      <CommandPalette
        open={commandPaletteVisible}
        onClose={() => setCommandPaletteVisible(false)}
        onRun={(cmdId) => {
          setCommandPaletteVisible(false)
          switch (cmdId) {
            case 'toggle-files':
              layout.toggle('tree')
              break
            case 'toggle-terminal':
              layout.toggle('terminal')
              break
            case 'toggle-chat':
              layout.toggle('chat')
              break
            case 'toggle-plugins':
              layout.toggle('plugins')
              break
            case 'toggle-git-panel':
              layout.toggle('gitPanel')
              break
            case 'collapse-editor':
              layout.setEditorCollapsed(true)
              break
            case 'layout-focus':
              layout.preset('focus')
              break
            case 'layout-review':
              layout.preset('review')
              break
            case 'view-editor':
              setView('editor')
              break
            case 'view-preview':
              setView('preview')
              break
            case 'view-git':
              setView('git')
              break
            case 'view-settings':
              setView('settings')
              break
            case 'view-workshop':
              setView('workshop')
              break
            case 'view-skills':
              setView('skills')
              break
            case 'find-files':
              setQuickOpenVisible(true)
              break
            case 'save-file':
              if (activeFile) saveFile(activeFile)
              break
            case 'git-commit':
              setView('git')
              layout.show('gitPanel')
              break
            case 'git-push':
              emit('agent-push')
              break
            case 'git-pull':
              setView('git')
              break
            case 'git-stash':
              setView('git')
              break
            case 'preview-refresh':
              emit('preview-refresh')
              break
            case 'open-onboarding':
              setOnboardingOpen(true)
              break
            case 'open-new-window':
              openNewEditorInstance().catch((err) =>
                console.error('Failed to open new window:', err),
              )
              break
          }
        }}
      />
      <ShortcutsOverlay open={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
      {settingsVisible && activeView !== 'settings' && (
        <SettingsPanel
          open={settingsVisible}
          onClose={() => {
            setSettingsVisible(false)
            setSettingsTab(undefined)
          }}
          initialTab={settingsTab}
        />
      )}
      <OnboardingTour open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
