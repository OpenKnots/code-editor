'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useView } from '@/context/view-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { EditorTabs } from '@/components/editor-tabs'
import { FloatingPanel } from '@/components/floating-panel'
import { isTauri } from '@/lib/tauri'
import { emit } from '@/lib/events'

const FileExplorer = dynamic(
  () => import('@/components/file-explorer').then((m) => ({ default: m.FileExplorer })),
  { ssr: false },
)
const CodeEditor = dynamic(
  () => import('@/components/code-editor').then((m) => ({ default: m.CodeEditor })),
  { ssr: false },
)
const AgentPanel = dynamic(
  () => import('@/components/agent-panel').then((m) => ({ default: m.AgentPanel })),
  { ssr: false },
)

const PANEL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

// ─── Editor panel tab types ───────────────────────────────────────────────────
type EditorPanelTab = 'code' | 'info' | 'changes' | 'logs'

const EDITOR_PANEL_TABS: Array<{ id: EditorPanelTab; label: string }> = [
  { id: 'code', label: 'Editor' },
  { id: 'info', label: 'Project Info' },
  { id: 'changes', label: 'Changes' },
  { id: 'logs', label: 'Logs' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ─── Info tab panel ──────────────────────────────────────────────────────────
function InfoPanel() {
  const { files, activeFile, getFile } = useEditor()
  const { repo } = useRepo()
  const local = useLocal()

  const activeFileData = activeFile ? getFile(activeFile) : undefined
  const lineCount = activeFileData ? activeFileData.content.split('\n').length : 0
  const charCount = activeFileData ? activeFileData.content.length : 0
  const wordCount = activeFileData ? activeFileData.content.split(/\s+/).filter(Boolean).length : 0
  const sizeBytes = activeFileData ? new TextEncoder().encode(activeFileData.content).length : 0
  const language = activeFileData?.language ?? '—'
  const fileName = activeFileData
    ? (activeFileData.path.split('/').pop() ?? activeFileData.path)
    : null
  const dirPath = activeFileData
    ? activeFileData.path.includes('/')
      ? activeFileData.path.split('/').slice(0, -1).join('/')
      : '/'
    : null

  const projectName = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null

  const openFileCount = files.length
  const dirtyCount = files.filter((f) => f.dirty).length

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* Summary card */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-3 font-mono">
          Summary
        </p>
        <div className="grid grid-cols-3 gap-px bg-[var(--border)] rounded-xl overflow-hidden border border-[var(--border)]">
          {[
            { label: 'Lines', value: lineCount.toLocaleString() },
            { label: 'Words', value: wordCount.toLocaleString() },
            { label: 'Size', value: sizeBytes > 0 ? formatBytes(sizeBytes) : '—' },
            { label: 'Chars', value: charCount.toLocaleString() },
            { label: 'Language', value: language },
            {
              label: 'Modified',
              value: dirtyCount > 0 ? `${dirtyCount} file${dirtyCount > 1 ? 's' : ''}` : 'Clean',
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5 bg-[var(--bg-elevated)]">
              <span className="text-[18px] font-semibold tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
                {value}
              </span>
              <span className="text-[10px] text-[var(--text-disabled)] font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active file */}
      {fileName && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Active File
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Icon
                icon="lucide:file-code"
                width={13}
                height={13}
                className="text-[var(--brand)] shrink-0"
              />
              <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                {fileName}
              </span>
              {activeFileData?.dirty && (
                <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--brand)] opacity-70" />
              )}
            </div>
            {dirPath && (
              <p className="text-[11px] text-[var(--text-disabled)] font-mono truncate pl-5">
                {dirPath}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Workspace */}
      {projectName && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Workspace
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <Icon
                icon="lucide:folder"
                width={13}
                height={13}
                className="text-[var(--text-tertiary)] shrink-0"
              />
              <span className="text-[13px] text-[var(--text-secondary)]">{projectName}</span>
            </div>
            <div className="flex items-center gap-2 pl-0">
              <span className="text-[11px] text-[var(--text-disabled)]">
                {openFileCount} file{openFileCount !== 1 ? 's' : ''} open
                {dirtyCount > 0 && ` · ${dirtyCount} unsaved`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Open files list */}
      {files.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Open Files
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
            {files.map((f) => {
              const name = f.path.split('/').pop() ?? f.path
              return (
                <div
                  key={f.path}
                  className={`flex items-center gap-2 px-3 py-2 ${
                    f.path === activeFile
                      ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                      : ''
                  }`}
                >
                  <Icon
                    icon="lucide:file"
                    width={12}
                    height={12}
                    className={
                      f.path === activeFile ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'
                    }
                  />
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {name}
                  </span>
                  {f.dirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] opacity-70 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!fileName && files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <Icon
            icon="lucide:info"
            width={24}
            height={24}
            className="text-[var(--text-disabled)] opacity-40"
          />
          <p className="text-[12px] text-[var(--text-disabled)]">No file open</p>
        </div>
      )}
    </div>
  )
}

// ─── Changes tab panel ────────────────────────────────────────────────────────
function ChangesPanel() {
  const local = useLocal()
  const { files } = useEditor()
  const { repo } = useRepo()

  const branch = local.gitInfo?.branch ?? repo?.branch ?? null
  const gitStatus = local.gitInfo?.status ?? []
  const dirtyEditorFiles = files.filter((f) => f.dirty && f.kind === 'text')

  const STATUS_COLOR: Record<string, string> = {
    M: 'var(--warning, #eab308)',
    A: 'var(--color-additions, #22c55e)',
    D: 'var(--color-deletions, #ef4444)',
    '??': 'var(--color-additions, #22c55e)',
    R: 'var(--brand)',
  }

  const staged = gitStatus.filter(
    (s) => s.index_status && s.index_status !== ' ' && s.index_status !== '?',
  )
  const unstaged = gitStatus.filter(
    (s) =>
      (!s.index_status || s.index_status === ' ' || s.index_status === '?') &&
      s.worktree_status &&
      s.worktree_status !== ' ',
  )
  const untracked = gitStatus.filter((s) => s.status === '??')

  const hasChanges =
    staged.length > 0 || unstaged.length > 0 || untracked.length > 0 || dirtyEditorFiles.length > 0

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* Branch */}
      {branch && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          <Icon
            icon="lucide:git-branch"
            width={13}
            height={13}
            className="text-[var(--brand)] shrink-0"
          />
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">{branch}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => emit('open-git-panel')}
              className="text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              Open Git
            </button>
          </div>
        </div>
      )}

      {/* Staged */}
      {staged.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Staged ({staged.length})
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
            {staged.map((s) => {
              const name = s.path.split('/').pop() ?? s.path
              const color = STATUS_COLOR[s.index_status ?? 'M'] ?? STATUS_COLOR['M']
              return (
                <div key={s.path} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[11px] font-mono font-bold shrink-0" style={{ color }}>
                    {s.index_status}
                  </span>
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {name}
                  </span>
                  <span className="text-[10px] text-[var(--text-disabled)] font-mono truncate max-w-[80px]">
                    {s.path.includes('/') ? s.path.split('/').slice(0, -1).join('/') : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unstaged */}
      {unstaged.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Unstaged ({unstaged.length})
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
            {unstaged.map((s) => {
              const name = s.path.split('/').pop() ?? s.path
              const color = STATUS_COLOR[s.worktree_status ?? 'M'] ?? STATUS_COLOR['M']
              return (
                <div key={s.path} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[11px] font-mono font-bold shrink-0" style={{ color }}>
                    {s.worktree_status}
                  </span>
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Untracked */}
      {untracked.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Untracked ({untracked.length})
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
            {untracked.map((s) => {
              const name = s.path.split('/').pop() ?? s.path
              return (
                <div key={s.path} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[11px] font-mono font-bold shrink-0 text-[var(--color-additions,#22c55e)]">
                    U
                  </span>
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unsaved editor files */}
      {dirtyEditorFiles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-2 font-mono">
            Unsaved ({dirtyEditorFiles.length})
          </p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
            {dirtyEditorFiles.map((f) => {
              const name = f.path.split('/').pop() ?? f.path
              return (
                <div key={f.path} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] shrink-0" />
                  <span className="flex-1 text-[12px] text-[var(--text-secondary)] truncate">
                    {name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!hasChanges && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--color-additions,#22c55e)_10%,transparent)] flex items-center justify-center">
            <Icon
              icon="lucide:check-circle-2"
              width={20}
              height={20}
              className="text-[var(--color-additions,#22c55e)] opacity-70"
            />
          </div>
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">All clean</p>
          <p className="text-[11px] text-[var(--text-disabled)]">No uncommitted changes</p>
        </div>
      )}

      {/* Quick commit shortcut */}
      {hasChanges && (
        <button
          onClick={() => emit('open-git-panel')}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer"
        >
          <Icon icon="lucide:git-commit-horizontal" width={13} height={13} />
          Open Git panel
        </button>
      )}
    </div>
  )
}

// ─── Logs tab panel ───────────────────────────────────────────────────────────
function LogsPanel({ isDesktop }: { isDesktop: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-3 font-mono">
          Terminal
        </p>
        {isDesktop ? (
          <div className="space-y-2.5">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 font-mono text-[11px] text-[var(--text-disabled)] min-h-[80px]">
              <span className="text-[var(--brand)]">$ </span>
              <span className="opacity-50">No active terminal session</span>
            </div>
            <button
              onClick={() => emit('toggle-terminal')}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:terminal" width={13} height={13} />
              Open terminal
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-5 flex flex-col items-center gap-3 text-center">
            <Icon
              icon="lucide:monitor"
              width={22}
              height={22}
              className="text-[var(--text-disabled)] opacity-40"
            />
            <p className="text-[12px] text-[var(--text-disabled)]">
              Terminal is only available in the desktop app
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.1em] font-medium text-[var(--text-disabled)] mb-3 font-mono">
          Agent
        </p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden divide-y divide-[var(--border)]">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-additions,#22c55e)] shrink-0" />
            <span className="text-[12px] text-[var(--text-secondary)]">Gateway stream</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--text-disabled)]">ws</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Icon
              icon="lucide:history"
              width={12}
              height={12}
              className="text-[var(--text-disabled)] shrink-0"
            />
            <span className="text-[12px] text-[var(--text-secondary)]">View agent chat</span>
            <span className="ml-auto text-[10px] text-[var(--text-disabled)]">center panel →</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Editor panel inner content ───────────────────────────────────────────────
function EditorPanelContent({
  tab,
  hasFiles,
  isDesktop,
  onBrowse,
}: {
  tab: EditorPanelTab
  hasFiles: boolean
  isDesktop: boolean
  onBrowse: () => void
}) {
  if (tab === 'info') return <InfoPanel />
  if (tab === 'changes') return <ChangesPanel />
  if (tab === 'logs') return <LogsPanel isDesktop={isDesktop} />

  // code tab
  return hasFiles ? (
    <>
      <EditorTabs />
      <div className="flex-1 min-h-0 flex flex-col">
        <CodeEditor />
      </div>
    </>
  ) : (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 select-none">
      <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] border border-[var(--border)] flex items-center justify-center">
        <Icon
          icon="lucide:file-code-2"
          width={22}
          height={22}
          className="text-[var(--text-disabled)]"
        />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium text-[var(--text-secondary)] mb-1">No file open</p>
        <p className="text-[12px] text-[var(--text-disabled)] leading-relaxed">
          Open a file from the explorer
          <br />
          or ask the agent to edit one
        </p>
      </div>
      <button
        onClick={onBrowse}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] transition-colors cursor-pointer border border-[var(--border)]"
      >
        <Icon icon="lucide:folder-open" width={13} height={13} />
        Browse files
      </button>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function EditorView() {
  const { files, activeFile } = useEditor()
  const local = useLocal()
  const { repo } = useRepo()
  const { setView } = useView()
  const layout = useLayout()
  const isMobile = layout.isAtMost('lte768')
  const isNarrow = layout.isAtMost('lte992')
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

  // Right editor panel state
  const editorPanelVisible = layout.isVisible('chat')
  const editorPanelWidth = layout.getSize('chat')
  const chatFloating = layout.isFloating('chat')
  const [editorPanelTab, setEditorPanelTab] = useState<EditorPanelTab>('code')

  // Resize hooks
  const treeResize = usePanelResize('tree')
  const editorPanelResize = usePanelResize('chat')

  // File tree
  const treeVisible = layout.isVisible('tree')
  const treeWidth = layout.getSize('tree')

  const hasFiles = files.length > 0 || !!activeFile
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  // Auto-show editor panel when a file is opened
  const { show } = layout
  const prevFileCount = useRef(files.length)
  useEffect(() => {
    const fileOpened =
      files.length > prevFileCount.current || (activeFile && prevFileCount.current === 0)
    prevFileCount.current = files.length
    if (fileOpened && !editorPanelVisible) {
      show('chat')
    }
  }, [files.length, activeFile, editorPanelVisible, show])

  // Auto-switch to code tab when a file is opened
  useEffect(() => {
    if (hasFiles && editorPanelTab !== 'code') {
      // Only auto-switch if user opened a file (not if they manually changed tab)
    }
  }, [hasFiles, editorPanelTab])

  // ⌘B toggle tree, ⌘I toggle editor panel
  const { toggle } = layout
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggle('tree')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        toggle('chat')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  // Git changes badge count
  const gitChangesCount = useMemo(() => {
    const gitCount = local.gitInfo?.status?.length ?? 0
    const dirtyCount = files.filter((f) => f.dirty).length
    return gitCount + dirtyCount
  }, [local.gitInfo?.status, files])

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative bg-[var(--sidebar-bg)]">
      {/* ── File Tree — left docked panel ── */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {treeVisible && (
            <motion.div
              key="file-tree"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: treeResize.resizing ? undefined : treeWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={treeResize.resizing ? { duration: 0 } : PANEL_SPRING}
              style={treeResize.resizing ? { width: treeWidth } : undefined}
              className="shrink-0 bg-[var(--sidebar-bg)] overflow-hidden border-r border-[var(--border)] flex flex-col"
            >
              <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)]">
                  Explorer
                </span>
                <button
                  onClick={() => layout.hide('tree')}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                  title="Hide (⌘B)"
                >
                  <Icon icon="lucide:panel-left-close" width={15} height={15} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FileExplorer />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Tree resize handle */}
      {treeVisible && !isMobile && (
        <div
          className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
          onMouseDown={treeResize.onResizeStart}
        >
          <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
        </div>
      )}

      {/* ── CENTER: Agent / Chat (primary view) ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Tree show-tab when hidden */}
        {!treeVisible && !isMobile && (
          <button
            onClick={() => layout.show('tree')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 flex items-center justify-center bg-[var(--bg-elevated)] border border-l-0 border-[var(--border)] rounded-r-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
            title="Show explorer (⌘B)"
          >
            <Icon icon="lucide:chevron-right" width={14} height={14} />
          </button>
        )}
        {!treeVisible && isMobile && (
          <button
            onClick={() => layout.show('tree')}
            className="absolute left-2 top-2 z-30 h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title="Files (⌘B)"
          >
            <Icon icon="lucide:folder" width={16} height={16} />
          </button>
        )}

        {/* Agent fills the entire center column */}
        <AgentPanel />
      </div>

      {/* ── Editor panel resize handle ── */}
      {editorPanelVisible && !isMobile && !chatFloating && (
        <div
          className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
          onMouseDown={editorPanelResize.onResizeStart}
        >
          <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
        </div>
      )}

      {/* ── RIGHT: Tabbed details panel ── */}
      <AnimatePresence initial={false}>
        {editorPanelVisible && !isMobile && !chatFloating && (
          <motion.div
            key="editor-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{
              width: editorPanelResize.resizing ? undefined : editorPanelWidth,
              opacity: 1,
            }}
            exit={{ width: 0, opacity: 0 }}
            transition={editorPanelResize.resizing ? { duration: 0 } : PANEL_SPRING}
            style={editorPanelResize.resizing ? { width: editorPanelWidth } : undefined}
            className="shrink-0 flex flex-col bg-[var(--bg)] overflow-hidden"
          >
            {/* Tab bar — Prism style */}
            <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-1">
              {EDITOR_PANEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEditorPanelTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 h-10 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    editorPanelTab === tab.id
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                  {/* Badge on Changes tab */}
                  {tab.id === 'changes' && gitChangesCount > 0 && (
                    <span className="ml-0.5 min-w-[16px] h-4 rounded-full bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)] text-[9px] font-bold font-mono flex items-center justify-center px-1">
                      {gitChangesCount > 99 ? '99+' : gitChangesCount}
                    </span>
                  )}
                  {/* Active indicator */}
                  {editorPanelTab === tab.id && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--brand)]" />
                  )}
                </button>
              ))}
              <div className="flex-1" />
              {/* Panel controls */}
              <div className="flex items-center gap-0.5 pr-1">
                <button
                  onClick={() => layout.setFloating('chat', true)}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                  title="Float panel"
                >
                  <Icon icon="lucide:app-window" width={13} height={13} />
                </button>
                <button
                  onClick={() => layout.hide('chat')}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                  title="Hide panel (⌘I)"
                >
                  <Icon icon="lucide:panel-right-close" width={13} height={13} />
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <EditorPanelContent
                tab={editorPanelTab}
                hasFiles={hasFiles}
                isDesktop={isDesktop}
                onBrowse={() => layout.show('tree')}
              />
            </div>

            {/* Bottom bar — only in code tab */}
            {editorPanelTab === 'code' && (
              <div className="flex items-center h-8 px-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-2">
                {branchName && (
                  <span className="text-[12px] font-mono text-[var(--text-disabled)] flex items-center gap-1.5">
                    <Icon icon="lucide:git-branch" width={13} height={13} />
                    {branchName}
                  </span>
                )}
                <div className="flex-1" />
                {isDesktop && (
                  <button
                    onClick={() => emit('toggle-terminal')}
                    className="h-6 px-2 rounded text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Terminal (⌘J)"
                  >
                    <Icon icon="lucide:terminal" width={12} height={12} />
                    {!isNarrow && <span>Terminal</span>}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edge button: show panel when hidden */}
      {!editorPanelVisible && !isMobile && !chatFloating && (
        <button
          onClick={() => layout.show('chat')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 flex items-center justify-center bg-[var(--bg-elevated)] border border-r-0 border-[var(--border)] rounded-l-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
          title="Show panel (⌘I)"
        >
          <Icon icon="lucide:chevron-left" width={14} height={14} />
        </button>
      )}

      {/* ── Mobile: tree drawer from left ── */}
      <AnimatePresence initial={false}>
        {isMobile && treeVisible && (
          <>
            <motion.button
              key="tree-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => layout.hide('tree')}
              aria-label="Close files"
            />
            <motion.div
              key="tree-drawer"
              initial={{ x: -420 }}
              animate={{ x: 0 }}
              exit={{ x: -420 }}
              transition={PANEL_SPRING}
              className="absolute inset-y-0 left-0 z-50 w-[min(92vw,360px)] bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col"
            >
              <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-elevated)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)]">
                  Explorer
                </span>
                <button
                  onClick={() => layout.hide('tree')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer"
                >
                  <Icon icon="lucide:x" width={14} height={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FileExplorer />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Mobile: editor/details drawer from right ── */}
      <AnimatePresence initial={false}>
        {isMobile && editorPanelVisible && !chatFloating && (
          <>
            <motion.button
              key="editor-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => layout.hide('chat')}
              aria-label="Close panel"
            />
            <motion.div
              key="editor-drawer"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={PANEL_SPRING}
              className="absolute inset-y-0 right-0 z-50 w-[min(96vw,420px)] bg-[var(--bg)] flex flex-col overflow-hidden"
            >
              {/* Mobile tab bar */}
              <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-1">
                {EDITOR_PANEL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setEditorPanelTab(tab.id)}
                    className={`relative px-2.5 h-10 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      editorPanelTab === tab.id
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-disabled)]'
                    }`}
                  >
                    {tab.label}
                    {editorPanelTab === tab.id && (
                      <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-[var(--brand)]" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => layout.hide('chat')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer mr-1"
                >
                  <Icon icon="lucide:x" width={14} height={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <EditorPanelContent
                  tab={editorPanelTab}
                  hasFiles={hasFiles}
                  isDesktop={isDesktop}
                  onBrowse={() => {
                    layout.hide('chat')
                    layout.show('tree')
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Floating panel ── */}
      {editorPanelVisible && chatFloating && (
        <FloatingPanel
          panel="chat"
          title="Editor"
          icon="lucide:code-2"
          onDock={() => layout.setFloating('chat', false)}
          onClose={() => {
            layout.setFloating('chat', false)
            layout.hide('chat')
          }}
          minW={340}
          minH={320}
        >
          <div className="flex flex-col h-full">
            {/* Floating tab bar */}
            <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 px-1">
              {EDITOR_PANEL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEditorPanelTab(tab.id)}
                  className={`relative px-3 h-9 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    editorPanelTab === tab.id
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                  {editorPanelTab === tab.id && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--brand)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <EditorPanelContent
                tab={editorPanelTab}
                hasFiles={hasFiles}
                isDesktop={isDesktop}
                onBrowse={() => layout.show('tree')}
              />
            </div>
          </div>
        </FloatingPanel>
      )}
    </div>
  )
}
