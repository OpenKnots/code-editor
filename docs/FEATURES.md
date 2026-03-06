# Features

## Current Features (v0.1.0)

### Editor

- [x] **Monaco Editor** — VS Code-grade editing in the browser
- [x] **Multi-tab** — open multiple files with tab bar, close, switch
- [x] **Tab persistence** — open tabs survive page refresh (localStorage)
- [x] **Language detection** — automatic syntax highlighting from file extension
- [x] **Custom theme** — Monaco colors match the active CSS theme (not generic vs-dark)
- [x] **Breadcrumb navigation** — clickable `src > components > file.tsx` path segments
- [x] **Dirty indicators** — dot on modified tabs, "modified" badge in breadcrumb
- [x] **Line highlighting** — current line highlighted
- [x] **Bracket pair colorization** — matching brackets colored
- [x] **Smooth scrolling** — cursor and scroll animations
- [x] **No red squiggles** — semantic validation disabled (no tsconfig context)

### File Explorer

- [x] **Recursive tree** — full repo tree from GitHub API
- [x] **Search** — filter files by name
- [x] **File type icons** — colored icons per extension (TS, JS, JSON, CSS, etc.)
- [x] **Directory expand/collapse** — auto-expand shallow directories
- [x] **Active file highlight** — brand-colored highlight on the open file
- [x] **Refresh** — reload tree without full page refresh

### AI Agent

- [x] **Dedicated session** — isolated `agent:main:code-editor` session
- [x] **Full-stack expert persona** — Next.js, Lit, React, TypeScript, databases, security
- [x] **System prompt injection** — comprehensive behavior rules on first connect
- [x] **Per-message context** — active file, content, language, open files, repo info
- [x] **Streaming responses** — live typing with markdown preview
- [x] **Edit proposals** — `[EDIT path]` markers → "Review diff" button
- [x] **Diff viewer** — LCS-based, dual line numbers, green/red, Apply/Reject
- [x] **Slash commands** — `/edit`, `/explain`, `/refactor`, `/generate`, `/search`, `/commit`, `/diff`
- [x] **Command suggestions** — autocomplete dropdown when typing `/`
- [x] **Click-to-navigate** — line references in agent messages scroll the editor
- [x] **Clear chat** — 2-step confirmation (eraser → warning → clear)
- [x] **No duplicate responses** — idempotency key guard prevents double replies

### Navigation

- [x] **⌘P Quick File Open** — fuzzy search across entire repo, keyboard-driven
- [x] **⌘K Inline Edit** — select code → type instruction → agent proposes diff
- [x] **⌘B Toggle Explorer** — show/hide file tree
- [x] **⌘J Toggle Agent** — show/hide agent panel
- [x] **? Shortcuts Overlay** — modal showing all keyboard shortcuts
- [x] **Chat bubble** — floating button when agent panel is hidden

### Layout

- [x] **3-panel layout** — file explorer | editor | agent panel
- [x] **Resizable panels** — drag handles with brand-colored feedback
- [x] **Viewport-locked** — `h-full` chain, no page scrolling
- [x] **Status bar** — repo name, branch, modified file count, version

### Themes

- [x] **4 themes** — Obsidian, Neon, Catppuccin Mocha, Bone
- [x] **Persistent** — saved to localStorage
- [x] **Monaco integration** — editor theme auto-matches
- [x] **Palette icon** — dropdown in header

### Auth & Security

- [x] **Gateway login gate** — no UI until authenticated
- [x] **WorkOS AuthKit** — OAuth at proxy level
- [x] **Gateway password** — WebSocket challenge/response
- [x] **IP allowlist** — optional CIDR restriction
- [x] **Security headers** — CSP, HSTS, X-Frame-Options, nosniff
- [x] **DOMPurify** — XSS prevention on markdown rendering
- [x] **requireToken()** — all API routes verify GitHub token

### Branch Management

- [x] **Branch switcher** — dropdown showing all branches
- [x] **Protected branch indicator** — shield icon
- [x] **One-click switch** — changes branch and reloads tree

### GitHub Integration

- [x] **File tree API** — recursive tree fetch
- [x] **File contents API** — read files with base64 decoding
- [x] **Commit API** — single file (Contents API) + multi-file (Git Data API)
- [x] **Repo selector** — owner/repo input with validation

### Desktop App (Tauri)

- [x] **Windows, macOS, Linux** — Tauri v2 with native WebView (WebKit on macOS, WebView2 on Windows)
- [x] **~10MB binary** — no bundled Chromium
- [x] **Custom icons** — OpenKnot logo at all sizes
- [x] **Native titlebar** — platform-appropriate styling
- [x] **Dev mode** — `pnpm tauri:dev` with hot reload
- [x] **Production build** — `pnpm tauri:build` → .msi/.exe, .app/.dmg, or .deb/.AppImage

---

## Planned Features (Roadmap)

### Near Term

- [ ] **Git status in file tree** — green (new), orange (modified), red (deleted) indicators
- [ ] **Modified files diff** — view all changes before committing
- [ ] **Cmd/Ctrl+S Save shortcut** — quick commit current file
- [ ] **Agent-initiated file navigation** — agent says "open file X" → editor opens it
- [ ] **Selection-aware /explain** — explain selected code, not whole file
- [ ] **Recent files** — quick access to recently opened files

### Medium Term

- [ ] **Split editor** — side-by-side file viewing
- [ ] **Minimap toggle** — optional code minimap
- [ ] **Terminal panel** — bottom panel for command output
- [ ] **Multi-file edit proposals** — agent edits spanning multiple files
- [ ] **File creation** — create new files via agent or UI
- [ ] **File deletion** — delete files with confirmation
- [ ] **Rename/move** — rename files via context menu
- [ ] **Go to definition** — click symbols to jump to definition
- [ ] **Search and replace** — ⌘H across current file
- [ ] **Global search** — ⌘⇧F across all repo files

### Long Term

- [ ] **Real-time collaboration** — multiple users editing simultaneously
- [ ] **Git history** — file blame, commit log, diff between commits
- [ ] **PR integration** — open PRs, review diffs, merge from editor
- [ ] **Extension system** — plugin architecture for custom tools
- [ ] **Multiple repos** — workspace with several repos open
- [ ] **Settings UI** — configuration panel (font size, tab size, etc.)
- [ ] **Offline mode** — local file editing without GitHub
- [ ] **Windows/Linux desktop** — Tauri supports all platforms
- [ ] **Auto-update** — Tauri updater for seamless desktop updates
- [ ] **Custom app icon** — generate branded icon from design system
