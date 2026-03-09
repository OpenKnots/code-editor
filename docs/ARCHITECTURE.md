# Architecture

## Overview

KnotCode is a **dual-target application** — it runs as a web app on Vercel and as a native macOS desktop app via Tauri. Both targets share the same Next.js codebase.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Tauri WebView              │
│                                                             │
│  ┌──────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │  File     │  │  Monaco Editor      │  │  Agent Panel  │  │
│  │  Explorer │  │  + Tabs + Breadcrumb│  │  + Diff View  │  │
│  │          ◄├──┤►                   ◄├──┤►              │  │
│  │  Resize   │  │  Resize Handle      │  │  Resize       │  │
│  └─────┬─────┘  └─────────┬───────────┘  └───────┬───────┘  │
│        │                  │                       │          │
│        ▼                  ▼                       ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    React Context Layer                  │ │
│  │  RepoContext  │  EditorContext  │  GatewayContext        │ │
│  └──────┬────────┴───────┬─────────┴──────────┬────────────┘ │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐   │
│  │ GitHub API │  │ localStorage│  │ OpenClaw Gateway   │   │
│  │ (REST)     │  │ (tabs, theme│  │ (WebSocket RPC)    │   │
│  │            │  │  creds)     │  │                    │   │
│  └────────────┘  └─────────────┘  └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Build Targets

### Web (Vercel)

```
Next.js → Server-rendered → Vercel Edge
├── API Routes (server-side, GitHub token secured)
├── proxy.ts (WorkOS auth + IP allowlist + security headers)
└── Client components (Monaco, chat, file tree)
```

### Desktop (Tauri)

```
Next.js → Static Export → Tauri WebView (system WebKit)
├── No server — all API calls go direct to GitHub
├── Gateway connection via WebSocket (same as web)
└── Native window, menu bar, .app/.dmg packaging
```

The `next.config.ts` detects `TAURI_ENV_PLATFORM` and switches to `output: 'export'` for Tauri builds.

## Directory Structure

```
code-editor/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (providers, auth, theme)
│   ├── page.tsx                # Main page (login gate → editor layout)
│   ├── callback/route.ts       # WorkOS OAuth callback
│   ├── globals.css             # Theme tokens, base styles, prose
│   └── api/github/             # GitHub API proxy routes
│       ├── _helpers.ts         # Token resolution, fetch wrapper
│       └── repos/[owner]/[repo]/
│           ├── tree/route.ts   # Recursive file tree
│           ├── contents/       # File contents (read)
│           └── commit/route.ts # Write files (single + multi)
│
├── components/                 # React components
│   ├── agent-panel.tsx         # Gateway chat with streaming + diff
│   ├── code-editor.tsx         # Monaco wrapper + breadcrumbs
│   ├── diff-viewer.tsx         # LCS-based side-by-side diff
│   ├── editor-tabs.tsx         # Multi-file tab bar
│   ├── file-explorer.tsx       # Tree view with search
│   ├── glass-card.tsx          # Glassmorphic card primitive
│   ├── inline-edit.tsx         # Cmd/Ctrl+K inline edit prompt
│   ├── markdown-preview.tsx    # Agent response rendering
│   ├── quick-open.tsx          # Cmd/Ctrl+P fuzzy file search
│   ├── repo-selector.tsx       # Repo + branch switcher
│   ├── resize-handle.tsx       # Draggable panel resizer
│   ├── shortcuts-overlay.tsx   # ? keyboard shortcuts modal
│   └── theme-switcher.tsx      # 4-theme dropdown
│
├── context/                    # React contexts
│   ├── gateway-context.tsx     # WebSocket connection + RPC
│   ├── repo-context.tsx        # Current repo, branch, tree
│   └── editor-context.tsx      # Open files, tabs, dirty tracking
│
├── lib/                        # Shared utilities
│   ├── agent-session.ts        # Session key, system prompt, context builder
│   ├── edit-parser.ts          # Parse [EDIT] markers from agent responses
│   ├── line-links.ts           # Parse line references, navigate events
│   ├── monaco-theme.ts         # Custom theme from CSS variables
│   ├── github-client.ts        # GitHub API client (types + fetch)
│   ├── github-types.ts         # TypeScript types for GitHub entities
│   ├── gateway-protocol.ts     # WebSocket RPC protocol
│   ├── device-auth.ts          # Device authentication
│   ├── icons.tsx               # Centralized Iconify icon exports
│   └── time.ts                 # Time formatting utilities
│
├── proxy.ts                    # Next.js middleware (auth + security)
├── public/                     # Static assets (favicon, PWA icons)
│
├── src-tauri/                  # Tauri desktop app (Rust)
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri configuration
│   ├── src/main.rs             # Rust entry point
│   ├── src/lib.rs              # Tauri plugin setup
│   ├── icons/                  # App icons (all sizes)
│   └── capabilities/           # Tauri security capabilities
│
├── next.config.ts              # Next.js config (conditional Tauri export)
├── tsconfig.json               # TypeScript config (ES2022 target)
├── postcss.config.mjs          # PostCSS + Tailwind
└── package.json                # Scripts + dependencies
```

