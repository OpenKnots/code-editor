import { describe, expect, it } from 'vitest'
import { SKILLS_CATALOG, getSkillBySlug } from '@/lib/skills/catalog'
import {
  buildExecutionPlan,
  buildSkillsFindCommand,
  mergeRuntimeState,
  parseSkillSlashCommand,
} from '@/lib/skills/workflow'

describe('skills workflow', () => {
  it('seeds the bundled catalog with superpowers plus find-skills', () => {
    expect(SKILLS_CATALOG).toHaveLength(15)
    expect(getSkillBySlug('brainstorming')?.installCommand).toBe(
      'pnpm dlx skills add https://github.com/obra/superpowers --skill brainstorming -g -y',
    )
    expect(getSkillBySlug('find-skills')?.installCommand).toBe(
      'pnpm dlx skills add https://github.com/vercel-labs/skills --skill find-skills -g -y',
    )
  })

  it('quotes ecosystem search queries for shell execution', () => {
    expect(buildSkillsFindCommand('react performance')).toBe(
      "pnpm dlx skills find 'react performance'",
    )
    expect(buildSkillsFindCommand("author's workflow")).toBe(
      "pnpm dlx skills find 'author'\\''s workflow'",
    )
  })

  it('parses skill slash commands into structured actions', () => {
    expect(parseSkillSlashCommand('/skill')).toEqual({ kind: 'help' })
    expect(parseSkillSlashCommand('/skill find react performance')).toEqual({
      kind: 'find',
      query: 'react performance',
    })
    expect(parseSkillSlashCommand('/skill install brainstorming')).toEqual({
      kind: 'install',
      skillSlug: 'brainstorming',
    })
    expect(
      parseSkillSlashCommand('/skill use systematic-debugging inspect websocket reconnect'),
    ).toEqual({
      kind: 'use',
      skillSlug: 'systematic-debugging',
      request: 'inspect websocket reconnect',
    })
  })

  it('builds terminal and gateway execution plans', () => {
    const installPlan = buildExecutionPlan(
      { kind: 'install', skillSlug: 'brainstorming' },
      { preferTerminal: true },
    )
    expect(installPlan).toMatchObject({
      kind: 'install',
      target: 'terminal',
      command:
        'pnpm dlx skills add https://github.com/obra/superpowers --skill brainstorming -g -y',
    })

    const findPlan = buildExecutionPlan(
      { kind: 'find', query: 'react performance' },
      { preferTerminal: false },
    )
    expect(findPlan?.target).toBe('gateway-chat')
    expect(findPlan?.message).toContain("pnpm dlx skills find 'react performance'")
  })

  it('hydrates runtime state with defaults for every bundled skill', () => {
    const merged = mergeRuntimeState(['brainstorming', 'find-skills'], {
      brainstorming: {
        enabled: false,
        synced: true,
        syncState: 'idle',
      },
    })
    expect(merged.brainstorming.enabled).toBe(false)
    expect(merged.brainstorming.synced).toBe(true)
    expect(merged['find-skills']).toEqual({
      enabled: true,
      synced: false,
      syncState: 'idle',
    })
  })
})
