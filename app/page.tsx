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
import { EditorTabs } from '@/components/editor-tabs'
import { formatShortcut } from '@/lib/platform'
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
  () => import('@/components/git-sidebar-panel').then((m) => m.GitSidebarPanel),
  { ssr: false },
)

// Overlay modals — lazy loaded
const QuickOpen = dynamic(() => import('@/components/quick-open').then((m) => m.QuickOpen), {
  ssr: false,
})
const GlobalSearch = dynamic(
  () => import('@/components/global-search').then((m) => m.GlobalSearch),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('@/components/command-palette').then((m) => m.CommandPalette),
  { ssr: false },
)
const ShortcutsOverlay = dynamic(
  () => import('@/components/shortcuts-overlay').then((m) => m.ShortcutsOverlay),
  { ssr: false },
)
const TerminalPanel = dynamic(
  () => import('@/components/terminal-panel').then((m) => m.TerminalPanel),
  { ssr: false },
)
const GatewayTerminalLazy = dynamic(
  () => import('@/components/gateway-terminal').then((m) => m.GatewayTerminal),
  { ssr: false },
)
const PipWindow = dynamic(
  () => import('@/components/preview/pip-window').then((m) => m.PipWindow),
  { ssr: false },
)
const WidgetPipWindow = dynamic(
  () => import('@/components/plugins/widget-pip-window').then((m) => m.WidgetPipWindow),
  { ssr: false },
)
const OnboardingTour = dynamic(
  () => import('@/components/onboarding-tour').then((m) => m.OnboardingTour),
  { ssr: false },
)
const PluginSlotRenderer = dynamic(
  () => import('@/context/plugin-context').then((m) => m.PluginSlotRenderer),
  { ssr: false },
)

const VIEW_ICONS: Record<string, { icon: string; label: string }> = {
  chat: { icon: 'lucide:message-square', label: 'Chat' },
  editor: { icon: 'lucide:code-2', label: 'Editor' },
  preview: { icon: 'lucide:eye', label: 'Preview' },
  diff: { icon: 'lucide:git-compare', label: 'Diff' },
  git: { icon: 'lucide:git-branch', label: 'Git' },
  skills: { icon: 'lucide:sparkles', label: 'Skills' },
  prompts: { icon: 'lucide:book-open', label: 'Prompts' },
  settings: { icon: 'lucide:settings', label: 'Settings' },
  terminal: { icon: 'lucide:terminal', label: 'Terminal' },
  kanban: { icon: 'lucide:kanban', label: 'Kanban' },
  mcp: { icon: 'lucide:plug', label: 'MCP' },
  workshop: { icon: 'lucide:hammer', label: 'Workshop' },
  'agent-builder': { icon: 'lucide:bot', label: 'Agent Builder' },
}

