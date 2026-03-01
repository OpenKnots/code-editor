'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { KnotLogo } from '@/components/knot-logo'
import type { AgentMode } from '@/components/mode-selector'
import { useRepo } from '@/context/repo-context'
import { useLocal } from '@/context/local-context'
import { useGateway } from '@/context/gateway-context'

const ACTIONS = [
  { icon: 'lucide:pencil', label: 'Edit', prefix: 'Edit ' },
  { icon: 'lucide:bug', label: 'Fix', prefix: 'Fix ' },
  { icon: 'lucide:book-open', label: 'Explain', prefix: 'Explain ' },
  { icon: 'lucide:flask-conical', label: 'Test', prefix: 'Write tests for ' },
  { icon: 'lucide:git-pull-request', label: 'Review', prefix: 'Review ' },
]

interface Props {
  onSend: (text: string, mode: AgentMode) => void
  onSelectFolder: () => void
  onCloneRepo: () => void
}

export function ChatHome({ onSend, onSelectFolder, onCloneRepo }: Props) {
  const [input, setInput] = useState('')
  const [modelName, setModelName] = useState('Opus 4.6')
  const [showModelMenu, setShowModelMenu] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { repo } = useRepo()
  const local = useLocal()
  const { sendRequest, status } = useGateway()
  const isConnected = status === 'connected'

  const repoShort = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!isConnected) return
    sendRequest('sessions.status', {}).then((r: any) => {
      if (r?.model) {
        const s = (r.model as string).split('/').pop()?.replace(/-/g, ' ') ?? r.model
        setModelName(s.length > 20 ? s.slice(0, 18) + '…' : s)
      }
    }).catch(() => {})
  }, [isConnected, sendRequest])

  const handleSubmit = () => {
    const t = input.trim()
    if (!t) return
    onSend(t, 'agent')
    setInput('')
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[560px]">
        {/* Heading */}
        <div className="flex justify-center mb-3">
          <KnotLogo size={36} />
        </div>
        <h1 className="text-center text-[20px] font-semibold text-[var(--text-primary)] tracking-tight mb-3">
          {repoShort ? `What should we work on?` : `What do you want to build?`}
        </h1>

        {/* Input */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden mb-3 focus-within:border-[color-mix(in_srgb,var(--brand)_30%,var(--border))] transition-[border-color]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            placeholder={repoShort ? `Describe a change to ${repoShort}…` : 'Describe what you want to build…'}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <div className="flex items-center gap-0.5">
              <button className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer" title="Attach file">
                <Icon icon="lucide:paperclip" width={14} height={14} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer"
                >
                  {modelName}
                  <Icon icon="lucide:chevron-down" width={8} height={8} />
                </button>
                {showModelMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-1 w-44 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl z-50 py-0.5 overflow-hidden">
                      {['Opus 4.6', 'Sonnet 4.5', 'Haiku 3.5'].map(m => (
                        <button key={m} onClick={() => { setModelName(m); setShowModelMenu(false) }} className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] cursor-pointer ${modelName === m ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                input.trim()
                  ? 'bg-[var(--text-primary)] text-[var(--bg)]'
                  : 'bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-disabled)] cursor-not-allowed'
              }`}
            >
              <Icon icon="lucide:arrow-up" width={14} height={14} />
            </button>
          </div>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => { setInput(a.prefix); inputRef.current?.focus() }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon={a.icon} width={12} height={12} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Repo link */}
        {repoShort && (
          <div className="text-center mt-5">
            <button onClick={onSelectFolder} className="inline-flex items-center gap-1 text-[10px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
              <Icon icon="lucide:folder-git-2" width={10} height={10} />
              {repoShort}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
