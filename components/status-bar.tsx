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
    <span className="relative w-4 h-4 flex items-center justify-center" title={statusTitle}>
      <motion.svg
        className="absolute inset-0 w-4 h-4"
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
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ringColor }} />
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
    <footer className="flex items-center justify-between px-3 h-[22px] border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[10px] text-[var(--text-tertiary)] shrink-0">
      <div className="flex items-center gap-3">
        {/* Mode indicator dot */}
        <span className="flex items-center gap-1.5" title={`${modeSpec.label} mode`}>
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{ backgroundColor: 'var(--mode-accent, var(--brand))' }}
          />
          <span className="text-[var(--text-disabled)] font-medium">{modeSpec.label}</span>
        </span>
        <FolderIndicator />
        <BranchPicker />
        {dirtyCount > 0 && (
          <span
            key={dirtyCount}
            className="flex items-center gap-1 text-[var(--warning,#eab308)] animate-badge-pop"
          >
            <Icon icon="lucide:circle-dot" width={8} height={8} />
            {dirtyCount} unsaved
          </span>
        )}
        {/* Active file path */}
        {activeFile && (
          <span
            className="text-[var(--text-disabled)] font-mono truncate max-w-[200px]"
            title={activeFile}
          >
            {activeFile}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <PluginSlotRenderer slot="status-bar-right" />
        {/* Terminal toggle */}
        <button
          onClick={() => layout.toggle('terminal')}
          className={`flex items-center gap-1 px-1 py-0.5 rounded transition-colors cursor-pointer ${
            terminalVisible
              ? 'text-[var(--brand)]'
              : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
          }`}
          title={`${terminalVisible ? 'Hide' : 'Show'} Terminal (⌘J)`}
        >
          <Icon icon="lucide:terminal" width={11} height={11} />
        </button>
        {/* Connection status */}
        <span
          className="flex items-center gap-1"
          title={
            status === 'connected'
              ? 'Gateway connected'
              : status === 'connecting'
                ? 'Connecting...'
                : 'Disconnected'
          }
        >
          <span
            className={`w-[5px] h-[5px] rounded-full ${
              status === 'connected'
                ? 'bg-emerald-400'
                : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
            }`}
          />
        </span>
        <span className="text-[var(--text-disabled)] font-medium">Knot Code</span>
        <ActivityPulseRing status={status} agentActive={agentActive} />
      </div>
    </footer>
  )
}
