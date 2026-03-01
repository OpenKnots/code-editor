/**
 * Custom Monaco theme that reads CSS custom properties from the current theme.
 * Supports both light and dark modes dynamically.
 */

import type { editor } from 'monaco-editor'

function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function expandShortHex(color: string): string {
  const trimmed = color.trim()
  if (!trimmed.startsWith('#')) return trimmed
  const hex = trimmed.slice(1)
  if (/^[0-9a-fA-F]{3}$/.test(hex) || /^[0-9a-fA-F]{4}$/.test(hex)) {
    return '#' + hex.split('').map((c) => c + c).join('')
  }
  return trimmed
}

function toMonacoTokenHex(color: string, fallback: string): string {
  const normalized = expandShortHex(color)
  const fallbackNormalized = fallback.replace('#', '')
  if (!normalized) return fallbackNormalized

  const hex = normalized.replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) return hex

  return fallbackNormalized
}

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}

export function registerEditorTheme(monaco: { editor: typeof editor }) {
  const dark = isDarkMode()
  const bg = expandShortHex(getCSSVar('--bg', dark ? '#0a0a0a' : '#fafafa'))
  const bgSubtle = expandShortHex(getCSSVar('--bg-subtle', dark ? '#141414' : '#f5f5f5'))
  const bgElevated = expandShortHex(getCSSVar('--bg-elevated', dark ? '#111111' : '#ffffff'))
  const border = expandShortHex(getCSSVar('--border', dark ? '#222222' : '#e5e5e5'))
  const fg = expandShortHex(getCSSVar('--text-primary', dark ? '#e5e5e5' : '#171717'))
  const fgSecondary = expandShortHex(getCSSVar('--text-secondary', dark ? '#999999' : '#525252'))
  const fgTertiary = expandShortHex(getCSSVar('--text-tertiary', dark ? '#666666' : '#a3a3a3'))
  const brand = expandShortHex(getCSSVar('--brand', '#ca3a29'))
  const additions = expandShortHex(getCSSVar('--color-additions', dark ? '#22c55e' : '#16a34a'))
  const deletions = expandShortHex(getCSSVar('--color-deletions', dark ? '#ef4444' : '#dc2626'))

  const lightTokens: editor.ITokenThemeRule[] = [
    { token: 'comment', foreground: toMonacoTokenHex(fgTertiary, 'a3a3a3'), fontStyle: 'italic' },
    { token: 'keyword', foreground: '7c3aed' },
    { token: 'keyword.control', foreground: '7c3aed' },
    { token: 'storage', foreground: '7c3aed' },
    { token: 'string', foreground: '16a34a' },
    { token: 'string.escape', foreground: '15803d' },
    { token: 'number', foreground: 'b45309' },
    { token: 'regexp', foreground: 'dc2626' },
    { token: 'type', foreground: '0891b2' },
    { token: 'type.identifier', foreground: '0891b2' },
    { token: 'class', foreground: '0891b2' },
    { token: 'interface', foreground: '0891b2' },
    { token: 'function', foreground: '2563eb' },
    { token: 'function.call', foreground: '2563eb' },
    { token: 'variable', foreground: toMonacoTokenHex(fg, '171717') },
    { token: 'variable.predefined', foreground: 'dc2626' },
    { token: 'constant', foreground: 'b45309' },
    { token: 'tag', foreground: 'dc2626' },
    { token: 'attribute.name', foreground: '7c3aed' },
    { token: 'attribute.value', foreground: '16a34a' },
    { token: 'delimiter', foreground: toMonacoTokenHex(fgSecondary, '525252') },
    { token: 'operator', foreground: toMonacoTokenHex(fgSecondary, '525252') },
  ]

  const darkTokens: editor.ITokenThemeRule[] = [
    { token: 'comment', foreground: toMonacoTokenHex(fgTertiary, '666666'), fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c084fc' },
    { token: 'keyword.control', foreground: 'c084fc' },
    { token: 'storage', foreground: 'c084fc' },
    { token: 'string', foreground: '86efac' },
    { token: 'string.escape', foreground: '6ee7b7' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'regexp', foreground: 'f87171' },
    { token: 'type', foreground: '67e8f9' },
    { token: 'type.identifier', foreground: '67e8f9' },
    { token: 'class', foreground: '67e8f9' },
    { token: 'interface', foreground: '67e8f9' },
    { token: 'function', foreground: '93c5fd' },
    { token: 'function.call', foreground: '93c5fd' },
    { token: 'variable', foreground: toMonacoTokenHex(fg, 'e5e5e5') },
    { token: 'variable.predefined', foreground: 'fca5a5' },
    { token: 'constant', foreground: 'fbbf24' },
    { token: 'tag', foreground: 'f87171' },
    { token: 'attribute.name', foreground: 'c084fc' },
    { token: 'attribute.value', foreground: '86efac' },
    { token: 'delimiter', foreground: toMonacoTokenHex(fgSecondary, '999999') },
    { token: 'operator', foreground: toMonacoTokenHex(fgSecondary, '999999') },
  ]

  monaco.editor.defineTheme('code-editor', {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: dark ? darkTokens : lightTokens,
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.lineHighlightBackground': bgSubtle,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': brand + '30',
      'editor.inactiveSelectionBackground': brand + '15',
      'editor.selectionHighlightBackground': brand + '15',
      'editor.findMatchBackground': brand + '40',
      'editor.findMatchHighlightBackground': brand + '20',
      'editorCursor.foreground': brand,
      'editorIndentGuide.background': border,
      'editorIndentGuide.activeBackground': fgTertiary,
      'editorLineNumber.foreground': fgTertiary,
      'editorLineNumber.activeForeground': fgSecondary,
      'editorBracketMatch.background': brand + '20',
      'editorBracketMatch.border': brand + '40',
      'editorGutter.background': bg,
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': bgElevated,
      'editorWidget.border': border,
      'editorSuggestWidget.background': bgElevated,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': brand + '20',
      'editorHoverWidget.background': bgElevated,
      'editorHoverWidget.border': border,
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': fgTertiary + '30',
      'scrollbarSlider.hoverBackground': fgTertiary + '50',
      'scrollbarSlider.activeBackground': fgTertiary + '70',
      'diffEditor.insertedTextBackground': additions + '15',
      'diffEditor.removedTextBackground': deletions + '15',
      'input.background': bgSubtle,
      'input.border': border,
      'input.foreground': fg,
      'focusBorder': brand,
      'list.activeSelectionBackground': brand + '20',
      'list.hoverBackground': bgSubtle,
    },
  })
}
