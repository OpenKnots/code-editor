'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { isTauri, tauriInvoke } from '@/lib/tauri'
import {
  type GatewayResponse,
  type GatewaySnapshot,
  gatewayUrlToWs,
  makeConnectRequest,
  makeRequest,
  parseFrame,
} from '@/lib/gateway-protocol'
import {
  type DeviceIdentity,
  getOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signPayload,
  loadDeviceToken,
  storeDeviceToken,
} from '@/lib/device-auth'
import {
  buildSkillFirstBlockMessage,
  evaluateSkillFirstPolicy,
  updateSkillProbeFromMessage,
} from '@/lib/skill-first-policy'

// ─── Connection state machine ────────────────────────────────────────────────
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error'

interface PendingRequest {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EventCallback = (payload: unknown) => void

interface GatewayContextValue {
  status: ConnectionStatus
  snapshot: GatewaySnapshot | null
  error: string | null
  connect: (url: string, password: string) => void
  disconnect: () => void
  reconnect: () => void
  sendRequest: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  onEvent: (event: string, cb: EventCallback) => () => void
  gatewayUrl: string | null
  grantedScopes: string[]
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

// ─── Storage keys ────────────────────────────────────────────────────────────
const STORAGE_URL = 'code-flow:gateway-url'
const STORAGE_PASS = 'code-flow:gateway-pass'
const STORAGE_REMEMBER = 'code-flow:remember'

// ─── Provider ────────────────────────────────────────────────────────────────
export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null)
  const [grantedScopes, setGrantedScopes] = useState<string[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map())
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const credentialsRef = useRef<{ url: string; password: string } | null>(null)
  const intentionalDisconnectRef = useRef(false)
  const deviceIdentityRef = useRef<DeviceIdentity | null>(null)
  const connectedRef = useRef(false)

