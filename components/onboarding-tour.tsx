'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'

export const ONBOARDING_KEY = 'ce:onboarding:v1'

export function isOnboardingComplete(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === 'done' } catch { return false }
}

export function markOnboardingComplete() {
  try { localStorage.setItem(ONBOARDING_KEY, 'done') } catch {}
}

export function OnboardingTour({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const steps = useMemo(() => ([
    {
      title: 'Welcome to Knot Code',
      body: 'This quick tour covers the layout, keyboard shortcuts, and how to move fast without the mouse.',
      icon: 'lucide:sparkles',
    },
    {
      title: 'Keyboard-first navigation',
      body: 'Use ⌘P to open files, ⌘⇧P for the command palette, and ⌘⌥1–4 to jump focus (Files / Editor / Chat / Terminal).',
      icon: 'lucide:keyboard',
    },
    {
      title: 'Panels & layout',
      body: 'Toggle Explorer with ⌘B, Chat with ⌘I, Terminal with ⌘J (or ⌘`). On smaller screens, panels open as drawers to avoid clipping.',
      icon: 'lucide:layout-panel-left',
    },
    {
      title: 'Detachable panels',
      body: 'Chat and Terminal can float. Use the panel button (window icon) to detach, then drag/resize and pin to dock again.',
      icon: 'lucide:app-window',
    },
  ]), [])

  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setIdx(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'ArrowRight') setIdx(v => Math.min(steps.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setIdx(v => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, steps.length])

  if (!open) return null

  const s = steps[idx]!
  const isLast = idx === steps.length - 1

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-[min(560px,92vw)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] flex items-center justify-center shrink-0">
              <Icon icon={s.icon} width={16} height={16} className="text-[var(--brand)]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{s.title}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Step {idx + 1} of {steps.length}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer" title="Close">
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{s.body}</p>
        </div>

        <div className="px-5 py-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <button
            onClick={() => { markOnboardingComplete(); onClose() }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIdx(v => Math.max(0, v - 1))}
              disabled={idx === 0}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (isLast) {
                  markOnboardingComplete()
                  onClose()
                } else {
                  setIdx(v => Math.min(steps.length - 1, v + 1))
                }
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast, #fff)' }}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

