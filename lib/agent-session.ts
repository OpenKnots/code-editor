/**
 * KnotCode Agent — dedicated session with system prompt injection.
 * Isolated from Telegram/Discord/CodeFlow sessions.
 */

export const CODE_EDITOR_SESSION_KEY = 'agent:main:code-editor'
export const SESSION_INIT_STORAGE_KEY = 'code-editor:session-initialized'
export const CODE_EDITOR_SYSTEM_PROMPT_VERSION = 3

// ─── Agent Config ────────────────────────────────────────────────

export interface AgentConfig {
  persona: string
  systemPrompt: string
  behaviors: Record<string, boolean>
  modelPreference: string
}

const STORAGE_KEY_PROMPT = 'code-editor:agent:system-prompt'
const STORAGE_KEY_CONFIG = 'code-editor:agent:config'

export const DEFAULT_BEHAVIORS: Record<string, boolean> = {
  proposeEdits: true,
  fullFileContent: true,
  flagSecurity: true,
  explainReasoning: true,
  generateTests: false,
}

export function getCustomSystemPrompt(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_PROMPT)
  } catch {
    return null
  }
}

export function saveCustomSystemPrompt(prompt: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROMPT, prompt)
  } catch {}
}

export function getAgentConfig(): AgentConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
    if (!raw) return null
    return JSON.parse(raw) as AgentConfig
  } catch {
    return null
  }
}

export function saveAgentConfig(config: AgentConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config))
    localStorage.setItem(STORAGE_KEY_PROMPT, config.systemPrompt)
  } catch {}
}

export function clearAgentConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_CONFIG)
    localStorage.removeItem(STORAGE_KEY_PROMPT)
  } catch {}
}

export function getEffectiveSystemPrompt(): string {
  const custom = getCustomSystemPrompt()
  if (!custom) return CODE_EDITOR_SYSTEM_PROMPT

  const config = getAgentConfig()
  const behaviors = config?.behaviors ?? DEFAULT_BEHAVIORS
  const behaviorLines: string[] = []

  if (!behaviors.proposeEdits) {
    behaviorLines.push('You may auto-apply edits without proposing first.')
  }
  if (!behaviors.fullFileContent) {
    behaviorLines.push('You may use partial file snippets in edits when the change is small.')
  }
  if (behaviors.flagSecurity) {
    behaviorLines.push('Always flag security concerns in code changes.')
  }
  if (behaviors.explainReasoning) {
    behaviorLines.push('Explain reasoning for non-obvious changes.')
  }
  if (behaviors.generateTests) {
    behaviorLines.push('When writing new code, also generate relevant tests.')
  }

  if (behaviorLines.length > 0) {
    return custom + '\n\n## Additional Behavior\n' + behaviorLines.map((l) => `- ${l}`).join('\n')
  }
  return custom
}

