'use client'

import { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useRepo, type RepoInfo } from '@/context/repo-context'

export function RepoSelector() {
  const { repo, setRepo } = useRepo()
  const [editing, setEditing] = useState(!repo)
  const [input, setInput] = useState(repo ? repo.fullName : 'openknots/terminal-ui')

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed.includes('/')) return

    const [owner, repoName] = trimmed.split('/')
    if (!owner || !repoName) return

    setRepo({
      owner,
      repo: repoName,
      branch: 'main',
      fullName: trimmed,
    })
    setEditing(false)
  }, [input, setRepo])

  if (editing || !repo) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon icon="lucide:git-branch" width={14} height={14} className="text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="owner/repo"
          className="w-40 px-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] font-mono"
          autoFocus
        />
        <button
          onClick={handleSubmit}
          className="p-1 rounded text-[var(--brand)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          title="Open repo"
        >
          <Icon icon="lucide:arrow-right" width={14} height={14} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
      title="Change repository"
    >
      <Icon icon="lucide:git-branch" width={14} height={14} className="text-[var(--brand)]" />
      <span className="text-[12px] font-mono text-[var(--text-primary)] group-hover:text-[var(--brand)]">
        {repo.fullName}
      </span>
      <span className="text-[10px] text-[var(--text-tertiary)]">({repo.branch})</span>
      <Icon icon="lucide:chevron-down" width={12} height={12} className="text-[var(--text-tertiary)]" />
    </button>
  )
}
