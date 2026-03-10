import type {
  SkillCatalogItem,
  SkillDiscoverySuggestion,
  SkillPresentationLane,
  SkillPresentationMeta,
  SkillSourceId,
} from '@/lib/skills/types'

const OBRA_REPO_URL = 'https://github.com/obra/superpowers'
const OBRA_PAGE_URL = 'https://skills.sh/obra/superpowers'
const VERCEL_SKILLS_REPO_URL = 'https://github.com/vercel-labs/skills'
const VERCEL_SKILLS_PAGE_URL = 'https://skills.sh/vercel-labs/skills'
const VERCEL_AGENT_SKILLS_REPO_URL = 'https://github.com/vercel-labs/agent-skills'
const VERCEL_AGENT_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/vercel'
const VERCEL_AGENT_BROWSER_REPO_URL = 'https://github.com/vercel-labs/agent-browser'
const VERCEL_AGENT_BROWSER_PAGE_URL = 'https://mcpservers.org/agent-skills/vercel'
const NEON_SKILLS_REPO_URL = 'https://github.com/neondatabase/agent-skills'
const NEON_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/neondatabase'
const IOS_SIM_REPO_URL = 'https://github.com/conorluddy/ios-simulator-skill'
const IOS_SIM_PAGE_URL = 'https://mcpservers.org/agent-skills/conorluddy'
const STRIPE_SKILLS_REPO_URL = 'https://github.com/stripe/ai'
const STRIPE_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/stripe'
const HF_SKILLS_REPO_URL = 'https://github.com/huggingface/skills'
const HF_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/huggingface'
const ELEVENLABS_SKILLS_REPO_URL = 'https://github.com/elevenlabs/skills'
const ELEVENLABS_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/elevenlabs'
const GOOGLE_SKILLS_REPO_URL = 'https://github.com/nichochar/gws'
const GOOGLE_SKILLS_PAGE_URL = 'https://mcpservers.org/agent-skills/author/google'

const SKILL_PRESENTATION_LANES: Partial<Record<string, SkillPresentationLane>> = {
  brainstorming: 'popular',
  'systematic-debugging': 'popular',
  'writing-plans': 'popular',
  'test-driven-development': 'popular',
  'executing-plans': 'trending',
  'requesting-code-review': 'trending',
  'using-superpowers': 'recent',
  'subagent-driven-development': 'trending',
  'receiving-code-review': 'recent',
  'verification-before-completion': 'popular',
  'using-git-worktrees': 'recent',
  'writing-skills': 'trending',
  'dispatching-parallel-agents': 'trending',
  'finishing-a-development-branch': 'recent',
  'find-skills': 'popular',
  'vercel-deploy': 'popular',
  'react-best-practices': 'popular',
  'web-design-guidelines': 'trending',
  'agent-browser': 'trending',
  'neon-postgres': 'trending',
  'stripe-best-practices': 'popular',
  'ios-simulator-skill': 'recent',
  'hugging-face-cli': 'recent',
  'hugging-face-model-trainer': 'recent',
  'elevenlabs-agents': 'trending',
  'elevenlabs-text-to-speech': 'recent',
  'elevenlabs-sound-effects': 'recent',
  'gws-gmail': 'popular',
  'gws-calendar': 'popular',
  'gws-drive': 'trending',
  'gws-sheets': 'trending',
  'gws-docs': 'recent',
}

const SKILL_UPDATED_LABELS: Partial<Record<string, string>> = {
  brainstorming: 'Updated for early scoping sessions',
  'systematic-debugging': 'Refined for evidence-first debugging',
  'writing-plans': 'Tuned for plan-mode workflows',
  'test-driven-development': 'Fresh test-first guidance',
  'executing-plans': 'Expanded for multi-step delivery',
  'requesting-code-review': 'Sharper review handoff copy',
  'using-superpowers': 'Updated workflow selection guidance',
  'subagent-driven-development': 'Parallel delegation patterns refreshed',
  'receiving-code-review': 'Review triage patterns tightened',
  'verification-before-completion': 'Release-readiness checks clarified',
  'using-git-worktrees': 'Isolation workflow updated',
  'writing-skills': 'Skill-authoring rubric refined',
  'dispatching-parallel-agents': 'Agent split heuristics refreshed',
  'finishing-a-development-branch': 'Branch wrap-up flow polished',
  'find-skills': 'Discovery prompts refreshed',
  'vercel-deploy': 'One-command deploy to Vercel',
  'react-best-practices': '58 rules across 8 categories by Vercel',
  'web-design-guidelines': 'Web Interface Guidelines compliance',
  'agent-browser': 'Accessibility-first browser automation',
  'neon-postgres': 'Serverless Postgres with branching',
  'stripe-best-practices': 'Latest Stripe API patterns',
  'ios-simulator-skill': 'Accessibility-driven iOS automation',
  'hugging-face-cli': 'Hub operations via hf CLI',
  'hugging-face-model-trainer': 'TRL fine-tuning on HF Jobs',
  'elevenlabs-agents': 'Voice AI agent builder',
  'elevenlabs-text-to-speech': '70+ language TTS synthesis',
  'elevenlabs-sound-effects': 'AI sound effect generation',
  'gws-gmail': 'Gmail send, read, and manage',
  'gws-calendar': 'Calendar events and scheduling',
  'gws-drive': 'Drive file and folder management',
  'gws-sheets': 'Spreadsheet read and write',
  'gws-docs': 'Document read and write',
}

