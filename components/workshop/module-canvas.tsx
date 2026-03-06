'use client'

import { Icon } from '@iconify/react'
import { WORKSHOP_STAGE_LABELS } from '@/lib/agent-workshop/catalog'
import type { WorkshopBlueprint, WorkshopStageId } from '@/lib/agent-workshop/types'

interface StageCard {
  id: WorkshopStageId
  icon: string
  label: string
  countLabel: string
  summary: string
}

function buildStageCards(blueprint: WorkshopBlueprint): StageCard[] {
  return [
    {
      id: 'identity',
      icon: 'lucide:badge-check',
      label: WORKSHOP_STAGE_LABELS.identity,
      countLabel: blueprint.identity.name.trim() ? 'Profile set' : 'Needs identity',
      summary: blueprint.identity.mission || 'Give the agent a mission and a clear point of view.',
    },
    {
      id: 'skills',
      icon: 'lucide:sparkles',
      label: WORKSHOP_STAGE_LABELS.skills,
      countLabel: `${blueprint.skillIds.length} equipped`,
      summary: 'Skill workflows define how the agent thinks before it answers.',
    },
    {
      id: 'tools',
      icon: 'lucide:wrench',
      label: WORKSHOP_STAGE_LABELS.tools,
      countLabel: `${blueprint.toolIds.length} enabled`,
      summary: 'Tool access controls what the agent can reach and how far it can act.',
    },
    {
      id: 'workflow',
      icon: 'lucide:workflow',
      label: WORKSHOP_STAGE_LABELS.workflow,
      countLabel: `${blueprint.workflowIds.length} active`,
      summary: 'Workflow modules define the agent’s backbone from discovery to handoff.',
    },
    {
      id: 'automation',
      icon: 'lucide:zap',
      label: WORKSHOP_STAGE_LABELS.automation,
      countLabel: `${blueprint.automationIds.length} rules`,
      summary: 'Automations keep quality signals and follow-through alive between actions.',
    },
    {
      id: 'guardrails',
      icon: 'lucide:shield',
      label: WORKSHOP_STAGE_LABELS.guardrails,
      countLabel: blueprint.guardrails.profileId,
      summary: 'Guardrails express how bold or careful the agent should be by default.',
    },
    {
      id: 'evaluation',
      icon: 'lucide:flask-conical',
      label: WORKSHOP_STAGE_LABELS.evaluation,
      countLabel: blueprint.evaluation.prompt.trim() ? 'Ready to run' : 'Needs test prompt',
      summary: 'Evaluation is where promises become evidence.',
    },
  ]
}

interface ModuleCanvasProps {
  blueprint: WorkshopBlueprint
  activeStage: WorkshopStageId
  onFocusStage: (stageId: WorkshopStageId) => void
}

export function ModuleCanvas({ blueprint, activeStage, onFocusStage }: ModuleCanvasProps) {
  const cards = buildStageCards(blueprint)

  return (
    <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Composition Canvas</h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            The workshop graph shows how identity becomes behavior.
          </p>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
          Guided + Visual
        </div>
      </div>

      <div className="grid gap-3">
        {cards.map((card, index) => {
          const active = card.id === activeStage
          const isLast = index === cards.length - 1
          return (
            <div key={card.id} className="relative">
              {!isLast && (
                <div className="absolute left-5 top-[calc(100%+2px)] h-5 w-px bg-[color-mix(in_srgb,var(--brand)_30%,var(--border))]" />
              )}
              <button
                type="button"
                onClick={() => onFocusStage(card.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand)_20%,transparent)]'
                    : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      active
                        ? 'bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-[var(--brand)]'
                        : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <Icon icon={card.icon} width={18} height={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{card.label}</div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-disabled)]">
                        {card.countLabel}
                      </div>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{card.summary}</p>
                  </div>
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
