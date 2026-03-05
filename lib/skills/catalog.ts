import type { SkillCatalogItem, SkillDiscoverySuggestion } from '@/lib/skills/types'

const OBRA_REPO_URL = 'https://github.com/obra/superpowers'
const OBRA_PAGE_URL = 'https://skills.sh/obra/superpowers'
const VERCEL_SKILLS_REPO_URL = 'https://github.com/vercel-labs/skills'
const VERCEL_SKILLS_PAGE_URL = 'https://skills.sh/vercel-labs/skills'

function buildRepoInstallCommand(repoUrl: string, skillSlug: string): string {
  return `npx skills add ${repoUrl} --skill ${skillSlug} -g -y`
}

function superpower(
  slug: string,
  title: string,
  shortDescription: string,
  starterPrompt: string,
  useCases: string[],
  tags: string[],
  icon: string,
): SkillCatalogItem {
  return {
    id: slug,
    slug,
    title,
    shortDescription,
    starterPrompt,
    useCases,
    tags,
    icon,
    sourceId: 'obra/superpowers',
    sourceLabel: 'obra/superpowers',
    sourceRepoUrl: OBRA_REPO_URL,
    sourcePageUrl: OBRA_PAGE_URL,
    skillPageUrl: `${OBRA_PAGE_URL}/${slug}`,
    installCommand: buildRepoInstallCommand(OBRA_REPO_URL, slug),
  }
}

