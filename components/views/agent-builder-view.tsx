'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AgentBuilder,
  AgentSummary,
  BEHAVIOR_DEFS,
  type AgentBuilderState,
} from '@/components/agent-builder'
import { getAgentConfig, clearAgentConfig, type AgentConfig } from '@/lib/agent-session'
import { useView } from '@/context/view-context'
import { useWorkspaceSettings } from '@/context/workspace-settings-context'

const PANEL_MIN = 320
const PANEL_MAX = 520
const PANEL_DEFAULT = 400

function AgentBuilderPreview({ state }: { state: AgentBuilderState | null }) {
  if (!state) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-disabled)] text-xs">
        Start building to see a preview
      </div>
    )
  }

  const tokenEstimate = Math.ceil(state.systemPrompt.length / 4)
  const activeBehaviors = BEHAVIOR_DEFS.filter((b) => state.behaviors[b.key] ?? b.defaultValue)
  const inactiveBehaviors = BEHAVIOR_DEFS.filter((b) => !(state.behaviors[b.key] ?? b.defaultValue))

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Agent identity card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{state.presetEmoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {state.presetName}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {state.presetDescription}
              </div>
            </div>
          </div>

          {state.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {state.traits.map((trait) => (
                <span key={trait} className="trait-badge">
                  {trait}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* System prompt preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
              System Prompt
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-disabled)]">
              {state.isModified && (
                <span className="text-[var(--warning,#eab308)] font-medium">Modified</span>
              )}
              <span className="font-mono">~{tokenEstimate.toLocaleString()} tokens</span>
            </div>
          </div>
          <pre className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-tertiary)] whitespace-pre-wrap break-words leading-relaxed max-h-[280px] overflow-y-auto">
            {state.systemPrompt || 'No prompt configured yet...'}
          </pre>
        </div>

        {/* Behaviors */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
            Behaviors
          </div>
          <div className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            {activeBehaviors.map((b) => (
              <div
                key={b.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px]"
              >
                <Icon
                  icon="lucide:check"
                  width={10}
                  height={10}
                  className="text-[var(--success)] shrink-0"
                />
                <span className="text-[var(--text-secondary)]">{b.label.split('(')[0].trim()}</span>
              </div>
            ))}
            {inactiveBehaviors.map((b) => (
              <div
                key={b.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] opacity-50"
              >
                <Icon
                  icon="lucide:x"
                  width={10}
                  height={10}
                  className="text-[var(--text-disabled)] shrink-0"
                />
                <span className="text-[var(--text-disabled)]">{b.label.split('(')[0].trim()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model */}
        {state.modelPreference && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
              Model
            </div>
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-secondary)]">
              {state.modelPreference}
            </span>
          </div>
        )}

        {/* Step indicator */}
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
            Progress
          </div>
          <div className="flex items-center gap-1.5">
            {['Persona', 'Customize', 'Behavior', 'Activate'].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i < state.step
                      ? 'bg-[var(--brand)]'
                      : i === state.step
                        ? 'bg-[var(--brand)] ring-2 ring-[var(--brand)]/30'
                        : 'bg-[var(--border)]'
                  }`}
                />
                <span
                  className={`text-[10px] ${
                    i <= state.step ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'
                  }`}
                >
                  {label}
                </span>
                {i < 3 && <div className="w-3 h-px bg-[var(--border)]" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentBuilderView() {
  const { setView } = useView()
  const { effectiveRepo, effectiveBrain } = useWorkspaceSettings()
  const [config, setConfig] = useState<AgentConfig | null>(() => getAgentConfig())
  const [configuring, setConfiguring] = useState(!config)
  const [previewOpen, setPreviewOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('knot-code:agent-builder-preview') === 'true'
    }
    return false
  })
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('knot-code:agent-builder-preview-width')
      return saved ? parseInt(saved, 10) : PANEL_DEFAULT
    }
    return PANEL_DEFAULT
  })
  const [builderState, setBuilderState] = useState<AgentBuilderState | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('knot-code:agent-builder-preview', previewOpen.toString())
    }
  }, [previewOpen])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('knot-code:agent-builder-preview-width', panelWidth.toString())
    }
  }, [panelWidth])

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

  const handleBuilderStateChange = useCallback((state: AgentBuilderState) => {
    setBuilderState(state)
  }, [])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const fromRight = rect.right - e.clientX
      const clamped = Math.max(PANEL_MIN, Math.min(PANEL_MAX, fromRight))
      setPanelWidth(clamped)
    }

    const handleMouseUp = () => setIsDragging(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const previewToggle = useMemo(
    () => (
      <button
        onClick={() => setPreviewOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        title={previewOpen ? 'Close preview' : 'Open preview'}
      >
        <Icon icon="lucide:eye" width={13} height={13} />
        Preview
      </button>
    ),
    [previewOpen],
  )

  return (
    <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden bg-[var(--sidebar-bg)]">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 lg:px-10 xl:px-16 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('chat')}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <Icon icon="lucide:arrow-left" width={16} height={16} />
            </button>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Builder</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Configure your AI coding assistant with shared repo + brain context
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {configuring && previewToggle}
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

        {/* Builder / Summary */}
        <div className="flex-1 overflow-y-auto">
          <div className={`w-full px-6 py-6 lg:px-10 ${previewOpen ? '' : 'xl:px-16'}`}>
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
                Repo{' '}
                <span className="ml-1 font-medium text-[var(--text-primary)]">
                  {effectiveRepo || 'Set in Settings'}
                </span>
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)]">
                Brain{' '}
                <span className="ml-1 font-medium text-[var(--text-primary)]">
                  {effectiveBrain}
                </span>
              </span>
            </div>
            {configuring ? (
              <AgentBuilder
                onComplete={handleComplete}
                onSkip={() => setView('chat')}
                compact={previewOpen}
                onStateChange={handleBuilderStateChange}
              />
            ) : config ? (
              <AgentSummary
                config={config}
                onReconfigure={handleReconfigure}
                onReset={handleReset}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Snap toggle when closed */}
      <AnimatePresence>
        {!previewOpen && configuring && (
          <motion.button
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.15 }}
            onClick={() => setPreviewOpen(true)}
            className="shrink-0 flex flex-col items-center justify-center gap-2 w-10 border-l border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--brand)] transition-colors cursor-pointer"
            title="Open preview panel"
          >
            <Icon icon="lucide:eye" width={18} height={18} />
            <span
              className="text-[10px] font-medium tracking-wide"
              style={{ writingMode: 'vertical-rl' }}
            >
              Preview
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Preview side panel */}
      <AnimatePresence>
        {previewOpen && configuring && (
          <>
            {/* Resizable divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className={`shrink-0 w-1 cursor-col-resize relative group transition-colors ${
                isDragging ? 'bg-[var(--brand)]' : 'bg-[var(--border)] hover:bg-[var(--brand)]'
              }`}
              onMouseDown={handleDividerMouseDown}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </motion.div>

            {/* Panel */}
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: panelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="shrink-0 flex flex-col min-h-0 overflow-hidden bg-[var(--bg-elevated)]"
              style={{ willChange: isDragging ? 'width' : 'auto' }}
            >
              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:eye" width={16} height={16} className="text-[var(--brand)]" />
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                    Live Preview
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (builderState) {
                        const text = JSON.stringify(
                          {
                            persona: builderState.persona,
                            systemPrompt: builderState.systemPrompt,
                            behaviors: builderState.behaviors,
                            modelPreference: builderState.modelPreference,
                          },
                          null,
                          2,
                        )
                        navigator.clipboard.writeText(text)
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                    title="Copy config"
                  >
                    <Icon icon="lucide:copy" width={14} height={14} />
                  </button>
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
                    title="Close preview"
                  >
                    <Icon icon="lucide:panel-right-close" width={14} height={14} />
                  </button>
                </div>
              </div>

              {/* Panel content */}
              <AgentBuilderPreview state={builderState} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
