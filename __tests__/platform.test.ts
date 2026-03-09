import { describe, expect, it } from 'vitest'
import { formatShortcut, formatShortcutKeys } from '@/lib/platform'

describe('shortcut labels', () => {
  it('renders generic modifiers for display text', () => {
    expect(formatShortcut('meta+shift+p')).toBe('Cmd/Ctrl+Shift+P')
  })

  it('renders generic modifier keys for kbd chips', () => {
    expect(formatShortcutKeys('meta+alt+1')).toEqual(['Cmd/Ctrl', 'Alt/Option', '1'])
  })

  it('handles special keys', () => {
    expect(formatShortcut('meta+enter')).toBe('Cmd/Ctrl+Enter')
    expect(formatShortcut('escape')).toBe('Esc')
  })
})
