import { describe, it, expect } from 'vitest'
import {
  parseFrame,
  makeRequest,
  makeConnectRequest,
  computeUsageStats,
  gatewayUrlToWs,
  formatUptime,
  formatCost,
  formatTokens,
  formatSchedule,
} from '@/lib/gateway-protocol'

describe('parseFrame', () => {
  it('parses valid JSON into a GatewayFrame', () => {
    const frame = parseFrame('{"type":"ping"}')
    expect(frame).toEqual({ type: 'ping' })
  })

  it('parses a response frame', () => {
    const frame = parseFrame('{"type":"res","id":"1","ok":true,"payload":"hello"}')
    expect(frame).toEqual({ type: 'res', id: '1', ok: true, payload: 'hello' })
  })

  it('returns null for invalid JSON', () => {
    expect(parseFrame('not json')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseFrame('')).toBeNull()
  })
})

describe('makeRequest', () => {
  it('creates a request with method and params', () => {
    const req = makeRequest('chat.send', { text: 'hello' })
    expect(req.type).toBe('req')
    expect(req.method).toBe('chat.send')
    expect(req.params).toEqual({ text: 'hello' })
    expect(req.id).toBeTruthy()
  })

  it('defaults params to empty object', () => {
    const req = makeRequest('ping')
    expect(req.params).toEqual({})
  })
})

describe('makeConnectRequest', () => {
  it('creates a connect request with password and token', () => {
    const req = makeConnectRequest('secret123')
    expect(req.method).toBe('connect')
    const auth = (req.params as Record<string, unknown>).auth as Record<string, unknown>
    expect(auth.password).toBe('secret123')
    // Token is also sent so gateway auth.mode "token" works
    expect(auth.token).toBe('secret123')
  })

  it('prefers stored device token over password for token field', () => {
    const req = makeConnectRequest('pass', undefined, 'saved-token')
    const auth = (req.params as Record<string, unknown>).auth as Record<string, unknown>
    expect(auth.password).toBe('pass')
    expect(auth.token).toBe('saved-token')
  })
})

describe('computeUsageStats', () => {
  it('returns empty stats for null input', () => {
    const stats = computeUsageStats(null)
    expect(stats.totalCost).toBe(0)
    expect(stats.records).toHaveLength(0)
  })

  it('returns empty stats for non-object input', () => {
    const stats = computeUsageStats('invalid')
    expect(stats.totalCost).toBe(0)
  })

  it('computes totals from records array', () => {
    const stats = computeUsageStats({
      records: [
        { usage: { input: 100, output: 50, totalTokens: 150 }, cost: 0.01 },
        { usage: { input: 200, output: 100, totalTokens: 300 }, cost: 0.02 },
      ],
    })
    expect(stats.totalInputTokens).toBe(300)
    expect(stats.totalOutputTokens).toBe(150)
    expect(stats.sessionCount).toBe(2)
  })

  it('handles snake_case field names', () => {
    const stats = computeUsageStats({
      records: [{ usage: { input_tokens: 500, output_tokens: 250 } }],
    })
    expect(stats.totalInputTokens).toBe(500)
    expect(stats.totalOutputTokens).toBe(250)
  })

  it('computes cache hit rate', () => {
    const stats = computeUsageStats({
      totals: { input: 100, cacheRead: 400 },
      records: [],
    })
    expect(stats.cacheHitRate).toBe(0.8)
  })

  it('handles daily aggregates', () => {
    const stats = computeUsageStats({
      records: [],
      aggregates: {
        daily: [{ date: '2025-01-01', tokens: 1000, cost: 0.05 }],
      },
    })
    expect(stats.daily).toHaveLength(1)
    expect(stats.daily[0].date).toBe('2025-01-01')
  })
})

describe('gatewayUrlToWs', () => {
  it('converts https to wss', () => {
    expect(gatewayUrlToWs('https://example.com')).toBe('wss://example.com')
  })

  it('converts http to ws', () => {
    expect(gatewayUrlToWs('http://localhost:18789')).toBe('ws://localhost:18789')
  })

  it('strips trailing slashes', () => {
    expect(gatewayUrlToWs('https://example.com///')).toBe('wss://example.com')
  })

  it('adds wss:// for bare hostnames', () => {
    expect(gatewayUrlToWs('example.com')).toBe('wss://example.com')
  })

  it('preserves ws:// as-is', () => {
    expect(gatewayUrlToWs('ws://localhost:18789')).toBe('ws://localhost:18789')
  })
})

describe('formatUptime', () => {
  it('formats seconds', () => {
    expect(formatUptime(5000)).toBe('5s')
  })

  it('formats minutes and seconds', () => {
    expect(formatUptime(90000)).toBe('1m 30s')
  })

  it('formats hours and minutes', () => {
    expect(formatUptime(3660000)).toBe('1h 1m')
  })

  it('formats days, hours, and minutes', () => {
    expect(formatUptime(90000000)).toBe('1d 1h 0m')
  })
})

describe('formatCost', () => {
  it('formats small costs with 4 decimals', () => {
    expect(formatCost(0.0012)).toBe('$0.0012')
  })

  it('formats larger costs with 2 decimals', () => {
    expect(formatCost(1.5)).toBe('$1.50')
  })
})

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(1500000)).toBe('1.5M')
  })

  it('formats thousands', () => {
    expect(formatTokens(1500)).toBe('1.5K')
  })

  it('formats small numbers as-is', () => {
    expect(formatTokens(42)).toBe('42')
  })
})

describe('formatSchedule', () => {
  it('formats every-ms schedule', () => {
    expect(formatSchedule({ kind: 'every', everyMs: 3600000 })).toBe('Every 1h')
    expect(formatSchedule({ kind: 'every', everyMs: 60000 })).toBe('Every 1m')
    expect(formatSchedule({ kind: 'every', everyMs: 5000 })).toBe('Every 5s')
    expect(formatSchedule({ kind: 'every', everyMs: 86400000 })).toBe('Every 1d')
  })

  it('formats cron schedule', () => {
    expect(formatSchedule({ kind: 'cron', expr: '0 * * * *' })).toBe('0 * * * *')
    expect(formatSchedule({ kind: 'cron', expr: '0 9 * * 1', tz: 'US/Eastern' })).toBe(
      '0 9 * * 1 (US/Eastern)',
    )
  })
})
