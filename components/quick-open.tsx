'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useRepo, type TreeNode } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'

/**
 * ⌘P Quick File Open — fuzzy search across entire repo tree.
 * Keyboard-driven: ↑↓ navigate, Enter opens, Esc closes.
 */

interface QuickOpenProps {
  open: boolean
  onClose: () => void
  onSelect: (path: string, sha: string) => void
}

function fuzzyMatch(
  query: string,
  target: string,
): { match: boolean; score: number; indices: number[] } {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let qi = 0
  let score = 0
  let lastIdx = -1

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      // Consecutive matches score higher
      if (lastIdx === ti - 1) score += 10
      // Matches after separators score higher
      if (
        ti === 0 ||
        t[ti - 1] === '/' ||
        t[ti - 1] === '.' ||
        t[ti - 1] === '-' ||
        t[ti - 1] === '_'
      )
        score += 5
      // Filename matches score higher than path matches
      const lastSlash = target.lastIndexOf('/')
      if (ti > lastSlash) score += 3
      score += 1
      lastIdx = ti
      qi++
    }
  }

  return { match: qi === q.length, score, indices }
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const set = new Set(indices)
  const parts: { text: string; highlight: boolean }[] = []
  let current = ''
  let isHighlight = false

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = set.has(i)
    if (shouldHighlight !== isHighlight) {
      if (current) parts.push({ text: current, highlight: isHighlight })
      current = ''
      isHighlight = shouldHighlight
    }
    current += text[i]
  }
  if (current) parts.push({ text: current, highlight: isHighlight })

  return (
    <span>
      {parts.map((p, i) =>
        p.highlight ? (
          <span key={i} className="text-[var(--brand)] font-semibold">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  )
}

export function QuickOpen({ open, onClose, onSelect }: QuickOpenProps) {
  const { tree } = useRepo()
  const { localTree, localMode } = useLocal()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Files from both GitHub tree and local filesystem
  const files = useMemo(() => {
    if (localMode && localTree.length > 0) {
      // Local mode: use local filesystem entries
      return localTree
        .filter((f) => !f.is_dir)
        .map((f) => ({ path: f.path, sha: '', type: 'blob' as const }))
    }
    // GitHub mode: use repo tree
    return tree.filter((n) => n.type === 'blob')
  }, [tree, localTree, localMode])

  // Fuzzy filtered results
  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent-ish files when no query (alphabetical, capped)
      return files.slice(0, 50).map((f) => ({
        node: f,
        score: 0,
        indices: [] as number[],
      }))
    }
    return files
      .map((f) => {
        const result = fuzzyMatch(query, f.path)
        return { node: f, ...result }
      })
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
  }, [files, query])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = results[selected]
        if (item) {
          onSelect(item.node.path, item.node.sha)
          onClose()
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [results, selected, onSelect, onClose],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg sm:max-h-none sm:max-w-[560px] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <Icon
            icon="lucide:search"
            width={16}
            height={16}
            className="text-[var(--text-tertiary)] shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
          />
          <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)]">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--text-tertiary)]">
              {query ? 'No matching files' : 'No files in tree'}
            </div>
          )}
          {results.map((r, i) => {
            const name = r.node.path.split('/').pop() ?? r.node.path
            const dir = r.node.path.includes('/')
              ? r.node.path.slice(0, r.node.path.lastIndexOf('/'))
              : ''
            return (
              <button
                key={r.node.path}
                onClick={() => {
                  onSelect(r.node.path, r.node.sha)
                  onClose()
                }}
                className={`flex items-center gap-2.5 w-full px-4 py-1.5 text-left transition-colors cursor-pointer ${
                  i === selected
                    ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                    : 'hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <Icon
                  icon="lucide:file"
                  width={14}
                  height={14}
                  className="text-[var(--text-tertiary)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[var(--text-primary)] truncate">
                    {query ? (
                      <HighlightedText
                        text={name}
                        indices={r.indices
                          .filter((idx) => idx >= r.node.path.length - name.length)
                          .map((idx) => idx - (r.node.path.length - name.length))}
                      />
                    ) : (
                      name
                    )}
                  </div>
                  {dir && (
                    <div className="text-[10px] text-[var(--text-tertiary)] truncate font-mono">
                      {query ? (
                        <HighlightedText
                          text={dir}
                          indices={r.indices.filter((idx) => idx < dir.length)}
                        />
                      ) : (
                        dir
                      )}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
