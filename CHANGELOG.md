# Changelog

## [1.9.0] — 2026-03-10

### ✨ Highlights

**Knot Code 1.9 is the biggest single-release update in the editor's history** — 21 commits, ~9,000+ lines of new code, shipping a completely redesigned home screen, VS Code-style navigation, a full Kanban board, a transformed Agent Builder Workshop, 8 new tactical themes, and dozens of UX polish improvements.

### 🏠 Redesigned Home Screen
- **Ambient gradient background** — Blue-purple radial glow on true black with animated grain texture
- **Dynamic greeting** — Time-aware greetings ("Good morning", "Night owl mode" at 3 AM)
- **Gradient tagline** — "What shall we build?" in blue→purple gradient text
- **Animated logo** — Entrance fade-in with continuous glow pulse
- **Glass suggestion cards** — 2×2 grid with staggered spring entrance animations
- **Premium composer** — Focus glow ring, cycling placeholder animation

### 🧭 VS Code-Style Navigation
- **Sidebar activity bar** — Collapsed icons with 2px brand-color active indicator
- **Expanded nav** — Labeled buttons with keyboard shortcuts on hover (⌘1-⌘9)
- **Top tab bar removed** — Zero wasted vertical space
- **View cycle toggle** — Mobile pill bar cycling Chat → Editor → Terminal
- **View transitions** — Subtle 150ms fade between views via AnimatePresence

### 📋 Kanban Board (NEW)
- **4 default columns** — Backlog, In Progress, Review, Done
- **Rich cards** — Title, description, priority (P0-P3), labels, assignee, due dates, subtasks
- **Drag & drop** — HTML5 native with visual drop indicators
- **Card detail panel** — Glass card sections, custom checkboxes, progress bars, comments, activity log
- **Multiple boards** — Create, rename, switch between boards
- **WIP limits** — Column warnings when work-in-progress exceeds threshold
- **Label system** — 5 built-in (bug, feature, docs, refactor, urgent) + custom labels
- **Persistence** — Full localStorage persistence across sessions

### 🏗️ Agent Builder Workshop (TRANSFORMED)
- **Template Gallery** — 12 beautiful agent templates (Code Reviewer, PR Agent, DevOps Bot, etc.)
- **Step-by-step Wizard** — 7-stage guided flow with progress bar and validation
- **Live Preview** — Real-time system prompt + config JSON with token count
- **Readiness Ring** — Circular SVG progress indicator with color-coded status
- **Quick Deploy** — One-click deploy agent to Chat with custom system prompt
- **Undo/Redo** — 20-state blueprint history (⌘Z / ⌘⇧Z)
- **Share & Export** — Share as link (base64 URL), export/import JSON blueprints
- **Agent Flow** — Visual pipeline with checkmarks on configured stages
- **Evaluation integration** — "Run Evaluation" button from review step

