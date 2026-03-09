# Troubleshooting

## Build Issues

### `pnpm build` fails with webpack errors

**Symptom:** Build fails with various webpack-related errors.

**Fix:** Always use the webpack flag:

```bash
pnpm build --webpack
```

The default Turbopack bundler can crash with port binding errors. Webpack is the stable path.

---

### `Module not found: Can't resolve 'X'`

**Symptom:** Missing dependency during build.

**Fix:** Install the missing package:

```bash
pnpm add <package-name>
```

Common ones that may need manual installation:

- `@workos-inc/authkit-nextjs`
- `create-markdown`
- `tw-animate-css`
- `dompurify`

---

### TypeScript errors in Monaco-related code

**Symptom:** `Property 'typescriptDefaults' does not exist` or similar.

**Context:** Monaco's TypeScript types are deprecated in newer versions.

**Fix:** Use `beforeMount` callback with optional chaining:

```typescript
const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
  })
}
```

---

### `Named capturing groups are only available when targeting 'ES2018' or later`

**Symptom:** Build fails on regex with `(?<name>...)` syntax.

**Fix:** Ensure `tsconfig.json` has `"target": "ES2022"` or later.

---

## Tauri / Desktop Issues

### `failed to run 'cargo metadata' command: No such file or directory`

**Symptom:** `pnpm tauri:dev` or `pnpm tauri:build` fails because `cargo` is not found.

**Cause:** Rust/Cargo is not in PATH for the shell Tauri spawns.

**Fix:**

1. Ensure Rust is installed:

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
   ```

2. Add to your shell profile (`~/.zshrc` for macOS):

   ```bash
   echo '. "$HOME/.cargo/env"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Verify:

   ```bash
   cargo --version   # should print cargo 1.x.x
   rustc --version   # should print rustc 1.x.x
   ```

4. **Restart your terminal** (or source the profile) before running Tauri commands.

---

### First Tauri build takes very long

**Expected behavior.** The first build compiles all Rust dependencies (~300 crates). This takes 2-5 minutes on M-series Macs, longer on older hardware.

Subsequent builds only recompile changed code and are much faster (<30 seconds).

---

### Tauri build fails with Xcode errors

**Symptom:** Compilation errors mentioning Xcode, SDK, or system frameworks.

**Fix:** Ensure Xcode Command Line Tools are installed:

```bash
xcode-select --install
```

If already installed, try resetting:

```bash
sudo xcode-select --reset
```

---

### Tauri app opens but shows blank white screen

**Possible causes:**

1. **Dev server not running:** `pnpm tauri:dev` should start Next.js dev server automatically. Check that port 3080 is free:

   ```bash
   lsof -i :3080
   ```

2. **CSP blocking:** Check the browser console (right-click → Inspect in the Tauri window). If CSP errors, check `src-tauri/tauri.conf.json` has `"csp": null`.

3. **Static export issues:** For production builds, ensure `next.config.ts` has the Tauri conditional:
   ```typescript
   const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined
   const nextConfig = { ...(isTauri ? { output: 'export' } : {}) }
   ```

---

## Gateway Connection Issues

### "origin not allowed" error at login

**Symptom:** Login form shows "origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)".

**Cause:** The code-editor's origin is not in the gateway's allowed origins list.

**Fix:** Add the origin to `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": [
        "http://localhost:3080",
        "http://127.0.0.1:3080",
        "https://editor.openknot.ai"
      ]
    }
  }
}
```

Then restart the gateway:

```bash
openclaw gateway restart
```

---

### Agent not responding / no replies

**Symptom:** Messages send but no reply appears. Spinner stays forever.

**Possible causes:**

1. **Gateway not running:**

   ```bash
   openclaw gateway status
   # If stopped:
   openclaw gateway start
   ```

2. **Session not initialized:** The system prompt may not have been injected. Clear `sessionStorage` in browser DevTools and reload.

3. **Streaming event handler:** The agent panel relies on `onEvent('chat')` to receive replies. Check the browser console for WebSocket errors.

4. **Model quota exceeded:** If using a rate-limited model, the gateway may silently fail. Check gateway logs:
   ```bash
   openclaw logs
   ```

