const MODIFIER_LABELS = {
  meta: 'Cmd/Ctrl',
  shift: 'Shift',
  alt: 'Alt/Option',
} as const

const MODIFIERS = new Set<keyof typeof MODIFIER_LABELS>(['meta', 'shift', 'alt'])

export function formatShortcut(combo: string): string {
  return formatShortcutKeys(combo).join('+')
}

export function formatShortcutKeys(combo: string): string[] {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return [combo]

  const key = parts.find((part) => !MODIFIERS.has(part as keyof typeof MODIFIER_LABELS))
  if (!key && parts.length === 1) return [formatKey(parts[0]!)]

  const out: string[] = []
  if (parts.includes('meta')) out.push(MODIFIER_LABELS.meta)
  if (parts.includes('shift')) out.push(MODIFIER_LABELS.shift)
  if (parts.includes('alt')) out.push(MODIFIER_LABELS.alt)
  if (key) out.push(formatKey(key))

  return out.length > 0 ? out : [combo]
}

function formatKey(key: string): string {
  const special: Record<string, string> = {
    '`': '`',
    '\\': '\\',
    enter: 'Enter',
    escape: 'Esc',
    ' ': 'Space',
    '-': '-',
    '=': '+',
    '?': '?',
  }

  return special[key] ?? key.toUpperCase()
}
