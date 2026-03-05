import { getSkillBySlug } from '@/lib/skills/catalog'
import type {
  ParsedSkillCommand,
  SkillCatalogItem,
  SkillExecutionPlan,
  SkillRuntimeState,
  SkillsRuntimeMap,
} from '@/lib/skills/types'

export const SKILLS_RUNTIME_STORAGE_KEY = 'knot-code:skills:runtime'

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, `'\\''`)
}

export function shellQuote(value: string): string {
  if (!value) return "''"
  return `'${escapeSingleQuotes(value)}'`
}

export function buildSkillsFindCommand(query: string): string {
  return `npx skills find ${shellQuote(query.trim())}`
}

export function buildSkillsCheckCommand(): string {
  return 'npx skills check'
}

export function buildSkillsUpdateCommand(): string {
  return 'npx skills update'
}

export function buildSkillInstallCommand(skill: SkillCatalogItem): string {
  return skill.installCommand
}

export function buildSkillUseHeading(skill: SkillCatalogItem): string {
  return `Use skill: ${skill.title}`
}

export function createDefaultRuntimeState(): SkillRuntimeState {
  return {
    enabled: true,
    synced: false,
    syncState: 'idle',
  }
}

export function mergeRuntimeState(
  skillIds: string[],
  stored: SkillsRuntimeMap | null | undefined,
): SkillsRuntimeMap {
  const next: SkillsRuntimeMap = {}
  for (const skillId of skillIds) {
    next[skillId] = {
      ...createDefaultRuntimeState(),
      ...(stored?.[skillId] ?? {}),
    }
  }
  return next
}

export function parseSkillSlashCommand(input: string): ParsedSkillCommand | null {
  const trimmed = input.trim()
  if (!/^\/skill(\s|$)/i.test(trimmed)) return null

  const body = trimmed.replace(/^\/skill\s*/i, '').trim()
  if (!body) return { kind: 'help' }

  const parts = body.split(/\s+/)
  const action = parts[0]?.toLowerCase() ?? ''

  if (action === 'check') return { kind: 'check' }
  if (action === 'update') return { kind: 'update' }
  if (action === 'list') return { kind: 'list' }

  if (action === 'find' || action === 'search') {
    const query = body.replace(/^(find|search)\s+/i, '').trim()
    return query ? { kind: 'find', query } : { kind: 'help' }
  }

  if (action === 'install' || action === 'sync' || action === 'add') {
    const skillSlug = parts[1]?.trim()
    return skillSlug ? { kind: 'install', skillSlug } : { kind: 'help' }
  }

  if (action === 'use') {
    const skillSlug = parts[1]?.trim()
    const request = parts.slice(2).join(' ').trim()
    if (!skillSlug) return { kind: 'help' }
    return { kind: 'use', skillSlug, request }
  }

  return { kind: 'find', query: body }
}

export function buildSkillCommandHelp(): string {
  return [
    '# Skill Commands',
    '',
    '- `/skill` - Show skill command help',
    '- `/skill list` - List bundled skills',
    '- `/skill find <query>` - Search the broader skills ecosystem',
    '- `/skill install <skill-slug>` - Install or sync one bundled skill',
    '- `/skill check` - Check installed skills for updates',
    '- `/skill update` - Update installed skills',
    '- `/skill use <skill-slug> <request>` - Apply a bundled skill to a concrete task',
  ].join('\n')
}

export function buildCatalogSummary(skills: SkillCatalogItem[]): string {
  return [
    '# Bundled Skills',
    '',
    ...skills.map((skill) => `- \`${skill.slug}\` - ${skill.shortDescription}`),
  ].join('\n')
}

export function buildGatewayFallbackMessage(command: string, label: string): string {
  return [
    `[Skill Workflow Request]`,
    label,
    '',
    'Run this exact command and summarize the result:',
    '```bash',
    command,
    '```',
  ].join('\n')
}

export function buildExecutionPlan(
  parsed: ParsedSkillCommand,
  opts: {
    preferTerminal: boolean
    request?: string
  },
): SkillExecutionPlan | null {
  if (parsed.kind === 'help' || parsed.kind === 'list') return null

  if (parsed.kind === 'find' && parsed.query) {
    const command = buildSkillsFindCommand(parsed.query)
    return opts.preferTerminal
      ? {
          kind: 'find',
          label: `Find skills for "${parsed.query}"`,
          target: 'terminal',
          command,
          query: parsed.query,
        }
      : {
          kind: 'find',
          label: `Find skills for "${parsed.query}"`,
          target: 'gateway-chat',
          command,
          message: buildGatewayFallbackMessage(
            command,
            `Search the skills ecosystem for: ${parsed.query}`,
          ),
          query: parsed.query,
        }
  }

  if (parsed.kind === 'check') {
    const command = buildSkillsCheckCommand()
    return opts.preferTerminal
      ? { kind: 'check', label: 'Check skills for updates', target: 'terminal', command }
      : {
          kind: 'check',
          label: 'Check skills for updates',
          target: 'gateway-chat',
          command,
          message: buildGatewayFallbackMessage(command, 'Check installed skills for updates'),
        }
  }

  if (parsed.kind === 'update') {
    const command = buildSkillsUpdateCommand()
    return opts.preferTerminal
      ? { kind: 'update', label: 'Update installed skills', target: 'terminal', command }
      : {
          kind: 'update',
          label: 'Update installed skills',
          target: 'gateway-chat',
          command,
          message: buildGatewayFallbackMessage(command, 'Update installed skills'),
        }
  }

  if (parsed.kind === 'install' && parsed.skillSlug) {
    const skill = getSkillBySlug(parsed.skillSlug)
    if (!skill) return null
    const command = buildSkillInstallCommand(skill)
    return opts.preferTerminal
      ? {
          kind: 'install',
          label: `Install ${skill.title}`,
          target: 'terminal',
          command,
          skill,
        }
      : {
          kind: 'install',
          label: `Install ${skill.title}`,
          target: 'gateway-chat',
          command,
          message: buildGatewayFallbackMessage(command, `Install skill: ${skill.title}`),
          skill,
        }
  }

  if (parsed.kind === 'use' && parsed.skillSlug) {
    const skill = getSkillBySlug(parsed.skillSlug)
    if (!skill) return null
    return {
      kind: 'use',
      label: buildSkillUseHeading(skill),
      target: 'gateway-chat',
      skill,
      query: parsed.request ?? opts.request,
    }
  }

  return null
}
