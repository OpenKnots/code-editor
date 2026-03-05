# AGENTS.md — KnotCode Editor

## Project

Next.js 16 + Tauri desktop code editor. Static export (`output: 'export'`), Turbopack dev.

- **Package manager:** pnpm (never npm)
- **Repo:** `~/Documents/GitHub/OpenKnots/code-editor`
- **Stack:** Next.js, Tailwind CSS v4, TypeScript strict, Tauri v2
- **Build check:** `pnpm build` must pass with zero TS errors before committing

## Git Workflow — Use gitquick (`gq`)

This project uses [gitquick](https://github.com/Clawborn/gitquick) for fast git operations.

### Commands

```bash
gq save "commit message"   # git add -A && git commit -m "message" && git push
gq sync                     # git pull --rebase && git push
gq clean                    # delete local branches already merged into main/master
```

### When to use

- **`gq save "msg"`** — After completing a feature, fix, or logical unit of work. Stages everything, commits, and pushes in one shot. Default message is "update" if omitted.
- **`gq sync`** — Before starting new work or when you need to pull latest changes. Rebases local commits on top of remote, then pushes.
- **`gq clean`** — After PRs are merged. Removes stale local branches that have been merged into main/master.

### Rules

- Always run `pnpm build` (or at minimum `npx tsc --noEmit`) before `gq save` to catch type errors
- Write meaningful commit messages — not just "update"
- If there are merge conflicts during `gq sync`, resolve them before continuing

### Agent Workflow Guardrails

- Skill-first policy is required: run `/skill <query>` before creating a new skill.
- New skill creation is blocked by default unless a recent skill probe exists.
- Explicit override token for audited bypass only: `--allow-new-skill`.

## Code Conventions

- All colors use CSS theme variables (`var(--brand)`, `var(--brand-contrast)`, etc.) — never hardcode `text-white` on brand elements
- Tauri desktop: use `data-tauri-drag-region` for window drag, `tauri-no-drag` class to exclude interactive elements
- Components go in `components/`, views in `components/views/`, contexts in `context/`
- Prefer `useCallback` and `useMemo` for performance in large components
- Use `@iconify/react` `Icon` component for all icons (Lucide set)

## Key Architecture

- **Theme system:** CSS custom properties via `data-theme` on `<html>`, presets in `context/theme-context.tsx`, all CSS in `app/globals.css`
- **Gateway comms:** WebSocket to `ws://127.0.0.1:18789`, JSON RPC via `makeRequest()` in `lib/gateway.ts`
- **Local filesystem:** Tauri commands in `src-tauri/src/local_fs.rs`, exposed via `context/local-context.tsx`
- **Terminal:** Max 3 tabs, managed in `components/terminal-panel.tsx`
- **Agent chat:** Per-chat session keys `agent:main:code-editor:{chatId.slice(0,8)}`, lazy init on first message