## Data Flow

### File Opening

```
User clicks file in explorer
  → FileExplorer dispatches CustomEvent('file-select', { path, sha })
  → EditorLayout handler catches event
  → Fetches /api/github/repos/.../contents/{path}
  → EditorContext.openFile(path, content, sha)
  → Monaco Editor renders file
  → EditorTabs shows new tab
```

### Agent Chat

```
User types message + Enter
  → AgentPanel.sendMessage()
  → buildEditorContext() prepends file/repo/selection context
  → gateway.sendRequest('chat.send', { sessionKey, message, idempotencyKey })
  → Gateway returns { status: 'started' }
  → Events arrive via onEvent('chat'):
      state: 'delta' → streamBuffer updated (live typing)
      state: 'final' → parseEditProposals() → append message
  → If [EDIT path] markers found → "Review diff" button shown
```

### Edit Flow (Cmd/Ctrl+K or /edit)

```
User selects code → Cmd/Ctrl+K → types instruction
  → CustomEvent('inline-edit-request', { filePath, instruction, selectedText })
  → AgentPanel handles event → sends to gateway with selection context
  → Agent responds with [EDIT path/to/file] + fenced code block
  → editParser detects proposal → "Review diff" button
  → Click → DiffViewer shows original vs proposed (LCS diff)
  → Apply → EditorContext.updateFileContent() (dirty flag set)
  → Reject → dismissed
```

### Commit Flow

```
User types /commit in agent panel
  → Agent formats commit message
  → POST /api/github/repos/.../commit
  → Single file: GitHub Contents API (PUT with SHA)
  → Multi file: Git Data API (blobs → tree → commit → update ref)
```

## Context Layer

### GatewayContext

Manages WebSocket connection to the OpenClaw gateway:

- `connect(url, password)` → WebSocket + challenge/response auth
- `sendRequest(method, params)` → JSON-RPC over WebSocket
- `onEvent(event, callback)` → subscribe to gateway events
- Auto-reconnect with stored credentials
- Status: `disconnected | connecting | authenticating | connected`

### RepoContext

Manages current repository state:

- `repo` → `{ owner, repo, branch, fullName }`
- `tree` → flat array of `TreeNode` (path, type, sha)
- `loadTree()` → fetches recursive tree from GitHub API
- Tree cached until repo/branch changes

### EditorContext

Manages open files and editor state:

- `files` → array of `{ path, content, language, sha, dirty }`
- `activeFile` → currently focused file path
- `openFile() / closeFile() / updateFileContent()`
- Tab order persisted to localStorage
- Language detection from file extension

## Session Isolation

Three dedicated agent sessions prevent message cross-talk:

| Session Key              | Purpose                                |
| ------------------------ | -------------------------------------- |
| `agent:main`             | Nova (personal assistant via Telegram) |
| `agent:main:codeflow`    | CodeFlow PR maintainer                 |
| `agent:main:code-editor` | KnotCode coding agent                  |

Each session has its own system prompt injected via `chat.inject` on first connect.

## Security

### Authentication (3 layers)

1. **WorkOS AuthKit** — OAuth login at proxy level
2. **Gateway Password** — WebSocket authentication
3. **IP Allowlist** — Optional CIDR-based restriction

### API Security

- All GitHub API routes use `requireToken()` (header or env var)
- `proxy.ts` adds security headers: CSP, HSTS, X-Frame-Options, nosniff
- CORS preflight handling
- DOMPurify on all rendered markdown (XSS prevention)

### Tauri Security

- Default capabilities (minimal permissions)
- CSP set to null (WebView manages its own)
- No external URL navigation without explicit allow

## Theme System

Four themes defined in `globals.css` via CSS custom properties:

| Theme            | Brand Color          | Vibe               |
| ---------------- | -------------------- | ------------------ |
| Obsidian         | `#ca3a29` (red)      | Dark, professional |
| Neon             | `#a855f7` (purple)   | Deep black + neon  |
| Catppuccin Mocha | `#cba6f7` (lavender) | Warm pastel dark   |
| Bone             | `#78716c` (stone)    | Light, minimal     |

Monaco editor reads these variables at mount time via `registerEditorTheme()` to match the active theme.

Theme selection persisted to `localStorage('code-editor:theme')`.
