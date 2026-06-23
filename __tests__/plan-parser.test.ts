import { describe, it, expect } from 'vitest'
import { parsePlanSteps, isPlanContent } from '@/lib/plan-parser'

describe('parsePlanSteps', () => {
  it('returns empty array for plain prose', () => {
    const text = 'This is just a regular paragraph with no numbered steps.'
    expect(parsePlanSteps(text)).toEqual([])
  })

  it('returns empty array for text with fewer than a full step', () => {
    const text = 'Here is some context about the plan.'
    expect(parsePlanSteps(text)).toEqual([])
  })

  it('parses a simple numbered list', () => {
    const text = `1. Create the component
2. Add styling
3. Write tests`
    const steps = parsePlanSteps(text)
    expect(steps).toHaveLength(3)
    expect(steps[0].title).toBe('Create the component')
    expect(steps[1].title).toBe('Add styling')
    expect(steps[2].title).toBe('Write tests')
  })

  it('parses bold titles', () => {
    const text = `1. **Initialize project**
2. **Set up database**
3. **Deploy to production**`
    const steps = parsePlanSteps(text)
    expect(steps).toHaveLength(3)
    expect(steps[0].title).toBe('Initialize project')
    expect(steps[1].title).toBe('Set up database')
    expect(steps[2].title).toBe('Deploy to production')
  })

  it('splits title and inline description on em dash', () => {
    const text = `1. **Init** — create the directory structure
2. **Build** — compile TypeScript to JavaScript
3. **Test** — run the full test suite`
    const steps = parsePlanSteps(text)
    expect(steps).toHaveLength(3)
    expect(steps[0].title).toBe('Init**')
    expect(steps[0].description).toContain('create the directory structure')
    expect(steps[1].title).toBe('Build**')
    expect(steps[2].title).toBe('Test**')
  })

  it('extracts file paths from backtick-wrapped tokens', () => {
    const text = `1. Update the config
   Modify \`lib/config.ts\` and \`src/app.tsx\`
2. Add tests
   Create \`__tests__/config.test.ts\`
3. Update docs
   Edit \`README.md\``
    const steps = parsePlanSteps(text)
    expect(steps).toHaveLength(3)
    expect(steps[0].files).toEqual(['lib/config.ts', 'src/app.tsx'])
    expect(steps[1].files).toEqual(['__tests__/config.test.ts'])
    expect(steps[2].files).toEqual(['README.md'])
  })

  it('deduplicates file paths', () => {
    const text = `1. Fix the bug
   Update \`lib/utils.ts\` and then check \`lib/utils.ts\` again
2. Verify
   Run tests
3. Commit
   Stage changes`
    const steps = parsePlanSteps(text)
    expect(steps[0].files).toEqual(['lib/utils.ts'])
  })

  it('assigns sequential step IDs', () => {
    const text = `1. First step
2. Second step
3. Third step`
    const steps = parsePlanSteps(text)
    expect(steps[0].id).toBe('step-1')
    expect(steps[1].id).toBe('step-2')
    expect(steps[2].id).toBe('step-3')
  })

  it('sets all steps to pending status', () => {
    const text = `1. Step one
2. Step two
3. Step three`
    const steps = parsePlanSteps(text)
    for (const step of steps) {
      expect(step.status).toBe('pending')
    }
  })

  it('removes trailing colons from titles', () => {
    const text = `1. Setup:
   Install dependencies
2. Configure:
   Set environment variables
3. Deploy:
   Push to production`
    const steps = parsePlanSteps(text)
    expect(steps[0].title).toBe('Setup')
    expect(steps[1].title).toBe('Configure')
    expect(steps[2].title).toBe('Deploy')
  })

  it('handles indented description lines', () => {
    const text = `1. Create component
   This will be the main entry point
   It should handle all user interactions
2. Style it
   Use CSS modules
3. Export it
   From the index barrel`
    const steps = parsePlanSteps(text)
    expect(steps[0].description).toContain('main entry point')
    expect(steps[0].description).toContain('user interactions')
  })

  it('filters out non-file-path backtick content', () => {
    const text = `1. Run setup
   Execute \`npm install\` and \`pnpm build\`
   Then check \`src/index.ts\`
2. Verify
   Check output
3. Done
   All clear`
    const steps = parsePlanSteps(text)
    // npm install and pnpm build should be filtered (start with npm/pnpm)
    expect(steps[0].files).toEqual(['src/index.ts'])
  })
})

describe('isPlanContent', () => {
  it('returns false for text with fewer than 3 steps', () => {
    const text = `1. First step
2. Second step`
    expect(isPlanContent(text)).toBe(false)
  })

  it('returns true for text with 3 or more steps', () => {
    const text = `1. First step
2. Second step
3. Third step`
    expect(isPlanContent(text)).toBe(true)
  })

  it('returns false for plain prose', () => {
    expect(isPlanContent('Just a regular message with no plan.')).toBe(false)
  })

  it('returns true for a long plan', () => {
    const text = `1. Initialize
2. Configure
3. Build
4. Test
5. Deploy`
    expect(isPlanContent(text)).toBe(true)
  })
})
