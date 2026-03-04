'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useTheme, THEME_PRESETS } from '@/context/theme-context'
import { usePlugins } from '@/context/plugin-context'
import { useGitHubAuth } from '@/context/github-auth-context'

interface Props {
  open: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'editor' | 'agent' | 'keybindings' | 'plugins'

export function SettingsPanel({ open, onClose }: Props) {
  const { themeId, setThemeId, mode, setMode } = useTheme()
  const { slots } = usePlugins()
  const { token: ghToken, source: ghSource, authenticated: ghAuthenticated, setManualToken: setGhToken, clearToken: clearGhToken, oauthAvailable, oauthStep, startOAuth, cancelOAuth, loading: ghLoading } = useGitHubAuth()
  const [ghTokenDraft, setGhTokenDraft] = useState('')
  const [ghTokenRevealed, setGhTokenRevealed] = useState(false)
  const [showGhTokenInput, setShowGhTokenInput] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('general')
  const [fontSize, setFontSize] = useState(13)
  const [tabSize, setTabSize] = useState(2)
  const [wordWrap, setWordWrap] = useState(false)
  const [minimap, setMinimap] = useState(false)
  const [autoSave, setAutoSave] = useState(true)

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
      localStorage.setItem('code-editor:settings', JSON.stringify({ fontSize, tabSize, wordWrap, minimap, autoSave }))
      // Emit so editor can pick up changes
      window.dispatchEvent(new CustomEvent('editor-settings-changed', { detail: { fontSize, tabSize, wordWrap, minimap } }))
    } catch {}
  }, [fontSize, tabSize, wordWrap, minimap, autoSave])

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
    { keys: '⌘⇧I', desc: 'Isolate component' },
    { keys: 'Esc', desc: 'Close overlays' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-[580px] max-h-[75vh] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between h-11 px-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:settings" width={14} height={14} className="text-[var(--text-tertiary)]" />
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">Settings</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer">
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 px-4 h-9 border-b border-[var(--border)] shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                tab === t.id ? 'text-[var(--text-primary)] bg-[var(--bg-subtle)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
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
                  {THEME_PRESETS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setThemeId(t.id)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all cursor-pointer border ${
                        themeId === t.id
                          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-disabled)]'
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-1 shrink-0" style={{ background: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">Mode:</span>
                  {(['dark', 'light'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                        mode === m ? 'bg-[var(--brand)] text-[var(--brand-contrast)]' : 'bg-[var(--bg)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {m === 'dark' ? 'Dark' : 'Light'}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Auto Save */}
              <Section title="Auto Save">
                <Toggle checked={autoSave} onChange={setAutoSave} label="Save files automatically" />
              </Section>

              <Section title="Onboarding">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-[var(--text-primary)]">Show the tour</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Keyboard shortcuts and layout controls.</div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-onboarding'))}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast, #fff)' }}
                  >
                    Start
                  </button>
                </div>
              </Section>

              {/* GitHub Connection */}
              <Section title="GitHub Connection">
                {ghLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Icon icon="lucide:loader-2" width={14} height={14} className="text-[var(--text-disabled)] animate-spin" />
                    <span className="text-[11px] text-[var(--text-tertiary)]">Checking token…</span>
                  </div>
                ) : ghAuthenticated ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                      <Icon icon="lucide:check-circle" width={14} height={14} className="text-[var(--success)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate block">
                          {ghTokenRevealed ? ghToken : `${ghToken.slice(0, 4)}${'•'.repeat(Math.min(ghToken.length - 8, 20))}${ghToken.slice(-4)}`}
                        </span>
                        <span className="text-[9px] text-[var(--text-disabled)] uppercase tracking-wider">
                          Source: {ghSource}
                        </span>
                      </div>
                      <button
                        onClick={() => setGhTokenRevealed(v => !v)}
                        className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
                        title={ghTokenRevealed ? 'Hide' : 'Reveal'}
                      >
                        <Icon icon={ghTokenRevealed ? 'lucide:eye-off' : 'lucide:eye'} width={12} height={12} />
                      </button>
                      <button
                        onClick={() => { clearGhToken(); setGhTokenRevealed(false) }}
                        className="p-1 rounded hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
                        title="Remove token"
                      >
                        <Icon icon="lucide:x" width={12} height={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--text-disabled)]">Token stored locally. Never sent to external servers.</p>
                  </div>
                ) : oauthStep.type === 'device-pending' ? (
                  <div className="space-y-2 px-3 py-3 rounded-lg border border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_4%,var(--bg))]">
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:loader-2" width={14} height={14} className="text-[var(--brand)] animate-spin" />
                      <span className="text-[11px] text-[var(--text-primary)] font-medium">Waiting for authorization…</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      Enter code <span className="font-mono font-bold text-[var(--brand)]">{oauthStep.userCode}</span> at GitHub
                    </p>
                    <div className="flex gap-2">
                      <a
                        href={oauthStep.verificationUriComplete}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Icon icon="lucide:external-link" width={10} height={10} />
                        Open GitHub
                      </a>
                      <button
                        onClick={cancelOAuth}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium border border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : oauthStep.type === 'error' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[color-mix(in_srgb,var(--error)_30%,var(--border))] bg-[color-mix(in_srgb,var(--error)_4%,var(--bg))]">
                      <Icon icon="lucide:alert-circle" width={14} height={14} className="text-[var(--error)] shrink-0" />
                      <span className="text-[11px] text-[var(--error)]">{oauthStep.message}</span>
                    </div>
                    <div className="flex gap-2">
                      {oauthAvailable && (
                        <button onClick={startOAuth} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer">
                          <Icon icon="lucide:rotate-cw" width={10} height={10} />
                          Try Again
                        </button>
                      )}
                      <button onClick={() => setShowGhTokenInput(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
                        <Icon icon="lucide:key" width={10} height={10} />
                        Enter Token Manually
                      </button>
                    </div>
                  </div>
                ) : showGhTokenInput ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
                        <Icon icon="lucide:key" width={12} height={12} className="text-[var(--text-disabled)] shrink-0" />
                        <input
                          type={ghTokenRevealed ? 'text' : 'password'}
                          value={ghTokenDraft}
                          onChange={e => setGhTokenDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && ghTokenDraft.trim()) { setGhToken(ghTokenDraft.trim()); setGhTokenDraft(''); setShowGhTokenInput(false); setGhTokenRevealed(false) }
                            if (e.key === 'Escape') { setShowGhTokenInput(false); setGhTokenDraft(''); setGhTokenRevealed(false) }
                          }}
                          placeholder="ghp_... or github_pat_..."
                          autoFocus
                          className="flex-1 bg-transparent text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none min-w-0"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button onClick={() => setGhTokenRevealed(v => !v)} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
                          <Icon icon={ghTokenRevealed ? 'lucide:eye-off' : 'lucide:eye'} width={11} height={11} />
                        </button>
                      </div>
                      <button
                        onClick={() => { if (ghTokenDraft.trim()) { setGhToken(ghTokenDraft.trim()); setGhTokenDraft(''); setShowGhTokenInput(false); setGhTokenRevealed(false) } }}
                        disabled={!ghTokenDraft.trim()}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${ghTokenDraft.trim() ? 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90' : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-not-allowed'}`}
                      >
                        Save
                      </button>
                      <button onClick={() => { setShowGhTokenInput(false); setGhTokenDraft(''); setGhTokenRevealed(false) }} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
                        <Icon icon="lucide:x" width={12} height={12} />
                      </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-disabled)]">Generate at github.com/settings/tokens — needs repo scope for private repos</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {oauthAvailable && (
                        <button
                          onClick={startOAuth}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer"
                        >
                          <Icon icon="simple-icons:github" width={14} height={14} />
                          Sign in with GitHub
                        </button>
                      )}
                      <button
                        onClick={() => setShowGhTokenInput(true)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium border border-dashed border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-disabled)] transition-all cursor-pointer ${oauthAvailable ? '' : 'flex-1'}`}
                      >
                        <Icon icon="lucide:key" width={12} height={12} />
                        {oauthAvailable ? 'Use Token' : 'Add GitHub Token'}
                      </button>
                    </div>
                    <p className="text-[9px] text-[var(--text-disabled)]">Required for cloning private repos and API access. Token never leaves your browser.</p>
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
            </>
          )}

          {tab === 'agent' && (
            <div className="text-center py-8">
              <Icon icon="lucide:bot" width={28} height={28} className="mx-auto mb-2 text-[var(--text-disabled)]" />
              <p className="text-[11px] text-[var(--text-tertiary)]">Agent settings configured via gateway</p>
              <p className="text-[10px] text-[var(--text-disabled)] mt-1">Model, system prompt, and context are managed through the OpenClaw gateway connection</p>
            </div>
          )}

          {tab === 'keybindings' && (
            <div className="space-y-0.5">
              {shortcuts.map(s => (
                <div key={s.keys} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--bg-subtle)]">
                  <span className="text-[11px] text-[var(--text-secondary)]">{s.desc}</span>
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text-tertiary)]">{s.keys}</kbd>
                </div>
              ))}
            </div>
          )}

          {tab === 'plugins' && (
            <>
              {slots.settings.length > 0 ? (
                <div className="space-y-4">
                  {slots.settings.map(entry => {
                    const Comp = entry.component
                    return (
                      <div key={entry.id} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                        <Comp />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Icon icon="lucide:puzzle" width={28} height={28} className="mx-auto mb-2 text-[var(--text-disabled)]" />
                  <p className="text-[11px] text-[var(--text-tertiary)]">No plugins installed</p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">Plugins can register settings, floating widgets, and status bar entries</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-1.5">{title}</div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4.5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--brand)]' : 'bg-[var(--bg-tertiary)]'}`}
      >
        <div className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  )
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-6 h-6 rounded-md bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer">
        <Icon icon="lucide:minus" width={10} height={10} />
      </button>
      <span className="text-[12px] font-mono text-[var(--text-primary)] w-6 text-center">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-6 h-6 rounded-md bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer">
        <Icon icon="lucide:plus" width={10} height={10} />
      </button>
    </div>
  )
}
