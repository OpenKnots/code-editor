'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useEditor } from '@/context/editor-context'
import { useGateway } from '@/context/gateway-context'
import { commitFilesByName as commitFiles } from '@/lib/github-api'

type Tab = 'changes' | 'history'

interface Commit {
  sha: string
  message: string
  author: string
  date: string
  files?: string[]
}

/* ── Simple line diff for display ──────────────────────────────── */
function computeSimpleDiff(original: string, proposed: string) {
  const oldLines = original.split('\n')
  const newLines = proposed.split('\n')
  const result: Array<{ type: 'ctx' | 'add' | 'del'; num?: number; content: string }> = []
  const max = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < max; i++) {
    if (i >= oldLines.length) {
      result.push({ type: 'add', num: i + 1, content: newLines[i] })
    } else if (i >= newLines.length) {
      result.push({ type: 'del', num: i + 1, content: oldLines[i] })
    } else if (oldLines[i] !== newLines[i]) {
      result.push({ type: 'del', num: i + 1, content: oldLines[i] })
      result.push({ type: 'add', num: i + 1, content: newLines[i] })
    } else {
      result.push({ type: 'ctx', num: i + 1, content: oldLines[i] })
    }
  }
  return result
}

interface Props {
  open: boolean
  onClose: () => void
}

