'use client'

import { Icon } from '@iconify/react'

export type AgentMode = 'plan' | 'code' | 'agent'

const MODES: Array<{ id: AgentMode; label: string; icon: string; desc: string }> = [
  { id: 'plan', label: 'Plan', icon: 'lucide:list-checks', desc: 'Discuss and plan before coding' },
  { id: 'code', label: 'Code', icon: 'lucide:code', desc: 'Direct code changes' },
  { id: 'agent', label: 'Agent', icon: 'lucide:infinity', desc: 'Autonomous multi-step agent' },
]

interface Props {
  mode: AgentMode
  onChange: (mode: AgentMode) => void
}

export function ModeSelector({ mode, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
      {MODES.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
            mode === m.id
              ? 'bg-[var(--bg)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-transparent'
          }`}
          title={m.desc}
        >
          <Icon icon={m.icon} width={11} height={11} />
          {m.label}
        </button>
      ))}
    </div>
  )
}
