'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { emit } from '@/lib/events'
import { useTheme, THEME_PRESETS } from '@/context/theme-context'
import { usePlugins } from '@/context/plugin-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import { AgentBuilder, AgentSummary } from '@/components/agent-builder'
import { type AgentConfig, getAgentConfig, clearAgentConfig } from '@/lib/agent-session'
import { isTauri, tauriReadFileBase64 } from '@/lib/tauri'

interface Props {
  open: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

type SettingsTab = 'general' | 'editor' | 'agent' | 'keybindings' | 'plugins'
const TOKEN_REVEAL_TIMEOUT_MS = 15000

export function SettingsPanel({ open, onClose, initialTab }: Props) {
  const {
    themeId,
    setThemeId,
    mode,
    setMode,
    bgTint,
    setBgTint,
    terminalBg,
    terminalBgOpacity,
    setTerminalBg,
    setTerminalBgOpacity,
  } = useTheme()
  const { slots } = usePlugins()
  const {
    token: ghToken,
    source: ghSource,
    authenticated: ghAuthenticated,
    setManualToken: setGhToken,
    clearToken: clearGhToken,
    loading: ghLoading,
  } = useGitHubAuth()
  const [ghTokenDraft, setGhTokenDraft] = useState('')
  const [ghTokenRevealed, setGhTokenRevealed] = useState(false)
  const [ghTokenCopied, setGhTokenCopied] = useState(false)
  const [showGhTokenInput, setShowGhTokenInput] = useState(false)
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'general')
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(() => getAgentConfig())
  const [agentBuilderMode, setAgentBuilderMode] = useState(false)
  const [fontSize, setFontSize] = useState(13)
  const [tabSize, setTabSize] = useState(2)
  const [wordWrap, setWordWrap] = useState(false)
  const [minimap, setMinimap] = useState(false)
  const [autoSave, setAutoSave] = useState(true)

  // Sync initialTab when panel re-opens
  useEffect(() => {
    if (open && initialTab) {
      setTab(initialTab)
    }
    if (open) {
      setAgentConfig(getAgentConfig())
      setAgentBuilderMode(false)
    }
  }, [open, initialTab])

