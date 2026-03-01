'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useEditor } from '@/context/editor-context'
import { useGateway } from '@/context/gateway-context'
import { commitFilesByName as commitFiles, fetchBranchesByName, createBranch, authHeaders } from '@/lib/github-api'
import { computeDiff, type DiffLine } from '@/lib/diff'

type Tab = 'changes' | 'history'
type MediaKind = 'image' | 'video' | 'audio' | null

function detectMedia(filename: string): MediaKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio'
  return null
}

interface Commit {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  filesUrl?: string
}

interface CommitFile {
  filename: string
  status: string
  additions: number
  deletions: number
  patch?: string
  raw_url?: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function GitPanel({ open, onClose }: Props) {
  const { repo } = useRepo()
  const local = useLocal()
  const { files, markClean } = useEditor()

  const [tab, setTab] = useState<Tab>('changes')
  const [commitMsg, setCommitMsg] = useState('')
  const [commitDesc, setCommitDesc] = useState('')
  const [committing, setCommitting] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')

  // History
  const [commits, setCommits] = useState<Commit[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
  const [commitFiles2, setCommitFiles2] = useState<CommitFile[]>([])
  const [activeCommitFile, setActiveCommitFile] = useState<CommitFile | null>(null)

  // Branch
  const [branches, setBranches] = useState<string[]>([])
  const [showBranchMenu, setShowBranchMenu] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')

  const branchName = repo?.branch ?? local.gitInfo?.branch ?? 'main'
  const dirtyFiles = useMemo(() => files.filter(f => f.dirty && f.kind === 'text'), [files])
  const filteredFiles = useMemo(() =>
    filterText ? dirtyFiles.filter(f => f.path.toLowerCase().includes(filterText.toLowerCase())) : dirtyFiles
  , [dirtyFiles, filterText])

  // Auto-select all dirty files
  useEffect(() => {
    setSelectedFiles(new Set(dirtyFiles.map(f => f.path)))
  }, [dirtyFiles])

  // Load branches
  useEffect(() => {
    if (!repo || !open) return
    fetchBranchesByName(repo.fullName).then(bs => setBranches(bs.map(b => b.name))).catch(() => {})
  }, [repo, open])

  // Active file diff
  const activeDiff = useMemo(() => {
    const file = files.find(f => f.path === activeFilePath)
    if (!file || !file.dirty) return null
    const lines = computeDiff(file.originalContent, file.content)
    return { path: file.path, lines }
  }, [activeFilePath, files])

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

  // Create branch
  const handleCreateBranch = async () => {
    if (!repo || !newBranchName.trim()) return
    setCreatingBranch(true)
    try {
      // Get HEAD sha
      const resp = await fetch(`https://api.github.com/repos/${repo.fullName}/git/ref/heads/${branchName}`, {
        headers: { ...authHeaders(), 'Accept': 'application/vnd.github.v3+json' },
      })
      if (resp.ok) {
        const data = await resp.json()
        const sha = data.object.sha
        const ok = await createBranch(repo.fullName, newBranchName.trim(), sha)
        if (ok) {
          setBranches(prev => [...prev, newBranchName.trim()])
          setNewBranchName('')
          setShowBranchMenu(false)
        }
      }
    } catch {}
    setCreatingBranch(false)
  }

  // Load history
  const loadHistory = useCallback(async () => {
    if (!repo) return
    setLoadingHistory(true)
    try {
      const resp = await fetch(`https://api.github.com/repos/${repo.fullName}/commits?sha=${branchName}&per_page=30`, {
        headers: { ...authHeaders(), 'Accept': 'application/vnd.github.v3+json' },
      })
      if (resp.ok) {
        const data = await resp.json()
        setCommits(data.map((c: Record<string, unknown>) => ({
          sha: c.sha as string,
          shortSha: (c.sha as string).slice(0, 7),
          message: ((c.commit as Record<string, unknown>)?.message as string)?.split('\n')[0] ?? '',
          author: ((c.commit as Record<string, Record<string, string>>)?.author?.name) ?? 'Unknown',
          date: new Date(((c.commit as Record<string, Record<string, string>>)?.author?.date) ?? '').toLocaleDateString(),
          filesUrl: (c.url as string),
        })))
      }
    } catch {}
    setLoadingHistory(false)
  }, [repo, branchName])

  // Load commit files
  const loadCommitFiles = useCallback(async (commit: Commit) => {
    setSelectedCommit(commit)
    setCommitFiles2([])
    setActiveCommitFile(null)
    try {
      const resp = await fetch(`https://api.github.com/repos/${repo?.fullName}/commits/${commit.sha}`, {
        headers: { ...authHeaders(), 'Accept': 'application/vnd.github.v3+json' },
      })
      if (resp.ok) {
        const data = await resp.json()
        setCommitFiles2((data.files || []).map((f: Record<string, unknown>) => ({
          filename: f.filename as string,
          status: f.status as string,
          additions: f.additions as number,
          deletions: f.deletions as number,
          patch: f.patch as string | undefined,
          raw_url: f.raw_url as string | undefined,
        })))
      }
    } catch {}
  }, [repo])

  useEffect(() => {
    if (tab === 'history' && commits.length === 0) loadHistory()
  }, [tab, loadHistory, commits.length])

  if (!open) return null

  const filteredBranches = branchFilter
    ? branches.filter(b => b.toLowerCase().includes(branchFilter.toLowerCase()))
    : branches

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative flex w-full max-w-[960px] mx-auto my-6 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Left panel */}
        <div className="w-[320px] flex flex-col border-r border-[var(--border)] bg-[var(--bg)]">
          {/* Header */}
          <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer">
                <Icon icon="lucide:x" width={13} height={13} />
              </button>
              {/* Branch selector */}
              <div className="relative">
                <button
                  onClick={() => setShowBranchMenu(v => !v)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Icon icon="lucide:git-branch" width={11} height={11} className="text-[var(--brand)]" />
                  <span className="text-[11px] font-mono font-medium text-[var(--text-primary)]">{branchName}</span>
                  <Icon icon="lucide:chevron-down" width={9} height={9} className="text-[var(--text-disabled)]" />
                </button>

                {showBranchMenu && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-[var(--border)]">
                      <input
                        type="text"
                        value={branchFilter}
                        onChange={e => setBranchFilter(e.target.value)}
                        placeholder="Filter branches..."
                        className="w-full px-2 py-1 text-[10px] rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredBranches.map(b => (
                        <button
                          key={b}
                          onClick={() => { setShowBranchMenu(false); /* TODO: switch branch via context */ }}
                          className={`w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center gap-2 ${
                            b === branchName ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {b === branchName && <Icon icon="lucide:check" width={10} height={10} />}
                          <span className={b === branchName ? '' : 'ml-[18px]'}>{b}</span>
                        </button>
                      ))}
                    </div>
                    <div className="p-2 border-t border-[var(--border)]">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newBranchName}
                          onChange={e => setNewBranchName(e.target.value)}
                          placeholder="New branch name..."
                          className="flex-1 px-2 py-1 text-[10px] rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
                          onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch() }}
                        />
                        <button
                          onClick={handleCreateBranch}
                          disabled={!newBranchName.trim() || creatingBranch}
                          className="px-2 py-1 text-[9px] font-medium rounded bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                        >
                          {creatingBranch ? '...' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {tab === 'history' && (
                <button onClick={loadHistory} className="text-[9px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] px-2 py-0.5 rounded hover:bg-[var(--bg-subtle)] cursor-pointer">
                  <Icon icon="lucide:refresh-cw" width={10} height={10} className={`inline mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />Refresh
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-0 h-8 border-b border-[var(--border)] px-3 shrink-0">
            {(['changes', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1 px-3 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  tab === t ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {t === 'changes' ? (
                  <><Icon icon="lucide:file-diff" width={10} height={10} />Changes{dirtyFiles.length > 0 && <span className="ml-1 px-1 rounded-full bg-[var(--brand)] text-white text-[8px]">{dirtyFiles.length}</span>}</>
                ) : (
                  <><Icon icon="lucide:history" width={10} height={10} />History</>
                )}
              </button>
            ))}
          </div>

          {tab === 'changes' ? (
            <>
              {/* Filter */}
              {dirtyFiles.length > 3 && (
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
              )}

              {/* Select all */}
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
                    {selectedFiles.size} of {dirtyFiles.length} file{dirtyFiles.length !== 1 ? 's' : ''}
                  </span>
                  <span className="ml-auto text-[9px] font-mono">
                    <span className="text-[var(--color-additions)]">+{totalStats.add}</span>{' '}
                    <span className="text-[var(--color-deletions)]">-{totalStats.del}</span>
                  </span>
                </label>
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto">
                {filteredFiles.map(f => {
                  const adds = Math.max(0, f.content.split('\n').length - f.originalContent.split('\n').length)
                  const dels = Math.max(0, f.originalContent.split('\n').length - f.content.split('\n').length)
                  return (
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
                        onChange={e => { e.stopPropagation(); toggleFile(f.path) }}
                        className="rounded border-[var(--border)] accent-[var(--brand)] shrink-0"
                      />
                      <Icon icon="lucide:file-code-2" width={11} height={11} className="text-[var(--text-tertiary)] shrink-0" />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate flex-1">{f.path.split('/').pop()}</span>
                      <span className="text-[8px] font-mono text-[var(--color-additions)]">+{adds}</span>
                      <span className="text-[8px] font-mono text-[var(--color-deletions)]">-{dels}</span>
                    </div>
                  )
                })}
                {filteredFiles.length === 0 && (
                  <div className="py-8 text-center">
                    <Icon icon="lucide:check-circle" width={24} height={24} className="mx-auto mb-2 text-[var(--color-additions)] opacity-50" />
                    <p className="text-[10px] text-[var(--text-disabled)]">{dirtyFiles.length === 0 ? 'Working tree clean' : 'No matching files'}</p>
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
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commitMsg.trim()) handleCommit() }}
                />
                <textarea
                  value={commitDesc}
                  onChange={e => setCommitDesc(e.target.value)}
                  placeholder="Description (optional)"
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
                  title={!commitMsg.trim() ? 'Enter a commit message' : selectedFiles.size === 0 ? 'Select files to commit' : ''}
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
                <div className="py-8 text-center">
                  <Icon icon="lucide:loader" width={16} height={16} className="mx-auto animate-spin text-[var(--brand)]" />
                  <p className="text-[10px] text-[var(--text-disabled)] mt-2">Loading history...</p>
                </div>
              ) : commits.length > 0 ? (
                commits.map(c => (
                  <button
                    key={c.sha}
                    onClick={() => loadCommitFiles(c)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${
                      selectedCommit?.sha === c.sha ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]' : ''
                    }`}
                  >
                    <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">{c.message}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-mono text-[var(--brand)]">{c.shortSha}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">&middot;</span>
                      <span className="text-[9px] text-[var(--text-tertiary)]">{c.author}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">&middot;</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">{c.date}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-8 text-center text-[10px] text-[var(--text-disabled)]">
                  <Icon icon="lucide:git-commit-horizontal" width={24} height={24} className="mx-auto mb-2 opacity-30" />
                  <p>No commits found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Diff view */}
        <div className="flex-1 flex flex-col bg-[var(--bg-elevated)] overflow-hidden">
          {tab === 'changes' && activeDiff ? (
            <>
              <div className="flex items-center justify-between h-9 px-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:file-code-2" width={11} height={11} className="text-[var(--text-tertiary)]" />
                  <span className="text-[10px] font-mono font-medium text-[var(--text-primary)]">{activeDiff.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-[var(--color-additions)]">+{activeDiff.lines.filter(l => l.type === 'added').length}</span>
                  <span className="text-[9px] font-mono text-[var(--color-deletions)]">-{activeDiff.lines.filter(l => l.type === 'removed').length}</span>
                </div>
              </div>
              <DiffView lines={activeDiff.lines} />
            </>
          ) : tab === 'history' && selectedCommit ? (
            <>
              <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-1">{selectedCommit.message}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">{selectedCommit.author}</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">&middot;</span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{selectedCommit.date}</span>
                  <span className="ml-auto text-[10px] font-mono text-[var(--brand)]">{selectedCommit.shortSha}</span>
                </div>
              </div>
              {/* Commit files list */}
              {commitFiles2.length > 0 && !activeCommitFile && (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-2 text-[9px] font-semibold uppercase text-[var(--text-disabled)] tracking-wider">
                    {commitFiles2.length} file{commitFiles2.length !== 1 ? 's' : ''} changed
                  </div>
                  {commitFiles2.map(f => (
                    <button
                      key={f.filename}
                      onClick={() => setActiveCommitFile(f)}
                      className="w-full text-left flex items-center gap-2 px-4 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border-b border-[var(--border)]"
                    >
                      <Icon
                        icon={f.status === 'added' ? 'lucide:plus' : f.status === 'removed' ? 'lucide:minus' : 'lucide:pencil'}
                        width={10} height={10}
                        className={f.status === 'added' ? 'text-[var(--color-additions)]' : f.status === 'removed' ? 'text-[var(--color-deletions)]' : 'text-[var(--warning,#eab308)]'}
                      />
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate flex-1">{f.filename}</span>
                      <span className="text-[8px] font-mono text-[var(--color-additions)]">+{f.additions}</span>
                      <span className="text-[8px] font-mono text-[var(--color-deletions)]">-{f.deletions}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Commit file diff */}
              {activeCommitFile && (() => {
                const media = detectMedia(activeCommitFile.filename)
                const fileIcon = media === 'image' ? 'lucide:image' : media === 'video' ? 'lucide:video' : media === 'audio' ? 'lucide:music' : 'lucide:file-code-2'
                const name = activeCommitFile.filename.split('/').pop() ?? activeCommitFile.filename
                return (
                  <>
                    <div className="flex items-center gap-2 h-8 px-4 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
                      <button onClick={() => setActiveCommitFile(null)} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer">
                        <Icon icon="lucide:arrow-left" width={11} height={11} />
                      </button>
                      <Icon icon={fileIcon} width={11} height={11} className="text-[var(--text-tertiary)]" />
                      <span className="text-[10px] font-mono text-[var(--text-primary)]">{activeCommitFile.filename}</span>
                      {!media && (
                        <>
                          <span className="text-[8px] font-mono text-[var(--color-additions)] ml-auto">+{activeCommitFile.additions}</span>
                          <span className="text-[8px] font-mono text-[var(--color-deletions)]">-{activeCommitFile.deletions}</span>
                        </>
                      )}
                    </div>
                    {media ? (
                      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--bg-subtle)] overflow-auto">
                        {activeCommitFile.raw_url ? (
                          media === 'image' ? (
                            <div className="flex flex-col items-center gap-3">
                              <img src={activeCommitFile.raw_url} alt={name} className="max-w-full max-h-[50vh] object-contain rounded-lg border border-[var(--border)] bg-[var(--bg)] shadow-sm" />
                              <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
                            </div>
                          ) : media === 'video' ? (
                            <div className="flex flex-col items-center gap-3 w-full max-w-[560px]">
                              <video src={activeCommitFile.raw_url} controls className="max-w-full max-h-[50vh] rounded-lg border border-[var(--border)] bg-black shadow-sm" />
                              <span className="text-[10px] text-[var(--text-disabled)] font-mono">{name}</span>
                            </div>
                          ) : (
                            <div className="w-full max-w-[400px] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 shadow-sm">
                              <div className="flex items-center gap-2 mb-3 text-[var(--text-secondary)]">
                                <Icon icon="lucide:music-2" width={14} height={14} className="text-[var(--brand)]" />
                                <span className="text-[11px] font-medium truncate">{name}</span>
                              </div>
                              <audio src={activeCommitFile.raw_url} controls className="w-full" />
                            </div>
                          )
                        ) : (
                          <div className="text-center text-[var(--text-tertiary)]">
                            <Icon icon={fileIcon} width={28} height={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-[11px] font-medium">{name}</p>
                            <p className="text-[10px] text-[var(--text-disabled)] mt-1">Preview unavailable</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.55]">
                        {activeCommitFile.patch ? (
                          <pre className="p-3 text-[var(--text-secondary)]">
                            {activeCommitFile.patch.split('\n').map((line, i) => (
                              <div
                                key={i}
                                className={
                                  line.startsWith('+') && !line.startsWith('+++') ? 'bg-[color-mix(in_srgb,var(--color-additions)_10%,transparent)] text-[var(--color-additions)]'
                                  : line.startsWith('-') && !line.startsWith('---') ? 'bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] text-[var(--color-deletions)]'
                                  : line.startsWith('@@') ? 'text-[var(--brand)] font-semibold'
                                  : ''
                                }
                              >
                                {line}
                              </div>
                            ))}
                          </pre>
                        ) : (
                          <div className="p-4 text-center text-[var(--text-disabled)]">Binary file or no diff available</div>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
              {commitFiles2.length === 0 && !activeCommitFile && (
                <div className="flex-1 flex items-center justify-center">
                  <Icon icon="lucide:loader" width={16} height={16} className="animate-spin text-[var(--brand)]" />
                </div>
              )}
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

/* ── Reusable diff view ──────────────────────────────────────── */
function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="flex-1 overflow-auto font-mono text-[11px] leading-[1.55]">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={idx}
              className={
                line.type === 'added' ? 'bg-[color-mix(in_srgb,var(--color-additions)_8%,transparent)]'
                : line.type === 'removed' ? 'bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)]'
                : ''
              }
            >
              <td className="w-[36px] text-right pr-1.5 pl-2 select-none text-[10px] text-[var(--text-disabled)] border-r border-[var(--border)]">
                {line.oldNum ?? ''}
              </td>
              <td className="w-[36px] text-right pr-1.5 pl-1 select-none text-[10px] text-[var(--text-disabled)] border-r border-[var(--border)]">
                {line.newNum ?? ''}
              </td>
              <td className={`w-4 text-center select-none text-[10px] ${
                line.type === 'added' ? 'text-[var(--color-additions)]' : line.type === 'removed' ? 'text-[var(--color-deletions)]' : 'text-transparent'
              }`}>
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </td>
              <td className={`pl-1 pr-4 whitespace-pre ${
                line.type === 'added' ? 'text-[var(--color-additions)]'
                : line.type === 'removed' ? 'text-[var(--color-deletions)] line-through opacity-70'
                : 'text-[var(--text-secondary)]'
              }`}>
                {line.content}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