/** Primary view cycle: Chat → Editor → Terminal */
const VIEW_CYCLE: ViewId[] = ['chat', 'editor', 'terminal']

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
  const useCenteredTerminal = modeSpec.terminalCenter && activeView === 'editor'
  const terminalStartupCommand = useCenteredTerminal ? 'openclaw tui' : undefined
  const mobileViewTabs = useMemo(() => {
    // On mobile, curate tabs to useful views + always include settings
    const mobile = visibleViews.filter((v) => !['preview', 'diff', 'skills', 'prompts'].includes(v))
    if (!mobile.includes('terminal')) mobile.push('terminal')
    return mobile.slice(0, 5)
  }, [visibleViews])
  const activeViewMeta = VIEW_ICONS[activeView] ?? {
    icon: 'lucide:layout-panel-top',
    label: 'Workspace',
  }
  const workspaceLabel = useMemo(
    () => repo?.fullName?.split('/').pop() ?? localRootPath?.split('/').pop() ?? 'KnotCode',
    [repo?.fullName, localRootPath],
  )
  const showMobileBottomTabs = isMobile && !modeSpec.terminalCenter && keyboardOffset === 0
  const showMobileSidebarButton = isMobile && mode !== 'tui'
  const showWorkflowEditorTabs = false
  const mobileTerminalOffset = showMobileBottomTabs
    ? 'calc(env(safe-area-inset-bottom) + 5.75rem)'
    : 'calc(env(safe-area-inset-bottom) + 0.5rem)'

  // ─── Minimal state ──────────────────────────────────
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)
  const [flashedTab, setFlashedTab] = useState<ViewId | null>(null)
  const [connectionAnim, setConnectionAnim] = useState<'pop' | 'pulse' | null>(null)
  const prevStatusRef = useRef(status)
  const [agentActive, setAgentActive] = useState(false)
  const [devServerReady, setDevServerReady] = useState(false)

  // Overlay modals
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])
  const ensureTuiTerminalVisible = useCallback(() => {
    layout.setFloating('terminal', false)
    layout.show('terminal')
  }, [layout])

  // Entering TUI should always surface the terminal view.
  useEffect(() => {
    if (!useCenteredTerminal) return
    ensureTuiTerminalVisible()
  }, [useCenteredTerminal, ensureTuiTerminalVisible])

  // ─── Tauri detection ───────────────────────────────────
  useEffect(() => {
    setIsTauriDesktop(isTauri())
    setIsMacTauri(isTauri() && navigator.platform?.includes('Mac'))
  }, [])

  useEffect(() => {
    if (!isMobile || mode === 'tui') {
      setMobileSidebarOpen(false)
    }
  }, [isMobile, mode])

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

  // ─── Dev server detection ─────────────────────────────
  useEffect(() => {
    const checkDevServer = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)
        await fetch('http://localhost:3000', { mode: 'no-cors', signal: controller.signal })
        clearTimeout(timeoutId)
        setDevServerReady(true)
      } catch {
        setDevServerReady(false)
      }
    }

    checkDevServer()
    const interval = setInterval(checkDevServer, 5000)
    return () => clearInterval(interval)
  }, [])

  // ─── Save file handler ─────────────────────────────────
  const saveFile = useCallback(
    async (path: string) => {
      const file = files.find((f) => f.path === path)
      if (!file || !file.dirty) return

      if (localMode && localWriteFile && localRootPath) {
        try {
          await localWriteFile(path, file.content)
          markClean(path)
          return
        } catch (err) {
          console.error('Failed to save file:', path, err)
        }
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
    [files, localMode, localRootPath, localWriteFile, markClean, repo],
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
        setView('settings')
      }),
      on('open-agent-settings', () => {
        setView('settings')
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

      const revealEditorFromChat = () => {
        if (activeView === 'chat') {
          layout.show('chat')
        }
        setView('editor')
      }

      const existing = files.find((f) => f.path === path)
      if (existing) {
        setActiveFile(path)
        revealEditorFromChat()
        return
      }

      if (providedContent != null) {
        openFile(path, providedContent, sha ?? '')
        revealEditorFromChat()
        return
      }

      const fileKind = detectFileKind(path)
      const isBinary = fileKind !== 'text'

      if (localMode && localReadFile && localRootPath) {
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
          revealEditorFromChat()
          return
        } catch (err) {
          console.error('Failed to read local file:', path, err)
        }
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
          revealEditorFromChat()
        } catch (err) {
          console.error('Failed to open file:', path, err)
        }
      }
    })
  }, [
    repo,
    files,
    openFile,
    setActiveFile,
    setView,
    activeView,
    layout,
    localMode,
    localRootPath,
    localReadFile,
    localReadFileBase64,
  ])

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
        isMobile ? 'gap-0 p-0' : 'gap-1 p-1'
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
      {!isMobile && mode !== 'tui' && (
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
            className="shrink-0 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,black)] px-4 pb-1.5"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.25rem)', minHeight: 44 }}
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[17px] font-semibold text-[var(--text-primary)] tracking-tight">
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
                onClick={() => setView('settings')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]"
                title="Settings"
              >
                <Icon icon="lucide:settings-2" width={18} height={18} />
              </button>
            </div>

            {/* Gateway status text removed — dot in header is sufficient */}
          </div>
        ) : isMacTauri ? (
          <div
            data-tauri-drag-region
            className="shell-topbar flex items-center h-8 shrink-0 px-4 gap-2 tauri-drag-region pl-20"
          />
        ) : null}

        {showWorkflowEditorTabs && <EditorTabs onTabSelect={() => setView('editor')} />}

        {/* Mode transition wrapper */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`mode-${mode}-${useCenteredTerminal && terminalVisible ? 'term' : activeView}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
          >
            {/* TUI mode: gateway terminal fills center */}
            {useCenteredTerminal ? (
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
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  className="fixed left-1.5 right-1.5 z-[80] overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col"
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
                  <div className="flex justify-center pt-2 pb-0.5">
                    <div className="w-9 h-1 rounded-full bg-[var(--text-disabled)] opacity-40" />
                  </div>
                  <div className="h-11 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
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
                  <div className="flex-1 min-h-0">
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
            className="shrink-0 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_96%,black)]"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              overscrollBehavior: 'none',
            }}
          >
            {/* Primary view cycle toggle: Chat → Editor → Terminal */}
            <div className="flex items-center justify-center gap-1 px-3 py-2">
              {VIEW_CYCLE.map((v) => {
                const isActive = activeView === v
                const meta = VIEW_ICONS[v]
                return (
                  <motion.button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    whileTap={{ scale: 0.95 }}
                    className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-medium transition-all duration-200 touch-manipulation ${
                      isActive
                        ? 'bg-[var(--brand)] text-[var(--brand-contrast)] shadow-[0_4px_16px_color-mix(in_srgb,var(--brand)_30%,transparent)]'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Icon icon={meta.icon} width={18} height={18} />
                    {isActive && (
                      <motion.span
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden whitespace-nowrap"
                      >
                        {meta.label}
                      </motion.span>
                    )}
                  </motion.button>
                )
              })}

              {/* More views overflow */}
              <motion.button
                type="button"
                onClick={() => setView('settings')}
                whileTap={{ scale: 0.95 }}
                className="flex items-center justify-center w-10 h-10 rounded-full text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon icon="lucide:more-horizontal" width={18} height={18} />
              </motion.button>
            </div>
          </div>
        )}

        {/* Status bar */}
        {!isMobile && <StatusBar agentActive={agentActive} devServerReady={devServerReady} />}
      </div>

      {/* Git sidebar panel — Codex-style always-visible right panel */}
      {!isMobile && mode !== 'tui' && layout.isVisible('gitPanel') && <GitSidebarPanel />}

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
              className="fixed inset-0 z-[85] bg-black/60"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close workspace drawer"
            />
            <motion.div
              key="mobile-sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="fixed left-0 z-[90] w-[280px]"
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
            case 'view-skills':
              setView('skills')
              break
            case 'view-prompts':
              setView('prompts')
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

      <OnboardingTour open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
