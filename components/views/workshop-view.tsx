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
import { PERSONA_PRESETS } from '@/lib/agent-personas'
import { PLAYGROUND_SCENARIOS } from '@/lib/playground/data'
import { getSkillDisplayIcon, getSkillPresentationMeta, SKILLS_CATALOG } from '@/lib/skills/catalog'
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
        <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-4 py-5 lg:px-6 2xl:px-8">
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
            // Render the existing section content based on stage
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
              case 'skills':
                return (
                  <div className="text-sm text-[var(--text-secondary)]">
                    <p className="mb-4">
                      Skills section - {primaryBlueprint.skillIds.length} skills selected
                    </p>
                    <button
                      onClick={() => setWorkshopMode('testing')}
                      className="px-4 py-2 rounded-xl border border-[var(--border)] hover:border-[var(--brand)] transition"
                    >
                      Configure Skills
                    </button>
                  </div>
                )
              case 'tools':
                return (
                  <div className="text-sm text-[var(--text-secondary)]">
                    <p>Tools section - {primaryBlueprint.toolIds.length} tools selected</p>
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
        <LivePreview blueprint={primaryBlueprint} isOpen={previewOpen} onToggle={() => setPreviewOpen(!previewOpen)} />
      </div>
    </div>
  )
}