const SOURCE_CREATORS: Record<SkillSourceId, { name: string; handle: string }> = {
  'obra/superpowers': { name: 'Obra', handle: '@obra' },
  'vercel-labs/skills': { name: 'Vercel Labs', handle: '@vercel-labs' },
  'vercel-labs/agent-skills': { name: 'Vercel', handle: '@vercel' },
  'vercel-labs/agent-browser': { name: 'Vercel', handle: '@vercel' },
  'neondatabase/agent-skills': { name: 'Neon', handle: '@neondatabase' },
  'conorluddy/ios-simulator-skill': { name: 'Conor Luddy', handle: '@conorluddy' },
  'stripe/ai': { name: 'Stripe', handle: '@stripe' },
  'huggingface/skills': { name: 'Hugging Face', handle: '@huggingface' },
  'elevenlabs/skills': { name: 'ElevenLabs', handle: '@elevenlabs' },
  'google/skills': { name: 'Google', handle: '@google' },
}

function buildRepoInstallCommand(repoUrl: string, skillSlug: string): string {
  return `pnpm dlx skills add ${repoUrl} --skill ${skillSlug} -g -y`
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

function thirdPartySkill(
  sourceId: SkillSourceId,
  repoUrl: string,
  pageUrl: string,
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
    sourceId,
    sourceLabel: sourceId,
    sourceRepoUrl: repoUrl,
    sourcePageUrl: pageUrl,
    skillPageUrl: `${pageUrl}/${slug}`,
    installCommand: buildRepoInstallCommand(repoUrl, slug),
  }
}

const vercelAgentSkill = (
  slug: string,
  title: string,
  shortDescription: string,
  starterPrompt: string,
  useCases: string[],
  tags: string[],
  icon: string,
) =>
  thirdPartySkill(
    'vercel-labs/agent-skills',
    VERCEL_AGENT_SKILLS_REPO_URL,
    VERCEL_AGENT_SKILLS_PAGE_URL,
    slug,
    title,
    shortDescription,
    starterPrompt,
    useCases,
    tags,
    icon,
  )

const elevenlabsSkill = (
  slug: string,
  title: string,
  shortDescription: string,
  starterPrompt: string,
  useCases: string[],
  tags: string[],
  icon: string,
) =>
  thirdPartySkill(
    'elevenlabs/skills',
    ELEVENLABS_SKILLS_REPO_URL,
    ELEVENLABS_SKILLS_PAGE_URL,
    slug,
    title,
    shortDescription,
    starterPrompt,
    useCases,
    tags,
    icon,
  )

const hfSkill = (
  slug: string,
  title: string,
  shortDescription: string,
  starterPrompt: string,
  useCases: string[],
  tags: string[],
  icon: string,
) =>
  thirdPartySkill(
    'huggingface/skills',
    HF_SKILLS_REPO_URL,
    HF_SKILLS_PAGE_URL,
    slug,
    title,
    shortDescription,
    starterPrompt,
    useCases,
    tags,
    icon,
  )

