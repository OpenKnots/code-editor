'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { ErrorBoundary } from '@/components/error-boundary'
import { WorkshopEvaluationLab } from '@/components/workshop/eval-lab'
import { ModuleCanvas } from '@/components/workshop/module-canvas'
import { PythonAgentLab } from '@/components/workshop/python-agent-lab'
import { WorkshopHero } from '@/components/workshop/workshop-hero'
import {
  WORKSHOP_AUTOMATION_CATALOG,
  WORKSHOP_GUARDRAIL_PROFILES,
  WORKSHOP_SKILL_BUNDLES,
  WORKSHOP_TEMPLATE_CATALOG,
  WORKSHOP_TONE_OPTIONS,
  WORKSHOP_TOOL_CATALOG,
  WORKSHOP_WORKFLOW_CATALOG,
} from '@/lib/agent-workshop/catalog'
import { buildWorkshopSystemPrompt, calculateWorkshopReadiness } from '@/lib/agent-workshop/prompt'
import {
  AGENT_WORKSHOP_STORAGE_KEY,
  cloneWorkshopBlueprint,
  createDefaultWorkshopDocument,
  createSavedBlueprint,
  normalizeWorkshopDocument,
  type WorkshopBlueprint,
  type WorkshopGuardrailProfileId,
  type WorkshopStageId,
  type WorkshopToneId,
} from '@/lib/agent-workshop/types'
import { PERSONA_PRESETS } from '@/lib/agent-personas'
import { PLAYGROUND_SCENARIOS } from '@/lib/playground/data'
import { getSkillDisplayIcon, SKILLS_CATALOG } from '@/lib/skills/catalog'
import { mergeRuntimeState, SKILLS_RUNTIME_STORAGE_KEY } from '@/lib/skills/workflow'
import type { SkillsRuntimeMap } from '@/lib/skills/types'

function loadStoredWorkshopDocument() {
  if (typeof window === 'undefined') return createDefaultWorkshopDocument()
  try {
    const raw = localStorage.getItem(AGENT_WORKSHOP_STORAGE_KEY)
    return raw ? normalizeWorkshopDocument(JSON.parse(raw)) : createDefaultWorkshopDocument()
  } catch {
    return createDefaultWorkshopDocument()
  }
}

function loadStoredRuntimeState(): SkillsRuntimeMap | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SKILLS_RUNTIME_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SkillsRuntimeMap
  } catch {
    return null
  }
}

function buildGuardrailsForProfile(profileId: WorkshopGuardrailProfileId) {
  switch (profileId) {
    case 'safe':
      return {
        profileId,
        requirePlan: true,
        requireDiffReview: true,
        requireSecurityReview: true,
        allowTerminal: false,
        allowNetworkResearch: false,
        allowGitActions: false,
      }
    case 'autonomous':
      return {
        profileId,
        requirePlan: false,
        requireDiffReview: false,
        requireSecurityReview: true,
        allowTerminal: true,
        allowNetworkResearch: true,
        allowGitActions: true,
      }
    case 'balanced':
    default:
      return {
        profileId: 'balanced' as const,
        requirePlan: true,
        requireDiffReview: true,
        requireSecurityReview: true,
        allowTerminal: false,
        allowNetworkResearch: false,
        allowGitActions: false,
      }
  }
}