### 🎨 Themes
- **Claude theme** (NEW DEFAULT) — True black (#000), blue accent (#3b82f6), premium squircle borders
- **Field Manual collection** (8 NEW themes):
  - 🌿 Field Manual — OD green, typewriter font, earth tones
  - ⚓ Navy Ops — Deep navy, steel blue, submarine console
  - 🏜️ Desert Storm — Sand/amber, warm desert palette
  - 🔳 Blackout — True black, grayscale only, OPSEC mode
  - ❄️ Arctic White — Ice gray, frost blue, polar ops
  - 👁️ Recon (NVG) — ALL green phosphor, night vision goggles
  - 📡 SIGINT — ALL amber/gold, vintage CRT terminal
  - ✈️ Air Force HUD — Cyan heads-up display, cockpit glass
- **Lazy loading** — Manual themes loaded on-demand via dynamic import
- **Customizable editor background** — Grid, dots, gradient, or grid-logos patterns

### 🔌 MCP Library (NEW)
- **Marketplace view** — Standalone view replacing Settings-embedded MCP tab (⌘5)
- **20 servers** — PostgreSQL, Filesystem, Brave Search, GitHub, Slack, Linear, SQLite, Memory, Puppeteer, Fetch, Redis, MongoDB, Notion, Google Drive, Docker, Sentry, Supabase, Vercel, Cloudflare, Stripe
- **Custom Server** — Add your own MCP server with custom command/URL
- **Category filtering** — All, Installed, Featured, Databases, APIs, Developer, Custom
- **Gateway RPC wiring** — Real mcp.list/add/remove/start/stop/sync calls

### 💬 Chat Improvements
- **Inline pickers** — Type `/skill`, `/mcp`, or `/prompt` to see picker popup with search
- **Contextual help** — Empty picker states show setup instructions instead of "No items found"
- **Inline diff toolbar** — VS Code-style floating toolbar with per-hunk Undo/Keep (⌘Y/⌘N)
- **Message grouping** — Reduced spacing for consecutive same-sender messages
- **Link hover underlines** — Links show underline only on hover
- **Removed ugly focus glow** — Replaced rotating conic-gradient border with clean transition

### 🖥️ Editor Enhancements
- **Breadcrumbs** — File path navigation above editor with clickable segments
- **Monaco minimap** — Code overview enabled (maxColumn 80, renderCharacters false)
- **Empty state redesign** — "Open a project to start coding" with glass card action buttons
- **Grid pattern background** — Subtle 40px grid with faint KnotLogo watermark
- **Preview split panel** — Cursor-style preview + chat side-by-side with draggable divider

### 🔧 Developer Experience
- **Terminal auto-cd** — Terminal automatically changes directory when project switches
- **Dev server detection** — Green indicator when localhost:3000 is reachable
- **Toast notification system** — Provider + useToast() hook, glass cards, bottom-right stack
- **Status bar** — Git branch, gateway status, dev server pill
- **Skills hidden on mobile** — Accessible on desktop only
- **Terminal event fix** — Added runId/idemKey fallbacks for gateway event matching

### 🐛 Bug Fixes
- Fixed 12 unused imports/variables in agent-panel.tsx
- Fixed React hook dependency warnings
- Fixed YouTube status bar missing TrackInfo fields
- Fixed markdown preview Date.now() in useMemo → useEffect with ref
- Fixed sidebar nav horizontal layout → proper vertical stack
- Removed empty shell-topbar wasted space

### 📊 By the Numbers
- **21 commits** in a single session
- **~9,000+ lines** of new code
- **5 new views** — MCP Library, Kanban, Workshop, Preview Split, Template Gallery
- **8 new themes** — Field Manual tactical collection
- **20 MCP servers** in catalog
- **12 agent templates** in Workshop
- **0 TypeScript errors** — All changes pass strict mode

## [1.8.0] — 2026-03-09

### Added

- **MCP Settings** — Gateway-side MCP server management UI
- **Skills tab** — Hidden on mobile, visible on desktop

## [1.7.0] — 2026-03-09

### Added

- **Plan Mode** — Cursor-style structured plan generation with Execute and Edit buttons; plans render step-by-step before any code is touched
- **Agent Mode — activity feed** — real-time action log shows tool calls, file edits, and status while the agent runs
- **Agent Mode — approval tiers** — granular permission levels (auto-apply, confirm, manual) per operation type
- **Agent Mode — auto-apply edits** — accepted diff hunks apply immediately without a separate confirm step
- **Codex theme** — new dark/light theme pair with ink-black backgrounds and warm accent tones
- **Skills UI redesign** — refined layout and typography for the skills panel
- **Mobile terminal tab** — bottom tab bar now surfaces a full-screen gateway terminal (replaces Settings shortcut)

### Fixed

- **Chat send race condition** — message text passed directly to the send handler instead of via `setInput` + `setTimeout`
- **Git sidebar action buttons** — inline buttons now only appear when a file is unstaged and in local mode

### Changed

- **Settings & WorkspaceSidebar** — unified spacing, removed stale automation references
- **Terminal chat relay** — `sendChatMessage` now handles `streaming` and `started` statuses; timeout extended to 2 min
- **Chat tab visibility** — Chat is now accessible from Classic and TUI modes via `visibleViews`
- **Dev URL** — reverted to port 3000 (port 3080 conflicted with localhost plugin)

### Removed

- Workshop view and related components — streamlined navigation

## [1.6.0] — 2026-03-09

### Added

- **GitHub Device Flow sign-in** — Authenticate with GitHub directly from the app without leaving the editor; username badge auto-appears after sign-in
- **GitHub hub in Settings** — Device Flow auth, PAT entry, starred favorites, and repo list in one place; secure token persistence on iOS via localStorage fallback
- **`tauri-plugin-http`** — Server-side HTTP plugin bypasses CORS restrictions for GitHub Device Flow on iOS
- **Mobile file explorer** — Browse and open repo files from chat home on mobile
- **Editor workflow tabs** — Streamlined editor view with workflow tab strip; files can be revealed from chat
- **Cross-platform desktop release assets** — GitHub releases now attach macOS (`.dmg`), Linux (`.AppImage`, `.deb`), and Windows (`.exe`, `.msi`) installers from the release workflow

### Fixed

- **iOS export compliance** — Added `ITSAppUsesNonExemptEncryption = false` to skip the TestFlight export compliance prompt
- **Mobile chat home layout** — Content pushed to top instead of vertical center for better reachability
- **Mobile connect section** — Collapses by default; gateway URL hidden behind a tap-to-reveal control

### Changed

- **Mobile tabs** — Skills replaces Workshop in the bottom tab bar
- **Version metadata aligned** — Synced app, Tauri, Rust, and Apple bundle versions for the 1.6.0 release

## [1.5.0] — 2026-03-08

### Added

- **GitHub project selector** — Connect to any GitHub repo from mobile chat home (`owner/repo` or full URL)
- **Settings tab on mobile** — Full settings panel accessible from bottom tab bar
- **Native-style tab bar** — Slim iOS-native tab bar with bare icons, labels, and haptic feedback (5ms vibration)

### Changed

- **Mobile tabs curated** — Chat, Editor, Git, Workshop, Settings (dropped desktop-only views: Skills, Preview, Diff)
- **44px touch targets** — Tab bar buttons meet iOS HIG minimum with `touch-manipulation` CSS
- **Hidden model picker on mobile** — Mode selector (Ask/Agent/Plan) stays, model name hidden to save space
- **Cleaner connect form** — Icon-prefixed inputs (globe + lock), focus rings, always-visible form
- **Mobile header polish** — Dynamic workspace name, smaller connection dot, reduced padding
- **Hidden chat header on mobile** — Saves 40px vertical space; session info available elsewhere
- **"Let's weave" branding** — Aligns with Knot Code identity (weaving/knots metaphor)
- **Minimal composer on mobile** — No branch pill, permissions toggle, or gateway status in toolbar

### Removed

- Suggestion cards on mobile (too cluttered on small screens)
- Open Folder / Clone Repo buttons on mobile (replaced by GitHub project selector)
- Mode switcher in mobile header (redundant with bottom tab bar)
- "Gateway active" status text row (colored dot is sufficient)
- KnotCode footer on mobile

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
