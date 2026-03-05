# Knot Code

A browser-based and desktop code editor powered by an AI coding agent via the [OpenClaw](https://github.com/openclaw/openclaw) gateway. Think Cursor, but with your own gateway-integrated agent.

```
┌──────────────┬──────────────────────────┬─────────────────┐
│  File Tree   │   Monaco Editor          │   Agent Panel   │
│              │   (multi-tab, vim mode)  │   (chat + diff) │
│  ⌘B toggle   │   ⌘K inline edit         │   ⌘J toggle     │
│              │   ⌘P quick open          │                 │
├──────────────┴──────────────────────────┴─────────────────┤
│  Terminal (xterm.js)                                      │
└───────────────────────────────────────────────────────────┘
```

## Quick Start

### Web (Vercel)

Live at [editor.openknot.ai](https://editor.openknot.ai)

```bash
pnpm install
pnpm dev              # http://localhost:3080
pnpm build            # production build (Vercel)
```

Or use the unified run script:

```bash
pnpm run:web          # dev server
pnpm run:web --build  # production build + start
```

### Desktop (macOS)

```bash
pnpm install
pnpm run:desktop          # dev mode (Tauri + hot reload)
pnpm run:desktop --build  # production build (.app + .dmg)
```

> First Tauri build takes 2-5 minutes (compiling Rust deps). Subsequent builds are fast.

### Environment

Copy `.env.example` to `.env.local` and fill in the required values. See the file for detailed descriptions of each variable (WorkOS keys, GitHub tokens, IP allowlist, sponsor gate, etc.).

## Features

See [docs/FEATURES.md](docs/FEATURES.md) for the full feature list with current status and roadmap.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical architecture, data flow, and component map.

## Documentation

| Doc | Description |
|-----|-------------|
| [FEATURES.md](docs/FEATURES.md) | Feature list, status, and roadmap |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture and component map |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development workflow and conventions |
| [DESKTOP.md](docs/DESKTOP.md) | Tauri desktop build details |
| [AGENT.md](docs/AGENT.md) | AI agent integration |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and fixes |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` | Quick file open (fuzzy search) |
| `⌘K` | Inline edit at selection |
| `⌘B` | Toggle file explorer |
| `⌘J` | Toggle agent panel |
| `?` | Keyboard shortcuts overlay |
| `Enter` | Send message (in agent panel) |
| `Esc` | Close overlays |

## Tech Stack

- **Framework:** Next.js 16 + React 19 + TypeScript 5.9
- **Styling:** Tailwind CSS v4 (CSS variables, no `@apply`)
- **Editor:** Monaco Editor (`@monaco-editor/react`) with optional vim mode (`monaco-vim`)
- **Terminal:** xterm.js (`@xterm/xterm`) with fit addon and web links
- **Icons:** `@iconify/react` with Lucide icon set
- **Auth:** WorkOS AuthKit (`@workos-inc/authkit-nextjs`)
- **Proxy:** Next.js 16 proxy (`proxy.ts`) for IP allowlist, CORS, security headers, and session management
- **Desktop:** Tauri v2 (Rust + system WebKit)
- **Package Manager:** pnpm (always pnpm, never npm/yarn/bun)

## License

Private — OpenKnot organization.
