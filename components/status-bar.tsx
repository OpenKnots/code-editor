'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useLayout } from '@/context/layout-context'
import { useAppMode } from '@/context/app-mode-context'
import { PluginSlotRenderer } from '@/context/plugin-context'
import { BranchPicker } from '@/components/branch-picker'
import { FolderIndicator } from '@/components/source-switcher'
import { SessionPresence } from '@/components/session-presence'
import { CaffeinateToggle } from '@/components/caffeinate-toggle'

// ─── Activity Pulse Ring ─────────────────────────────
function ActivityPulseRing({ status, agentActive }: { status: string; agentActive: boolean }) {
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || status === 'authenticating'

  const ringColor =
    agentActive && isConnected
      ? 'var(--brand)'
      : isConnected
        ? 'var(--color-additions, #22c55e)'
        : isConnecting
          ? 'var(--warning, #eab308)'
          : 'var(--text-disabled)'

  const statusTitle = isConnected
    ? agentActive
      ? 'Agent working'
      : 'Connected'
    : isConnecting
      ? 'Connecting...'
      : 'Disconnected'

  return (
    <span className="relative w-5 h-5 flex items-center justify-center" title={statusTitle}>
      <motion.svg
        className="absolute inset-0 w-5 h-5"
        viewBox="0 0 16 16"
        animate={
          isConnecting
            ? { rotate: 360 }
            : isConnected
              ? { scale: [1, agentActive ? 1.25 : 1.12, 1], opacity: [0.5, 1, 0.5] }
              : { opacity: 0.4, scale: 1 }
        }
        transition={
          isConnecting
            ? { repeat: Infinity, duration: 2, ease: 'linear' }
            : isConnected
              ? { repeat: Infinity, duration: agentActive ? 1.2 : 3, ease: 'easeInOut' }
              : { duration: 0.3 }
        }
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke={ringColor}
          strokeWidth="1.5"
          strokeDasharray={isConnecting ? '3 3' : undefined}
          strokeLinecap="round"
        />
      </motion.svg>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ringColor }} />
    </span>
  )
}

interface StatusBarProps {
  agentActive: boolean
}

export function StatusBar({ agentActive }: StatusBarProps) {
  const { status } = useGateway()
  const { files, activeFile } = useEditor()
  const layout = useLayout()
  const { spec: modeSpec } = useAppMode()
  const terminalVisible = layout.isVisible('terminal')

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])

  return (
    <footer className="shell-statusbar flex items-center justify-between px-4 h-[34px] text-[11px] text-[var(--text-tertiary)] shrink-0">
      <div className="flex items-center gap-3.5">
        {/* Mode indicator dot */}
        <span className="shell-status-chip" title={`${modeSpec.label} mode`}>
          <span
            className="w-[7px] h-[7px] rounded-full"
            style={{ backgroundColor: 'var(--mode-accent, var(--brand))' }}
          />
          <span className="text-[var(--text-disabled)] font-medium">{modeSpec.label}</span>
        </span>
        <div className="shell-status-chip shell-status-chip--compact">
          <FolderIndicator />
        </div>
        <div className="shell-status-chip shell-status-chip--compact">
          <BranchPicker />
        </div>
        {dirtyCount > 0 && (
          <span
            key={dirtyCount}
            className="shell-status-chip shell-status-chip--attention animate-badge-pop"
          >
            <Icon icon="lucide:circle-dot" width={10} height={10} />
            {dirtyCount} unsaved
          </span>
        )}
        {/* Active file path */}
        {activeFile && (
          <span
            className="shell-status-path text-[var(--text-disabled)] font-mono truncate max-w-[240px]"
            title={activeFile}
          >
            {activeFile}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3.5">
        <div className="shell-status-chip shell-status-chip--compact">
          <SessionPresence compact />
        </div>
        <div className="shell-status-chip shell-status-chip--compact">
          <CaffeinateToggle compact />
        </div>
        <PluginSlotRenderer slot="status-bar-right" />
        {/* Terminal toggle */}
        <button
          onClick={() => layout.toggle('terminal')}
          className={`shell-status-icon-btn ${terminalVisible ? 'shell-status-icon-btn--active' : ''}`}
          title={`${terminalVisible ? 'Hide' : 'Show'} Terminal (⌘J)`}
        >
          <Icon icon="lucide:terminal" width={13} height={13} />
        </button>
        {/* Connection status */}
        <span
          className="shell-status-chip shell-status-chip--connection"
          title={
            status === 'connected'
              ? 'Gateway connected'
              : status === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'
          }
        >
          <span
            className={`w-[6px] h-[6px] rounded-full ${
              status === 'connected'
                ? 'bg-emerald-400'
                : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
            }`}
          />
          <span className="text-[var(--text-secondary)]">
            {status === 'connected'
              ? 'Gateway'
              : status === 'connecting'
                ? 'Connecting'
                : 'Offline'}
          </span>
        </span>
        <span className="shell-status-brand">KnotCode</span>
        <span className="shell-status-chip shell-status-chip--signal">
          <ActivityPulseRing status={status} agentActive={agentActive} />
        </span>
      </div>
    </footer>
  )
}
