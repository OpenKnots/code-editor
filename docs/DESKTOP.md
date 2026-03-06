# Desktop Application (Tauri)

## Overview

KnotCode ships as a native desktop application for **Windows, macOS, and Linux** via [Tauri v2](https://v2.tauri.app). Tauri wraps the system's native WebView (WebKit on macOS, WebView2 on Windows) instead of bundling Chromium, resulting in a ~10MB binary vs ~150MB for Electron.

## Architecture

```
┌─────────────────────────────────┐
│      Native Desktop Bundle      │
│                                 │
│  ┌───────────────────────────┐  │
│  │     System WebKit View    │  │
│  │                           │  │
│  │   Next.js Static Export   │  │
│  │   (HTML/CSS/JS bundle)    │  │
│  │                           │  │
│  └─────────────┬─────────────┘  │
│                │                │
│  ┌─────────────┴─────────────┐  │
│  │    Rust Backend (Tauri)    │  │
│  │    - Window management     │  │
│  │    - Native menu bar       │  │
│  │    - File system access    │  │
│  │    - IPC bridge            │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Prerequisites

### 1. Rust Toolchain

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Add to shell profile (~/.zshrc on macOS, ~/.bashrc on Linux, $PROFILE on Windows)
echo '. "$HOME/.cargo/env"' >> ~/.zshrc
source ~/.zshrc

# Verify
rustc --version  # rustc 1.x.x
cargo --version  # cargo 1.x.x
```

### 2. Platform-specific tools

- **macOS:** Xcode Command Line Tools — `xcode-select --install`
- **Windows:** Visual Studio Build Tools (for Rust MSVC target)
- **Linux:** Build essentials — `sudo apt install build-essential` (Debian/Ubuntu) or equivalent

### 3. Node.js + pnpm

```bash
# Already required for the web app
node --version   # v18+ required
pnpm --version   # any recent version
```

## Development

```bash
# Install dependencies (if not already done)
pnpm install

# Start Tauri dev mode
# This runs Next.js dev server + opens a native desktop window
pnpm tauri:dev
```

The dev window connects to `http://localhost:3080` with full hot reload. Code changes in React components reflect immediately in the native window.

**First run is slow** (2-5 minutes) — Rust compiles ~300 dependency crates. Subsequent runs are fast (<30 seconds).

## Production Build

```bash
# Build native installer (.msi/.exe on Windows, .app/.dmg on macOS, .deb/.AppImage on Linux)
pnpm tauri:build
```

Output location: `src-tauri/target/release/bundle/` — structure varies by platform (e.g. `macos/KnotCode.app`, `windows/*.msi`, `linux/*.AppImage`).

## Configuration

### `src-tauri/tauri.conf.json`

```json
{
  "productName": "Knot Code",
  "version": "0.1.0",
  "identifier": "ai.openknot.code-editor",
  "build": {
    "frontendDist": "../out", // Static export directory
    "devUrl": "http://localhost:3080", // Dev server URL
    "beforeDevCommand": "pnpm dev", // Start Next.js dev
    "beforeBuildCommand": "pnpm build:static" // Build static export
  },
  "app": {
    "windows": [
      {
        "title": "Knot Code",
        "width": 1440,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600,
        "titleBarStyle": "Overlay" // macOS native titlebar
      }
    ]
  }
}
```

### Next.js Conditional Export

`next.config.ts` automatically detects Tauri builds:

```typescript
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined

const nextConfig = {
  ...(isTauri ? { output: 'export' } : {}),
}
```

- **Web (Vercel):** Normal server-rendered mode with API routes
- **Tauri:** Static export (no server, all client-side)

## How It Differs from Web

| Aspect      | Web (Vercel)              | Desktop (Tauri)         |
| ----------- | ------------------------- | ----------------------- |
| Rendering   | Server + Client           | Client only (static)    |
| API Routes  | Server-side proxy         | Direct GitHub API calls |
| Auth        | WorkOS + gateway password | Gateway password only   |
| File System | None                      | Native access (future)  |
| Updates     | Instant (redeploy)        | Manual / auto-updater   |
| Offline     | No                        | Partial (cached files)  |

## Tauri vs Electron

|             | Tauri v2         | Electron         |
| ----------- | ---------------- | ---------------- |
| Binary size | ~10MB            | ~150MB           |
| Runtime     | System WebKit    | Bundled Chromium |
| Memory      | ~50MB            | ~200MB+          |
| Backend     | Rust             | Node.js          |
| macOS feel  | Native           | Chrome-like      |
| Build time  | 2-5 min (first)  | ~1 min           |
| Permissions | Capability-based | Open by default  |

## File Structure

```
src-tauri/
├── Cargo.toml              # Rust dependencies
├── tauri.conf.json         # App configuration
├── build.rs                # Build script
├── capabilities/
│   └── default.json        # Default security capabilities
├── icons/                  # App icons (all sizes)
│   ├── icon.icns           # macOS icon
│   ├── icon.ico            # Windows icon
│   ├── icon.png            # Base icon (512px)
│   ├── 32x32.png           # Small icon
│   ├── 128x128.png         # Medium icon
│   ├── 128x128@2x.png      # Retina medium
│   └── Square*.png         # Windows store logos
└── src/
    ├── main.rs             # Entry point (calls lib.rs)
    └── lib.rs              # Tauri app builder + plugins
```

## Future Desktop Features

- [ ] **Native file system access** — open local files without GitHub
- [ ] **System menu bar** — File/Edit/View menus with shortcuts
- [ ] **Auto-updater** — check for updates on launch
- [ ] **Native notifications** — build status, agent replies
- [ ] **Deep linking** — `code-editor://open?repo=...` URL scheme
- [ ] **Touch Bar** (macOS) — common actions (save, run, commit)
- [ ] **Spotlight integration** (macOS) — search files via macOS Spotlight
