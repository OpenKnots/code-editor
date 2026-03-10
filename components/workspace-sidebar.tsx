'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { useThread, THREAD_IDS, type ThreadId } from '@/context/thread-context'
import { useView } from '@/context/view-context'
import { useEditor } from '@/context/editor-context'
import { formatShortcut } from '@/lib/platform'
import { isTauri, openExternal } from '@/lib/tauri'
import { emit, on } from '@/lib/events'

const SIDEBAR_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }
const CHAT_PREFIX = 'code-editor:chat:'

interface ThreadPreview {
  id: ThreadId
  title: string
  timestamp: number
  messageCount: number
  workspace?: string
}

function getThreadPreviews(): ThreadPreview[] {
  const out: ThreadPreview[] = []
  try {
    for (const id of THREAD_IDS) {
      const saved = localStorage.getItem(`${CHAT_PREFIX}${id}`)
      if (!saved) continue
      const messages = (
        JSON.parse(saved) as Array<{
          role: string
          content: string
          timestamp: number
        }>
      ).filter((m) => {
        const c = m.content?.slice(0, 120) ?? ''
        return !c.includes('You are KnotCode Agent') && !c.includes('KnotCode system prompt')
      })
      if (!messages.length) continue
      const firstUser = messages.find((m) => m.role === 'user')
      if (!firstUser) continue
      const last = messages[messages.length - 1]
      out.push({
        id,
        title: firstUser.content.slice(0, 50).replace(/\n/g, ' '),
        timestamp: last?.timestamp ?? Date.now(),
        messageCount: messages.length,
      })
    }
    out.sort((a, b) => b.timestamp - a.timestamp)
  } catch {}
  return out
}