function SectionFrame({
  title,
  eyebrow,
  description,
  children,
  active = false,
}: {
  title: string
  eyebrow: string
  description: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <section
      className={`min-w-0 rounded-3xl border p-5 shadow-[var(--shadow-sm)] transition ${
        active
          ? 'border-[var(--info)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--info)_14%,var(--bg-elevated)),var(--bg-elevated)_44%,color-mix(in_srgb,var(--info)_5%,transparent))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--info)_24%,transparent),var(--shadow-sm)]'
          : 'border-[var(--border)] bg-[var(--bg-elevated)]'
      }`}
    >
      <div className="mb-5">
        <div
          className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
            active ? 'text-[var(--info)]' : 'text-[var(--text-disabled)]'
          }`}
        >
          {eyebrow}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {children}
    </section>
  )
}

function SelectionChip({
  active,
  icon,
  label,
  description,
  badge,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  description: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-2xl border px-4 py-4 text-left transition ${
        active
          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
          : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
      }`}
      aria-pressed={active}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            active
              ? 'bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-[var(--brand)]'
              : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)]'
          }`}
        >
          <Icon icon={active ? 'lucide:check-circle-2' : icon} width={18} height={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
            {badge ? (
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{description}</p>
        </div>
      </div>
    </button>
  )
}

export function WorkshopView() {
  const [documentState, setDocumentState] = useState(loadStoredWorkshopDocument)
  const [activeStage, setActiveStage] = useState<WorkshopStageId>('identity')
  const [skillQuery, setSkillQuery] = useState('')
  const [runtimeState, setRuntimeState] = useState<SkillsRuntimeMap>(() =>
    mergeRuntimeState(
      SKILLS_CATALOG.map((skill) => skill.id),
      loadStoredRuntimeState(),
    ),
  )
  const sectionRefs = useRef<Partial<Record<WorkshopStageId, HTMLDivElement | null>>>({})
  const evalLabRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(AGENT_WORKSHOP_STORAGE_KEY, JSON.stringify(documentState))
    } catch {}
  }, [documentState])

  useEffect(() => {
    const nextRuntime = mergeRuntimeState(
      SKILLS_CATALOG.map((skill) => skill.id),
      loadStoredRuntimeState(),
    )
    setRuntimeState(nextRuntime)
  }, [])

  useEffect(() => {
    if (activeStage === 'evaluation') {
      evalLabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    sectionRefs.current[activeStage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [activeStage])

  const primaryBlueprint = documentState.primaryBlueprint
  const challengerBlueprint = documentState.challengerBlueprint
  const readiness = useMemo(() => calculateWorkshopReadiness(primaryBlueprint), [primaryBlueprint])
  const systemPromptPreview = useMemo(
    () => buildWorkshopSystemPrompt(primaryBlueprint),
    [primaryBlueprint],
  )

  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return SKILLS_CATALOG
    return SKILLS_CATALOG.filter((skill) => {
      if (skill.title.toLowerCase().includes(query)) return true
      if (skill.shortDescription.toLowerCase().includes(query)) return true
      return skill.tags.some((tag) => tag.includes(query))
    })
  }, [skillQuery])

  const setStageRef = useCallback(
    (stageId: WorkshopStageId) => (node: HTMLDivElement | null) => {
      sectionRefs.current[stageId] = node
    },
    [],
  )

  const updatePrimaryBlueprint = useCallback(
    (updater: (current: WorkshopBlueprint) => WorkshopBlueprint) => {
      setDocumentState((current) => {
        const nextPrimary = updater(current.primaryBlueprint)
        return {
          ...current,
          updatedAt: Date.now(),
          primaryBlueprint: {
            ...nextPrimary,
            updatedAt: Date.now(),
          },
        }
      })
    },
    [],
  )

  const setPrimaryBlueprint = useCallback((next: WorkshopBlueprint) => {
    setDocumentState((current) => ({
      ...current,
      updatedAt: Date.now(),
      primaryBlueprint: {
        ...next,
        updatedAt: Date.now(),
      },
    }))
  }, [])

  const setChallengerBlueprint = useCallback((next: WorkshopBlueprint) => {
    setDocumentState((current) => ({
      ...current,
      updatedAt: Date.now(),
      challengerBlueprint: {
        ...next,
        updatedAt: Date.now(),
      },
    }))
  }, [])

  const updatePrimaryIdentity = useCallback(
    (patch: Partial<WorkshopBlueprint['identity']>) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        identity: {
          ...current.identity,
          ...patch,
        },
      }))
    },
    [updatePrimaryBlueprint],
  )

  const toggleSkill = useCallback(
    (skillId: string) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        skillIds: current.skillIds.includes(skillId)
          ? current.skillIds.filter((id) => id !== skillId)
          : [...current.skillIds, skillId],
      }))
    },
    [updatePrimaryBlueprint],
  )

  const toggleTool = useCallback(
    (toolId: WorkshopBlueprint['toolIds'][number]) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        toolIds: current.toolIds.includes(toolId)
          ? current.toolIds.filter((id) => id !== toolId)
          : [...current.toolIds, toolId],
      }))
    },
    [updatePrimaryBlueprint],
  )

  const toggleWorkflow = useCallback(
    (workflowId: WorkshopBlueprint['workflowIds'][number]) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        workflowIds: current.workflowIds.includes(workflowId)
          ? current.workflowIds.filter((id) => id !== workflowId)
          : [...current.workflowIds, workflowId],
      }))
    },
    [updatePrimaryBlueprint],
  )

  const toggleAutomation = useCallback(
    (automationId: WorkshopBlueprint['automationIds'][number]) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        automationIds: current.automationIds.includes(automationId)
          ? current.automationIds.filter((id) => id !== automationId)
          : [...current.automationIds, automationId],
      }))
    },
    [updatePrimaryBlueprint],
  )

  const applySkillBundle = useCallback(
    (skillIds: string[]) => {
      updatePrimaryBlueprint((current) => ({
        ...current,
        skillIds: Array.from(new Set([...current.skillIds, ...skillIds])),
      }))
    },
    [updatePrimaryBlueprint],
  )

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = WORKSHOP_TEMPLATE_CATALOG.find((entry) => entry.id === templateId)
      if (!template) return
      updatePrimaryBlueprint((current) => ({
        ...current,
        identity: {
          ...current.identity,
          name: template.label,
          tagline: template.tagline,
          personaId: template.personaId,
          mission: template.mission,
          toneId: template.toneId,
          customPrompt: '',
        },
        skillIds: [...template.skillIds],
        toolIds: [...template.toolIds],
        workflowIds: [...template.workflowIds],
        automationIds: [...template.automationIds],
        guardrails: buildGuardrailsForProfile(template.guardrailProfileId),
      }))
    },
    [updatePrimaryBlueprint],
  )

  const handleSaveBlueprint = useCallback(() => {
    setDocumentState((current) => {
      const savedBlueprint = createSavedBlueprint(current.primaryBlueprint)
      return {
        ...current,
        updatedAt: Date.now(),
        lastSavedAt: savedBlueprint.savedAt,
        savedBlueprints: [savedBlueprint, ...current.savedBlueprints]
          .filter(
            (entry, index, array) =>
              index === array.findIndex((candidate) => candidate.id === entry.id),
          )
          .slice(0, 4),
      }
    })
  }, [])

  const handleRestoreBlueprint = useCallback((savedId: string) => {
    setDocumentState((current) => {
      const saved = current.savedBlueprints.find((entry) => entry.id === savedId)
      if (!saved) return current
      return {
        ...current,
        updatedAt: Date.now(),
        primaryBlueprint: {
          ...cloneWorkshopBlueprint(saved.blueprint),
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  const toggleCompareMode = useCallback(() => {
    setDocumentState((current) => {
      if (!current.compareMode) {
        const mirrored = cloneWorkshopBlueprint(current.primaryBlueprint)
        mirrored.id = `${mirrored.id}-challenger`
        mirrored.identity = {
          ...mirrored.identity,
          name: `${mirrored.identity.name || 'Agent'} Challenger`,
          tagline: 'A sharper variation built to challenge the baseline.',
        }
        return {
          ...current,
          compareMode: true,
          challengerBlueprint: mirrored,
          updatedAt: Date.now(),
        }
      }

      return {
        ...current,
        compareMode: false,
        updatedAt: Date.now(),
      }
    })
  }, [])

  const clonePrimaryToChallenger = useCallback(() => {
    setDocumentState((current) => {
      const mirrored = cloneWorkshopBlueprint(current.primaryBlueprint)
      mirrored.id = `${mirrored.id}-challenger`
      mirrored.identity = {
        ...mirrored.identity,
        name: `${mirrored.identity.name || 'Agent'} Challenger`,
        tagline: 'Mirrored from the primary blueprint for focused A/B testing.',
      }
      return {
        ...current,
        compareMode: true,
        updatedAt: Date.now(),
        challengerBlueprint: mirrored,
      }
    })
  }, [])

  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-[var(--sidebar-bg)]">
      <div className="mx-auto flex w-full min-w-0 max-w-none flex-col gap-6 px-4 py-5 lg:px-6 2xl:px-8">
        <WorkshopHero
          blueprintName={primaryBlueprint.identity.name}
          tagline={primaryBlueprint.identity.tagline}
          readinessScore={readiness.score}
          readinessCallout={readiness.callout}
          lastSavedAt={documentState.lastSavedAt}
          templates={WORKSHOP_TEMPLATE_CATALOG}
          savedBlueprints={documentState.savedBlueprints}
          onApplyTemplate={applyTemplate}
          onRestoreBlueprint={handleRestoreBlueprint}
          onSave={handleSaveBlueprint}
          onToggleCompare={toggleCompareMode}
          compareMode={documentState.compareMode}
        />

        <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="grid min-w-0 gap-6">
            <div
              ref={setStageRef('identity')}
              onFocusCapture={() => setActiveStage('identity')}
              onClickCapture={() => setActiveStage('identity')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Guided Build"
                title="Identity and Intent"
                description="Define who the agent is, what it should optimize for, and how it should feel when it speaks."
                active={activeStage === 'identity'}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Agent Name
                    </span>
                    <input
                      type="text"
                      value={primaryBlueprint.identity.name}
                      onChange={(event) => updatePrimaryIdentity({ name: event.target.value })}
                      onFocus={() => setActiveStage('identity')}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                      placeholder="North Star Agent"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Tagline
                    </span>
                    <input
                      type="text"
                      value={primaryBlueprint.identity.tagline}
                      onChange={(event) => updatePrimaryIdentity({ tagline: event.target.value })}
                      onFocus={() => setActiveStage('identity')}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                      placeholder="Design with taste. Execute with discipline."
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Persona
                    </span>
                    <select
                      value={primaryBlueprint.identity.personaId}
                      onChange={(event) => updatePrimaryIdentity({ personaId: event.target.value })}
                      onFocus={() => setActiveStage('identity')}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                    >
                      {PERSONA_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Tone
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {WORKSHOP_TONE_OPTIONS.map((tone) => {
                        const active = primaryBlueprint.identity.toneId === tone.id
                        return (
                          <button
                            key={tone.id}
                            type="button"
                            onClick={() =>
                              updatePrimaryIdentity({ toneId: tone.id as WorkshopToneId })
                            }
                            className={`rounded-xl border px-3 py-3 text-left transition ${
                              active
                                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                            }`}
                          >
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {tone.label}
                            </div>
                            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                              {tone.description}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Mission
                  </span>
                  <textarea
                    value={primaryBlueprint.identity.mission}
                    onChange={(event) => updatePrimaryIdentity({ mission: event.target.value })}
                    onFocus={() => setActiveStage('identity')}
                    rows={4}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                    placeholder="Define the job this agent should obsess over."
                  />
                </label>

                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Custom Prompt Layer
                  </span>
                  <textarea
                    value={primaryBlueprint.identity.customPrompt}
                    onChange={(event) =>
                      updatePrimaryIdentity({ customPrompt: event.target.value })
                    }
                    onFocus={() => setActiveStage('identity')}
                    rows={5}
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                    placeholder="Optional: override or extend the persona prompt."
                  />
                </label>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('skills')}
              onFocusCapture={() => setActiveStage('skills')}
              onClickCapture={() => setActiveStage('skills')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Modules"
                title="Skills"
                description="Equip workflows that change how the agent approaches problems before it ever answers."
                active={activeStage === 'skills'}
              >
                <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Bundles
                    </div>
                    <div className="grid gap-3">
                      {WORKSHOP_SKILL_BUNDLES.map((bundle) => (
                        <button
                          key={bundle.id}
                          type="button"
                          onClick={() => applySkillBundle(bundle.skillIds)}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-left transition hover:border-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg-elevated))]"
                        >
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {bundle.label}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                            {bundle.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                          Catalog
                        </div>
                        <div className="mt-1 text-sm text-[var(--text-secondary)]">
                          {primaryBlueprint.skillIds.length} workflows equipped
                        </div>
                      </div>
                      <div className="relative sm:w-72">
                        <Icon
                          icon="lucide:search"
                          width={14}
                          height={14}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                        />
                        <input
                          type="text"
                          value={skillQuery}
                          onChange={(event) => setSkillQuery(event.target.value)}
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                          placeholder="Search skills"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {filteredSkills.map((skill) => {
                        const active = primaryBlueprint.skillIds.includes(skill.id)
                        const runtime = runtimeState[skill.id]
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleSkill(skill.id)}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                              active
                                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                            }`}
                            aria-pressed={active}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                  active
                                    ? 'bg-[color-mix(in_srgb,var(--brand)_16%,transparent)] text-[var(--brand)]'
                                    : 'bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)]'
                                }`}
                              >
                                <Icon
                                  icon={
                                    active ? 'lucide:check-circle-2' : getSkillDisplayIcon(skill)
                                  }
                                  width={18}
                                  height={18}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                                    {skill.title}
                                  </div>
                                  {runtime?.synced ? (
                                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-additions,#22c55e)]">
                                      Installed
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                                  {skill.shortDescription}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {skill.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-disabled)]"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('tools')}
              onFocusCapture={() => setActiveStage('tools')}
              onClickCapture={() => setActiveStage('tools')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Capabilities"
                title="Tools"
                description="Enable only the surfaces the agent truly needs. Power without clarity becomes risk."
                active={activeStage === 'tools'}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {WORKSHOP_TOOL_CATALOG.map((tool) => (
                    <SelectionChip
                      key={tool.id}
                      active={primaryBlueprint.toolIds.includes(tool.id)}
                      icon={tool.icon}
                      label={tool.label}
                      description={`${tool.description} ${tool.detail}`}
                      badge={`${tool.risk} risk`}
                      onClick={() => toggleTool(tool.id)}
                    />
                  ))}
                </div>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('workflow')}
              onFocusCapture={() => setActiveStage('workflow')}
              onClickCapture={() => setActiveStage('workflow')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Orchestration"
                title="Workflow Spine"
                description="Decide how the agent should move through discovery, planning, execution, review, and handoff."
                active={activeStage === 'workflow'}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {WORKSHOP_WORKFLOW_CATALOG.map((workflow) => (
                    <SelectionChip
                      key={workflow.id}
                      active={primaryBlueprint.workflowIds.includes(workflow.id)}
                      icon={workflow.icon}
                      label={workflow.label}
                      description={workflow.description}
                      onClick={() => toggleWorkflow(workflow.id)}
                    />
                  ))}
                </div>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('automation')}
              onFocusCapture={() => setActiveStage('automation')}
              onClickCapture={() => setActiveStage('automation')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Momentum"
                title="Automations"
                description="Set up the quality pulses and reminders that keep the agent aligned before and after each move."
                active={activeStage === 'automation'}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {WORKSHOP_AUTOMATION_CATALOG.map((automation) => (
                    <SelectionChip
                      key={automation.id}
                      active={primaryBlueprint.automationIds.includes(automation.id)}
                      icon={automation.icon}
                      label={automation.label}
                      description={automation.description}
                      onClick={() => toggleAutomation(automation.id)}
                    />
                  ))}
                </div>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('guardrails')}
              onFocusCapture={() => setActiveStage('guardrails')}
              onClickCapture={() => setActiveStage('guardrails')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Safety"
                title="Guardrails"
                description="Make security, review, and execution posture visible so the agent earns trust instead of assuming it."
                active={activeStage === 'guardrails'}
              >
                <div className="grid gap-3 md:grid-cols-3">
                  {WORKSHOP_GUARDRAIL_PROFILES.map((profile) => {
                    const active = primaryBlueprint.guardrails.profileId === profile.id
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() =>
                          updatePrimaryBlueprint((current) => ({
                            ...current,
                            guardrails: buildGuardrailsForProfile(profile.id),
                          }))
                        }
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          active
                            ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                            : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                        }`}
                      >
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {profile.label}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                          {profile.description}
                        </p>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    {
                      key: 'requirePlan',
                      label: 'Require a plan before major work',
                    },
                    {
                      key: 'requireDiffReview',
                      label: 'Prefer reviewable diffs and summaries',
                    },
                    {
                      key: 'requireSecurityReview',
                      label: 'Always surface security review notes',
                    },
                    {
                      key: 'allowTerminal',
                      label: 'Allow terminal workflows',
                    },
                    {
                      key: 'allowNetworkResearch',
                      label: 'Allow live documentation research',
                    },
                    {
                      key: 'allowGitActions',
                      label: 'Allow git actions when explicitly needed',
                    },
                  ].map((toggle) => {
                    const active = primaryBlueprint.guardrails[
                      toggle.key as keyof typeof primaryBlueprint.guardrails
                    ] as boolean

                    return (
                      <button
                        key={toggle.key}
                        type="button"
                        onClick={() =>
                          updatePrimaryBlueprint((current) => ({
                            ...current,
                            guardrails: {
                              ...current.guardrails,
                              [toggle.key]: !active,
                            },
                          }))
                        }
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          active
                            ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                            : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                        }`}
                      >
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {toggle.label}
                        </span>
                        <Icon
                          icon={active ? 'lucide:toggle-right' : 'lucide:toggle-left'}
                          width={22}
                          height={22}
                          className={active ? 'text-[var(--brand)]' : 'text-[var(--text-tertiary)]'}
                        />
                      </button>
                    )
                  })}
                </div>
              </SectionFrame>
            </div>

            <div
              ref={setStageRef('evaluation')}
              onFocusCapture={() => setActiveStage('evaluation')}
              onClickCapture={() => setActiveStage('evaluation')}
              className="min-w-0"
            >
              <SectionFrame
                eyebrow="Verification"
                title="Evaluation Posture"
                description="Choose a test scenario now so the workshop closes with evidence, not vibes."
                active={activeStage === 'evaluation'}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Default Scenario
                    </span>
                    <select
                      value={primaryBlueprint.evaluation.scenarioId}
                      onChange={(event) =>
                        updatePrimaryBlueprint((current) => {
                          const scenario = PLAYGROUND_SCENARIOS.find(
                            (entry) => entry.id === event.target.value,
                          )
                          return {
                            ...current,
                            evaluation: {
                              scenarioId: event.target.value,
                              prompt: scenario?.prompt ?? current.evaluation.prompt,
                            },
                          }
                        })
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                    >
                      {PLAYGROUND_SCENARIOS.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                      Why this matters
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      The workshop only becomes trustworthy when the blueprint survives a realistic
                      prompt under the guardrails you selected.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveStage('evaluation')}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--brand)]"
                    >
                      <Icon icon="lucide:arrow-down-circle" width={16} height={16} />
                      Jump to Evaluation Lab
                    </button>
                  </div>
                </div>
              </SectionFrame>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 2xl:sticky 2xl:top-4 2xl:self-start">
            <ModuleCanvas
              blueprint={primaryBlueprint}
              activeStage={activeStage}
              onFocusStage={setActiveStage}
            />

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Blueprint Summary
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    The selected modules that will shape the final system prompt.
                  </p>
                </div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  {readiness.completed}/{readiness.total} complete
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Persona
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {PERSONA_PRESETS.find(
                      (preset) => preset.id === primaryBlueprint.identity.personaId,
                    )?.name ?? 'Custom'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                    Active Modules
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                    {primaryBlueprint.skillIds.length +
                      primaryBlueprint.toolIds.length +
                      primaryBlueprint.workflowIds.length +
                      primaryBlueprint.automationIds.length}{' '}
                    connected
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {primaryBlueprint.skillIds.slice(0, 4).map((skillId) => {
                  const skill = SKILLS_CATALOG.find((entry) => entry.id === skillId)
                  if (!skill) return null
                  return (
                    <span
                      key={skillId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      <Icon icon={getSkillDisplayIcon(skill)} width={13} height={13} />
                      {skill.title}
                    </span>
                  )
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Live Prompt Preview
                </h2>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  This is the prompt the workshop will inject into the gateway.
                </p>
              </div>
              <pre className="max-h-[540px] min-w-0 overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 text-xs leading-6 text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                {systemPromptPreview}
              </pre>
            </section>
          </div>
        </div>

        <div ref={evalLabRef} className="min-w-0">
          <WorkshopEvaluationLab
            primaryBlueprint={primaryBlueprint}
            challengerBlueprint={challengerBlueprint}
            compareMode={documentState.compareMode}
            onUpdatePrimaryBlueprint={setPrimaryBlueprint}
            onUpdateChallengerBlueprint={setChallengerBlueprint}
            onClonePrimaryToChallenger={clonePrimaryToChallenger}
          />
        </div>

        <div className="min-w-0">
          <ErrorBoundary fallbackLabel="Python Agent Lab failed to render">
            <PythonAgentLab />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
