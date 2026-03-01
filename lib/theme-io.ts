/**
 * Theme IO — import/export parser + serializer for tweakcn-compatible CSS and JSON.
 *
 * Supports:
 *  - Importing CSS blocks containing `:root { ... }` and `.dark { ... }` variable declarations
 *  - Importing/exporting JSON with `modes.light`, `modes.dark`, and optional `extensions`
 *  - Round-trip fidelity: import tweakcn CSS/JSON → app theme → export tweakcn CSS/JSON
 */

// ── Core shadcn/tweakcn token names ──────────────────────────────────────────

export const CORE_TOKENS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'radius',
  'sidebar', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
] as const

export const APP_TOKENS = [
  'bg', 'bg-elevated', 'bg-subtle', 'bg-secondary', 'bg-tertiary',
  'brand', 'brand-hover', 'brand-muted',
  'text-primary', 'text-secondary', 'text-tertiary', 'text-disabled',
  'border', 'border-hover', 'border-focus',
  'success', 'warning', 'error', 'info',
  'glass-bg', 'glass-bg-hover', 'glass-bg-elevated',
  'glass-border', 'glass-border-hover', 'glass-shadow',
  'brand-glow', 'brand-glow-subtle', 'brand-deep', 'brand-chat', 'brand-contrast',
  'shadow-sm', 'shadow-md', 'shadow-lg',
  'scrollbar-thumb', 'scrollbar-thumb-hover',
  'header-glass-bg', 'shimmer-from', 'shimmer-via',
  'overlay', 'logo-filter',
  'kn-claw', 'vscode-text', 'vscode-subtle', 'vscode-muted',
  'radius-sm', 'radius-md', 'radius-lg',
] as const

export type TokenMap = Record<string, string>

export interface ThemeJSON {
  name?: string
  modes: {
    light: TokenMap
    dark: TokenMap
  }
  extensions?: {
    app?: {
      light?: TokenMap
      dark?: TokenMap
    }
  }
}

// ── CSS Parsing ──────────────────────────────────────────────────────────────

function parseVarBlock(css: string): TokenMap {
  const tokens: TokenMap = {}
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    tokens[m[1]] = m[2]
  }
  return tokens
}

function extractBlock(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped + '\\s*\\{([^}]*)\\}', 's')
  const m = re.exec(css)
  return m ? m[1] : null
}

export function parseCSS(css: string): { light: TokenMap; dark: TokenMap } {
  const light: TokenMap = {}
  const dark: TokenMap = {}

  const rootBlock = extractBlock(css, ':root')
  if (rootBlock) Object.assign(light, parseVarBlock(rootBlock))

  const darkBlock = extractBlock(css, '.dark')
  if (darkBlock) Object.assign(dark, parseVarBlock(darkBlock))

  // If only :root was provided, use as both light and dark baseline
  if (Object.keys(dark).length === 0 && Object.keys(light).length > 0) {
    Object.assign(dark, light)
  }

  return { light, dark }
}

// ── CSS Serialization ────────────────────────────────────────────────────────

