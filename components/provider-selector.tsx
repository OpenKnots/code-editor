'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'

export type ProviderId = 'gateway' | 'cursor' | 'claude'

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
]

const STORAGE_KEY = 'code-editor:agent-provider'

function loadProvider(): ProviderId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'gateway' || v === 'cursor' || v === 'claude') return v
  } catch {}
  return 'gateway'
}

interface Props {
  size?: 'sm' | 'md'
}

export function ProviderSelector({ size = 'sm' }: Props) {
  const [provider, setProvider] = useState<ProviderId>(loadProvider)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null)
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
    setOpen((v) => {
      if (!v && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setMenuPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 })
      }
      return !v
    })
  }, [])

  const current = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]
  const isMd = size === 'md'

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={toggle}
        className={`flex items-center rounded-lg font-medium transition-all cursor-pointer select-none text-[var(--text-secondary)] bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] ${
          isMd ? 'gap-1.5 px-3 py-1.5 text-[13px]' : 'gap-1 px-2 py-1 text-[11px]'
        }`}
        title={current.desc}
      >
        <Icon icon={current.icon} width={isMd ? 14 : 12} height={isMd ? 14 : 12} />
        {current.label}
        <Icon
          icon="lucide:chevron-down"
          width={isMd ? 10 : 8}
          height={isMd ? 10 : 8}
          className="opacity-50"
        />
      </button>

      {open && menuPos && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9991] w-56 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl py-1"
            style={{ left: menuPos.left, bottom: menuPos.bottom }}
          >
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                  p.id === provider
                    ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                }`}
              >
                <Icon icon={p.icon} width={14} height={14} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{p.label}</div>
                  <div className="text-[10px] text-[var(--text-disabled)] leading-tight">
                    {p.desc}
                  </div>
                </div>
                {p.id === provider && (
                  <Icon icon="lucide:check" width={12} height={12} className="shrink-0" />
                )}
              </button>
            ))}
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
