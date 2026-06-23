# Security Runbook

> **Reporting a vulnerability?** See [`../SECURITY.md`](../SECURITY.md) for the disclosure policy and contact info.

This document defines how KnotCode handles secrets, responds to leaks, and manages git author privacy.

## Secret Handling Policy

- Git history and staged changes are scanned with `gitleaks`.
- CI runs a full-history scan against `.gitleaks.baseline.json`.
- Local hooks scan staged changes on commit and full history on push.
- Desktop stores GitHub tokens in the OS keychain.
- Web keeps GitHub tokens in memory only (no localStorage persistence).

## Secret Scan Commands

```bash
pnpm secrets:scan          # full git history
pnpm secrets:scan:staged   # currently staged diff
pnpm secrets:baseline      # refresh baseline intentionally
```

## Credential Leak Incident Response

Use this sequence whenever a token/secret is suspected to be exposed.

1. **Contain immediately**
   - Revoke or disable the credential at the provider.
   - Pause affected automation/workflows if needed.
2. **Assess scope**
   - Identify where the secret appeared (commit, PR, logs, screenshots).
   - Determine whether the repository/branch was public or shared.
3. **Remove and replace**
   - Remove secret material from code/config.
   - Replace with `process.env.*` (or platform secret store).
   - Issue a new credential with least-privilege scopes.
4. **Clean history (if required)**
   - If policy/compliance requires it, rewrite history and coordinate force-push.
   - Rotate credentials before/while rewriting; do not rely on rewrite alone.
5. **Verify and close**
   - Re-run `pnpm secrets:scan`.
   - Confirm old credentials are invalid.
   - Document timeline, impact, and prevention follow-ups.

## Git Author Privacy Decision

Project decision:

- Preserve existing commit history as-is by default.
- Do not rewrite published history solely for email privacy unless explicitly required.

Going forward:

- Prefer GitHub noreply email for new commits.
- Recommended format: `<id+username@users.noreply.github.com>`.

If anonymization becomes required:

- Coordinate with maintainers first (history rewrite impacts all contributors).
- Use `git filter-repo` on a maintenance branch and rotate refs carefully.
- Force-push only after team approval and communication.
