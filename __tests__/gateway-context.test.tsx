import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayProvider, useGateway } from '@/context/gateway-context'

const {
  mockGetOrCreateDeviceIdentity,
  mockBuildDeviceAuthPayload,
  mockSignPayload,
  mockLoadDeviceToken,
  mockStoreDeviceToken,
} = vi.hoisted(() => ({
  mockGetOrCreateDeviceIdentity: vi.fn(),
  mockBuildDeviceAuthPayload: vi.fn(),
  mockSignPayload: vi.fn(),
  mockLoadDeviceToken: vi.fn(),
  mockStoreDeviceToken: vi.fn(),
}))

vi.mock('@/lib/device-auth', () => ({
  getOrCreateDeviceIdentity: mockGetOrCreateDeviceIdentity,
  buildDeviceAuthPayload: mockBuildDeviceAuthPayload,
  signPayload: mockSignPayload,
  loadDeviceToken: mockLoadDeviceToken,
  storeDeviceToken: mockStoreDeviceToken,
}))

vi.mock('@/lib/tauri', () => ({
  isTauri: () => false,
  tauriInvoke: vi.fn(),
}))

vi.mock('@/lib/skill-first-policy', () => ({
  buildSkillFirstBlockMessage: vi.fn(() => 'blocked'),
  evaluateSkillFirstPolicy: vi.fn(() => ({ blocked: false })),
  updateSkillProbeFromMessage: vi.fn(),
}))

class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: MockWebSocket[] = []
  static sentFrames: Array<Record<string, unknown>> = []

  url: string
  readyState = MockWebSocket.OPEN
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    MockWebSocket.sentFrames.push(JSON.parse(data) as Record<string, unknown>)
  }

  close() {
    this.readyState = 3
  }
}

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useGateway>) => void }) {
  const api = useGateway()
  React.useEffect(() => {
    onReady(api)
  }, [api, onReady])
  return null
}

describe('GatewayProvider connect.challenge auth paths', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockWebSocket.sentFrames = []
    localStorage.clear()

    vi.clearAllMocks()
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    mockGetOrCreateDeviceIdentity.mockResolvedValue({
      deviceId: 'dev-1',
      publicKeyBase64Url: 'pub-key',
      privateKey: 'priv-key',
    })
    mockBuildDeviceAuthPayload.mockReturnValue('payload-to-sign')
    mockSignPayload.mockResolvedValue('sig-123')
  })

  it('without stored token sends connect request without device block', async () => {
    mockLoadDeviceToken.mockReturnValue(null)

    let api: ReturnType<typeof useGateway> | null = null
    render(
      <GatewayProvider>
        <Harness onReady={(ctx) => (api = ctx)} />
      </GatewayProvider>,
    )

    await waitFor(() => expect(api).not.toBeNull())

    act(() => {
      api!.connect('ws://localhost:18789', 'gateway-secret')
    })

    const ws = MockWebSocket.instances.at(-1)
    expect(ws).toBeTruthy()

    act(() => {
      ws!.onmessage?.({
        data: JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n1' } }),
      } as MessageEvent)
    })

    await waitFor(() => {
      expect(MockWebSocket.sentFrames.length).toBeGreaterThan(0)
    })

    const req = MockWebSocket.sentFrames[0]
    expect(req.method).toBe('connect')
    const params = req.params as Record<string, unknown>
    const auth = params.auth as Record<string, unknown>

    expect(auth.password).toBe('gateway-secret')
    expect(auth.token).toBe('gateway-secret')
    expect(params.device).toBeUndefined()

    expect(mockBuildDeviceAuthPayload).not.toHaveBeenCalled()
    expect(mockSignPayload).not.toHaveBeenCalled()
  })

  it('with stored token sends signed device block and token-preferred auth', async () => {
    mockLoadDeviceToken.mockReturnValue('stored-device-token')

    let api: ReturnType<typeof useGateway> | null = null
    render(
      <GatewayProvider>
        <Harness onReady={(ctx) => (api = ctx)} />
      </GatewayProvider>,
    )

    await waitFor(() => expect(api).not.toBeNull())

    act(() => {
      api!.connect('ws://localhost:18789', 'gateway-secret')
    })

    const ws = MockWebSocket.instances.at(-1)
    expect(ws).toBeTruthy()

    act(() => {
      ws!.onmessage?.({
        data: JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n2' } }),
      } as MessageEvent)
    })

    await waitFor(() => {
      expect(MockWebSocket.sentFrames.length).toBeGreaterThan(0)
    })

    const req = MockWebSocket.sentFrames[0]
    expect(req.method).toBe('connect')
    const params = req.params as Record<string, unknown>
    const auth = params.auth as Record<string, unknown>
    const device = params.device as Record<string, unknown>

    expect(auth.password).toBe('gateway-secret')
    expect(auth.token).toBe('stored-device-token')

    expect(device.id).toBe('dev-1')
    expect(device.publicKey).toBe('pub-key')
    expect(device.signature).toBe('sig-123')
    expect(device.nonce).toBe('n2')
    expect(typeof device.signedAt).toBe('number')

    expect(mockBuildDeviceAuthPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'dev-1',
        token: 'stored-device-token',
        nonce: 'n2',
      }),
    )
    expect(mockSignPayload).toHaveBeenCalledWith('priv-key', 'payload-to-sign')
  })
})
