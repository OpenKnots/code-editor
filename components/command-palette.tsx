'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useView, type ViewId } from '@/context/view-context'
import { isTauri } from '@/lib/tauri'

type CommandId =
  | 'find-files'
  | 'save-file'
  | 'format-document'
  | 'find-in-file'
  | 'replace-in-file'
  | 'toggle-case-sensitive'
  | 'toggle-whole-word'
  | 'toggle-regex'
  // Layout toggles
  | 'toggle-files'
  | 'toggle-terminal'
  | 'toggle-chat'
  | 'toggle-plugins'
  | 'collapse-editor'
  // Layout presets
  | 'layout-focus'
  | 'layout-review'
  // Navigation
  | 'view-editor'
  | 'view-preview'
  | 'view-git'
  | 'view-skills'
  | 'view-settings'
  | 'open-onboarding'
  // Git operations
  | 'git-commit'
  | 'git-push'
  | 'git-pull'
  | 'git-stash'
  // PR operations

  // Preview operations
  | 'preview-refresh'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onRun: (commandId: CommandId) => void
}

interface CommandItem {
  id: CommandId
  label: string
  hint: string
  keywords: string[]
  icon: string
  shortcut?: string
  group: 'search' | 'layout' | 'preset' | 'navigate' | 'git' | 'pr' | 'preview'
}

const COMMANDS: CommandItem[] = [
  // Search / Editor
  {
    id: 'find-files',
    label: 'Find files',
    hint: 'Open quick file search',
    keywords: ['file', 'quick', 'open'],
    icon: 'lucide:file-search',
    shortcut: '\u2318P',
    group: 'search',
  },
  {
    id: 'save-file',
    label: 'Save file',
    hint: 'Save the active file',
    keywords: ['save', 'write', 'file'],
    icon: 'lucide:save',
    shortcut: '\u2318S',
    group: 'search',
  },
  {
    id: 'format-document',
    label: 'Format document',
    hint: 'Run formatter in active editor',
    keywords: ['format', 'prettier', 'beautify'],
    icon: 'lucide:wand-2',
    group: 'search',
  },
  {
    id: 'find-in-file',
    label: 'Find in file',
    hint: 'Open editor search',
    keywords: ['find', 'search', 'match'],
    icon: 'lucide:search',
    shortcut: '\u2318F',
    group: 'search',
  },
  {
    id: 'replace-in-file',
    label: 'Search and replace',
    hint: 'Open replace widget',
    keywords: ['replace', 'search', 'find'],
    icon: 'lucide:replace',
    shortcut: '\u2318H',
    group: 'search',
  },
  {
    id: 'toggle-case-sensitive',
    label: 'Toggle case matching',
    hint: 'Enable/disable case sensitive search',
    keywords: ['case', 'sensitive', 'match'],
    icon: 'lucide:case-sensitive',
    group: 'search',
  },
  {
    id: 'toggle-whole-word',
    label: 'Toggle whole word',
    hint: 'Match whole words only',
    keywords: ['whole', 'word', 'search'],
    icon: 'lucide:whole-word',
    group: 'search',
  },
  {
    id: 'toggle-regex',
    label: 'Toggle regex mode',
    hint: 'Use regular expression search',
    keywords: ['regex', 'pattern', 'search'],
    icon: 'lucide:regex',
    group: 'search',
  },

  // Layout toggles
  {
    id: 'toggle-files',
    label: 'Toggle file explorer',
    hint: 'Show or hide the file tree',
    keywords: ['files', 'tree', 'explorer', 'sidebar'],
    icon: 'lucide:folder',
    shortcut: '\u2318B',
    group: 'layout',
  },
  {
    id: 'toggle-terminal',
    label: 'Toggle terminal',
    hint: 'Show or hide the terminal panel',
    keywords: ['terminal', 'shell', 'console'],
    icon: 'lucide:terminal',
    shortcut: '\u2318J',
    group: 'layout',
  },
  {
    id: 'toggle-chat',
    label: 'Toggle agent chat',
    hint: 'Show or hide the AI agent panel',
    keywords: ['chat', 'agent', 'ai', 'assistant'],
    icon: 'lucide:message-square',
    shortcut: '\u2318I',
    group: 'layout',
  },
  {
    id: 'toggle-plugins',
    label: 'Toggle plugins sidebar',
    hint: 'Show or hide plugin widgets',
    keywords: ['plugins', 'spotify', 'youtube', 'widgets'],
    icon: 'lucide:puzzle',
    group: 'layout',
  },
  {
    id: 'collapse-editor',
    label: 'Collapse editor',
    hint: 'Minimize editor to icon rail',
    keywords: ['collapse', 'minimize', 'hide', 'editor'],
    icon: 'lucide:minimize-2',
    shortcut: '\u2318E',
    group: 'layout',
  },

  // Layout presets
  {
    id: 'layout-focus',
    label: 'Layout: Focus',
    hint: 'Editor only \u2014 no panels, pure code',
    keywords: ['focus', 'zen', 'clean', 'minimal', 'distraction'],
    icon: 'lucide:maximize-2',
    group: 'preset',
  },
  {
    id: 'layout-review',
    label: 'Layout: Review',
    hint: 'Files + editor + chat for code review',
    keywords: ['review', 'browse', 'explore', 'full'],
    icon: 'lucide:columns-3',
    group: 'preset',
  },

  // Navigation
  {
    id: 'view-editor',
    label: 'Go to Editor',
    hint: 'Switch to the editor view',
    keywords: ['editor', 'code', 'edit'],
    icon: 'lucide:code-2',
    group: 'navigate',
  },
  {
    id: 'view-preview',
    label: 'Go to Preview',
    hint: 'Switch to the preview view',
    keywords: ['preview', 'browser', 'live'],
    icon: 'lucide:eye',
    group: 'navigate',
  },

  {
    id: 'view-git',
    label: 'Go to Source Control',
    hint: 'Switch to the git view',
    keywords: ['git', 'source', 'control', 'diff'],
    icon: 'lucide:git-branch',
    group: 'navigate',
  },
  {
    id: 'view-skills',
    label: 'Go to Skills',
    hint: 'Open the curated skills catalog',
    keywords: ['skills', 'catalog', 'workflow', 'agents'],
    icon: 'lucide:sparkles',
    group: 'navigate',
  },

  {
    id: 'view-settings',
    label: 'Go to Settings',
    hint: 'Open settings panel',
    keywords: ['settings', 'preferences', 'config'],
    icon: 'lucide:settings',
    group: 'navigate',
  },
  {
    id: 'open-onboarding',
    label: 'Onboarding: Show tour',
    hint: 'Reopen the first-run tour',
    keywords: ['onboarding', 'tour', 'help', 'shortcuts'],
    icon: 'lucide:sparkles',
    group: 'navigate',
  },

  // Git operations
  {
    id: 'git-commit',
    label: 'Git: Commit',
    hint: 'Open source control to commit changes',
    keywords: ['git', 'commit', 'save', 'changes'],
    icon: 'lucide:git-commit-horizontal',
    group: 'git',
  },
  {
    id: 'git-push',
    label: 'Git: Push',
    hint: 'Push commits to remote',
    keywords: ['git', 'push', 'upload', 'remote'],
    icon: 'lucide:upload',
    group: 'git',
  },
  {
    id: 'git-pull',
    label: 'Git: Pull',
    hint: 'Pull latest changes from remote',
    keywords: ['git', 'pull', 'fetch', 'download'],
    icon: 'lucide:download',
    group: 'git',
  },
  {
    id: 'git-stash',
    label: 'Git: Stash changes',
    hint: 'Stash uncommitted changes',
    keywords: ['git', 'stash', 'save', 'temp'],
    icon: 'lucide:archive',
    group: 'git',
  },

  // PR operations

  // Preview operations
  {
    id: 'preview-refresh',
    label: 'Preview: Refresh',
    hint: 'Reload the preview panel',
    keywords: ['preview', 'refresh', 'reload', 'browser'],
    icon: 'lucide:refresh-cw',
    group: 'preview',
  },
]

