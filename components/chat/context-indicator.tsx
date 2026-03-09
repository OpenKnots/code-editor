'use client'

import { Icon } from '@iconify/react'
import { type AgentActivity, summarizeActivities } from '@/lib/agent-activity'

interface Props {
  activities: AgentActivity[]
  isStreaming: boolean
  messageCount: number
}

/**
 * Compact context indicator shown during agent runs.
 * Displays file/action counts as a slim inline badge.
 */
export function ContextIndicator({ activities, isStreaming, messageCount }: Props) {
  if (!isStreaming && activities.length === 0) return null

  const summary = summarizeActivities(activities)
  const totalFiles = summary.filesRead.length + summary.filesEdited.length + summary.filesCreated.length

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand)_15%,var(--border))] text-[9px] text-[var(--text-secondary)]">
      {isStreaming && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand)] opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--brand)]" />
        </span>
      )}
      {totalFiles > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Icon icon="lucide:files" width={9} />
          {totalFiles}
        </span>
      )}
      {summary.totalActions > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Icon icon="lucide:zap" width={9} />
          {summary.totalActions}
        </span>
      )}
      {messageCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Icon icon="lucide:message-square" width={9} />
          {messageCount}
        </span>
      )}
    </div>
  )
}
