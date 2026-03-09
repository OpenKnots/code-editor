# Development Guide

## Setup

```bash
# Clone
git clone https://github.com/OpenKnots/code-editor.git
cd code-editor

# Install dependencies
pnpm install

# Environment variables (create .env.local)
GITHUB_TOKEN=ghp_...              # GitHub Personal Access Token
WORKOS_CLIENT_ID=client_...       # WorkOS OAuth client
WORKOS_API_KEY=sk_...             # WorkOS API key
WORKOS_REDIRECT_URI=http://localhost:3080/callback
# Optional:
ALLOWED_USER_EMAIL=you@example.com
ALLOWED_IPS=*                     # * to disable restriction

# Start dev server
pnpm dev
```

## Scripts

| Script                 | Purpose                                |
| ---------------------- | -------------------------------------- |
| `pnpm dev`             | Next.js dev server (port 3080)         |
| `pnpm build`           | Production build (Vercel)              |
| `pnpm build --webpack` | Production build with webpack bundler  |
| `pnpm tauri:dev`       | Desktop dev (Next.js + native window)  |
| `pnpm tauri:build`     | Desktop production build (.app + .dmg) |

## Code Style

- **TypeScript strict** — no `any`, explicit return types where helpful
- **Tailwind v4** — CSS variables only, no `@apply`
- **pnpm only** — never `npm` or `yarn`
- **`@iconify/react`** — all icons via Iconify with Lucide set
- **`'use client'`** — first line in client components
- **ES2022 target** — named capture groups, top-level await ok

## Component Patterns

### New components

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Icon } from '@iconify/react'

interface MyComponentProps {
  value: string
  onChange: (value: string) => void
}

export function MyComponent({ value, onChange }: MyComponentProps) {
  // ...
}
```

### Using contexts

```typescript
const { repo, tree } = useRepo()
const { files, activeFile, openFile } = useEditor()
const { sendRequest, status } = useGateway()
```

### Inter-component communication

Components communicate via `CustomEvent` on `window`:

```typescript
// Dispatch
window.dispatchEvent(
  new CustomEvent('file-select', {
    detail: { path: 'src/app.tsx', sha: 'abc123' },
  }),
)

// Listen
useEffect(() => {
  const handler = (e: Event) => {
    const { path, sha } = (e as CustomEvent).detail
    // ...
  }
  window.addEventListener('file-select', handler)
  return () => window.removeEventListener('file-select', handler)
}, [])
```

Events in use:
| Event | Payload | Purpose |
|-------|---------|---------|
| `file-select` | `{ path, sha }` | Open a file in editor |
| `editor-navigate` | `{ startLine, endLine? }` | Scroll to line |
| `inline-edit-request` | `{ filePath, instruction, selectedText, startLine, endLine }` | Cmd/Ctrl+K edit |
| `quick-open-prefill` | `{ query }` | Prefill Cmd/Ctrl+P search |

## Adding a Theme

1. Add CSS variables in `app/globals.css`:

   ```css
   .dark[data-theme='my-theme'] {
     --bg: #0a0a0a;
     --brand: #ff6b6b;
     /* ... all variables ... */
   }
   ```

2. Add to `THEMES` array in `components/theme-switcher.tsx`:

   ```typescript
   { id: 'my-theme', label: 'My Theme', color: '#ff6b6b' },
   ```

3. Monaco theme auto-reads CSS variables — no extra configuration needed.

## Adding a Slash Command

1. Add to the `cmds` array in `components/agent-panel.tsx`:

   ```typescript
   { cmd: '/mycommand', desc: 'Description', icon: 'lucide:star' },
   ```

2. The command is passed to the agent as plain text. To add special handling, intercept in the `sendMessage` function before sending to gateway.

## Build Verification

Always verify builds pass before pushing:

```bash
pnpm build --webpack
```

Check for:

- TypeScript errors
- Missing imports
- CSS syntax errors (Tailwind)
