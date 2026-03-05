'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useGateway, type ConnectionStatus } from '@/context/gateway-context'

const STATUS_COPY: Record<ConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: 'Disconnected', color: 'var(--text-tertiary)' },
  connecting: { label: 'Connecting…', color: 'var(--warning, #eab308)' },
  authenticating: { label: 'Authenticating…', color: 'var(--warning, #eab308)' },
  connected: { label: 'Connected', color: 'var(--color-additions)' },
  error: { label: 'Error', color: 'var(--color-deletions)' },
}

/**
 * Prominent banner shown across the top of the editor when the
 * gateway engine is not connected. Includes an inline connect form.
 */
export function GatewayConnectBanner() {
  const { status, error, connect, reconnect, disconnect, gatewayUrl } = useGateway()
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || status === 'authenticating'

  // Pre-fill URL from last known gateway
  useEffect(() => {
    if (gatewayUrl && !url) setUrl(gatewayUrl)
  }, [gatewayUrl])

  // Try to pre-fill from localStorage on mount
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('code-flow:gateway-url')
      if (savedUrl && !url) setUrl(savedUrl)
    } catch {}
  }, [])

  if (isConnected || dismissed) return null

  const handleConnect = () => {
    if (!url.trim()) return
    connect(url.trim(), password)
  }

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-gradient-to-r from-[color-mix(in_srgb,var(--brand)_8%,var(--bg-elevated))] to-[var(--bg-elevated)] animate-fade-in">
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,transparent)] to-[color-mix(in_srgb,var(--brand)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)] flex items-center justify-center">
              <Icon icon="lucide:cpu" width={18} height={18} className="text-[var(--brand)]" />
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-elevated)] transition-colors ${
              isConnecting ? 'bg-[var(--warning,#eab308)] animate-pulse' : 'bg-[var(--text-disabled)]'
            }`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Connect to Gateway Engine
              </h3>
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                style={{
                  color: STATUS_COPY[status].color,
                  backgroundColor: `color-mix(in srgb, ${STATUS_COPY[status].color} 12%, transparent)`,
                }}
              >
                {STATUS_COPY[status].label}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mb-2.5">
              The Gateway Engine powers AI completions, agent chat, and slash commands.
              Enter your gateway URL to get started.
            </p>

            {/* Connect form */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px] max-w-[320px]">
                <input
                  ref={inputRef}
                  type="text"
                  value={url || 'ws://openclaw.local:18789'}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
                  placeholder="ws://openclaw.local:18789"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                  disabled={isConnecting}
                />
              </div>
              <div className="relative min-w-[140px] max-w-[200px]">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
                  placeholder="Password"
                  className="w-full px-2.5 py-1.5 pr-7 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                  disabled={isConnecting}
                />
                <button
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
                  tabIndex={-1}
                >
                  <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} width={11} height={11} />
                </button>
              </div>
              <button
                onClick={handleConnect}
                disabled={!url.trim() || isConnecting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--brand)',
                  color: 'var(--brand-contrast, #fff)',
                }}
              >
                {isConnecting ? (
                  <Icon icon="lucide:loader-2" width={12} height={12} className="animate-spin" />
                ) : (
                  <Icon icon="lucide:plug" width={12} height={12} />
                )}
                {isConnecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>

            {/* Error message */}
            {status === 'error' && error && (
              <div className="flex items-start gap-1.5 mt-2 text-[10px] text-[var(--color-deletions)]">
                <Icon icon="lucide:alert-circle" width={11} height={11} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            title="Dismiss (you can reconnect from the status bar)"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact popover triggered from the status bar for connecting/disconnecting.
 */
export function GatewayConnectPopover({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { status, error, connect, disconnect, reconnect, gatewayUrl, snapshot } = useGateway()
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting' || status === 'authenticating'

  useEffect(() => {
    if (!open) return
    // Pre-fill
    try {
      const savedUrl = localStorage.getItem('code-flow:gateway-url')
      if (savedUrl) setUrl(savedUrl)
    } catch {}
    if (gatewayUrl) setUrl(gatewayUrl)
  }, [open, gatewayUrl])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleConnect = () => {
    if (!url.trim()) return
    connect(url.trim(), password)
  }

  return (
    <div ref={popoverRef} className="absolute bottom-full left-0 mb-1 z-[100] w-[340px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
      <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--brand)_4%,var(--bg-elevated))]">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:cpu" width={14} height={14} className="text-[var(--brand)]" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">Gateway Engine</span>
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full ml-auto"
            style={{
              color: STATUS_COPY[status].color,
              backgroundColor: `color-mix(in srgb, ${STATUS_COPY[status].color} 12%, transparent)`,
            }}
          >
            {STATUS_COPY[status].label}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {isConnected ? (
          <>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-additions)] shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                <span className="text-[12px] font-medium text-[var(--text-primary)]">Connected</span>
              </div>
              {gatewayUrl && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                  <Icon icon="lucide:link" width={10} height={10} />
                  <span className="font-mono truncate">{gatewayUrl}</span>
                </div>
              )}
              {snapshot?.protocol && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                  <Icon icon="lucide:hash" width={10} height={10} />
                  <span>Protocol v{snapshot.protocol}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { reconnect(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-[var(--text-secondary)]"
              >
                <Icon icon="lucide:refresh-cw" width={11} height={11} />
                Reconnect
              </button>
              <button
                onClick={() => { disconnect(); onClose() }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--color-deletions)] hover:bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:unplug" width={11} height={11} />
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              Connect to your OpenClaw gateway for AI completions, agent chat, and more.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={url || 'ws://openclaw.local:18789'}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
                placeholder="ws://openclaw.local:18789"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                disabled={isConnecting}
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
                  placeholder="Password (optional)"
                  className="w-full px-2.5 py-1.5 pr-7 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus)] transition-colors"
                  disabled={isConnecting}
                />
                <button
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
                  tabIndex={-1}
                >
                  <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} width={11} height={11} />
                </button>
              </div>
              <button
                onClick={handleConnect}
                disabled={!url.trim() || isConnecting}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--brand)',
                  color: 'var(--brand-contrast, #fff)',
                }}
              >
                {isConnecting ? (
                  <Icon icon="lucide:loader-2" width={12} height={12} className="animate-spin" />
                ) : (
                  <Icon icon="lucide:plug" width={12} height={12} />
                )}
                {isConnecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>

            {status === 'error' && error && (
              <div className="flex items-start gap-1.5 text-[10px] text-[var(--color-deletions)]">
                <Icon icon="lucide:alert-circle" width={11} height={11} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
