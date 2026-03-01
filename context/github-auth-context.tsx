'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useGateway } from '@/context/gateway-context'
import { setGithubToken } from '@/lib/github-client'

const STORAGE_KEY = 'code-editor:github-token'
const STORAGE_SOURCE_KEY = 'code-editor:github-token-source'
const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? ''

/** Simple obfuscation — not true encryption, but prevents plaintext in localStorage.
 *  On Tauri desktop, use the OS keychain instead (future enhancement). */
function obfuscate(text: string): string {
  return btoa(text.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (42 + (i % 7)))).join(''))
}

function deobfuscate(encoded: string): string {
  try {
    const decoded = atob(encoded)
    return decoded.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (42 + (i % 7)))).join('')
  } catch { return '' }
}

export type OAuthStep =
  | { type: 'idle' }
  | { type: 'device-pending'; userCode: string; verificationUri: string; deviceCode: string; interval: number }
  | { type: 'error'; message: string }

type TokenSource = 'gateway' | 'manual' | 'oauth' | 'none'

interface GitHubAuthContextValue {
  /** The resolved GitHub token (from gateway, user input, or OAuth) */
  token: string
  /** Where the token came from */
  source: TokenSource
  /** Whether we're still resolving the token */
  loading: boolean
  /** Manually set a token (saved to local storage) */
  setManualToken: (token: string) => void
  /** Clear the manual token */
  clearToken: () => void
  /** Whether the user has a valid token */
  authenticated: boolean
  /** Whether the GitHub OAuth Client ID is configured */
  oauthAvailable: boolean
  /** Current state of the OAuth device flow */
  oauthStep: OAuthStep
  /** Start the OAuth device flow */
  startOAuth: () => void
  /** Cancel an in-progress OAuth flow */
  cancelOAuth: () => void
}

const GitHubAuthContext = createContext<GitHubAuthContextValue | null>(null)

export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const { sendRequest, status: gwStatus } = useGateway()
  const [token, setToken] = useState('')
  const [source, setSource] = useState<TokenSource>('none')
  const [loading, setLoading] = useState(true)
  const [oauthStep, setOAuthStep] = useState<OAuthStep>({ type: 'idle' })
  const oauthCancelled = useRef(false)

  // Try to resolve token from gateway on connect
  useEffect(() => {
    if (gwStatus !== 'connected') return

    let cancelled = false
    ;(async () => {
      try {
        const result = await sendRequest('env.get', { key: 'GITHUB_TOKEN' }) as { value?: string } | null
        if (cancelled) return

        if (result?.value) {
          setToken(result.value)
          setSource('gateway')
          setGithubToken(result.value)
          setLoading(false)
          return
        }
      } catch {
        // Gateway doesn't support env.get — that's fine
      }

      // Fallback: check localStorage for a saved token
      if (!cancelled) {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const t = deobfuscate(stored)
          if (t) {
            const savedSource = (localStorage.getItem(STORAGE_SOURCE_KEY) as TokenSource) || 'manual'
            setToken(t)
            setSource(savedSource === 'oauth' ? 'oauth' : 'manual')
            setGithubToken(t)
          }
        }
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [gwStatus, sendRequest])

  // Also check localStorage on mount (before gateway connects)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const t = deobfuscate(stored)
      if (t) {
        const savedSource = (localStorage.getItem(STORAGE_SOURCE_KEY) as TokenSource) || 'manual'
        setToken(t)
        setSource(savedSource === 'oauth' ? 'oauth' : 'manual')
        setGithubToken(t)
      }
    }
    // Give gateway a chance to override, then stop loading
    const timer = setTimeout(() => setLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  const saveToken = useCallback((t: string, src: TokenSource) => {
    localStorage.setItem(STORAGE_KEY, obfuscate(t))
    localStorage.setItem(STORAGE_SOURCE_KEY, src)
    setToken(t)
    setSource(src)
    setGithubToken(t)
  }, [])

  const setManualToken = useCallback((t: string) => {
    const trimmed = t.trim()
    if (!trimmed) return
    saveToken(trimmed, 'manual')
  }, [saveToken])

  const clearToken = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_SOURCE_KEY)
    setToken('')
    setSource('none')
    setGithubToken('')
  }, [])

  // ── OAuth Device Flow ──────────────────────────────────────────

  const startOAuth = useCallback(async () => {
    if (!GITHUB_CLIENT_ID) {
      setOAuthStep({ type: 'error', message: 'OAuth client ID not configured.' })
      return
    }

    oauthCancelled.current = false

    try {
      const res = await fetch('/api/github/device-code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo read:user' }),
      })
      const data = (await res.json()) as {
        device_code: string
        user_code: string
        verification_uri: string
        interval: number
      }
      setOAuthStep({
        type: 'device-pending',
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        deviceCode: data.device_code,
        interval: data.interval ?? 5,
      })
    } catch {
      setOAuthStep({ type: 'error', message: 'Failed to start GitHub authentication.' })
    }
  }, [])

  const cancelOAuth = useCallback(() => {
    oauthCancelled.current = true
    setOAuthStep({ type: 'idle' })
  }, [])

  // Poll for token once user has authorised the device
  useEffect(() => {
    if (oauthStep.type !== 'device-pending') return

    const { deviceCode, interval } = oauthStep
    oauthCancelled.current = false

    const poll = async () => {
      while (!oauthCancelled.current) {
        await new Promise(r => setTimeout(r, interval * 1000))
        if (oauthCancelled.current) break

        try {
          const res = await fetch('/api/github/access-token', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: GITHUB_CLIENT_ID,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          })
          const data = (await res.json()) as { access_token?: string; error?: string }

          if (data.access_token) {
            saveToken(data.access_token, 'oauth')
            setOAuthStep({ type: 'idle' })
            break
          }
          if (data.error === 'access_denied' || data.error === 'expired_token') {
            setOAuthStep({ type: 'error', message: 'Authorisation was denied or timed out.' })
            break
          }
          // 'authorization_pending' or 'slow_down' — keep polling
        } catch {
          // network hiccup — keep polling
        }
      }
    }

    poll()
    return () => { oauthCancelled.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthStep.type === 'device-pending' ? oauthStep.deviceCode : null, saveToken])

  return (
    <GitHubAuthContext.Provider value={{
      token,
      source,
      loading,
      setManualToken,
      clearToken,
      authenticated: !!token,
      oauthAvailable: !!GITHUB_CLIENT_ID,
      oauthStep,
      startOAuth,
      cancelOAuth,
    }}>
      {children}
    </GitHubAuthContext.Provider>
  )
}

export function useGitHubAuth() {
  const ctx = useContext(GitHubAuthContext)
  if (!ctx) throw new Error('useGitHubAuth must be used within GitHubAuthProvider')
  return ctx
}
