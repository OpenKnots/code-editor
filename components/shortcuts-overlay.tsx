'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

const SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], desc: 'Command palette' },
      { keys: ['⌘', 'P'], desc: 'Quick file open' },
      { keys: ['⌘', 'B'], desc: 'Toggle file explorer' },
      { keys: ['⌘', 'J'], desc: 'Toggle agent panel' },
      { keys: ['⌘', '`'], desc: 'Toggle terminal' },
      { keys: ['⌘', '⇧', 'E'], desc: 'Toggle Gateway Engine' },
      { keys: ['?'], desc: 'This shortcuts overlay' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: ['⌘', '⇧', 'K'], desc: 'Inline edit at selection' },
      { keys: ['⌘', '⇧', 'V'], desc: 'Cycle markdown edit/preview/split' },
      { keys: ['⌘', 'S'], desc: 'Save (commit) file' },
      { keys: ['⌘', 'Z'], desc: 'Undo' },
      { keys: ['⌘', '⇧', 'Z'], desc: 'Redo' },
    ],
  },
  {
    title: 'Agent',
    shortcuts: [
      { keys: ['/edit'], desc: 'Edit current file' },
      { keys: ['/explain'], desc: 'Explain code' },
      { keys: ['/refactor'], desc: 'Refactor code' },
      { keys: ['/generate'], desc: 'Generate new code' },
      { keys: ['/search'], desc: 'Search repo' },
      { keys: ['/commit'], desc: 'Commit changes' },
      { keys: ['/diff'], desc: 'Show changes' },
    ],
  },
]

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:keyboard" width={16} height={16} className="text-[var(--brand)]" />
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={14} height={14} />
          </button>
        </div>

        {/* Sections */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.shortcuts.map(s => (
                  <div key={s.desc} className="flex items-center justify-between py-1">
                    <span className="text-[12px] text-[var(--text-secondary)]">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                            key.startsWith('/')
                              ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] border-[color-mix(in_srgb,var(--brand)_25%,transparent)] text-[var(--brand)]'
                              : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)]'
                          }`}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
