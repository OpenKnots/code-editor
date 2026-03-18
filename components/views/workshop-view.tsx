'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { ErrorBoundary } from '@/components/error-boundary'
import { useView } from '@/context/view-context'
import { WorkshopEvaluationLab } from '@/components/workshop/eval-lab'
import { ModuleCanvas } from '@/components/workshop/module-canvas'
import { PythonAgentLab } from '@/components/workshop/python-agent-lab'
import { WorkshopHero } from '@/components/workshop/workshop-hero'
import { AgentFlow } from '@/components/workshop/agent-flow'
import { AgentTestPanel } from '@/components/workshop/agent-test-panel'
import { TemplateGallery } from '@/components/workshop/template-gallery'
import { WorkshopWizard } from '@/components/workshop/workshop-wizard'
import { LivePreview } from '@/components/workshop/live-preview'
import { deployAgent } from '@/lib/agent-workshop/deploy'
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
import { PERSONA_PRESETS, getPersonaPresetById } from '@/lib/agent-personas'
import { DEFAULT_BEHAVIORS, saveAgentConfig } from '@/lib/agent-session'
import { PLAYGROUND_SCENARIOS } from '@/lib/playground/data'
import { getSkillDisplayIcon, getSkillPresentationMeta, SKILLS_CATALOG } from '@/lib/skills/catalog'
import { mergeRuntimeState, SKILLS_RUNTIME_STORAGE_KEY } from '@/lib/skills/workflow'
import type { SkillsRuntimeMap } from '@/lib/skills/types'

const BEHAVIOR_DEFS = [
  {
    key: 'proposeEdits',
    label: 'Always propose edits (never auto-apply)',
    description: 'Agent shows diffs for your review before applying',
  },
  {
    key: 'fullFileContent',
    label: 'Include full file content in edits',
    description: 'Complete files for accurate diff rendering',
  },
  {
    key: 'flagSecurity',
    label: 'Flag security concerns',
    description: 'Highlight OWASP risks and vulnerabilities',
  },
  {
    key: 'explainReasoning',
    label: 'Explain reasoning for non-obvious changes',
    description: 'Brief rationale for architectural decisions',
  },
  {
    key: 'generateTests',
    label: 'Generate tests when writing new code',
    description: 'Auto-suggest test cases alongside implementations',
  },
]

function extractTraits(prompt: string): string[] {
  const traits: string[] = []
  const text = prompt.toLowerCase()
  const checks = [
    { keywords: ['full-stack', 'fullstack'], label: 'Full-Stack' },
    { keywords: ['frontend', 'front-end', 'ui quality'], label: 'Frontend' },
    { keywords: ['security', 'vulnerab', 'owasp'], label: 'Security' },
    { keywords: ['architect', 'scale', 'distributed'], label: 'Architecture' },
    { keywords: ['typescript', ' ts '], label: 'TypeScript' },
    { keywords: ['react'], label: 'React' },
    { keywords: ['next.js', 'nextjs', 'app router'], label: 'Next.js' },
    { keywords: ['python'], label: 'Python' },
    { keywords: ['rust'], label: 'Rust' },
    { keywords: ['accessibility', 'a11y', 'wcag'], label: 'Accessibility' },
    { keywords: ['performance', 'core web vitals', 'optimiz'], label: 'Performance' },
    { keywords: ['database', 'sql', 'postgres'], label: 'Database' },
    { keywords: ['docker', 'kubernetes', 'devops'], label: 'DevOps' },
    { keywords: ['test', 'testing'], label: 'Testing' },
    { keywords: ['git'], label: 'Git' },
  ]
  for (const check of checks) {
    if (check.keywords.some((k) => text.includes(k))) traits.push(check.label)
  }
  return traits.slice(0, 8)
}

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
}: {
  title: string
  eyebrow: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-disabled)]">
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

type WorkshopMode = 'gallery' | 'wizard' | 'testing'

