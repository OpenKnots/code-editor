'use client'

import { Icon } from '@iconify/react'
import type { WorkshopBlueprint, WorkshopStageId } from '@/lib/agent-workshop/types'

interface AgentFlowProps {
  blueprint: WorkshopBlueprint
  activeStage: WorkshopStageId
  onFocusStage: (stage: WorkshopStageId) => void
}

const FLOW_STAGES = [
  {
    id: 'identity' as const,
    icon: 'lucide:user-circle',
    label: 'Identity',
    description: 'Who the agent is',
  },
  {
    id: 'skills' as const,
    icon: 'lucide:zap',
    label: 'Skills',
    description: 'Workflows & capabilities',
  },
  {
    id: 'tools' as const,
    icon: 'lucide:wrench',
    label: 'Tools',
    description: 'Available interfaces',
  },
  {
    id: 'workflow' as const,
    icon: 'lucide:workflow',
    label: 'Workflow',
    description: 'Orchestration spine',
  },
  {
    id: 'guardrails' as const,
    icon: 'lucide:shield-check',
    label: 'Guardrails',
    description: 'Safety & review',
  },
  {
    id: 'evaluation' as const,
    icon: 'lucide:target',
    label: 'Output',
    description: 'Test & validation',
  },
]

function isStageConfigured(blueprint: WorkshopBlueprint, stageId: WorkshopStageId): boolean {
  switch (stageId) {
    case 'identity':
      return !!blueprint.identity.name && !!blueprint.identity.mission
    case 'skills':
      return blueprint.skillIds.length > 0
    case 'tools':
      return blueprint.toolIds.length > 0
    case 'workflow':
      return blueprint.workflowIds.length > 0
    case 'guardrails':
      return !!blueprint.guardrails.profileId
    case 'evaluation':
      return !!blueprint.evaluation.scenarioId
    default:
      return false
  }
}

export function AgentFlow({ blueprint, activeStage, onFocusStage }: AgentFlowProps) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow-sm)]">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Agent Pipeline</h2>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Visual flow of your agent configuration from identity to output
        </p>
      </div>

      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-0 right-0 top-8 h-[2px] bg-gradient-to-r from-[var(--border)] via-[var(--brand)] to-[var(--border)]" />

        {/* Stage nodes */}
        <div className="relative flex items-start justify-between gap-2">
          {FLOW_STAGES.map((stage, index) => {
            const isActive = activeStage === stage.id
            const isConfigured = isStageConfigured(blueprint, stage.id)

            return (
              <button
                key={stage.id}
                onClick={() => onFocusStage(stage.id)}
                className={`group relative flex flex-col items-center gap-2 transition ${
                  isActive ? 'scale-105' : ''
                }`}
              >
                {/* Node */}
                <div
                  className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition ${
                    isActive
                      ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] shadow-lg'
                      : isConfigured
                        ? 'border-[var(--brand)]/40 bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                        : 'border-[var(--border)] bg-[var(--bg)]'
                  } ${!isActive ? 'group-hover:border-[var(--brand)]/60 group-hover:shadow-md' : ''}`}
                >
                  {isConfigured && !isActive ? (
                    <div className="relative">
                      <Icon
                        icon={stage.icon}
                        width={24}
                        height={24}
                        className="text-[var(--brand)] transition"
                      />
                      <div className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-[var(--brand)]">
                        <Icon icon="lucide:check" width={10} height={10} className="text-white" />
                      </div>
                    </div>
                  ) : (
                    <Icon
                      icon={stage.icon}
                      width={24}
                      height={24}
                      className={`transition ${
                        isActive
                          ? 'text-[var(--brand)]'
                          : isConfigured
                            ? 'text-[var(--brand)]'
                            : 'text-[var(--text-disabled)]'
                      } ${!isActive ? 'group-hover:text-[var(--brand)]' : ''}`}
                    />
                  )}
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl bg-[var(--brand)] opacity-20 animate-pulse" />
                  )}
                </div>

                {/* Label */}
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`text-xs font-semibold transition ${
                      isActive
                        ? 'text-[var(--text-primary)]'
                        : isConfigured
                          ? 'text-[var(--text-secondary)]'
                          : 'text-[var(--text-disabled)]'
                    } ${!isActive ? 'group-hover:text-[var(--text-primary)]' : ''}`}
                  >
                    {stage.label}
                  </span>
                  <span className="text-[10px] text-[var(--text-disabled)] text-center max-w-[80px]">
                    {stage.description}
                  </span>
                </div>

                {/* Arrow connector (except last) */}
                {index < FLOW_STAGES.length - 1 && (
                  <div className="absolute left-[calc(100%+0.25rem)] top-8 z-0 flex items-center">
                    <Icon
                      icon="lucide:arrow-right"
                      width={16}
                      height={16}
                      className={`text-[var(--border)] transition ${
                        isConfigured && isStageConfigured(blueprint, FLOW_STAGES[index + 1].id)
                          ? 'text-[var(--brand)]'
                          : ''
                      }`}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Progress indicator */}
        <div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon
              icon="lucide:check-circle-2"
              width={16}
              height={16}
              className="text-[var(--brand)]"
            />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {FLOW_STAGES.filter((stage) => isStageConfigured(blueprint, stage.id)).length} of{' '}
              {FLOW_STAGES.length} stages configured
            </span>
          </div>
          <div className="flex items-center gap-2">
            {FLOW_STAGES.map((stage) => (
              <div
                key={stage.id}
                className={`h-1.5 w-8 rounded-full transition ${
                  isStageConfigured(blueprint, stage.id)
                    ? 'bg-[var(--brand)]'
                    : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
