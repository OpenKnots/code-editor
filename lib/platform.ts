/**
 * Platform detection and shortcut labeling for cross-platform UI.
 * Uses navigator.userAgent (works in browser and Tauri WebView).
 */

export type Platform = 'mac' | 'windows' | 'linux'

let _platform: Platform | null = null

/** Reset cached platform (for testing). */
export function resetPlatformCache(): void {
  _platform = null
}

/** Detect current OS. Cached for consistency. */
export function getPlatform(): Platform {
  if (_platform) return _platform
  if (typeof navigator === 'undefined') return 'windows' // SSR fallback
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) _platform = 'windows'
  else if (ua.includes('mac')) _platform = 'mac'
  else _platform = 'linux'
  return _platform
}

export function isMac(): boolean {
  return getPlatform() === 'mac'
}

export function isWindows(): boolean {
  return getPlatform() === 'windows'
}

export function isLinux(): boolean {
  return getPlatform() === 'linux'
}

/** Modifier symbols for macOS (glyphs) vs Windows/Linux (text) */
const MAC = { meta: '⌘', shift: '⇧', alt: '⌥' } as const
const WIN = { meta: 'Ctrl', shift: 'Shift', alt: 'Alt' } as const

/**
 * Format an abstract shortcut combo for display.
 * Combos use: meta+, shift+, alt+, and the key (e.g. P, 1, `, Enter).
 * Examples: 'meta+P', 'meta+shift+P', 'meta+alt+1', 'meta+`' , '?'
 */
export function formatShortcut(combo: string): string {
  const mac = isMac()
  const mods = mac ? MAC : WIN

  const parts = combo.toLowerCase().split('+').filter(Boolean)
  if (parts.length === 0) return combo
  if (parts.length === 1 && !['meta', 'shift', 'alt'].includes(parts[0]!)) {
    return formatKey(parts[0]!, mac)
  }

  const key = parts.filter((p) => !['meta', 'shift', 'alt'].includes(p))[0]
  const hasMeta = parts.includes('meta')
  const hasShift = parts.includes('shift')
  const hasAlt = parts.includes('alt')

  const out: string[] = []
  if (hasMeta) out.push(mods.meta)
  if (hasShift) out.push(mods.shift)
  if (hasAlt) out.push(mods.alt)
  if (key) out.push(formatKey(key, mac))

  return mac ? out.join('') : out.join('+')
}

/** Format a single key for display (e.g. backtick, enter). */
function formatKey(key: string, mac: boolean): string {
  const special: Record<string, string> = {
    '`': '`',
    '\\': '\\',
    enter: '⏎',
    escape: 'Esc',
    ' ': 'Space',
    '-': '−',
    '=': '+',
  }
  return special[key] ?? key.toUpperCase()
}

/**
 * Format a shortcut as an array of key parts for rendering in <kbd> elements.
 * e.g. formatShortcutKeys('meta+P') -> ['⌘', 'P'] on Mac, ['Ctrl', 'P'] on Windows
 */
export function formatShortcutKeys(combo: string): string[] {
  const mac = isMac()
  const mods = mac ? MAC : WIN

  const parts = combo.toLowerCase().split('+').filter(Boolean)
  if (parts.length === 0) return [combo]
  if (parts.length === 1 && !['meta', 'shift', 'alt'].includes(parts[0]!)) {
    return [formatKey(parts[0]!, mac)]
  }

  const key = parts.filter((p) => !['meta', 'shift', 'alt'].includes(p))[0]
  const hasMeta = parts.includes('meta')
  const hasShift = parts.includes('shift')
  const hasAlt = parts.includes('alt')

  const out: string[] = []
  if (hasMeta) out.push(mods.meta)
  if (hasShift) out.push(mods.shift)
  if (hasAlt) out.push(mods.alt)
  if (key) out.push(formatKey(key, mac))

  return out
}