export function WorkshopView() {
  const { setView } = useView()
  const [documentState, setDocumentState] = useState(loadStoredWorkshopDocument)
  const [activeStage, setActiveStage] = useState<WorkshopStageId>('identity')
  const [skillQuery, setSkillQuery] = useState('')
  const [workshopMode, setWorkshopMode] = useState<WorkshopMode>('gallery')
  const [previewOpen, setPreviewOpen] = useState(false)
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
      const personaPreset = getPersonaPresetById(template.personaId)
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
        systemPrompt: template.systemPrompt ?? personaPreset?.prompt ?? '',
        behaviors: template.behaviors
          ? { ...DEFAULT_BEHAVIORS, ...template.behaviors }
          : { ...DEFAULT_BEHAVIORS },
        modelPreference: template.modelPreference ?? '',
        skillIds: [...template.skillIds],
        toolIds: [...template.toolIds],
        workflowIds: [...template.workflowIds],
        automationIds: [...template.automationIds],
        guardrails: buildGuardrailsForProfile(template.guardrailProfileId),
      }))
      setWorkshopMode('wizard')
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

  const handleExport = useCallback(() => {
    const exportData = {
      version: '1.0',
      blueprint: primaryBlueprint,
      exportedAt: Date.now(),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${primaryBlueprint.identity.name.toLowerCase().replace(/\s+/g, '-') || 'agent'}-blueprint.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [primaryBlueprint])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string)
          if (data.blueprint) {
            setPrimaryBlueprint(data.blueprint)
          }
        } catch (error) {
          console.error('Failed to import blueprint:', error)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [setPrimaryBlueprint])

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(systemPromptPreview)
  }, [systemPromptPreview])

  const handleShareLink = useCallback(() => {
    const encoded = btoa(JSON.stringify(primaryBlueprint))
    const url = `${window.location.origin}${window.location.pathname}#blueprint=${encoded}`
    navigator.clipboard.writeText(url)
  }, [primaryBlueprint])

  const handleDeploy = useCallback(() => {
    const systemPrompt = buildWorkshopSystemPrompt(primaryBlueprint)
    deployAgent({
      name: primaryBlueprint.identity.name || 'Custom Agent',
      systemPrompt,
      deployedAt: Date.now(),
      blueprintId: primaryBlueprint.id,
    })
    saveAgentConfig({
      persona: primaryBlueprint.identity.personaId,
      systemPrompt: primaryBlueprint.systemPrompt || systemPrompt,
      behaviors: primaryBlueprint.behaviors,
      modelPreference: primaryBlueprint.modelPreference,
    })
    setView('chat')
  }, [primaryBlueprint, setView])

  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      applyTemplate(templateId)
    },
    [applyTemplate],
  )

  const renderStageContent = useCallback(
    (stageId: WorkshopStageId) => {
      const ref = sectionRefs.current[stageId]
      if (!ref) return null
      return <div ref={setStageRef(stageId)}>{/* Stage content will be rendered here */}</div>
    },
    [setStageRef],
  )

  // Gallery mode: show template selection
  if (workshopMode === 'gallery') {
    return <TemplateGallery onSelectTemplate={handleSelectTemplate} />
  }

  // Testing mode: show existing test panel
  if (workshopMode === 'testing') {
    return (
      <div className="h-full w-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto bg-[var(--sidebar-bg)]">
        <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-col gap-6 px-4 py-5 lg:px-6 2xl:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWorkshopMode('wizard')}
              className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              <Icon icon="lucide:arrow-left" width={16} height={16} />
              Back to Workshop
            </button>
          </div>
          <AgentTestPanel blueprint={primaryBlueprint} />
        </div>
      </div>
    )
  }

  // Wizard mode: show step-by-step wizard with live preview
  return (
    <div className="h-full w-full min-h-0 min-w-0 relative flex">
      <div className="flex-1 min-w-0">
        <WorkshopWizard
          blueprint={primaryBlueprint}
          onUpdateBlueprint={updatePrimaryBlueprint}
          onDeploy={handleDeploy}
          onExport={handleExport}
          onImport={handleImport}
          onShareLink={handleShareLink}
          onCopyPrompt={handleCopyPrompt}
          onRunEvaluation={() => setWorkshopMode('testing')}
          renderStageContent={(stageId) => {
            switch (stageId) {
              case 'identity':
                return (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                          Agent Name
                        </span>
                        <input
                          type="text"
                          value={primaryBlueprint.identity.name}
                          onChange={(event) => updatePrimaryIdentity({ name: event.target.value })}
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
                          onChange={(event) =>
                            updatePrimaryIdentity({ tagline: event.target.value })
                          }
                          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                          placeholder="Design with taste. Execute with discipline."
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                        Persona
                      </span>
                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                        {PERSONA_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => {
                              updatePrimaryIdentity({ personaId: preset.id })
                              if (preset.prompt) {
                                updatePrimaryBlueprint((bp) => ({
                                  ...bp,
                                  systemPrompt: preset.prompt,
                                }))
                              }
                            }}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                              primaryBlueprint.identity.personaId === preset.id
                                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                            }`}
                          >
                            <span className="text-lg leading-none mt-0.5">{preset.emoji}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[var(--text-primary)]">
                                {preset.name}
                              </div>
                              <div className="text-xs text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                                {preset.description}
                              </div>
                            </div>
                            {primaryBlueprint.identity.personaId === preset.id && (
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
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                        Mission
                      </span>
                      <textarea
                        value={primaryBlueprint.identity.mission}
                        onChange={(event) => updatePrimaryIdentity({ mission: event.target.value })}
                        rows={4}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                        placeholder="Define the job this agent should obsess over."
                      />
                    </label>
                  </div>
                )

              case 'system-prompt': {
                const personaPreset = getPersonaPresetById(primaryBlueprint.identity.personaId)
                const currentPrompt = primaryBlueprint.systemPrompt
                const isModified = personaPreset
                  ? currentPrompt !== personaPreset.prompt
                  : currentPrompt.length > 0
                const traits = extractTraits(currentPrompt)

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[var(--text-secondary)]">
                        Edit the system prompt to shape how your agent thinks and responds.
                      </p>
                      {isModified && personaPreset?.prompt && (
                        <button
                          onClick={() =>
                            updatePrimaryBlueprint((bp) => ({
                              ...bp,
                              systemPrompt: personaPreset.prompt,
                            }))
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                        >
                          <Icon icon="lucide:rotate-ccw" width={12} height={12} />
                          Reset to persona default
                        </button>
                      )}
                    </div>

                    <div className="flex gap-4 flex-col lg:flex-row">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <textarea
                          value={currentPrompt}
                          onChange={(e) =>
                            updatePrimaryBlueprint((bp) => ({
                              ...bp,
                              systemPrompt: e.target.value,
                            }))
                          }
                          placeholder="Describe who your agent is and how it should behave..."
                          className="w-full min-h-[280px] max-h-[480px] rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm font-mono text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)] resize-y"
                          spellCheck={false}
                        />
                        <div className="flex items-center justify-between text-xs text-[var(--text-disabled)]">
                          <span>
                            {isModified && (
                              <span className="text-[var(--warning,#eab308)]">Modified</span>
                            )}
                          </span>
                          <span>{currentPrompt.length.toLocaleString()} chars</span>
                        </div>
                      </div>

                      <div className="w-full lg:w-[220px] shrink-0">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{personaPreset?.emoji ?? '✨'}</span>
                            <div>
                              <div className="text-sm font-semibold text-[var(--text-primary)]">
                                {personaPreset?.name ?? 'Custom'}
                              </div>
                              <div className="text-[10px] text-[var(--text-disabled)]">
                                Live preview
                              </div>
                            </div>
                          </div>
                          {traits.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {traits.map((trait) => (
                                <span
                                  key={trait}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                >
                                  {trait}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--text-disabled)] italic">
                              Start typing to see detected traits...
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              case 'behaviors':
                return (
                  <div className="space-y-5">
                    <div className="space-y-1">
                      {BEHAVIOR_DEFS.map((b) => (
                        <button
                          key={b.key}
                          onClick={() =>
                            updatePrimaryBlueprint((bp) => ({
                              ...bp,
                              behaviors: {
                                ...bp.behaviors,
                                [b.key]: !(bp.behaviors[b.key] ?? DEFAULT_BEHAVIORS[b.key]),
                              },
                            }))
                          }
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--text-primary)]">
                              {b.label}
                            </div>
                            <div className="text-xs text-[var(--text-disabled)] mt-0.5">
                              {b.description}
                            </div>
                          </div>
                          <div
                            className="behavior-toggle shrink-0"
                            data-checked={String(
                              primaryBlueprint.behaviors[b.key] ??
                                DEFAULT_BEHAVIORS[b.key] ??
                                false,
                            )}
                            role="switch"
                            aria-checked={
                              primaryBlueprint.behaviors[b.key] ?? DEFAULT_BEHAVIORS[b.key] ?? false
                            }
                          />
                        </button>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-[var(--border)]">
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--text-disabled)]">
                          Model Preference
                        </span>
                        <input
                          type="text"
                          value={primaryBlueprint.modelPreference}
                          onChange={(e) =>
                            updatePrimaryBlueprint((bp) => ({
                              ...bp,
                              modelPreference: e.target.value,
                            }))
                          }
                          placeholder="e.g., claude-sonnet-4-5, gpt-4o"
                          className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
                        />
                        <p className="text-xs text-[var(--text-disabled)] mt-1.5">
                          Leave empty to use gateway default
                        </p>
                      </label>
                    </div>
                  </div>
                )

              case 'skills':
                return (
                  <div className="space-y-4">
                    <div className="relative">
                      <Icon
                        icon="lucide:search"
                        width={16}
                        height={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                      />
                      <input
                        type="text"
                        value={skillQuery}
                        onChange={(e) => setSkillQuery(e.target.value)}
                        placeholder="Search skills..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--brand)]"
                      />
                    </div>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                      {filteredSkills.map((skill) => {
                        const isActive = primaryBlueprint.skillIds.includes(skill.id)
                        return (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                              isActive
                                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                            }`}
                          >
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                isActive
                                  ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              <Icon
                                icon={
                                  isActive
                                    ? 'lucide:check'
                                    : (getSkillDisplayIcon(skill) ?? 'lucide:sparkles')
                                }
                                width={16}
                                height={16}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-[var(--text-primary)]">
                                {skill.title}
                              </div>
                              <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                {skill.shortDescription}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-[var(--text-disabled)]">
                      {primaryBlueprint.skillIds.length} skill
                      {primaryBlueprint.skillIds.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                )

              case 'tools':
                return (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {WORKSHOP_TOOL_CATALOG.map((tool) => {
                      const isActive = primaryBlueprint.toolIds.includes(tool.id)
                      return (
                        <button
                          key={tool.id}
                          onClick={() => toggleTool(tool.id)}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                            isActive
                              ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                              : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isActive
                                ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <Icon
                              icon={isActive ? 'lucide:check' : tool.icon}
                              width={18}
                              height={18}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-[var(--text-primary)]">
                                {tool.label}
                              </div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${
                                  tool.risk === 'high'
                                    ? 'bg-[color-mix(in_srgb,var(--error)_10%,transparent)] text-[var(--error)]'
                                    : tool.risk === 'medium'
                                      ? 'bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]'
                                      : 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]'
                                }`}
                              >
                                {tool.risk}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                              {tool.description}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )

              case 'workflow':
                return (
                  <div className="grid gap-3 grid-cols-1">
                    {WORKSHOP_WORKFLOW_CATALOG.map((workflow) => {
                      const isActive = primaryBlueprint.workflowIds.includes(workflow.id)
                      return (
                        <button
                          key={workflow.id}
                          onClick={() => toggleWorkflow(workflow.id)}
                          className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                            isActive
                              ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                              : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isActive
                                ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <Icon
                              icon={isActive ? 'lucide:check' : workflow.icon}
                              width={18}
                              height={18}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {workflow.label}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                              {workflow.description}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )

              case 'automation':
                return (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {WORKSHOP_AUTOMATION_CATALOG.map((automation) => {
                      const isActive = primaryBlueprint.automationIds.includes(automation.id)
                      return (
                        <button
                          key={automation.id}
                          onClick={() => toggleAutomation(automation.id)}
                          className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-colors ${
                            isActive
                              ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                              : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              isActive
                                ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <Icon
                              icon={isActive ? 'lucide:check' : automation.icon}
                              width={18}
                              height={18}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {automation.label}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                              {automation.description}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )

              case 'guardrails':
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                      {WORKSHOP_GUARDRAIL_PROFILES.map((profile) => {
                        const isActive = primaryBlueprint.guardrails.profileId === profile.id
                        return (
                          <button
                            key={profile.id}
                            onClick={() =>
                              updatePrimaryBlueprint((bp) => ({
                                ...bp,
                                guardrails: buildGuardrailsForProfile(profile.id),
                              }))
                            }
                            className={`p-4 rounded-xl border text-left transition-colors ${
                              isActive
                                ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_6%,var(--bg))]'
                                : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--brand)]/60'
                            }`}
                          >
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {profile.label}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)] mt-1">
                              {profile.description}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )

              default:
                return (
                  <div className="text-sm text-[var(--text-secondary)]">
                    Section content for {stageId}
                  </div>
                )
            }
          }}
        />
      </div>

      {/* Live Preview - Desktop only */}
      <div className="hidden lg:block">
        <LivePreview
          blueprint={primaryBlueprint}
          isOpen={previewOpen}
          onToggle={() => setPreviewOpen(!previewOpen)}
        />
      </div>
    </div>
  )
}
