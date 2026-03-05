import type {
  SkillCatalogItem,
  SkillProviderDescriptor,
  SkillProviderId,
  SkillUseEnvelope,
} from '@/lib/skills/types'

const PROVIDERS: Record<SkillProviderId, SkillProviderDescriptor> = {
  gateway: {
    id: 'gateway',
    label: 'Gateway',
    strictToolCalling: true,
    supportsReasoning: true,
    prefersXmlPrompting: false,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    strictToolCalling: true,
    supportsReasoning: true,
    prefersXmlPrompting: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic-compatible',
    strictToolCalling: true,
    supportsReasoning: true,
    prefersXmlPrompting: true,
  },
  generic: {
    id: 'generic',
    label: 'Generic adapter',
    strictToolCalling: false,
    supportsReasoning: true,
    prefersXmlPrompting: false,
  },
}

export function detectSkillProvider(modelName: string | null | undefined): SkillProviderDescriptor {
  const normalized = modelName?.trim().toLowerCase() ?? ''
  if (!normalized) return PROVIDERS.gateway
  if (
    normalized.includes('gpt') ||
    normalized.includes('o1') ||
    normalized.includes('o3') ||
    normalized.includes('o4') ||
    normalized.includes('openai')
  ) {
    return PROVIDERS.openai
  }
  if (
    normalized.includes('claude') ||
    normalized.includes('opus') ||
    normalized.includes('sonnet') ||
    normalized.includes('haiku') ||
    normalized.includes('anthropic')
  ) {
    return PROVIDERS.anthropic
  }
  if (normalized.includes('gateway')) return PROVIDERS.gateway
  return PROVIDERS.generic
}

function buildSkillChecklist(skill: SkillCatalogItem): string {
  return skill.useCases.map((useCase) => `- ${useCase}`).join('\n')
}

function buildOpenAiPrompt(skill: SkillCatalogItem, request: string): string {
  return [
    `[Skill Workflow] ${skill.title}`,
    '',
    `Follow this skill as an explicit workflow while solving the task below.`,
    `Keep the response direct, action-oriented, and aligned to the skill's intent.`,
    '',
    `Skill summary: ${skill.shortDescription}`,
    `Starter instruction: ${skill.starterPrompt}`,
    '',
    'Use this workflow focus:',
    buildSkillChecklist(skill),
    '',
    'Task:',
    request,
    '',
    'Execution requirements:',
    '- Prefer concrete steps over abstract advice.',
    '- Preserve existing repository conventions.',
    '- Call out risks or missing verification before finishing.',
  ].join('\n')
}

function buildAnthropicPrompt(skill: SkillCatalogItem, request: string): string {
  return [
    '<skill_workflow>',
    `  <name>${skill.title}</name>`,
    `  <summary>${skill.shortDescription}</summary>`,
    `  <starter>${skill.starterPrompt}</starter>`,
    '  <focus>',
    ...skill.useCases.map((useCase) => `    <item>${useCase}</item>`),
    '  </focus>',
    '</skill_workflow>',
    '',
    '<task>',
    request,
    '</task>',
    '',
    'Apply the skill workflow above while solving the task. Be explicit, concise, and implementation-aware.',
  ].join('\n')
}

function buildGenericPrompt(skill: SkillCatalogItem, request: string): string {
  return [
    `Skill: ${skill.title}`,
    skill.shortDescription,
    '',
    `Starter: ${skill.starterPrompt}`,
    '',
    'Workflow focus:',
    buildSkillChecklist(skill),
    '',
    `Task: ${request}`,
  ].join('\n')
}

export function buildSkillUseEnvelope(params: {
  skill: SkillCatalogItem
  request: string
  modelName?: string | null
}): SkillUseEnvelope {
  const provider = detectSkillProvider(params.modelName)
  const prompt = provider.prefersXmlPrompting
    ? buildAnthropicPrompt(params.skill, params.request)
    : provider.id === 'openai'
      ? buildOpenAiPrompt(params.skill, params.request)
      : buildGenericPrompt(params.skill, params.request)

  return {
    provider,
    heading: `Apply ${params.skill.title}`,
    prompt,
  }
}
