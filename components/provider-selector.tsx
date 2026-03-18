'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

export type ProviderId = 'gateway' | 'cursor' | 'claude' | 'codex'

interface ProviderOption {
  id: ProviderId
  label: string
  icon: string
  desc: string
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'gateway',
    label: 'Gateway',
    icon: 'lucide:radio-tower',
    desc: 'Route through KnotCode Gateway',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'lucide:mouse-pointer',
    desc: 'Use Cursor Agent backend',
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: 'lucide:brain',
    desc: 'Direct Anthropic Claude API',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    icon: 'lucide:terminal',
    desc: 'OpenAI Codex CLI agent',
  },
]

const STORAGE_KEY = 'code-editor:agent-provider'

function isValidProvider(v: string | null): v is ProviderId {
  return v === 'gateway' || v === 'cursor' || v === 'claude' || v === 'codex'
}

function loadProvider(): ProviderId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isValidProvider(v)) return v
  } catch {}
  return 'gateway'
}

interface Props {
  size?: 'sm' | 'md'
}

export function ProviderSelector({ size = 'sm' }: Props) {
  const [provider, setProvider] = useState<ProviderId>(loadProvider)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, provider)
    } catch {}
    window.dispatchEvent(new CustomEvent('provider-change', { detail: { provider } }))
  }, [provider])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = useCallback(() => {
    setOpen((v) => !v)
  }, [])

  const current = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]
  const isMd = size === 'md'

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Trigger — ChatGPT/Cursor-style model pill */}
      <button
        ref={buttonRef}
        onClick={toggle}
        className={`group flex items-center rounded-lg font-medium transition-all cursor-pointer select-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] ${
          open ? 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]' : ''
        } ${isMd ? 'gap-1.5 px-2.5 py-1.5 text-[13px]' : 'gap-1 px-2 py-1 text-[11px]'}`}
        title={current.desc}
      >
        <Icon icon={current.icon} width={isMd ? 14 : 12} height={isMd ? 14 : 12} />
        <span>{current.label}</span>
        <Icon
          icon="lucide:chevron-down"
          width={isMd ? 12 : 10}
          height={isMd ? 12 : 10}
          className={`opacity-40 group-hover:opacity-70 transition-all duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown — opens upward like ChatGPT */}
      {open && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1.5 z-[9991] w-60 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
            <div className="px-3 pt-2.5 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
                Provider
              </span>
            </div>
            <div className="py-1">
              {PROVIDERS.map((p) => {
                const isActive = p.id === provider
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setProvider(p.id)
                      setOpen(false)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)]'
                          : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      <Icon icon={p.icon} width={14} height={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium leading-tight">{p.label}</div>
                      <div className="text-[10px] text-[var(--text-disabled)] leading-tight mt-0.5">
                        {p.desc}
                      </div>
                    </div>
                    {isActive && (
                      <Icon
                        icon="lucide:check"
                        width={14}
                        height={14}
                        className="shrink-0 text-[var(--brand)]"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function useProvider(): ProviderId {
  const [provider, setProvider] = useState<ProviderId>(loadProvider)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.provider) setProvider(detail.provider)
    }
    window.addEventListener('provider-change', handler)
    return () => window.removeEventListener('provider-change', handler)
  }, [])

  return provider
}
