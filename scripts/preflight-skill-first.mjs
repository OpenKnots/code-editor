#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2] ?? 'staged'

if (!['staged', 'ci'].includes(mode)) {
  console.error('Usage: node scripts/preflight-skill-first.mjs [staged|ci]')
  process.exit(1)
}

/**
 * @typedef {{path: string, description: string, patterns: RegExp[]}} Check
 */

/** @type {Check[]} */
const baselineChecks = [
  {
    path: 'lib/skill-first-policy.ts',
    description: 'shared policy engine exposes override and evaluation',
    patterns: [/SKILL_FIRST_OVERRIDE_TOKEN/, /evaluateSkillFirstPolicy/, /classifySkillIntent/],
  },
  {
    path: 'context/gateway-context.tsx',
    description: 'gateway request choke point enforces skill-first gate',
    patterns: [/method === 'chat\.send'/, /evaluateSkillFirstPolicy/, /updateSkillProbeFromMessage/],
  },
  {
    path: 'components/agent-panel.tsx',
    description: 'agent panel applies local user-facing skill-first checks',
    patterns: [/enforceSkillFirstPolicy/, /buildSkillFirstBlockMessage/, /Skill-first override accepted/],
  },
  {
    path: 'components/gateway-terminal.tsx',
    description: 'gateway terminal applies skill-first checks',
    patterns: [/evaluateSkillFirstPolicy/, /buildSkillFirstBlockMessage/, /SKILL_FIRST_OVERRIDE_TOKEN/],
  },
]

/** @type {Check[]} */
const ciOnlyChecks = [
  {
    path: 'lib/agent-session.ts',
    description: 'system prompt includes skill-first behavior rule',
    patterns: [/Skill-first/, /SKILL_FIRST_OVERRIDE_TOKEN|--allow-new-skill/],
  },
  {
    path: 'docs/AGENT.md',
    description: 'agent docs describe skill-first requirement',
    patterns: [/skill-first/i, /\/skill <query>/i],
  },
  {
    path: 'AGENTS.md',
    description: 'repo agent conventions mention skill-first workflow',
    patterns: [/skill-first/i, /--allow-new-skill/],
  },
]

const checks = [...baselineChecks, ...(mode === 'ci' ? ciOnlyChecks : [])]
const failures = []

for (const check of checks) {
  const fullPath = resolve(root, check.path)
  if (!existsSync(fullPath)) {
    failures.push(`${check.path}: missing file (${check.description})`)
    continue
  }

  const content = readFileSync(fullPath, 'utf8')
  for (const pattern of check.patterns) {
    if (!pattern.test(content)) {
      failures.push(
        `${check.path}: missing pattern ${pattern.toString()} (${check.description})`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error(`Skill-first preflight failed (${mode} mode):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  console.error('\nRemediation:')
  console.error('- Add or restore skill-first enforcement code in the listed files.')
  console.error('- Run: pnpm policy:skill-first')
  if (mode === 'ci') {
    console.error('- Run: pnpm policy:skill-first:ci')
  }
  process.exit(1)
}

console.log(`Skill-first preflight passed (${mode} mode).`)
