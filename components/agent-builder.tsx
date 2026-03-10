'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { type AgentConfig, DEFAULT_BEHAVIORS, saveAgentConfig } from '@/lib/agent-session'
import { PERSONA_PRESETS } from '@/lib/agent-personas'

// ─── Behavior Definitions ────────────────────────────────────────

interface BehaviorDef {
  key: string
  label: string
  description: string
  defaultValue: boolean
}

export const BEHAVIOR_DEFS: BehaviorDef[] = [
  {
    key: 'proposeEdits',
    label: 'Always propose edits (never auto-apply)',
    description: 'Agent shows diffs for your review before applying',
    defaultValue: true,
  },
  {
    key: 'fullFileContent',
    label: 'Include full file content in edits',
    description: 'Complete files for accurate diff rendering',
    defaultValue: true,
  },
  {
    key: 'flagSecurity',
    label: 'Flag security concerns',
    description: 'Highlight OWASP risks and vulnerabilities',
    defaultValue: true,
  },
  {
    key: 'explainReasoning',
    label: 'Explain reasoning for non-obvious changes',
    description: 'Brief rationale for architectural decisions',
    defaultValue: true,
  },
  {
    key: 'generateTests',
    label: 'Generate tests when writing new code',
    description: 'Auto-suggest test cases alongside implementations',
    defaultValue: false,
  },
]

// ─── Trait Extraction ────────────────────────────────────────────

function extractTraits(prompt: string): string[] {
  const traits: string[] = []
  const text = prompt.toLowerCase()
  const checks = [
    { keywords: ['full-stack', 'fullstack'], label: 'Full-Stack' },
    { keywords: ['frontend', 'front-end', 'ui quality'], label: 'Frontend' },
    { keywords: ['security', 'vulnerab', 'owasp'], label: 'Security' },
    { keywords: ['architect', 'scale', 'distributed'], label: 'Architecture' },
    { keywords: ['openclaw', 'gateway', 'maintainer', 'pr workflow'], label: 'OpenClaw' },
    { keywords: ['typescript', ' ts '], label: 'TypeScript' },
    { keywords: ['react'], label: 'React' },
    { keywords: ['next.js', 'nextjs', 'app router'], label: 'Next.js' },
    { keywords: ['python'], label: 'Python' },
    { keywords: ['rust'], label: 'Rust' },
    { keywords: ['accessibility', 'a11y', 'wcag'], label: 'Accessibility' },
    { keywords: ['performance', 'core web vitals', 'optimiz'], label: 'Performance' },
    { keywords: ['database', 'sql', 'postgres'], label: 'Database' },
    { keywords: ['docker', 'kubernetes', 'devops'], label: 'DevOps' },
    { keywords: ['direct', 'concise', 'no filler'], label: 'Concise' },
    { keywords: ['test', 'testing'], label: 'Testing' },
    { keywords: ['git'], label: 'Git' },
  ]

  for (const check of checks) {
    if (check.keywords.some((k) => text.includes(k))) {
      traits.push(check.label)
    }
  }
  return traits.slice(0, 8)
}

// ─── Component ──────────────────────────────────────────────────

export interface AgentBuilderState {
  persona: string
  presetName: string
  presetEmoji: string
  presetDescription: string
  systemPrompt: string
  behaviors: Record<string, boolean>
  modelPreference: string
  traits: string[]
  step: number
  isModified: boolean
}

interface Props {
  onComplete: (config: AgentConfig) => void
  onSkip?: () => void
  compact?: boolean
  onStateChange?: (state: AgentBuilderState) => void
}

