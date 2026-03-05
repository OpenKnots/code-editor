import { describe, expect, it } from 'vitest'
import { getSkillBySlug } from '@/lib/skills/catalog'
import { buildSkillUseEnvelope, detectSkillProvider } from '@/lib/skills/provider-adapter'

describe('skills provider adapter', () => {
  const skill = getSkillBySlug('brainstorming')

  it('detects GPT-class and Claude-class providers', () => {
    expect(detectSkillProvider('gpt-5.4')).toMatchObject({ id: 'openai' })
    expect(detectSkillProvider('claude-opus-4.6')).toMatchObject({ id: 'anthropic' })
    expect(detectSkillProvider('')).toMatchObject({ id: 'gateway' })
  })

  it('builds an OpenAI-oriented prompt envelope', () => {
    expect(skill).toBeDefined()
    const envelope = buildSkillUseEnvelope({
      skill: skill!,
      request: 'Explore approaches for a skills catalog UI.',
      modelName: 'gpt-5.4',
    })

    expect(envelope.provider.id).toBe('openai')
    expect(envelope.prompt).toContain('[Skill Workflow] Brainstorming')
    expect(envelope.prompt).toContain('Explore approaches for a skills catalog UI.')
    expect(envelope.prompt).toContain('Execution requirements:')
  })

  it('builds an Anthropic-oriented prompt envelope', () => {
    expect(skill).toBeDefined()
    const envelope = buildSkillUseEnvelope({
      skill: skill!,
      request: 'Explore approaches for a skills catalog UI.',
      modelName: 'claude-sonnet-4.6',
    })

    expect(envelope.provider.id).toBe('anthropic')
    expect(envelope.prompt).toContain('<skill_workflow>')
    expect(envelope.prompt).toContain('<task>')
    expect(envelope.prompt).toContain('Explore approaches for a skills catalog UI.')
  })
})
