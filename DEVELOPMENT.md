# KnotCode — Development & Release Guide

## Quick Start

```bash
# First time
./scripts/dev.sh setup

# Daily development
./scripts/dev.sh              # web dev server → http://localhost:3080
./scripts/dev.sh desktop      # desktop dev (Tauri + hot reload)
```

---

## Prerequisites

| Tool    | Version | Install                            |
| ------- | ------- | ---------------------------------- |
| Node.js | ≥ 20    | https://nodejs.org                 |
| pnpm    | latest  | `npm i -g pnpm`                    |
| Rust    | stable  | https://rustup.rs _(desktop only)_ |

## Project Structure

```
code-editor/
├── app/                    # Next.js app router (pages, layout)
│   ├── globals.css         # Theme tokens + all CSS (18 themes)
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx            # Main editor layout + view routing
├── components/
│   ├── preview/            # Browser preview system
│   │   ├── preview-panel   # Main preview with toolbar
│   │   ├── device-carousel # Multi-device preview
│   │   ├── pip-window      # Picture-in-Picture floating preview
│   │   ├── agent-annotations # AI change highlights
│   │   └── component-isolator # Component isolation (Cmd/Ctrl+Shift+I)
│   ├── workspace-sidebar   # Chat list + navigation
│   ├── agent-panel         # Chat/agent interface
│   ├── settings-panel      # Settings (themes, GitHub, editor)
│   └── ...
├── context/                # React context providers
│   ├── preview-context     # Preview state (devices, PiP, annotations)
│   ├── theme-context       # Theme management (18 themes × dark/light)
│   ├── gateway-context     # OpenClaw gateway WebSocket
│   ├── github-auth-context # GitHub token (manual + gateway)
│   ├── editor-context      # Open files + tabs
│   ├── local-context       # Local filesystem (Tauri + Web FS API)
│   └── view-context        # View routing (chat/editor/preview/git/prs)
├── lib/                    # Utilities
├── scripts/
│   ├── dev.sh              # Development runner
│   ├── build-release.sh    # Production build + release
│   ├── run.mjs             # pnpm run:web / run:desktop
│   └── release.mjs         # Version bump + git tag
├── src-tauri/              # Tauri (Rust) desktop shell
│   ├── tauri.conf.json     # App config (window, permissions)
│   ├── Cargo.toml          # Rust dependencies
│   └── src/                # Rust backend (file I/O, git, etc.)
├── .env.example            # Environment template
├── .github/workflows/
│   └── release.yml         # CI: build macOS DMG on tag push
└── next.config.ts          # Next.js config (static export)
```

---

## Development

### Web (browser)

```bash
./scripts/dev.sh web
# or
pnpm dev
```

Opens at **http://localhost:3080** with Turbopack hot reload.

### Desktop (Tauri)

```bash
./scripts/dev.sh desktop
# or
pnpm desktop:dev
```

Launches a native macOS window with the web app inside. Both the web frontend and Rust backend hot-reload.

### Clean rebuild

```bash
./scripts/dev.sh clean
# Removes .next, out, and caches
```

---

## Environment Variables

Copy `.env.example` → `.env` and fill in:

| Variable                        | Required | Description                                                                                                                              |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | Optional | Spotify PKCE OAuth Client ID for the music plugin. Create at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard). |

> **Note:** `NEXT_PUBLIC_` variables are embedded in the client bundle. Only put public client IDs here, never secrets.

---

## Production Build

### Web (static export)

```bash
./scripts/build-release.sh web
```

Outputs to `./out/` as a static site. Deploy anywhere:

```bash
# Vercel (recommended)
vercel deploy --prod

# Any static host
npx serve out

# Test locally
./scripts/build-release.sh web --serve
```

### Desktop (macOS DMG)

```bash
# Apple Silicon (aarch64) DMG
./scripts/build-release.sh desktop
```

The DMG is output to `src-tauri/target/.../bundle/dmg/`.

**First build takes 5–10 minutes** (Rust compilation). Subsequent builds are cached and much faster.

---

## Release Process

### 1. Pre-release verification

```bash
./scripts/build-release.sh verify
```

Checks:

