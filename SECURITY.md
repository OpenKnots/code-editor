# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KnotCode, please report it responsibly.

**Do not open a public issue.**

Instead, DM [**@BunsDev**](https://x.com/BunsDev) or use [GitHub's private vulnerability reporting](https://github.com/OpenKnots/code-editor/security/advisories/new).

<!-- Instead, email **security@openknot.ai** or use [GitHub's private vulnerability reporting](https://github.com/OpenKnots/code-editor/security/advisories/new). -->

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## Scope

This policy covers:

- The KnotCode web application and Tauri desktop app
- Gateway protocol handling (WebSocket communication)
- Authentication flows (GitHub OAuth device flow, Spotify PKCE)
- Local file system access (Tauri only)

## Out of Scope

- The OpenClaw gateway itself (report to [openclaw/openclaw](https://github.com/openclaw/openclaw))
- Third-party dependencies (report upstream, but let us know if it affects KnotCode)

## Security Design

- **No server-side secrets**: KnotCode is a static app. OAuth flows use public client IDs only (device flow / PKCE).
- **Gateway communication**: All AI requests route through the user's own OpenClaw gateway. No data is sent to OpenKnot servers.
- **Local mode**: Desktop (Tauri) file access is scoped to the user-selected project directory.
- **No telemetry**: KnotCode does not collect usage data or analytics.
