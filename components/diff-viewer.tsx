'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'

interface DiffViewerProps {
  filePath: string
  original: string
  modified: string
  onApply: () => void
  onReject: () => void
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldLine?: number
  newLine?: number
}

interface Hunk {
  startIdx: number
  endIdx: number
  additions: number
  deletions: number
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }

  // Backtrack
  let i = m,
    j = n
  const result: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'unchanged', content: oldLines[i - 1]!, oldLine: i, newLine: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.push({ type: 'added', content: newLines[j - 1]!, newLine: j })
      j--
    } else {
      result.push({ type: 'removed', content: oldLines[i - 1]!, oldLine: i })
      i--
    }
  }

  return result.reverse()
}

/** Extract hunks (contiguous changed regions) from diff lines */
function extractHunks(diff: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = []
  let inHunk = false
  let start = 0
  let adds = 0
  let dels = 0

  for (let i = 0; i < diff.length; i++) {
    const line = diff[i]!
    if (line.type !== 'unchanged') {
      if (!inHunk) {
        inHunk = true
        start = i
        adds = 0
        dels = 0
      }
      if (line.type === 'added') adds++
      if (line.type === 'removed') dels++
    } else if (inHunk) {
      hunks.push({ startIdx: start, endIdx: i - 1, additions: adds, deletions: dels })
      inHunk = false
    }
  }
  if (inHunk) {
    hunks.push({ startIdx: start, endIdx: diff.length - 1, additions: adds, deletions: dels })
  }

  return hunks
}

