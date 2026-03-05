'use client'

import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'

export interface FileChange {
  path: string
  original: string
  proposed: string
  additions: number
  deletions: number
  status: 'streaming' | 'pending' | 'accepted' | 'rejected'
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header'
  oldNum?: number
  newNum?: number
  content: string
}

function computeDiff(original: string, proposed: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = proposed.split('\n')
  const result: DiffLine[] = []

  // Simple LCS-based diff
  const m = oldLines.length, n = newLines.length
  // Optimize: for large files, do line-by-line comparison
  if (m + n > 2000) {
    // Fast path: just show changed lines
    const maxLen = Math.max(m, n)
    for (let i = 0; i < maxLen; i++) {
      if (i < m && i < n && oldLines[i] === newLines[i]) {
        result.push({ type: 'context', oldNum: i + 1, newNum: i + 1, content: oldLines[i] })
      } else {
        if (i < m) result.push({ type: 'removed', oldNum: i + 1, content: oldLines[i] })
        if (i < n) result.push({ type: 'added', newNum: i + 1, content: newLines[i] })
      }
    }
    return result
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const ops: Array<{ type: 'keep' | 'del' | 'add'; line: string; oldIdx?: number; newIdx?: number }> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'keep', line: oldLines[i - 1], oldIdx: i, newIdx: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: newLines[j - 1], newIdx: j })
      j--
    } else {
      ops.unshift({ type: 'del', line: oldLines[i - 1], oldIdx: i })
      i--
    }
  }

  for (const op of ops) {
    if (op.type === 'keep') {
      result.push({ type: 'context', oldNum: op.oldIdx, newNum: op.newIdx, content: op.line })
    } else if (op.type === 'del') {
      result.push({ type: 'removed', oldNum: op.oldIdx, content: op.line })
    } else {
      result.push({ type: 'added', newNum: op.newIdx, content: op.line })
    }
  }

  return result
}

function countChanges(original: string, proposed: string): { additions: number; deletions: number } {
  const lines = computeDiff(original, proposed)
  return {
    additions: lines.filter(l => l.type === 'added').length,
    deletions: lines.filter(l => l.type === 'removed').length,
  }
}

interface Props {
  visible: boolean
  onClose: () => void
  onAcceptAll: () => void
  onRejectAll: () => void
  onAcceptFile: (path: string) => void
  onRejectFile: (path: string) => void
}

