'use client'

import { Icon } from '@iconify/react'
import { PERSONA_PRESETS } from '@/lib/agent-personas'
import type { WorkshopSavedBlueprint } from '@/lib/agent-workshop/types'
import type { WorkshopTemplate } from '@/lib/agent-workshop/catalog'

function formatSavedTime(timestamp: number | null): string {
  if (!timestamp) return 'Never saved'

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (diffMinutes < 1) return 'Saved just now'
  if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `Saved ${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `Saved ${diffDays}d ago`
}

interface WorkshopHeroProps {
  blueprintName: string
  tagline: string
  readinessScore: number
  readinessCallout: string
  lastSavedAt: number | null
  templates: WorkshopTemplate[]
  savedBlueprints: WorkshopSavedBlueprint[]
  onApplyTemplate: (templateId: string) => void
  onRestoreBlueprint: (savedId: string) => void
  onSave: () => void
  onToggleCompare: () => void
  compareMode: boolean
}

export function WorkshopHero({
  blueprintName,
  tagline,
  readinessScore,
  readinessCallout,
  lastSavedAt,
  templates,
  savedBlueprints,
  onApplyTemplate,
  onRestoreBlueprint,
  onSave,
  onToggleCompare,
  compareMode,
}: WorkshopHeroProps) {
  return (
    <section className="relative min-w-0 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_18%,var(--bg-elevated)),var(--bg-elevated)_42%,color-mix(in_srgb,var(--text-primary)_6%,transparent))] p-6 shadow-[var(--shadow-sm)]">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-70"
        style={{
          background:
            'radial-gradient(circle at top right, color-mix(in srgb, var(--brand) 25%, transparent), transparent 58%)',
        }}
      />

      <div className="relative grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_35%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            <Icon icon="lucide:sparkles" width={14} height={14} className="text-[var(--brand)]" />
            Agent Workshop
          </div>

          <div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
              Build agents that feel intentional, modular, and ready for the real world.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] md:text-[15px]">
              Shape identity, connect skills and tools, choreograph workflows, then pressure-test the result
              before it ever reaches a real task.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4 backdrop-blur">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                Current Blueprint
              </div>
              <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {blueprintName || 'Unnamed Agent'}
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                {tagline || 'Give the agent a voice, a job, and a reason to exist.'}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4 backdrop-blur">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                Readiness
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-semibold text-[var(--text-primary)]">{readinessScore}%</span>
                <span className="pb-1 text-xs text-[var(--text-tertiary)]">{readinessCallout}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),color-mix(in_srgb,var(--brand)_60%,white))]"
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4 backdrop-blur">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                State
              </div>
              <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                {compareMode ? 'Compare Mode' : 'Single Blueprint'}
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                {formatSavedTime(lastSavedAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-contrast)] transition hover:opacity-95"
            >
              <Icon icon="lucide:save" width={16} height={16} />
              Save Blueprint
            </button>
            <button
              type="button"
              onClick={onToggleCompare}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--brand)]"
            >
              <Icon icon={compareMode ? 'lucide:layers-2' : 'lucide:git-compare'} width={16} height={16} />
              {compareMode ? 'Disable Compare' : 'Create Challenger'}
            </button>
          </div>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] p-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Starter Templates</h2>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Jump to a proven posture, then remix it.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {templates.map((template) => {
                const persona = PERSONA_PRESETS.find((preset) => preset.id === template.personaId)
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onApplyTemplate(template.id)}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition hover:border-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg-elevated))]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                          {template.badge}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                          <span>{persona?.emoji ?? 'AI'}</span>
                          {template.label}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                          {template.description}
                        </p>
                      </div>
                      <Icon icon="lucide:arrow-up-right" width={16} height={16} className="text-[var(--text-tertiary)]" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_84%,transparent)] p-4 backdrop-blur">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent Saves</h2>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Restore a recent snapshot when you want to branch or rewind.
              </p>
            </div>
            <div className="grid gap-3">
              {savedBlueprints.length > 0 ? (
                savedBlueprints.map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => onRestoreBlueprint(saved.id)}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left transition hover:border-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg-elevated))]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{saved.label}</div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {formatSavedTime(saved.savedAt)}
                      </div>
                    </div>
                    <Icon icon="lucide:history" width={16} height={16} className="text-[var(--text-tertiary)]" />
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-sm text-[var(--text-tertiary)]">
                  Save a blueprint to build your own recent library.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
