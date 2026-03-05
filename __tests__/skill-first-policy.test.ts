import { describe, expect, it } from 'vitest'
import {
  SKILL_FIRST_PROBE_TTL_MS,
  classifySkillIntent,
  clearSkillProbe,
  evaluateSkillFirstPolicy,
  getSkillProbeEvidence,
  recordSkillProbe,
  updateSkillProbeFromMessage,
} from '@/lib/skill-first-policy'

describe('skill-first policy', () => {
  const sessionKey = 'test-session'

  it('classifies run-skill intent from slash command', () => {
    expect(classifySkillIntent('/skill refactor helper')).toBe('run-skill')
  })

  it('classifies create-skill intent from plain language', () => {
    expect(classifySkillIntent('create a new skill for image generation')).toBe('create-skill')
  })

  it('blocks new skill creation when no probe exists', () => {
    clearSkillProbe(sessionKey)
    const result = evaluateSkillFirstPolicy({
      sessionKey,
      message: 'create a new skill for this workflow',
      mode: 'hard_with_override',
    })
    expect(result.blocked).toBe(true)
    expect(result.allow).toBe(false)
  })

  it('allows new skill creation after a recent probe', () => {
    clearSkillProbe(sessionKey)
    recordSkillProbe(sessionKey, '/skill workflow', 1000)
    const result = evaluateSkillFirstPolicy({
      sessionKey,
      message: 'create a new skill for this workflow',
      mode: 'hard_with_override',
      now: 1000 + SKILL_FIRST_PROBE_TTL_MS - 1,
    })
    expect(result.allow).toBe(true)
    expect(result.blocked).toBe(false)
  })

  it('allows new skill creation with explicit override', () => {
    clearSkillProbe(sessionKey)
    const result = evaluateSkillFirstPolicy({
      sessionKey,
      message: 'create a new skill now --allow-new-skill',
      mode: 'hard_with_override',
    })
    expect(result.allow).toBe(true)
    expect(result.overrideUsed).toBe(true)
  })

  it('expires stale probe evidence after ttl', () => {
    clearSkillProbe(sessionKey)
    recordSkillProbe(sessionKey, '/skill test', 0)
    const evidence = getSkillProbeEvidence(sessionKey, SKILL_FIRST_PROBE_TTL_MS + 1)
    expect(evidence).toBeNull()
  })

  it('records probes from skill commands only', () => {
    clearSkillProbe(sessionKey)
    expect(updateSkillProbeFromMessage(sessionKey, '/skill auth')).toBe(true)
    expect(getSkillProbeEvidence(sessionKey)).not.toBeNull()
    clearSkillProbe(sessionKey)
    expect(updateSkillProbeFromMessage(sessionKey, '/edit add test')).toBe(false)
    expect(getSkillProbeEvidence(sessionKey)).toBeNull()
  })
})
