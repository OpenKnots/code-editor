'use client'

import { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { AgentBuilder, AgentSummary } from '@/components/agent-builder'
import { getAgentConfig, clearAgentConfig, type AgentConfig } from '@/lib/agent-session'
import { useView } from '@/context/view-context'

export function AgentBuilderView() {
  const { setView } = useView()
  const [config, setConfig] = useState<AgentConfig | null>(() => getAgentConfig())
  const [configuring, setConfiguring] = useState(!config)

  const handleComplete = useCallback((newConfig: AgentConfig) => {
    setConfig(newConfig)
    setConfiguring(false)
  }, [])

  const handleReconfigure = useCallback(() => {
    setConfiguring(true)
  }, [])

  const handleReset = useCallback(() => {
    clearAgentConfig()
    setConfig(null)
    setConfiguring(true)
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--sidebar-bg)]">
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('chat')}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:arrow-left" width={16} height={16} />
          </button>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Agent Builder</h2>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Configure your AI coding assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              config && !configuring
                ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]'
                : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)]'
            }`}
          >
            <Icon
              icon={config && !configuring ? 'lucide:check-circle-2' : 'lucide:circle-dashed'}
              width={10}
              height={10}
            />
            {config && !configuring ? 'Active' : 'Setup'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[560px] mx-auto px-5 py-6">
          {configuring ? (
            <AgentBuilder onComplete={handleComplete} onSkip={() => setView('chat')} />
          ) : config ? (
            <AgentSummary config={config} onReconfigure={handleReconfigure} onReset={handleReset} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