export const SKILLS_CATALOG: SkillCatalogItem[] = [
  superpower(
    'brainstorming',
    'Brainstorming',
    'Explore options, constraints, and trade-offs before implementation.',
    'Use structured brainstorming to explore the strongest solution paths before writing code.',
    ['Architecture exploration', 'Feature scoping', 'Trade-off analysis'],
    ['planning', 'ideation', 'architecture'],
    'lucide:lightbulb',
  ),
  superpower(
    'systematic-debugging',
    'Systematic Debugging',
    'Debug from evidence, isolate the failure, and verify the fix.',
    'Apply a systematic debugging loop: reproduce, isolate, instrument, fix the root cause, and verify.',
    ['Bug triage', 'Production regressions', 'Flaky behavior'],
    ['debugging', 'root-cause', 'verification'],
    'lucide:bug',
  ),
  superpower(
    'writing-plans',
    'Writing Plans',
    'Turn ambiguous work into an actionable execution plan.',
    'Write a concise implementation plan with scope, milestones, and verification steps.',
    ['Project planning', 'Implementation breakdown', 'Roadmapping'],
    ['planning', 'execution', 'communication'],
    'lucide:clipboard-list',
  ),
  superpower(
    'test-driven-development',
    'Test-Driven Development',
    'Drive changes with failing tests first, then implement the minimum fix.',
    'Follow a TDD workflow: write a failing test, implement the smallest passing change, and refactor safely.',
    ['New features', 'Regression fixes', 'Safer refactors'],
    ['testing', 'tdd', 'quality'],
    'lucide:test-tube',
  ),
  superpower(
    'executing-plans',
    'Executing Plans',
    'Translate an approved plan into focused implementation work.',
    'Execute an agreed plan step by step, keeping changes scoped and validating along the way.',
    ['Planned feature work', 'Milestone execution', 'Task tracking'],
    ['execution', 'delivery', 'implementation'],
    'lucide:rocket',
  ),
  superpower(
    'requesting-code-review',
    'Requesting Code Review',
    'Prepare code and context so review feedback is high-signal.',
    'Prepare this work for review: surface risks, testing notes, and the questions a reviewer should focus on.',
    ['PR prep', 'Review readiness', 'Risk communication'],
    ['review', 'pr', 'handoff'],
    'lucide:message-square-share',
  ),
  superpower(
    'using-superpowers',
    'Using Superpowers',
    'Choose and apply the right skill workflow for the task at hand.',
    'Select the most relevant skill workflow for this task and apply it before proceeding.',
    ['Workflow selection', 'Process discipline', 'Agent orchestration'],
    ['meta', 'workflow', 'skills'],
    'lucide:sparkles',
  ),
  superpower(
    'subagent-driven-development',
    'Subagent-Driven Development',
    'Split work into focused parallel agents with clear deliverables.',
    'Break this work into subagent-sized tasks, delegate them clearly, and recombine the results.',
    ['Parallel exploration', 'Large tasks', 'Agent orchestration'],
    ['subagents', 'parallel', 'coordination'],
    'lucide:network',
  ),
  superpower(
    'receiving-code-review',
    'Receiving Code Review',
    'Process review feedback methodically and turn it into changes.',
    'Work through code review feedback by grouping themes, confirming intent, and applying the smallest safe fixes.',
    ['Addressing PR comments', 'Follow-up changes', 'Review triage'],
    ['review', 'feedback', 'iteration'],
    'lucide:messages-square',
  ),
  superpower(
    'verification-before-completion',
    'Verification Before Completion',
    'Run the right checks before declaring work done.',
    'Verify the change with the appropriate tests, manual checks, and risk review before completion.',
    ['Release readiness', 'QA checks', 'Final verification'],
    ['verification', 'qa', 'completion'],
    'lucide:shield-check',
  ),
  superpower(
    'using-git-worktrees',
    'Using Git Worktrees',
    'Use git worktrees to isolate parallel branches and experiments.',
    'Plan and execute this task using git worktrees so branches stay isolated and easy to review.',
    ['Parallel branches', 'Large refactors', 'Context isolation'],
    ['git', 'worktrees', 'branching'],
    'lucide:git-branch-plus',
  ),
  superpower(
    'writing-skills',
    'Writing Skills',
    'Author reusable skills with crisp triggers and workflows.',
    'Design a reusable skill with clear triggers, boundaries, and a strong execution checklist.',
    ['Create custom skills', 'Workflow automation', 'Agent guidance'],
    ['skills', 'authoring', 'reusability'],
    'lucide:pencil-ruler',
  ),
  superpower(
    'dispatching-parallel-agents',
    'Dispatching Parallel Agents',
    'Launch parallel agents when exploration or verification can be split safely.',
    'Identify work that can be parallelized and dispatch the right agents with clear, non-overlapping objectives.',
    ['Repo exploration', 'Parallel reviews', 'Batch verification'],
    ['parallel', 'agents', 'throughput'],
    'lucide:workflow',
  ),
  superpower(
    'finishing-a-development-branch',
    'Finishing a Development Branch',
    'Wrap up a branch with verification, cleanup, and review-ready output.',
    'Finish the branch cleanly: summarize changes, verify quality, and prepare the branch for review or merge.',
    ['Branch cleanup', 'Release prep', 'Merge readiness'],
    ['git', 'cleanup', 'delivery'],
    'lucide:flag',
  ),
  {
    id: 'find-skills',
    slug: 'find-skills',
    title: 'Find Skills',
    shortDescription:
      'Search the skills ecosystem, recommend the best match, and provide install commands.',
    starterPrompt:
      'Search for the best existing skills for this task, explain why they fit, and provide install commands.',
    useCases: [
      'Discover new skills',
      'Find domain-specific workflows',
      'Install missing capabilities',
    ],
    tags: ['discovery', 'ecosystem', 'search'],
    icon: 'lucide:search',
    sourceId: 'vercel-labs/skills',
    sourceLabel: 'vercel-labs/skills',
    sourceRepoUrl: VERCEL_SKILLS_REPO_URL,
    sourcePageUrl: VERCEL_SKILLS_PAGE_URL,
    skillPageUrl: `${VERCEL_SKILLS_PAGE_URL}/find-skills`,
    installCommand: buildRepoInstallCommand(VERCEL_SKILLS_REPO_URL, 'find-skills'),
  },
]

export const SKILL_DISCOVERY_SUGGESTIONS: SkillDiscoverySuggestion[] = [
  {
    id: 'react-performance',
    title: 'React Performance',
    description: 'Look for skills covering rendering, bundle size, or UX performance.',
    query: 'react performance',
  },
  {
    id: 'pr-review',
    title: 'PR Review',
    description: 'Find a workflow for preparing, requesting, or addressing reviews.',
    query: 'pr review',
  },
  {
    id: 'deployment',
    title: 'Deployment',
    description: 'Search for skills that help deploy apps or verify release readiness.',
    query: 'deployment',
  },
  {
    id: 'documentation',
    title: 'Documentation',
    description: 'Find skills for changelogs, API docs, or docs maintenance.',
    query: 'documentation',
  },
]

export function getSkillById(skillId: string): SkillCatalogItem | undefined {
  return SKILLS_CATALOG.find((skill) => skill.id === skillId)
}

export function getSkillBySlug(slug: string): SkillCatalogItem | undefined {
  const normalized = slug.trim().toLowerCase()
  return SKILLS_CATALOG.find((skill) => skill.slug.toLowerCase() === normalized)
}
