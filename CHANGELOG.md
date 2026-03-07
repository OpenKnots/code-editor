# Changelog

## [1.4.0] — 2026-03-07

### Added

- **iOS support** — Tauri iOS builds for iPhone simulator (arm64)
- **Edge-to-edge display** — Native WKWebView configuration via Rust objc2 FFI (`contentInsetAdjustmentBehavior = .never`, `edgesForExtendedLayout = .all`)
- **Mobile-first defaults** — Fresh installs on small screens default to Chat mode instead of Classic/Editor
- **CSS safe area handling** — Content respects notch and home indicator via `env(safe-area-inset-*)`
- **Mobile layout** — Borderless, full-bleed shell frame on screens ≤768px
- **Mobile features** — QR connect, agent approval cards, session presence, caffeinate toggle
- **Settings panel** — Redesigned with Connect + General tabs, device list, QR code

### Fixed

- **iOS bottom gap** — WKWebView no longer constrained to safe area bounds
- **Dev mode URL** — `devUrl` corrected to Next.js dev server port (3000)

### Changed

- Added `objc2` v0.6.4 as direct Cargo dependency for iOS native interop
- iOS capabilities separated from desktop (`capabilities/mobile.json`)
- Desktop-only crates (`portable-pty`, `window-vibrancy`, `keyring`, etc.) gated with `#[cfg(not(target_os = "ios"))]`

## [1.1.0] — 2026-03-05

### Added

- **OpenClaw Dev persona** — Docs-aware ecosystem agent preset in Agent Builder with PR workflow, issue triage, architecture review, and security lens
- **Git sidebar panel** — Full git status, staging, and branch management in the sidebar
- **Linux AppImage** — Cross-platform release (x86_64)
- **Apple code signing & notarization** — macOS DMG signed with Developer ID and notarized by Apple
- **Comparison chart** — README now includes competitor averages column

### Fixed

- **Spotify login broken in production build** — Added `tauri-plugin-localhost` to serve assets via `http://localhost:3080` instead of `tauri://` custom protocol (#1)
- **YouTube Error 153** — Same localhost plugin fix resolves YouTube embed origin rejection (#2)

### Changed

- App size reduced from 8.4 MB to 7.8 MB (signed DMG)
- Improved component styles and layout consistency

## [1.0.0] — 2026-03-05

### Added

- Initial public release
- AI Agent Chat with Ask, Agent, and Plan modes
- Agent Builder wizard — 5 persona presets + custom system prompts
- Per-hunk diff review (accept/reject individual changes)
- 7 themes: Obsidian, Bone, Neon, Catppuccin, VooDoo, CyberNord, PrettyPink
- Monaco Editor with multi-tab, Vim mode, ⌘K inline edits, ⌘P quick open
- GitHub integration via device flow auth
- Integrated terminal (xterm.js) with gateway slash commands
- Spotify and YouTube plugins
- Tauri v2 desktop app (macOS Apple Silicon)
- Apache 2.0 license
