'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { repo } = useRepo()
  const local = useLocal()

  const hasRepo = !!(repo?.fullName || local.rootPath)
  const repoName = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    onSend(text, mode)
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-[600px]">
        {/* Brand + prompt */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_20%,var(--bg-elevated))] to-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Icon icon="lucide:code" width={24} height={24} className="text-[var(--brand)]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-tight mb-1">
            What do you want to build?
          </h1>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Describe your goal and the agent will plan and code it for you
          </p>
        </div>

        {/* Input area */}
        <div className="relative mb-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Plan, @ for context, / for commands..."
            rows={3}
            className="w-full resize-none rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3 pr-12 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_50%,var(--border))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_8%,transparent)] transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className={`absolute right-3 bottom-3 p-2 rounded-lg transition-all cursor-pointer ${
              input.trim()
                ? 'bg-[var(--brand)] text-white hover:opacity-90 shadow-sm'
                : 'text-[var(--text-disabled)] cursor-not-allowed'
            }`}
          >
            <Icon icon="lucide:arrow-up" width={14} height={14} />
          </button>
        </div>

        {/* Mode + Model bar */}
        <div className="flex items-center justify-between mb-6">
          <ModeSelector mode={mode} onChange={setMode} />
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-disabled)]">
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[9px] font-mono">@</kbd>
            <span>context</span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[9px] font-mono">/</kbd>
            <span>commands</span>
          </div>
        </div>

        {/* Repo context or selection */}
        {hasRepo ? (
          <div className="flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
            <Icon icon="lucide:git-branch" width={13} height={13} className="text-[var(--text-tertiary)]" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{repoName}</span>
            {branchName && (
              <>
                <span className="text-[var(--text-disabled)]">·</span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{branchName}</span>
              </>
            )}
            <button
              onClick={onSelectFolder}
              className="ml-auto text-[9px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 px-4 rounded-xl bg-[var(--bg-secondary)] border border-dashed border-[var(--border)]">
            <Icon icon="lucide:folder-git-2" width={28} height={28} className="text-[var(--text-disabled)]" />
            <p className="text-[11px] text-[var(--text-tertiary)]">Select a repository to get started</p>
            <div className="flex items-center gap-2">
              <button
                onClick={onSelectFolder}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--brand)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Icon icon="lucide:folder-open" width={12} height={12} />
                Select folder
              </button>
              <button
                onClick={onCloneRepo}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg)] border border-[var(--border)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:git-branch" width={12} height={12} />
                Clone from GitHub
              </button>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-4 mt-6">
          {[
            { icon: 'lucide:file-plus', label: 'New File', event: 'file-select', detail: { path: 'untitled', sha: '' } },
            { icon: 'lucide:search', label: 'Search', event: 'keydown-search' },
            { icon: 'lucide:terminal', label: 'Terminal', event: 'keydown-terminal' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => {
                if (item.event === 'keydown-search') {
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true }))
                } else if (item.event === 'keydown-terminal') {
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', metaKey: true }))
                } else {
                  window.dispatchEvent(new CustomEvent(item.event, { detail: item.detail }))
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon icon={item.icon} width={12} height={12} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
