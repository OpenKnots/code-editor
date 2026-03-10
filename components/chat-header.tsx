'use client'

import { Icon } from '@iconify/react'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'

interface Props {
  title?: string
  messageCount: number
  isStreaming?: boolean
  modelName?: string
  contextTokens?: number
  maxContextTokens?: number
  activityCount?: number
  filesChanged?: number
}

export function ChatHeader({
  title,
  messageCount,
  isStreaming,
  modelName,
  contextTokens = 0,
  maxContextTokens = 128000,
  activityCount = 0,
  filesChanged = 0,
}: Props) {
  const { repo } = useRepo()
  const local = useLocal()

  const repoName = repo?.fullName ?? local.rootPath?.split('/').pop() ?? null
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null
  const contextPct =
    maxContextTokens > 0 ? Math.min((contextTokens / maxContextTokens) * 100, 100) : 0

  if (!title && messageCount === 0) return null

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  // Hide entire chat header on mobile — saves 40px vertical space
  if (isMobile) return null

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] bg-[var(--sidebar-bg)]">
        <div className="flex flex-1 min-w-0 items-center gap-2">
          {/* Streaming status indicator */}
          {isStreaming ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--brand)]" />
            </span>
          ) : (
            <Icon
              icon="lucide:message-square"
              width={14}
              height={14}
              className="text-[var(--text-tertiary)] shrink-0"
            />
          )}
          <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
            {title || 'Chat'}
          </span>
          {repoName && (
            <>
              <span className="shrink-0 text-[var(--text-disabled)]">&middot;</span>
              <div className="flex min-w-0 items-center gap-1.5">
                <Icon
                  icon="lucide:git-branch"
                  width={12}
                  height={12}
                  className="shrink-0 text-[var(--text-disabled)]"
                />
                <span className="max-w-[180px] truncate text-[12px] font-mono text-[var(--text-tertiary)]">
                  {repoName}
                </span>
                {branchName && (
                  <span className="max-w-[120px] truncate whitespace-nowrap text-[11px] font-mono text-[var(--text-disabled)]">
                    /{branchName}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {/* Model badge */}
          {modelName && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[9px] font-mono text-[var(--text-tertiary)]">
              <Icon icon="lucide:sparkles" width={9} height={9} className="text-[var(--brand)]" />
              <span className="max-w-[90px] truncate">
                {modelName
                  .replace(/^.*\//, '')
                  .replace(/(claude-|gpt-)/, '')
                  .slice(0, 16)}
              </span>
            </span>
          )}
          {isStreaming && activityCount > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--text-disabled)]">
              <Icon icon="lucide:activity" width={9} height={9} className="text-[var(--brand)]" />
              {activityCount} ops
              {filesChanged > 0 && (
                <span className="text-amber-400">· {filesChanged} files</span>
              )}
            </span>
          )}
          {/* Context token count */}
          {contextTokens > 0 && (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[9px] tabular-nums ${
              contextPct > 80 ? 'text-amber-400' : contextPct > 95 ? 'text-red-400' : 'text-[var(--text-disabled)]'
            }`}>
              <Icon icon="lucide:database" width={9} height={9} />
              {contextTokens >= 1000 ? `${(contextTokens / 1000).toFixed(0)}K` : contextTokens}
              <span className="text-[8px]">/{maxContextTokens >= 1000 ? `${(maxContextTokens / 1000).toFixed(0)}K` : maxContextTokens}</span>
            </span>
          )}
          <span className="whitespace-nowrap text-[11px] text-[var(--text-disabled)]">
            {messageCount} msg
          </span>
        </div>
      </div>

      {/* Context usage bar */}
      {contextPct > 0 && (
        <div className="context-usage-bar">
          <div
            className={`context-usage-bar-fill ${contextPct > 80 ? '!bg-[var(--warning)]' : contextPct > 95 ? '!bg-[var(--error)]' : ''}`}
            style={{ width: `${contextPct}%` }}
          />
        </div>
      )}
    </div>
  )
}
