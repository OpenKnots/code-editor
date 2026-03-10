'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import type { WorkshopBlueprint, WorkshopStageId } from '@/lib/agent-workshop/types'
import { calculateWorkshopReadiness, buildWorkshopSystemPrompt } from '@/lib/agent-workshop/prompt'

interface WizardStep {
  id: WorkshopStageId
  label: string
  icon: string
  description: string
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'identity',
    label: 'Identity',
    icon: 'lucide:user',
    description: 'Name, tagline, persona, mission, tone',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: 'lucide:sparkles',
    description: 'Select from catalog, custom skills',
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: 'lucide:wrench',
    description: 'Select available tools',
  },
  {
    id: 'workflow',
    label: 'Workflow',
    icon: 'lucide:workflow',
    description: 'Configure workflow stages',
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: 'lucide:zap',
    description: 'Set up automations',
  },
  {
    id: 'guardrails',
    label: 'Guardrails',
    icon: 'lucide:shield',
    description: 'Safety and permission settings',
  },
  {
    id: 'evaluation',
    label: 'Review',
    icon: 'lucide:check-circle',
    description: 'Final review & deploy',
  },
]

interface WorkshopWizardProps {
  blueprint: WorkshopBlueprint
  onUpdateBlueprint: (updater: (current: WorkshopBlueprint) => WorkshopBlueprint) => void
  onDeploy: () => void
  onExport: () => void
  onCopyPrompt: () => void
  renderStageContent: (stageId: WorkshopStageId) => React.ReactNode
}

