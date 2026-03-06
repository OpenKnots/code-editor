import { getPersonaPresetById } from '@/lib/agent-personas'
import { getSkillById } from '@/lib/skills/catalog'

interface BuildPlaygroundSystemPromptParams {
  personaId: string
  skillIds: string[]
  customPrompt?: string
}

function buildSkillInstructionsBlock(skillIds: string[]): string {
  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillById>> => Boolean(skill))

  if (skills.length === 0) {
    return [
      '## Active Skill Workflows',
      'No extra skill workflows are equipped. Solve the task with the selected persona only.',
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
    '',
    'Execution requirements:',
    '- Stay aligned to the selected persona.',
    '- Keep the answer concrete and action-oriented.',
    '- Call out risks, missing information, or verification steps before finishing.',
  ].join('\n')
}

export function buildPlaygroundSystemPrompt({
  personaId,
  skillIds,
  customPrompt,
}: BuildPlaygroundSystemPromptParams): string {
  const personaPrompt =
    customPrompt?.trim() ||
    getPersonaPresetById(personaId)?.prompt ||
    getPersonaPresetById('fullstack')?.prompt ||
    ''

  return [personaPrompt.trim(), buildSkillInstructionsBlock(skillIds)].filter(Boolean).join('\n\n')
}
