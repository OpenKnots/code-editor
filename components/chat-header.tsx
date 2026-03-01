'use client'

import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'

interface Props {
  title?: string
  messageCount: number
}

export function ChatHeader({ title, messageCount }: Props) {
  const { repo } = useRepo()
  const local = useLocal()

  const repoName = repo?.fullName ?? local.rootPath?.split('/').pop() ?? null
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  if (!title && messageCount === 0) return null

  return (
    <div className="flex items-center justify-between h-11 px-4 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon icon="lucide:message-square" width={14} height={14} className="text-[var(--text-tertiary)] shrink-0" />
        <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
          {title || 'New Chat'}
        </span>
        {repoName && (
          <>
            <span className="text-[var(--text-disabled)]">·</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Icon icon="lucide:git-branch" width={12} height={12} className="text-[var(--text-disabled)]" />
              <span className="text-[12px] font-mono text-[var(--text-tertiary)]">{repoName}</span>
              {branchName && (
                <span className="text-[11px] font-mono text-[var(--text-disabled)]">/{branchName}</span>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-[var(--text-disabled)]">{messageCount} messages</span>
      </div>
    </div>
  )
}
