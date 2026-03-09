'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { authHeaders } from '@/lib/github-api'

interface SearchResult {
  path: string
  line: number
  content: string
  matchStart: number
  matchEnd: number
}

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (path: string, line: number) => void
}

export function GlobalSearch({ open, onClose, onNavigate }: Props) {
  const { files } = useEditor()
  const { repo } = useRepo()
  const [searchScope, setSearchScope] = useState<'local' | 'repo'>('local')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
      setSelectedIdx(0)
    } else {
      setQuery('')
      setResults([])
    }
  }, [open])

  const searchLocal = useCallback(
    (q: string): SearchResult[] => {
      const matches: SearchResult[] = []
      let pattern: RegExp
      try {
        pattern = useRegex
          ? new RegExp(q, caseSensitive ? 'g' : 'gi')
          : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')
      } catch {
        return []
      }

      for (const file of files) {
        if (file.kind !== 'text') continue
        const lines = file.content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const match = pattern.exec(lines[i])
          if (match) {
            matches.push({
              path: file.path,
              line: i + 1,
              content: lines[i],
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            })
            if (matches.length >= 100) break
          }
          pattern.lastIndex = 0
        }
        if (matches.length >= 100) break
      }
      return matches
    },
    [files, caseSensitive, useRegex],
  )

  const searchRepo = useCallback(
    async (q: string): Promise<SearchResult[]> => {
      if (!repo) return []
      try {
        const resp = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(q)}+repo:${repo.fullName}&per_page=30`,
          { headers: { ...authHeaders(), Accept: 'application/vnd.github.text-match+json' } },
        )
        if (!resp.ok) return []
        const data = await resp.json()
        const matches: SearchResult[] = []
        for (const item of data.items || []) {
          const fragments = item.text_matches || []
          for (const frag of fragments) {
            const lines = (frag.fragment || '').split('\n')
            for (let i = 0; i < lines.length; i++) {
              const idx = lines[i].toLowerCase().indexOf(q.toLowerCase())
              if (idx >= 0) {
                matches.push({
                  path: item.path,
                  line: i + 1,
                  content: lines[i],
                  matchStart: idx,
                  matchEnd: idx + q.length,
                })
                break
              }
            }
          }
          if (matches.length === 0 && item.path) {
            matches.push({
              path: item.path,
              line: 1,
              content: item.name || item.path,
              matchStart: 0,
              matchEnd: 0,
            })
          }
        }
        return matches
      } catch {
        return []
      }
    },
    [repo],
  )

  const searchFiles = useCallback(
    async (q: string) => {
      if (!q || q.length < 2) {
        setResults([])
        return
      }
      setSearching(true)

      let matches: SearchResult[]
      if (searchScope === 'local') {
        matches = searchLocal(q)
        // If no local results and repo connected, auto-fallback to repo search
        if (matches.length === 0 && repo) {
          matches = await searchRepo(q)
        }
      } else {
        matches = await searchRepo(q)
      }

      setResults(matches)
      setSearching(false)
    },
    [searchLocal, searchRepo, searchScope, repo],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchFiles(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchFiles])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      const r = results[selectedIdx]
      onNavigate(r.path, r.line)
      onClose()
    }
  }

  // Group results by file
  const grouped = useMemo(() => {
    const groups = new Map<string, SearchResult[]>()
    for (const r of results) {
      const arr = groups.get(r.path) || []
      arr.push(r)
      groups.set(r.path, arr)
    }
    return groups
  }, [results])

  if (!open) return null

  let flatIdx = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-[10vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full sm:w-[560px] max-h-[85vh] sm:max-h-[70vh] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
          <Icon
            icon="lucide:search"
            width={14}
            height={14}
            className="text-[var(--text-tertiary)] shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIdx(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search across all files..."
            className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
          />
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setCaseSensitive((v) => !v)}
              className={`p-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                caseSensitive
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
              title="Case sensitive"
            >
              Aa
            </button>
            <button
              onClick={() => setUseRegex((v) => !v)}
              className={`p-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                useRegex
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                  : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
              title="Regular expression"
            >
              .*
            </button>
          </div>
          {searching && (
            <Icon
              icon="lucide:loader"
              width={12}
              height={12}
              className="text-[var(--brand)] animate-spin shrink-0"
            />
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && query.length >= 2 && !searching && (
            <div className="py-8 text-center text-[11px] text-[var(--text-disabled)]">
              No results found
            </div>
          )}
          {query.length < 2 && (
            <div className="py-8 text-center text-[11px] text-[var(--text-disabled)]">
              Type at least 2 characters to search
            </div>
          )}
          {Array.from(grouped.entries()).map(([path, fileResults]) => (
            <div key={path}>
              {/* File header */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-secondary)] border-b border-[var(--border)] sticky top-0">
                <Icon
                  icon="lucide:file-code-2"
                  width={10}
                  height={10}
                  className="text-[var(--text-tertiary)]"
                />
                <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate">
                  {path}
                </span>
                <span className="text-[8px] text-[var(--text-disabled)]">
                  {fileResults.length} match{fileResults.length !== 1 ? 'es' : ''}
                </span>
              </div>
              {/* Matches */}
              {fileResults.map((r) => {
                flatIdx++
                const isSelected = flatIdx === selectedIdx
                const idx = flatIdx
                return (
                  <button
                    key={`${r.path}:${r.line}`}
                    onClick={() => {
                      onNavigate(r.path, r.line)
                      onClose()
                    }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-2 px-3 py-1 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                        : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span className="text-[9px] text-[var(--text-disabled)] font-mono w-8 text-right shrink-0">
                      {r.line}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                      {r.content.slice(0, r.matchStart)}
                      <span className="bg-[color-mix(in_srgb,var(--warning,#eab308)_30%,transparent)] text-[var(--text-primary)] font-semibold rounded-sm px-0.5">
                        {r.content.slice(r.matchStart, r.matchEnd)}
                      </span>
                      {r.content.slice(r.matchEnd)}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
          {results.length >= 100 && (
            <div className="py-2 text-center text-[9px] text-[var(--text-disabled)]">
              Showing first 100 results
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <span className="text-[9px] text-[var(--text-disabled)]">
            {results.length > 0
              ? `${results.length} result${results.length !== 1 ? 's' : ''} in ${grouped.size} file${grouped.size !== 1 ? 's' : ''}`
              : ''}
          </span>
          <span className="text-[8px] text-[var(--text-disabled)]">
            <kbd className="px-1 rounded border border-[var(--border)]">↑↓</kbd> navigate
            <span className="mx-1">·</span>
            <kbd className="px-1 rounded border border-[var(--border)]">⏎</kbd> open
            <span className="mx-1">·</span>
            <kbd className="px-1 rounded border border-[var(--border)]">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