export function GitPanel({ open, onClose }: Props) {
  const { repo } = useRepo()
  const local = useLocal()
  const { files, markClean } = useEditor()
  const { sendRequest, status } = useGateway()

  const [tab, setTab] = useState<Tab>('changes')
  const [commitMsg, setCommitMsg] = useState('')
  const [commitDesc, setCommitDesc] = useState('')
  const [committing, setCommitting] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [commits, setCommits] = useState<Commit[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)

  const branchName = repo?.branch ?? local.gitInfo?.branch ?? 'main'
  const dirtyFiles = useMemo(() => files.filter(f => f.dirty && f.kind === 'text'), [files])
  const filteredFiles = useMemo(() =>
    filterText ? dirtyFiles.filter(f => f.path.toLowerCase().includes(filterText.toLowerCase())) : dirtyFiles
  , [dirtyFiles, filterText])

  // Auto-select all dirty files
  useEffect(() => {
    setSelectedFiles(new Set(dirtyFiles.map(f => f.path)))
  }, [dirtyFiles])

  // Active file diff
  const activeDiff = useMemo(() => {
    const file = files.find(f => f.path === activeFilePath)
    if (!file || !file.dirty) return null
    return {
      path: file.path,
      lines: computeSimpleDiff(file.originalContent, file.content),
      additions: 0,
      deletions: 0,
    }
  }, [activeFilePath, files])

  // Count additions/deletions
  const totalStats = useMemo(() => {
    let add = 0, del = 0
    for (const f of dirtyFiles) {
      const oldLines = f.originalContent.split('\n').length
      const newLines = f.content.split('\n').length
      add += Math.max(0, newLines - oldLines)
      del += Math.max(0, oldLines - newLines)
    }
    return { add, del }
  }, [dirtyFiles])

  const toggleFile = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleCommit = async () => {
    if (!repo || !commitMsg.trim() || selectedFiles.size === 0) return
    setCommitting(true)
    try {
      const toCommit = dirtyFiles.filter(f => selectedFiles.has(f.path))
      const fullMsg = commitDesc ? `${commitMsg}\n\n${commitDesc}` : commitMsg
      await commitFiles(
        repo.fullName,
        toCommit.map(f => ({ path: f.path, content: f.content, sha: f.sha })),
        fullMsg,
        branchName,
      )
      toCommit.forEach(f => markClean(f.path))
      setCommitMsg('')
      setCommitDesc('')
    } catch (err) {
      console.error('Commit failed:', err)
    }
    setCommitting(false)
  }

  // Load git history (simplified — from GitHub API)
  const loadHistory = useCallback(async () => {
    if (!repo) return
    setLoadingHistory(true)
    try {
      const resp = await fetch(`https://api.github.com/repos/${repo.fullName}/commits?sha=${branchName}&per_page=20`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      })
      if (resp.ok) {
        const data = await resp.json()
        setCommits(data.map((c: Record<string, unknown>) => ({
          sha: (c.sha as string).slice(0, 7),
          message: ((c.commit as Record<string, unknown>)?.message as string)?.split('\n')[0] ?? '',
          author: ((c.commit as Record<string, Record<string, string>>)?.author?.name) ?? 'Unknown',
          date: new Date(((c.commit as Record<string, Record<string, string>>)?.author?.date) ?? '').toLocaleDateString(),
        })))
      }
    } catch {}
    setLoadingHistory(false)
  }, [repo, branchName])

  useEffect(() => {
    if (tab === 'history' && commits.length === 0) loadHistory()
  }, [tab, loadHistory, commits.length])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative flex w-full max-w-[900px] mx-auto my-8 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Left: File list */}
        <div className="w-[320px] flex flex-col border-r border-[var(--border)] bg-[var(--bg)]">
          {/* Header */}
          <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer">
                <Icon icon="lucide:x" width={13} height={13} />
              </button>
              <Icon icon="lucide:git-branch" width={12} height={12} className="text-[var(--text-tertiary)]" />
              <span className="text-[11px] font-mono font-medium text-[var(--text-primary)]">{branchName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 py-0.5 rounded hover:bg-[var(--bg-subtle)] cursor-pointer">
                <Icon icon="lucide:eye" width={11} height={11} className="inline mr-1" />Review
              </button>
              <button className="text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 py-0.5 rounded hover:bg-[var(--bg-subtle)] cursor-pointer">
                <Icon icon="lucide:download" width={11} height={11} className="inline mr-1" />Fetch
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 h-8 border-b border-[var(--border)] px-3 shrink-0">
            {(['changes', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  tab === t ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t === 'changes' ? 'Changes' : 'History'}
              </button>
            ))}
          </div>

          {tab === 'changes' ? (
            <>
              {/* Filter */}
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <div className="relative">
                  <Icon icon="lucide:search" width={10} height={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
                  <input
                    type="text"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    placeholder="Filter files..."
                    className="w-full pl-7 pr-2 py-1 text-[10px] rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))]"
                  />
                </div>
              </div>

              {/* File selection summary */}
              <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFiles.size === dirtyFiles.length && dirtyFiles.length > 0}
                    onChange={() => {
                      if (selectedFiles.size === dirtyFiles.length) setSelectedFiles(new Set())
                      else setSelectedFiles(new Set(dirtyFiles.map(f => f.path)))
                    }}
                    className="rounded border-[var(--border)] accent-[var(--brand)]"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {selectedFiles.size} of {dirtyFiles.length} file{dirtyFiles.length !== 1 ? 's' : ''} selected
                  </span>
                </label>
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto">
                {filteredFiles.map(f => (
                  <div
                    key={f.path}
                    className={`flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${
                      activeFilePath === f.path ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]' : ''
                    }`}
                    onClick={() => setActiveFilePath(f.path)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFiles.has(f.path)}
                      onChange={(e) => { e.stopPropagation(); toggleFile(f.path) }}
                      className="rounded border-[var(--border)] accent-[var(--brand)] shrink-0"
                    />
                    <Icon icon="lucide:file-code-2" width={11} height={11} className="text-[var(--text-tertiary)] shrink-0" />
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate flex-1">{f.path}</span>
                    <button className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--color-additions)] shrink-0 cursor-pointer" title="Stage">
                      <Icon icon="lucide:plus" width={10} height={10} />
                    </button>
                  </div>
                ))}
                {filteredFiles.length === 0 && (
                  <div className="py-6 text-center text-[10px] text-[var(--text-disabled)]">
                    {dirtyFiles.length === 0 ? 'No changes' : 'No matching files'}
                  </div>
                )}
              </div>

              {/* Commit form */}
              <div className="border-t border-[var(--border)] p-3 space-y-2 shrink-0 bg-[var(--bg)]">
                <input
                  type="text"
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Commit message"
                  className="w-full px-2.5 py-1.5 text-[11px] rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))]"
                />
                <textarea
                  value={commitDesc}
                  onChange={e => setCommitDesc(e.target.value)}
                  placeholder="Description"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-[10px] rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] resize-none"
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMsg.trim() || selectedFiles.size === 0 || committing}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    commitMsg.trim() && selectedFiles.size > 0 && !committing
                      ? 'bg-[var(--brand)] text-white hover:opacity-90 shadow-sm'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                  }`}
                >
                  <Icon icon="lucide:git-commit-horizontal" width={12} height={12} />
                  {committing ? 'Committing...' : `Commit ${selectedFiles.size} to ${branchName}`}
                </button>
              </div>
            </>
          ) : (
            /* History tab */
            <div className="flex-1 overflow-y-auto">
              {loadingHistory ? (
                <div className="py-6 text-center">
                  <Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" />
                </div>
              ) : commits.length > 0 ? (
                commits.map(c => (
                  <button
                    key={c.sha}
                    onClick={() => setSelectedCommit(c)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${
                      selectedCommit?.sha === c.sha ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]' : ''
                    }`}
                  >
                    <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">{c.message}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-mono text-[var(--brand)]">{c.sha}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">·</span>
                      <span className="text-[9px] text-[var(--text-tertiary)]">{c.author}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">·</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">{c.date}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-6 text-center text-[10px] text-[var(--text-disabled)]">No commits found</div>
              )}
            </div>
          )}
        </div>

        {/* Right: Diff view or commit details */}
        <div className="flex-1 flex flex-col bg-[var(--bg-elevated)] overflow-hidden">
          {tab === 'changes' && activeDiff ? (
            <>
              {/* File header */}
              <div className="flex items-center justify-between h-9 px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:file-code-2" width={11} height={11} className="text-[var(--text-tertiary)]" />
                  <span className="text-[10px] font-mono font-medium text-[var(--text-primary)]">{activeDiff.path}</span>
                  <span className="text-[9px] text-[var(--text-disabled)]">(modified)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-[var(--color-additions)]">+{activeDiff.lines.filter(l => l.type === 'add').length}</span>
                  <span className="text-[9px] font-mono text-[var(--color-deletions)]">-{activeDiff.lines.filter(l => l.type === 'del').length}</span>
                  <label className="flex items-center gap-1 text-[9px] text-[var(--text-tertiary)] cursor-pointer">
                    <input type="checkbox" className="accent-[var(--brand)]" />
                    Viewed
                  </label>
                </div>
              </div>
              {/* Diff content */}
              <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.55]">
                <table className="w-full border-collapse">
                  <tbody>
                    {activeDiff.lines.map((line, idx) => (
                      <tr
                        key={idx}
                        className={
                          line.type === 'add' ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]'
                          : line.type === 'del' ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
                          : ''
                        }
                      >
                        <td className="w-[36px] text-right pr-1.5 pl-2 select-none text-[10px] text-[var(--text-disabled)] border-r border-[var(--border)]">
                          {line.num ?? ''}
                        </td>
                        <td className={`w-4 text-center select-none text-[10px] ${
                          line.type === 'add' ? 'text-[var(--color-additions)]' : line.type === 'del' ? 'text-[var(--color-deletions)]' : 'text-transparent'
                        }`}>
                          {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                        </td>
                        <td className={`pl-1 pr-4 whitespace-pre ${
                          line.type === 'add' ? 'text-[var(--color-additions)]'
                          : line.type === 'del' ? 'text-[var(--color-deletions)] line-through opacity-70'
                          : 'text-[var(--text-secondary)]'
                        }`}>
                          {line.content}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : tab === 'history' && selectedCommit ? (
            <>
              {/* Commit header */}
              <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1">{selectedCommit.message}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">{selectedCommit.author}</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">·</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{selectedCommit.date}</span>
                  <span className="ml-auto text-[10px] font-mono text-[var(--brand)]">{selectedCommit.sha}</span>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
                <div className="text-center">
                  <Icon icon="lucide:git-commit-horizontal" width={24} height={24} className="mx-auto mb-2 opacity-40" />
                  <p>Select a file to view diff</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-disabled)]">
              <div className="text-center">
                <Icon icon="lucide:git-compare" width={28} height={28} className="mx-auto mb-2 opacity-30" />
                <p>{tab === 'changes' ? 'Select a file to view changes' : 'Select a commit to view details'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