const COMMANDS_MAP = new Map(COMMANDS.map((c) => [c.id, c]))

const GROUP_ORDER: Record<string, number> = {
  recent: -1,
  context: 0,
  preset: 1,
  layout: 2,
  navigate: 3,
  search: 4,
  git: 5,
  pr: 6,
  preview: 7,
}
const GROUP_LABELS: Record<string, string> = {
  recent: 'Recently Used',
  context: 'Suggested',
  preset: 'Layout Presets',
  layout: 'Toggle Panels',
  navigate: 'Navigation',
  search: 'Editor',
  git: 'Source Control',
  pr: 'Pull Requests',
  preview: 'Preview',
}

// Context-specific command priorities per view
const VIEW_CONTEXT_COMMANDS: Partial<Record<ViewId, CommandId[]>> = {
  editor: [
    'save-file',
    'find-files',
    'format-document',
    'find-in-file',
    'toggle-files',
    'toggle-chat',
    'toggle-terminal',
  ],
  git: ['git-commit', 'git-push', 'git-pull', 'git-stash', 'toggle-terminal'],
  skills: ['view-skills', 'view-editor', 'view-git'],

  preview: ['preview-refresh', 'view-editor'],
}

const RECENT_KEY = 'ce:recent-commands'
const MAX_RECENT = 5

function loadRecent(): CommandId[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}
function saveRecent(ids: CommandId[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
  } catch {}
}

