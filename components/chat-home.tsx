'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { ModeSelector } from '@/components/mode-selector'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'

const SUGGESTIONS = [
  { emoji: '🎮', text: 'Build a classic Snake game in this repo.' },
  { emoji: '📋', text: 'Create a one-page summary of this project.' },
  { emoji: '🔧', text: 'Find and fix bugs in the codebase.' },
  { emoji: '✨', text: 'Refactor this project for better structure.' },
]

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [modelName, setModelName] = useState('Opus 4.6')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { repo } = useRepo()
  const local = useLocal()
  const { sendRequest, status } = useGateway(); const isConnected = status === 'connected'

  const hasRepo = !!(repo?.fullName || local.rootPath)
  const repoName = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null
  const fullRepoName = repo?.fullName ?? local.rootPath?.split('/').slice(-2).join('/') ?? null
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Fetch current model from gateway
  useEffect(() => {
    if (!isConnected) return
    sendRequest('sessions.status', {}).then((resp: any) => {
      if (resp?.model) {
        const m = resp.model as string
        const short = m.split('/').pop()?.replace(/-/g, ' ') ?? m
        setModelName(short.length > 20 ? short.slice(0, 18) + '...' : short)
      }
    }).catch(() => {})
  }, [isConnected, sendRequest])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    onSend(text, mode)
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-between bg-[var(--bg)] px-6 py-8 min-h-0">
      {/* Top spacer */}
      <div className="flex-1 min-h-[60px]" />

      {/* Center content */}
      <div className="w-full max-w-[680px] flex flex-col items-center">
        {/* Header — Codex style: "Let's build [repo]" or 1Code "What do you want to get done?" */}
        <div className="text-center mb-8">
          {hasRepo ? (
            <>
              <h1 className="text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-1">
                Let&apos;s build
              </h1>
              <button
                onClick={onSelectFolder}
                className="inline-flex items-center gap-1.5 text-[20px] font-medium text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
              >
                {fullRepoName}
                <Icon icon="lucide:chevron-down" width={16} height={16} />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-2">
                What do you want to get done?
              </h1>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Plan, @ for context, / for commands
              </p>
            </>
          )}
        </div>

        {/* Suggestion cards — Codex style */}
        {hasRepo && (
          <div className="flex gap-2.5 mb-6 w-full overflow-x-auto pb-1">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s.text); inputRef.current?.focus() }}
                className="flex-1 min-w-[150px] flex flex-col gap-2 px-3.5 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer text-left group"
              >
                <span className="text-[16px]">{s.emoji}</span>
                <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] leading-snug line-clamp-2">
                  {s.text}
                </span>
              </button>
            ))}
            <button className="shrink-0 flex items-center px-3 text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer">
              Explore more
            </button>
          </div>
        )}

        {/* Input — 1Code style: textarea with embedded controls */}
        <div className="w-full relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            placeholder={hasRepo ? `Ask anything, @ to add files, / for commands` : `Plan, @ for context, / for commands...`}
            rows={2}
            className="w-full resize-none rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] px-4 pt-3 pb-12 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] ring-0 focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--brand)_6%,transparent)] transition-all"
          />

          {/* Bottom bar inside input — 1Code style: mode + model on left, attach + send on right */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Mode selector */}
              <ModeSelector mode={mode} onChange={setMode} />

              {/* Model selector */}
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:sparkles" width={10} height={10} className="text-[var(--brand)]" />
                  {modelName}
                  <Icon icon="lucide:chevron-down" width={8} height={8} />
                </button>
                {showModelMenu && (
                  <div className="absolute bottom-full left-0 mb-1 w-48 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-1">
                    {['Opus 4.6', 'Sonnet 4.5', 'Haiku 3.5'].map(m => (
                      <button key={m} onClick={() => { setModelName(m); setShowModelMenu(false) }} className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[var(--bg-subtle)] cursor-pointer ${modelName === m ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                        <Icon icon="lucide:sparkles" width={9} height={9} className="inline mr-1.5" />{m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Attach */}
              <button className="p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer" title="Attach file">
                <Icon icon="lucide:paperclip" width={13} height={13} />
              </button>
              {/* Send */}
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  input.trim()
                    ? 'bg-[var(--text-primary)] text-[var(--bg)] hover:opacity-90 shadow-sm'
                    : 'text-[var(--text-disabled)] cursor-not-allowed'
                }`}
              >
                <Icon icon="lucide:arrow-up" width={14} height={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar — Codex style: local/permissions/branch */}
      <div className="flex-1 min-h-[40px] max-h-[80px]" />
      <div className="w-full max-w-[680px] flex items-center justify-between text-[10px] text-[var(--text-disabled)]">
        <div className="flex items-center gap-3">
          {hasRepo ? (
            <>
              <button onClick={onSelectFolder} className="flex items-center gap-1 hover:text-[var(--text-tertiary)] cursor-pointer transition-colors">
                <Icon icon="lucide:hard-drive" width={10} height={10} />
                Local
                <Icon icon="lucide:chevron-down" width={8} height={8} />
              </button>
              <button className="flex items-center gap-1 hover:text-[var(--text-tertiary)] cursor-pointer transition-colors">
                <Icon icon="lucide:shield" width={10} height={10} />
                Default permissions
                <Icon icon="lucide:chevron-down" width={8} height={8} />
              </button>
            </>
          ) : (
            <button onClick={onSelectFolder} className="flex items-center gap-1 hover:text-[var(--text-tertiary)] cursor-pointer transition-colors">
              <Icon icon="lucide:folder-open" width={10} height={10} />
              Open a project
            </button>
          )}
        </div>
        {branchName && (
          <button className="flex items-center gap-1 hover:text-[var(--text-tertiary)] cursor-pointer transition-colors">
            <Icon icon="lucide:git-branch" width={10} height={10} />
            {branchName}
            <Icon icon="lucide:chevron-down" width={8} height={8} />
          </button>
        )}
      </div>
    </div>
  )
}
