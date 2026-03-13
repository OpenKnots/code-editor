'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type DragEvent } from 'react'
import { Icon } from '@iconify/react'
import { ChatHome } from '@/components/chat-home'
import { ChatHeader } from '@/components/chat-header'
import type { AgentMode } from '@/components/mode-selector'
import { usePermissions } from '@/components/permissions-toggle'
import { AgentApproval } from '@/components/agent-approval'
import { useGateway } from '@/context/gateway-context'
import { useEditor } from '@/context/editor-context'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import {
  createPullRequest,
  fetchPRChecks,
  fetchPRReviews,
  fetchPullRequest,
  fetchPullRequests,
  fetchRepoByName,
  getGithubToken,
  mergePullRequest,
  type PullRequestSummary,
} from '@/lib/github-api'
import { DiffViewer } from '@/components/diff-viewer'
import { parseEditProposals, type EditProposal } from '@/lib/edit-parser'
import { diffEngine } from '@/lib/streaming-diff'
import { handleChatEvent, type ChatMessage, type StreamState } from '@/lib/chat-stream'
import { isTauri, tauriInvoke } from '@/lib/tauri'
import {
  buildEditorPatchSnippet,
  generateCommitMessageWithGateway,
  type CommitMessageChange,
} from '@/lib/gateway-commit-message'
import { MessageList } from '@/components/chat/message-list'
import { ChatInputBar } from '@/components/chat/chat-input-bar'
import type { PickerItem } from '@/components/chat/inline-picker'
import { emit, on } from '@/lib/events'
import { formatShortcut } from '@/lib/platform'
import { useChatAppearance, FONT_OPTIONS } from '@/context/chat-appearance-context'
import { useThread } from '@/context/thread-context'
import {
  CODE_EDITOR_SESSION_KEY,
  SESSION_INIT_STORAGE_KEY,
  CODE_EDITOR_SYSTEM_PROMPT_VERSION,
  buildEditorContext,
  getEffectiveSystemPrompt,
  getAgentConfig,
} from '@/lib/agent-session'
import { addChatHistory, HistoryNavigator } from '@/lib/chat-history'
import {
  SKILL_FIRST_OVERRIDE_TOKEN,
  buildSkillFirstBlockMessage,
  evaluateSkillFirstPolicy,
  updateSkillProbeFromMessage,
} from '@/lib/skill-first-policy'
import { SKILLS_CATALOG, getSkillBySlug } from '@/lib/skills/catalog'
import { buildSkillUseEnvelope } from '@/lib/skills/provider-adapter'
import {
  buildCatalogSummary,
  buildExecutionPlan,
  buildSkillCommandHelp,
  parseSkillSlashCommand,
} from '@/lib/skills/workflow'

// ChatMessage type imported from @/lib/chat-stream

type SshTunnelConfig = {
  destination: string
  sshPort?: number
  localPort?: number
  remotePort?: number
  identityPath?: string | null
}

type SshTunnelStatus = {
  active: boolean
  pid: number | null
  localUrl: string | null
  config: SshTunnelConfig | null
}

type SshTunnelForm = {
  destination: string
  sshPort: string
  localPort: string
  remotePort: string
  identityPath: string
}

type TunnelHealthState = {
  state: 'idle' | 'checking' | 'ok' | 'error'
  message: string
}

const SSH_TUNNEL_STORAGE_KEY = 'code-editor:ssh-tunnel-config'
const DEFAULT_SSH_TUNNEL_FORM: SshTunnelForm = {
  destination: '',
  sshPort: '22',
  localPort: '28789',
  remotePort: '18789',
  identityPath: '',
}

function loadSshTunnelForm(): SshTunnelForm {
  try {
    const raw = localStorage.getItem(SSH_TUNNEL_STORAGE_KEY)
    if (!raw) return DEFAULT_SSH_TUNNEL_FORM
    const parsed = JSON.parse(raw) as Partial<SshTunnelForm>
    return {
      destination: parsed.destination ?? DEFAULT_SSH_TUNNEL_FORM.destination,
      sshPort: parsed.sshPort ?? DEFAULT_SSH_TUNNEL_FORM.sshPort,
      localPort: parsed.localPort ?? DEFAULT_SSH_TUNNEL_FORM.localPort,
      remotePort: parsed.remotePort ?? DEFAULT_SSH_TUNNEL_FORM.remotePort,
      identityPath: parsed.identityPath ?? DEFAULT_SSH_TUNNEL_FORM.identityPath,
    }
  } catch {
    return DEFAULT_SSH_TUNNEL_FORM
  }
}

function getUnknownErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function getHealthUrlFromWs(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:'
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:'
    parsed.pathname = '/health'
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function AgentConnectPrompt() {
  const { status, error, connect } = useGateway()
  const isMobileDevice = typeof window !== 'undefined' && window.innerWidth <= 768
  const isDesktopTauri = typeof window !== 'undefined' && isTauri() && !isMobileDevice
  const [url, setUrl] = useState(isMobileDevice ? '' : 'ws://localhost:18789')
  const [password, setPassword] = useState('')
  const [sshMode, setSshMode] = useState(false)
  const [sshForm, setSshForm] = useState<SshTunnelForm>(() =>
    typeof window === 'undefined' ? DEFAULT_SSH_TUNNEL_FORM : loadSshTunnelForm(),
  )
  const [sshStatus, setSshStatus] = useState<SshTunnelStatus | null>(null)
  const [sshBusy, setSshBusy] = useState(false)
  const [sshError, setSshError] = useState<string | null>(null)
  const [tunnelHealth, setTunnelHealth] = useState<TunnelHealthState>({
    state: 'idle',
    message: '',
  })

  const isConnecting = status === 'connecting' || status === 'authenticating'
  const gatewayError = error?.toLowerCase() ?? ''
  const pairingRequired = gatewayError.includes('pairing required')
  const gatewayTokenMissing =
    gatewayError.includes('gateway token missing') || gatewayError.includes('unauthorized')

  const handleConnect = () => {
    if (!url.trim()) return
    connect(url.trim(), password)
  }

  const refreshSshStatus = useCallback(async () => {
    if (!isDesktopTauri) return null
    try {
      const nextStatus = await tauriInvoke<SshTunnelStatus>('ssh_tunnel_status', {})
      if (!nextStatus) return null
      setSshStatus(nextStatus)
      if (nextStatus.active && nextStatus.localUrl) {
        setSshMode(true)
        setUrl(nextStatus.localUrl)
        setSshForm((prev) => ({
          ...prev,
          localPort: nextStatus.config?.localPort
            ? String(nextStatus.config.localPort)
            : prev.localPort,
        }))
      }
      return nextStatus
    } catch {
      return null
    }
  }, [isDesktopTauri])

  useEffect(() => {
    refreshSshStatus()
  }, [refreshSshStatus])

  useEffect(() => {
    if (!isDesktopTauri) return
    try {
      localStorage.setItem(SSH_TUNNEL_STORAGE_KEY, JSON.stringify(sshForm))
    } catch {}
  }, [isDesktopTauri, sshForm])

  const updateSshForm = useCallback((key: keyof SshTunnelForm, value: string) => {
    setSshForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleStartSshTunnel = useCallback(async () => {
    if (!isDesktopTauri) return

    const destination = sshForm.destination.trim()
    const sshPort = Number.parseInt(sshForm.sshPort, 10)
    const localPort = Number.parseInt(sshForm.localPort, 10)
    const remotePort = Number.parseInt(sshForm.remotePort, 10)

    if (!destination) {
      setSshError('SSH destination is required.')
      return
    }
    if ([sshPort, localPort, remotePort].some((value) => Number.isNaN(value) || value <= 0)) {
      setSshError('SSH, local, and remote ports must be positive numbers.')
      return
    }

    setSshBusy(true)
    setSshError(null)
    try {
      const nextStatus = await tauriInvoke<SshTunnelStatus>('ssh_tunnel_start', {
        config: {
          destination,
          sshPort,
          localPort,
          remotePort,
          identityPath: sshForm.identityPath.trim() || null,
        },
      })
      if (!nextStatus?.localUrl) {
        throw new Error('SSH tunnel started without a forwarded local URL.')
      }
      setSshStatus(nextStatus)
      setSshMode(true)
      setUrl(nextStatus.localUrl)
      setSshForm((prev) => ({
        ...prev,
        localPort: nextStatus.config?.localPort
          ? String(nextStatus.config.localPort)
          : prev.localPort,
      }))
    } catch (err) {
      setSshError(getUnknownErrorMessage(err, 'Failed to start SSH tunnel.'))
    } finally {
      setSshBusy(false)
    }
  }, [isDesktopTauri, sshForm])

  const handleStopSshTunnel = useCallback(async () => {
    if (!isDesktopTauri) return
    setSshBusy(true)
    setSshError(null)
    try {
      const nextStatus = await tauriInvoke<SshTunnelStatus>('ssh_tunnel_stop', {})
      setSshStatus(nextStatus)
      if (url === sshStatus?.localUrl) {
        setUrl('ws://localhost:18789')
      }
      setTunnelHealth({ state: 'idle', message: '' })
    } catch (err) {
      setSshError(getUnknownErrorMessage(err, 'Failed to stop SSH tunnel.'))
    } finally {
      setSshBusy(false)
    }
  }, [isDesktopTauri, sshStatus?.localUrl, url])

  useEffect(() => {
    if (!sshStatus?.active || !sshStatus.localUrl) {
      setTunnelHealth({ state: 'idle', message: '' })
      return
    }

    const healthUrl = getHealthUrlFromWs(sshStatus.localUrl)
    if (!healthUrl) {
      setTunnelHealth({
        state: 'error',
        message: 'Tunnel started, but the forwarded gateway URL could not be verified.',
      })
      return
    }

    const controller = new AbortController()
    setTunnelHealth({
      state: 'checking',
      message: 'Checking the forwarded gateway health endpoint…',
    })

    fetch(healthUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Health check returned ${response.status}`)
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean
          status?: string
        } | null
        if (payload?.ok) {
          setTunnelHealth({
            state: 'ok',
            message: 'Tunnel OK. Enter the gateway auth token and connect.',
          })
          return
        }
        setTunnelHealth({
          state: 'ok',
          message: 'Tunnel is forwarding traffic. Enter the gateway auth token and connect.',
        })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setTunnelHealth({
          state: 'error',
          message:
            err instanceof Error
              ? `Tunnel is up, but /health failed: ${err.message}`
              : 'Tunnel is up, but the forwarded gateway did not respond to /health.',
        })
      })

    return () => controller.abort()
  }, [sshStatus?.active, sshStatus?.localUrl])

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
      {/* Animated connection icon */}
      <div className="relative mb-6">
        <div
          className={`w-16 h-16 rounded-[20px] flex items-center justify-center transition-all duration-500 ${
            isConnecting
              ? 'bg-[color-mix(in_srgb,var(--warning,#eab308)_12%,transparent)] border border-[color-mix(in_srgb,var(--warning,#eab308)_30%,transparent)]'
              : 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)]'
          }`}
        >
          <Icon
            icon={isConnecting ? 'lucide:radio' : 'lucide:radio'}
            width={28}
            height={28}
            className={`transition-colors duration-500 ${
              isConnecting ? 'text-[var(--warning,#eab308)] animate-pulse' : 'text-[var(--brand)]'
            }`}
          />
        </div>
      </div>

      {isConnecting ? (
        <>
          <h3 className="text-[17px] font-semibold text-[var(--text-primary)] mb-1">Connecting…</h3>
          <p className="text-[13px] text-[var(--text-tertiary)]">Looking for your gateway</p>
        </>
      ) : (
        <>
          <h3 className="text-[17px] font-semibold text-[var(--text-primary)] mb-1">
            {sshMode ? 'Connect to Remote Gateway' : 'Connect to Gateway'}
          </h3>
          <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed mb-6 max-w-[280px]">
            {sshMode
              ? 'Start the SSH tunnel first, then enter the OpenClaw gateway token for the remote host.'
              : isMobileDevice
                ? 'Enter your gateway address to start chatting.'
                : 'Make sure OpenClaw is running on this machine.'}
          </p>

          <div className="w-full max-w-[340px] space-y-3">
            {isDesktopTauri && (
              <button
                type="button"
                onClick={() => setSshMode((prev) => !prev)}
                className="w-full flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon icon="lucide:waypoints" width={13} height={13} />
                  Use SSH tunnel
                </span>
                <Icon
                  icon={sshMode ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                  width={13}
                  height={13}
                />
              </button>
            )}

            {isDesktopTauri && sshMode && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-2.5 text-left">
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {[
                    { step: '1', title: 'Start tunnel', active: !sshStatus?.active },
                    {
                      step: '2',
                      title: 'Enter token',
                      active: sshStatus?.active && !pairingRequired,
                    },
                    { step: '3', title: 'Approve device', active: pairingRequired },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className={`rounded-lg border px-2 py-1.5 ${
                        item.active
                          ? 'border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-disabled)]'
                      }`}
                    >
                      <p className="font-semibold">Step {item.step}</p>
                      <p className="mt-0.5">{item.title}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2">
                  <div className="relative">
                    <Icon
                      icon="lucide:server"
                      width={14}
                      height={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                    />
                    <input
                      type="text"
                      value={sshForm.destination}
                      onChange={(e) => updateSshForm('destination', e.target.value)}
                      placeholder="SSH destination (user@host or alias)"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sshForm.sshPort}
                      onChange={(e) => updateSshForm('sshPort', e.target.value)}
                      placeholder="SSH port"
                      className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sshForm.localPort}
                      onChange={(e) => updateSshForm('localPort', e.target.value)}
                      placeholder="Local port"
                      className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sshForm.remotePort}
                      onChange={(e) => updateSshForm('remotePort', e.target.value)}
                      placeholder="Gateway port"
                      className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                  <input
                    type="text"
                    value={sshForm.identityPath}
                    onChange={(e) => updateSshForm('identityPath', e.target.value)}
                    placeholder="Identity file"
                    className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <p className="px-1 text-[10px] text-[var(--text-disabled)]">
                    Required unless this host already works through your local SSH agent or
                    `~/.ssh/config`.
                  </p>
                  <details className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[10px] text-[var(--text-secondary)]">
                    <summary className="cursor-pointer list-none font-medium text-[var(--text-primary)]">
                      How to create an identity file
                    </summary>
                    <div className="mt-2 space-y-2">
                      <p>Create a key on your Mac:</p>
                      <pre className="overflow-x-auto rounded-md bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[10px] text-[var(--text-primary)]">
                        ssh-keygen -t ed25519 -C "you@example.com"
                      </pre>
                      <p>This usually creates `~/.ssh/id_ed25519` and `~/.ssh/id_ed25519.pub`.</p>
                      <p>Copy the public key to the remote host:</p>
                      <pre className="overflow-x-auto rounded-md bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[10px] text-[var(--text-primary)]">
                        ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host
                      </pre>
                      <p>
                        Then enter the private key path here, for example `
                        /Users/you/.ssh/id_ed25519`.
                      </p>
                    </div>
                  </details>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleStartSshTunnel}
                    disabled={sshBusy}
                    className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--brand)',
                      color: 'var(--brand-contrast, #fff)',
                    }}
                  >
                    {sshBusy ? 'Starting…' : 'Start tunnel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopSshTunnel}
                    disabled={!sshStatus?.active || sshBusy}
                    className="px-3 py-2.5 rounded-lg border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Stop
                  </button>
                </div>

                {sshStatus?.active && sshStatus.localUrl && (
                  <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                    <p className="font-medium text-[var(--text-primary)]">Tunnel active</p>
                    <p className="mt-0.5 font-mono break-all">{sshStatus.localUrl}</p>
                    <div className="mt-1 flex items-start gap-2">
                      <Icon
                        icon={
                          tunnelHealth.state === 'ok'
                            ? 'lucide:badge-check'
                            : tunnelHealth.state === 'error'
                              ? 'lucide:triangle-alert'
                              : 'lucide:loader-circle'
                        }
                        width={12}
                        height={12}
                        className={`mt-0.5 shrink-0 ${
                          tunnelHealth.state === 'ok'
                            ? 'text-[var(--color-additions,#22c55e)]'
                            : tunnelHealth.state === 'error'
                              ? 'text-[var(--warning,#eab308)]'
                              : 'text-[var(--text-disabled)] animate-spin'
                        }`}
                      />
                      <p className="text-[var(--text-disabled)]">
                        {tunnelHealth.message ||
                          'SSH auth uses your local SSH config and agent. Interactive password prompts are not supported in-app.'}
                      </p>
                    </div>
                    <p className="mt-2 text-[var(--text-disabled)]">
                      SSH auth uses your local SSH config and agent. Interactive password prompts
                      are not supported in-app.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {sshMode ? 'Forwarded gateway URL' : 'Gateway URL'}
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:globe"
                  width={15}
                  height={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect()
                  }}
                  placeholder={
                    isMobileDevice ? 'wss://your-gateway.ts.net' : 'ws://localhost:18789'
                  }
                  className="w-full pl-10 pr-3 py-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[14px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] transition-all"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={sshMode && Boolean(sshStatus?.active)}
                />
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                Gateway auth token
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:lock"
                  width={15}
                  height={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnect()
                  }}
                  placeholder="OpenClaw gateway token or password"
                  className="w-full pl-10 pr-3 py-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[14px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] transition-all"
                />
              </div>
              <p className="text-[10px] text-[var(--text-disabled)]">
                This is the OpenClaw gateway secret from the remote host, not your SSH password.
              </p>
            </div>

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={!url.trim() || (sshMode && !sshStatus?.active)}
              className="w-full py-3.5 rounded-xl text-[14px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: url.trim() ? 'var(--brand)' : 'var(--bg-subtle)',
                color: url.trim() ? 'var(--brand-contrast, #fff)' : 'var(--text-disabled)',
              }}
            >
              Connect
            </button>

            {/* Desktop retry */}
            {!isMobileDevice && !sshMode && (
              <button
                onClick={() => connect('ws://localhost:18789', '')}
                className="w-full flex items-center justify-center gap-2 py-2 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:refresh-cw" width={12} height={12} />
                Retry localhost
              </button>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 mt-4 py-2.5 px-3.5 rounded-lg bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-deletions)_15%,transparent)] text-[12px] text-[var(--color-deletions)] max-w-[340px] text-left">
              <Icon icon="lucide:alert-circle" width={14} height={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {sshError && (
            <div className="flex items-start gap-2 mt-3 py-2.5 px-3.5 rounded-lg bg-[color-mix(in_srgb,var(--warning,#eab308)_10%,transparent)] border border-[color-mix(in_srgb,var(--warning,#eab308)_20%,transparent)] text-[12px] text-[var(--warning,#eab308)] max-w-[340px] text-left">
              <Icon
                icon="lucide:triangle-alert"
                width={14}
                height={14}
                className="shrink-0 mt-0.5"
              />
              <span>{sshError}</span>
            </div>
          )}
          {pairingRequired && (
            <div className="mt-3 w-full max-w-[340px] rounded-lg border border-[color-mix(in_srgb,var(--warning,#eab308)_25%,transparent)] bg-[color-mix(in_srgb,var(--warning,#eab308)_10%,transparent)] px-3.5 py-3 text-left text-[12px] text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">Device approval required</p>
              <p className="mt-1">
                On the remote host, approve this Mac once, then click Connect again:
              </p>
              <code className="mt-2 block rounded bg-[var(--bg)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)]">
                openclaw devices list
              </code>
              <code className="mt-2 block rounded bg-[var(--bg)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)]">
                openclaw devices approve &lt;request-id&gt;
              </code>
            </div>
          )}
          {gatewayTokenMissing && !pairingRequired && (
            <div className="mt-3 w-full max-w-[340px] rounded-lg border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_7%,transparent)] px-3.5 py-3 text-left text-[12px] text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">Gateway token required</p>
              <p className="mt-1">
                Enter the OpenClaw gateway secret from the remote host config, then connect again.
              </p>
            </div>
          )}

          {/* Tips */}
          {isMobileDevice && (
            <div className="mt-5 text-[11px] text-[var(--text-disabled)] max-w-[340px] space-y-0.5">
              <p>
                Use your Tailscale Funnel URL or{' '}
                <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--brand)]">
                  ws://ip:18789
                </code>
              </p>
            </div>
          )}
          {!isMobileDevice && (
            <div className="mt-4 text-[11px] text-[var(--text-disabled)] space-y-1">
              <p>
                Run{' '}
                <code className="px-1 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--brand)]">
                  openclaw gateway start
                </code>{' '}
                for local use.
              </p>
              {isDesktopTauri && (
                <p>
                  For remote hosts, start an SSH tunnel here and connect through the forwarded
                  localhost port.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function buildGatewayMessage(message: string, context?: string): string {
  const trimmedContext = context?.trim()
  if (!trimmedContext) return message
  return `${message}\n\n[Additional Context]\n${trimmedContext}`
}

function titleFromBranchName(branch: string): string {
  const raw = branch.split('/').pop() ?? branch
  const normalized = raw.replace(/[-_]+/g, ' ').trim()
  if (!normalized) return 'Update'
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildDefaultPullRequestBody(head: string, base: string): string {
  return [
    '## Summary',
    `- Merge \`${head}\` into \`${base}\``,
    '',
    '## Test plan',
    '- [ ] Not run',
  ].join('\n')
}

function parsePullRequestCreateArgs(rawArgs: string): {
  title: string
  body: string
  base: string | null
} {
  let args = rawArgs.trim()
  let base: string | null = null

  const baseMatch = args.match(/(?:^|\s)--base\s+([^\s]+)\s*$/i)
  if (baseMatch) {
    base = baseMatch[1]
    args = args.slice(0, baseMatch.index).trim()
  }

  const [title = '', body = ''] = args.split(/\s+::\s+/, 2)
  return { title: title.trim(), body: body.trim(), base }
}

function formatPullRequestList(
  repoFullName: string,
  prs: PullRequestSummary[],
  currentBranch: string | null,
): string {
  if (prs.length === 0) return `No open pull requests in \`${repoFullName}\`.`

  return [
    `Open pull requests in \`${repoFullName}\`:`,
    ...prs.slice(0, 10).map((pr) => {
      const flags: string[] = []
      if (pr.draft) flags.push('draft')
      if (currentBranch && pr.headRef === currentBranch) flags.push('current branch')
      const suffix = flags.length > 0 ? ` · ${flags.join(', ')}` : ''
      return `- #${pr.number} ${pr.title} (${pr.headRef} -> ${pr.baseRef})${suffix}`
    }),
  ].join('\n')
}

function summarizeChecks(checks: Array<{ conclusion: string | null; status: string }>): string {
  if (checks.length === 0) return 'No checks reported'
  const passed = checks.filter((check) => check.conclusion === 'success').length
  const failed = checks.filter((check) => check.conclusion === 'failure').length
  const pending = checks.filter(
    (check) => check.status !== 'completed' || check.conclusion === null,
  ).length
  return `${passed} passing, ${failed} failing, ${pending} pending`
}

function formatPullRequestDetails(
  pr: PullRequestSummary,
  reviewCount: number,
  checksSummary: string,
): string {
  const stateLabel = pr.merged ? 'merged' : pr.draft ? 'draft' : pr.state
  const bodyPreview = pr.body?.trim()
  const lines = [
    `PR #${pr.number}: ${pr.title}`,
    `State: ${stateLabel}`,
    `Branch: ${pr.headRef} -> ${pr.baseRef}`,
    `Files: ${pr.changedFiles} changed · +${pr.additions} -${pr.deletions}`,
    `Reviews: ${reviewCount}`,
    `Checks: ${checksSummary}`,
    `URL: ${pr.url}`,
  ]

  if (bodyPreview) {
    lines.push('', bodyPreview)
  }

  return lines.join('\n')
}

export function AgentPanel({ onClose }: { onClose?: () => void } = {}) {
  const { sendRequest, onEvent, status } = useGateway()
  const { files, activeFile, getFile, openFile, updateFileContent } = useEditor()
  const { repo, tree: repoTree } = useRepo()
  const local = useLocal()
  const permissions = usePermissions()
  const { chatFontSize, chatFontFamily, increaseFontSize, decreaseFontSize, setChatFontFamily } =
    useChatAppearance()

  const { activeThreadId, chatStorageKey } = useThread()
  const storageKey = chatStorageKey(activeThreadId)
  const sessionKey = `${CODE_EDITOR_SESSION_KEY}:${activeThreadId}`

  function loadMessagesForThread(key: string): ChatMessage[] {
    try {
      const saved = localStorage.getItem(key)
      if (!saved) return []
      const parsed = JSON.parse(saved) as ChatMessage[]
      return parsed.filter((m) => {
        const c = m.content?.slice(0, 120) ?? ''
        if (c.includes('You are KnotCode Agent') || c.includes('KnotCode system prompt'))
          return false
        return true
      })
    } catch {
      // Ignore parse errors, return empty array
      return []
    }
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessagesForThread(storageKey))
  const [input, setInput] = useState('')
  const [contextAttachments, setContextAttachments] = useState<
    Array<{
      type: 'file' | 'selection'
      path: string
      content: string
      startLine?: number
      endLine?: number
    }>
  >([])
  const [atMenuOpen, setAtMenuOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atMenuIdx, setAtMenuIdx] = useState(0)
  const [imageAttachments, setImageAttachments] = useState<
    Array<{ name: string; dataUrl: string }>
  >([])
  const [modelInfo, setModelInfo] = useState<{ current: string; available: string[] }>({
    current: '',
    available: [],
  })
  const [agentMode, setAgentMode] = useState<AgentMode>('ask')
  const [contextTokens, setContextTokens] = useState(0)
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1)
  const [confirmClear, setConfirmClear] = useState(false)

  // ─── Inline picker state ──────────────────────────────────────
  const [activePicker, setActivePicker] = useState<'skill' | 'prompt' | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [thinkingTrail, setThinkingTrail] = useState<string[]>([])
  const [agentActivities, setAgentActivities] = useState<
    import('@/lib/agent-activity').AgentActivity[]
  >([])
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null)
  const [turnElapsedMs, setTurnElapsedMs] = useState(0)
  const [activeDiff, setActiveDiff] = useState<{
    proposal: EditProposal
    messageId: string
    original: string
  } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyNav = useRef(new HistoryNavigator())
  const sessionInitRef = useRef(false)
  const sentKeysRef = useRef(new Set<string>())
  const handledKeysRef = useRef(new Set<string>())
  const sendingRef = useRef(false)
  const sessionKeyRef = useRef(sessionKey)
  const [streamBuffer, setStreamBuffer] = useState('')
  const logChatDebug = useCallback((stage: string, details?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    if (details) {
      console.debug('[knot-chat]', stage, details)
      return
    }
    console.debug('[knot-chat]', stage)
  }, [])

  useEffect(() => {
    sessionKeyRef.current = sessionKey
  }, [sessionKey])

  // When switching thread, load that thread's messages and reset session init for the new session
  useEffect(() => {
    setMessages(loadMessagesForThread(storageKey))
    sessionInitRef.current = false
  }, [activeThreadId, storageKey])
  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  // Build flat file list for @ mentions
  const allFilePaths = useMemo(() => {
    if (local.localMode && local.localTree.length > 0) {
      return local.localTree.filter((e) => !e.is_dir).map((e) => e.path)
    }
    return repoTree.filter((n) => n.type === 'blob').map((n) => n.path)
  }, [local.localMode, local.localTree, repoTree])

  const atResults = useMemo(() => {
    if (!atQuery) return allFilePaths.slice(0, 8)
    const q = atQuery.toLowerCase()
    return allFilePaths
      .filter((p) => p.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.split('/').pop()!.toLowerCase()
        const bName = b.split('/').pop()!.toLowerCase()
        const aStarts = aName.startsWith(q) ? 0 : 1
        const bStarts = bName.startsWith(q) ? 0 : 1
        return aStarts - bStarts || a.length - b.length
      })
      .slice(0, 8)
  }, [atQuery, allFilePaths])

  const isConnected = status === 'connected'

  // ─── Fetch model info from gateway ────────────────────────
  useEffect(() => {
    if (!isConnected) return
    ;(async () => {
      try {
        // Get current session status for model info
        const status = (await sendRequest('sessions.status', { sessionKey })) as
          | Record<string, unknown>
          | undefined
        const model = (status?.model as string) || (status?.defaultModel as string) || ''

        // Get available models/agents
        const agentsResp = (await sendRequest('agents.list', {})) as
          | Record<string, unknown>
          | undefined
        const agents = (agentsResp?.agents as Array<Record<string, unknown>>) || []
        const models = agents
          .map((a) => (a.model as string) || (a.id as string))
          .filter(Boolean)
          .slice(0, 4)

        // Fallback: try config for default model
        if (!models.length) {
          const configResp = (await sendRequest('config.get', { key: 'defaultModel' })) as
            | Record<string, unknown>
            | undefined
          const defaultModel = configResp?.value as string
          if (defaultModel) models.push(defaultModel)
        }

        setModelInfo({
          current: model || 'unknown',
          available: models.length ? models : [model || 'claude-sonnet-4-5'],
        })
      } catch {
        setModelInfo({ current: 'claude-sonnet-4-5', available: ['claude-sonnet-4-5'] })
      }
    })()
  }, [isConnected, sendRequest, sessionKey])

  // ─── Lazy session initialization (only on first message) ──────
  const ensureSessionInit = useCallback(async () => {
    if (sessionInitRef.current) return

    const initKey = `${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`
    const alreadyInit = typeof window !== 'undefined' && sessionStorage.getItem(initKey)
    if (alreadyInit) {
      sessionInitRef.current = true
      return
    }

    try {
      const effectivePrompt = getEffectiveSystemPrompt()
      await sendRequest('chat.inject', {
        sessionKey,
        message: effectivePrompt,
        label: 'KnotCode system prompt',
      })
      sessionInitRef.current = true
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(initKey, 'true')
      }
      // Label the session only after init succeeds
      sendRequest('sessions.patch', {
        key: sessionKey,
        label: 'KnotCode',
      }).catch(() => {})
    } catch {
      // Non-fatal — session still works without explicit system prompt
    }
  }, [sendRequest, sessionKey])

  // ─── Stream state for chat-stream handler ──────────────────────
  const streamStateRef = useRef<StreamState>({
    sentKeys: new Set<string>(),
    handledKeys: new Set<string>(),
    lastFinal: null,
    sessionKey,
    isSending: false,
  })
  // Keep stream state in sync
  useEffect(() => {
    streamStateRef.current.sentKeys = sentKeysRef.current
    streamStateRef.current.handledKeys = handledKeysRef.current
    streamStateRef.current.sessionKey = sessionKey
  }, [sessionKey])
  useEffect(() => {
    streamStateRef.current.isSending = sending
  }, [sending])

  // ─── Elapsed time tracker ─────────────────────────────────────
  useEffect(() => {
    if (isStreaming || sending) {
      if (!turnStartTime) setTurnStartTime(Date.now())
      const timer = setInterval(() => {
        setTurnElapsedMs(turnStartTime ? Date.now() - turnStartTime : 0)
      }, 100)
      return () => clearInterval(timer)
    } else {
      if (turnStartTime) {
        setTurnElapsedMs(Date.now() - turnStartTime)
        setTurnStartTime(null)
      }
    }
  }, [isStreaming, sending, turnStartTime])

  // ─── Load chat input history ─────────────────────────────────
  useEffect(() => {
    historyNav.current.load()
  }, [])

  // ─── Listen for chat events (streaming replies) ───────────────
  useEffect(() => {
    const callbacks = {
      setStreamBuffer,
      setIsStreaming,
      setSending,
      setThinkingTrail,
      setAgentActivities,
      setMessages,
      getFile,
    }
    const unsub = onEvent('chat', (payload: unknown) => {
      const evt = payload as Record<string, unknown>
      logChatDebug('chat event received', {
        state: evt?.state,
        idempotencyKey: evt?.idempotencyKey ?? evt?.idempotency_key,
        sessionKey: evt?.sessionKey ?? evt?.session_key,
        hasMessage: Boolean(evt?.message),
        hasText: typeof evt?.text === 'string',
        hasReply: typeof evt?.reply === 'string',
      })
      handleChatEvent(payload, streamStateRef.current, callbacks)
    })
    return unsub
  }, [onEvent, getFile, logChatDebug])

  // ─── @ mention file selection ──────────────────────────────
  const selectAtFile = useCallback(
    async (filePath: string) => {
      // Replace @query with @filename in input
      const textarea = inputRef.current
      if (textarea) {
        const cursor = textarea.selectionStart ?? input.length
        const before = input.slice(0, cursor)
        const after = input.slice(cursor)
        const newBefore = before.replace(/@[\w./-]*$/, '')
        setInput(newBefore + after)
      }

      // Load file content and add as context attachment
      const existing = getFile(filePath)
      if (existing) {
        setContextAttachments((prev) => {
          if (prev.some((a) => a.path === filePath && a.type === 'file')) return prev
          return [...prev, { type: 'file', path: filePath, content: existing.content }]
        })
      } else {
        // Try to read from open files or fetch
        setContextAttachments((prev) => {
          if (prev.some((a) => a.path === filePath && a.type === 'file')) return prev
          return [
            ...prev,
            {
              type: 'file',
              path: filePath,
              content: `[File: ${filePath} — content will be fetched on send]`,
            },
          ]
        })
      }
      setAtMenuOpen(false)
      setAtQuery('')
      inputRef.current?.focus()
    },
    [input, getFile],
  )

  // ─── ⌘L: Send selection to agent panel ────────────────────
  useEffect(() => {
    return on('add-to-chat', (detail) => {
      setContextAttachments((prev) => [
        ...prev,
        {
          type: 'selection',
          path: detail.path,
          content: detail.content,
          startLine: detail.startLine,
          endLine: detail.endLine,
        },
      ])
      inputRef.current?.focus()
    })
  }, [])

  // ─── File handling (drag & drop, paste, file picker) ─────
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).slice(0, 5)
    for (const file of dropped) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setImageAttachments((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string },
          ])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setContextAttachments((prev) => [
            ...prev,
            {
              type: 'file' as const,
              path: file.name,
              content: (reader.result as string).slice(0, 12000),
            },
          ])
        }
        reader.readAsText(file)
      }
    }
  }, [])

  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'))
    if (items.length === 0) return
    e.preventDefault()
    for (const item of items.slice(0, 3)) {
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        setImageAttachments((prev) => [
          ...prev,
          { name: `screenshot-${Date.now()}.png`, dataUrl: reader.result as string },
        ])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleFileAttach = useCallback(() => {
    const picker = document.createElement('input')
    picker.type = 'file'
    picker.multiple = true
    picker.onchange = () => {
      const selected = Array.from(picker.files || []).slice(0, 5)
      for (const file of selected) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = () => {
            setImageAttachments((prev) => [
              ...prev,
              { name: file.name, dataUrl: reader.result as string },
            ])
          }
          reader.readAsDataURL(file)
        } else {
          const reader = new FileReader()
          reader.onload = () => {
            setContextAttachments((prev) => [
              ...prev,
              {
                type: 'file' as const,
                path: file.name,
                content: (reader.result as string).slice(0, 12000),
              },
            ])
          }
          reader.readAsText(file)
        }
      }
    }
    picker.click()
  }, [])

  const handleImageAttach = useCallback(() => {
    const picker = document.createElement('input')
    picker.type = 'file'
    picker.multiple = true
    picker.accept = 'image/*'
    picker.onchange = () => {
      const selected = Array.from(picker.files || []).slice(0, 5)
      for (const file of selected) {
        const reader = new FileReader()
        reader.onload = () => {
          setImageAttachments((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string },
          ])
        }
        reader.readAsDataURL(file)
      }
    }
    picker.click()
  }, [])

  // ─── Full-panel drag-and-drop overlay ─────────────────────
  const [panelDragOver, setPanelDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handlePanelDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setPanelDragOver(true)
    }
  }, [])

  const handlePanelDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setPanelDragOver(false)
    }
  }, [])

  const handlePanelDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handlePanelDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setPanelDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).slice(0, 5)
    for (const file of dropped) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setImageAttachments((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string },
          ])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setContextAttachments((prev) => [
            ...prev,
            {
              type: 'file' as const,
              path: file.name,
              content: (reader.result as string).slice(0, 12000),
            },
          ])
        }
        reader.readAsText(file)
      }
    }
    inputRef.current?.focus()
  }, [])

  // ─── Estimate context token usage ──────────────────────────
  useEffect(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    const fileTokens = file ? Math.ceil(Math.min(file.content.length, 8000) / 4) : 0
    const attachTokens = contextAttachments.reduce(
      (sum, a) => sum + Math.ceil(Math.min(a.content.length, 6000) / 4),
      0,
    )
    const imageTokens = imageAttachments.length * 1000 // ~1k tokens per image estimate
    setContextTokens(fileTokens + attachTokens + imageTokens)
  }, [activeFile, getFile, contextAttachments, imageAttachments])

  // ─── Listen for set-agent-input events ─────────────────────
  useEffect(() => {
    return on('set-agent-input', (detail) => {
      if (detail.text) setInput(detail.text)
      inputRef.current?.focus()
    })
  }, [])

  // ─── Listen for prompt-use events (from prompt library) ────
  useEffect(() => {
    return on('prompt-use', (detail) => {
      if (detail.text) setInput(detail.text)
      inputRef.current?.focus()
    })
  }, [])

  // ─── Listen for focus-agent-input (⌘L from anywhere) ──────
  useEffect(() => {
    return on('focus-agent-input', () => inputRef.current?.focus())
  }, [])

  // ─── Build per-message context ────────────────────────────────
  const buildContext = useCallback(() => {
    const file = activeFile ? getFile(activeFile) : undefined
    return buildEditorContext({
      repoFullName: repo?.fullName,
      branch: repo?.branch,
      activeFilePath: file?.path,
      activeFileContent: file?.content,
      activeFileLanguage: file?.language,
      openFiles: files.map((f) => ({ path: f.path, dirty: f.dirty })),
      runtime: 'local',
      permissions,
    })
  }, [repo, activeFile, files, getFile, permissions])

  const buildAttachmentContext = useCallback(() => {
    let attachCtx = ''
    for (const att of contextAttachments) {
      if (att.type === 'file') {
        const ext = att.path.split('.').pop() ?? ''
        attachCtx +=
          `\n\n[Referenced file: ${att.path}]\n` +
          '```' +
          ext +
          '\n' +
          att.content.slice(0, 6000) +
          '\n```'
      } else if (att.type === 'selection') {
        const ext = att.path.split('.').pop() ?? ''
        attachCtx +=
          `\n\n[Selected code: ${att.path}:${att.startLine}-${att.endLine}]\n` +
          '```' +
          ext +
          '\n' +
          att.content +
          '\n```'
      }
    }
    for (const img of imageAttachments) {
      attachCtx += `\n\n[Attached screenshot: ${img.name}]`
    }
    return attachCtx
  }, [contextAttachments, imageAttachments])

  const buildAttachmentLabels = useCallback(() => {
    const labels: string[] = []

    for (const att of contextAttachments) {
      if (att.type === 'selection') {
        const startLine = att.startLine ?? 1
        const endLine = att.endLine ?? startLine
        const lineCount = Math.max(1, endLine - startLine + 1)
        labels.push(
          `📝 ${att.path.split('/').pop()}:${startLine}-${endLine} (${lineCount} line${lineCount === 1 ? '' : 's'} selected)`,
        )
      } else {
        const lineCount = att.content.split('\n').length
        labels.push(
          `📄 ${att.path.split('/').pop()} (${lineCount} line${lineCount === 1 ? '' : 's'})`,
        )
      }
    }

    for (const img of imageAttachments) {
      labels.push(`🖼 ${img.name}`)
    }

    return labels
  }, [contextAttachments, imageAttachments])

  const buildSilentContext = useCallback(() => {
    const context = buildContext()
    const attachCtx = buildAttachmentContext()
    const modePrefix =
      agentMode === 'ask'
        ? '[Mode: Ask — discuss and answer questions. Do not make code changes unless explicitly asked.]\n'
        : agentMode === 'plan'
          ? '[Mode: Plan — You MUST respond with a structured plan before making any changes. Format your response as a numbered list where each step has a **bold title** followed by a description and affected files in backticks. Example:\n1. **Update auth module** — Add token refresh logic\n   `lib/auth.ts`, `lib/api.ts`\n2. **Add tests** — Cover the new refresh flow\n   `tests/auth.test.ts`\nAfter the user approves, execute each step sequentially. Do NOT make changes until approved.]\n'
          : '[Mode: Agent — You are an autonomous coding agent. Make direct code changes without asking for permission. Read files to understand context, edit them to implement changes, run commands to verify your work. After making changes, briefly summarize what you did and which files were modified. If a change fails, diagnose and fix it automatically.]\n'
    return [modePrefix, context || '', attachCtx].filter(Boolean).join('\n\n')
  }, [agentMode, buildAttachmentContext, buildContext])

  // ─── Message helpers ──────────────────────────────────────────
  // parsePlanSteps moved to components/chat/message-list.tsx

  // Persist messages to localStorage for current thread and notify sidebar to refresh list
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)))
        emit('threads-updated')
      } catch {
        // Ignore storage errors
      }
    }
  }, [messages, storageKey])

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (
        last &&
        last.role === msg.role &&
        last.content === msg.content &&
        Math.abs(last.timestamp - msg.timestamp) < 2000
      ) {
        return prev
      }
      return [...prev, msg]
    })
  }, [])

  const enforceSkillFirstPolicy = useCallback(
    (message: string): boolean => {
      updateSkillProbeFromMessage(sessionKey, message)
      const policy = evaluateSkillFirstPolicy({
        sessionKey,
        message,
        mode: 'hard_with_override',
      })

      if (policy.blocked) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: buildSkillFirstBlockMessage(policy),
          timestamp: Date.now(),
        })
        return false
      }

      if (policy.overrideUsed) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'status',
          content: `Skill-first override accepted via ${SKILL_FIRST_OVERRIDE_TOKEN}.`,
          timestamp: Date.now(),
        })
      }

      return true
    },
    [appendMessage, sessionKey],
  )

  const sendStructuredGatewayMessage = useCallback(
    async ({
      displayText,
      outboundMessage,
      images,
      preserveAttachments = false,
    }: {
      displayText: string
      outboundMessage: string
      images?: Array<{ name: string; dataUrl: string }>
      preserveAttachments?: boolean
    }) => {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: displayText,
        timestamp: Date.now(),
        images,
      })

      if (!isConnected) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: 'Gateway disconnected — cannot reach agent.',
          timestamp: Date.now(),
        })
        setSending(false)
        streamStateRef.current.isSending = false
        return
      }

      await ensureSessionInit()

      if (!preserveAttachments) {
        setContextAttachments([])
        setImageAttachments([])
      }

      const idemKey = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      sentKeysRef.current.add(idemKey)

      setIsStreaming(true)
      logChatDebug('chat.send request', {
        sessionKey,
        idempotencyKey: idemKey,
        promptChars: outboundMessage.length,
      })

      const resp = (await sendRequest('chat.send', {
        sessionKey,
        message: outboundMessage,
        idempotencyKey: idemKey,
      })) as Record<string, unknown> | undefined

      const respStatus = resp?.status as string | undefined
      logChatDebug('chat.send response', {
        status: respStatus ?? 'unknown',
        hasReply: Boolean(resp?.reply || resp?.text || resp?.content),
        responseKeys: resp ? Object.keys(resp) : [],
      })
      if (respStatus === 'started' || respStatus === 'in_flight' || respStatus === 'streaming') {
        return
      }

      if (!sentKeysRef.current.has(idemKey) || handledKeysRef.current.has(idemKey)) return
      sentKeysRef.current.delete(idemKey)
      handledKeysRef.current.add(idemKey)
      setTimeout(() => handledKeysRef.current.delete(idemKey), 10000)
      const reply = String(resp?.reply ?? resp?.text ?? resp?.content ?? '')
      if (!reply && respStatus) {
        logChatDebug('response acknowledged without inline reply', {
          idempotencyKey: idemKey,
          status: respStatus,
        })
        return
      }
      if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
        const editProposals = parseEditProposals(reply)
        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          type: editProposals.length > 0 ? 'edit' : 'text',
          content: reply,
          timestamp: Date.now(),
          editProposals: editProposals.length > 0 ? editProposals : undefined,
        })
        emit('agent-reply')
        logChatDebug('assistant reply appended from direct response', {
          idempotencyKey: idemKey,
          replyChars: reply.length,
          editProposalCount: editProposals.length,
        })
      }
      setIsStreaming(false)
      setSending(false)
      streamStateRef.current.isSending = false
    },
    [
      appendMessage,
      ensureSessionInit,
      isConnected,
      logChatDebug,
      sendRequest,
      sessionKey,
      setContextAttachments,
      setImageAttachments,
    ],
  )

  const collectCommitChangesForGeneration = useCallback(async (): Promise<
    CommitMessageChange[]
  > => {
    const changes: CommitMessageChange[] = []
    const seenPaths = new Set<string>()

    if (local.localMode && local.rootPath && local.gitInfo?.is_repo) {
      const gitStatuses = local.gitInfo.status ?? []
      for (const statusEntry of gitStatuses) {
        seenPaths.add(statusEntry.path)
        const hasStaged = statusEntry.index_status !== ' ' && statusEntry.index_status !== '?'
        const hasWorktree = statusEntry.worktree_status !== ' '
        const stagedOnly = hasStaged && !hasWorktree
        let patch = ''
        try {
          patch = await local.getDiff(statusEntry.path, stagedOnly)
          if (!patch && hasStaged) {
            patch = await local.getDiff(statusEntry.path, true)
          }
        } catch {
          // Ignore diff errors, continue without patch
        }

        const summaryBits: string[] = []
        if (statusEntry.status === '??') summaryBits.push('untracked')
        if (hasStaged) summaryBits.push('staged')
        if (hasWorktree) summaryBits.push('unstaged')

        changes.push({
          path: statusEntry.path,
          status:
            statusEntry.status?.trim() ||
            `${statusEntry.index_status}${statusEntry.worktree_status}`.trim() ||
            'M',
          summary: summaryBits.join(', ') || undefined,
          patch: patch || undefined,
        })
      }
    }

    for (const file of files) {
      if (!file.dirty || file.kind !== 'text') continue
      if (seenPaths.has(file.path)) continue
      const snippet = buildEditorPatchSnippet(file.originalContent, file.content)
      changes.push({
        path: file.path,
        status: 'M',
        summary: 'unsaved editor changes',
        patch: snippet,
      })
    }

    return changes
  }, [files, local])

  const appendChatMessage = useCallback(
    (role: ChatMessage['role'], type: ChatMessage['type'], content: string) => {
      appendMessage({
        id: crypto.randomUUID(),
        role,
        type,
        content,
        timestamp: Date.now(),
      })
    },
    [appendMessage],
  )

  const appendSlashCommand = useCallback(
    (content: string) => appendChatMessage('user', 'text', content),
    [appendChatMessage],
  )

  const appendStatusMessage = useCallback(
    (content: string) => appendChatMessage('assistant', 'tool', content),
    [appendChatMessage],
  )

  const appendErrorMessage = useCallback(
    (content: string) => appendChatMessage('system', 'error', content),
    [appendChatMessage],
  )

  const requireLocalGitRepo = useCallback(
    (action: string) => {
      const branch = local.gitInfo?.branch ?? null
      if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo || !branch) {
        appendErrorMessage(`${action} requires a local git repository.`)
        return null
      }
      return { branch }
    },
    [local.localMode, local.rootPath, local.gitInfo, appendErrorMessage],
  )

  const requireGithubRepo = useCallback(
    (action: string, requireAuth = false) => {
      const repoFullName = repo?.fullName ?? local.remoteRepo ?? null
      const branch = repo?.branch ?? local.gitInfo?.branch ?? null

      if (!repoFullName) {
        appendErrorMessage(`${action} requires a GitHub repo or a local repo with a GitHub origin.`)
        return null
      }

      if (requireAuth && !getGithubToken()) {
        appendErrorMessage(`${action} requires a GitHub token. Add one in Settings first.`)
        return null
      }

      return { repoFullName, branch }
    },
    [repo?.fullName, repo?.branch, local.remoteRepo, local.gitInfo?.branch, appendErrorMessage],
  )

  // ─── Commit result listener ──────────────────────────────────
  useEffect(() => {
    return on('agent-commit-result', (detail) => {
      if (detail.success) {
        appendStatusMessage(`Committed ${detail.fileCount} file(s) successfully.`)
      } else {
        appendErrorMessage(`Commit failed: ${detail.error}`)
      }
    })
  }, [appendErrorMessage, appendStatusMessage])

  // ─── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim()
      if (!text || sending) return

      // Handle slash commands locally
      if (text === '/ask') {
        setAgentMode('ask')
        setInput('')
        return
      }
      if (text === '/agent') {
        setAgentMode('agent')
        setInput('')
        return
      }
      if (text === '/plan') {
        setAgentMode('plan')
        setInput('')
        return
      }
      if (text === '/clear') {
        setMessages([])
        setAgentActivities([])
        setInput('')
        return
      }

      // Save to cross-session history
      addChatHistory(text)
      historyNav.current.reset()

      logChatDebug('send attempt', {
        textLength: text.length,
        mode: agentMode,
        connected: isConnected,
        gatewayStatus: status,
        sessionKey,
        attachmentCount: contextAttachments.length,
        imageCount: imageAttachments.length,
      })
      setInput('')

      // ─── Slash command interception ───────────────────────────
      if (text.startsWith('/commit')) {
        const commitMsg = text.replace(/^\/commit\s*/, '').trim()
        appendSlashCommand(text)

        if (commitMsg) {
          emit('agent-commit', { message: commitMsg })
          appendStatusMessage('Committing...')
          return
        }

        if (!isConnected) {
          appendErrorMessage('Gateway disconnected — cannot generate commit message.')
          return
        }

        appendStatusMessage('Generating commit message with gateway AI...')

        try {
          await ensureSessionInit()
          const changes = await collectCommitChangesForGeneration()
          if (changes.length === 0) {
            appendStatusMessage('No changes detected to commit.')
            return
          }

          const generatedCommitMsg = await generateCommitMessageWithGateway({
            sendRequest,
            onEvent,
            sessionKey,
            repoFullName: repo?.fullName ?? local.remoteRepo ?? undefined,
            branch: repo?.branch ?? local.gitInfo?.branch ?? undefined,
            changes,
          })

          appendStatusMessage(`Generated commit message: ${generatedCommitMsg}`)
          emit('agent-commit', { message: generatedCommitMsg })
          appendStatusMessage('Committing...')
        } catch (err) {
          appendErrorMessage(
            `Generate commit message failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return
      }
      if (text === '/changes') {
        appendSlashCommand(text)
        emit('open-changes-panel')
        appendStatusMessage('Opening pre-commit review...')
        return
      }
      if (text === '/diff') {
        appendSlashCommand(text)
        const changes = diffEngine.getChanges()
        if (changes.length > 0) {
          const summary = diffEngine.getSummary()
          appendStatusMessage(
            `${summary.fileCount} file(s) changed: +${summary.additions} -${summary.deletions}\nFiles: ${changes.map((c) => c.path).join(', ')}`,
          )
        } else {
          const dirtyFiles = files.filter((f) => f.dirty)
          if (dirtyFiles.length > 0) {
            appendStatusMessage(
              `${dirtyFiles.length} unsaved file(s): ${dirtyFiles.map((f) => f.path).join(', ')}`,
            )
          } else {
            appendStatusMessage('No changes detected.')
          }
        }
        return
      }
      if (text === '/unstage') {
        appendSlashCommand(text)
        if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo) {
          appendErrorMessage('Unstage requires a local git repository.')
          return
        }
        const staged =
          local.gitInfo.status?.filter((s) => s.status !== '??').map((s) => s.path) ?? []
        if (staged.length === 0) {
          appendStatusMessage('No staged files to unstage.')
          return
        }
        try {
          await local.unstageFiles(staged)
          appendStatusMessage(`Unstaged ${staged.length} file(s).`)
        } catch (err) {
          appendErrorMessage(`Unstage failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }
      if (text === '/undo') {
        appendSlashCommand(text)
        if (!local.localMode || !local.rootPath || !local.gitInfo?.is_repo) {
          appendErrorMessage('Undo commit requires a local git repository.')
          return
        }
        try {
          await local.undoLastCommit()
          appendStatusMessage('Undid last commit. Changes are back in the working tree.')
        } catch (err) {
          appendErrorMessage(`Undo failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }
      if (text.startsWith('/task ')) {
        const taskTitle = text.replace(/^\/task\s+/, '').trim()
        appendSlashCommand(text)
        if (!taskTitle) {
          appendErrorMessage('Usage: `/task <title>` — creates a Kanban card in Backlog.')
          return
        }
        window.dispatchEvent(
          new CustomEvent('kanban-create-card', { detail: { title: taskTitle } }),
        )
        appendStatusMessage(`Created Kanban card: "${taskTitle}"`)
        return
      }
      if (text === '/push') {
        appendSlashCommand(text)
        const localRepo = requireLocalGitRepo('Push')
        if (!localRepo) return
        appendStatusMessage(`Pushing ${localRepo.branch} to origin...`)
        try {
          await local.push()
          appendStatusMessage(`Pushed ${localRepo.branch} to origin.`)
        } catch (err) {
          appendErrorMessage(`Push failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }
      if (text === '/pull') {
        appendSlashCommand(text)
        const localRepo = requireLocalGitRepo('Pull')
        if (!localRepo) return
        appendStatusMessage(`Pulling ${localRepo.branch} from origin with rebase...`)
        try {
          const result = await local.pull()
          appendStatusMessage(result || `Pulled ${localRepo.branch} from origin.`)
        } catch (err) {
          appendErrorMessage(`Pull failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }
      if (text === '/sync') {
        appendSlashCommand(text)
        const localRepo = requireLocalGitRepo('Sync')
        if (!localRepo) return
        appendStatusMessage(`Syncing ${localRepo.branch} with origin...`)
        try {
          const result = await local.gitSync()
          appendStatusMessage(result || `Synced ${localRepo.branch}.`)
        } catch (err) {
          appendErrorMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }

      const pullRequestCreateMatch = text.match(/^\/pr\s+create(?:\s+(.*))?$/i)
      if (pullRequestCreateMatch) {
        appendSlashCommand(text)
        const githubRepo = requireGithubRepo('Create pull request', true)
        if (!githubRepo) return
        const currentBranch = githubRepo.branch
        if (!currentBranch) {
          appendErrorMessage('Create pull request requires an active branch.')
          return
        }

        try {
          const { title, body, base } = parsePullRequestCreateArgs(pullRequestCreateMatch[1] ?? '')
          const repoInfo = await fetchRepoByName(githubRepo.repoFullName)
          const baseBranch = base || repoInfo.default_branch

          if (currentBranch === baseBranch) {
            appendErrorMessage(
              `Current branch \`${currentBranch}\` matches the base branch. Switch to a feature branch first.`,
            )
            return
          }

          if (local.localMode && local.rootPath && local.gitInfo?.is_repo) {
            appendStatusMessage(`Pushing ${currentBranch} to origin before creating the PR...`)
            await local.push(currentBranch)
          }

          appendStatusMessage(`Creating pull request from ${currentBranch} to ${baseBranch}...`)
          const created = await createPullRequest(
            githubRepo.repoFullName,
            title || titleFromBranchName(currentBranch),
            body || buildDefaultPullRequestBody(currentBranch, baseBranch),
            currentBranch,
            baseBranch,
          )
          appendStatusMessage(`Created PR #${created.number}: ${created.title}\n${created.url}`)
        } catch (err) {
          appendErrorMessage(
            `Create pull request failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return
      }

      const pullRequestDetailMatch = text.match(/^\/pr\s+(\d+)$/i)
      if (text === '/pr' || pullRequestDetailMatch) {
        appendSlashCommand(text)
        const githubRepo = requireGithubRepo('Pull request lookup')
        if (!githubRepo) return

        try {
          if (pullRequestDetailMatch) {
            const number = Number.parseInt(pullRequestDetailMatch[1], 10)
            appendStatusMessage(`Loading PR #${number}...`)
            const pr = await fetchPullRequest(githubRepo.repoFullName, number)
            const [reviews, checks] = await Promise.all([
              fetchPRReviews(githubRepo.repoFullName, number),
              fetchPRChecks(githubRepo.repoFullName, pr.headSha),
            ])
            appendStatusMessage(
              formatPullRequestDetails(pr, reviews.length, summarizeChecks(checks)),
            )
          } else {
            const prs = await fetchPullRequests(githubRepo.repoFullName, 'open', 20)
            appendStatusMessage(
              formatPullRequestList(githubRepo.repoFullName, prs, githubRepo.branch),
            )
          }
        } catch (err) {
          appendErrorMessage(
            `Pull request lookup failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        return
      }

      const mergeMatch = text.match(/^\/merge(?:\s+(\d+))(?:\s+(merge|squash|rebase))?$/i)
      if (mergeMatch) {
        appendSlashCommand(text)
        const githubRepo = requireGithubRepo('Merge pull request', true)
        if (!githubRepo) return

        const prNumber = Number.parseInt(mergeMatch[1], 10)
        const mergeMethod = (mergeMatch[2]?.toLowerCase() ?? 'merge') as
          | 'merge'
          | 'squash'
          | 'rebase'

        try {
          appendStatusMessage(`Merging PR #${prNumber} with ${mergeMethod}...`)
          const result = await mergePullRequest(githubRepo.repoFullName, prNumber, mergeMethod)
          const shaLine = result.sha ? `\nCommit: ${result.sha.slice(0, 7)}` : ''
          appendStatusMessage(`Merged PR #${prNumber}. ${result.message}${shaLine}`)
        } catch (err) {
          appendErrorMessage(`Merge failed: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }

      const parsedSkillCommand = parseSkillSlashCommand(text)
      if (parsedSkillCommand) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'user',
          type: 'text',
          content: text,
          timestamp: Date.now(),
        })

        if (parsedSkillCommand.kind === 'help') {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'status',
            content: buildSkillCommandHelp(),
            timestamp: Date.now(),
          })
          return
        }

        if (parsedSkillCommand.kind === 'list') {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'status',
            content: buildCatalogSummary(SKILLS_CATALOG),
            timestamp: Date.now(),
          })
          return
        }

        if (parsedSkillCommand.kind === 'use') {
          const skill = parsedSkillCommand.skillSlug
            ? getSkillBySlug(parsedSkillCommand.skillSlug)
            : undefined
          if (!skill) {
            appendMessage({
              id: crypto.randomUUID(),
              role: 'system',
              type: 'error',
              content: `Unknown skill: ${parsedSkillCommand.skillSlug ?? 'unknown'}`,
              timestamp: Date.now(),
            })
            return
          }

          const attachLabels = buildAttachmentLabels()
          const request = parsedSkillCommand.request?.trim() || skill.starterPrompt
          const envelope = buildSkillUseEnvelope({
            skill,
            request,
            modelName: modelInfo.current,
          })
          const displayText =
            attachLabels.length > 0
              ? `[${attachLabels.join(' · ')}]\n/skill use ${skill.slug} ${request}`
              : `/skill use ${skill.slug} ${request}`
          const outboundMessage = buildGatewayMessage(envelope.prompt, buildSilentContext())
          const messageImages =
            imageAttachments.length > 0
              ? imageAttachments.map((img) => ({ name: img.name, dataUrl: img.dataUrl }))
              : undefined

          setSending(true)
          streamStateRef.current.isSending = true
          try {
            await sendStructuredGatewayMessage({
              displayText,
              outboundMessage,
              images: messageImages,
            })
          } catch (err) {
            appendMessage({
              id: crypto.randomUUID(),
              role: 'system',
              type: 'error',
              content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: Date.now(),
            })
            setIsStreaming(false)
            setSending(false)
            streamStateRef.current.isSending = false
          }
          return
        }

        const plan = buildExecutionPlan(parsedSkillCommand, { preferTerminal: isTauri() })
        if (!plan) {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'error',
            content: 'Could not build a skill workflow for that request.',
            timestamp: Date.now(),
          })
          return
        }

        if (plan.target === 'terminal' && plan.command) {
          emit('show-terminal')
          emit('run-command-in-terminal', { command: plan.command })
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'status',
            content: `${plan.label} started in the desktop terminal.`,
            timestamp: Date.now(),
          })
          return
        }

        if (plan.message) {
          setSending(true)
          streamStateRef.current.isSending = true
          try {
            await sendStructuredGatewayMessage({
              displayText: text,
              outboundMessage: plan.message,
              preserveAttachments: true,
            })
          } catch (err) {
            appendMessage({
              id: crypto.randomUUID(),
              role: 'system',
              type: 'error',
              content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              timestamp: Date.now(),
            })
            setIsStreaming(false)
            setSending(false)
            streamStateRef.current.isSending = false
          }
        }
        return
      }

      if (!enforceSkillFirstPolicy(text)) {
        return
      }

      setSending(true)
      streamStateRef.current.isSending = true
      setAgentActivities([])
      setThinkingTrail([])

      // Build visual label for attachments
      const attachLabels = buildAttachmentLabels()
      const displayText = attachLabels.length > 0 ? `[${attachLabels.join(' · ')}]\n${text}` : text
      const messageImages =
        imageAttachments.length > 0
          ? imageAttachments.map((img) => ({ name: img.name, dataUrl: img.dataUrl }))
          : undefined
      try {
        const outboundMessage = buildGatewayMessage(text, buildSilentContext())
        await sendStructuredGatewayMessage({
          displayText,
          outboundMessage,
          images: messageImages,
        })
      } catch (err) {
        logChatDebug('chat.send failed', {
          error: err instanceof Error ? err.message : String(err),
          sessionKey,
        })
        appendMessage({
          id: crypto.randomUUID(),
          role: 'system',
          type: 'error',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        })
        setIsStreaming(false)
        setSending(false)
        streamStateRef.current.isSending = false
      }
    },
    [
      input,
      sending,
      agentMode,
      isConnected,
      status,
      sessionKey,
      local,
      repo,
      files,
      sendRequest,
      onEvent,
      buildContext,
      buildSilentContext,
      buildAttachmentLabels,
      appendMessage,
      appendErrorMessage,
      appendSlashCommand,
      appendStatusMessage,
      ensureSessionInit,
      collectCommitChangesForGeneration,
      logChatDebug,
      enforceSkillFirstPolicy,
      modelInfo,
      requireGithubRepo,
      requireLocalGitRepo,
      sendStructuredGatewayMessage,
      contextAttachments.length,
      imageAttachments,
    ],
  )

  // ─── Handle ⌘K inline edit requests ────────────────────────────
  useEffect(() => {
    const handler = (detail: {
      filePath: string
      instruction: string
      selectedText: string
      startLine: number
      endLine: number
    }) => {
      const { filePath, instruction, selectedText, startLine, endLine } = detail
      if (!isConnected || sending) return
      if (!enforceSkillFirstPolicy(instruction)) return
      logChatDebug('inline edit request', {
        filePath,
        startLine,
        endLine,
        instructionChars: instruction.length,
        connected: isConnected,
      })

      const prompt = [
        `[Inline Edit Request]`,
        `File: ${filePath}`,
        `Lines ${startLine}-${endLine}:`,
        '```',
        selectedText,
        '```',
        '',
        `Instruction: ${instruction}`,
        '',
        'Respond with [EDIT ' + filePath + '] containing the complete updated file.',
      ].join('\n')

      // Inject as user message and send
      setInput('')
      setSending(true)
      streamStateRef.current.isSending = true
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: `${formatShortcut('meta+K')}: ${instruction}`,
        timestamp: Date.now(),
      })

      const context = buildContext()
      const idemKey = `ce-inline-${Date.now()}`
      sentKeysRef.current.add(idemKey)
      setIsStreaming(true)
      logChatDebug('inline chat.send request', {
        sessionKey,
        idempotencyKey: idemKey,
        promptChars: prompt.length,
        contextChars: context.length,
      })

      sendRequest('chat.send', {
        sessionKey,
        message: buildGatewayMessage(prompt, context),
        idempotencyKey: idemKey,
      })
        .then((resp) => {
          const r = resp as Record<string, unknown> | undefined
          const status = r?.status as string | undefined
          logChatDebug('inline chat.send response', {
            status: status ?? 'unknown',
            idempotencyKey: idemKey,
            hasReply: Boolean(r?.reply || r?.text),
          })
          if (status === 'started' || status === 'in_flight') return
          if (!sentKeysRef.current.has(idemKey) || handledKeysRef.current.has(idemKey)) return
          sentKeysRef.current.delete(idemKey)
          handledKeysRef.current.add(idemKey)
          setTimeout(() => handledKeysRef.current.delete(idemKey), 10000)
          const reply = String(r?.reply ?? r?.text ?? '')
          if (reply && !/^NO_REPLY$/i.test(reply.trim())) {
            const editProposals = parseEditProposals(reply)
            appendMessage({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: reply,
              timestamp: Date.now(),
              type: editProposals.length > 0 ? 'edit' : 'text',
              editProposals: editProposals.length > 0 ? editProposals : undefined,
            })
            emit('agent-reply')
          }
          setIsStreaming(false)
          setSending(false)
          streamStateRef.current.isSending = false
        })
        .catch((err: unknown) => {
          logChatDebug('inline chat.send failed', {
            idempotencyKey: idemKey,
            error: err instanceof Error ? err.message : String(err),
          })
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            type: 'error',
            content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            timestamp: Date.now(),
          })
          setIsStreaming(false)
          setSending(false)
          streamStateRef.current.isSending = false
        })
    }
    return on('inline-edit-request', handler)
  }, [
    isConnected,
    sending,
    sendRequest,
    buildContext,
    appendMessage,
    sessionKey,
    logChatDebug,
    enforceSkillFirstPolicy,
  ])

  // ─── Diff review flow ─────────────────────────────────────────
  const handleShowDiff = useCallback(
    (proposal: EditProposal, messageId: string) => {
      const existing = getFile(proposal.filePath)
      setActiveDiff({ proposal, messageId, original: existing?.content ?? '' })
    },
    [getFile],
  )

  const handleQuickApply = useCallback(
    (proposal: EditProposal) => {
      const existing = getFile(proposal.filePath)
      if (existing) {
        updateFileContent(proposal.filePath, proposal.content)
      } else {
        openFile(proposal.filePath, proposal.content, undefined)
      }
      appendMessage({
        id: crypto.randomUUID(),
        role: 'system',
        type: 'tool',
        content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
        timestamp: Date.now(),
      })
    },
    [getFile, updateFileContent, openFile, appendMessage],
  )

  const handleApplyEdit = useCallback(() => {
    if (!activeDiff) return
    const { proposal } = activeDiff
    const existing = getFile(proposal.filePath)
    if (existing) {
      updateFileContent(proposal.filePath, proposal.content)
    } else {
      openFile(proposal.filePath, proposal.content, undefined)
    }
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'tool',
      content: `Applied edit to \`${proposal.filePath}\`. File is modified — use /commit to save.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, getFile, updateFileContent, openFile, appendMessage])

  const handleRejectEdit = useCallback(() => {
    if (!activeDiff) return
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'status',
      content: `Rejected edit to \`${activeDiff.proposal.filePath}\`.`,
      timestamp: Date.now(),
    })
    setActiveDiff(null)
  }, [activeDiff, appendMessage])

  // ─── Auto-apply when full access or approval tier allows ──────
  const autoAppliedRef = useRef(new Set<string>())
  const currentApprovalTier = useMemo(() => {
    try {
      return getAgentConfig()?.approvalTier ?? 'ask-all'
    } catch {
      return 'ask-all' as const
    }
  }, [])
  useEffect(() => {
    const tierAllows = currentApprovalTier === 'auto-edits' || currentApprovalTier === 'auto-all'
    if (permissions !== 'full' && agentMode !== 'agent' && !tierAllows) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.editProposals?.length) return
    if (autoAppliedRef.current.has(last.id)) return
    autoAppliedRef.current.add(last.id)
    for (const proposal of last.editProposals) {
      const existing = getFile(proposal.filePath)
      if (existing) {
        updateFileContent(proposal.filePath, proposal.content)
      } else {
        openFile(proposal.filePath, proposal.content, undefined)
      }
    }
    const fileNames = last.editProposals.map((p) => `\`${p.filePath}\``).join(', ')
    appendMessage({
      id: crypto.randomUUID(),
      role: 'system',
      type: 'tool',
      content: `Auto-applied edits to ${fileNames}.`,
      timestamp: Date.now(),
    })
  }, [
    messages,
    permissions,
    agentMode,
    currentApprovalTier,
    getFile,
    updateFileContent,
    openFile,
    appendMessage,
  ])

  // ─── Slash command suggestions ────────────────────────────────
  // Detect picker triggers and update state in useEffect
  useEffect(() => {
    if (!input.startsWith('/')) {
      setActivePicker(null)
      return
    }

    // Detect picker triggers — open on exact match OR with trailing space/query
    if (
      input === '/skill' ||
      input === '/skill ' ||
      input.startsWith('/skill use') ||
      input === '/skill use'
    ) {
      const query = input.replace(/^\/skill\s*(use\s*)?/, '')
      setActivePicker('skill')
      setPickerQuery(query)
      return
    }
    if (input === '/prompt' || input.startsWith('/prompt ')) {
      const query = input.replace(/^\/prompt\s*/, '')
      setActivePicker('prompt')
      setPickerQuery(query)
      return
    }

    setActivePicker(null)
  }, [input])

  const suggestions = useMemo(() => {
    if (!input.startsWith('/')) {
      return []
    }

    // Don't show suggestions when a picker is active
    if (
      input === '/skill' ||
      input === '/skill ' ||
      input.startsWith('/skill use') ||
      input === '/skill use'
    ) {
      return []
    }
    if (input === '/prompt' || input.startsWith('/prompt ')) {
      return []
    }

    const cmds = [
      // Coding
      { cmd: '/edit', desc: 'Edit current file', icon: 'lucide:pencil' },
      { cmd: '/explain', desc: 'Explain code', icon: 'lucide:book-open' },
      { cmd: '/refactor', desc: 'Refactor code', icon: 'lucide:refresh-cw' },
      { cmd: '/generate', desc: 'Generate new code', icon: 'lucide:plus' },
      { cmd: '/search', desc: 'Search across repo', icon: 'lucide:search' },
      { cmd: '/fix', desc: 'Fix errors in code', icon: 'lucide:wrench' },
      { cmd: '/test', desc: 'Write tests for code', icon: 'lucide:flask-conical' },
      { cmd: '/review', desc: 'Code review current changes', icon: 'lucide:scan-eye' },
      // Git
      { cmd: '/commit', desc: 'Commit changes (AI message)', icon: 'lucide:git-commit-horizontal' },
      { cmd: '/diff', desc: 'Show changes', icon: 'lucide:git-compare' },
      { cmd: '/changes', desc: 'Pre-commit review', icon: 'lucide:eye' },
      { cmd: '/unstage', desc: 'Unstage all staged files', icon: 'lucide:minus-circle' },
      { cmd: '/undo', desc: 'Undo last commit', icon: 'lucide:undo-2' },
      { cmd: '/pull', desc: 'Pull latest changes', icon: 'lucide:arrow-down-circle' },
      { cmd: '/push', desc: 'Push to origin', icon: 'lucide:arrow-up-circle' },
      { cmd: '/sync', desc: 'Pull and push current branch', icon: 'lucide:refresh-cw' },
      { cmd: '/pr', desc: 'View pull requests', icon: 'lucide:git-pull-request' },
      {
        cmd: '/pr create',
        desc: 'Create pull request',
        icon: 'lucide:git-pull-request-create-arrow',
      },
      { cmd: '/merge', desc: 'Merge pull request', icon: 'lucide:git-merge' },
      // Modes
      { cmd: '/ask', desc: 'Switch to Ask mode', icon: 'lucide:message-circle' },
      { cmd: '/agent', desc: 'Switch to Agent mode', icon: 'lucide:bot' },
      { cmd: '/plan', desc: 'Switch to Plan mode', icon: 'lucide:list-checks' },
      // Session
      { cmd: '/clear', desc: 'Clear chat history', icon: 'lucide:trash-2' },
      { cmd: '/compact', desc: 'Compact session context', icon: 'lucide:minimize-2' },
      { cmd: '/model', desc: 'Show or set model', icon: 'lucide:cpu' },
      // Skills
      { cmd: '/skill', desc: 'Open skill commands', icon: 'lucide:sparkles' },
      { cmd: '/skill find', desc: 'Search for more skills', icon: 'lucide:search' },
      { cmd: '/skill use', desc: 'Apply a bundled skill', icon: 'lucide:play' },
      { cmd: '/prompt', desc: 'Use a prompt template', icon: 'lucide:book-open' },
      // Kanban
      { cmd: '/task', desc: 'Create a Kanban card', icon: 'lucide:kanban' },
    ]
    const term = input.toLowerCase()
    return cmds.filter((c) => c.cmd.startsWith(term))
  }, [input])

  // ─── Picker data sources ──────────────────────────────────────
  const skillPickerItems = useMemo<PickerItem[]>(() => {
    const stored =
      typeof window !== 'undefined' ? localStorage.getItem('knot-code:skills:runtime') : null
    if (stored) {
      try {
        const skills = JSON.parse(stored) as Array<{
          id: string
          name: string
          description?: string
          enabled?: boolean
        }>
        return skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || 'No description',
          icon: 'lucide:sparkles',
          enabled: s.enabled ?? true,
        }))
      } catch {
        // Ignore parse errors, fall through to defaults
      }
    }
    return [
      {
        id: 'code-review',
        name: 'Code Review',
        description: 'Review code for bugs and improvements',
        icon: 'lucide:scan-eye',
      },
      {
        id: 'refactor',
        name: 'Refactor',
        description: 'Improve code structure and readability',
        icon: 'lucide:refresh-cw',
      },
      {
        id: 'test-gen',
        name: 'Test Generator',
        description: 'Generate unit tests for code',
        icon: 'lucide:flask-conical',
      },
      {
        id: 'doc-gen',
        name: 'Documentation',
        description: 'Generate documentation for code',
        icon: 'lucide:file-text',
      },
      {
        id: 'explain',
        name: 'Explain Code',
        description: 'Get a detailed explanation of code',
        icon: 'lucide:book-open',
      },
      {
        id: 'optimize',
        name: 'Optimize',
        description: 'Optimize code for performance',
        icon: 'lucide:zap',
      },
      {
        id: 'security',
        name: 'Security Audit',
        description: 'Check code for security vulnerabilities',
        icon: 'lucide:shield',
      },
      {
        id: 'debug',
        name: 'Debug Helper',
        description: 'Help identify and fix bugs',
        icon: 'lucide:bug',
      },
    ]
  }, [])

  const promptPickerItems = useMemo<PickerItem[]>(() => {
    return [
      {
        id: 'explain-like-5',
        name: "Explain Like I'm 5",
        description: 'Simple explanation of complex topics',
        icon: 'lucide:baby',
      },
      {
        id: 'write-readme',
        name: 'Write README',
        description: 'Generate a project README',
        icon: 'lucide:file-text',
      },
      {
        id: 'commit-message',
        name: 'Commit Message',
        description: 'Write a conventional commit message',
        icon: 'lucide:git-commit-horizontal',
      },
      {
        id: 'api-docs',
        name: 'API Documentation',
        description: 'Generate API endpoint docs',
        icon: 'lucide:book',
      },
      {
        id: 'code-comment',
        name: 'Code Comments',
        description: 'Add JSDoc/inline comments to code',
        icon: 'lucide:message-square-code',
      },
      {
        id: 'convert-ts',
        name: 'Convert to TypeScript',
        description: 'Add types to JavaScript code',
        icon: 'simple-icons:typescript',
      },
      {
        id: 'write-tests',
        name: 'Write Tests',
        description: 'Generate test cases for code',
        icon: 'lucide:flask-conical',
      },
      {
        id: 'review-pr',
        name: 'PR Review Template',
        description: 'Structured PR review format',
        icon: 'lucide:git-pull-request',
      },
    ]
  }, [])

  // ─── Picker handlers ──────────────────────────────────────────
  const handlePickerSelect = useCallback(
    (item: PickerItem) => {
      if (activePicker === 'skill') {
        setInput(`/skill use ${item.id} `)
      } else if (activePicker === 'prompt') {
        // For prompt templates, replace the command with the template name or insert it
        setInput(`Use the "${item.name}" template: `)
      }
      setActivePicker(null)
      setPickerQuery('')
      setPickerIndex(0)
      inputRef.current?.focus()
    },
    [activePicker],
  )

  const handlePickerClose = useCallback(() => {
    setActivePicker(null)
    setPickerQuery('')
    setPickerIndex(0)
  }, [])

  const currentPickerItems = useMemo(() => {
    if (activePicker === 'skill') return skillPickerItems
    if (activePicker === 'prompt') return promptPickerItems
    return []
  }, [activePicker, skillPickerItems, promptPickerItems])

  const pickerTitle = useMemo(() => {
    if (activePicker === 'skill') return 'Select Skill'
    if (activePicker === 'prompt') return 'Select Prompt Template'
    return ''
  }, [activePicker])

  const pickerEmptyHelp = useMemo(() => {
    if (activePicker === 'skill')
      return {
        icon: 'lucide:sparkles',
        heading: 'Getting Started with Skills',
        steps: [
          'Open Skills view (⌘5)',
          'Enable skills from the catalog',
          'Skills will appear here once active',
        ],
      }
    if (activePicker === 'prompt')
      return {
        icon: 'lucide:book-open',
        heading: 'Create Your First Prompt',
        steps: [
          'Use the prompt templates below',
          'Customize them for your workflow',
          'Save frequently-used prompts',
        ],
      }
    return undefined
  }, [activePicker])

  // ─── Keyboard ─────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle picker navigation first
      if (activePicker && currentPickerItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setPickerIndex((i) => (i + 1) % currentPickerItems.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setPickerIndex((i) => (i <= 0 ? currentPickerItems.length - 1 : i - 1))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const idx = pickerIndex >= 0 ? pickerIndex : 0
          if (currentPickerItems[idx]) {
            handlePickerSelect(currentPickerItems[idx])
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          handlePickerClose()
          return
        }
      }

      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveSuggestionIdx((i) => (i + 1) % suggestions.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveSuggestionIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
          return
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault()
          const idx = activeSuggestionIdx >= 0 ? activeSuggestionIdx : 0
          setInput(suggestions[idx].cmd + ' ')
          setActiveSuggestionIdx(-1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setActiveSuggestionIdx(-1)
          setInput('')
          return
        }
      }
      // ↑/↓: navigate input history (only when input is empty or at history position)
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const textarea = inputRef.current
        if (textarea && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
          historyNav.current.setDraft(input)
          const prev = historyNav.current.up()
          if (prev !== null) {
            e.preventDefault()
            setInput(prev)
            return
          }
        }
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        const textarea = inputRef.current
        if (textarea && textarea.selectionStart === textarea.value.length) {
          const next = historyNav.current.down()
          if (next !== null) {
            e.preventDefault()
            setInput(next)
            return
          }
        }
      }
      // Shift+Tab: cycle agent mode (Ask → Agent → Plan → Ask)
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        setAgentMode((prev) => {
          const modes: AgentMode[] = ['ask', 'agent', 'plan']
          const idx = modes.indexOf(prev)
          return modes[(idx + 1) % modes.length]
        })
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [
      activePicker,
      currentPickerItems,
      pickerIndex,
      handlePickerSelect,
      handlePickerClose,
      suggestions,
      activeSuggestionIdx,
      input,
      sendMessage,
    ],
  )

  // ─── Message actions ────────────────────────────────────────────
  const handleDeleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const handleRegenerate = useCallback(
    (msgId: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId)
        if (idx < 0) return prev
        let userIdx = idx - 1
        while (userIdx >= 0 && prev[userIdx].role !== 'user') userIdx--
        if (userIdx < 0) return prev
        const userMsg = prev[userIdx]
        queueMicrotask(() => {
          sendMessage(userMsg.content)
        })
        return prev.slice(0, idx)
      })
    },
    [sendMessage],
  )

  const handleEditAndResend = useCallback(
    (msgId: string) => {
      const idx = messages.findIndex((m) => m.id === msgId)
      if (idx < 0) return
      const userMsg = messages[idx]
      setInput(userMsg.content)
      setMessages((prev) => prev.slice(0, idx))
      inputRef.current?.focus()
    },
    [messages],
  )

  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    // Clear everything — single session reset
    setMessages([])
    setStreamBuffer('')
    setSending(false)
    streamStateRef.current.isSending = false
    setIsStreaming(false)
    setThinkingTrail([])
    setAgentActivities([])
    setInput('')
    setContextAttachments([])
    setImageAttachments([])
    setActiveDiff(null)
    setConfirmClear(false)
    diffEngine.clear()
    sessionInitRef.current = false
    try {
      localStorage.removeItem(storageKey)
      emit('threads-updated')
    } catch {
      // Ignore storage errors
    }
    try {
      sessionStorage.removeItem(
        `${SESSION_INIT_STORAGE_KEY}:${sessionKey}:v${CODE_EDITOR_SYSTEM_PROMPT_VERSION}`,
      )
    } catch {
      // Ignore storage errors
    }
  }, [confirmClear, sessionKey, storageKey])

  // ─── Diff overlay ─────────────────────────────────────────────
  if (activeDiff) {
    return (
      <DiffViewer
        filePath={activeDiff.proposal.filePath}
        original={activeDiff.original}
        modified={activeDiff.proposal.content}
        onApply={handleApplyEdit}
        onReject={handleRejectEdit}
      />
    )
  }

  // ─── Render ───────────────────────────────────────────────────
  const chatTitle =
    messages
      .find((m) => m.role === 'user')
      ?.content.slice(0, 50)
      .replace(/\n/g, ' ') || null

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden bg-[var(--sidebar-bg)] relative"
      onDragEnter={handlePanelDragEnter}
      onDragLeave={handlePanelDragLeave}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
    >
      {/* Drag-and-drop overlay */}
      {panelDragOver && (
        <div className="absolute inset-0 z-[100] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] animate-fade-in"
            style={{ animationDuration: '0.15s' }}
          >
            <div className="w-14 h-14 rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] flex items-center justify-center">
              <Icon
                icon="lucide:image-plus"
                width={28}
                height={28}
                className="text-[var(--brand)]"
              />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                Drop files here
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                Images, code files, or documents
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header — children are no-drag so they stay clickable above drag region */}
      <ChatHeader
        title={chatTitle ?? undefined}
        messageCount={messages.length}
        isStreaming={isStreaming}
        modelName={modelInfo.current || undefined}
        contextTokens={contextTokens}
        activityCount={agentActivities.length}
        filesChanged={
          agentActivities
            .filter((a) => a.type === 'edit' || a.type === 'write' || a.type === 'create')
            .reduce((acc, a) => {
              if (a.file) acc.add(a.file)
              return acc
            }, new Set<string>()).size
        }
        onClose={onClose}
      />
      {messages.length > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-0.5 shrink-0">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Font size controls */}
            <div className="inline-flex items-center gap-0.5">
              <button
                onClick={decreaseFontSize}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                title={`Decrease text size (${formatShortcut('meta+-')})`}
              >
                <Icon icon="lucide:minus" width={12} height={12} />
              </button>
              <span className="w-7 select-none text-center text-[10px] font-mono tabular-nums text-[var(--text-disabled)]">
                {chatFontSize}
              </span>
              <button
                onClick={increaseFontSize}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                title={`Increase text size (${formatShortcut('meta+=')})`}
              >
                <Icon icon="lucide:plus" width={12} height={12} />
              </button>
            </div>

            <span className="mx-0.5 h-3.5 w-px bg-[var(--border)]" />

            {/* Font family picker */}
            <div className="flex min-w-0 items-center gap-0.5">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setChatFontFamily(f.id)}
                  className={`whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                    chatFontFamily === f.id
                      ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                      : 'text-[var(--text-disabled)] hover:text-[var(--text-tertiary)]'
                  }`}
                  title={`${f.label} font`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleClear}
            className={`p-1 rounded text-[10px] transition-colors cursor-pointer ${
              confirmClear
                ? 'text-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={confirmClear ? 'Click again to clear' : 'Clear chat'}
          >
            <Icon
              icon={confirmClear ? 'lucide:alert-triangle' : 'lucide:eraser'}
              width={13}
              height={13}
            />
          </button>
        </div>
      )}

      {/* Empty states — full bleed */}
      {messages.length === 0 && !isConnected && (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <AgentConnectPrompt />
        </div>
      )}
      {messages.length === 0 && isConnected && (
        <ChatHome
          onSend={(text, mode) => {
            setAgentMode(mode)
            sendMessage(text)
          }}
          onSelectFolder={() => emit('open-folder')}
          onCloneRepo={() => emit('open-folder')}
          onImageAttach={handleImageAttach}
          imageAttachments={imageAttachments}
          onRemoveImage={(i) => setImageAttachments((prev) => prev.filter((_, j) => j !== i))}
        />
      )}

      {/* Agent Approvals */}
      <AgentApproval />

      {/* Messages */}
      {messages.length > 0 && (
        <MessageList
          messages={messages}
          streamBuffer={streamBuffer}
          isStreaming={isStreaming}
          thinkingTrail={thinkingTrail}
          agentActivities={agentActivities}
          turnElapsedMs={turnElapsedMs}
          agentMode={agentMode}
          onShowDiff={handleShowDiff}
          onQuickApply={handleQuickApply}
          onApplyAll={(proposals) => proposals.forEach(handleQuickApply)}
          getFileContent={(filePath) => getFile(filePath)?.content}
          onDeleteMessage={handleDeleteMessage}
          onRegenerate={handleRegenerate}
          onEditAndResend={handleEditAndResend}
          onSendMessage={sendMessage}
        />
      )}

      {/* Input section — hidden when disconnected on mobile, hidden when ChatHome is showing on desktop */}
      {(messages.length > 0 ||
        (!isConnected && !(typeof window !== 'undefined' && window.innerWidth <= 768))) && (
        <ChatInputBar
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          sending={sending}
          isStreaming={isStreaming}
          isConnected={isConnected}
          suggestions={suggestions}
          agentMode={agentMode}
          setAgentMode={setAgentMode}
          contextAttachments={contextAttachments}
          setContextAttachments={setContextAttachments}
          imageAttachments={imageAttachments}
          setImageAttachments={setImageAttachments}
          contextTokens={contextTokens}
          modelInfo={modelInfo}
          activeFile={activeFile}
          atMenuOpen={atMenuOpen}
          setAtMenuOpen={setAtMenuOpen}
          atResults={atResults}
          atMenuIdx={atMenuIdx}
          setAtMenuIdx={setAtMenuIdx}
          setAtQuery={setAtQuery}
          selectAtFile={selectAtFile}
          activePicker={activePicker}
          pickerItems={currentPickerItems}
          pickerQuery={pickerQuery}
          pickerIndex={pickerIndex}
          setPickerIndex={setPickerIndex}
          onPickerSelect={handlePickerSelect}
          onPickerClose={handlePickerClose}
          pickerTitle={pickerTitle}
          pickerEmptyHelp={pickerEmptyHelp}
          onSend={sendMessage}
          onKeyDown={handleKeyDown}
          onFileDrop={handleFileDrop}
          onImagePaste={handleImagePaste}
          onFileAttach={handleFileAttach}
          onImageAttach={handleImageAttach}
        />
      )}
    </div>
  )
}
