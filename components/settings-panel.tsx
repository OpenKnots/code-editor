'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MobileConnect } from './mobile-connect'
import { SessionPresence } from './session-presence'
import { CaffeinateToggle } from './caffeinate-toggle'
import { useGateway } from '@/context/gateway-context'
import { THEME_PRESETS, useTheme, type ThemeMode, type ThemePreset } from '@/context/theme-context'

type SettingsTab = 'connect' | 'general'

const APPEARANCE_MODES: Array<{ id: ThemeMode; label: string; icon: string }> = [
  { id: 'dark', label: 'Dark', icon: 'lucide:moon-star' },
  { id: 'light', label: 'Light', icon: 'lucide:sun-medium' },
  { id: 'system', label: 'System', icon: 'lucide:laptop-minimal' },
]

const THEME_GROUP_LABELS: Record<ThemePreset['group'], string> = {
  core: 'Core',
  tweakcn: 'Extras',
}

function groupThemes() {
  return (Object.keys(THEME_GROUP_LABELS) as Array<ThemePreset['group']>).map((group) => ({
    group,
    label: THEME_GROUP_LABELS[group],
    themes: THEME_PRESETS.filter((preset) => preset.group === group),
  }))
}

/**
 * Settings Panel — Gateway connection, mobile connect, device presence, and preferences.
 * Slides in from the right as a side panel overlay.
 */