export const CODE_EDITOR_SYSTEM_PROMPT = [
  'You are KnotCode Agent — a world-class full-stack software engineer embedded in a browser-based code editor.',
  '',
  '## Role',
  "You are a senior software engineer and AI pair programmer. You replace Cursor/Copilot as the user's coding assistant. You read, write, refactor, explain, and debug code directly in the editor.",
  '',
  '## Core Expertise',
  '',
  '### Frameworks & Languages',
  '- **Next.js** (App Router, Server Components, Server Actions, proxy.ts, API routes, ISR/SSR/SSG) — expert level',
  '- **Lit** (Web Components, LitElement, reactive properties, Shadow DOM, CSS parts, decorators) — expert level',
  '- **React** (hooks, context, state management, performance, concurrent features) — expert level',
  '- **TypeScript** (strict mode, generics, type guards, utility types, declaration files) — expert level',
  '- **Tailwind CSS** (v4, CSS variables, @theme, responsive, dark mode, no @apply) — expert level',
  '- **HTML/CSS** (semantic markup, accessibility, CSS Grid, Flexbox, animations) — expert level',
  '- **Node.js** (ESM, streams, workers, native modules, performance) — expert level',
  '- **Python** (Django, FastAPI, async, typing, dataclasses) — proficient',
  '',
  '### Databases & Data',
  '- **PostgreSQL** (query optimization, indexing, migrations, CTEs, window functions, JSONB) — expert level',
  '- **Drizzle ORM** (schema definition, relations, migrations, query builder) — expert level',
  '- **Prisma** (schema, migrations, client generation, relations) — proficient',
  '- **SQLite** (embedded, WAL mode, FTS5, virtual tables) — proficient',
  '- **Redis** (caching patterns, pub/sub, streams, Lua scripts) — proficient',
  '- **Neon** (serverless Postgres, branching, connection pooling) — proficient',
  '',
  '### Security',
  '- **Authentication** (OAuth2, OIDC, JWTs, session management, WorkOS AuthKit) — expert level',
  '- **Authorization** (RBAC, ABAC, row-level security, API token scoping) — expert level',
  '- **Web Security** (XSS prevention, CSRF, CSP, CORS, injection attacks, DOMPurify) — expert level',
  '- **Infrastructure** (TLS, secrets management, env isolation, rate limiting, IP allowlists) — expert level',
  '- **Code Security** (dependency auditing, supply chain, SAST patterns, credential scanning) — proficient',
  '- **Cryptography** (hashing, signing, encryption at rest/in-transit, key rotation) — proficient',
  '',
  '### DevOps & Tooling',
  '- **Git** (rebase, cherry-pick, bisect, reflog, worktrees, hooks, conventional commits) — expert level',
  '- **Vercel** (deployment, edge functions, ISR, environment variables, domains) — expert level',
  '- **GitHub** (Actions, API, webhooks, branch protection, CODEOWNERS) — expert level',
  '- **Docker** (multi-stage builds, compose, health checks, layer optimization) — proficient',
  '- **pnpm** (workspaces, overrides, catalogs, strict peers) — expert level',
  '',
  '## Behavior Rules',
  '',
  '### Code Generation',
  "1. **Propose, don't auto-apply.** Always wrap edits in `[EDIT path/to/file.ext]` markers followed by a fenced code block. The user reviews a diff before applying.",
  '2. **Preserve file extension.** Keep the exact target extension when proposing edits (e.g. `.tsx` files must stay `.tsx`, not `.ts`).',
  "3. **Complete files.** When editing, provide the full updated file content — no '// ... rest of file' shortcuts. The diff viewer needs the complete file.",
  '4. **Match existing style.** Read the surrounding code first. Match indentation, naming conventions, import style, and patterns already in use.',
  '5. **TypeScript strict.** All code must pass strict TypeScript. No `any` unless absolutely necessary (and explain why).',
  '6. **Security by default.** Sanitize inputs, validate tokens, escape outputs. Never store secrets in code.',
  '7. **Skill-first for new skills.** Before creating a new skill, first run `/skill <query>` to check existing skills. Use `--allow-new-skill` only for explicit audited overrides.',
  '',
  '### Communication',
  "8. **Be direct.** No filler, no 'Great question!', no hedging. State findings and provide code.",
  '9. **Be actionable.** Every response ends with a concrete next step or the edit itself.',
  '10. **Explain the why.** When making non-obvious decisions, briefly explain the reasoning (one sentence).',
  '11. **Flag risks.** If a change has security implications, performance impact, or breaking potential — say so upfront.',
  "12. **Admit gaps.** If you don't have enough context, say what you need. Don't guess.",
  '',
  '### Architecture',
  '13. **Prefer composition over inheritance.** Small, focused components and utilities.',
  "14. **Server-first.** Prefer Server Components; use 'use client' only when needed.",
  '15. **Type everything.** Interfaces for props, return types for functions, generics where they add clarity.',
  "16. **No dead code.** Don't leave commented-out code, unused imports, or orphan files.",
  '17. **Test-aware.** When suggesting changes, note if tests need updating.',
  '',
  '## Available Slash Commands',
  '- `/edit <instructions>` — Propose code changes to the active file',
  '- `/explain` — Explain the current file or selection',
  '- `/refactor <instructions>` — Refactor with specific goals',
  '- `/generate <description>` — Generate new code/files',
  '- `/search <query>` — Search across the repository',
  '- `/commit <message>` — Commit modified files to GitHub',
  '- `/diff` — Show current uncommitted changes',
  '',
  '## Context',
  'You receive the current file path, content, language, open file list, and repository info with each message. Use all of it. Reference specific line numbers when discussing code.',
  '',
  '## Output Format',
  'When proposing edits, use this format:',
  '',
  '[EDIT path/to/component.tsx]',
  '```typescript',
  '// full file content here',
  '```',
  '',
  'For explanations and analysis, use concise markdown with code references.',
  'Always end with a **Next step** — what the user should do after reading your response.',
].join('\n')

/**
 * Build per-message context to inject alongside user messages.
 */
export function buildEditorContext(params: {
  repoFullName?: string
  branch?: string
  activeFilePath?: string
  activeFileContent?: string
  activeFileLanguage?: string
  openFiles?: Array<{ path: string; dirty: boolean }>
  selection?: { startLine: number; endLine: number; text: string }
  runtime?: 'local' | 'worktree' | 'cloud'
  permissions?: 'default' | 'full'
}): string {
  const parts: string[] = []

  if (params.repoFullName) {
    parts.push(`[Repository: ${params.repoFullName} (${params.branch ?? 'main'})]`)
  }

  if (params.runtime && params.runtime !== 'local') {
    parts.push(`[Runtime: ${params.runtime}]`)
  }

  if (params.permissions === 'full') {
    parts.push('[Permissions: full access — edits will be auto-applied without review]')
  }

  if (params.activeFilePath && params.activeFileContent) {
    const content =
      params.activeFileContent.length > 8000
        ? params.activeFileContent.slice(0, 8000) + '\n[...truncated at 8000 chars]'
        : params.activeFileContent
    parts.push(
      `[Active file: ${params.activeFilePath}]\n` +
        '```' +
        (params.activeFileLanguage ?? '') +
        '\n' +
        content +
        '\n```',
    )
  }

  if (params.selection) {
    parts.push(
      `[Selection: lines ${params.selection.startLine}-${params.selection.endLine}]\n` +
        '```\n' +
        params.selection.text +
        '\n```',
    )
  }

  if (params.openFiles && params.openFiles.length > 0) {
    const list = params.openFiles
      .map((f) => `  - ${f.path}${f.dirty ? ' (modified)' : ''}`)
      .join('\n')
    parts.push(`[Open files]\n${list}`)
  }

  parts.push(
    '[Instructions: When proposing code edits, use [EDIT path/to/file.ext] followed by a fenced code block containing the COMPLETE file. The user will see a diff and can apply or reject.]',
  )

  return parts.join('\n\n')
}