export function AgentBuilder({ onComplete, onSkip, compact, onStateChange }: Props) {
  const [step, setStep] = useState(0)
  const [selectedPersona, setSelectedPersona] = useState<string>('fullstack')
  const [systemPrompt, setSystemPrompt] = useState(PERSONA_PRESETS[0].prompt)
  const [originalPrompt, setOriginalPrompt] = useState(PERSONA_PRESETS[0].prompt)
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({ ...DEFAULT_BEHAVIORS })
  const [modelPreference, setModelPreference] = useState('')
  const stepRef = useRef<HTMLDivElement>(null)

  const selectedPreset = useMemo(
    () => PERSONA_PRESETS.find((p) => p.id === selectedPersona) ?? PERSONA_PRESETS[0],
    [selectedPersona],
  )

  const traits = useMemo(() => extractTraits(systemPrompt), [systemPrompt])
  const charCount = systemPrompt.length

  const handleSelectPersona = useCallback((id: string) => {
    setSelectedPersona(id)
    const preset = PERSONA_PRESETS.find((p) => p.id === id)
    if (preset) {
      setSystemPrompt(preset.prompt)
      setOriginalPrompt(preset.prompt)
    }
  }, [])

  const handleResetPrompt = useCallback(() => {
    setSystemPrompt(originalPrompt)
  }, [originalPrompt])

  const handleToggleBehavior = useCallback((key: string) => {
    setBehaviors((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleActivate = useCallback(() => {
    const config: AgentConfig = {
      persona: selectedPersona,
      systemPrompt,
      behaviors,
      modelPreference,
    }
    saveAgentConfig(config)
    onComplete(config)
  }, [selectedPersona, systemPrompt, behaviors, modelPreference, onComplete])

  const canProceed = step === 1 ? systemPrompt.trim().length > 0 : true
  const isPromptModified = systemPrompt !== originalPrompt

  useEffect(() => {
    onStateChange?.({
      persona: selectedPersona,
      presetName: selectedPreset.name,
      presetEmoji: selectedPreset.emoji,
      presetDescription: selectedPreset.description,
      systemPrompt,
      behaviors,
      modelPreference,
      traits,
      step,
      isModified: isPromptModified,
    })
  }, [selectedPersona, selectedPreset, systemPrompt, behaviors, modelPreference, traits, step, isPromptModified, onStateChange])

  // Scroll step into view on change
  useEffect(() => {
    stepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [step])

  const steps = ['Persona', 'Customize', 'Behavior', 'Activate']

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {steps.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              i === step
                ? 'text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                : i < step
                  ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer'
                  : 'text-[var(--text-disabled)] cursor-not-allowed'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                i < step
                  ? 'bg-[var(--brand)] text-[var(--brand-contrast,#fff)]'
                  : i === step
                    ? 'border-2 border-[var(--brand)] text-[var(--brand)]'
                    : 'border border-[var(--border)] text-[var(--text-disabled)]'
              }`}
            >
              {i < step ? <Icon icon="lucide:check" width={10} height={10} /> : i + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div ref={stepRef} key={step} className="agent-builder-step">
        {/* ─── Step 1: Choose Persona ──────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Choose Your Agent Persona
              </h3>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                Pick a starting point — you can customize everything in the next step.
              </p>
            </div>
            <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {PERSONA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPersona(preset.id)}
                  className={`persona-card flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                    selectedPersona === preset.id
                      ? 'persona-card-selected border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))] shadow-sm'
                      : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover,var(--text-disabled))] hover:shadow-sm'
                  }`}
                >
                  <span className="text-2xl leading-none mt-0.5">{preset.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {preset.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
                      {preset.description}
                    </div>
                  </div>
                  {selectedPersona === preset.id && (
                    <Icon
                      icon="lucide:check-circle-2"
                      width={16}
                      height={16}
                      className="text-[var(--brand)] shrink-0 mt-0.5"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 2: Customize Prompt ───────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Customize Your Agent
                </h3>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                  Edit the system prompt to shape how your agent thinks and responds.
                </p>
              </div>
              {isPromptModified && (
                <button
                  onClick={handleResetPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:rotate-ccw" width={12} height={12} />
                  Reset
                </button>
              )}
            </div>

            <div className={`flex gap-4 ${compact ? 'flex-col' : 'flex-col lg:flex-row'}`}>
              <div className="flex-1 min-w-0 space-y-1.5">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Describe who your agent is and how it should behave..."
                  className="prompt-editor w-full min-h-[280px] lg:min-h-[360px]"
                  spellCheck={false}
                />
                <div className="flex items-center justify-between text-[10px] text-[var(--text-disabled)]">
                  <span>
                    {isPromptModified && (
                      <span className="text-[var(--warning,#eab308)]">Modified</span>
                    )}
                  </span>
                  <span>{charCount.toLocaleString()} chars</span>
                </div>
              </div>

              <div className="w-full lg:w-[240px] shrink-0">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3 lg:sticky lg:top-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{selectedPreset.emoji}</span>
                    <div>
                      <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                        {selectedPreset.name}
                      </div>
                      <div className="text-[10px] text-[var(--text-disabled)]">Live Preview</div>
                    </div>
                  </div>

                  {traits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {traits.map((trait) => (
                        <span key={trait} className="trait-badge">
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}

                  {traits.length === 0 && systemPrompt.trim().length === 0 && (
                    <p className="text-[11px] text-[var(--text-disabled)] italic">
                      Start typing to see traits...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 3: Configure Behavior ─────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Configure Behavior
              </h3>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                Fine-tune how your agent works alongside you.
              </p>
            </div>

            <div className="grid gap-2 grid-cols-1 lg:grid-cols-2">
              {BEHAVIOR_DEFS.map((b) => (
                <button
                  key={b.key}
                  onClick={() => handleToggleBehavior(b.key)}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover,var(--text-disabled))] transition-all cursor-pointer text-left"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text-primary)]">
                      {b.label}
                    </div>
                    <div className="text-[11px] text-[var(--text-disabled)] mt-0.5">
                      {b.description}
                    </div>
                  </div>
                  <div
                    className="behavior-toggle shrink-0"
                    data-checked={String(behaviors[b.key] ?? b.defaultValue)}
                    role="switch"
                    aria-checked={behaviors[b.key] ?? b.defaultValue}
                  />
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[var(--border)]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
                Model Preference
              </div>
              <div className="max-w-md">
                <input
                  type="text"
                  value={modelPreference}
                  onChange={(e) => setModelPreference(e.target.value)}
                  placeholder="e.g., claude-sonnet-4-5, gpt-4o"
                  className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--border-focus,var(--brand))] transition-colors"
                />
                <p className="text-[10px] text-[var(--text-disabled)] mt-1.5">
                  Leave empty to use gateway default
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 4: Ready to Code ─────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Ready to Code
              </h3>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                Here&apos;s your agent configuration. Activate to start using it.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--brand)_4%,transparent)]">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedPreset.emoji}</span>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                      {selectedPreset.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      {selectedPreset.description}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 grid gap-4 grid-cols-1 lg:grid-cols-3">
                {traits.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
                      Expertise
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {traits.map((trait) => (
                        <span key={trait} className="trait-badge">
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className={traits.length > 0 ? '' : 'lg:col-span-2'}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
                    Behaviors
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {BEHAVIOR_DEFS.map((b) => {
                      const on = behaviors[b.key] ?? b.defaultValue
                      return (
                        <span
                          key={b.key}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                            on
                              ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-disabled)]'
                          }`}
                        >
                          <Icon icon={on ? 'lucide:check' : 'lucide:x'} width={9} height={9} />
                          {b.label.split('(')[0].trim()}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {modelPreference && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
                      Model
                    </div>
                    <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                      {modelPreference}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleActivate}
                className="flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all cursor-pointer"
                style={{
                  background:
                    'linear-gradient(135deg, var(--brand), var(--brand-hover, var(--brand)))',
                  color: 'var(--brand-contrast, #fff)',
                }}
              >
                Activate Agent
              </button>

              {onSkip && (
                <button
                  onClick={onSkip}
                  className="px-5 py-3 rounded-xl text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 3 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-xl text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setStep((s) => Math.min(3, s + 1))}
            disabled={!canProceed}
            className="px-6 py-2 rounded-xl text-[12px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{
              backgroundColor: canProceed ? 'var(--brand)' : 'var(--bg-subtle)',
              color: canProceed ? 'var(--brand-contrast, #fff)' : 'var(--text-disabled)',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Configured Agent Summary (for settings panel) ──────────────

interface AgentSummaryProps {
  config: AgentConfig
  onReconfigure: () => void
  onReset: () => void
}

export function AgentSummary({ config, onReconfigure, onReset }: AgentSummaryProps) {
  const preset = PERSONA_PRESETS.find((p) => p.id === config.persona) ?? PERSONA_PRESETS[0]
  const traits = useMemo(() => extractTraits(config.systemPrompt), [config.systemPrompt])
  const promptPreview = config.systemPrompt.split('\n').slice(0, 5).join('\n')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">{preset.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">
              {preset.name}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)]">{preset.description}</div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]">
            Active
          </span>
        </div>

        {traits.length > 0 && (
          <div className="px-5 pb-4 flex flex-wrap gap-1.5">
            {traits.map((trait) => (
              <span key={trait} className="trait-badge">
                {trait}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
            System Prompt
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-left px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] cursor-pointer hover:border-[var(--border-hover,var(--text-disabled))] transition-colors"
          >
            <pre
              className="text-[11px] font-mono text-[var(--text-tertiary)] whitespace-pre-wrap overflow-hidden leading-relaxed"
              style={{ maxHeight: expanded ? 'none' : '80px' }}
            >
              {expanded ? config.systemPrompt : promptPreview}
            </pre>
            <span className="text-[10px] text-[var(--text-disabled)] mt-2 flex items-center gap-1">
              <Icon
                icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                width={10}
                height={10}
              />
              {expanded ? 'Collapse' : 'Expand'}
            </span>
          </button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] mb-2">
            Behaviors
          </div>
          <div className="space-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            {BEHAVIOR_DEFS.map((b) => {
              const on = config.behaviors[b.key] ?? b.defaultValue
              return (
                <div
                  key={b.key}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px]"
                >
                  <span className="text-[var(--text-secondary)]">
                    {b.label.split('(')[0].trim()}
                  </span>
                  <span className={on ? 'text-[var(--success)]' : 'text-[var(--text-disabled)]'}>
                    {on ? 'On' : 'Off'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onReconfigure}
          className="flex-1 py-2.5 rounded-xl text-[12px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
        >
          Reconfigure Agent
        </button>
        <button
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl text-[12px] font-medium text-[var(--text-disabled)] hover:text-[var(--error,#ef4444)] transition-colors cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