export function CommandPalette({ open, onClose, onRun }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<CommandId[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

  const { activeView } = useView()

  // Load recent commands on mount
  useEffect(() => {
    setRecentIds(loadRecent())
  }, [])

  const available = useMemo(() => {
    return COMMANDS.filter((c) => {
      if (!isDesktop && c.id === 'toggle-terminal') return false
      if (activeView === 'editor' && c.id === 'collapse-editor') return false
      return true
    })
  }, [isDesktop, activeView])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((command) => {
      if (command.label.toLowerCase().includes(q)) return true
      if (command.hint.toLowerCase().includes(q)) return true
      return command.keywords.some((k) => k.includes(q))
    })
  }, [query, available])

  // Build display groups: recently used + context-aware + standard groups
  const displayGroups = useMemo(() => {
    const groups: { key: string; label: string; items: CommandItem[] }[] = []
    const usedIds = new Set<CommandId>()

    const isSearching = query.trim().length > 0

    // When not searching, show recent + context sections
    if (!isSearching) {
      // Recently used
      const recentItems = recentIds
        .map((id) => COMMANDS_MAP.get(id))
        .filter((c): c is CommandItem => !!c && filtered.includes(c))
      if (recentItems.length > 0) {
        groups.push({ key: 'recent', label: GROUP_LABELS.recent, items: recentItems })
        recentItems.forEach((c) => usedIds.add(c.id))
      }

      // Context-specific suggestions
      const contextIds = VIEW_CONTEXT_COMMANDS[activeView]
      if (contextIds) {
        const contextItems = contextIds
          .map((id) => COMMANDS_MAP.get(id))
          .filter((c): c is CommandItem => !!c && !usedIds.has(c.id))
        if (contextItems.length > 0) {
          groups.push({
            key: 'context',
            label: `${GROUP_LABELS.context} \u2014 ${activeView.charAt(0).toUpperCase() + activeView.slice(1)}`,
            items: contextItems,
          })
          contextItems.forEach((c) => usedIds.add(c.id))
        }
      }
    }

    // Remaining commands grouped by their standard group
    const remaining = filtered.filter((c) => !usedIds.has(c.id))
    const groupMap = new Map<string, CommandItem[]>()
    for (const cmd of remaining) {
      const list = groupMap.get(cmd.group) || []
      list.push(cmd)
      groupMap.set(cmd.group, list)
    }
    const sortedGroups = [...groupMap.entries()].sort(
      (a, b) => (GROUP_ORDER[a[0]] ?? 99) - (GROUP_ORDER[b[0]] ?? 99),
    )
    for (const [group, items] of sortedGroups) {
      groups.push({ key: group, label: GROUP_LABELS[group] ?? group, items })
    }

    return groups
  }, [filtered, query, recentIds, activeView])

  // Flat list for keyboard nav
  const flatList = useMemo(() => displayGroups.flatMap((g) => g.items), [displayGroups])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setRecentIds(loadRecent())
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  useEffect(() => {
    if (!open) return
    const selected = listRef.current?.querySelector('[data-selected="true"]') as
      | HTMLElement
      | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const run = (cmd: CommandItem) => {
    // Update recent commands
    const updated = [cmd.id, ...recentIds.filter((id) => id !== cmd.id)].slice(0, MAX_RECENT)
    setRecentIds(updated)
    saveRecent(updated)

    onRun(cmd.id)
    onClose()
  }

  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Icon icon="lucide:command" width={16} height={16} className="text-[var(--brand)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((i) => Math.min(i + 1, Math.max(flatList.length - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = flatList[selectedIndex]
                if (cmd) run(cmd)
              }
            }}
            placeholder="Run a command..."
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {flatList.length === 0 && (
            <div className="px-3 py-5 text-center text-[12px] text-[var(--text-tertiary)]">
              No matching commands
            </div>
          )}
          {displayGroups.map(({ key, label, items }) => (
            <div key={key}>
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                  {label}
                </span>
                <div className="flex-1 h-px bg-[var(--border)] opacity-50" />
              </div>
              {items.map((command) => {
                const idx = flatIndex++
                const isSelected = idx === selectedIndex
                return (
                  <button
                    key={`${key}-${command.id}`}
                    data-selected={isSelected}
                    onClick={() => run(command)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all duration-100 cursor-pointer',
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                        : 'hover:bg-[var(--bg-subtle)]',
                    )}
                  >
                    <div
                      className={cn(
                        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                        isSelected
                          ? 'bg-[color-mix(in_srgb,var(--brand)_18%,transparent)] text-[var(--brand)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]',
                      )}
                    >
                      <Icon icon={command.icon} width={14} height={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-[13px] truncate',
                          isSelected
                            ? 'text-[var(--text-primary)] font-medium'
                            : 'text-[var(--text-primary)]',
                        )}
                      >
                        {command.label}
                      </p>
                      <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                        {command.hint}
                      </p>
                    </div>
                    {command.shortcut && (
                      <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-disabled)] shrink-0">
                        {command.shortcut}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { CommandId }