export function SettingsPanel({
  open = true,
  onClose,
  initialTab,
}: {
  open?: boolean
  onClose: () => void
  initialTab?: string
}) {
  const [tab, setTab] = useState<SettingsTab>((initialTab as SettingsTab) || 'connect')
  const { status, gatewayUrl } = useGateway()
  const { themeId, setThemeId, mode, setMode } = useTheme()

  const themeGroups = useMemo(() => groupThemes(), [])
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0) setDragOffset(dy)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > 120) {
      onClose()
    }
    setDragOffset(0)
  }, [dragOffset, onClose])

  if (!open) return null

  const sheetContent = (
    <>
      {isMobile && (
        <div
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-[var(--text-disabled)] opacity-40" />
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            Tune the shell, sync, and system behavior.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text-disabled)] transition hover:border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)]"
        >
          <Icon icon="lucide:x" width={18} />
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[1000]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={onClose}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: dragOffset > 0 ? dragOffset : 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl border-t border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--shadow-2xl)] backdrop-blur-2xl"
              style={{
                maxHeight: '80vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
                overscrollBehavior: 'contain',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {sheetContent}

              <div className="border-b border-[var(--glass-border)] px-4 py-3">
                <div className="inline-flex rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] p-1 shadow-[var(--shadow-xs)]">
                  {[
                    { id: 'connect' as SettingsTab, label: 'Connect', icon: 'lucide:smartphone' },
                    {
                      id: 'general' as SettingsTab,
                      label: 'General',
                      icon: 'lucide:sliders-horizontal',
                    },
                  ].map((item) => {
                    const active = tab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                            : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon icon={item.icon} width={14} />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:py-5">
                {tab === 'connect' && (
                  <div className="space-y-5">
                    <MobileConnect />
                    <SessionPresence />

                    <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                          <Icon icon="lucide:activity" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">
                            Gateway
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Connection state for the local app bridge.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[var(--text-secondary)]">Status</span>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium ${
                              status === 'connected'
                                ? 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]'
                                : status === 'connecting'
                                  ? 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]'
                                  : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {status === 'connected'
                              ? 'Connected'
                              : status === 'connecting'
                                ? 'Connecting'
                                : 'Disconnected'}
                          </span>
                        </div>

                        {gatewayUrl && (
                          <div className="flex items-start justify-between gap-3">
                            <span className="pt-0.5 text-[var(--text-secondary)]">Gateway</span>
                            <code className="max-w-[220px] truncate rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-primary)]">
                              {gatewayUrl}
                            </code>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {tab === 'general' && (
                  <div className="space-y-5">
                    <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                          <Icon icon="lucide:sparkles" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">
                            Appearance
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Switch themes and shell tone instantly.
                          </p>
                        </div>
                      </div>

                      <div className="mb-4 rounded-[20px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] p-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {APPEARANCE_MODES.map((appearanceMode) => {
                            const active = mode === appearanceMode.id
                            return (
                              <button
                                key={appearanceMode.id}
                                type="button"
                                onClick={() => setMode(appearanceMode.id)}
                                className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition ${
                                  active
                                    ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                                    : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                <Icon icon={appearanceMode.icon} width={14} />
                                {appearanceMode.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {themeGroups.map(({ group, label, themes }) => (
                          <div key={group} className="space-y-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                              {label}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              {themes.map((preset) => {
                                const active = themeId === preset.id
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setThemeId(preset.id)}
                                    className={`group relative overflow-hidden rounded-[20px] border px-3 py-3 text-left transition ${
                                      active
                                        ? 'border-[color-mix(in_srgb,var(--brand)_45%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,var(--bg-elevated))] shadow-[var(--shadow-md)]'
                                        : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,var(--bg-elevated))] hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-elevated))]'
                                    }`}
                                  >
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <span
                                        className="h-9 w-9 rounded-[14px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                                        style={{ backgroundColor: preset.color }}
                                      />
                                      {active ? (
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]">
                                          <Icon icon="lucide:check" width={14} />
                                        </span>
                                      ) : (
                                        <Icon
                                          icon="lucide:chevron-right"
                                          width={14}
                                          className="text-[var(--text-disabled)] transition group-hover:translate-x-0.5"
                                        />
                                      )}
                                    </div>
                                    <div className="text-sm font-medium text-[var(--text-primary)]">
                                      {preset.label}
                                    </div>
                                    <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                      {preset.id === 'supreme'
                                        ? 'Metallic accents and luxury shell chrome.'
                                        : preset.group === 'core'
                                          ? 'Native palette tuned for the editor shell.'
                                          : 'Imported palette with custom texture and tone.'}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                          <Icon icon="lucide:cpu" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">System</h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Device-level behavior and power settings.
                          </p>
                        </div>
                      </div>
                      <CaffeinateToggle />
                    </section>

                    <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                          <Icon icon="lucide:chevron-left-dot" width={20} />
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            Knot Code
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)]">
                            AI-native code editor by OpenKnot.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <a
                          href="https://github.com/OpenKnots/code-editor"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        >
                          <Icon icon="lucide:github" width={14} />
                          Source
                        </a>
                        <a
                          href="https://github.com/OpenKnots/code-editor/issues"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                        >
                          <Icon icon="lucide:bug" width={14} />
                          Report Bug
                        </a>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-[color-mix(in_srgb,var(--overlay)_76%,transparent)] backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 left-auto flex w-[400px] max-w-[92vw] flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-[var(--shadow-2xl)] backdrop-blur-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {sheetContent}

        <div className="border-b border-[var(--glass-border)] px-4 py-3">
          <div className="inline-flex rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] p-1 shadow-[var(--shadow-xs)]">
            {[
              { id: 'connect' as SettingsTab, label: 'Connect', icon: 'lucide:smartphone' },
              { id: 'general' as SettingsTab, label: 'General', icon: 'lucide:sliders-horizontal' },
            ].map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                      : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon icon={item.icon} width={14} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {tab === 'connect' && (
            <div className="space-y-5">
              <MobileConnect />
              <SessionPresence />

              <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <Icon icon="lucide:activity" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Gateway</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Connection state for the local app bridge.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-secondary)]">Status</span>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium ${
                        status === 'connected'
                          ? 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]'
                          : status === 'connecting'
                            ? 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]'
                            : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {status === 'connected'
                        ? 'Connected'
                        : status === 'connecting'
                          ? 'Connecting'
                          : 'Disconnected'}
                    </span>
                  </div>

                  {gatewayUrl && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="pt-0.5 text-[var(--text-secondary)]">Gateway</span>
                      <code className="max-w-[220px] truncate rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-primary)]">
                        {gatewayUrl}
                      </code>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === 'general' && (
            <div className="space-y-5">
              <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <Icon icon="lucide:sparkles" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Appearance</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Switch themes and shell tone instantly.
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-[20px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] p-1.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    {APPEARANCE_MODES.map((appearanceMode) => {
                      const active = mode === appearanceMode.id
                      return (
                        <button
                          key={appearanceMode.id}
                          type="button"
                          onClick={() => setMode(appearanceMode.id)}
                          className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition ${
                            active
                              ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                              : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon icon={appearanceMode.icon} width={14} />
                          {appearanceMode.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  {themeGroups.map(({ group, label, themes }) => (
                    <div key={group} className="space-y-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                        {label}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {themes.map((preset) => {
                          const active = themeId === preset.id
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setThemeId(preset.id)}
                              className={`group relative overflow-hidden rounded-[20px] border px-3 py-3 text-left transition ${
                                active
                                  ? 'border-[color-mix(in_srgb,var(--brand)_45%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,var(--bg-elevated))] shadow-[var(--shadow-md)]'
                                  : 'border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,var(--bg-elevated))] hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-elevated))]'
                              }`}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <span
                                  className="h-9 w-9 rounded-[14px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                                  style={{ backgroundColor: preset.color }}
                                />
                                {active ? (
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]">
                                    <Icon icon="lucide:check" width={14} />
                                  </span>
                                ) : (
                                  <Icon
                                    icon="lucide:chevron-right"
                                    width={14}
                                    className="text-[var(--text-disabled)] transition group-hover:translate-x-0.5"
                                  />
                                )}
                              </div>
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {preset.label}
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                {preset.id === 'supreme'
                                  ? 'Metallic accents and luxury shell chrome.'
                                  : preset.group === 'core'
                                    ? 'Native palette tuned for the editor shell.'
                                    : 'Imported palette with custom texture and tone.'}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <Icon icon="lucide:cpu" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">System</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Device-level behavior and power settings.
                    </p>
                  </div>
                </div>
                <CaffeinateToggle />
              </section>

              <section className="rounded-[24px] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <Icon icon="lucide:chevron-left-dot" width={20} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Knot Code
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      AI-native code editor by OpenKnot.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <a
                    href="https://github.com/OpenKnots/code-editor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                  >
                    <Icon icon="lucide:github" width={14} />
                    Source
                  </a>
                  <a
                    href="https://github.com/OpenKnots/code-editor/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-hover)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]"
                  >
                    <Icon icon="lucide:bug" width={14} />
                    Report Bug
                  </a>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