---

### "Device not approved" / pairing error

**Symptom:** Login shows pairing instructions.

**Fix:** On the gateway host machine:

```bash
openclaw devices list        # find the pending request
openclaw devices approve <request-id>
```

Then click Connect again in the editor.

---

## Monaco Editor Issues

### Red squiggly lines on all imports

**Symptom:** Every `import` statement has red underlines.

**Cause:** Monaco tries to type-check TypeScript/JavaScript files but has no `tsconfig` or type definitions.

**Fix:** This is already handled — `beforeMount` disables semantic validation. If you still see red lines:

1. Hard refresh the page (Cmd/Ctrl+Shift+R)
2. Check that the `handleBeforeMount` callback is being called

---

### Editor shows wrong theme / generic dark theme

**Symptom:** Editor doesn't match the selected theme.

**Cause:** `registerEditorTheme()` reads CSS variables at mount time. If the theme changes after mount, the editor won't update.

**Workaround:** Refresh the page after switching themes. The theme will be applied on next mount from the persisted localStorage value.

---

### Monaco takes long to load / blank editor

**Symptom:** Editor area is blank for several seconds on first load.

**Expected behavior.** Monaco loads ~2MB of JavaScript on first render. The `monacoReady` state shows a blank area until loaded.

**Optimization:** Monaco chunks are cached by the browser after first load.

---

## File Tree Issues

### Tree doesn't show files / empty explorer

**Possible causes:**

1. **No repo selected:** Enter a repo in the selector (e.g., `OpenKnots/code-editor`).

2. **No GitHub token:** The tree API requires a GitHub token. Set `GITHUB_TOKEN` in your environment (or Vercel env vars for production).

3. **API response format:** The tree API returns `{ entries }`. If the context reads `data.tree` instead, files won't appear. This was fixed — ensure you're on the latest commit.

4. **Private repo:** Ensure the GitHub token has access to the repository.

---

### File content shows as gibberish

**Cause:** Binary files (images, compiled assets) are base64-decoded as text.

**Fix:** The editor detects binary file types and shows appropriate previews (image, video, audio). If a file type isn't detected, it falls back to text rendering.

---

## Authentication Issues

### WorkOS redirect loop

**Symptom:** Page keeps redirecting to WorkOS login and back.

**Fix:** Check that `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_REDIRECT_URI` are set correctly in environment variables.

For local development, the redirect URI should be `http://localhost:3080/callback`.

---

### "Access Denied" after login

**Symptom:** Successfully logged in via WorkOS but see "Access Denied".

**Cause:** `ALLOWED_USER_EMAIL` or `ALLOWED_USER_ID` is set and your account doesn't match.

**Fix:** Either:

- Update the env var to match your email/user ID
- Remove the env var to allow all authenticated users

---

## Performance Issues

### Page feels sluggish with large repos

**Cause:** Large repos (10,000+ files) create a heavy tree in memory.

**Workarounds:**

- Use the search to filter before browsing
- Tree rendering uses virtual-ish approach (dirs collapse by default)
- Consider filtering tree API response server-side for very large repos

---

### Agent responses are slow

**Possible causes:**

1. **Model choice:** Larger models (Opus) take longer than smaller ones (Haiku)
2. **Context size:** Files >8KB are truncated in context injection to prevent overload
3. **Gateway load:** Multiple sessions competing for the same gateway

---

## Common Environment Variables

| Variable              | Purpose              | Required            |
| --------------------- | -------------------- | ------------------- |
| `GITHUB_TOKEN`        | GitHub API access    | Yes                 |
| `WORKOS_CLIENT_ID`    | WorkOS OAuth         | Yes (web)           |
| `WORKOS_API_KEY`      | WorkOS server auth   | Yes (web)           |
| `WORKOS_REDIRECT_URI` | OAuth callback URL   | Yes (web)           |
| `ALLOWED_USER_EMAIL`  | Restrict to one user | No                  |
| `ALLOWED_USER_ID`     | Restrict to one user | No                  |
| `ALLOWED_IPS`         | IP allowlist (CIDR)  | No (`*` = disabled) |
