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
import { fetchFileContentsByName as fetchFileContents, commitFilesByName as commitFiles } from '@/lib/github-api'
import { PluginSlotRenderer, usePlugins } from '@/context/plugin-context'
import { usePreview } from '@/context/preview-context'
import { SpotifyPlugin } from '@/components/plugins/spotify/spotify-plugin'
import { YouTubePlugin } from '@/components/plugins/youtube/youtube-plugin'
import { BranchPicker } from '@/components/branch-picker'
import { FolderIndicator } from '@/components/source-switcher'
import { ErrorBoundary } from '@/components/error-boundary'
import { OnboardingTour, isOnboardingComplete } from '@/components/onboarding-tour'
import type { AppMode } from '@/lib/mode-registry'

// View components — lazy loaded
const EditorView = dynamic(() => import('@/components/views/editor-view').then(m => ({ default: m.EditorView })), { ssr: false })
const GitView = dynamic(() => import('@/components/views/git-view').then(m => ({ default: m.GitView })), { ssr: false })
const PrView = dynamic(() => import('@/components/views/pr-view').then(m => ({ default: m.PrView })), { ssr: false })
const SettingsPanel = dynamic(() => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })), { ssr: false })

// Overlay modals — lazy loaded
const QuickOpen = dynamic(() => import('@/components/quick-open').then(m => ({ default: m.QuickOpen })), { ssr: false })
const GlobalSearch = dynamic(() => import('@/components/global-search').then(m => ({ default: m.GlobalSearch })), { ssr: false })
const CommandPalette = dynamic(() => import('@/components/command-palette').then(m => ({ default: m.CommandPalette })), { ssr: false })
const ShortcutsOverlay = dynamic(() => import('@/components/shortcuts-overlay').then(m => ({ default: m.ShortcutsOverlay })), { ssr: false })

const TerminalPanel = dynamic(() => import('@/components/terminal-panel').then(m => ({ default: m.TerminalPanel })), { ssr: false })
const PreviewPanel = dynamic(() => import('@/components/preview/preview-panel').then(m => ({ default: m.PreviewPanel })), { ssr: false })
const ComponentIsolatorListener = dynamic(() => import('@/components/preview/component-isolator').then(m => ({ default: m.ComponentIsolatorListener })), { ssr: false })

const PipWindow = dynamic(() => import('@/components/preview/pip-window').then(m => ({ default: m.PipWindow })), { ssr: false })
const WidgetPipWindow = dynamic(() => import('@/components/plugins/widget-pip-window').then(m => ({ default: m.WidgetPipWindow })), { ssr: false })

const VIEW_ICONS: Record<string, { icon: string; label: string }> = {
  editor: { icon: 'lucide:code-2', label: 'Editor' },
  preview: { icon: 'lucide:eye', label: 'Preview' },
  diff: { icon: 'lucide:git-compare', label: 'Diff' },
  git: { icon: 'lucide:git-branch', label: 'Git' },
  prs: { icon: 'lucide:git-pull-request', label: 'PRs' },
  settings: { icon: 'lucide:settings', label: 'Settings' },
}


const TERMINAL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

// ─── Spatial view transition variants ────────────────
const viewVariants = {
  enter: (dir: 'forward' | 'back') => ({
    x: dir === 'forward' ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 35 },
  },
  exit: (dir: 'forward' | 'back') => ({
    x: dir === 'forward' ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.15 },
  }),
}

// ─── Activity Pulse Ring ─────────────────────────────
function ActivityPulseRing({ status, agentActive }: { status: string; agentActive: boolean }) {
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || status === 'authenticating'

  const ringColor = agentActive && isConnected
    ? 'var(--brand)'
    : isConnected
      ? 'var(--color-additions, #22c55e)'
      : isConnecting
        ? 'var(--warning, #eab308)'
        : 'var(--text-disabled)'

  const statusTitle = isConnected
    ? (agentActive ? 'Agent working' : 'Connected')
    : isConnecting ? 'Connecting...' : 'Disconnected'

  return (
    <span className="relative w-4 h-4 flex items-center justify-center" title={statusTitle}>
      <motion.svg
        className="absolute inset-0 w-4 h-4"
        viewBox="0 0 16 16"
        animate={
          isConnecting
            ? { rotate: 360 }
            : isConnected
              ? { scale: [1, agentActive ? 1.25 : 1.12, 1], opacity: [0.5, 1, 0.5] }
              : { opacity: 0.4, scale: 1 }
        }
        transition={
          isConnecting
            ? { repeat: Infinity, duration: 2, ease: 'linear' }
            : isConnected
              ? { repeat: Infinity, duration: agentActive ? 1.2 : 3, ease: 'easeInOut' }
              : { duration: 0.3 }
        }
      >
        <circle
          cx="8" cy="8" r="6" fill="none"
          stroke={ringColor} strokeWidth="1.5"
          strokeDasharray={isConnecting ? '3 3' : undefined}
          strokeLinecap="round"
        />
      </motion.svg>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: ringColor }}
      />
    </span>
  )
}

