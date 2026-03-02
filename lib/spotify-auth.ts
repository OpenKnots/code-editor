import { isTauri } from '@/lib/tauri'

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''
const SCOPES = 'streaming user-read-playback-state user-modify-playback-state user-read-currently-playing'
const TOKEN_KEY = 'knot:spotify-token'
const REFRESH_KEY = 'knot:spotify-refresh'
const EXPIRY_KEY = 'knot:spotify-expiry'
const VERIFIER_KEY = 'knot:spotify-pkce-verifier'

export function spotifyAvailable(): boolean {
  return !!SPOTIFY_CLIENT_ID
}

export function getSpotifyToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const expiry = localStorage.getItem(EXPIRY_KEY)
    if (!token) return null
    if (expiry && Date.now() > Number(expiry) - 60_000) return null
    return token
  } catch { return null }
}

export function getSpotifyRefreshToken(): string | null {
  try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
}

export function isSpotifyAuthenticated(): boolean {
  return !!getSpotifyToken() || !!getSpotifyRefreshToken()
}

function saveTokens(access: string, refresh: string | null, expiresIn: number) {
  try {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
    window.dispatchEvent(new CustomEvent('spotify-auth-changed'))
  } catch {}
}

export function clearSpotifyAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(VERIFIER_KEY)
    window.dispatchEvent(new CustomEvent('spotify-auth-changed'))
  } catch {}
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return Array.from(array, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function getRedirectUri(): string {
  const origin = window.location.origin
  if (isTauri() || origin.startsWith('tauri://')) {
    return 'http://127.0.0.1:3000/'
  }
  if (origin.includes('localhost')) {
    return origin.replace('localhost', '127.0.0.1') + window.location.pathname
  }
  return origin + window.location.pathname
}

/**
 * Start Spotify PKCE login.
 *
 * In Tauri: opens the system browser for login. Spotify redirects back to
 * http://editor.openknot.ai/?code=..., which the dev server serves. That browser
 * tab exchanges the code (same localStorage), and we detect the token via
 * a storage event listener. The Tauri webview stays on the editor.
 *
 * In browser: navigates the current window to Spotify. On return,
 * handleSpotifyCallback() picks up the code.
 */
export async function startSpotifyLogin(): Promise<void> {
  if (!SPOTIFY_CLIENT_ID) throw new Error('Spotify Client ID not configured')

  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  localStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })

  const authUrl = `https://accounts.spotify.com/authorize?${params}`

  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(authUrl)
    } catch {
      window.open(authUrl, '_blank', 'noopener,noreferrer')
    }
  } else {
    window.location.href = authUrl
  }
}

/**
 * Check if the current URL contains a Spotify OAuth callback code.
 * If so, exchange it for tokens, clean up the URL, and show a success message
 * (when running in the browser tab that Spotify redirected to).
 */
export async function handleSpotifyCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  const verifier = localStorage.getItem(VERIFIER_KEY)

  if (!code && !error) return false
  if (!verifier) {
    cleanUrl()
    return false
  }

  if (error) {
    cleanUrl()
    localStorage.removeItem(VERIFIER_KEY)
    throw new Error(error === 'access_denied' ? 'Spotify access denied' : error)
  }

  try {
    await exchangeCode(code!, verifier)
    cleanUrl()
    return true
  } catch (err) {
    cleanUrl()
    localStorage.removeItem(VERIFIER_KEY)
    throw err
  }
}

function cleanUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('error')
  window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''))
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed: ${body}`)
  }

  const data = await res.json()
  saveTokens(data.access_token, data.refresh_token, data.expires_in)
  localStorage.removeItem(VERIFIER_KEY)
  return data.access_token
}

export async function refreshSpotifyToken(): Promise<string | null> {
  const refreshToken = getSpotifyRefreshToken()
  if (!refreshToken || !SPOTIFY_CLIENT_ID) return null

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!res.ok) {
      clearSpotifyAuth()
      return null
    }

    const data = await res.json()
    saveTokens(data.access_token, data.refresh_token ?? refreshToken, data.expires_in)
    return data.access_token
  } catch {
    return null
  }
}

export async function ensureSpotifyToken(): Promise<string | null> {
  const token = getSpotifyToken()
  if (token) return token
  return refreshSpotifyToken()
}

export async function spotifyFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  let token = await ensureSpotifyToken()
  if (!token) throw new Error('Not authenticated with Spotify')

  let res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  })

  if (res.status === 401) {
    token = await refreshSpotifyToken()
    if (!token) throw new Error('Spotify session expired')
    res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    })
  }

  return res
}
