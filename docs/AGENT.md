# Agent System

## Overview

KnotCode includes a dedicated AI coding agent that operates as a full-stack expert pair programmer. The agent runs via the OpenClaw gateway in an isolated session, separate from other OpenClaw surfaces (Telegram, Discord, CodeFlow).

## Session Architecture

```
                    OpenClaw Gateway
                         │
           ┌─────────────┼─────────────┐
           │             │             │
    agent:main    agent:main:     agent:main:
    (Telegram)    codeflow         code-editor
                  (CodeFlow)       (Knot Code)
```

Each session maintains its own:

- Message history
- System prompt
- Agent persona and behavior rules
- Context injection format

## System Prompt

The agent is initialized with a comprehensive system prompt (`lib/agent-session.ts`) that defines:

### Expertise Levels

| Domain       | Level  | Key Areas                                 |
| ------------ | ------ | ----------------------------------------- |
| Next.js      | Expert | App Router, SSR/ISR, proxy.ts, API routes |
| Lit          | Expert | Web Components, Shadow DOM, decorators    |
| React        | Expert | Hooks, context, performance, concurrent   |
| TypeScript   | Expert | Strict mode, generics, type guards        |
| Tailwind v4  | Expert | CSS variables, @theme, responsive         |
| PostgreSQL   | Expert | Query optimization, CTEs, JSONB           |
| Drizzle ORM  | Expert | Schema, relations, query builder          |
| Web Security | Expert | XSS, CSRF, CSP, DOMPurify                 |
| Auth         | Expert | OAuth2, OIDC, JWTs, WorkOS                |
| Git          | Expert | Rebase, cherry-pick, conventional commits |
| Vercel       | Expert | Deployment, edge, env vars                |

### Behavior Rules

1. **Propose, don't auto-apply** — all edits use `[EDIT]` markers for diff review
2. **Complete files** — no `// rest of file` shortcuts
3. **Match existing style** — read context before writing
4. **TypeScript strict** — no `any` without justification
5. **Security by default** — sanitize, validate, escape
6. **Skill-first policy** — before creating a new skill, run `/skill <query>` to try existing skills first
7. **Audited override only** — use `--allow-new-skill` explicitly when a new skill is required now
8. **Be direct** — no filler, no hedging
9. **Be actionable** — every response ends with a next step
10. **Flag risks** — security/performance/breaking implications upfront

## Context Injection

Every message includes contextual information via `buildEditorContext()`:

````
[Repository: OpenKnots/code-editor (main)]

[Active file: components/agent-panel.tsx]
```typescript
// file content (capped at 8000 chars)
````

[Open files]

- components/agent-panel.tsx (modified)
- lib/agent-session.ts
- app/page.tsx

[Instructions: When proposing code edits, use [EDIT path/to/file.ext]...]

```

## Edit Flow

### Via Agent Panel (/edit)

```

User: "/edit add error handling to the fetch call"
→ Context injected (file, repo, open files)
→ Agent responds with [EDIT lib/api.ts] marker
→ Edit parser detects proposal
→ "Review diff: lib/api.ts" button appears
→ Click → DiffViewer (Apply/Reject)
→ Apply → file updated in editor (dirty)
→ /commit → pushed to GitHub

```

### Via Inline Edit (⌘K)

```

User selects code → ⌘K → types "add null check"
→ InlineEdit component appears at cursor position
→ Submit dispatches CustomEvent('inline-edit-request')
→ AgentPanel handles event: - Includes selected text + line range - Sends to gateway with full context
→ Same diff review flow as /edit

```

## Edit Proposal Format

The agent wraps proposed changes in markers:

```

[EDIT path/to/file.ts]

```typescript
// complete file content
```

````

The `parseEditProposals()` function in `lib/edit-parser.ts` detects two formats:
1. `[EDIT path] + fenced block` — explicit marker (preferred)
2. `` ```path.ext `` — fenced block with file path as language tag

## Streaming

Replies arrive via WebSocket events:

| Event State | Action |
|-------------|--------|
| `delta` | Update `streamBuffer`, show live typing |
| `final` | Parse edit proposals, append as message |
| `error` | Show error in system message |
| `aborted` | Append partial text with [cancelled] |

Events are matched by `idempotencyKey` (primary) or `sessionKey` (fallback).

## Slash Commands

| Command | Action | Gateway Required |
|---------|--------|:---:|
| `/edit <instruction>` | Propose code changes | ✓ |
| `/explain` | Explain current file | ✓ |
| `/refactor <instruction>` | Refactor with goals | ✓ |
| `/generate <description>` | Generate new code | ✓ |
| `/search <query>` | Search across repo | ✓ |
| `/commit <message>` | Commit modified files | ✓ |
| `/diff` | Show uncommitted changes | ✓ |
````
