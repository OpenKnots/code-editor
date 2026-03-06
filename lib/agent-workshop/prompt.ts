import { getPersonaPresetById } from '@/lib/agent-personas'
import {
  WORKSHOP_AUTOMATION_CATALOG,
  WORKSHOP_GUARDRAIL_PROFILES,
  WORKSHOP_TONE_OPTIONS,
  WORKSHOP_TOOL_CATALOG,
  WORKSHOP_WORKFLOW_CATALOG,
} from '@/lib/agent-workshop/catalog'
import type { WorkshopBlueprint } from '@/lib/agent-workshop/types'
import { getSkillById } from '@/lib/skills/catalog'

function buildSkillInstructionsBlock(skillIds: string[]): string {
  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillById>> => Boolean(skill))

  if (skills.length === 0) {
    return [
      '## Active Skill Workflows',
      'No extra skill workflows are equipped. Solve the task with the selected persona and guardrails only.',
    ].join('\n')
  }

  return [
    '## Active Skill Workflows',
    'Apply the following workflows explicitly while solving the task.',
    ...skills.flatMap((skill, index) => [
      '',
      `${index + 1}. **${skill.title}**`,
      `Summary: ${skill.shortDescription}`,
      `Starter instruction: ${skill.starterPrompt}`,
      'Workflow focus:',
      ...skill.useCases.map((useCase) => `- ${useCase}`),
    ]),
  ].join('\n')
}

function buildCatalogSection(
  title: string,
  lines: string[],
  emptyLine: string,
): string {
  return [title, ...(lines.length > 0 ? lines : [emptyLine])].join('\n')
}

export function buildWorkshopSystemPrompt(blueprint: WorkshopBlueprint): string {
  const personaPrompt =
    blueprint.identity.customPrompt.trim() ||
    getPersonaPresetById(blueprint.identity.personaId)?.prompt ||
    getPersonaPresetById('fullstack')?.prompt ||
    ''

  const tone = WORKSHOP_TONE_OPTIONS.find((option) => option.id === blueprint.identity.toneId)
  const tools = WORKSHOP_TOOL_CATALOG.filter((tool) => blueprint.toolIds.includes(tool.id))
  const workflows = WORKSHOP_WORKFLOW_CATALOG.filter((workflow) =>
    blueprint.workflowIds.includes(workflow.id),
  )
  const automations = WORKSHOP_AUTOMATION_CATALOG.filter((automation) =>
    blueprint.automationIds.includes(automation.id),
  )
  const guardrailProfile = WORKSHOP_GUARDRAIL_PROFILES.find(
    (profile) => profile.id === blueprint.guardrails.profileId,
  )

  const capabilityLines = tools.map((tool) => `- ${tool.label}: ${tool.promptInstruction}`)
  const workflowLines = workflows.map(
    (workflow, index) => `${index + 1}. ${workflow.label} - ${workflow.promptInstruction}`,
  )
  const automationLines = automations.map(
    (automation) => `- ${automation.label}: ${automation.promptInstruction}`,
  )

  const guardrailLines = [
    `- Guardrail profile: ${guardrailProfile?.label ?? 'Balanced'} - ${guardrailProfile?.description ?? ''}`.trim(),
    blueprint.guardrails.requirePlan
      ? '- Require an explicit plan when scope or architecture is non-trivial.'
      : '- Plans are optional when the task is clearly bounded.',
    blueprint.guardrails.requireDiffReview
      ? '- Prefer reviewable diffs and user-visible change summaries before applying impactful edits.'
      : '- Small changes may proceed with lighter review ceremony.',
    blueprint.guardrails.requireSecurityReview
      ? '- Surface security concerns and trust-boundary risks proactively.'
      : '- Security review is context-sensitive rather than mandatory.',
    blueprint.guardrails.allowTerminal
      ? '- Terminal workflows are allowed when they materially improve evidence or verification.'
      : '- Avoid terminal workflows unless the user asks for them explicitly.',
    blueprint.guardrails.allowNetworkResearch
      ? '- Live documentation and web research are available when local context is insufficient.'
      : '- Prefer local repository context over external browsing.',
    blueprint.guardrails.allowGitActions
      ? '- Git operations are allowed when they are safe and aligned to the user request.'
      : '- Do not take git actions unless the user explicitly asks.',
  ]

  return [
    personaPrompt.trim(),
    [
      '## Workshop Identity',
      `Name: ${blueprint.identity.name || 'Unnamed Agent'}`,
      `Tagline: ${blueprint.identity.tagline || 'No tagline set.'}`,
      `Mission: ${blueprint.identity.mission || 'No mission set.'}`,
      `Tone: ${tone?.label ?? 'Decisive'} - ${tone?.description ?? ''}`.trim(),
    ].join('\n'),
    buildSkillInstructionsBlock(blueprint.skillIds),
    buildCatalogSection(
      '## Enabled Tools',
      capabilityLines,
      '- Use only the default editor/chat capabilities.',
    ),
    buildCatalogSection(
      '## Workflow Spine',
      workflowLines,
      '- Use a simple request-response workflow with no added orchestration.',
    ),
    buildCatalogSection(
      '## Automation Posture',
      automationLines,
      '- No extra automation rules are enabled.',
    ),
    buildCatalogSection('## Guardrails', guardrailLines, '- Follow the repository defaults.'),
    [
      '## Operating Principles',
      '- Keep the experience emotionally reassuring, but never vague.',
      '- Make progress visible through clear summaries, milestones, and next steps.',
      '- Balance ambition with secure-by-default behavior.',
      '- Prefer modular composition over one giant prompt blob when explaining behavior.',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function calculateWorkshopReadiness(blueprint: WorkshopBlueprint): {
  score: number
  completed: number
  total: number
  callout: string
} {
  const checks = [
    blueprint.identity.name.trim().length > 0,
    blueprint.identity.mission.trim().length > 0,
    blueprint.skillIds.length > 0,
    blueprint.toolIds.length > 0,
    blueprint.workflowIds.length > 0,
    blueprint.automationIds.length > 0,
    blueprint.guardrails.profileId.length > 0,
    blueprint.evaluation.prompt.trim().length > 0,
  ]

  const completed = checks.filter(Boolean).length
  const total = checks.length
  const score = Math.round((completed / total) * 100)

  let callout = 'Blueprint feels early.'
  if (score >= 90) callout = 'Ready to run.'
  else if (score >= 75) callout = 'Strong shape, needs final polish.'
  else if (score >= 50) callout = 'Solid foundation, still missing a few modules.'

  return { score, completed, total, callout }
}