  // Load settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem('code-editor:settings')
      if (saved) {
        const s = JSON.parse(saved)
        if (s.fontSize) setFontSize(s.fontSize)
        if (s.tabSize) setTabSize(s.tabSize)
        if (s.wordWrap !== undefined) setWordWrap(s.wordWrap)
        if (s.minimap !== undefined) setMinimap(s.minimap)
        if (s.autoSave !== undefined) setAutoSave(s.autoSave)
      }
    } catch {}
  }, [])

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(
        'code-editor:settings',
        JSON.stringify({ fontSize, tabSize, wordWrap, minimap, autoSave }),
      )
      // Emit so editor can pick up changes
      emit('editor-settings-changed', { fontSize, tabSize, wordWrap, minimap })
    } catch {}
  }, [fontSize, tabSize, wordWrap, minimap, autoSave])

  useEffect(() => {
    if (!ghTokenRevealed) return
    const timer = setTimeout(() => setGhTokenRevealed(false), TOKEN_REVEAL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [ghTokenRevealed])

  useEffect(() => {
    if (!ghTokenCopied) return
    const timer = setTimeout(() => setGhTokenCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [ghTokenCopied])

  const handleToggleReveal = useCallback(() => {
    if (ghTokenRevealed) {
      setGhTokenRevealed(false)
      return
    }
    const ok = window.confirm('Reveal token for 15 seconds? Avoid this while screen sharing.')
    if (ok) setGhTokenRevealed(true)
  }, [ghTokenRevealed])

  const handleCopyToken = useCallback(async () => {
    if (!ghToken) return
    try {
      await navigator.clipboard.writeText(ghToken)
      setGhTokenCopied(true)
    } catch {
      // Ignore clipboard errors in unsupported contexts.
    }
  }, [ghToken])

  const handleClearLocalStorage = useCallback(() => {
    const ok = window.confirm(
      'Clear all local storage for KnotCode and reload now? This removes saved settings, recent files, chat history, and cached plugin data on this device.',
    )
    if (!ok) return
    try {
      localStorage.clear()
    } catch {}
    window.location.reload()
  }, [])

  if (!open) return null

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: 'lucide:sliders-horizontal' },
    { id: 'editor', label: 'Editor', icon: 'lucide:code-2' },
    { id: 'agent', label: 'Agent', icon: 'lucide:bot' },
    { id: 'keybindings', label: 'Keys', icon: 'lucide:keyboard' },
    { id: 'plugins', label: 'Plugins', icon: 'lucide:puzzle' },
  ]

  const shortcuts = [
    { keys: '⌘B', desc: 'Toggle explorer' },
    { keys: '⌘J', desc: 'Toggle terminal' },
    { keys: '⌘\\', desc: 'Toggle sidebar' },
    { keys: '⌘P', desc: 'Quick open file' },
    { keys: '⌘K', desc: 'Inline edit' },
    { keys: '⌘L', desc: 'Send selection to chat' },
    { keys: '⌘⌥1', desc: 'Focus explorer' },
    { keys: '⌘⌥2', desc: 'Focus editor' },
    { keys: '⌘⌥3', desc: 'Focus chat' },
    { keys: '⌘⌥4', desc: 'Focus terminal' },
    { keys: '⌘S', desc: 'Save file' },
    { keys: '⌘⇧F', desc: 'Global search' },
    { keys: '⌘⇧P', desc: 'Command palette' },
    { keys: 'Esc', desc: 'Close overlays' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-[520px] h-[760px] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Icon
              icon="lucide:settings"
              width={14}
              height={14}
              className="text-[var(--text-tertiary)]"
            />
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-4 h-9 border-b border-[var(--border)] shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                tab === t.id
                  ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon icon={t.icon} width={11} height={11} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'general' && (
            <>
              {/* Theme */}
              <Section title="Theme">
                <div className="grid grid-cols-4 gap-1.5">
                  {THEME_PRESETS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setThemeId(t.id)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer border ${
                        themeId === t.id
                          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-disabled)]'
                      }`}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1 shrink-0"
                        style={{ background: t.color }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">Mode:</span>
                  {(['dark', 'light'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                        mode === m
                          ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                          : 'bg-[var(--bg)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {m === 'dark' ? 'Dark' : 'Light'}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Background Tint */}
              <Section title="Background Tint">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={bgTint}
                      onChange={(e) => setBgTint(Number(e.target.value))}
                      className="flex-1 h-1 appearance-none rounded-full bg-[var(--bg-tertiary)] accent-[var(--brand)] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--brand)] [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)] w-8 text-right tabular-nums">
                      {bgTint}%
                    </span>
                  </div>
                  <p className="text-[9px] text-[var(--text-disabled)]">
                    Tints the background with your theme&apos;s accent color. 0% = off.
                  </p>
                </div>
              </Section>

              {/* Auto Save */}
              <Section title="Auto Save">
                <Toggle
                  checked={autoSave}
                  onChange={setAutoSave}
                  label="Save files automatically"
                />
              </Section>

              <Section title="Onboarding">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-[var(--text-primary)]">
                      Show the tour
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      Keyboard shortcuts and layout controls.
                    </div>
                  </div>
                  <button
                    onClick={() => emit('open-onboarding')}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
                    style={{
                      backgroundColor: 'var(--brand)',
                      color: 'var(--brand-contrast, #fff)',
                    }}
                  >
                    Start
                  </button>
                </div>
              </Section>

              <Section title="Local Data">
                <div className="space-y-2">
                  <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
                    Clear browser local storage for this app.
                  </p>
                  <button
                    onClick={handleClearLocalStorage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border border-[color-mix(in_srgb,var(--error)_35%,var(--border))] text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_8%,transparent)] transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:trash-2" width={11} height={11} />
                    Clear Local Storage
                  </button>
                  <p className="text-[9px] text-[var(--text-disabled)]">
                    The app reloads after clearing. Desktop keychain tokens are not affected.
                  </p>
                </div>
              </Section>

              {/* GitHub Connection */}
              <Section title="GitHub Connection">
                {ghLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Icon
                      icon="lucide:loader-2"
                      width={14}
                      height={14}
                      className="text-[var(--text-disabled)] animate-spin"
                    />
                    <span className="text-[11px] text-[var(--text-tertiary)]">Checking token…</span>
                  </div>
                ) : ghAuthenticated ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                      <Icon
                        icon="lucide:check-circle"
                        width={14}
                        height={14}
                        className="text-[var(--success)] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate block">
                          {ghTokenRevealed
                            ? ghToken
                            : `${ghToken.slice(0, 4)}${'•'.repeat(Math.min(ghToken.length - 8, 20))}${ghToken.slice(-4)}`}
                        </span>
                        <span className="text-[9px] text-[var(--text-disabled)] uppercase tracking-wider">
                          Source: {ghSource}
                        </span>
                      </div>
                      <button
                        onClick={handleCopyToken}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                        title={ghTokenCopied ? 'Copied' : 'Copy token'}
                      >
                        <Icon
                          icon={ghTokenCopied ? 'lucide:check' : 'lucide:copy'}
                          width={12}
                          height={12}
                        />
                      </button>
                      <button
                        onClick={handleToggleReveal}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                        title={ghTokenRevealed ? 'Hide' : 'Reveal'}
                      >
                        <Icon
                          icon={ghTokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                          width={12}
                          height={12}
                        />
                      </button>
                      <button
                        onClick={() => {
                          clearGhToken()
                          setGhTokenRevealed(false)
                          setGhTokenCopied(false)
                        }}
                        className="p-1 rounded hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
                        title="Remove token"
                      >
                        <Icon icon="lucide:x" width={12} height={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-disabled)]">
                      {ghTokenRevealed
                        ? 'Token reveal auto-hides after 15s. Avoid screen sharing.'
                        : ghTokenCopied
                          ? 'Token copied to clipboard.'
                          : 'Desktop stores token in OS keychain. Web keeps token in memory only.'}
                    </p>
                  </div>
                ) : showGhTokenInput ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
                        <Icon
                          icon="lucide:key"
                          width={12}
                          height={12}
                          className="text-[var(--text-disabled)] shrink-0"
                        />
                        <input
                          type={ghTokenRevealed ? 'text' : 'password'}
                          value={ghTokenDraft}
                          onChange={(e) => setGhTokenDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && ghTokenDraft.trim()) {
                              setGhToken(ghTokenDraft.trim())
                              setGhTokenDraft('')
                              setShowGhTokenInput(false)
                              setGhTokenRevealed(false)
                            }
                            if (e.key === 'Escape') {
                              setShowGhTokenInput(false)
                              setGhTokenDraft('')
                              setGhTokenRevealed(false)
                            }
                          }}
                          placeholder="ghp_... or github_pat_..."
                          autoFocus
                          className="flex-1 bg-transparent text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          onClick={() => setGhTokenRevealed((v) => !v)}
                          className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                        >
                          <Icon
                            icon={ghTokenRevealed ? 'lucide:eye-off' : 'lucide:eye'}
                            width={11}
                            height={11}
                          />
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          if (ghTokenDraft.trim()) {
                            setGhToken(ghTokenDraft.trim())
                            setGhTokenDraft('')
                            setShowGhTokenInput(false)
                            setGhTokenRevealed(false)
                          }
                        }}
                        disabled={!ghTokenDraft.trim()}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${ghTokenDraft.trim() ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90' : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'}`}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setShowGhTokenInput(false)
                          setGhTokenDraft('')
                          setGhTokenRevealed(false)
                        }}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                      >
                        <Icon icon="lucide:x" width={12} height={12} />
                      </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-disabled)]">
                      Generate at github.com/settings/tokens — needs repo scope for private repos
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowGhTokenInput(true)}
                        className="flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium border border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer inline-flex"
                      >
                        <Icon icon="lucide:key" width={12} height={12} />
                        Add GitHub Token
                      </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-disabled)]">
                      Required for private repos and API access. Tokens stay local to this
                      app/session.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}

          {tab === 'editor' && (
            <>
              <Section title="Font Size">
                <NumberInput value={fontSize} onChange={setFontSize} min={10} max={24} />
              </Section>
              <Section title="Tab Size">
                <NumberInput value={tabSize} onChange={setTabSize} min={1} max={8} />
              </Section>
              <Section title="Word Wrap">
                <Toggle checked={wordWrap} onChange={setWordWrap} label="Wrap long lines" />
              </Section>
              <Section title="Minimap">
                <Toggle checked={minimap} onChange={setMinimap} label="Show code minimap" />
              </Section>

              <Section title="Terminal Background">
                <TerminalBgPicker
                  terminalBg={terminalBg}
                  terminalBgOpacity={terminalBgOpacity}
                  setTerminalBg={setTerminalBg}
                  setTerminalBgOpacity={setTerminalBgOpacity}
                />
              </Section>
            </>
          )}

          {tab === 'agent' &&
            (agentConfig && !agentBuilderMode ? (
              <AgentSummary
                config={agentConfig}
                onReconfigure={() => setAgentBuilderMode(true)}
                onReset={() => {
                  clearAgentConfig()
                  setAgentConfig(null)
                  setAgentBuilderMode(false)
                }}
              />
            ) : (
              <AgentBuilder
                compact
                onComplete={(config) => {
                  setAgentConfig(config)
                  setAgentBuilderMode(false)
                }}
                onSkip={() => {
                  setTab('general')
                }}
              />
            ))}

          {tab === 'keybindings' && (
            <div className="space-y-0.5">
              {shortcuts.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--bg-subtle)]"
                >
                  <span className="text-[11px] text-[var(--text-secondary)]">{s.desc}</span>
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-tertiary)]">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          )}

          {tab === 'plugins' && (
            <>
              {slots.settings.length > 0 ? (
                <div className="space-y-4">
                  {slots.settings.map((entry) => {
                    const Comp = entry.component
                    return (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]"
                      >
                        <Comp />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Icon
                    icon="lucide:puzzle"
                    width={28}
                    height={28}
                    className="mx-auto mb-2 text-[var(--text-disabled)]"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)]">No plugins installed</p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">
                    Plugins can register settings, floating widgets, and status bar entries
                  </p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}

/* ── Terminal Background Picker ──────────────────────────── */

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    avif: 'image/avif',
  }
  return map[ext] ?? 'image/png'
}

async function loadImageFromPath(absolutePath: string): Promise<string | null> {
  const base64 = await tauriReadFileBase64(absolutePath)
  if (!base64) return null
  return `data:${mimeFromExt(absolutePath)};base64,${base64}`
}

function TerminalBgPicker({
  terminalBg,
  terminalBgOpacity,
  setTerminalBg,
  setTerminalBgOpacity,
}: {
  terminalBg: string | null
  terminalBgOpacity: number
  setTerminalBg: (url: string | null) => void
  setTerminalBgOpacity: (v: number) => void
}) {
  const [pathDraft, setPathDraft] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const desktop = isTauri()

  const applyPath = useCallback(
    async (filePath: string) => {
      const trimmed = filePath.trim()
      if (!trimmed) return
      setLoading(true)
      setPathError(null)
      try {
        const dataUrl = await loadImageFromPath(trimmed)
        if (dataUrl) {
          setTerminalBg(dataUrl)
          setPathDraft('')
        } else {
          setPathError('Could not read image file')
        }
      } catch {
        setPathError('Failed to load image')
      } finally {
        setLoading(false)
      }
    },
    [setTerminalBg],
  )

  const pickWithNativeDialog = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        title: 'Choose terminal background',
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
          },
        ],
      })
      if (selected && typeof selected === 'string') {
        await applyPath(selected)
      }
    } catch {
      setPathError('File dialog unavailable')
    }
  }, [applyPath])

  const pickWithFileInput = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        setTerminalBg(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [setTerminalBg])

  return (
    <div className="space-y-3">
      {terminalBg ? (
        <div className="relative rounded-lg overflow-hidden border border-[var(--border)] group">
          <div
            className="w-full h-20 bg-cover bg-center"
            style={{ backgroundImage: `url(${terminalBg})` }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: `color-mix(in srgb, var(--bg) ${terminalBgOpacity}%, transparent)`,
            }}
          />
          <button
            onClick={() => setTerminalBg(null)}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Remove background"
          >
            <Icon icon="lucide:x" width={10} height={10} />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={desktop ? pickWithNativeDialog : pickWithFileInput}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
          >
            {loading ? (
              <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />
            ) : (
              <Icon icon="lucide:image-plus" width={14} height={14} />
            )}
            <span className="text-[10px] font-medium">{loading ? 'Loading…' : 'Choose image'}</span>
          </button>

          {desktop && (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
                <Icon
                  icon="lucide:file-image"
                  width={11}
                  height={11}
                  className="text-[var(--text-disabled)] shrink-0"
                />
                <input
                  type="text"
                  value={pathDraft}
                  onChange={(e) => {
                    setPathDraft(e.target.value)
                    setPathError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pathDraft.trim()) {
                      void applyPath(pathDraft)
                    }
                  }}
                  placeholder="/path/to/image.png"
                  className="flex-1 bg-transparent text-[10px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={() => pathDraft.trim() && applyPath(pathDraft)}
                disabled={!pathDraft.trim() || loading}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${pathDraft.trim() ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90' : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'}`}
              >
                Set
              </button>
            </div>
          )}
          {pathError && (
            <p className="text-[9px] text-[var(--color-deletions,#ef4444)]">{pathError}</p>
          )}
        </div>
      )}
      {terminalBg && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-tertiary)]">Theme overlay</span>
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] w-8 text-right tabular-nums">
              {terminalBgOpacity}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={95}
            step={5}
            value={terminalBgOpacity}
            onChange={(e) => setTerminalBgOpacity(Number(e.target.value))}
            className="w-full h-1 appearance-none rounded-full bg-[var(--bg-tertiary)] accent-[var(--brand)] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--brand)] [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="flex items-center justify-between text-[8px] text-[var(--text-disabled)]">
            <span>Image only</span>
            <span>Mostly theme</span>
          </div>
        </div>
      )}
      <p className="text-[9px] text-[var(--text-disabled)]">
        {desktop
          ? 'Pick an image or paste an absolute path. The theme overlay blends your current theme on top.'
          : 'Set a wallpaper behind your terminal. The theme overlay blends your current theme on top.'}
      </p>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`w-8 h-4.5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--brand)]' : 'bg-[var(--bg-tertiary)]'}`}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-[var(--bg-elevated)] shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-6 h-6 rounded-md bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer"
      >
        <Icon icon="lucide:minus" width={10} height={10} />
      </button>
      <span className="text-[12px] font-mono text-[var(--text-primary)] w-6 text-center">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-6 h-6 rounded-md bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer"
      >
        <Icon icon="lucide:plus" width={10} height={10} />
      </button>
    </div>
  )
}
