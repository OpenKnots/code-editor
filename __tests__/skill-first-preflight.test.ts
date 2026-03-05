import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const scriptPath = resolve(process.cwd(), 'scripts/preflight-skill-first.mjs')

describe('skill-first preflight script', () => {
  it('passes in staged mode', () => {
    const result = spawnSync('node', [scriptPath, 'staged'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Skill-first preflight passed')
  })

  it('fails for invalid mode', () => {
    const result = spawnSync('node', [scriptPath, 'invalid-mode'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage:')
  })
})
