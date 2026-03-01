'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useEditor, type OpenFile } from '@/context/editor-context'

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldNum?: number
  newNum?: number
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  // Backtrack
  const result: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'unchanged', content: oldLines[i - 1], oldNum: i, newNum: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', content: newLines[j - 1], newNum: j })
      j--
    } else {
      result.unshift({ type: 'removed', content: oldLines[i - 1], oldNum: i })
      i--
    }
  }
  return result
}

function FileDiff({ file }: { file: OpenFile }) {
  const [expanded, setExpanded] = useState(true)
  const lines = useMemo(() => computeDiff(file.originalContent, file.content), [file.originalContent, file.content])
  const added = lines.filter(l => l.type === 'added').length
  const removed = lines.filter(l => l.type === 'removed').length

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* File header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
      >
        <Icon
          icon={expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'}
          width={12} height={12}
          className="text-[var(--text-tertiary)] shrink-0"
        />
        <span className="text-[11px] font-mono text-[var(--text-primary)] truncate flex-1">
          {file.path}
        </span>
        <span className="text-[10px] font-mono text-[var(--color-additions)]">+{added}</span>
        <span className="text-[10px] font-mono text-[var(--color-deletions)]">-{removed}</span>
      </button>

      {/* Diff lines */}
      {expanded && (
        <div className="overflow-x-auto text-[11px] font-mono leading-[1.6]">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`flex ${
                line.type === 'added'
                  ? 'bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)]'
                  : line.type === 'removed'
                    ? 'bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)]'
                    : ''
              }`}
            >
              <span className="w-10 shrink-0 text-right pr-1 text-[var(--text-disabled)] select-none">
                {line.oldNum ?? ''}
              </span>
              <span className="w-10 shrink-0 text-right pr-1 text-[var(--text-disabled)] select-none">
                {line.newNum ?? ''}
              </span>
              <span className={`w-4 shrink-0 text-center select-none ${
                line.type === 'added' ? 'text-[var(--color-additions)]'
                : line.type === 'removed' ? 'text-[var(--color-deletions)]'
                : 'text-[var(--text-disabled)]'
              }`}>
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span className={`flex-1 pr-4 whitespace-pre ${
                line.type === 'added' ? 'text-[var(--color-additions)]'
                : line.type === 'removed' ? 'text-[var(--color-deletions)]'
                : 'text-[var(--text-primary)]'
              }`}>
                {line.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ChangesPanelProps {
  open: boolean
  onClose: () => void
  onCommit: (message: string) => void
}

export function ChangesPanel({ open, onClose, onCommit }: ChangesPanelProps) {
  const { files } = useEditor()
  const [commitMsg, setCommitMsg] = useState('')
  const dirtyFiles = useMemo(() => files.filter(f => f.dirty), [files])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[800px] max-h-[85vh] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:git-commit-horizontal" width={16} height={16} className="text-[var(--brand)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              Review Changes
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {dirtyFiles.length} file{dirtyFiles.length !== 1 ? 's' : ''} modified
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {dirtyFiles.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)]">
              <Icon icon="lucide:check-circle" width={32} height={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No changes to commit</p>
            </div>
          ) : (
            dirtyFiles.map(file => <FileDiff key={file.path} file={file} />)
          )}
        </div>

        {/* Commit bar */}
        {dirtyFiles.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
            <input
              type="text"
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter' && commitMsg.trim()) {
                  onCommit(commitMsg.trim())
                }
              }}
            />
            <button
              onClick={() => commitMsg.trim() && onCommit(commitMsg.trim())}
              disabled={!commitMsg.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-contrast, #fff)',
              }}
            >
              <Icon icon="lucide:git-commit-horizontal" width={13} height={13} />
              Commit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
