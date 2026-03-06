import { PERSONA_PRESETS } from '@/lib/agent-personas'
import { PLAYGROUND_SCENARIOS } from '@/lib/playground/data'

export const AGENT_WORKSHOP_SCHEMA_VERSION = 1
export const AGENT_WORKSHOP_STORAGE_KEY = 'code-editor:agent-workshop'
export const MAX_SAVED_WORKSHOP_BLUEPRINTS = 4

export type WorkshopStageId =
  | 'identity'
  | 'skills'
  | 'tools'
  | 'workflow'
  | 'automation'
  | 'guardrails'
  | 'evaluation'

export type WorkshopToneId = 'decisive' | 'empathetic' | 'rigorous' | 'visionary'
export type WorkshopGuardrailProfileId = 'safe' | 'balanced' | 'autonomous'
export type WorkshopToolId =
  | 'repo-context'
  | 'editor-refactor'
  | 'terminal-runner'
  | 'git-operator'
  | 'doc-research'
  | 'verification-loop'
export type WorkshopWorkflowId =
  | 'discover'
  | 'plan'
  | 'execute'
  | 'review'
  | 'handoff'
export type WorkshopAutomationId =
  | 'preflight'
  | 'post-change'
  | 'release-gate'
  | 'follow-through'

export interface WorkshopBlueprintIdentity {
  name: string
  tagline: string
  personaId: string
  mission: string
  toneId: WorkshopToneId
  customPrompt: string
}

export interface WorkshopGuardrails {
  profileId: WorkshopGuardrailProfileId
  requirePlan: boolean
  requireDiffReview: boolean
  requireSecurityReview: boolean
  allowTerminal: boolean
  allowNetworkResearch: boolean
  allowGitActions: boolean
}

export interface WorkshopEvaluationConfig {
  scenarioId: string
  prompt: string
}

export interface WorkshopBlueprint {
  id: string
  createdAt: number
  updatedAt: number
  identity: WorkshopBlueprintIdentity
  skillIds: string[]
  toolIds: WorkshopToolId[]
  workflowIds: WorkshopWorkflowId[]
  automationIds: WorkshopAutomationId[]
  guardrails: WorkshopGuardrails
  evaluation: WorkshopEvaluationConfig
}

export interface WorkshopSavedBlueprint {
  id: string
  label: string
  savedAt: number
  blueprint: WorkshopBlueprint
}

export interface WorkshopDocument {
  version: number
  updatedAt: number
  lastSavedAt: number | null
  compareMode: boolean
  primaryBlueprint: WorkshopBlueprint
  challengerBlueprint: WorkshopBlueprint
  savedBlueprints: WorkshopSavedBlueprint[]
}

function buildWorkshopId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_PERSONA_ID = PERSONA_PRESETS[0]?.id ?? 'fullstack'
const DEFAULT_SCENARIO = PLAYGROUND_SCENARIOS[0]

export function createDefaultWorkshopBlueprint(
  overrides: Partial<WorkshopBlueprint> = {},
): WorkshopBlueprint {
  const now = Date.now()
  const base: WorkshopBlueprint = {
    id: buildWorkshopId('blueprint'),
    createdAt: now,
    updatedAt: now,
    identity: {
      name: 'North Star Agent',
      tagline: 'Design with taste. Execute with discipline.',
      personaId: DEFAULT_PERSONA_ID,
      mission:
        'Help me design, implement, and verify high-leverage software changes without losing clarity.',
      toneId: 'decisive',
      customPrompt: '',
    },
    skillIds: ['writing-plans', 'verification-before-completion'],
    toolIds: ['repo-context', 'editor-refactor', 'verification-loop'],
    workflowIds: ['discover', 'plan', 'review'],
    automationIds: ['preflight', 'post-change'],
    guardrails: {
      profileId: 'balanced',
      requirePlan: true,
      requireDiffReview: true,
      requireSecurityReview: true,
      allowTerminal: false,
      allowNetworkResearch: false,
      allowGitActions: false,
    },
    evaluation: {
      scenarioId: DEFAULT_SCENARIO?.id ?? 'custom',
      prompt: DEFAULT_SCENARIO?.prompt ?? '',
    },
  }

  return {
    ...base,
    ...overrides,
    identity: { ...base.identity, ...(overrides.identity ?? {}) },
    guardrails: { ...base.guardrails, ...(overrides.guardrails ?? {}) },
    evaluation: { ...base.evaluation, ...(overrides.evaluation ?? {}) },
    skillIds: overrides.skillIds ? [...overrides.skillIds] : base.skillIds,
    toolIds: overrides.toolIds ? [...overrides.toolIds] : base.toolIds,
    workflowIds: overrides.workflowIds ? [...overrides.workflowIds] : base.workflowIds,
    automationIds: overrides.automationIds ? [...overrides.automationIds] : base.automationIds,
  }
}