const googleSkill = (
  slug: string,
  title: string,
  shortDescription: string,
  starterPrompt: string,
  useCases: string[],
  tags: string[],
  icon: string,
) =>
  thirdPartySkill(
    'google/skills',
    GOOGLE_SKILLS_REPO_URL,
    GOOGLE_SKILLS_PAGE_URL,
    slug,
    title,
    shortDescription,
    starterPrompt,
    useCases,
    tags,
    icon,
  )

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

  // ── Vercel Agent Skills ─────────────────────────────────────
  vercelAgentSkill(
    'vercel-deploy',
    'Vercel Deploy',
    'Deploy applications and websites to Vercel with a single command.',
    'Deploy this app to Vercel, return the preview URL and claimable deployment link.',
    ['Preview deployments', 'Production deploys', 'Quick hosting'],
    ['deployment', 'vercel', 'hosting'],
    'lucide:rocket',
  ),
  vercelAgentSkill(
    'react-best-practices',
    'React Best Practices',
    'React and Next.js performance optimization — 58 rules across 8 categories.',
    'Review this code against Vercel React best practices and suggest performance improvements.',
    ['Bundle optimization', 'Re-render fixes', 'Server component patterns'],
    ['react', 'nextjs', 'performance'],
    'lucide:gauge',
  ),
  vercelAgentSkill(
    'web-design-guidelines',
    'Web Design Guidelines',
    'Review UI code for Web Interface Guidelines compliance.',
    'Review this UI code against Web Interface Guidelines and report findings.',
    ['Accessibility audit', 'UX review', 'Design compliance'],
    ['design', 'accessibility', 'ux'],
    'lucide:palette',
  ),
  thirdPartySkill(
    'vercel-labs/agent-browser',
    VERCEL_AGENT_BROWSER_REPO_URL,
    VERCEL_AGENT_BROWSER_PAGE_URL,
    'agent-browser',
    'Agent Browser',
    'Automate browser interactions for testing, form filling, screenshots, and data extraction.',
    'Use agent-browser to navigate this web page, interact with elements, and extract data.',
    ['Web testing', 'Form automation', 'Visual regression'],
    ['browser', 'automation', 'testing'],
    'lucide:monitor-play',
  ),

  // ── Database ────────────────────────────────────────────────
  thirdPartySkill(
    'neondatabase/agent-skills',
    NEON_SKILLS_REPO_URL,
    NEON_SKILLS_PAGE_URL,
    'neon-postgres',
    'Neon Serverless Postgres',
    'Guides and best practices for Neon — branching, serverless driver, CLI, and Auth.',
    'Set up and configure Neon Serverless Postgres with best practices for this project.',
    ['Database branching', 'Serverless driver setup', 'Connection pooling'],
    ['postgres', 'neon', 'database', 'serverless'],
    'lucide:database',
  ),

  // ── Payments ────────────────────────────────────────────────
  thirdPartySkill(
    'stripe/ai',
    STRIPE_SKILLS_REPO_URL,
    STRIPE_SKILLS_PAGE_URL,
    'stripe-best-practices',
    'Stripe Best Practices',
    'Best practices for Stripe integrations — Checkout, subscriptions, webhooks, and Connect.',
    'Review this Stripe integration and suggest improvements following current best practices.',
    ['Checkout flows', 'Subscription billing', 'Connect platforms'],
    ['stripe', 'payments', 'billing'],
    'lucide:credit-card',
  ),

  // ── Mobile ──────────────────────────────────────────────────
  thirdPartySkill(
    'conorluddy/ios-simulator-skill',
    IOS_SIM_REPO_URL,
    IOS_SIM_PAGE_URL,
    'ios-simulator-skill',
    'iOS Simulator',
    'Build, test, and automate iOS apps using accessibility-driven navigation.',
    'Use the iOS Simulator skill to navigate, test, and automate this iOS app.',
    ['iOS testing', 'Accessibility audit', 'Simulator automation'],
    ['ios', 'mobile', 'simulator', 'testing'],
    'lucide:smartphone',
  ),

  // ── AI / ML ─────────────────────────────────────────────────
  hfSkill(
    'hugging-face-cli',
    'Hugging Face CLI',
    'Download models/datasets, upload files, create repos, and manage HF Hub cache.',
    'Use the Hugging Face CLI to download this model and set up the local environment.',
    ['Model downloads', 'Dataset management', 'Hub uploads'],
    ['huggingface', 'ml', 'models'],
    'lucide:box',
  ),
  hfSkill(
    'hugging-face-model-trainer',
    'HF Model Trainer',
    'Train or fine-tune LLMs using TRL on Hugging Face Jobs infrastructure.',
    'Fine-tune this model using TRL with the appropriate training method and dataset.',
    ['SFT training', 'DPO/GRPO tuning', 'GGUF conversion'],
    ['training', 'fine-tuning', 'llm'],
    'lucide:cpu',
  ),

  // ── Voice / Audio ───────────────────────────────────────────
  elevenlabsSkill(
    'elevenlabs-agents',
    'ElevenLabs Agents',
    'Build voice AI agents with natural conversations, multiple LLM providers, and custom tools.',
    'Create a voice AI agent with ElevenLabs that handles natural conversations.',
    ['Voice assistants', 'Customer service bots', 'Interactive characters'],
    ['voice', 'agents', 'conversational-ai'],
    'lucide:mic',
  ),
  elevenlabsSkill(
    'elevenlabs-text-to-speech',
    'ElevenLabs TTS',
    'Convert text to speech in 70+ languages with natural-sounding voices.',
    'Generate speech audio from this text using ElevenLabs voices.',
    ['Voiceovers', 'Audio narration', 'Accessibility reads'],
    ['tts', 'speech', 'audio'],
    'lucide:volume-2',
  ),
  elevenlabsSkill(
    'elevenlabs-sound-effects',
    'ElevenLabs SFX',
    'Generate sound effects from text descriptions — ambient sounds, impacts, UI sounds.',
    'Generate a sound effect from this description using ElevenLabs.',
    ['Game audio', 'UI sounds', 'Ambient textures'],
    ['sound-effects', 'audio', 'generation'],
    'lucide:audio-waveform',
  ),

  // ── Google Workspace ────────────────────────────────────────
  googleSkill(
    'gws-gmail',
    'Gmail',
    'Send, read, and manage Gmail — messages, labels, filters, and drafts.',
    'Use Gmail skills to send an email, triage inbox, or manage labels.',
    ['Send emails', 'Inbox triage', 'Label management'],
    ['gmail', 'email', 'google'],
    'lucide:mail',
  ),
  googleSkill(
    'gws-calendar',
    'Google Calendar',
    'Manage calendars, events, scheduling, and free/busy lookups.',
    'Use Google Calendar to create events, find free time, or manage scheduling.',
    ['Event creation', 'Free/busy lookup', 'Recurring events'],
    ['calendar', 'scheduling', 'google'],
    'lucide:calendar',
  ),
  googleSkill(
    'gws-drive',
    'Google Drive',
    'Manage files, folders, shared drives, and permissions.',
    'Use Google Drive to organize files, manage sharing, or search documents.',
    ['File management', 'Shared drives', 'Permission control'],
    ['drive', 'files', 'google'],
    'lucide:hard-drive',
  ),
  googleSkill(
    'gws-sheets',
    'Google Sheets',
    'Read and write spreadsheets — cell values, formulas, and formatting.',
    'Use Google Sheets to read data, append rows, or create a tracking spreadsheet.',
    ['Data extraction', 'Row appending', 'Spreadsheet creation'],
    ['sheets', 'spreadsheet', 'google'],
    'lucide:table',
  ),
  googleSkill(
    'gws-docs',
    'Google Docs',
    'Read and write Google Docs — create, edit, and format documents.',
    'Use Google Docs to create a document, append content, or read existing docs.',
    ['Document creation', 'Content editing', 'Template filling'],
    ['docs', 'documents', 'google'],
    'lucide:file-text',
  ),
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
  {
    id: 'voice-ai',
    title: 'Voice AI',
    description: 'Find skills for text-to-speech, voice agents, or sound generation.',
    query: 'voice ai text to speech',
  },
  {
    id: 'ios-mobile',
    title: 'iOS Development',
    description: 'Find skills for iOS Simulator automation, testing, and accessibility.',
    query: 'ios simulator mobile',
  },
  {
    id: 'stripe-payments',
    title: 'Stripe Payments',
    description: 'Find skills for Stripe Checkout, subscriptions, and payment best practices.',
    query: 'stripe payments',
  },
  {
    id: 'google-workspace',
    title: 'Google Workspace',
    description: 'Find skills for Gmail, Calendar, Drive, Sheets, and Docs automation.',
    query: 'google workspace',
  },
  {
    id: 'database-postgres',
    title: 'Postgres / Neon',
    description: 'Find skills for serverless Postgres, branching, and database management.',
    query: 'postgres neon database',
  },
]