const PLUGIN_META: Record<string, { label: string; icon: string; color: string }> = {
  'spotify-player': { label: 'Spotify', icon: 'simple-icons:spotify', color: '#1DB954' },
  'youtube-player': { label: 'YouTube', icon: 'mdi:youtube', color: '#FF0000' },
}

function SidebarPluginSlot() {
  const { slots, isPluginEnabled, togglePlugin, pipPluginId, setPipPluginId } = usePlugins()
  const layout = useLayout()
  const hiddenByLayout = !layout.isVisible('plugins')
  const pluginsResize = usePanelResize('plugins')
  const pluginsWidth = layout.getSize('plugins')
  const entries = slots.sidebar
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ce:sidebar-plugins-collapsed')
      if (stored === 'true') setCollapsed(true)
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem('ce:sidebar-plugins-collapsed', String(collapsed)) } catch {} }, [collapsed])

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [entries])
  const enabledSorted = useMemo(() => sorted.filter(e => isPluginEnabled(e.id) && e.id !== pipPluginId), [sorted, isPluginEnabled, pipPluginId])

  const [ratios, setRatios] = useState<Record<string, number>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ce:sidebar-plugin-ratios')
      if (raw) setRatios(JSON.parse(raw))
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('ce:sidebar-plugin-ratios', JSON.stringify(ratios)) } catch {}
  }, [ratios])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleDividerDrag = useCallback((e: React.MouseEvent, topId: string, bottomId: string) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const startY = e.clientY
    const containerRect = container.getBoundingClientRect()
    const totalHeight = containerRect.height - 24

    const currentRatios = { ...ratios }
    const count = enabledSorted.length
    const defaultRatio = 1 / count
    const topRatio = currentRatios[topId] ?? defaultRatio
    const bottomRatio = currentRatios[bottomId] ?? defaultRatio

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY
      const deltaRatio = delta / totalHeight
      const newTop = Math.max(0.15, Math.min(topRatio + bottomRatio - 0.15, topRatio + deltaRatio))
      const newBottom = topRatio + bottomRatio - newTop
      setRatios(prev => ({ ...prev, [topId]: newTop, [bottomId]: newBottom }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [ratios, enabledSorted])

  if (entries.length === 0) return null
  if (hiddenByLayout) return null

  const count = enabledSorted.length
  const defaultRatio = count > 0 ? 1 / count : 1

  return (
    <div
      className={`relative shrink-0 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden transition-[width] duration-200 ${collapsed ? 'w-[48px]' : ''}`}
      style={collapsed ? undefined : { width: pluginsWidth }}
    >
      {collapsed && (
        <div className="flex flex-col items-center pt-3 gap-2">
          {sorted.map(e => {
            const meta = PLUGIN_META[e.id]
            const icon = meta?.icon ?? 'lucide:puzzle'
            const color = meta?.color ?? 'var(--text-secondary)'
            const enabled = isPluginEnabled(e.id)
            return (
              <button
                key={e.id}
                onClick={() => setCollapsed(false)}
                className="p-2 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer"
                title={meta?.label ?? e.id}
              >
                <Icon icon={icon} width={16} height={16} style={{ color, opacity: enabled ? 1 : 0.3 }} />
              </button>
            )
          })}
        </div>
      )}
      <div className={collapsed ? 'hidden' : 'flex-1 flex flex-col min-h-0 overflow-hidden'}>
        {/* Add-on toggles header */}
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Add-ons</span>
          </div>
          <div className="flex flex-col gap-1">
            {sorted.map(e => {
              const meta = PLUGIN_META[e.id]
              const enabled = isPluginEnabled(e.id)
              return (
                <button
                  key={e.id}
                  onClick={() => togglePlugin(e.id)}
                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer group transition-colors"
                >
                  <Icon
                    icon={meta?.icon ?? 'lucide:puzzle'}
                    width={14}
                    height={14}
                    style={{ color: enabled ? (meta?.color ?? 'var(--text-secondary)') : 'var(--text-disabled)' }}
                  />
                  <span className={`text-xs flex-1 text-left ${enabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`}>
                    {meta?.label ?? e.id}
                  </span>
                  <div
                    className={`relative w-7 h-4 rounded-full transition-colors ${enabled ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {enabledSorted.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-4">
              <span className="text-xs text-[var(--text-disabled)] text-center">No add-ons enabled</span>
            </div>
          )}
          {enabledSorted.map((e, i) => {
            const C = e.component
            const ratio = ratios[e.id] ?? defaultRatio
            const meta = PLUGIN_META[e.id]
            return (
              <div key={e.id} className="flex flex-col min-h-0" style={{ flex: `${ratio} 1 0%` }}>
                {i > 0 && (
                  <div
                    className="h-[5px] shrink-0 cursor-row-resize group/divider relative z-10"
                    onMouseDown={ev => handleDividerDrag(ev, enabledSorted[i - 1].id, e.id)}
                  >
                    <div className="absolute inset-x-0 -top-[2px] -bottom-[2px]" />
                    <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/divider:opacity-30 group-hover/divider:bg-[var(--brand)] transition-all" />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden relative group/plugin">
                  {e.id === 'youtube-player' && (
                  <button
                    onClick={() => setPipPluginId(e.id)}
                    className="absolute top-1 right-1 z-10 p-1 rounded-md bg-[var(--bg-elevated)]/80 backdrop-blur-sm text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer opacity-0 group-hover/plugin:opacity-100 transition-opacity"
                    title={`Pop out ${meta?.label ?? 'plugin'}`}
                  >
                    <Icon icon="lucide:picture-in-picture-2" width={12} height={12} />
                  </button>
                  )}
                  <C />
                </div>
              </div>
            )
          })}
        </div>
        <button onClick={() => setCollapsed(true)} className="h-6 flex items-center justify-center text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0" title="Collapse">
          <Icon icon="lucide:panel-right-close" width={12} height={12} />
        </button>
        <div
          className="resize-handle absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--brand)] transition-all z-10 opacity-0 hover:opacity-60 hover:w-1.5"
          onMouseDown={pluginsResize.onResizeStart}
        />
      </div>
    </div>
  )
}

export default function EditorLayout() {
  const { status } = useGateway()
  const { repo, setRepo } = useRepo()
  const local = useLocal()
  const { files, activeFile, openFile, setActiveFile, markClean, updateFileContent } = useEditor()
  const { localMode, readFile: localReadFile, readFileBase64: localReadFileBase64, writeFile: localWriteFile, rootPath: localRootPath, gitInfo, openFolder: localOpenFolder, setRootPath: localSetRootPath, commitFiles: localCommitFiles } = local
  const { activeView, setView, direction } = useView()
  const { mode, spec: modeSpec, setMode } = useAppMode()
  const layout = useLayout()
  const visibleViews = modeSpec.visibleViews
  const isMobile = layout.isAtMost('lte768')
  const sidebarCollapsed = !layout.isVisible('sidebar')
  const terminalVisible = layout.isVisible('terminal')
  const terminalHeight = layout.getSize('terminal')
  const terminalFloating = layout.isFloating('terminal')

  // ─── Minimal state ──────────────────────────────────
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [isMacTauri, setIsMacTauri] = useState(false)

  const [flashedTab, setFlashedTab] = useState<ViewId | null>(null)
  const [connectionAnim, setConnectionAnim] = useState<'pop' | 'pulse' | null>(null)
  const prevStatusRef = useRef(status)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  // Agent activity state for pulse ring
  const [agentActive, setAgentActive] = useState(false)

  // Overlay modals
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [shortcutsVisible, setShortcutsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  // ─── Tauri detection ───────────────────────────────────
  useEffect(() => {
    setIsTauriDesktop(isTauri())
    setIsMacTauri(isTauri() && navigator.platform?.includes('Mac'))
  }, [])

  // ─── First-run onboarding (reopen via command palette/settings) ───
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isOnboardingComplete()) setOnboardingOpen(true)
    const open = () => setOnboardingOpen(true)
    window.addEventListener('open-onboarding', open)
    return () => window.removeEventListener('open-onboarding', open)
  }, [])

  // ─── Auto-populate RepoContext from local git remote ───
  useEffect(() => {
    if (local.remoteRepo && local.gitInfo?.branch) {
      const [owner, repoName] = local.remoteRepo.split('/')
      if (owner && repoName) {
        if (repo?.fullName !== local.remoteRepo || repo?.branch !== local.gitInfo.branch) {
          setRepo({ owner, repo: repoName, branch: local.gitInfo.branch, fullName: local.remoteRepo })
        }
      }
    }
  }, [local.remoteRepo, local.gitInfo?.branch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Layout persistence is handled by LayoutContext

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
    const onEngine = (e: Event) => {
      setAgentActive((e as CustomEvent).detail?.running ?? false)
    }
    window.addEventListener('engine-status', onEngine)
    return () => window.removeEventListener('engine-status', onEngine)
  }, [])

  const activeViewRef = useRef(activeView)
  activeViewRef.current = activeView

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
      if (meta && e.key === '\\') { e.preventDefault(); layout.toggle('sidebar') }
      // ⌘J / ⌘` — Toggle terminal (desktop only)
      if (meta && (e.key === 'j' || e.key === '`') && !e.shiftKey && isTauriDesktop) { e.preventDefault(); layout.toggle('terminal') }
      // ⌘L — Open side chat panel and focus input
      if (meta && e.key === 'l' && !e.shiftKey) { e.preventDefault(); if (activeViewRef.current !== 'editor') setView('editor'); window.dispatchEvent(new CustomEvent('open-side-chat')); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-agent-input'))) }
      // ⌘⌥1-4 — Focus key regions (explorer/editor/chat/terminal)
      if (meta && e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        if (activeViewRef.current !== 'editor') setView('editor')
        if (e.key === '1') { layout.show('tree'); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-tree'))) }
        if (e.key === '2') { requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-editor'))) }
        if (e.key === '3') { layout.show('chat'); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-agent-input'))) }
        if (e.key === '4' && isTauriDesktop) { layout.show('terminal'); requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('focus-terminal'))) }
      }
      // Esc — Close overlays
      if (e.key === 'Escape') {
        setQuickOpenVisible(false); setGlobalSearchVisible(false)
        setCommandPaletteVisible(false); setShortcutsVisible(false)
      }
      // ⌘⇧1/2/3 — Mode switching
      if (meta && e.shiftKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        const modes: AppMode[] = ['classic', 'chat', 'tui']
        const target = modes[parseInt(e.key) - 1]
        if (target) setMode(target)
        return
      }
      // ⌘1..N — View switching (mode-aware)
      if (meta && e.key >= '1' && e.key <= String(visibleViews.length)) {
        e.preventDefault()
        const target = visibleViews[parseInt(e.key) - 1]
        if (target) {
          setView(target)
          setFlashedTab(target)
          setTimeout(() => setFlashedTab(null), 400)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView, visibleViews, layout, isTauriDesktop])

  // ─── Event listeners ───────────────────────────────────
  useEffect(() => {
    const openSettings = () => setSettingsVisible(true)
    const openFolder = () => { localOpenFolder() }
    const openRecent = (e: Event) => {
      const path = (e as CustomEvent).detail?.path
      if (path) localSetRootPath(path)
    }
    // toggle-terminal is now handled by LayoutContext's event bridge
    window.addEventListener('open-settings', openSettings)
    window.addEventListener('open-folder', openFolder)
    window.addEventListener('open-recent', openRecent)
    return () => {
      window.removeEventListener('open-settings', openSettings)
      window.removeEventListener('open-folder', openFolder)
      window.removeEventListener('open-recent', openRecent)
    }
  }, [localOpenFolder, localSetRootPath])

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

      const fileKind = detectFileKind(path)
      const isBinary = fileKind !== 'text'

      // Local mode — read from filesystem
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

      // Fetch from GitHub
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
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, files, openFile, setActiveFile, setView, localMode, localReadFile, localReadFileBase64])

  // ─── Commit handler ────────────────────────────────────
  useEffect(() => {
    const handler = async (e: Event) => {
      const { message } = (e as CustomEvent).detail ?? {}
      if (!message) return

      if (localMode && localRootPath && gitInfo?.is_repo) {
        const dirtyFiles = files.filter(f => f.dirty)
        const gitPaths = gitInfo.status?.map(s => s.path) ?? []
        const allPaths = [...new Set([...dirtyFiles.map(f => f.path), ...gitPaths])]
        if (allPaths.length === 0) {
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: 'No changes to commit' } }))
          return
        }
        try {
          await localCommitFiles(message, allPaths)
          dirtyFiles.forEach(f => markClean(f.path))
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: true, fileCount: allPaths.length } }))
        } catch (err) {
          window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: String(err) } }))
        }
        return
      }

      if (!repo) return
      const dirtyFiles = files.filter(f => f.dirty)
      if (dirtyFiles.length === 0) return
      try {
        await commitFiles(repo.fullName, dirtyFiles.map(f => ({ path: f.path, content: f.content, sha: f.sha })), message, repo.branch)
        dirtyFiles.forEach(f => markClean(f.path))
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: true, fileCount: dirtyFiles.length } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('agent-commit-result', { detail: { success: false, error: String(err) } }))
      }
    }
    window.addEventListener('agent-commit', handler)
    return () => window.removeEventListener('agent-commit', handler)
  }, [repo, files, markClean, localMode, localRootPath, gitInfo, localCommitFiles])

  // ─── Git panel / changes panel / PR panel navigation ───
  useEffect(() => {
    const openGit = () => setView('git')
    const openPrs = () => setView('prs')
    const openPrCreate = () => {
      setView('prs')
      setTimeout(() => window.dispatchEvent(new CustomEvent('pr-open-create')), 100)
    }
    window.addEventListener('open-git-panel', openGit)
    window.addEventListener('open-changes-panel', openGit)
    window.addEventListener('open-prs-panel', openPrs)
    window.addEventListener('open-pr-create', openPrCreate)
    return () => {
      window.removeEventListener('open-git-panel', openGit)
      window.removeEventListener('open-changes-panel', openGit)
      window.removeEventListener('open-prs-panel', openPrs)
      window.removeEventListener('open-pr-create', openPrCreate)
    }
  }, [setView])

  // ─── Push handler ─────────────────────────────────────
  useEffect(() => {
    const handler = async () => {
      try {
        await local.push()
        window.dispatchEvent(new CustomEvent('agent-push-result', { detail: { success: true } }))
      } catch (err) {
        window.dispatchEvent(new CustomEvent('agent-push-result', { detail: { success: false, error: String(err) } }))
      }
    }
    window.addEventListener('agent-push', handler)
    return () => window.removeEventListener('agent-push', handler)
  }, [local])

  // ─── Save handler (⌘S + save-file event) ──────────────
  const saveFile = useCallback(async (path: string) => {
    const file = files.find(f => f.path === path)
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
          repo.branch
        )
        markClean(path)
      } catch (err) {
        console.error('Failed to save file to GitHub:', path, err)
      }
    }
  }, [files, localMode, localWriteFile, markClean, repo])

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (activeFile) saveFile(activeFile)
      }
    }
    const eventHandler = (e: Event) => {
      const { path } = (e as CustomEvent).detail ?? {}
      if (path) saveFile(path)
    }
    window.addEventListener('keydown', keyHandler)
    window.addEventListener('save-file', eventHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('save-file', eventHandler)
    }
  }, [activeFile, saveFile])

  const dirtyCount = useMemo(() => files.filter(f => f.dirty).length, [files])

  return (
    <div className="flex h-full w-full bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden gap-1.5 p-1.5">
      {/* Tauri drag region */}
      {isTauriDesktop && (
        <div data-tauri-drag-region className="tauri-drag-region fixed top-0 left-0 right-0 h-10 z-[9999] pointer-events-none" />
      )}

      {/* Workspace Sidebar */}
      {mode !== 'tui' && (
      <WorkspaceSidebar
        activeId={activeChatId ?? ''}
        onSelect={(id) => { setActiveChatId(id); (window as any).__pendingSwitchChat = id; setView('editor'); layout.show('chat'); setTimeout(() => window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id } })), 80) }}
        onNew={() => { const newId = crypto.randomUUID(); setActiveChatId(newId); (window as any).__pendingSwitchChat = newId; setView('editor'); layout.show('chat'); setTimeout(() => window.dispatchEvent(new CustomEvent('switch-chat', { detail: { id: newId } })), 80) }}
        onDelete={(id) => { if (id === activeChatId) { setActiveChatId(null) } }}
        collapsed={sidebarCollapsed}
        onToggle={() => layout.toggle('sidebar')}
        repoName={repo?.fullName || localRootPath?.split('/').pop()}
      />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-xl overflow-hidden border border-[var(--border)]">
        {/* Mode accent line */}
        <div className="h-[2px] shrink-0 transition-colors duration-500" style={{ background: `linear-gradient(90deg, transparent, var(--mode-accent, var(--brand)), transparent)`, opacity: 0.5 }} />
        {/* View navigation bar — folder tabs */}
        <div data-tauri-drag-region className={`flex items-center ${modeSpec.hideTabs ? 'h-10' : 'h-12'} bg-[var(--bg-elevated)] shrink-0 px-3 gap-1.5 tauri-drag-region ${isMacTauri && sidebarCollapsed ? 'pl-20' : ''}`}>
          {/* Folder-style tab strip — hidden in TUI mode */}
          {!modeSpec.hideTabs && (
          <div ref={tabContainerRef} className="folder-tab-strip tauri-no-drag">
            {visibleViews.map((v, i) => {
              const isActive = activeView === v
              return (
                <motion.button
                  key={v}
                  ref={el => { tabRefs.current[i] = el }}
                  onClick={() => setView(v)}
                  className={`folder-tab ${isActive ? 'folder-tab--active' : ''} ${flashedTab === v ? 'folder-tab--flash' : ''}`}
                  style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-disabled)' }}
                  title={`${VIEW_ICONS[v].label} (\u2318${i + 1})`}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
                  <span className="flex items-center gap-2">
                    <Icon icon={VIEW_ICONS[v].icon} width={17} height={17} className="folder-tab__icon" />
                    <span className="hidden sm:inline">{VIEW_ICONS[v].label}</span>
                    {v === 'git' && dirtyCount > 0 && (
                      <span className="px-1.5 min-w-[18px] text-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-[10px] leading-[18px] font-bold animate-badge-pop">{dirtyCount}</span>
                    )}
                  </span>
                </motion.button>
              )
            })}
            {/* Sliding accent under active tab */}
            <motion.span
              className="folder-tab-strip__slider"
              animate={{
                left: indicatorStyle.left + 6,
                width: Math.max(0, indicatorStyle.width - 12),
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ opacity: indicatorStyle.width > 0 ? 1 : 0 }}
            />
          </div>
          )}

          {/* TUI mode: minimal header label */}
          {modeSpec.hideTabs && (
            <div className="flex items-center gap-2 tauri-no-drag">
              <Icon icon="lucide:terminal" width={16} height={16} className="text-[var(--brand)]" />
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">Terminal</span>
              {localRootPath && (
                <span className="text-[11px] font-mono text-[var(--text-disabled)] ml-1 truncate max-w-[200px]">
                  {localRootPath.split('/').pop()}
                </span>
              )}
            </div>
          )}

          <div className="flex-1 tauri-drag-region" data-tauri-drag-region />

          {/* TUI: optional editor toggle */}
          {modeSpec.terminalCenter && (
            <button
              onClick={() => {
                // Toggle between terminal-only and showing the editor view underneath
                if (terminalVisible) {
                  layout.hide('terminal')
                  setView('editor')
                } else {
                  layout.show('terminal')
                }
              }}
              className={`tauri-no-drag p-2 rounded-lg hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${
                !terminalVisible ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
              title={terminalVisible ? 'Show Editor (⌘E)' : 'Back to Terminal'}
            >
              <Icon icon={terminalVisible ? 'lucide:code-2' : 'lucide:terminal'} width={18} height={18} />
            </button>
          )}

          {/* Mode switcher — 3D pill group */}
          <div className="tauri-no-drag flex items-center rounded-full bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] p-[3px] gap-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]">
            {([
              { id: 'classic' as AppMode, icon: 'lucide:code-2', label: 'Classic' },
              { id: 'chat' as AppMode, icon: 'lucide:message-square', label: 'Chat' },
              { id: 'tui' as AppMode, icon: 'lucide:terminal', label: 'TUI' },
            ]).map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`relative h-7 w-7 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
                  mode === m.id
                    ? 'bg-[var(--bg)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.06)_inset]'
                    : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                }`}
                title={`${m.label} mode (⌘⇧${['classic', 'chat', 'tui'].indexOf(m.id) + 1})`}
              >
                <Icon icon={m.icon} width={15} height={15} />
              </button>
            ))}
          </div>

          {/* Settings */}
          <button onClick={() => setSettingsVisible(true)} className="tauri-no-drag p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Settings">
            <Icon icon="lucide:settings" width={19} height={19} className="animate-gear-sway" />
          </button>
        </div>

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
        {/* TUI mode: terminal fills center */}
        {modeSpec.terminalCenter && terminalVisible ? (
          <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
            <TerminalPanel
              visible={true}
              height={9999}
              onHeightChange={() => {}}
            />
          </div>
        ) : (
        <>
        {/* Active view with spatial slide transition */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={activeView}
              custom={direction}
              variants={viewVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex-1 flex min-h-0 min-w-0 w-full overflow-hidden"
            >
              <ErrorBoundary key={activeView} fallbackLabel={`${VIEW_ICONS[activeView]?.label ?? activeView} failed to render`}>
                {activeView === 'editor' && <EditorView />}
                {activeView === 'preview' && <PreviewPanel />}

                {activeView === 'git' && <GitView />}
                {activeView === 'prs' && <PrView />}
                {activeView === 'settings' && (
                  <div className="flex-1 flex items-center justify-center">
                    <SettingsPanel open={true} onClose={() => setView('editor')} />
                  </div>
                )}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
        </>
        )}
          </motion.div>
        </AnimatePresence>

        {/* Terminal — docked (desktop) / drawer (mobile) / floating — hidden when TUI center terminal is active */}
        {!modeSpec.terminalCenter && !isMobile ? (
          <motion.div
            initial={false}
            animate={{ height: (terminalVisible && !terminalFloating) ? terminalHeight + 3 : 0 }}
            transition={TERMINAL_SPRING}
            style={{ overflow: 'hidden' }}
            className="shrink-0"
          >
            <div
              className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors opacity-0 hover:opacity-50 shrink-0"
              onMouseDown={e => {
                e.preventDefault()
                const startY = e.clientY
                const startH = terminalHeight
                const onMove = (ev: MouseEvent) => layout.resize('terminal', startH - (ev.clientY - startY))
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
            />
            <div className="shrink-0 border-t border-[var(--border)]" style={{ height: terminalHeight }}>
              <TerminalPanel
                visible={terminalVisible && !terminalFloating}
                height={terminalHeight}
                onHeightChange={(h: number) => layout.resize('terminal', h)}
                floating={terminalFloating}
                onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
              />
            </div>
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
                  className="fixed left-2 right-2 bottom-2 z-[80] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
                  style={{ height: Math.min(Math.max(terminalHeight, 260), Math.floor(window.innerHeight * 0.72)) }}
                >
                  <div className="h-10 flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <span className="text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <Icon icon="lucide:terminal" width={14} height={14} className="text-[var(--brand)]" />
                      Terminal
                    </span>
                    <button
                      onClick={() => layout.hide('terminal')}
                      className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer tauri-no-drag"
                      title="Close"
                    >
                      <Icon icon="lucide:x" width={14} height={14} />
                    </button>
                  </div>
                  <div className="h-[calc(100%-40px)]">
                    <TerminalPanel
                      visible={terminalVisible && !terminalFloating}
                      height={terminalHeight}
                      onHeightChange={(h: number) => layout.resize('terminal', h)}
                      floating={terminalFloating}
                      onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
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
            onClose={() => { layout.setFloating('terminal', false); layout.hide('terminal') }}
            minW={520}
            minH={280}
          >
            <TerminalPanel
              visible={terminalVisible}
              height={terminalHeight}
              onHeightChange={(h: number) => layout.resize('terminal', h)}
              floating={terminalFloating}
              onToggleFloating={() => layout.setFloating('terminal', !terminalFloating)}
            />
          </FloatingPanel>
        )}

        {/* Status bar */}
        <footer className="flex items-center justify-between px-3 h-[22px] border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] text-[var(--text-tertiary)] shrink-0">
          <div className="flex items-center gap-3">
            {/* Mode indicator dot */}
            <span className="flex items-center gap-1.5" title={`${modeSpec.label} mode`}>
              <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: 'var(--mode-accent, var(--brand))' }} />
              <span className="text-[var(--text-disabled)] font-medium">{modeSpec.label}</span>
            </span>
            <FolderIndicator />
            <BranchPicker />
            {dirtyCount > 0 && (
              <span key={dirtyCount} className="flex items-center gap-1 text-[var(--warning,#eab308)] animate-badge-pop">
                <Icon icon="lucide:circle-dot" width={8} height={8} />
                {dirtyCount} unsaved
              </span>
            )}
            {/* Active file path */}
            {activeFile && (
              <span className="text-[var(--text-disabled)] font-mono truncate max-w-[200px]" title={activeFile.path}>
                {activeFile.path}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PluginSlotRenderer slot="status-bar-right" />
            {/* Connection status */}
            <span className="flex items-center gap-1" title={status === 'connected' ? 'Gateway connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}>
              <span className={`w-[5px] h-[5px] rounded-full ${
                status === 'connected' ? 'bg-emerald-400' :
                status === 'connecting' ? 'bg-amber-400 animate-pulse' :
                'bg-red-400'
              }`} />
            </span>
            <span className="text-[var(--text-disabled)] font-medium">Knot Code</span>
            <ActivityPulseRing status={status} agentActive={agentActive} />
          </div>
        </footer>
      </div>

      {/* Sidebar plugins (Spotify, etc.) */}
      <SidebarPluginSlot />

      {/* Plugins */}
      <SpotifyPlugin />
      <YouTubePlugin />
      <PipWindow />
      <WidgetPipWindow />
      {activeView === 'preview' && <ComponentIsolatorListener />}
      <PluginSlotRenderer slot="floating" />

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
        onRun={(cmdId) => {
          setCommandPaletteVisible(false)
          switch (cmdId) {
            // Layout toggles — direct via layout context
            case 'toggle-files': layout.toggle('tree'); break
            case 'toggle-terminal': layout.toggle('terminal'); break
            case 'toggle-chat': layout.toggle('chat'); break
            case 'toggle-plugins': layout.toggle('plugins'); break
            case 'collapse-editor': layout.setEditorCollapsed(true); break
            // Layout presets
            case 'layout-focus': layout.preset('focus'); break
            case 'layout-review': layout.preset('review'); break
            // Navigation
            case 'view-editor': setView('editor'); break
            case 'view-preview': setView('preview'); break

            case 'view-git': setView('git'); break
            case 'view-prs': setView('prs'); break
            case 'view-settings': setView('settings'); break
            // File operations
            case 'find-files': setQuickOpenVisible(true); break
            case 'save-file': if (activeFile) saveFile(activeFile); break
            // Git operations
            case 'git-commit': setView('git'); break
            case 'git-push': window.dispatchEvent(new CustomEvent('agent-push')); break
            case 'git-pull': setView('git'); break
            case 'git-stash': setView('git'); break
            // PR operations
            case 'pr-create': window.dispatchEvent(new CustomEvent('open-pr-create')); break
            // Preview operations
            case 'preview-refresh': window.dispatchEvent(new CustomEvent('preview-refresh')); break
            // Onboarding
            case 'open-onboarding': setOnboardingOpen(true); break
          }
        }}
      />
      <ShortcutsOverlay open={shortcutsVisible} onClose={() => setShortcutsVisible(false)} />
      {settingsVisible && activeView !== 'settings' && (
        <SettingsPanel open={settingsVisible} onClose={() => setSettingsVisible(false)} />
      )}
      <OnboardingTour open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