function serializeVarBlock(tokens: TokenMap, indent: string = '  '): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${indent}--${k}: ${v};`)
    .join('\n')
}

export function serializeCSS(light: TokenMap, dark: TokenMap): string {
  const sections: string[] = []

  if (Object.keys(light).length > 0) {
    sections.push(`:root {\n${serializeVarBlock(light)}\n}`)
  }
  if (Object.keys(dark).length > 0) {
    sections.push(`.dark {\n${serializeVarBlock(dark)}\n}`)
  }

  return sections.join('\n\n') + '\n'
}

// ── JSON Parsing ─────────────────────────────────────────────────────────────

export function parseJSON(input: string): ThemeJSON {
  const raw = JSON.parse(input)

  if (!raw.modes || typeof raw.modes !== 'object') {
    throw new Error('Invalid theme JSON: missing "modes" object')
  }

  const light = raw.modes.light ?? {}
  const dark = raw.modes.dark ?? {}

  if (typeof light !== 'object' || typeof dark !== 'object') {
    throw new Error('Invalid theme JSON: modes.light and modes.dark must be objects')
  }

  return {
    name: raw.name,
    modes: { light, dark },
    extensions: raw.extensions,
  }
}

// ── JSON Serialization ──────────────────────────────────────────────────────

export function serializeJSON(name: string, light: TokenMap, dark: TokenMap, appLight?: TokenMap, appDark?: TokenMap): string {
  const result: ThemeJSON = {
    name,
    modes: { light, dark },
  }

  if ((appLight && Object.keys(appLight).length > 0) || (appDark && Object.keys(appDark).length > 0)) {
    result.extensions = {
      app: {
        ...(appLight && Object.keys(appLight).length > 0 ? { light: appLight } : {}),
        ...(appDark && Object.keys(appDark).length > 0 ? { dark: appDark } : {}),
      },
    }
  }

  return JSON.stringify(result, null, 2) + '\n'
}

// ── Live DOM helpers ─────────────────────────────────────────────────────────

export function readCurrentTokens(tokenNames: readonly string[]): TokenMap {
  const s = getComputedStyle(document.documentElement)
  const tokens: TokenMap = {}
  for (const name of tokenNames) {
    const val = s.getPropertyValue(`--${name}`).trim()
    if (val) tokens[name] = val
  }
  return tokens
}

export function applyTokensToDOM(tokens: TokenMap) {
  const el = document.documentElement
  for (const [k, v] of Object.entries(tokens)) {
    el.style.setProperty(`--${k}`, v)
  }
}

export function clearInlineTokens(tokens: TokenMap) {
  const el = document.documentElement
  for (const k of Object.keys(tokens)) {
    el.style.removeProperty(`--${k}`)
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_CORE = ['background', 'foreground', 'primary', 'border'] as const

export function validateCoreTokens(tokens: TokenMap): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_CORE.filter(t => !(t in tokens))
  return { valid: missing.length === 0, missing }
}

// ── Auto-detect format ───────────────────────────────────────────────────────

export function detectFormat(input: string): 'css' | 'json' | 'unknown' {
  const trimmed = input.trim()
  if (trimmed.startsWith('{')) return 'json'
  if (trimmed.includes(':root') || trimmed.includes('.dark') || /--[\w-]+\s*:/.test(trimmed)) return 'css'
  return 'unknown'
}

export function parseAuto(input: string): { light: TokenMap; dark: TokenMap; name?: string } {
  const format = detectFormat(input)
  if (format === 'json') {
    const parsed = parseJSON(input)
    return { light: parsed.modes.light, dark: parsed.modes.dark, name: parsed.name }
  }
  if (format === 'css') {
    return parseCSS(input)
  }
  throw new Error('Unable to detect theme format. Provide CSS (:root { ... } .dark { ... }) or JSON ({ modes: { light: {...}, dark: {...} } }).')
}

// ── Custom theme storage ─────────────────────────────────────────────────────

const CUSTOM_THEMES_KEY = 'code-editor:custom-themes'

export interface StoredCustomTheme {
  id: string
  name: string
  light: TokenMap
  dark: TokenMap
  appLight?: TokenMap
  appDark?: TokenMap
}

export function loadCustomThemes(): StoredCustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredCustomTheme[]
  } catch {
    return []
  }
}

export function saveCustomThemes(themes: StoredCustomTheme[]) {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes))
  } catch {}
}

export function addCustomTheme(theme: StoredCustomTheme) {
  const existing = loadCustomThemes()
  const updated = existing.filter(t => t.id !== theme.id)
  updated.push(theme)
  saveCustomThemes(updated)
}

export function removeCustomTheme(id: string) {
  const existing = loadCustomThemes()
  saveCustomThemes(existing.filter(t => t.id !== id))
}