- ✅ Clean git working tree
- ✅ Lock file in sync
- ✅ Zero TypeScript errors
- ✅ Successful production build
- ✅ No leaked secrets in source
- ✅ `.env.example` exists
- ✅ Version consistency (package.json ↔ tauri.conf.json)

### 2. Bump version + tag

```bash
# Local only (tag but don't push)
./scripts/build-release.sh release 1.0.0

# Push to trigger CI release
./scripts/build-release.sh release 1.0.0 --push
```

This:

1. Runs all verification checks
2. Bumps version in `package.json` + `src-tauri/tauri.conf.json`
3. Commits: `chore: release v1.0.0`
4. Creates git tag `v1.0.0`
5. (with `--push`) Pushes to origin, triggering the GitHub Actions workflow

### 3. CI builds the DMG

The `release.yml` workflow:

1. Builds an aarch64 macOS DMG (Apple Silicon)
2. Code-signs with Apple Developer certificate (if secrets are configured)
3. Notarizes with Apple (if secrets are configured)
4. Creates a **draft** GitHub Release with the DMG attached

### 4. Publish the release

1. Go to [Releases](https://github.com/OpenKnots/code-editor/releases)
2. Review the draft, edit release notes if needed
3. Click **Publish release**

---

## Keyboard Shortcuts

| Shortcut           | Action                      |
| ------------------ | --------------------------- |
| `Cmd/Ctrl+B`       | Toggle file explorer        |
| `Cmd/Ctrl+J`       | Toggle terminal             |
| `Cmd/Ctrl+\`       | Toggle sidebar              |
| `Cmd/Ctrl+P`       | Quick open file             |
| `Cmd/Ctrl+Shift+I` | Isolate component (preview) |
| `Cmd/Ctrl+K`       | Inline edit                 |
| `Cmd/Ctrl+L`       | Send selection to chat      |
| `Cmd/Ctrl+S`       | Save file                   |
| `Cmd/Ctrl+Shift+F` | Global search               |
| `Cmd/Ctrl+Shift+P` | Command palette             |
| `Esc`              | Close overlays              |

---

## Themes

18 themes available (dark + light mode for each):

`Obsidian` · `Neon` · `Catppuccin` · `Bone` · `Caffeine` · `Claymorphism` · `Vercel` · `Vintage Paper` · `VooDoo` · `CyberNord`

Themes are defined in:

- `context/theme-context.tsx` — preset registry
- `app/globals.css` — CSS custom properties per theme

To add a new theme:

1. Add entry to `THEME_PRESETS` in `theme-context.tsx`
2. Add `.dark[data-theme="your-theme"]` + `[data-theme="your-theme"]:not(.dark)` blocks in `globals.css`
3. Add semantic tokens block
4. Add to shared selector groups (obsidian/neon/voodoo/cybernord)

---

## Preview System

The preview panel (`Cmd/Ctrl+3` or click Preview tab) connects to any local dev server:

- **URL bar** — type `localhost:5173` or any dev server URL
- **Device Carousel** — see your app on iPhone, Pixel, iPad, MacBook, Desktop simultaneously
- **Component Isolation** (`Cmd/Ctrl+Shift+I`) — isolate a React component from the active file
- **Picture-in-Picture** — float the preview over your code while editing
- **Agent Annotations** — when the AI makes changes, glowing highlights show what changed

---

## GitHub Authentication

Two methods (Settings → General → GitHub Connection):

1. **Gateway token** — auto-detected from OpenClaw gateway `GITHUB_TOKEN` env
2. **Manual PAT** — paste a Personal Access Token directly

Token is stored locally with obfuscation. Never sent to external servers.

---

## npm Scripts Reference

```bash
pnpm dev              # Next.js dev server (Turbopack)
pnpm build            # Production build
pnpm start            # Serve static output
pnpm tauri:dev        # Tauri desktop dev mode
pnpm tauri:build      # Tauri desktop production build
pnpm run:web          # Alias: dev server
pnpm run:web --build  # Alias: production build + serve
pnpm run:desktop      # Alias: Tauri dev
pnpm run:desktop --build  # Alias: Tauri production build
pnpm release <ver>    # Version bump + tag
```
