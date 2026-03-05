'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { copyToClipboard } from '@/lib/clipboard'
import { useTheme, THEME_PRESETS } from '@/context/theme-context'
import {
  CORE_TOKENS,
  APP_TOKENS,
  parseAuto,
  serializeCSS,
  serializeJSON,
  readCurrentTokens,
  applyTokensToDOM,
  clearInlineTokens,
  validateCoreTokens,
  addCustomTheme,
  loadCustomThemes,
  removeCustomTheme,
  type TokenMap,
  type StoredCustomTheme,
} from '@/lib/theme-io'

interface ThemeStudioProps {
  open: boolean
  onClose: () => void
}

type Tab = 'import' | 'export' | 'custom'

export function ThemeStudio({ open, onClose }: ThemeStudioProps) {
  const { themeId, resolvedMode, setThemeId, bumpVersion } = useTheme()
  const [tab, setTab] = useState<Tab>('import')
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [customThemes, setCustomThemes] = useState<StoredCustomTheme[]>([])
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [themeName, setThemeName] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const appliedTokensRef = useRef<TokenMap | null>(null)

  useEffect(() => {
    if (open) {
      setCustomThemes(loadCustomThemes())
      setImportError(null)
      setImportSuccess(false)
      setImportText('')
      setThemeName('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  const handleImport = useCallback(() => {
    setImportError(null)
    setImportSuccess(false)

    if (!importText.trim()) {
      setImportError('Paste some CSS or JSON first.')
      return
    }

    try {
      const parsed = parseAuto(importText)
      const tokens = resolvedMode === 'dark' ? parsed.dark : parsed.light

      if (Object.keys(tokens).length === 0) {
        setImportError(`No ${resolvedMode} mode tokens found in the input.`)
        return
      }

      const { valid, missing } = validateCoreTokens(tokens)
      if (!valid) {
        setImportError(`Missing required tokens: ${missing.join(', ')}. Theme applied with defaults.`)
      }

      applyTokensToDOM(tokens)
      appliedTokensRef.current = tokens
      bumpVersion()
      setImportSuccess(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse theme.')
    }
  }, [importText, resolvedMode, bumpVersion])

  const handleSaveCustom = useCallback(() => {
    if (!appliedTokensRef.current) return

    try {
      const parsed = parseAuto(importText)
      const name = themeName.trim() || parsed.name || 'Custom Theme'
      const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`

      const theme: StoredCustomTheme = {
        id,
        name,
        light: parsed.light,
        dark: parsed.dark,
      }

      addCustomTheme(theme)
      setCustomThemes(loadCustomThemes())
      setThemeId(id)
    } catch {}
  }, [importText, themeName, setThemeId])

  const handleResetToPreset = useCallback(() => {
    if (appliedTokensRef.current) {
      clearInlineTokens(appliedTokensRef.current)
      appliedTokensRef.current = null
    }

    const preset = THEME_PRESETS.find(t => t.id === themeId) ?? THEME_PRESETS[0]
    setThemeId(preset.id)
    bumpVersion()
    setImportText('')
    setImportSuccess(false)
    setImportError(null)
  }, [themeId, setThemeId, bumpVersion])

  const handleDeleteCustom = useCallback((id: string) => {
    removeCustomTheme(id)
    setCustomThemes(loadCustomThemes())
    if (themeId === id) {
      setThemeId('obsidian')
    }
  }, [themeId, setThemeId])

  const handleApplyCustom = useCallback((theme: StoredCustomTheme) => {
    const tokens = resolvedMode === 'dark' ? theme.dark : theme.light
    applyTokensToDOM(tokens)
    appliedTokensRef.current = tokens
    bumpVersion()
  }, [resolvedMode, bumpVersion])

  const handleCopy = useCallback(async (format: 'css' | 'json') => {
    const coreLight = readCurrentTokens(CORE_TOKENS)
    const coreDark = readCurrentTokens(CORE_TOKENS)
    const appLight = readCurrentTokens(APP_TOKENS)
    const appDark = readCurrentTokens(APP_TOKENS)

    let text: string
    if (format === 'css') {
      const lightAll = { ...coreLight, ...appLight }
      const darkAll = { ...coreDark, ...appDark }
      text = serializeCSS(lightAll, darkAll)
    } else {
      text = serializeJSON(themeId, coreLight, coreDark, appLight, appDark)
    }

    const ok = await copyToClipboard(text)
    setCopyFeedback(ok ? (format === 'css' ? 'CSS copied!' : 'JSON copied!') : 'Copy failed')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [themeId])

  if (!open) return null

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'import', label: 'Import', icon: 'lucide:download' },
    { id: 'export', label: 'Export', icon: 'lucide:upload' },
    { id: 'custom', label: 'Saved', icon: 'lucide:bookmark' },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)]">
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl animate-scale-in overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:palette" width={16} height={16} className="text-[var(--brand)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Theme Studio</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)]">
              tweakcn compatible
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)]">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
                tab === t.id
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon icon={t.icon} width={12} height={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {tab === 'import' && (
            <div className="space-y-3">
              <p className="text-[11px] text-[var(--text-secondary)]">
                Paste CSS or JSON from <span className="font-medium">tweakcn</span>, <span className="font-medium">shadcn themes</span>, or any compatible source.
              </p>

              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportError(null); setImportSuccess(false) }}
                placeholder={`:root {\n  --background: ...;\n  --foreground: ...;\n}\n.dark {\n  --background: ...;\n  --foreground: ...;\n}`}
                className="w-full h-40 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none outline-none focus:border-[var(--border-focus)] transition-colors"
              />

              {importError && (
                <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--error)_30%,transparent)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] px-3 py-2">
                  <Icon icon="lucide:alert-triangle" width={12} height={12} className="text-[var(--error)] shrink-0 mt-0.5" />
                  <span className="text-[11px] text-[var(--error)]">{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] px-3 py-2">
                  <Icon icon="lucide:check-circle" width={12} height={12} className="text-[var(--success)] shrink-0 mt-0.5" />
                  <span className="text-[11px] text-[var(--success)]">Theme applied! Preview below.</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90"
                >
                  <Icon icon="lucide:play" width={12} height={12} />
                  Preview
                </button>
                <button
                  onClick={handleResetToPreset}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Icon icon="lucide:rotate-ccw" width={12} height={12} />
                  Reset
                </button>
              </div>

              {importSuccess && (
                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                  <p className="text-[11px] text-[var(--text-secondary)]">Save as custom theme:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={themeName}
                      onChange={e => setThemeName(e.target.value)}
                      placeholder="Theme name"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-focus)] transition-colors"
                    />
                    <button
                      onClick={handleSaveCustom}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-all cursor-pointer"
                    >
                      <Icon icon="lucide:save" width={12} height={12} />
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'export' && (
            <div className="space-y-3">
              <p className="text-[11px] text-[var(--text-secondary)]">
                Export the current theme for use in tweakcn, shadcn, or other projects.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleCopy('css')}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:file-code" width={20} height={20} className="text-[var(--brand)]" />
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">Copy CSS</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">:root + .dark blocks</span>
                </button>
                <button
                  onClick={() => handleCopy('json')}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:file-json" width={20} height={20} className="text-[var(--brand)]" />
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">Copy JSON</span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">modes + extensions</span>
                </button>
              </div>

              {copyFeedback && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[color-mix(in_srgb,var(--success)_8%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                  <Icon icon="lucide:check" width={12} height={12} className="text-[var(--success)]" />
                  <span className="text-[11px] text-[var(--success)]">{copyFeedback}</span>
                </div>
              )}

              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-[10px] text-[var(--text-tertiary)] mb-2">Current theme info:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <div className="text-[var(--text-tertiary)]">Theme</div>
                  <div className="text-[var(--text-secondary)] font-medium">{themeId}</div>
                  <div className="text-[var(--text-tertiary)]">Mode</div>
                  <div className="text-[var(--text-secondary)] font-medium">{resolvedMode}</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-3">
              {customThemes.length === 0 ? (
                <div className="text-center py-8">
                  <Icon icon="lucide:bookmark" width={24} height={24} className="mx-auto text-[var(--text-tertiary)] mb-2 opacity-40" />
                  <p className="text-[12px] text-[var(--text-secondary)]">No saved custom themes</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Import a theme and save it to see it here.</p>
                </div>
              ) : (
                customThemes.map(theme => (
                  <div
                    key={theme.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium text-[var(--text-primary)] truncate block">{theme.name}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {Object.keys(theme.light).length} light + {Object.keys(theme.dark).length} dark tokens
                      </span>
                    </div>
                    <button
                      onClick={() => handleApplyCustom(theme)}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 transition-all cursor-pointer"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => handleDeleteCustom(theme.id)}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[color-mix(in_srgb,var(--error)_8%,transparent)] transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Icon icon="lucide:trash-2" width={12} height={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-[9px] text-[var(--text-tertiary)]">
            tweakcn / shadcn compatible — paste CSS or JSON
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md text-[10px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
