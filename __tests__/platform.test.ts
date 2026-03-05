import { describe, it, expect, beforeEach } from 'vitest'
import { getPlatform, resetPlatformCache, formatShortcut, formatShortcutKeys } from '@/lib/platform'

describe('platform', () => {
  beforeEach(() => {
    resetPlatformCache()
  })

  describe('getPlatform', () => {
    it('returns one of mac, windows, or linux', () => {
      const platform = getPlatform()
      expect(['mac', 'windows', 'linux']).toContain(platform)
    })
  })

  describe('formatShortcut', () => {
    it('formats meta+P with platform-appropriate modifier', () => {
      const result = formatShortcut('meta+P')
      const isMac = getPlatform() === 'mac'
      expect(result).toMatch(isMac ? /⌘.*P/ : /Ctrl\+P/)
    })

    it('formats meta+shift+P with shift modifier', () => {
      const result = formatShortcut('meta+shift+P')
      expect(result).toContain('P')
      expect(result.length).toBeGreaterThan(2)
    })

    it('formats single key combos as-is', () => {
      expect(formatShortcut('?')).toBe('?')
    })

    it('formats special keys like Enter', () => {
      const result = formatShortcut('meta+Enter')
      expect(result.length).toBeGreaterThan(2)
      expect(result).toMatch(/⌘|Ctrl/)
    })
  })

  describe('formatShortcutKeys', () => {
    it('returns non-empty array of key parts', () => {
      const keys = formatShortcutKeys('meta+P')
      expect(Array.isArray(keys)).toBe(true)
      expect(keys.length).toBeGreaterThanOrEqual(2)
      expect(keys).toContain('P')
    })
  })
})
