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

  // Theme-aware syntax tokens (fallbacks are high-contrast defaults)
  const synComment = expandShortHex(getCSSVar('--syntax-comment', fgTertiary))
  const synKeyword = expandShortHex(getCSSVar('--syntax-keyword', dark ? '#c084fc' : '#7c3aed'))
  const synString = expandShortHex(getCSSVar('--syntax-string', dark ? '#86efac' : '#16a34a'))
  const synStringEscape = expandShortHex(getCSSVar('--syntax-string-escape', dark ? '#6ee7b7' : '#15803d'))
  const synNumber = expandShortHex(getCSSVar('--syntax-number', dark ? '#fbbf24' : '#b45309'))
  const synRegexp = expandShortHex(getCSSVar('--syntax-regexp', dark ? '#f87171' : '#dc2626'))
  const synType = expandShortHex(getCSSVar('--syntax-type', dark ? '#67e8f9' : '#0891b2'))
  const synFunction = expandShortHex(getCSSVar('--syntax-function', dark ? '#93c5fd' : '#2563eb'))
  const synVariable = expandShortHex(getCSSVar('--syntax-variable', fg))
  const synVariablePredef = expandShortHex(getCSSVar('--syntax-variable-predefined', dark ? '#fca5a5' : '#dc2626'))
  const synConstant = expandShortHex(getCSSVar('--syntax-constant', dark ? '#fbbf24' : '#b45309'))
  const synTag = expandShortHex(getCSSVar('--syntax-tag', dark ? '#f87171' : '#dc2626'))
  const synAttrName = expandShortHex(getCSSVar('--syntax-attribute-name', synKeyword))
  const synAttrValue = expandShortHex(getCSSVar('--syntax-attribute-value', synString))
  const synDelimiter = expandShortHex(getCSSVar('--syntax-delimiter', fgSecondary))
  const synOperator = expandShortHex(getCSSVar('--syntax-operator', fgSecondary))

  const lightTokens: editor.ITokenThemeRule[] = [
    { token: 'comment', foreground: toMonacoTokenHex(synComment, 'a3a3a3'), fontStyle: 'italic' },
    { token: 'keyword', foreground: toMonacoTokenHex(synKeyword, '7c3aed') },
    { token: 'keyword.control', foreground: toMonacoTokenHex(synKeyword, '7c3aed') },
    { token: 'storage', foreground: toMonacoTokenHex(synKeyword, '7c3aed') },
    { token: 'string', foreground: toMonacoTokenHex(synString, '16a34a') },
    { token: 'string.escape', foreground: toMonacoTokenHex(synStringEscape, '15803d') },
    { token: 'number', foreground: toMonacoTokenHex(synNumber, 'b45309') },
    { token: 'regexp', foreground: toMonacoTokenHex(synRegexp, 'dc2626') },
    { token: 'type', foreground: toMonacoTokenHex(synType, '0891b2') },
    { token: 'type.identifier', foreground: toMonacoTokenHex(synType, '0891b2') },
    { token: 'class', foreground: toMonacoTokenHex(synType, '0891b2') },
    { token: 'interface', foreground: toMonacoTokenHex(synType, '0891b2') },
    { token: 'function', foreground: toMonacoTokenHex(synFunction, '2563eb') },
    { token: 'function.call', foreground: toMonacoTokenHex(synFunction, '2563eb') },
    { token: 'variable', foreground: toMonacoTokenHex(synVariable, '171717') },
    { token: 'variable.predefined', foreground: toMonacoTokenHex(synVariablePredef, 'dc2626') },
    { token: 'constant', foreground: toMonacoTokenHex(synConstant, 'b45309') },
    { token: 'tag', foreground: toMonacoTokenHex(synTag, 'dc2626') },
    { token: 'attribute.name', foreground: toMonacoTokenHex(synAttrName, '7c3aed') },
    { token: 'attribute.value', foreground: toMonacoTokenHex(synAttrValue, '16a34a') },
    { token: 'delimiter', foreground: toMonacoTokenHex(synDelimiter, '525252') },
    { token: 'operator', foreground: toMonacoTokenHex(synOperator, '525252') },
  ]

  const darkTokens: editor.ITokenThemeRule[] = [
    { token: 'comment', foreground: toMonacoTokenHex(synComment, '666666'), fontStyle: 'italic' },
    { token: 'keyword', foreground: toMonacoTokenHex(synKeyword, 'c084fc') },
    { token: 'keyword.control', foreground: toMonacoTokenHex(synKeyword, 'c084fc') },
    { token: 'storage', foreground: toMonacoTokenHex(synKeyword, 'c084fc') },
    { token: 'string', foreground: toMonacoTokenHex(synString, '86efac') },
    { token: 'string.escape', foreground: toMonacoTokenHex(synStringEscape, '6ee7b7') },
    { token: 'number', foreground: toMonacoTokenHex(synNumber, 'fbbf24') },
    { token: 'regexp', foreground: toMonacoTokenHex(synRegexp, 'f87171') },
    { token: 'type', foreground: toMonacoTokenHex(synType, '67e8f9') },
    { token: 'type.identifier', foreground: toMonacoTokenHex(synType, '67e8f9') },
    { token: 'class', foreground: toMonacoTokenHex(synType, '67e8f9') },
    { token: 'interface', foreground: toMonacoTokenHex(synType, '67e8f9') },
    { token: 'function', foreground: toMonacoTokenHex(synFunction, '93c5fd') },
    { token: 'function.call', foreground: toMonacoTokenHex(synFunction, '93c5fd') },
    { token: 'variable', foreground: toMonacoTokenHex(synVariable, 'e5e5e5') },
    { token: 'variable.predefined', foreground: toMonacoTokenHex(synVariablePredef, 'fca5a5') },
    { token: 'constant', foreground: toMonacoTokenHex(synConstant, 'fbbf24') },
    { token: 'tag', foreground: toMonacoTokenHex(synTag, 'f87171') },
    { token: 'attribute.name', foreground: toMonacoTokenHex(synAttrName, 'c084fc') },
    { token: 'attribute.value', foreground: toMonacoTokenHex(synAttrValue, '86efac') },
    { token: 'delimiter', foreground: toMonacoTokenHex(synDelimiter, '999999') },
    { token: 'operator', foreground: toMonacoTokenHex(synOperator, '999999') },
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
