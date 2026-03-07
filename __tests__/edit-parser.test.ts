import { describe, it, expect } from 'vitest'
import { parseEditProposals, hasEditProposals } from '@/lib/edit-parser'

describe('parseEditProposals', () => {
  it('parses [EDIT path] format', () => {
    const text = `Here is the fix:
[EDIT src/app.tsx]
\`\`\`typescript
export default function App() { return <div>Hi</div> }
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].filePath).toBe('src/app.tsx')
    expect(proposals[0].content).toContain('export default function App')
  })

  it('parses fenced code block with file path', () => {
    const text = `\`\`\`src/utils.ts
export function add(a: number, b: number) { return a + b }
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].filePath).toBe('src/utils.ts')
  })

  it('parses multiple edits in one response', () => {
    const text = `[EDIT a.ts]
\`\`\`
const a = 1
\`\`\`

[EDIT b.ts]
\`\`\`
const b = 2
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals).toHaveLength(2)
    expect(proposals[0].filePath).toBe('a.ts')
    expect(proposals[1].filePath).toBe('b.ts')
  })

  it('skips language tags that are not file paths', () => {
    const text = `\`\`\`typescript
const x = 1
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals).toHaveLength(0)
  })

  it('returns empty array for plain text', () => {
    const proposals = parseEditProposals('Just a normal message with no code.')
    expect(proposals).toHaveLength(0)
  })

  it('does not duplicate when EDIT marker overlaps fenced path', () => {
    const text = `[EDIT lib/utils.ts]
\`\`\`lib/utils.ts
export function cn() {}
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals).toHaveLength(1)
  })

  it('provides correct sourceRange', () => {
    const text = `[EDIT foo.ts]
\`\`\`
code
\`\`\``
    const proposals = parseEditProposals(text)
    expect(proposals[0].sourceRange[0]).toBe(0)
    expect(proposals[0].sourceRange[1]).toBeGreaterThan(0)
  })
})

describe('hasEditProposals', () => {
  it('returns true for EDIT marker', () => {
    expect(hasEditProposals('[EDIT foo.ts]\n```\ncode\n```')).toBe(true)
  })

  it('returns true for fenced path', () => {
    expect(hasEditProposals('```src/foo.ts\ncode\n```')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasEditProposals('no code here')).toBe(false)
  })

  it('returns consistent results on consecutive calls', () => {
    const text = '[EDIT foo.ts]\n```\ncode\n```'
    expect(hasEditProposals(text)).toBe(true)
    expect(hasEditProposals(text)).toBe(true)
    expect(hasEditProposals(text)).toBe(true)
  })
})
