'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { fetchBranchesByName, createBranch } from '@/lib/github-api'

export function BranchPicker() {
  const { repo, setRepo } = useRepo()
  const { localMode, gitInfo, branches: localBranches, switchBranch } = useLocal()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const currentBranch = localMode ? gitInfo?.branch : repo?.branch

  const loadBranches = useCallback(async () => {
    if (localMode) {
      setBranches(localBranches)
      return
    }
    if (!repo || !currentBranch) return
    setLoading(true)
    try {
      const result = await fetchBranchesByName(repo.fullName)
      setBranches(result.map(b => b.name))
    } catch {
      setBranches([currentBranch])
    } finally {
      setLoading(false)
    }
  }, [localMode, localBranches, repo, currentBranch])

  useEffect(() => {
    if (open) {
      loadBranches()
      setTimeout(() => filterRef.current?.focus(), 50)
    } else {
      setFilter('')
      setCreating(false)
      setNewBranchName('')
    }
  }, [open, loadBranches])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = filter
    ? branches.filter(b => b.toLowerCase().includes(filter.toLowerCase()))
    : branches

  const handleSelect = async (branch: string) => {
    if (branch === currentBranch) {
      setOpen(false)
      return
    }
    if (localMode) {
      await switchBranch(branch)
    } else if (repo) {
      setRepo({ ...repo, branch })
    }
    setOpen(false)
  }

  const handleCreateBranch = async () => {
    const name = newBranchName.trim()
    if (!name) return
    if (localMode) {
      await switchBranch(name)
    } else if (repo) {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo.fullName}/git/ref/heads/${repo.branch}`)
        if (res.ok) {
          const data = await res.json() as { object: { sha: string } }
          await createBranch(repo.fullName, name, data.object.sha)
          setRepo({ ...repo, branch: name })
        }
      } catch (err) {
        console.error('Failed to create branch:', err)
      }
    }
    setOpen(false)
  }

  if (!currentBranch) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
      >
        <Icon icon="lucide:git-branch" width={10} height={10} className="text-[var(--brand)]" />
        {currentBranch}
        <Icon icon="lucide:chevron-down" width={8} height={8} className="text-[var(--text-disabled)]" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 w-60 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={filterRef}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter branches..."
              className="w-full px-2.5 py-1.5 text-[11px] rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-colors"
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            />
          </div>

          {/* Branch list */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2 text-[11px] text-[var(--text-disabled)]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[var(--text-disabled)]">No branches found</div>
            ) : (
              filtered.map(branch => (
                <button
                  key={branch}
                  onClick={() => handleSelect(branch)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors cursor-pointer ${
                    branch === currentBranch
                      ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                  }`}
                >
                  <Icon icon="lucide:git-branch" width={11} height={11} className="shrink-0" />
                  <span className="truncate font-mono">{branch}</span>
                  {branch === currentBranch && (
                    <Icon icon="lucide:check" width={11} height={11} className="ml-auto shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Create new branch */}
          <div className="border-t border-[var(--border)] p-2">
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="new-branch-name"
                  autoFocus
                  className="flex-1 px-2 py-1 text-[11px] rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none font-mono"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateBranch()
                    if (e.key === 'Escape') { setCreating(false); setNewBranchName('') }
                  }}
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim()}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    newBranchName.trim()
                      ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'
                  }`}
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer rounded-md hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]"
              >
                <Icon icon="lucide:plus" width={11} height={11} />
                Create and checkout new branch...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
