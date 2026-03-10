export type SkillSourceId =
  | 'obra/superpowers'
  | 'vercel-labs/skills'
  | 'vercel-labs/agent-skills'
  | 'vercel-labs/agent-browser'
  | 'neondatabase/agent-skills'
  | 'conorluddy/ios-simulator-skill'
  | 'stripe/ai'
  | 'huggingface/skills'
  | 'elevenlabs/skills'
  | 'google/skills'

export type SkillProviderId = 'gateway' | 'openai' | 'anthropic' | 'generic'

export type SkillActionKind = 'find' | 'install' | 'check' | 'update' | 'use'

export type SkillPresentationLane = 'popular' | 'trending' | 'recent'

export interface SkillPresentationMeta {
  lane: SkillPresentationLane
  creatorName: string
  creatorHandle: string
  updatedLabel: string
  collectionLabel: string
}

export interface SkillCatalogItem {
  id: string
  slug: string
  title: string
  shortDescription: string
  starterPrompt: string
  useCases: string[]
  tags: string[]
  icon: string
  sourceId: SkillSourceId
  sourceLabel: string
  sourceRepoUrl: string
  sourcePageUrl: string
  skillPageUrl: string
  installCommand: string
}

export interface SkillRuntimeState {
  enabled: boolean
  synced: boolean
  syncState: 'idle' | 'running' | 'error'
  syncedAt?: number
  lastUsedAt?: number
  lastCommand?: string
  lastError?: string
}

export type SkillsRuntimeMap = Record<string, SkillRuntimeState>

export interface SkillExecutionPlan {
  kind: SkillActionKind
  label: string
  target: 'terminal' | 'gateway-chat'
  command?: string
  message?: string
  skill?: SkillCatalogItem
  query?: string
}

export interface ParsedSkillCommand {
  kind: SkillActionKind | 'help' | 'list'
  skillSlug?: string
  query?: string
  request?: string
}

export interface SkillDiscoverySuggestion {
  id: string
  title: string
  description: string
  query: string
}

export interface SkillProviderDescriptor {
  id: SkillProviderId
  label: string
  strictToolCalling: boolean
  supportsReasoning: boolean
  prefersXmlPrompting: boolean
}

export interface SkillUseEnvelope {
  provider: SkillProviderDescriptor
  heading: string
  prompt: string
}