const SOURCE_BRAND_ICONS: Partial<Record<SkillSourceId, string>> = {
  'vercel-labs/skills': 'simple-icons:vercel',
  'vercel-labs/agent-skills': 'simple-icons:vercel',
  'vercel-labs/agent-browser': 'simple-icons:vercel',
  'stripe/ai': 'simple-icons:stripe',
  'google/skills': 'simple-icons:google',
}

export function getSkillDisplayIcon(skill: SkillCatalogItem): string {
  return SOURCE_BRAND_ICONS[skill.sourceId] ?? skill.icon
}

export function getSkillPresentationMeta(skill: SkillCatalogItem): SkillPresentationMeta {
  const creator = SOURCE_CREATORS[skill.sourceId]
  return {
    lane: SKILL_PRESENTATION_LANES[skill.id] ?? 'popular',
    creatorName: creator.name,
    creatorHandle: creator.handle,
    updatedLabel: SKILL_UPDATED_LABELS[skill.id] ?? 'Curated reusable workflow',
    collectionLabel: skill.useCases[0] ?? 'Reusable workflow',
  }
}

export function getSkillById(skillId: string): SkillCatalogItem | undefined {
  return SKILLS_CATALOG.find((skill) => skill.id === skillId)
}

export function getSkillBySlug(slug: string): SkillCatalogItem | undefined {
  const normalized = slug.trim().toLowerCase()
  return SKILLS_CATALOG.find((skill) => skill.slug.toLowerCase() === normalized)
}
