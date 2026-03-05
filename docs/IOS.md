# iOS Application Plan

## Goal

Ship an iOS version of KnotCode that is useful on day one, while respecting iOS platform limits and App Store policies.

This is a product-scope adaptation, not a direct desktop parity port.

## Current Platform Reality

The current desktop app relies on capabilities that are not available (or not practical) on iOS:

- Local shell and PTY-backed terminal sessions
- Running `git` as a system CLI from Rust commands
- Starting/stopping the local OpenClaw engine process from the app
- Wide open local filesystem access patterns optimized for desktop workflows

## Recommended Product Shape

Build iOS as a remote-first companion/editor:

- Keep: chat, repository browsing, file editing, commit/push via GitHub API, settings/themes
- Replace: local runtime assumptions with remote gateway and API-backed workflows
- Defer: desktop-only local terminal and local git shell flows

## Phase Plan

### Phase 0 - Product and Technical Scope (1 week)

- Define target persona and success metrics (for example: review-and-edit on the go)
- Confirm feature set for v1 (must-have vs later)
- Decide gateway connection model for mobile (self-hosted remote endpoint, auth model)
- Finalize iOS UX constraints (touch-first interactions, reduced panel complexity)

Deliverables:

- V1 feature matrix (supported, modified, deferred)
- Architecture decision record for mobile gateway/auth
- App Store policy checklist

### Phase 1 - Foundation and Build Target (1-2 weeks)

- Set up Tauri iOS target and native project scaffolding
- Add iOS build/run scripts and CI entry points
- Introduce platform capability flags in app code (desktop vs web vs mobile)
- Ensure safe behavior when desktop-only commands are unavailable

Deliverables:

- App launches on simulator/device
- No crashes from desktop-only code paths
- Basic smoke test checklist

### Phase 2 - Core Mobile Experience (2-3 weeks)

- Implement mobile-first layout defaults (drawer-first navigation, simplified chrome)
- Tune editor interactions for touch
- Keep file open/edit/save flow via existing API/local-web pathways
- Improve reconnect/resume behavior for unstable mobile networks

Deliverables:

- Stable open/edit/save cycle on iPhone
- Acceptable readability and interaction ergonomics
- Session persistence and reconnect validation

### Phase 3 - GitHub + Agent Flows (1-2 weeks)

- Validate GitHub auth flow UX on iOS
- Keep API-driven commit/push and branch operations
- Hard-disable or hide unsupported local git/terminal actions on mobile
- Verify agent chat and diff-review loops on mobile form factors

Deliverables:

- End-to-end: open repo -> edit file -> commit -> push
- End-to-end: ask agent -> review diff -> apply edit

### Phase 4 - Hardening, Security, and Distribution (1-2 weeks)

- Keychain/token handling verification and secure defaults
- Performance pass (memory, startup, heavy file handling)
- Crash/error telemetry strategy
- Signing, provisioning, TestFlight pipeline
- Beta feedback loop and launch criteria

Deliverables:

- TestFlight build with release notes
- Launch checklist and known limitations
- Go/no-go decision report

## Effort Estimate

- MVP iOS companion: ~5-10 weeks total
- Team assumption: 1 engineer focused, plus design/QA support
- Scope risk: expands quickly if desktop parity is required

## Feature Matrix (Initial)

### Keep in iOS MVP

- Agent chat and streaming responses
- Repo tree browsing
- File editing
- Diff review/apply
- GitHub API commit/push flows
- Theme and user settings

### Modify for iOS

- Layout/navigation (touch-first)
- Authentication prompts and token UX
- Shortcut-heavy interactions

### Defer from iOS MVP

- Local terminal panel
- Local shell command execution
- Local git CLI operations
- Local engine lifecycle controls

## Risks and Mitigations

- Remote gateway reliability on mobile networks  
  Mitigation: reconnection/backoff, clear connection state, retry UX

- App Store policy friction around code/editor semantics  
  Mitigation: avoid arbitrary local execution features in iOS build, document behavior clearly

- Performance and memory pressure on large repos/files  
  Mitigation: paging/lazy loading, file size guards, explicit UX for very large files

- Scope creep toward full desktop parity  
  Mitigation: enforce MVP matrix and phased release gates

## Suggested Acceptance Criteria for MVP

- User can authenticate, open a repo, edit a file, and commit/push from iPhone
- Agent workflow is stable for ask/edit/review/apply
- Unsupported desktop features are hidden or clearly unavailable
- No critical crashes during a defined beta soak period

## Open Decisions

- Primary iOS use case: review edits, author edits, or both?
- Required offline behavior (if any) for v1
- Required branch and PR workflows beyond commit/push
- Telemetry/analytics stack for mobile-specific reliability signals
