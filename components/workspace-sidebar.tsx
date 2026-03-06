'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { isTauri } from '@/lib/tauri'
import { formatShortcut } from '@/lib/platform'
import { emit } from '@/lib/events'

const SIDEBAR_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

interface ThreadPreview {
  id: string
  title: string
  timestamp: number
  messageCount: number
  workspace?: string
}

function getThreadPreviews(): ThreadPreview[] {
  try {
    const saved = localStorage.getItem('code-editor:chat:main')
    if (!saved) return []
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
    if (!messages.length) return []
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return []
    return [
      {
        id: 'main',
        title: firstUser.content.slice(0, 50).replace(/\n/g, ' '),
        timestamp: messages[messages.length - 1].timestamp,
        messageCount: messages.length,
      },
    ]
  } catch {
    return []
  }
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
  const sidebarResize = usePanelResize('sidebar')
  const sidebarWidth = layout.getSize('sidebar')
  const [isTauriDesktop, setIsTauriDesktop] = useState(false)
  const [threads, setThreads] = useState<ThreadPreview[]>([])

  useEffect(() => {
    setIsTauriDesktop(isTauri())
  }, [])

  useEffect(() => {
    setThreads(getThreadPreviews())
  }, [])

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

  const handleNewThread = useCallback(() => {
    try {
      localStorage.removeItem('code-editor:chat:main')
    } catch {}
    window.location.reload()
  }, [])

  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? 56 : sidebarWidth }}
      transition={SIDEBAR_SPRING}
      className={`codex-sidebar relative flex flex-col shrink-0 overflow-hidden ${
        collapsed
          ? `items-center gap-2 ${isTauriDesktop ? 'pt-8' : 'pt-3'} pb-3`
          : 'h-full bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-xs)]'
      }`}
    >
      {collapsed ? (
        <>
          <button
            onClick={onToggle}
            className="p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all cursor-pointer hover:scale-110"
            title={`Expand sidebar (${formatShortcut('meta+\\')})`}
          >
            <Icon icon="lucide:panel-left" width={20} height={20} />
          </button>

          <button
            onClick={handleNewThread}
            className="p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all cursor-pointer hover:scale-110"
            title="New thread"
          >
            <Icon icon="lucide:plus" width={20} height={20} />
          </button>

          <button
            onClick={() => emit('open-folder')}
            className="p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all cursor-pointer hover:scale-110"
            title="Open Folder"
          >
            <Icon icon="lucide:folder-open" width={20} height={20} />
          </button>

          <button
            onClick={() => emit('open-git-panel')}
            className="p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all cursor-pointer hover:scale-110"
            title="Source Control"
          >
            <Icon icon="lucide:git-branch" width={20} height={20} />
          </button>

          <div className="flex-1" />

          <button
            onClick={() => emit('open-settings')}
            className="p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-all cursor-pointer hover:scale-110"
            title="Settings"
          >
            <Icon icon="lucide:settings" width={18} height={18} />
          </button>
        </>
      ) : (
        <>
          <div className={`flex flex-col ${isTauriDesktop ? 'pt-7' : 'pt-3'} px-3`}>
            {/* New thread button */}
            <button
              onClick={handleNewThread}
              className="codex-sidebar-new-thread flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-[13px] font-medium text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] transition-all cursor-pointer w-full"
            >
              <Icon
                icon="lucide:plus"
                width={16}
                height={16}
                className="text-[var(--text-secondary)]"
              />
              New thread
            </button>

            {/* Nav items */}
            <div className="mt-3 space-y-0.5">
              <button
                onClick={() => emit('open-agent-settings')}
                className="codex-sidebar-nav-item flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-full"
              >
                <Icon
                  icon="lucide:zap"
                  width={15}
                  height={15}
                  className="text-[var(--text-tertiary)]"
                />
                Automations
              </button>
              <button
                onClick={() => emit('open-agent-settings')}
                className="codex-sidebar-nav-item flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-full"
              >
                <Icon
                  icon="lucide:sparkles"
                  width={15}
                  height={15}
                  className="text-[var(--text-tertiary)]"
                />
                Skills
              </button>
            </div>
          </div>

          {/* Threads section */}
          <div className="mt-4 px-3 flex-1 overflow-y-auto min-h-0">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-disabled)] font-medium mb-2 font-mono px-1">
              Threads
            </p>

            {/* Workspace groups */}
            {workspaceLabel && (
              <div className="mb-3">
                <button
                  onClick={() => emit('open-folder')}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-[var(--text-tertiary)] font-medium cursor-pointer hover:text-[var(--text-secondary)] transition-colors w-full"
                >
                  <Icon icon="lucide:folder" width={12} height={12} />
                  <span className="truncate">{workspaceLabel}</span>
                  <Icon
                    icon="lucide:chevron-down"
                    width={10}
                    height={10}
                    className="ml-auto opacity-50"
                  />
                </button>

                {/* Thread entries under this workspace */}
                <div className="mt-0.5 space-y-0.5">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      className="codex-sidebar-thread group flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer w-full"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
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
              <div className="space-y-0.5">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    className="codex-sidebar-thread group flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer w-full"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
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
              <p className="text-[11px] text-[var(--text-disabled)] px-2 py-4 text-center">
                No conversations yet
              </p>
            )}
          </div>

          {/* Bottom section */}
          <div className="px-3 pb-3 pt-2 border-t border-[var(--border)] shrink-0">
            <button
              onClick={() => emit('open-settings')}
              className="codex-sidebar-nav-item flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-all cursor-pointer w-full"
            >
              <Icon
                icon="lucide:settings"
                width={15}
                height={15}
                className="text-[var(--text-tertiary)]"
              />
              Settings
            </button>
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