export function DiffReviewPanel({ visible, onClose, onAcceptAll, onRejectAll, onAcceptFile, onRejectFile }: Props) {
  const [changes, setChanges] = useState<FileChange[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [expandedHunks, setExpandedHunks] = useState<Set<string>>(new Set())

  // Listen for file changes from agent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { changes: FileChange[] }
      setChanges(detail.changes)
      if (detail.changes.length > 0 && !activeFile) {
        setActiveFile(detail.changes[0].path)
      }
    }
    window.addEventListener('diff-review-update', handler)
    return () => window.removeEventListener('diff-review-update', handler)
  }, [activeFile])

  const totalAdditions = useMemo(() => changes.reduce((s, c) => s + c.additions, 0), [changes])
  const totalDeletions = useMemo(() => changes.reduce((s, c) => s + c.deletions, 0), [changes])
  const pendingCount = changes.filter(c => c.status === 'pending').length

  const activeChange = changes.find(c => c.path === activeFile)
  
  // Auto-scroll to first change on file switch
  useEffect(() => {
    if (!activeChange) return
    const timer = setTimeout(() => {
      const firstChanged = document.querySelector('.diff-line-new')
      firstChanged?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => clearTimeout(timer)
  }, [activeFile, activeChange])

  const diffLines = useMemo(() => {
    if (!activeChange) return []
    return computeDiff(activeChange.original, activeChange.proposed)
  }, [activeChange])

  if (!visible || changes.length === 0) return null

  const fileIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase()
    if (ext === 'ts' || ext === 'tsx') return 'lucide:file-code-2'
    if (ext === 'css' || ext === 'scss') return 'lucide:paintbrush'
    if (ext === 'json') return 'lucide:braces'
    if (ext === 'md') return 'lucide:file-text'
    return 'lucide:file'
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] border-l border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
            {changes.length} file{changes.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-additions)]">+{totalAdditions}</span>
          <span className="text-[10px] font-mono text-[var(--color-deletions)]">-{totalDeletions}</span>
        </div>
        <div className="flex items-center gap-1">
          {pendingCount > 0 && (
            <>
              <button
                onClick={onAcceptAll}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium bg-[var(--color-additions)] text-[var(--on-additions)] hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Icon icon="lucide:check-check" width={10} height={10} />
                Accept All
              </button>
              <button
                onClick={onRejectAll}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                Reject All
              </button>
            </>
          )}
          <button onClick={onClose} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer ml-1">
            <Icon icon="lucide:x" width={12} height={12} />
          </button>
        </div>
      </div>

      {/* File tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto shrink-0">
        {changes.map(c => (
          <button
            key={c.path}
            onClick={() => setActiveFile(c.path)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] border-r border-[var(--border)] whitespace-nowrap transition-colors cursor-pointer ${
              activeFile === c.path
                ? 'bg-[var(--bg)] text-[var(--text-primary)] border-b-2 border-b-[var(--brand)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Icon icon={fileIcon(c.path)} width={10} height={10} />
            <span className="font-mono">{c.path.split('/').pop()}</span>
            <span className="text-[8px] text-[var(--text-disabled)]">{c.path.includes('/') ? c.path.split('/').slice(0, -1).join('/') : ''}</span>
            <span className="text-[9px] font-mono text-[var(--color-additions)]">+{c.additions}</span>
            {c.deletions > 0 && <span className="text-[9px] font-mono text-[var(--color-deletions)]">-{c.deletions}</span>}
            {c.status === 'streaming' && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--brand)]" />
              </span>
            )}
            {c.status === 'accepted' && <Icon icon="lucide:check" width={9} height={9} className="text-[var(--color-additions)]" />}
            {c.status === 'rejected' && <Icon icon="lucide:x" width={9} height={9} className="text-[var(--color-deletions)]" />}
          </button>
        ))}
      </div>

      {/* Per-file action bar */}
      {activeChange && activeChange.status === 'pending' && (
        <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-secondary)] border-b border-[var(--border)] shrink-0">
          <span className="text-[9px] text-[var(--text-disabled)] font-mono">{activeChange.path}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAcceptFile(activeChange.path)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium text-[var(--color-additions)] hover:bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:check" width={9} height={9} />
              Accept
            </button>
            <button
              onClick={() => onRejectFile(activeChange.path)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:x" width={9} height={9} />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Diff view */}
      <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.55]">
        {activeChange ? (
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((line, idx) => (
                <tr
                  key={idx}
                  className={`transition-colors duration-300 ${
                    line.type === 'added'
                      ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)] diff-line-new'
                      : line.type === 'removed'
                      ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
                      : ''
                  }`}
                >
                  {/* Old line number */}
                  <td className="w-[42px] text-right pr-1.5 pl-2 select-none text-[10px] text-[var(--text-disabled)] border-r border-[var(--border)]">
                    {line.oldNum ?? ''}
                  </td>
                  {/* New line number */}
                  <td className="w-[42px] text-right pr-1.5 pl-1 select-none text-[10px] text-[var(--text-disabled)] border-r border-[var(--border)]">
                    {line.newNum ?? ''}
                  </td>
                  {/* Gutter */}
                  <td className={`w-4 text-center select-none text-[10px] ${
                    line.type === 'added' ? 'text-[var(--color-additions)]' : line.type === 'removed' ? 'text-[var(--color-deletions)]' : 'text-transparent'
                  }`}>
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </td>
                  {/* Content */}
                  <td className={`pl-1 pr-4 whitespace-pre ${
                    line.type === 'added'
                      ? 'text-[var(--color-additions)]'
                      : line.type === 'removed'
                      ? 'text-[var(--color-deletions)] line-through opacity-70'
                      : 'text-[var(--text-secondary)]'
                  }`}>
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-disabled)]">
            <p className="text-[11px]">Select a file to review changes</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Change Summary Bar ────────────────────────────────────────── */
interface SummaryBarProps {
  fileCount: number
  additions: number
  deletions: number
  onReview: () => void
  onCreatePR?: () => void
}

export function ChangeSummaryBar({ fileCount, additions, deletions, onReview, onCreatePR }: SummaryBarProps) {
  if (fileCount === 0) return null

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-t border-[var(--border)] shrink-0">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:chevron-up" width={11} height={11} className="text-[var(--text-disabled)]" />
        <span className="text-[10px] text-[var(--text-secondary)]">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
        <span className="text-[10px] font-mono text-[var(--color-additions)]">+{additions}</span>
        <span className="text-[10px] font-mono text-[var(--color-deletions)]">-{deletions}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onReview}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <Icon icon="lucide:eye" width={10} height={10} />
          Review
        </button>
        {onCreatePR && (
          <button
            onClick={onCreatePR}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Icon icon="lucide:git-pull-request-create" width={10} height={10} />
            Create PR
          </button>
        )}
      </div>
    </div>
  )
}