export function DiffViewer({ filePath, original, modified, onApply, onReject }: DiffViewerProps) {
  const diff = useMemo(() => computeDiff(original, modified), [original, modified])
  const hunks = useMemo(() => extractHunks(diff), [diff])
  const additions = diff.filter((l) => l.type === 'added').length
  const deletions = diff.filter((l) => l.type === 'removed').length
  const [acceptedHunks, setAcceptedHunks] = useState<Set<number>>(new Set())
  const [rejectedHunks, setRejectedHunks] = useState<Set<number>>(new Set())
  const [flashApply, setFlashApply] = useState(false)
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const hunkRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const handleAcceptHunk = useCallback((hunkIdx: number) => {
    setAcceptedHunks((prev) => {
      const next = new Set(prev)
      next.add(hunkIdx)
      return next
    })
    setRejectedHunks((prev) => {
      const next = new Set(prev)
      next.delete(hunkIdx)
      return next
    })
  }, [])

  const handleRejectHunk = useCallback((hunkIdx: number) => {
    setRejectedHunks((prev) => {
      const next = new Set(prev)
      next.add(hunkIdx)
      return next
    })
    setAcceptedHunks((prev) => {
      const next = new Set(prev)
      next.delete(hunkIdx)
      return next
    })
  }, [])

  const handleApplyAll = useCallback(() => {
    setFlashApply(true)
    setTimeout(() => {
      onApply()
    }, 400)
  }, [onApply])

  const handleKeepAll = useCallback(() => {
    setAcceptedHunks(new Set(hunks.map((_, idx) => idx)))
    setRejectedHunks(new Set())
  }, [hunks])

  const handleUndoAll = useCallback(() => {
    setAcceptedHunks(new Set())
    setRejectedHunks(new Set(hunks.map((_, idx) => idx)))
  }, [hunks])

  const navigateHunk = useCallback(
    (direction: 'prev' | 'next') => {
      if (hunks.length === 0) return
      const newIndex =
        direction === 'prev'
          ? currentHunkIndex > 0
            ? currentHunkIndex - 1
            : hunks.length - 1
          : currentHunkIndex < hunks.length - 1
            ? currentHunkIndex + 1
            : 0
      setCurrentHunkIndex(newIndex)

      // Scroll to hunk
      const hunkElement = hunkRefs.current.get(newIndex)
      if (hunkElement) {
        hunkElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [currentHunkIndex, hunks.length]
  )

  const handleCurrentHunkAction = useCallback(
    (action: 'accept' | 'reject') => {
      if (hunks.length === 0) return
      if (action === 'accept') {
        handleAcceptHunk(currentHunkIndex)
      } else {
        handleRejectHunk(currentHunkIndex)
      }
    },
    [currentHunkIndex, hunks.length, handleAcceptHunk, handleRejectHunk]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // ⌘Y / Ctrl+Y - Keep current hunk
      if (modKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleCurrentHunkAction('accept')
      }
      // ⌘N / Ctrl+N - Undo current hunk
      else if (modKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        handleCurrentHunkAction('reject')
      }
      // ⌘⏎ / Ctrl+Enter - Keep All
      else if (modKey && e.key === 'Enter') {
        e.preventDefault()
        handleKeepAll()
      }
      // ⌘⌫ / Ctrl+Backspace - Undo All
      else if (modKey && e.key === 'Backspace') {
        e.preventDefault()
        handleUndoAll()
      }
      // ↑/↓ or J/K - Navigate hunks
      else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigateHunk('prev')
      } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault()
        navigateHunk('next')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCurrentHunkAction, handleKeepAll, handleUndoAll, navigateHunk])

  // Auto-scroll to first hunk on mount
  useEffect(() => {
    if (hunks.length > 0) {
      const firstHunk = hunkRefs.current.get(0)
      if (firstHunk) {
        setTimeout(() => {
          firstHunk.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
  }, [hunks.length])

  // Focus container on mount
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Determine which hunk a line belongs to (if any)
  const lineHunkMap = useMemo(() => {
    const map = new Map<number, number>()
    hunks.forEach((hunk, idx) => {
      for (let i = hunk.startIdx; i <= hunk.endIdx; i++) {
        map.set(i, idx)
      }
    })
    return map
  }, [hunks])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={`flex flex-col h-full border-t border-[var(--border)] bg-[var(--bg)] outline-none ${flashApply ? 'diff-apply-flash' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon="lucide:git-compare" width={17} height={17} className="text-[var(--brand)]" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
            Agent proposed changes
          </span>
          <span className="text-[12px] text-[var(--text-tertiary)] font-mono truncate">
            {filePath}
          </span>
          {/* Changes summary badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-subtle)] border border-[var(--border)]">
            <span className="text-[var(--color-additions)]">+{additions}</span>
            <span className="text-[var(--color-deletions)]">-{deletions}</span>
            <span className="text-[var(--text-disabled)]">
              {hunks.length} hunk{hunks.length !== 1 ? 's' : ''}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[13px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={14} height={14} />
            Reject
          </button>
          <button
            onClick={handleApplyAll}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-additions) 15%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-additions) 30%, transparent)',
              color: 'var(--color-additions)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <Icon icon="lucide:check" width={14} height={14} />
            Apply
          </button>
        </div>
      </div>

      {/* Diff lines */}
      <div className="flex-1 overflow-auto font-mono text-[14px] leading-[24px]">
        {diff.map((line, lineIdx) => {
          const hunkIdx = lineHunkMap.get(lineIdx)
          const isHunkStart = hunkIdx !== undefined && hunks[hunkIdx]?.startIdx === lineIdx
          const isHunkAccepted = hunkIdx !== undefined && acceptedHunks.has(hunkIdx)
          const isHunkRejected = hunkIdx !== undefined && rejectedHunks.has(hunkIdx)

          return (
            <div key={lineIdx}>
              {/* Hunk separator with per-hunk actions */}
              {isHunkStart && hunkIdx !== undefined && (
                <div
                  ref={(el) => {
                    if (el) hunkRefs.current.set(hunkIdx, el)
                  }}
                  className={`hunk-separator flex items-center justify-between px-3 py-2 border-l-2 ${
                    currentHunkIndex === hunkIdx
                      ? 'border-l-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_5%,transparent)]'
                      : 'border-l-transparent'
                  }`}
                >
                  <span className="text-[11px] text-[var(--text-disabled)] font-mono">
                    Hunk {hunkIdx + 1}: +{hunks[hunkIdx]!.additions} -{hunks[hunkIdx]!.deletions}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isHunkAccepted ? (
                      <button
                        onClick={() => handleRejectHunk(hunkIdx)}
                        className="text-[11px] text-[var(--color-additions)] font-medium flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--bg-subtle)] transition-colors"
                      >
                        <Icon icon="lucide:check" width={12} height={12} /> Accepted ✓
                      </button>
                    ) : isHunkRejected ? (
                      <button
                        onClick={() => handleAcceptHunk(hunkIdx)}
                        className="text-[11px] text-[var(--color-deletions)] font-medium flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--bg-subtle)] transition-colors"
                      >
                        <Icon icon="lucide:x" width={12} height={12} /> Rejected ✗
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRejectHunk(hunkIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                        >
                          Undo
                          <span className="text-[10px] text-[var(--text-disabled)]">⌘N</span>
                        </button>
                        <button
                          onClick={() => handleAcceptHunk(hunkIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--color-additions) 15%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--color-additions) 30%, transparent)',
                            color: 'var(--color-additions)',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                          }}
                        >
                          Keep
                          <span className="text-[10px] opacity-70">⌘Y</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Diff line */}
              <div
                className={`flex relative transition-colors ${
                  isHunkRejected
                    ? 'opacity-30'
                    : line.type === 'added'
                      ? 'bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-additions)_15%,transparent)]'
                      : line.type === 'removed'
                        ? 'bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {/* Gutter indicator */}
                {line.type !== 'unchanged' && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{
                      backgroundColor:
                        line.type === 'added' ? 'var(--color-additions)' : 'var(--color-deletions)',
                    }}
                  />
                )}
                {/* Old line number */}
                <span
                  className="w-10 shrink-0 text-right pr-2 select-none text-[var(--text-tertiary)] pl-[3px]"
                  style={{ opacity: line.type === 'added' ? 0.3 : 1 }}
                >
                  {line.oldLine ?? ''}
                </span>
                {/* New line number */}
                <span
                  className="w-10 shrink-0 text-right pr-2 select-none text-[var(--text-tertiary)]"
                  style={{ opacity: line.type === 'removed' ? 0.3 : 1 }}
                >
                  {line.newLine ?? ''}
                </span>
                {/* Indicator */}
                <span
                  className={`w-5 shrink-0 text-center select-none ${
                    line.type === 'added'
                      ? 'text-[var(--color-additions)]'
                      : line.type === 'removed'
                        ? 'text-[var(--color-deletions)]'
                        : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {/* Content */}
                <span
                  className={`flex-1 whitespace-pre px-1 ${
                    line.type === 'added'
                      ? 'text-[var(--color-additions)]'
                      : line.type === 'removed'
                        ? 'text-[var(--color-deletions)]'
                        : 'text-[var(--text-primary)]'
                  }`}
                >
                  {line.content}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating Bottom Toolbar */}
      {hunks.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
          {/* Left: Hunk Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateHunk('prev')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={hunks.length <= 1}
            >
              <Icon icon="lucide:chevron-left" width={14} height={14} />
            </button>
            <span className="text-[12px] font-medium text-[var(--text-secondary)] font-mono min-w-[60px] text-center">
              {currentHunkIndex + 1} / {hunks.length}
            </span>
            <button
              onClick={() => navigateHunk('next')}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={hunks.length <= 1}
            >
              <Icon icon="lucide:chevron-right" width={14} height={14} />
            </button>
          </div>

          {/* Center: Main Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndoAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Undo All
              <span className="text-[10px] text-[var(--text-disabled)]">⌘⌫</span>
            </button>
            <button
              onClick={handleKeepAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-additions) 20%, transparent)',
                borderColor: 'color-mix(in srgb, var(--color-additions) 40%, transparent)',
                color: 'var(--color-additions)',
                borderWidth: '1px',
                borderStyle: 'solid',
              }}
            >
              Keep All
              <span className="text-[10px] opacity-70">⌘⏎</span>
            </button>
          </div>

          {/* Right: Spacer for balance */}
          <div className="w-[120px]" />
        </div>
      )}
    </div>
  )
}