  // Clean up WebSocket
  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
    for (const [, pending] of pendingRef.current) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection closed'))
    }
    pendingRef.current.clear()
  }, [])

  // Core connect logic
  const doConnect = useCallback(
    (url: string, password: string) => {
      cleanup()
      intentionalDisconnectRef.current = false
      setError(null)
      setStatus('connecting')

      const wsUrl = gatewayUrlToWs(url)
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl)
      } catch (e) {
        setError(`Invalid gateway URL: ${e instanceof Error ? e.message : String(e)}`)
        setStatus('error')
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        // Wait for connect.challenge event from gateway
      }

      ws.onmessage = (ev) => {
        const frame = parseFrame(ev.data)
        if (!frame) return

        // Handle ping
        if (frame.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }

        // Handle events (including connect challenge)
        if (frame.type === 'event') {
          const evt = frame as { event: string; payload?: unknown }

          if (evt.event === 'connect.challenge') {
            setStatus('authenticating')
            ;(async () => {
              try {
                const nonce = (evt.payload as Record<string, unknown>)?.nonce as string | undefined
                const identity = await getOrCreateDeviceIdentity()
                deviceIdentityRef.current = identity

                const role = 'operator'
                const scopes = ['operator.read', 'operator.write', 'operator.admin']
                const signedAt = Date.now()
                const existingToken = loadDeviceToken(identity.deviceId, role)

                // When we have a stored device token from a prior successful pairing,
                // send full device identity with cryptographic signature.
                // On first connect (no stored token), skip device auth entirely and
                // rely on token/password-only auth. This avoids the signature mismatch
                // where the client signs with an empty token field but the server
                // reconstructs the payload using auth.token (the gateway token).
                // After a successful token-only connect, the gateway issues a
                // deviceToken that gets stored for subsequent connections.
                let connectReq: ReturnType<typeof makeConnectRequest>
                if (existingToken) {
                  const authPayload = buildDeviceAuthPayload({
                    deviceId: identity.deviceId,
                    clientId: 'gateway-client',
                    clientMode: 'ui',
                    role,
                    scopes,
                    signedAtMs: signedAt,
                    token: existingToken,
                    nonce,
                  })
                  const signature = await signPayload(identity.privateKey, authPayload)

                  connectReq = makeConnectRequest(
                    password,
                    {
                      id: identity.deviceId,
                      publicKey: identity.publicKeyBase64Url,
                      signature,
                      signedAt,
                      ...(nonce ? { nonce } : {}),
                    },
                    existingToken,
                  )
                } else {
                  // First connection: token-only, no device block
                  connectReq = makeConnectRequest(password)
                }

                ws.send(JSON.stringify(connectReq))

                const timer = setTimeout(() => {
                  pendingRef.current.delete(connectReq.id)
                  setError('Connection timed out')
                  setStatus('error')
                }, 15000)
                pendingRef.current.set(connectReq.id, {
                  resolve: () => {},
                  reject: () => {},
                  timer,
                })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Device auth failed')
                setStatus('error')
              }
            })()
            return
          }

          // Broadcast to event listeners
          const cbs = listenersRef.current.get(evt.event)
          if (cbs) {
            for (const cb of cbs) {
              try {
                cb(evt.payload)
              } catch {}
            }
          }
          return
        }

        // Handle response
        if (frame.type === 'res') {
          const res = frame as GatewayResponse
          const payload = res.payload as Record<string, unknown> | undefined

          // Check if this is hello-ok (successful connect)
          if (payload?.type === 'hello-ok') {
            const pending = pendingRef.current.get(res.id)
            if (pending) {
              clearTimeout(pending.timer)
              pendingRef.current.delete(res.id)
            }
            const snap = (payload.snapshot as GatewaySnapshot) ?? {}
            snap.protocol = payload.protocol as number
            setSnapshot(snap)

            const authInfo = payload.auth as
              | { deviceToken?: string; role?: string; scopes?: string[] }
              | undefined
            const scopes =
              authInfo?.scopes ??
              (Array.isArray(payload.scopes) ? (payload.scopes as string[]) : []) ??
              (Array.isArray(payload.grantedScopes) ? (payload.grantedScopes as string[]) : [])
            setGrantedScopes(scopes)

            if (authInfo?.deviceToken && deviceIdentityRef.current) {
              storeDeviceToken(
                deviceIdentityRef.current.deviceId,
                authInfo.role ?? 'operator',
                authInfo.deviceToken,
                authInfo.scopes ?? [],
              )
            }

            connectedRef.current = true
            setStatus('connected')
            reconnectAttemptRef.current = 0
            // Save credentials
            try {
              const shouldRemember = localStorage.getItem(STORAGE_REMEMBER) !== 'false'
              if (shouldRemember) {
                localStorage.setItem(STORAGE_URL, url)
                localStorage.setItem(STORAGE_PASS, password)
              }
            } catch {}
            return
          }

          // Check for auth failure
          if (!res.ok) {
            const pending = pendingRef.current.get(res.id)
            if (pending) {
              clearTimeout(pending.timer)
              pendingRef.current.delete(res.id)
              pending.reject(
                new Error(
                  (res.error as { message?: string } | undefined)?.message ?? 'Request failed',
                ),
              )
            }
            if (!connectedRef.current) {
              setError(
                (res.error as { message?: string } | undefined)?.message ?? 'Authentication failed',
              )
              setStatus('error')
            }
            return
          }

          // Regular response — resolve pending
          const pending = pendingRef.current.get(res.id)
          if (pending) {
            clearTimeout(pending.timer)
            pendingRef.current.delete(res.id)
            pending.resolve(res.payload)
          }
          return
        }
      }

      ws.onerror = () => {
        // Browser logs ERR_CONNECTION_REFUSED natively; onclose handles state
      }

      ws.onclose = (ev: CloseEvent) => {
        const wasConnected = connectedRef.current
        wsRef.current = null

        for (const [, pending] of pendingRef.current) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Connection closed'))
        }
        pendingRef.current.clear()

        if (intentionalDisconnectRef.current) {
          setStatus('disconnected')
          return
        }

        if (!wasConnected) {
          setStatus((prev) => (prev === 'error' ? prev : 'error'))
          setError((prev) => {
            if (prev) return prev
            if (ev.reason) return ev.reason
            return 'Failed to connect to the gateway. Check the URL and ensure it is running.'
          })
          return
        }

        // Auto-reconnect with exponential backoff
        setStatus('disconnected')
        if (credentialsRef.current) {
          const attempt = ++reconnectAttemptRef.current
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
          reconnectTimerRef.current = setTimeout(() => {
            if (credentialsRef.current) {
              doConnect(credentialsRef.current.url, credentialsRef.current.password)
            }
          }, delay)
        }
      }
    },
    [cleanup],
  )

  // Public connect
  const connect = useCallback(
    (url: string, password: string) => {
      credentialsRef.current = { url, password }
      setGatewayUrl(url)
      reconnectAttemptRef.current = 0
      connectedRef.current = false
      doConnect(url, password)
    },
    [doConnect],
  )

  // Public disconnect
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    credentialsRef.current = null
    connectedRef.current = false
    setGatewayUrl(null)
    cleanup()
    setStatus('disconnected')
    setSnapshot(null)
    setError(null)
    setGrantedScopes([])
    try {
      localStorage.removeItem(STORAGE_URL)
      localStorage.removeItem(STORAGE_PASS)
    } catch {}
  }, [cleanup])

  // Reconnect using stored or in-memory credentials
  const reconnect = useCallback(() => {
    const creds = credentialsRef.current
    if (creds) {
      cleanup()
      reconnectAttemptRef.current = 0
      doConnect(creds.url, creds.password)
      return
    }
    try {
      const url = localStorage.getItem(STORAGE_URL)
      const pass = localStorage.getItem(STORAGE_PASS)
      if (url && pass) {
        credentialsRef.current = { url, password: pass }
        setGatewayUrl(url)
        cleanup()
        doConnect(url, pass)
      }
    } catch {}
  }, [cleanup, doConnect])

  // Send RPC request
  const sendRequest = useCallback(
    (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error('Not connected'))
          return
        }

        if (method === 'chat.send' && typeof params?.message === 'string') {
          const sessionKey =
            (typeof params.sessionKey === 'string' && params.sessionKey) ||
            (typeof params.session_key === 'string' && params.session_key) ||
            'main'
          const message = params.message
          updateSkillProbeFromMessage(sessionKey, message)
          const policy = evaluateSkillFirstPolicy({
            sessionKey,
            message,
            mode: 'hard_with_override',
          })
          if (policy.blocked) {
            reject(new Error(buildSkillFirstBlockMessage(policy)))
            return
          }
        }

        const req = makeRequest(method, params)
        // Chat requests can take minutes (agent runs); use longer timeout
        const timeoutMs = method === 'chat.send' ? 300000 : 30000
        const timer = setTimeout(() => {
          pendingRef.current.delete(req.id)
          reject(new Error(`Request '${method}' timed out`))
        }, timeoutMs)
        pendingRef.current.set(req.id, { resolve, reject, timer })
        wsRef.current.send(JSON.stringify(req))
      })
    },
    [],
  )

  // Subscribe to events
  const onEvent = useCallback((event: string, cb: EventCallback): (() => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set())
    }
    listenersRef.current.get(event)!.add(cb)
    return () => {
      listenersRef.current.get(event)?.delete(cb)
    }
  }, [])

  // Auto-connect on mount: stored creds → Tauri gateway config → nothing
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      // 1. Try stored credentials first (fastest, user already connected before)
      try {
        const url = localStorage.getItem(STORAGE_URL)
        const pass = localStorage.getItem(STORAGE_PASS)
        if (url && pass) {
          credentialsRef.current = { url, password: pass }
          setGatewayUrl(url)
          doConnect(url, pass)
          return
        }
      } catch {}

      // 2. On desktop (Tauri), read gateway config directly from ~/.openclaw/openclaw.json
      if (isTauri()) {
        try {
          const config = await tauriInvoke<{ url: string; password: string }>(
            'engine_gateway_config',
            {},
          )
          if (cancelled || !config) return

          // Verify the gateway is actually running before connecting
          const status = await tauriInvoke<{ running: boolean }>('engine_status', {})
          if (cancelled) return

          if (status?.running && config.url && config.password) {
            credentialsRef.current = { url: config.url, password: config.password }
            setGatewayUrl(config.url)
            // Save to localStorage so future reconnects are instant
            localStorage.setItem(STORAGE_URL, config.url)
            localStorage.setItem(STORAGE_PASS, config.password)
            doConnect(config.url, config.password)
            return
          }
        } catch {
          // Config not found or parse error — fall through to localhost discovery
        }
      }

      // 3. Auto-discover local gateway at default port (no password)
      if (cancelled) return
      try {
        const localUrl = 'ws://localhost:18789'
        const probe = await fetch('http://localhost:18789/health', {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null)
        if (cancelled) return
        if (probe && probe.ok) {
          credentialsRef.current = { url: localUrl, password: '' }
          setGatewayUrl(localUrl)
          localStorage.setItem(STORAGE_URL, localUrl)
          localStorage.setItem(STORAGE_PASS, '')
          doConnect(localUrl, '')
        }
      } catch {
        // No local gateway found — user will see the connect prompt
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<GatewayContextValue>(
    () => ({
      status,
      snapshot,
      error,
      connect,
      disconnect,
      reconnect,
      sendRequest,
      onEvent,
      gatewayUrl,
      grantedScopes,
    }),
    [
      status,
      snapshot,
      error,
      connect,
      disconnect,
      reconnect,
      sendRequest,
      onEvent,
      gatewayUrl,
      grantedScopes,
    ],
  )

  return <GatewayContext.Provider value={value}>{children}</GatewayContext.Provider>
}

export function useGateway() {
  const ctx = useContext(GatewayContext)
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider')
  return ctx
}
