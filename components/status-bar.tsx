'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useLayout } from '@/context/layout-context'
import { useAppMode } from '@/context/app-mode-context'
import { PluginSlotRenderer } from '@/context/plugin-context'
import { BranchPicker } from '@/components/branch-picker'
import { FolderIndicator } from '@/components/source-switcher'
import { SessionPresence } from '@/components/session-presence'
import { CaffeinateToggle } from '@/components/caffeinate-toggle'
import { formatShortcut } from '@/lib/platform'

function StatusIndicator({ status, agentActive }: { status: string; agentActive: boolean }) {
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || status === 'authenticating'

  const color =
    agentActive && isConnected
      ? 'var(--brand)'
      : isConnected
        ? 'var(--color-additions, #22c55e)'
        : isConnecting
          ? 'var(--warning, #eab308)'
          : 'var(--text-disabled)'

  const label = isConnected
    ? agentActive
      ? 'Agent working'
      : 'Connected'
    : isConnecting
      ? 'Connecting…'
      : 'Offline'

  return (
    <span className="shell-status-item gap-[5px]" title={label}>
      <span className="relative w-[16px] h-[16px] flex items-center justify-center">
        <motion.svg
          className="absolute inset-0 w-[16px] h-[16px]"
          viewBox="0 0 16 16"
          animate={
            isConnecting
              ? { rotate: 360 }
              : isConnected
                ? { scale: [1, agentActive ? 1.2 : 1.08, 1], opacity: [0.45, 1, 0.45] }
                : { opacity: 0.35, scale: 1 }
          }
          transition={
            isConnecting
              ? { repeat: Infinity, duration: 2, ease: 'linear' }
              : isConnected
                ? { repeat: Infinity, duration: agentActive ? 1.2 : 3.5, ease: 'easeInOut' }
                : { duration: 0.3 }
          }
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeDasharray={isConnecting ? '3 3' : undefined}
            strokeLinecap="round"
          />
        </motion.svg>
        <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: color }} />
      </span>
    </span>
  )
}

interface StatusBarProps {
  agentActive: boolean
  devServerReady?: boolean
}

export function StatusBar({ agentActive, devServerReady }: StatusBarProps) {
  const { status } = useGateway()
  const { files, activeFile } = useEditor()
  const { gitInfo } = useLocal()
  const layout = useLayout()
  const { spec: modeSpec } = useAppMode()
  const terminalVisible = layout.isVisible('terminal')

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])

  return (
    <footer className="shell-statusbar flex items-center justify-between px-3 h-[24px] text-[11px] text-[var(--text-tertiary)] shrink-0">
      {/* ── Left: context info ── */}
      <div className="flex items-center gap-1.5">
        <span className="shell-status-item" title={`${modeSpec.label} mode`}>
          <span
            className="w-[6px] h-[6px] rounded-full shrink-0"
            style={{ backgroundColor: 'var(--mode-accent, var(--brand))' }}
          />
        </span>

        <span className="shell-status-separator" />

        <div className="shell-status-item">
          <FolderIndicator />
        </div>

        <span className="shell-status-separator" />

        <div className="shell-status-item">
          <BranchPicker />
        </div>

        {dirtyCount > 0 && (
          <>
            <span className="shell-status-separator" />
            <span
              key={dirtyCount}
              className="shell-status-item shell-status-item--attention animate-badge-pop"
            >
              <Icon icon="lucide:circle-dot" width={9} height={9} />
              <span>{dirtyCount}</span>
            </span>
          </>
        )}

        {activeFile && (
          <>
            <span className="shell-status-separator" />
            <span
              className="text-[var(--text-disabled)] font-mono text-[10px] truncate max-w-[200px]"
              title={activeFile}
            >
              {activeFile.split('/').pop()}
            </span>
          </>
        )}
      </div>

      {/* ── Right: tools & status ── */}
      <div className="flex items-center gap-1.5">
        {/* Git branch */}
        {gitInfo?.branch && (
          <>
            <span className="shell-status-item gap-1.5" title={`Branch: ${gitInfo.branch}`}>
              <Icon icon="lucide:git-branch" width={11} height={11} />
              <span className="text-[10px] font-mono">{gitInfo.branch}</span>
            </span>
            <span className="shell-status-separator" />
          </>
        )}

        {/* Connection status */}
        <span
          className="shell-status-item gap-1.5"
          title={status === 'connected' ? 'Connected to gateway' : 'Disconnected'}
        >
          <span
            className={`w-[6px] h-[6px] rounded-full shrink-0 ${
              status === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-[10px]">{status === 'connected' ? 'Connected' : 'Disconnected'}</span>
        </span>

        {devServerReady && (
          <>
            <span className="shell-status-separator" />
            <span
              className="shell-status-item gap-1"
              title="Dev server running on localhost:3000"
            >
              <span className="w-[6px] h-[6px] rounded-full bg-green-500 animate-pulse shrink-0" />
              <span className="text-[10px]">localhost:3000</span>
            </span>
          </>
        )}

        <span className="shell-status-separator" />

        <div className="shell-status-item">
          <SessionPresence compact />
        </div>

        <div className="shell-status-item">
          <CaffeinateToggle compact />
        </div>

        <PluginSlotRenderer slot="status-bar-right" />

        <button
          onClick={() => layout.toggle('terminal')}
          className={`shell-status-icon-btn ${terminalVisible ? 'shell-status-icon-btn--active' : ''}`}
          title={`${terminalVisible ? 'Hide' : 'Show'} Terminal (${formatShortcut('meta+J')})`}
        >
          <Icon icon="lucide:terminal" width={12} height={12} />
        </button>

        <span className="shell-status-separator" />

        <StatusIndicator status={status} agentActive={agentActive} />
      </div>
    </footer>
  )
}
