'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const { repo } = useRepo()
  const local = useLocal()
  const { sendRequest, status } = useGateway()
  const isConnected = status === 'connected'

  const repoShort = repo?.fullName?.split('/').pop() ?? local.rootPath?.split('/').pop() ?? null

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !isFocused) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const card = cardRef.current
      if (!card) return
      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      const rotateX = (0.5 - y) * 6
      const rotateY = (x - 0.5) * 6
      card.style.setProperty('--rx', `${rotateX}deg`)
      card.style.setProperty('--ry', `${rotateY}deg`)
    })
  }, [isFocused])

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return
    cardRef.current.style.setProperty('--rx', '0deg')
    cardRef.current.style.setProperty('--ry', '0deg')
  }, [])

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
      <div className="w-full max-w-[580px]">
        <div className="flex justify-center mb-4">
          <KnotLogo size={40} />
        </div>
        <h1 className="text-center text-[22px] font-semibold text-[var(--text-primary)] tracking-tight mb-4">
          {repoShort ? `What should we work on?` : `What do you want to build?`}
        </h1>

        {/* Input */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={`chat-input-3d rounded-xl border bg-[var(--bg-elevated)] overflow-hidden mb-4 ${
            isFocused ? 'chat-input-3d-active border-[color-mix(in_srgb,var(--brand)_40%,var(--border))]' : 'border-[var(--border)]'
          }`}
          style={{ '--rx': '0deg', '--ry': '0deg' } as React.CSSProperties}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            placeholder={repoShort ? `Describe a change to ${repoShort}…` : 'Describe what you want to build…'}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer" title="Attach file">
                <Icon icon="lucide:paperclip" width={16} height={16} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium text-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] transition-colors cursor-pointer"
                >
                  {modelName}
                  <Icon icon="lucide:chevron-down" width={10} height={10} />
                </button>
                {showModelMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-1 w-48 bg-[var(--bg-subtle)] border border-[var(--border-hover)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] z-50 py-1 overflow-hidden">
                      {['Opus 4.6', 'Sonnet 4.5', 'Haiku 3.5'].map(m => (
                        <button key={m} onClick={() => { setModelName(m); setShowModelMenu(false) }} className={`w-full text-left px-3 h-[32px] text-[12px] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors ${modelName === m ? 'text-[var(--brand)] font-medium' : 'text-[var(--text-primary)]'}`}>
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
              <Icon icon="lucide:arrow-up" width={16} height={16} />
            </button>
          </div>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => { setInput(a.prefix); inputRef.current?.focus() }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[var(--border)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
            >
              <Icon icon={a.icon} width={14} height={14} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Repo link */}
        {repoShort && (
          <div className="text-center mt-5">
            <button onClick={onSelectFolder} className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer">
              <Icon icon="lucide:folder-git-2" width={12} height={12} />
              {repoShort}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