function formatAge(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

interface Props {
  collapsed?: boolean
  onToggle?: () => void
  repoName?: string
}

export function WorkspaceSidebar({ collapsed, onToggle, repoName }: Props) {
  const layout = useLayout()
  const { activeThreadId, setActiveThreadId, maxThreads } = useThread()
  const { activeView, setView } = useView()
  const { files } = useEditor()
  const sidebarResize = usePanelResize('sidebar')
  const sidebarWidth = layout.getSize('sidebar')
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [threads, setThreads] = useState<ThreadPreview[]>([])

  const refreshThreads = useCallback(() => setThreads(getThreadPreviews()), [])

  useEffect(() => {
    setIsTauriDesktop(isTauri())
  }, [])

  useEffect(() => {
    refreshThreads()
  }, [refreshThreads, activeThreadId])

  useEffect(() => {
    return on('threads-updated', refreshThreads)
  }, [refreshThreads])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        onToggle?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onToggle])

  const workspaceLabel = useMemo(() => {
    if (repoName) return repoName.split('/').pop() ?? repoName
    return null
  }, [repoName])

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])

  const handleNewThread = useCallback(() => {
    const previews = getThreadPreviews()
    const usedIds = new Set(previews.map((p) => p.id))
    const emptySlot = THREAD_IDS.find((id) => !usedIds.has(id))
    if (emptySlot) {
      setActiveThreadId(emptySlot)
      emit('threads-updated')
      return
    }
    if (previews.length >= maxThreads) {
      const oldest = previews[previews.length - 1]
      try {
        localStorage.removeItem(`${CHAT_PREFIX}${oldest.id}`)
      } catch {}
      setActiveThreadId(oldest.id)
      emit('threads-updated')
    }
  }, [setActiveThreadId, maxThreads])

  const handleSelectThread = useCallback(
    (id: ThreadId) => {
      setActiveThreadId(id)
    },
    [setActiveThreadId],
  )

  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? 56 : sidebarWidth }}
      transition={SIDEBAR_SPRING}
      className={`codex-sidebar shell-sidebar relative flex flex-col shrink-0 overflow-hidden ${
        collapsed
          ? `shell-sidebar--collapsed items-center gap-2 ${isTauriDesktop ? 'pt-8' : 'pt-3'} pb-3`
          : 'shell-sidebar--expanded h-full'
      }`}
    >
      {collapsed ? (
        <>
          {/* Top: View navigation */}
          <button
            onClick={() => setView('chat')}
            className={`activity-bar-btn ${activeView === 'chat' ? 'activity-bar-btn--active' : ''}`}
            title="Chat (⌘1)"
          >
            <Icon icon="lucide:message-circle" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('editor')}
            className={`activity-bar-btn ${activeView === 'editor' ? 'activity-bar-btn--active' : ''}`}
            title="Editor (⌘2)"
          >
            <Icon icon="lucide:code" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('preview')}
            className={`activity-bar-btn ${activeView === 'preview' ? 'activity-bar-btn--active' : ''}`}
            title="Preview (⌘3)"
          >
            <Icon icon="lucide:eye" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('git')}
            className={`activity-bar-btn ${activeView === 'git' ? 'activity-bar-btn--active' : ''}`}
            title="Git (⌘4)"
          >
            <Icon icon="lucide:git-branch" width={24} height={24} />
            {dirtyCount > 0 && (
              <span className="activity-bar-badge">{dirtyCount > 9 ? '9+' : dirtyCount}</span>
            )}
          </button>

          <button
            onClick={() => setView('skills')}
            className={`activity-bar-btn ${activeView === 'skills' ? 'activity-bar-btn--active' : ''}`}
            title="Skills (⌘5)"
          >
            <Icon icon="lucide:wand-2" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('prompts')}
            className={`activity-bar-btn ${activeView === 'prompts' ? 'activity-bar-btn--active' : ''}`}
            title="Prompts (⌘6)"
          >
            <Icon icon="lucide:book-open" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('kanban')}
            className={`activity-bar-btn ${activeView === 'kanban' ? 'activity-bar-btn--active' : ''}`}
            title="Kanban (⌘7)"
          >
            <Icon icon="lucide:kanban" width={24} height={24} />
          </button>

          <button
            onClick={() => setView('workshop')}
            className={`activity-bar-btn ${activeView === 'workshop' ? 'activity-bar-btn--active' : ''}`}
            title="Workshop (⌘9)"
          >
            <Icon icon="lucide:hammer" width={24} height={24} />
          </button>

          {/* Divider */}
          <div className="flex-1" />
          <div className="activity-bar-divider" />

          {/* Bottom: Settings & Mode */}
          <button
            onClick={() => setView('settings')}
            className={`activity-bar-btn ${activeView === 'settings' ? 'activity-bar-btn--active' : ''}`}
            title="Settings"
          >
            <Icon icon="lucide:settings" width={24} height={24} />
          </button>

          <button
            onClick={onToggle}
            className="activity-bar-btn"
            title={`Expand sidebar (${formatShortcut('meta+\\')})`}
          >
            <Icon icon="lucide:panel-left" width={24} height={24} />
          </button>

          {/* Mini User Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--brand, #3b82f6), var(--accent, #8b5cf6))',
              color: 'var(--brand-contrast, #fff)',
            }}
            title={workspaceLabel || 'KnotCode'}
          >
            {(workspaceLabel || 'V').charAt(0).toUpperCase()}
          </div>
        </>
      ) : (
        <>
          <div className={`flex flex-col ${isTauriDesktop ? 'pt-7' : 'pt-3'} px-3`}>
            <div className="codex-sidebar-hero">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="codex-sidebar-hero__icon">
                  <Icon icon="lucide:command" width={15} height={15} />
                </span>
                <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">
                  {workspaceLabel || 'KnotCode'}
                </span>
              </div>
              {onToggle && (
                <button
                  type="button"
                  onClick={onToggle}
                  className="codex-sidebar-hero__action"
                  title={`Collapse sidebar (${formatShortcut('meta+\\')})`}
                >
                  <Icon icon="lucide:panel-left-close" width={15} height={15} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <button
                onClick={handleNewThread}
                className="codex-sidebar-new-thread flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--text-primary)] transition-all cursor-pointer"
              >
                <Icon
                  icon="lucide:circle-plus"
                  width={16}
                  height={16}
                  className="text-[var(--brand)]"
                />
                New thread
              </button>
              <button
                onClick={() => emit('open-folder')}
                className="codex-sidebar-hero__action shrink-0"
                title="Open Folder"
              >
                <Icon icon="lucide:mail" width={15} height={15} />
              </button>
            </div>

            {/* View Navigation */}
            <div className="mt-2 flex flex-col gap-0.5">
              {[
                {
                  id: 'chat' as const,
                  icon: 'lucide:message-circle',
                  label: 'Chat',
                  shortcut: '⌘1',
                },
                { id: 'editor' as const, icon: 'lucide:code', label: 'Editor', shortcut: '⌘2' },
                { id: 'preview' as const, icon: 'lucide:eye', label: 'Preview', shortcut: '⌘3' },
                { id: 'git' as const, icon: 'lucide:git-branch', label: 'Git', shortcut: '⌘4' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`sidebar-view-nav group relative ${activeView === item.id ? 'sidebar-view-nav--active' : ''}`}
                >
                  {activeView === item.id && (
                    <motion.div
                      layoutId="activeNavItem"
                      className="absolute inset-0 bg-[var(--bg-subtle)] rounded-lg"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon icon={item.icon} width={16} height={16} className="shrink-0 relative z-10" />
                  <span className="truncate relative z-10">{item.label}</span>
                  {item.id === 'git' && dirtyCount > 0 && (
                    <span className="ml-auto px-1.5 min-w-[20px] text-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-[10px] leading-[18px] font-bold shrink-0 relative z-10">
                      {dirtyCount}
                    </span>
                  )}
                  {item.id !== 'git' && (
                    <span className="ml-auto text-[10px] text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}

              <div className="h-px my-1.5 bg-[var(--border)]" style={{ opacity: 0.3 }} />

              {[
                { id: 'skills' as const, icon: 'lucide:wand-2', label: 'Skills', shortcut: '⌘5' },
                {
                  id: 'prompts' as const,
                  icon: 'lucide:book-open',
                  label: 'Prompts',
                  shortcut: '⌘6',
                },
                { id: 'kanban' as const, icon: 'lucide:kanban', label: 'Kanban', shortcut: '⌘7' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`sidebar-view-nav group relative ${activeView === item.id ? 'sidebar-view-nav--active' : ''}`}
                >
                  {activeView === item.id && (
                    <motion.div
                      layoutId="activeNavItem"
                      className="absolute inset-0 bg-[var(--bg-subtle)] rounded-lg"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon icon={item.icon} width={16} height={16} className="shrink-0 relative z-10" />
                  <span className="truncate relative z-10">{item.label}</span>
                  <span className="ml-auto text-[10px] text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                    {item.shortcut}
                  </span>
                </button>
              ))}

              <div className="h-px my-1.5 bg-[var(--border)]" style={{ opacity: 0.3 }} />

              {[
                {
                  id: 'workshop' as const,
                  icon: 'lucide:hammer',
                  label: 'Workshop',
                  shortcut: '⌘9',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`sidebar-view-nav group relative ${activeView === item.id ? 'sidebar-view-nav--active' : ''}`}
                >
                  {activeView === item.id && (
                    <motion.div
                      layoutId="activeNavItem"
                      className="absolute inset-0 bg-[var(--bg-subtle)] rounded-lg"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon icon={item.icon} width={16} height={16} className="shrink-0 relative z-10" />
                  <span className="truncate relative z-10">{item.label}</span>
                  <span className="ml-auto text-[10px] text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                    {item.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Threads section */}
          <div className="mt-3 px-3 flex-1 overflow-y-auto min-h-0">
            <p className="codex-sidebar-section-label">Threads</p>

            {workspaceLabel && (
              <div className="mb-2">
                <button
                  onClick={() => emit('open-folder')}
                  className="codex-sidebar-workspace flex items-center gap-2 px-2 py-1.5 text-[11px] text-[var(--text-tertiary)] font-medium cursor-pointer transition-colors w-full rounded-md"
                >
                  <Icon icon="lucide:folder" width={13} height={13} />
                  <span className="truncate">{workspaceLabel}</span>
                  <Icon
                    icon="lucide:chevron-down"
                    width={10}
                    height={10}
                    className="ml-auto opacity-50"
                  />
                </button>

                <div className="mt-0.5 space-y-px">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => handleSelectThread(thread.id)}
                      className={`codex-sidebar-thread group flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer w-full ${
                        activeThreadId === thread.id
                          ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                          : 'hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
                          {thread.title}
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-disabled)] font-mono shrink-0">
                        {formatAge(thread.timestamp)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!workspaceLabel && threads.length > 0 && (
              <div className="space-y-px">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread.id)}
                    className={`codex-sidebar-thread group flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer w-full ${
                      activeThreadId === thread.id
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
                        {thread.title}
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--text-disabled)] font-mono shrink-0">
                      {formatAge(thread.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {threads.length === 0 && (
              <p className="text-[12px] text-[var(--text-disabled)] px-2 py-4 text-center">
                No conversations yet
              </p>
            )}
          </div>

          {/* Bottom section */}
          <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] shrink-0 space-y-0.5">
            <button
              onClick={() => setView('settings')}
              className={`codex-sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-all cursor-pointer w-full ${
                activeView === 'settings'
                  ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon icon="lucide:settings" width={18} height={18} />
              Settings
            </button>
            <button
              onClick={() => openExternal('https://x.com/OpenKnot')}
              className="codex-sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-full"
            >
              <Icon icon="ri:twitter-x-fill" width={18} height={18} />
              Get Help
            </button>
            <button
              onClick={() => emit('focus-agent-input')}
              className="codex-sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-full"
            >
              <Icon icon="lucide:search" width={18} height={18} />
              Search
            </button>

            {/* User / workspace footer */}
            <div className="codex-sidebar-user-footer mt-2 flex items-center gap-2.5 px-2 py-2.5 rounded-lg cursor-default">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[12px] font-semibold text-[var(--text-secondary)]">
                {(workspaceLabel || 'K').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {workspaceLabel || 'KnotCode'}
                </div>
                <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                  Agent workspace
                </div>
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--brand)] transition-all z-10 opacity-0 hover:opacity-60 hover:w-1.5"
            onMouseDown={sidebarResize.onResizeStart}
          />
        </>
      )}
    </motion.div>
  )
}
