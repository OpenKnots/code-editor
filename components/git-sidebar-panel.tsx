'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useLocal } from '@/context/local-context'
import { useEditor } from '@/context/editor-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { useView } from '@/context/view-context'
import { GitSidebarAddons } from '@/components/git-sidebar-addons'
import { emit } from '@/lib/events'

interface ChangeEntry {
  path: string
  status: string
  source: 'git' | 'editor'
  index_status?: string
  worktree_status?: string
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  '??': 'Untracked',
}

function FileRow({
  entry,
  onStage,
  onUnstage,
  onDiscard,
  onSelect,
  isSelected,
}: {
  entry: ChangeEntry
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
  onSelect: () => void
  isSelected: boolean
}) {
  const name = entry.path.split('/').pop() ?? entry.path
  const dir = entry.path.includes('/') ? entry.path.split('/').slice(0, -1).join('/') : ''
  const isStaged = entry.index_status !== ' ' && entry.index_status !== '?' && !!entry.index_status
  const statusChar = entry.status === '??' ? 'U' : entry.status.charAt(0)

  const statusColor =
    entry.status === 'D'
      ? 'var(--color-deletions, #ef4444)'
      : entry.status === 'A' || entry.status === '??'
        ? 'var(--color-additions, #22c55e)'
        : 'var(--warning, #eab308)'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`codex-git-file group flex items-center gap-2 px-3 py-1.5 rounded-md text-left w-full transition-colors cursor-pointer ${
        isSelected
          ? 'bg-[var(--bg-subtle)]'
          : 'hover:bg-[var(--bg-subtle)]'
      }`}
    >
      <span
        className="w-4 text-center text-[10px] font-bold font-mono shrink-0"
        style={{ color: statusColor }}
        title={STATUS_LABELS[entry.status] ?? entry.status}
      >
        {statusChar}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
          {dir ? `${dir}/` : ''}
          {name}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {isStaged && onUnstage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnstage()
            }}
            className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
            title="Unstage"
          >
            <Icon icon="lucide:minus" width={12} height={12} />
          </button>
        )}
        {!isStaged && onStage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStage()
            }}
            className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
            title="Stage"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
          </button>
        )}
        {onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
            className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] cursor-pointer"
            title="Discard changes"
          >
            <Icon icon="lucide:undo-2" width={12} height={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export function GitSidebarPanel() {
  const local = useLocal()
  const { files } = useEditor()
  const layout = useLayout()
  const gitPanelResize = usePanelResize('gitPanel')
  const panelWidth = layout.getSize('gitPanel')
  const { setView } = useView()
  const [tab, setTab] = useState<'uncommitted' | 'staged' | 'review'>('uncommitted')
  const [actionsOpen, setActionsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  const isLocalMode = local.localMode && local.rootPath && local.gitInfo?.is_repo

  useEffect(() => {
    if (!actionsOpen) return
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node))
        setActionsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [actionsOpen])

  const dirtyFiles = useMemo(() => files.filter((f) => f.dirty && f.kind === 'text'), [files])

  const changeEntries = useMemo<ChangeEntry[]>(() => {
    if (isLocalMode) {
      const gitStatus = local.gitInfo?.status ?? []
      const entries: ChangeEntry[] = gitStatus.map((s) => ({
        path: s.path,
        status: s.status,
        source: 'git' as const,
        index_status: s.index_status,
        worktree_status: s.worktree_status,
      }))
      for (const f of dirtyFiles) {
        if (!gitStatus.some((s) => s.path === f.path)) {
          entries.push({ path: f.path, status: 'M', source: 'editor' })
        }
      }
      return entries
    }
    return dirtyFiles.map((f) => ({ path: f.path, status: 'M', source: 'editor' as const }))
  }, [isLocalMode, local.gitInfo?.status, dirtyFiles])

  const uncommitted = useMemo(
    () =>
      changeEntries.filter((e) => {
        if (!e.index_status) return true
        return e.worktree_status !== ' ' || e.index_status === '?'
      }),
    [changeEntries],
  )

  const staged = useMemo(
    () =>
      changeEntries.filter(
        (e) => e.index_status && e.index_status !== ' ' && e.index_status !== '?',
      ),
    [changeEntries],
  )

  const totalAdditions = useMemo(
    () => changeEntries.filter((e) => e.status === 'A' || e.status === '??').length,
    [changeEntries],
  )
  const totalDeletions = useMemo(
    () => changeEntries.filter((e) => e.status === 'D').length,
    [changeEntries],
  )

  const handleStageAll = useCallback(async () => {
    if (!isLocalMode) return
    const paths = uncommitted.map((e) => e.path)
    if (paths.length === 0) return
    try {
      await local.stageFiles(paths)
    } catch {}
  }, [isLocalMode, local, uncommitted])

  const handleRevertAll = useCallback(async () => {
    if (!isLocalMode) return
    const paths = uncommitted.filter((e) => e.source === 'git').map((e) => e.path)
    if (paths.length === 0) return
    if (!confirm(`Discard all ${paths.length} uncommitted changes?`)) return
    try {
      await local.discardChanges(paths)
    } catch {}
  }, [isLocalMode, local, uncommitted])

  const handleCommit = useCallback(() => {
    setView('git')
  }, [setView])

  const handlePush = useCallback(async () => {
    try {
      await local.push()
    } catch {}
  }, [local])

  const displayEntries = tab === 'staged' ? staged : uncommitted

  return (
    <div className="codex-git-sidebar flex flex-col h-full" style={{ width: panelWidth }}>
      {/* Resize handle (left edge) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--brand)] transition-all z-10 opacity-0 hover:opacity-60 hover:w-1.5"
        onMouseDown={gitPanelResize.onResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-10 shrink-0 border-b border-[var(--border)]">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('uncommitted')}
            className={`codex-git-tab px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              tab === 'uncommitted'
                ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Uncommitted
          </button>
          <button
            onClick={() => setTab('staged')}
            className={`codex-git-tab px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              tab === 'staged'
                ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Staged
          </button>
          <button
            onClick={() => {
              setTab('review')
              setView('git')
            }}
            className={`codex-git-tab px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              tab === 'review'
                ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Review
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Git actions dropdown */}
          <div className="relative" ref={actionsRef}>
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="codex-git-actions-btn flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-all cursor-pointer"
            >
              <Icon icon="lucide:git-commit-horizontal" width={13} height={13} />
              <Icon icon="lucide:chevron-down" width={10} height={10} />
            </button>

            {actionsOpen && (
              <div className="codex-git-dropdown absolute right-0 top-full mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg z-50 py-1">
                <button
                  onClick={() => {
                    setActionsOpen(false)
                    handleCommit()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:check" width={13} height={13} />
                  Commit
                </button>
                <button
                  onClick={() => {
                    setActionsOpen(false)
                    handlePush()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:upload" width={13} height={13} />
                  Push
                </button>
                <button
                  onClick={() => {
                    setActionsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:git-pull-request" width={13} height={13} />
                  Create PR
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => layout.hide('gitPanel')}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors shrink-0"
            title="Close commit panel"
          >
            <Icon icon="lucide:panel-right-close" width={14} height={14} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1 px-1 min-h-0">
        {displayEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Icon
              icon="lucide:check-circle"
              width={24}
              height={24}
              className="text-[var(--text-disabled)] mb-2 opacity-40"
            />
            <p className="text-[11px] text-[var(--text-disabled)]">
              {tab === 'staged' ? 'No staged changes' : 'No uncommitted changes'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayEntries.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                isSelected={selectedFile === entry.path}
                onSelect={() => {
                  setSelectedFile(entry.path)
                  emit('file-select', { path: entry.path })
                }}
                onStage={
                  isLocalMode && tab === 'uncommitted'
                    ? () => local.stageFiles([entry.path]).catch(() => {})
                    : undefined
                }
                onUnstage={
                  isLocalMode && tab === 'staged'
                    ? () => local.unstageFiles([entry.path]).catch(() => {})
                    : undefined
                }
                onDiscard={
                  isLocalMode && tab === 'uncommitted'
                    ? () => {
                        if (confirm(`Discard changes to ${entry.path.split('/').pop()}?`))
                          local.discardChanges([entry.path]).catch(() => {})
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <GitSidebarAddons />

      {/* Bottom action bar */}
      <div className="codex-git-bottom-bar flex items-center justify-end gap-2 px-3 py-2 border-t border-[var(--border)] shrink-0">
        {/* Change stats */}
        {changeEntries.length > 0 && (
          <div className="flex items-center gap-2 mr-auto">
            <span className="codex-git-badge text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-[var(--color-additions,#22c55e)] bg-[color-mix(in_srgb,var(--color-additions,#22c55e)_10%,transparent)]">
              +{totalAdditions}
            </span>
            <span className="codex-git-badge text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-[var(--color-deletions,#ef4444)] bg-[color-mix(in_srgb,var(--color-deletions,#ef4444)_10%,transparent)]">
              -{totalDeletions}
            </span>
          </div>
        )}

        <button
          onClick={handleRevertAll}
          disabled={uncommitted.length === 0}
          className="codex-git-action-btn px-3 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          Revert all
        </button>
        <button
          onClick={handleStageAll}
          disabled={uncommitted.length === 0}
          className="codex-git-action-btn px-3 py-1.5 rounded-md text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          + Stage all
        </button>
      </div>
    </div>
  )
}