export function WorkshopWizard({
  blueprint,
  onUpdateBlueprint,
  onDeploy,
  onExport,
  onCopyPrompt,
  renderStageContent,
}: WorkshopWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

  const currentStage = WIZARD_STEPS[currentStep]
  const isLastStep = currentStep === WIZARD_STEPS.length - 1
  const isFirstStep = currentStep === 0

  const readiness = useMemo(() => calculateWorkshopReadiness(blueprint), [blueprint])
  const systemPrompt = useMemo(() => buildWorkshopSystemPrompt(blueprint), [blueprint])

  const canProceed = useMemo(() => {
    // Basic validation for each step
    switch (currentStage.id) {
      case 'identity':
        return blueprint.identity.name.trim().length > 0
      case 'skills':
        return blueprint.skillIds.length > 0
      case 'tools':
        return blueprint.toolIds.length > 0
      case 'workflow':
        return true // Optional
      case 'automation':
        return true // Optional
      case 'guardrails':
        return true // Always has default
      case 'evaluation':
        return true
      default:
        return true
    }
  }, [currentStage.id, blueprint])

  const handleNext = useCallback(() => {
    if (currentStep < WIZARD_STEPS.length - 1 && canProceed) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]))
      setCurrentStep(currentStep + 1)
    }
  }, [currentStep, canProceed])

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (completedSteps.has(stepIndex) || stepIndex < currentStep) {
        setCurrentStep(stepIndex)
      }
    },
    [completedSteps, currentStep],
  )

  return (
    <div className="h-full w-full min-h-0 min-w-0 flex flex-col bg-[var(--sidebar-bg)]">
      {/* Progress Bar */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-2">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = completedSteps.has(index)
              const isCurrent = index === currentStep
              const isClickable = isCompleted || index < currentStep

              return (
                <div key={step.id} className="flex items-center flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleStepClick(index)}
                    disabled={!isClickable}
                    className={`group relative flex flex-col items-center gap-2 px-2 py-1 rounded-lg transition-all ${
                      isClickable ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                        isCompleted
                          ? 'bg-[var(--brand)] border-[var(--brand)] text-white'
                          : isCurrent
                            ? 'bg-[var(--bg)] border-[var(--brand)] text-[var(--brand)] animate-pulse'
                            : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-disabled)]'
                      }`}
                    >
                      {isCompleted ? (
                        <Icon icon="lucide:check" width={18} height={18} />
                      ) : (
                        <Icon icon={step.icon} width={18} height={18} />
                      )}
                    </div>
                    <div className="hidden lg:block text-center min-w-0">
                      <div
                        className={`text-xs font-medium truncate ${
                          isCurrent
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {step.label}
                      </div>
                    </div>
                  </button>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 transition-colors ${
                        completedSteps.has(index) ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step Header */}
              <div className="mb-6">
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                  Step {currentStep + 1} of {WIZARD_STEPS.length}
                </div>
                <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                  {currentStage.label}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {currentStage.description}
                </p>
              </div>

              {/* Review Step Content */}
              {isLastStep ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                          <Icon icon="lucide:user" width={20} height={20} />
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Identity
                        </h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-[var(--text-disabled)]">Name:</span>{' '}
                          <span className="text-[var(--text-primary)] font-medium">
                            {blueprint.identity.name || 'Unnamed Agent'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-disabled)]">Tagline:</span>{' '}
                          <span className="text-[var(--text-secondary)]">
                            {blueprint.identity.tagline || 'No tagline'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                          <Icon icon="lucide:layers" width={20} height={20} />
                        </div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Configuration
                        </h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-[var(--text-disabled)]">Skills:</span>{' '}
                          <span className="text-[var(--text-primary)] font-medium">
                            {blueprint.skillIds.length}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-disabled)]">Tools:</span>{' '}
                          <span className="text-[var(--text-primary)] font-medium">
                            {blueprint.toolIds.length}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--text-disabled)]">Workflows:</span>{' '}
                          <span className="text-[var(--text-primary)] font-medium">
                            {blueprint.workflowIds.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Readiness Score */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Readiness Score
                      </h3>
                      <span className="text-2xl font-bold text-[var(--brand)]">
                        {readiness.score}%
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${readiness.score}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="h-full bg-[var(--brand)]"
                      />
                    </div>
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      {readiness.callout}
                    </p>
                  </div>

                  {/* System Prompt Preview */}
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Generated System Prompt
                      </h3>
                      <button
                        onClick={onCopyPrompt}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                      >
                        <Icon icon="lucide:copy" width={16} height={16} />
                      </button>
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-sm text-[var(--brand)] hover:text-[var(--brand)]/80 transition list-none flex items-center gap-2">
                        <Icon
                          icon="lucide:chevron-right"
                          width={16}
                          height={16}
                          className="transition-transform group-open:rotate-90"
                        />
                        View Prompt
                      </summary>
                      <pre className="mt-3 p-4 bg-[var(--bg)] rounded-xl text-xs text-[var(--text-secondary)] max-h-60 overflow-auto whitespace-pre-wrap break-words">
                        {systemPrompt}
                      </pre>
                    </details>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={onDeploy}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--brand)] text-white font-medium transition hover:opacity-90"
                    >
                      <Icon icon="lucide:rocket" width={18} height={18} />
                      Deploy to Chat
                    </button>
                    <button
                      onClick={onExport}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] font-medium transition hover:border-[var(--brand)]"
                    >
                      <Icon icon="lucide:download" width={18} height={18} />
                      Export
                    </button>
                  </div>
                </div>
              ) : (
                <div>{renderStageContent(currentStage.id)}</div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            disabled={isFirstStep}
            className="flex items-center gap-2 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon icon="lucide:arrow-left" width={16} height={16} />
            Back
          </button>

          <div className="text-xs text-[var(--text-disabled)]">
            {currentStep + 1} / {WIZARD_STEPS.length}
          </div>

          {!isLastStep ? (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--brand)] text-white text-sm font-medium transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <Icon icon="lucide:arrow-right" width={16} height={16} />
            </button>
          ) : (
            <button
              onClick={onDeploy}
              className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-green-500 text-white text-sm font-medium transition hover:opacity-90"
            >
              <Icon icon="lucide:rocket" width={16} height={16} />
              Deploy
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
