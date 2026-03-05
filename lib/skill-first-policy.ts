export type SkillIntent = 'run-skill' | 'create-skill' | 'other'

export type SkillFirstMode = 'hard_with_override' | 'soft_warn'

export interface SkillProbeEvidence {
  at: number
  query: string
}

export interface SkillFirstEvaluation {
  allow: boolean
  blocked: boolean
  intent: SkillIntent
  reason: string
  overrideUsed: boolean
  overrideToken: string
}

interface EvaluateSkillFirstPolicyParams {
  sessionKey: string
  message: string
  mode?: SkillFirstMode
  now?: number
}

export const SKILL_FIRST_OVERRIDE_TOKEN = '--allow-new-skill'
export const SKILL_FIRST_PROBE_TTL_MS = 10 * 60 * 1000
const STORAGE_PREFIX = 'knotcode:skill-first:probe:'
const FALLBACK_SESSION = 'main'

const memoryEvidence = new Map<string, SkillProbeEvidence>()

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function normalizeSessionKey(sessionKey: string): string {
  const trimmed = sessionKey.trim()
  return trimmed || FALLBACK_SESSION
}

function storageKey(sessionKey: string): string {
  return `${STORAGE_PREFIX}${normalizeSessionKey(sessionKey)}`
}

function readStoredEvidence(sessionKey: string): SkillProbeEvidence | null {
  if (!isBrowser()) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SkillProbeEvidence
    if (!parsed || typeof parsed.at !== 'number' || typeof parsed.query !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function writeStoredEvidence(sessionKey: string, evidence: SkillProbeEvidence): void {
  if (!isBrowser()) return
  try {
    window.sessionStorage.setItem(storageKey(sessionKey), JSON.stringify(evidence))
  } catch {}
}

function clearStoredEvidence(sessionKey: string): void {
  if (!isBrowser()) return
  try {
    window.sessionStorage.removeItem(storageKey(sessionKey))
  } catch {}
}

export function classifySkillIntent(message: string): SkillIntent {
  const raw = message.trim()
  const lower = raw.toLowerCase()

  if (/^\/skill(\s|$)/i.test(raw)) return 'run-skill'
  if (/\b(list|show|find|search|try|use|run|check)\s+(existing\s+)?skills?\b/i.test(lower)) {
    return 'run-skill'
  }

  if (/^\/create-skill(\s|$)/i.test(raw)) return 'create-skill'
  if (
    /\b(create|make|build|author|write|generate|add|scaffold)\s+(a\s+|an\s+)?(new\s+)?skills?\b/i.test(
      lower,
    )
  ) {
    return 'create-skill'
  }
  if (/\bnew\s+skill\b/i.test(lower)) return 'create-skill'

  return 'other'
}

export function hasSkillFirstOverride(message: string): boolean {
  return message.toLowerCase().includes(SKILL_FIRST_OVERRIDE_TOKEN)
}

export function recordSkillProbe(sessionKey: string, message: string, now = Date.now()): void {
  const query = extractSkillQuery(message)
  const evidence: SkillProbeEvidence = { at: now, query }
  const normalized = normalizeSessionKey(sessionKey)
  memoryEvidence.set(normalized, evidence)
  writeStoredEvidence(normalized, evidence)
}

export function clearSkillProbe(sessionKey: string): void {
  const normalized = normalizeSessionKey(sessionKey)
  memoryEvidence.delete(normalized)
  clearStoredEvidence(normalized)
}

export function getSkillProbeEvidence(
  sessionKey: string,
  now = Date.now(),
): SkillProbeEvidence | null {
  const normalized = normalizeSessionKey(sessionKey)
  const fromStorage = readStoredEvidence(normalized)
  const evidence = fromStorage ?? memoryEvidence.get(normalized) ?? null
  if (!evidence) return null

  if (now - evidence.at > SKILL_FIRST_PROBE_TTL_MS) {
    clearSkillProbe(normalized)
    return null
  }
  return evidence
}

export function updateSkillProbeFromMessage(sessionKey: string, message: string): boolean {
  const intent = classifySkillIntent(message)
  if (intent !== 'run-skill') return false
  recordSkillProbe(sessionKey, message)
  return true
}

export function evaluateSkillFirstPolicy({
  sessionKey,
  message,
  mode = 'hard_with_override',
  now = Date.now(),
}: EvaluateSkillFirstPolicyParams): SkillFirstEvaluation {
  const intent = classifySkillIntent(message)
  const overrideUsed = hasSkillFirstOverride(message)

  if (intent !== 'create-skill') {
    return {
      allow: true,
      blocked: false,
      intent,
      reason: 'No new skill creation intent detected.',
      overrideUsed: false,
      overrideToken: SKILL_FIRST_OVERRIDE_TOKEN,
    }
  }

  if (overrideUsed) {
    return {
      allow: true,
      blocked: false,
      intent,
      reason: `Override token accepted (${SKILL_FIRST_OVERRIDE_TOKEN}).`,
      overrideUsed: true,
      overrideToken: SKILL_FIRST_OVERRIDE_TOKEN,
    }
  }

  const probeEvidence = getSkillProbeEvidence(sessionKey, now)
  if (probeEvidence) {
    return {
      allow: true,
      blocked: false,
      intent,
      reason: 'Recent skill lookup found; creation path is allowed.',
      overrideUsed: false,
      overrideToken: SKILL_FIRST_OVERRIDE_TOKEN,
    }
  }

  if (mode === 'soft_warn') {
    return {
      allow: true,
      blocked: false,
      intent,
      reason: 'No recent skill lookup found. Warning-only mode allows continuation.',
      overrideUsed: false,
      overrideToken: SKILL_FIRST_OVERRIDE_TOKEN,
    }
  }

  return {
    allow: false,
    blocked: true,
    intent,
    reason:
      'Skill-first policy blocked this request. Run /skill <query> first, or add ' +
      `${SKILL_FIRST_OVERRIDE_TOKEN} for an explicit audited override.`,
    overrideUsed: false,
    overrideToken: SKILL_FIRST_OVERRIDE_TOKEN,
  }
}

export function buildSkillFirstBlockMessage(result: SkillFirstEvaluation): string {
  return result.reason
}

export function extractSkillQuery(message: string): string {
  const trimmed = message.trim()
  const skillCmd = trimmed.match(/^\/skill\s+(.+)$/i)
  if (skillCmd?.[1]) return skillCmd[1].trim()
  return trimmed.slice(0, 120)
}
