'use client'

import { useEffect, useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useGateway } from '@/context/gateway-context'
import { useRepo } from '@/context/repo-context'
import { useEditor } from '@/context/editor-context'
import { FileExplorer } from '@/components/file-explorer'
import { EditorTabs } from '@/components/editor-tabs'
import { CodeEditor } from '@/components/code-editor'
import { AgentPanel } from '@/components/agent-panel'
import { RepoSelector } from '@/components/repo-selector'
import { ResizeHandle } from '@/components/resize-handle'
import { ThemeSwitcher } from '@/components/theme-switcher'

const STORAGE_REMEMBER = 'code-editor:remember'

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
}

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
}

function getMediaMeta(path: string): { kind: 'image' | 'video' | 'audio'; mimeType: string } | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const imageMime = IMAGE_MIME_BY_EXT[ext]
  if (imageMime) return { kind: 'image', mimeType: imageMime }
  const videoMime = VIDEO_MIME_BY_EXT[ext]
  if (videoMime) return { kind: 'video', mimeType: videoMime }
  const audioMime = AUDIO_MIME_BY_EXT[ext]
  if (audioMime) return { kind: 'audio', mimeType: audioMime }
  return null
}

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64.replace(/\n/g, '')}`
}

function decodeBase64Utf8(input: string): string {
  const normalized = input.replace(/\n/g, '')
  const binary = atob(normalized)
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}

// ─── Gateway Login ──────────────────────────────────────────────

function GatewayLogin() {
  const { status, error, connect } = useGateway()
  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showUrl, setShowUrl] = useState(false)

  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('code-editor:gateway-url')
      if (savedUrl) setUrl(savedUrl)
      const savedRemember = localStorage.getItem(STORAGE_REMEMBER)
      if (savedRemember === 'false') setRemember(false)
    } catch { }
  }, [])

  const loading = status === 'connecting' || status === 'authenticating'

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !password.trim()) return
    try { localStorage.setItem(STORAGE_REMEMBER, String(remember)) } catch { }
    connect(url.trim(), password.trim())
  }

  return (
    <div className="h-full overflow-hidden flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-[400px] space-y-5 animate-fade-in-up">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:p-8 shadow-xl">
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-lg mx-auto mb-4 flex items-center justify-center bg-[var(--brand)]">
              <Icon icon="lucide:code" width={20} height={20} className="text-white" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              code-editor
            </h1>
            <p className="text-sm mt-1 text-[var(--text-tertiary)]">
              Connect to your OpenClaw gateway
            </p>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-deletions)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-deletions)_25%,transparent)]">
                <div className="flex items-start gap-2 text-sm px-3 py-2.5 text-[var(--color-deletions)]">
                  <Icon icon="lucide:alert-circle" width={16} height={16} className="shrink-0 mt-0.5" />
                  <span className="text-[12px]">{error}</span>
                </div>
                {/pairing/i.test(error) && (
                  <div className="px-3 pb-3 space-y-2">
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      This device hasn&apos;t been approved on your gateway yet. On the machine running OpenClaw:
                    </p>
                    <div className="rounded-md px-3 py-2.5 font-mono text-xs leading-relaxed space-y-0.5 bg-[var(--bg)] text-[var(--text-primary)]">
                      <p className="text-[var(--text-tertiary)]"># 1. List pending devices</p>
                      <p>openclaw devices list</p>
                      <p className="text-[var(--text-tertiary)] pt-1"># 2. Approve the entry</p>
                      <p>openclaw devices approve &lt;request-id&gt;</p>
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
                      Then click <strong className="text-[var(--text-secondary)]">Connect</strong> again.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Gateway URL</label>
              <div className="relative">
                <input
                  type={showUrl ? 'text' : 'password'}
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://your-gateway.example.com"
                  required
                  autoComplete="url"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowUrl(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  <Icon icon={showUrl ? 'lucide:eye' : 'lucide:eye-off'} width={14} height={14} />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Gateway password"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
              <button
                type="button"
                role="switch"
                aria-checked={remember}
                onClick={() => setRemember(!remember)}
                className="relative w-9 h-5 rounded-full transition-colors duration-150 shrink-0 cursor-pointer border"
                style={{
                  background: remember ? 'color-mix(in srgb, var(--brand) 30%, transparent)' : 'var(--bg-subtle)',
                  borderColor: remember ? 'color-mix(in srgb, var(--brand) 40%, transparent)' : 'var(--border)',
                }}
              >
                <span
                  className="absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full transition-all duration-150"
                  style={{
                    background: remember ? 'var(--brand)' : '#555',
                    transform: remember ? 'translateX(14px)' : 'translateX(0)',
                  }}
                />
              </button>
              <span className="text-xs text-[var(--text-secondary)]">Remember credentials</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'white',
              }}
            >
              {loading
                ? status === 'authenticating' ? 'Authenticating\u2026' : 'Connecting\u2026'
                : 'Connect'}
            </button>
          </form>

          <p className="text-center text-xs mt-4 text-[var(--text-tertiary)]">
            {remember ? 'Credentials stored locally in your browser only.' : 'Credentials will not be saved.'}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon icon="lucide:shield" width={13} height={13} className="text-[var(--text-tertiary)]" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">Your credentials are safe</span>
          </div>
          <div className="space-y-2.5">
            {[
              { icon: 'lucide:eye-off', bold: 'Never sent to our servers.', text: 'Your gateway password stays on your device.' },
              { icon: 'lucide:wifi', bold: 'Direct connection.', text: 'Browser connects straight to your gateway via WebSocket.' },
              { icon: 'lucide:shield', bold: 'Local storage only.', text: 'Credentials saved in localStorage — never in cookies or on a server.' },
            ].map(({ icon, bold, text }) => (
              <div key={bold} className="flex items-start gap-2.5">
                <Icon icon={icon} width={13} height={13} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
                  <span className="text-[var(--text-secondary)]">{bold}</span> {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Editor Layout ──────────────────────────────────────────────

const EXPLORER_MIN = 160
const EXPLORER_MAX = 480
const AGENT_MIN = 260
const AGENT_MAX = 600

function EditorLayout() {
  const { repo } = useRepo()
  const { files, openFile } = useEditor()
  const { status } = useGateway()
  const [explorerWidth, setExplorerWidth] = useState(240)
  const [agentWidth, setAgentWidth] = useState(360)
  const [agentOpen, setAgentOpen] = useState(false)
  const [explorerVisible, setExplorerVisible] = useState(true)

  const dirtyCount = files.filter(f => f.dirty).length

  // Handle file-select events from explorer
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path, sha } = (e as CustomEvent).detail
      if (!repo) return
      try {
        const res = await fetch(`/api/github/repos/${repo.owner}/${repo.repo}/contents/${path}`)
        if (!res.ok) throw new Error('Failed to fetch file')
        const data = await res.json()
        const media = getMediaMeta(path)

        if (media) {
          const content = typeof data.content === 'string' && data.content.length > 0
            ? toDataUrl(data.content, media.mimeType)
            : typeof data.download_url === 'string' && data.download_url.length > 0
              ? data.download_url
              : ''
          openFile(path, content, data.sha ?? sha, media)
          return
        }

        const content = data.content ? decodeBase64Utf8(data.content) : data.text ?? ''
        openFile(path, content, data.sha ?? sha, { kind: 'text' })
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    }
    window.addEventListener('file-select', handler)
    return () => window.removeEventListener('file-select', handler)
  }, [repo, openFile])

  const handleExplorerResize = useCallback((delta: number) => {
    setExplorerWidth(w => Math.min(EXPLORER_MAX, Math.max(EXPLORER_MIN, w + delta)))
  }, [])

  const handleAgentResize = useCallback((delta: number) => {
    setAgentWidth(w => Math.min(AGENT_MAX, Math.max(AGENT_MIN, w - delta)))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'b') { e.preventDefault(); setExplorerVisible(v => !v) }
        if (e.key === 'j') { e.preventDefault(); setAgentOpen(v => !v) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExplorerVisible(v => !v)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${explorerVisible
                ? 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
              }`}
            title={`${explorerVisible ? 'Hide' : 'Show'} explorer (\u2318B)`}
          >
            <Icon icon="lucide:panel-left" width={16} height={16} />
          </button>

          <div className="flex items-center gap-2">
            <Icon icon="lucide:code" width={18} height={18} className="text-[var(--brand)]" />
            <span className="text-[13px] font-bold text-[var(--text-primary)]">code-editor</span>
          </div>
          <div className="w-px h-5 bg-[var(--border)]" />
          <RepoSelector />
        </div>

        <div className="flex items-center gap-1.5">
          {/* <span className={`flex items-center gap-1 text-[10px] mr-1 ${
            status === 'connected' ? 'text-[var(--color-additions)]' : 'text-[var(--text-tertiary)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-[var(--color-additions)]' : 'bg-[var(--text-tertiary)]'
            }`} />
            gateway
          </span> */}

          <ThemeSwitcher />

          <button
            onClick={() => setAgentOpen(!agentOpen)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${agentOpen
                ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
              }`}
            title={`${agentOpen ? 'Hide' : 'Show'} agent (\u2318J)`}
          >
            <Icon icon="lucide:sparkles" width={15} height={15} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File Explorer */}
        {explorerVisible && (
          <>
            <div className="shrink-0 bg-[var(--bg)] overflow-hidden" style={{ width: explorerWidth }}>
              <FileExplorer />
            </div>
            <ResizeHandle direction="horizontal" onResize={handleExplorerResize} />
          </>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <EditorTabs />
          <CodeEditor />
        </div>

        {/* Agent Side Panel (expanded from bubble) */}
        {agentOpen && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleAgentResize} />
            <div className="shrink-0 overflow-hidden" style={{ width: agentWidth }}>
              <AgentPanel />
            </div>
          </>
        )}
      </div>

      {/* Chat bubble (visible when agent panel is closed) */}
      {!agentOpen && (
        <button
          onClick={() => setAgentOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 cursor-pointer z-50"
          style={{
            backgroundColor: 'var(--brand)',
            color: 'white',
          }}
          title="Open agent (\u2318J)"
        >
          <Icon icon="lucide:sparkles" width={20} height={20} />
        </button>
      )}

      {/* Status bar */}
      <footer className="flex items-center justify-between px-3 h-6 border-t border-[var(--border)] bg-[var(--bg-elevated)] text-[9px] text-[var(--text-tertiary)] shrink-0">
        <div className="flex items-center gap-3">
          {repo && <span className="font-mono">{repo.fullName}</span>}
          {repo && <span>{repo.branch}</span>}
          {dirtyCount > 0 && (
            <span className="text-[var(--brand)]">
              {dirtyCount} modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>code-editor v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}


// ─── Root Page ──────────────────────────────────────────────────

export default function EditorPage() {
  const { status } = useGateway()

  if (status !== 'connected') {
    return <GatewayLogin />
  }

  return <EditorLayout />
}
