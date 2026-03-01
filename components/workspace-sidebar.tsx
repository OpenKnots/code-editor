'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

export interface ChatSession {
  id: string
  title: string
  preview: string
  timestamp: number
  fileCount?: number
  additions?: number
  deletions?: number
  pinned?: boolean
  mode?: 'plan' | 'agent' | 'code'
}

const LS_KEY = 'code-editor:chat-sessions'

function loadSessions(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}
function saveSessions(s: ChatSession[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

interface Props {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  collapsed?: boolean
  onToggle?: () => void
}

export function WorkspaceSidebar({ activeId, onSelect, onNew, collapsed, onToggle }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [searchWS, setSearchWS] = useState('')
  const [searchChat, setSearchChat] = useState('')

  useEffect(() => { setSessions(loadSessions()) }, [])

  // Listen for session updates from agent panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ChatSession
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === detail.id)
        const next = idx >= 0 ? [...prev.slice(0, idx), { ...prev[idx], ...detail }, ...prev.slice(idx + 1)] : [detail, ...prev]
        saveSessions(next)
        return next
      })
    }
    window.addEventListener('chat-session-update', handler)
    return () => window.removeEventListener('chat-session-update', handler)
  }, [])

  const pinned = sessions.filter(s => s.pinned)
  const recent = sessions.filter(s => !s.pinned)
  const filteredRecent = searchChat
    ? recent.filter(s => s.title.toLowerCase().includes(searchChat.toLowerCase()))
    : recent

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      saveSessions(next)
      return next
    })
  }, [])

  const handlePin = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => {
      const next = prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s)
      saveSessions(next)
      return next
    })
  }, [])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-3 w-[42px] bg-[var(--sidebar-bg)] border-r border-[var(--border)] shrink-0">
        <button onClick={onToggle} className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Expand sidebar">
          <Icon icon="lucide:panel-left" width={15} height={15} />
        </button>
        <button onClick={onNew} className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="New Chat">
          <Icon icon="lucide:plus" width={15} height={15} />
        </button>
      </div>
    )
  }

  const modeIcon = (mode?: string) => {
    if (mode === 'plan') return 'lucide:list-checks'
    if (mode === 'agent') return 'lucide:infinity'
    return 'lucide:message-square'
  }

  const renderSession = (s: ChatSession) => (
    <button
      key={s.id}
      onClick={() => onSelect(s.id)}
      className={`group w-full text-left px-2.5 py-2 rounded-lg transition-all cursor-pointer ${
        activeId === s.id
          ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)]'
          : 'hover:bg-[var(--bg-subtle)] border border-transparent'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon icon={modeIcon(s.mode)} width={11} height={11} className={activeId === s.id ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'} />
        <span className="text-[11px] font-medium text-[var(--text-primary)] truncate flex-1">{s.title}</span>
        <span className="text-[9px] text-[var(--text-disabled)] shrink-0">{timeAgo(s.timestamp)}</span>
      </div>
      {(s.fileCount || s.additions || s.deletions) && (
        <div className="flex items-center gap-1.5 ml-[17px] mt-0.5">
          {s.fileCount && <span className="text-[9px] text-[var(--text-disabled)]">{s.fileCount} file{s.fileCount !== 1 ? 's' : ''}</span>}
          {s.additions ? <span className="text-[9px] text-[var(--color-additions)] font-mono">+{s.additions}</span> : null}
          {s.deletions ? <span className="text-[9px] text-[var(--color-deletions)] font-mono">-{s.deletions}</span> : null}
        </div>
      )}
      {/* Hover actions */}
      <div className="absolute right-1.5 top-1.5 hidden group-hover:flex items-center gap-0.5">
        <button onClick={(e) => handlePin(s.id, e)} className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer">
          <Icon icon={s.pinned ? 'lucide:pin-off' : 'lucide:pin'} width={9} height={9} />
        </button>
        <button onClick={(e) => handleDelete(s.id, e)} className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer">
          <Icon icon="lucide:trash-2" width={9} height={9} />
        </button>
      </div>
    </button>
  )

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border)] overflow-hidden" style={{ width: 240 }}>
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggle} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer">
            <Icon icon="lucide:panel-left" width={13} height={13} />
          </button>
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Chats</span>
        </div>
        <button onClick={onNew} className="p-1 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="New Chat">
          <Icon icon="lucide:plus" width={13} height={13} />
        </button>
      </div>

      {/* Search */}
      <div className="px-2.5 py-2">
        <div className="relative">
          <Icon icon="lucide:search" width={11} height={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
          <input
            type="text"
            value={searchChat}
            onChange={e => setSearchChat(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-7 pr-2 py-1 text-[10px] rounded-md bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] transition-colors"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {/* New chat button */}
        <button
          onClick={onNew}
          className="w-full flex items-center gap-1.5 px-2.5 py-2 mb-1 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--brand)] text-[var(--text-tertiary)] hover:text-[var(--brand)] transition-colors cursor-pointer"
        >
          <Icon icon="lucide:plus" width={11} height={11} />
          <span className="text-[10px] font-medium">New Chat</span>
        </button>

        {/* Pinned */}
        {pinned.length > 0 && (
          <>
            <div className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] px-2.5 pt-3 pb-1">Pinned</div>
            <div className="flex flex-col gap-0.5">
              {pinned.map(renderSession)}
            </div>
          </>
        )}

        {/* Recent */}
        <div className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] px-2.5 pt-3 pb-1">Recent</div>
        <div className="flex flex-col gap-0.5">
          {filteredRecent.length > 0
            ? filteredRecent.map(renderSession)
            : (
              <div className="px-2.5 py-6 text-center">
                <Icon icon="lucide:message-square-plus" width={24} height={24} className="mx-auto mb-2 text-[var(--text-disabled)]" />
                <p className="text-[10px] text-[var(--text-disabled)]">No chats yet</p>
                <p className="text-[9px] text-[var(--text-disabled)] mt-0.5">Start a conversation to begin</p>
              </div>
            )
          }
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1 px-2.5 py-2 border-t border-[var(--border)] shrink-0">
        <button className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Settings">
          <Icon icon="lucide:settings" width={12} height={12} />
        </button>
        <button className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer" title="Help">
          <Icon icon="lucide:circle-help" width={12} height={12} />
        </button>
      </div>
    </div>
  )
}
