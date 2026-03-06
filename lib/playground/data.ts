import type { SkillCatalogItem } from '@/lib/skills/types'
import { getSkillById } from '@/lib/skills/catalog'

export interface PlaygroundScenario {
  id: string
  title: string
  description: string
  prompt: string
}

const PLAYGROUND_SKILL_IDS = [
  'brainstorming',
  'systematic-debugging',
  'writing-plans',
  'test-driven-development',
  'find-skills',
] as const

export const PLAYGROUND_SCENARIOS: PlaygroundScenario[] = [
  {
    id: 'debug-button-click',
    title: 'Debug: button click does nothing',
    description: 'Investigate a silent UI regression and explain the likely root cause.',
    prompt: [
      'A React button labeled "Save changes" no longer does anything when clicked.',
      'There is no browser error, but users say the form never submits.',
      'Walk through how you would investigate this, identify likely failure points, and propose the safest fix.',
    ].join('\n'),
  },
  {
    id: 'plan-user-auth',
    title: 'Plan: add user authentication',
    description: 'Turn a broad feature request into a concrete implementation plan.',
    prompt: [
      'We need to add user authentication to a Next.js app that currently has no auth.',
      'Write a concise implementation plan with major milestones, trade-offs, and verification steps.',
      'Assume the product needs email sign-in, protected routes, and role-aware admin pages.',
    ].join('\n'),
  },
  {
    id: 'find-deployment-skill',
    title: 'Discover: deployment workflow',
    description: 'Recommend the best skill or workflow for shipping a production deployment.',
    prompt: [
      'Find the best existing skill or workflow to help deploy a web app safely.',
      'Explain why it fits, what it would cover, and how a developer should use it for release readiness.',
    ].join('\n'),
  },
]

export function getPlaygroundSkills(): SkillCatalogItem[] {
  return PLAYGROUND_SKILL_IDS.map((id) => getSkillById(id)).filter(
    (skill): skill is SkillCatalogItem => Boolean(skill),
  )
}

export function getPlaygroundScenarioById(id: string): PlaygroundScenario | undefined {
  return PLAYGROUND_SCENARIOS.find((scenario) => scenario.id === id)
}
