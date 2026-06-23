# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KnotCode, please report it responsibly.

**Do not open a public issue.**

Instead, DM [**@BunsDev**](https://x.com/BunsDev) or use [GitHub's private vulnerability reporting](https://github.com/OpenKnots/code-editor/security/advisories/new).

We will acknowledge your report within 48 hours and aim to release a fix within 7 days for critical issues.

## Supported Versions

KnotCode ships as a continuously-updated static app, so security fixes land in
the latest release. Please make sure you're on the most recent version before
reporting an issue, and upgrade to pick up any fix.

## Scope

This policy covers:

- The KnotCode web application and Tauri desktop app
- Gateway protocol handling (WebSocket communication)
- Authentication flows (GitHub tokens, Spotify PKCE)
- Local file system access (Tauri only)

## Out of Scope

- The OpenClaw gateway itself (report to [openclaw/openclaw](https://github.com/openclaw/openclaw))
- Third-party dependencies (report upstream, but let us know if it affects KnotCode)

## Security Design

- **No server-side secrets**: KnotCode is a static app. Any client-side OAuth uses public client IDs only.
- **Gateway communication**: All AI requests route through the user's own OpenClaw gateway. No data is sent to OpenKnot servers.
- **Local mode**: Desktop (Tauri) file access is scoped to the user-selected project directory.
- **No telemetry**: KnotCode does not collect usage data or analytics.
