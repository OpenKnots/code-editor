'use client'

import { Icon } from '@iconify/react'
import { motion } from 'framer-motion'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import type { ConnectionStatus } from '@/context/gateway-context'

interface Props {
  title?: string
  messageCount: number
  isStreaming?: boolean
  modelName?: string
  contextTokens?: number
  maxContextTokens?: number
  activityCount?: number
  filesChanged?: number
  connectionStatus?: ConnectionStatus
  connectionError?: string | null
  onReconnect?: () => void
  onClose?: () => void
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
  connectionStatus = 'disconnected',
  connectionError = null,
  onReconnect,
  onClose,
}: Props) {
  const { repo } = useRepo()
  const local = useLocal()

  const repoName = repo?.fullName ?? local.rootPath?.split('/').pop() ?? null
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null
  const contextPct =
    maxContextTokens > 0 ? Math.min((contextTokens / maxContextTokens) * 100, 100) : 0

  if (!title && messageCount === 0) return null

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const connectionMeta: Record<
    ConnectionStatus,
    { label: string; tone: string; dot: string; pulse?: boolean }
  > = {
    disconnected: {
      label: 'Offline',
      tone: 'text-[var(--text-disabled)] border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)]',
      dot: 'bg-zinc-500/80',
    },
    connecting: {
      label: 'Connecting',
      tone: 'text-sky-200 border-sky-500/30 bg-sky-500/10',
      dot: 'bg-sky-400',
      pulse: true,
    },
    authenticating: {
      label: 'Authenticating',
      tone: 'text-violet-200 border-violet-500/30 bg-violet-500/10',
      dot: 'bg-violet-400',
      pulse: true,
    },
    reconnecting: {
      label: 'Reconnecting',
      tone: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
      dot: 'bg-amber-400',
      pulse: true,
    },
    connected: {
      label: 'Online',
      tone: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10',
      dot: 'bg-emerald-400',
    },
    error: {
      label: 'Connection error',
      tone: 'text-rose-200 border-rose-500/30 bg-rose-500/10',
      dot: 'bg-rose-400',
    },
  }
  const connection = connectionMeta[connectionStatus]

  // Hide entire chat header on mobile — saves 40px vertical space
  if (isMobile) return null

  return (
    <div className="shrink-0">
      <div className="flex h-10 items-center justify-between border-b border-[color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color-mix(in_srgb,var(--sidebar-bg)_90%,var(--bg-elevated))] px-3 backdrop-blur-sm">
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
          <motion.span
            key={connectionStatus}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium shadow-[0_10px_24px_rgba(0,0,0,0.18)] ${connection.tone}`}
            title={connectionError ?? `Gateway ${connection.label.toLowerCase()}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connection.dot} ${connection.pulse ? 'connection-pulse' : ''}`}
            />
            {connection.label}
          </motion.span>
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
              {filesChanged > 0 && <span className="text-amber-400">· {filesChanged} files</span>}
            </span>
          )}
          {/* Context token count */}
          {contextTokens > 0 && (
            <span
              className={`inline-flex items-center gap-1 whitespace-nowrap text-[9px] tabular-nums ${
                contextPct > 80
                  ? 'text-amber-400'
                  : contextPct > 95
                    ? 'text-red-400'
                    : 'text-[var(--text-disabled)]'
              }`}
            >
              <Icon icon="lucide:database" width={9} height={9} />
              {contextTokens >= 1000 ? `${(contextTokens / 1000).toFixed(0)}K` : contextTokens}
              <span className="text-[8px]">
                /
                {maxContextTokens >= 1000
                  ? `${(maxContextTokens / 1000).toFixed(0)}K`
                  : maxContextTokens}
              </span>
            </span>
          )}
          <span className="whitespace-nowrap text-[11px] text-[var(--text-disabled)]">
            {messageCount} msg
          </span>
          {(connectionStatus === 'reconnecting' || connectionStatus === 'error') && onReconnect && (
            <button
              onClick={onReconnect}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-2.5 text-[10px] font-medium text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] hover:text-[var(--text-primary)]"
              title="Retry gateway connection"
            >
              <Icon icon="lucide:refresh-cw" width={11} height={11} />
              Retry
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
              title="Close panel"
            >
              <Icon icon="lucide:panel-right-close" width={14} height={14} />
            </button>
          )}
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
