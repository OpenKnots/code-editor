'use client'

import { useMemo, useState, useEffect } from 'react'
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
      <span className="flex h-[16px] w-[16px] items-center justify-center">
        <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: color }} />
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
  const [currentTime, setCurrentTime] = useState('')

  const dirtyCount = useMemo(() => files.filter((f) => f.dirty).length, [files])

  // Update time every minute
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const hours = now.getHours()
      const minutes = now.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      const displayMinutes = minutes.toString().padStart(2, '0')
      setCurrentTime(`${displayHours}:${displayMinutes} ${ampm}`)
    }

    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

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
        {/* Line count */}
        <button
          className="shell-status-item gap-1 hover:bg-[var(--bg-secondary)] rounded-sm px-1.5 py-0.5 transition-colors cursor-pointer"
          title="Line 1, Column 1"
        >
          <span className="text-[10px] font-mono">Ln 1, Col 1</span>
        </button>

        <span className="shell-status-separator" />

        {/* Encoding */}
        <button
          className="shell-status-item gap-1 hover:bg-[var(--bg-secondary)] rounded-sm px-1.5 py-0.5 transition-colors cursor-pointer"
          title="Encoding: UTF-8"
        >
          <span className="text-[10px] font-mono">UTF-8</span>
        </button>

        <span className="shell-status-separator" />

        {/* Current time */}
        {currentTime && (
          <>
            <button
              className="shell-status-item gap-1 hover:bg-[var(--bg-secondary)] rounded-sm px-1.5 py-0.5 transition-colors cursor-pointer"
              title="Current time"
            >
              <Icon icon="lucide:clock" width={10} height={10} />
              <span className="text-[10px] font-mono">{currentTime}</span>
            </button>
            <span className="shell-status-separator" />
          </>
        )}

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
            className="h-[6px] w-[6px] shrink-0 rounded-full"
            style={{
              backgroundColor: status === 'connected' ? 'var(--success)' : 'var(--error)',
            }}
          />
          <span className="text-[10px]">
            {status === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
        </span>

        {devServerReady && (
          <>
            <span className="shell-status-separator" />
            <span className="shell-status-item gap-1" title="Dev server running on localhost:3000">
              <span
                className="h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--success)' }}
              />
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
