'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useTheme, THEME_PRESETS } from '@/context/theme-context'

interface Props {
  open: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'editor' | 'agent' | 'keybindings'

export function SettingsPanel({ open, onClose }: Props) {
  const { themeId, setThemeId, mode, setMode } = useTheme()
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
  ]

  const shortcuts = [
    { keys: '⌘B', desc: 'Toggle explorer' },
    { keys: '⌘J', desc: 'Toggle terminal' },
    { keys: '⌘\\', desc: 'Toggle sidebar' },
    { keys: '⌘P', desc: 'Quick open file' },
    { keys: '⌘K', desc: 'Inline edit' },
    { keys: '⌘L', desc: 'Send selection to chat' },
    { keys: '⌘S', desc: 'Save file' },
    { keys: '⌘⇧F', desc: 'Global search' },
    { keys: '⌘⇧P', desc: 'Command palette' },
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
                        mode === m ? 'bg-[var(--brand)] text-white' : 'bg-[var(--bg)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
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
