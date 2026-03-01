'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'

interface VimCheatsheetProps {
  open: boolean
  onClose: () => void
}

const sections = [
  {
    title: 'Movement',
    icon: 'lucide:move',
    keys: [
      ['h j k l', 'Left, Down, Up, Right'],
      ['w / b', 'Next / previous word'],
      ['e', 'End of word'],
      ['0 / $', 'Start / end of line'],
      ['^ ', 'First non-blank character'],
      ['gg / G', 'Top / bottom of file'],
      ['{ / }', 'Previous / next paragraph'],
      ['Ctrl+d / Ctrl+u', 'Half-page down / up'],
      ['% ', 'Jump to matching bracket'],
      [':n', 'Go to line n'],
    ],
  },
  {
    title: 'Editing',
    icon: 'lucide:pencil',
    keys: [
      ['i / a', 'Insert before / after cursor'],
      ['I / A', 'Insert at start / end of line'],
      ['o / O', 'New line below / above'],
      ['r', 'Replace single character'],
      ['R', 'Replace mode (overtype)'],
      ['s', 'Delete char + insert'],
      ['S / cc', 'Delete line + insert'],
      ['C', 'Delete to end of line + insert'],
      ['J', 'Join line below'],
      ['u / Ctrl+r', 'Undo / redo'],
    ],
  },
  {
    title: 'Cut, Copy, Paste',
    icon: 'lucide:clipboard',
    keys: [
      ['x / X', 'Delete char forward / backward'],
      ['dd', 'Delete (cut) line'],
      ['dw', 'Delete word'],
      ['d$ / D', 'Delete to end of line'],
      ['yy', 'Yank (copy) line'],
      ['yw', 'Yank word'],
      ['p / P', 'Paste after / before cursor'],
      ['"ay', 'Yank into register a'],
      ['"ap', 'Paste from register a'],
    ],
  },
  {
    title: 'Visual Mode',
    icon: 'lucide:text-select',
    keys: [
      ['v', 'Visual (character select)'],
      ['V', 'Visual line select'],
      ['Ctrl+v', 'Visual block select'],
      ['>', 'Indent selection'],
      ['<', 'Unindent selection'],
      ['y', 'Yank selection'],
      ['d', 'Delete selection'],
      ['~', 'Toggle case'],
      ['gq', 'Reflow / wrap text'],
    ],
  },
  {
    title: 'Search & Replace',
    icon: 'lucide:search',
    keys: [
      ['/pattern', 'Search forward'],
      ['?pattern', 'Search backward'],
      ['n / N', 'Next / previous match'],
      ['*', 'Search word under cursor'],
      [':s/a/b/', 'Replace first on line'],
      [':s/a/b/g', 'Replace all on line'],
      [':%s/a/b/g', 'Replace all in file'],
      [':%s/a/b/gc', 'Replace all (confirm each)'],
    ],
  },
  {
    title: 'Text Objects',
    icon: 'lucide:box',
    keys: [
      ['ciw', 'Change inner word'],
      ['ci"', 'Change inside quotes'],
      ['ci(', 'Change inside parentheses'],
      ['ci{', 'Change inside braces'],
      ['cit', 'Change inside HTML tag'],
      ['diw', 'Delete inner word'],
      ['da"', 'Delete around quotes'],
      ['vi(', 'Select inside parentheses'],
      ['vat', 'Select around HTML tag'],
    ],
  },
  {
    title: 'Commands',
    icon: 'lucide:terminal',
    keys: [
      [':w', 'Save file'],
      [':q', 'Quit'],
      [':wq', 'Save and quit'],
      [':q!', 'Quit without saving'],
      ['.', 'Repeat last command'],
      ['@:', 'Repeat last ex command'],
      [':', 'Enter command mode'],
    ],
  },
  {
    title: 'Marks & Jumps',
    icon: 'lucide:bookmark',
    keys: [
      ['ma', 'Set mark a'],
      ["'a", 'Jump to mark a (line)'],
      ['`a', 'Jump to mark a (exact)'],
      ["''", 'Jump to last position'],
      ['Ctrl+o', 'Jump back'],
      ['Ctrl+i', 'Jump forward'],
    ],
  },
]

export function VimCheatsheet({ open, onClose }: VimCheatsheetProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  const q = search.toLowerCase()
  const filtered = sections
    .map(s => ({
      ...s,
      keys: s.keys.filter(
        ([key, desc]) => key.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
      ),
    }))
    .filter(s => s.keys.length > 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-[1080px] max-h-[96vh] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center gap-2 p-2.5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)]">
              VIM
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Cheatsheet</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter..."
            autoFocus
            className="w-40 px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--brand)] transition-colors"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={16} height={16} />
          </button>
        </div>

        {/* Content — 2 column grid */}
        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(section => (
              <div
                key={section.title}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden"
              >
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                  <Icon icon={section.icon} width={13} height={13} className="text-[var(--brand)]" />
                  <span className="text-[11px] font-semibold text-[var(--text-primary)]">{section.title}</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {section.keys.map(([key, desc]) => (
                    <div key={key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <code className="text-[10px] font-mono font-medium text-[var(--brand)] whitespace-nowrap">
                        {key}
                      </code>
                      <span className="text-[10px] text-[var(--text-secondary)] text-right">
                        {desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
              No matches for &ldquo;{search}&rdquo;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {filtered.reduce((sum, s) => sum + s.keys.length, 0)} commands shown
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            Press <kbd className="px-1 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[9px] font-mono">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  )
}