export function cloneWorkshopBlueprint(blueprint: WorkshopBlueprint): WorkshopBlueprint {
  return {
    ...blueprint,
    identity: { ...blueprint.identity },
    skillIds: [...blueprint.skillIds],
    toolIds: [...blueprint.toolIds],
    workflowIds: [...blueprint.workflowIds],
    automationIds: [...blueprint.automationIds],
    guardrails: { ...blueprint.guardrails },
    evaluation: { ...blueprint.evaluation },
  }
}

export function createDefaultWorkshopDocument(): WorkshopDocument {
  const primaryBlueprint = createDefaultWorkshopBlueprint()
  const challengerBlueprint = createDefaultWorkshopBlueprint({
    identity: {
      name: 'Challenger Variant',
      tagline: 'Push harder, but keep the signal high.',
      personaId: 'architect',
      mission:
        'Stress-test the primary design with stronger systems thinking and a more aggressive validation loop.',
      toneId: 'rigorous',
      customPrompt: '',
    },
    skillIds: ['systematic-debugging', 'verification-before-completion'],
    toolIds: ['repo-context', 'verification-loop', 'doc-research'],
    workflowIds: ['discover', 'review', 'handoff'],
    automationIds: ['preflight', 'release-gate'],
  })

  return {
    version: AGENT_WORKSHOP_SCHEMA_VERSION,
    updatedAt: Date.now(),
    lastSavedAt: null,
    compareMode: false,
    primaryBlueprint,
    challengerBlueprint,
    savedBlueprints: [],
  }
}

function normalizeBlueprint(input: unknown, fallback: WorkshopBlueprint): WorkshopBlueprint {
  if (!input || typeof input !== 'object') return fallback
  const raw = input as Partial<WorkshopBlueprint>

  return createDefaultWorkshopBlueprint({
    ...fallback,
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : fallback.id,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : fallback.updatedAt,
    identity: {
      ...fallback.identity,
      ...(raw.identity ?? {}),
    },
    skillIds: Array.isArray(raw.skillIds)
      ? raw.skillIds.filter((value): value is string => typeof value === 'string')
      : fallback.skillIds,
    toolIds: Array.isArray(raw.toolIds)
      ? raw.toolIds.filter((value): value is WorkshopToolId => typeof value === 'string')
      : fallback.toolIds,
    workflowIds: Array.isArray(raw.workflowIds)
      ? raw.workflowIds.filter((value): value is WorkshopWorkflowId => typeof value === 'string')
      : fallback.workflowIds,
    automationIds: Array.isArray(raw.automationIds)
      ? raw.automationIds.filter((value): value is WorkshopAutomationId => typeof value === 'string')
      : fallback.automationIds,
    guardrails: {
      ...fallback.guardrails,
      ...(raw.guardrails ?? {}),
    },
    evaluation: {
      ...fallback.evaluation,
      ...(raw.evaluation ?? {}),
    },
  })
}

export function normalizeWorkshopDocument(input: unknown): WorkshopDocument {
  const fallback = createDefaultWorkshopDocument()
  if (!input || typeof input !== 'object') return fallback

  const raw = input as Partial<WorkshopDocument>
  const savedBlueprints = Array.isArray(raw.savedBlueprints)
    ? raw.savedBlueprints
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const saved = entry as Partial<WorkshopSavedBlueprint>
          return {
            id: typeof saved.id === 'string' ? saved.id : buildWorkshopId('saved'),
            label: typeof saved.label === 'string' ? saved.label : 'Saved blueprint',
            savedAt: typeof saved.savedAt === 'number' ? saved.savedAt : Date.now(),
            blueprint: normalizeBlueprint(saved.blueprint, fallback.primaryBlueprint),
          } satisfies WorkshopSavedBlueprint
        })
        .filter((entry): entry is WorkshopSavedBlueprint => Boolean(entry))
        .slice(0, MAX_SAVED_WORKSHOP_BLUEPRINTS)
    : []

  return {
    version:
      typeof raw.version === 'number' ? raw.version : AGENT_WORKSHOP_SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : fallback.updatedAt,
    lastSavedAt: typeof raw.lastSavedAt === 'number' ? raw.lastSavedAt : null,
    compareMode: Boolean(raw.compareMode),
    primaryBlueprint: normalizeBlueprint(raw.primaryBlueprint, fallback.primaryBlueprint),
    challengerBlueprint: normalizeBlueprint(raw.challengerBlueprint, fallback.challengerBlueprint),
    savedBlueprints,
  }
}

export function createSavedBlueprint(blueprint: WorkshopBlueprint): WorkshopSavedBlueprint {
  return {
    id: buildWorkshopId('saved'),
    label: blueprint.identity.name || 'Saved blueprint',
    savedAt: Date.now(),
    blueprint: cloneWorkshopBlueprint(blueprint),
  }
}
