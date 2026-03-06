'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useGateway } from '@/context/gateway-context'
import { setGithubToken } from '@/lib/github-api'
import { isTauri, tauriInvoke } from '@/lib/tauri'

const LEGACY_STORAGE_KEY = 'code-editor:github-token'
const STORAGE_SOURCE_KEY = 'code-editor:github-token-source'
const KEYCHAIN_SERVICE = 'OpenKnots.KnotCode'
const KEYCHAIN_ACCOUNT = 'github-token'

/** Decodes the legacy localStorage token format to allow one-time migration. */
function decodeLegacyToken(encoded: string): string {
  try {
    const decoded = atob(encoded)
    return decoded
      .split('')
      .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (42 + (i % 7))))
      .join('')
  } catch {
    return ''
  }
}

type TokenSource = 'gateway' | 'manual' | 'none'

interface GitHubAuthContextValue {
  /** The resolved GitHub token (from gateway or user input) */
  token: string
  /** Where the token came from */
  source: TokenSource
  /** Whether we're still resolving the token */
  loading: boolean
  /** Manually set a token (stored in keychain on desktop, memory on web) */
  setManualToken: (token: string) => void
  /** Clear the manual token */
  clearToken: () => void
  /** Whether the user has a valid token */
  authenticated: boolean
}

const GitHubAuthContext = createContext<GitHubAuthContextValue | null>(null)

export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const { sendRequest, status: gwStatus } = useGateway()
  const [token, setToken] = useState('')
  const [source, setSource] = useState<TokenSource>('none')
  const [loading, setLoading] = useState(true)

  const persistToken = useCallback(async (t: string, src: TokenSource) => {
    if (isTauri()) {
      try {
        await tauriInvoke('local_secret_set', {
          service: KEYCHAIN_SERVICE,
          account: KEYCHAIN_ACCOUNT,
          secret: t,
        })
      } catch {
        // Keep token in-memory even if keychain write fails.
      }
      localStorage.setItem(STORAGE_SOURCE_KEY, src)
    }

    setToken(t)
    setSource(src)
    setGithubToken(t)
  }, [])

  // Resolve token from secure storage (desktop) or one-time legacy migration.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isTauri()) {
        try {
          const secureToken = await tauriInvoke<string | null>('local_secret_get', {
            service: KEYCHAIN_SERVICE,
            account: KEYCHAIN_ACCOUNT,
          })
          if (cancelled) return
          if (secureToken) {
            setToken(secureToken)
            setSource('manual')
            setGithubToken(secureToken)
            setLoading(false)
            return
          }
        } catch {
          // Continue to migration fallback.
        }
      }

      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        const migrated = decodeLegacyToken(legacy)
        if (migrated) {
          await persistToken(migrated, 'manual')
        }
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      }

      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [persistToken])

  // Try to resolve token from gateway on connect (highest priority source).
  useEffect(() => {
    if (gwStatus !== 'connected') return

    let cancelled = false
    ;(async () => {
      try {
        const result = (await sendRequest('env.get', { key: 'GITHUB_TOKEN' })) as {
          value?: string
        } | null
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

      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [gwStatus, sendRequest])

  const setManualToken = useCallback(
    (t: string) => {
      const trimmed = t.trim()
      if (!trimmed) return
      void persistToken(trimmed, 'manual')
    },
    [persistToken],
  )

  const clearToken = useCallback(() => {
    void (async () => {
      if (isTauri()) {
        try {
          await tauriInvoke('local_secret_delete', {
            service: KEYCHAIN_SERVICE,
            account: KEYCHAIN_ACCOUNT,
          })
        } catch {
          // Clearing in-memory state still logs out the current session.
        }
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      localStorage.removeItem(STORAGE_SOURCE_KEY)
      setToken('')
      setSource('none')
      setGithubToken('')
    })()
  }, [])

  const authenticated = !!token

  const value = useMemo<GitHubAuthContextValue>(
    () => ({
      token,
      source,
      loading,
      setManualToken,
      clearToken,
      authenticated,
    }),
    [token, source, loading, setManualToken, clearToken, authenticated],
  )

  return <GitHubAuthContext.Provider value={value}>{children}</GitHubAuthContext.Provider>
}

export function useGitHubAuth() {
  const ctx = useContext(GitHubAuthContext)
  if (!ctx) throw new Error('useGitHubAuth must be used within GitHubAuthProvider')
  return ctx
}
