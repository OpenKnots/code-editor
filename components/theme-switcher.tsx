'use client'

import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useTheme, THEME_PRESETS, type ThemeMode } from '@/context/theme-context'
import dynamic from 'next/dynamic'
const ThemeStudio = dynamic(() => import('@/components/theme-studio').then(m => m.ThemeStudio), { ssr: false })

const MODES: { id: ThemeMode; icon: string; label: string }[] = [
  { id: 'light', icon: 'lucide:sun', label: 'Light' },
  { id: 'dark', icon: 'lucide:moon', label: 'Dark' },
  { id: 'system', icon: 'lucide:monitor', label: 'System' },
]

export function ThemeSwitcher() {
  const { themeId, mode, setThemeId, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const originalThemeRef = useRef<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (previewId && originalThemeRef.current && previewId !== originalThemeRef.current) {
          setThemeId(originalThemeRef.current)
        }
        setPreviewId(null)
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [previewId, setThemeId])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) {
            originalThemeRef.current = themeId
            setPreviewId(null)
          } else {
            if (previewId && originalThemeRef.current && previewId !== originalThemeRef.current) {
              setThemeId(originalThemeRef.current)
            }
            setPreviewId(null)
          }
          setOpen(!open)
        }}
        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        title="Theme & mode"
      >
        <Icon icon="lucide:palette" width={15} height={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl z-50 py-1 animate-fade-in-up">
          {/* Mode selector */}
          <div className="px-2.5 pt-1.5 pb-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Mode</span>
          </div>
          <div className="flex gap-0.5 mx-2 mb-1.5 p-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  mode === m.id
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
                title={m.label}
              >
                <Icon icon={m.icon} width={12} height={12} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <div className="h-px bg-[var(--border)] mx-2 my-1" />

          {/* Theme selector */}
          {(['core', 'tweakcn'] as const).map(group => (
            <div key={group}>
              <div className="px-2.5 pt-1.5 pb-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {group === 'core' ? 'Themes' : 'tweakcn'}
                </span>
              </div>
              {THEME_PRESETS.filter(t => t.group === group).map(t => {
                const isActive = themeId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => { setPreviewId(t.id); setThemeId(t.id) }}
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-[var(--border)]"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-[12px]">{t.label}</span>
                    {isActive && (
                      <Icon icon="lucide:check" width={12} height={12} className="ml-auto text-[var(--brand)]" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          <div className="h-px bg-[var(--border)] mx-2 my-1" />

          {/* Apply + Theme Studio */}
          <div className="px-2 py-1.5 flex gap-1.5">
            <button
              onClick={() => {
                originalThemeRef.current = themeId
                setPreviewId(null)
                setOpen(false)
              }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-medium bg-[var(--brand)] text-white hover:opacity-90 transition-all cursor-pointer"
            >
              <Icon icon="lucide:check" width={12} height={12} />
              Apply
            </button>
            <button
              onClick={() => {
                originalThemeRef.current = themeId
                setPreviewId(null)
                setOpen(false)
                setStudioOpen(true)
              }}
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              title="Theme Studio"
            >
              <Icon icon="lucide:wand-sparkles" width={12} height={12} />
            </button>
          </div>
        </div>
      )}

      <ThemeStudio open={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  )
}
