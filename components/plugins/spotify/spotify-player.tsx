'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import {
  spotifyAvailable,
  isSpotifyAuthenticated,
  ensureSpotifyToken,
  spotifyFetch,
  startSpotifyLogin,
  clearSpotifyAuth,
  handleSpotifyCallback,
} from '@/lib/spotify-auth'

declare global {
  interface Window {
    Spotify: typeof Spotify
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

declare namespace Spotify {
  interface PlayerOptions {
    name: string
    getOAuthToken: (cb: (token: string) => void) => void
    volume?: number
  }

  interface PlayerState {
    paused: boolean
    position: number
    duration: number
    shuffle: boolean
    repeat_mode: number
    track_window: {
      current_track: Track
      previous_tracks: Track[]
      next_tracks: Track[]
    }
  }

  interface Track {
    id: string | null
    uri: string
    name: string
    artists: { name: string; uri: string }[]
    album: { name: string; uri: string; images: { url: string }[] }
    duration_ms: number
  }

  class Player {
    constructor(options: PlayerOptions)
    connect(): Promise<boolean>
    disconnect(): void
    togglePlay(): Promise<void>
    pause(): Promise<void>
    resume(): Promise<void>
    seek(positionMs: number): Promise<void>
    previousTrack(): Promise<void>
    nextTrack(): Promise<void>
    setVolume(volume: number): Promise<void>
    getVolume(): Promise<number>
    getCurrentState(): Promise<PlayerState | null>
    activateElement(): Promise<void>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addListener(event: string, cb: (...args: any[]) => void): void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener(event: string, cb?: (...args: any[]) => void): void
  }
}

interface SearchResult {
  type: 'track' | 'album' | 'playlist' | 'artist'
  id: string
  uri: string
  name: string
  subtitle: string
  imageUrl?: string
}

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SpotifyPlayer() {
  const [authenticated, setAuthenticated] = useState(false)
  const [visible, setVisible] = useState(true)
  const [collapsed, setCollapsed] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // SDK state
  const [sdkReady, setSdkReady] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<Spotify.PlayerState | null>(null)
  const [localPosition, setLocalPosition] = useState(0)

  const playerRef = useRef<Spotify.Player | null>(null)
  const positionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStateTime = useRef(0)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Handle OAuth callback on page load + check auth state
  useEffect(() => {
    handleSpotifyCallback()
      .then(didAuth => { if (didAuth) setCollapsed(false) })
      .catch(err => setError(err instanceof Error ? err.message : 'Auth failed'))
      .finally(() => setAuthenticated(isSpotifyAuthenticated()))

    const handler = () => setAuthenticated(isSpotifyAuthenticated())
    window.addEventListener('spotify-auth-changed', handler)

    // In Tauri, the login happens in the system browser which shares localStorage
    // via the same http://localhost:3000 origin. Detect cross-tab token writes.
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'knot:spotify-token' && e.newValue) {
        setAuthenticated(true)
        setCollapsed(false)
      }
    }
    window.addEventListener('storage', storageHandler)

    return () => {
      window.removeEventListener('spotify-auth-changed', handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])

  // Load Spotify SDK script
  useEffect(() => {
    if (!authenticated) return
    if (document.querySelector(`script[src="${SDK_URL}"]`)) {
      if (window.Spotify) setSdkReady(true)
      return
    }

    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true)
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    document.body.appendChild(script)
  }, [authenticated])

  // Initialize player when SDK is ready
  useEffect(() => {
    if (!sdkReady || !authenticated) return

    const player = new window.Spotify.Player({
      name: 'Knot Code',
      getOAuthToken: async (cb) => {
        const token = await ensureSpotifyToken()
        if (token) cb(token)
      },
      volume: 0.5,
    })

    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      setDeviceId(device_id)
      setError(null)
      // Transfer playback to this device
      spotifyFetch('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [device_id], play: false }),
      }).catch(() => {})
    })

    player.addListener('not_ready', () => setDeviceId(null))

    player.addListener('player_state_changed', (state: Spotify.PlayerState) => {
      setPlayerState(state ?? null)
      if (state) {
        setLocalPosition(state.position)
        lastStateTime.current = Date.now()
      }
      window.dispatchEvent(new CustomEvent('spotify-state-changed', { detail: state }))
    })

    player.addListener('authentication_error', ({ message }: { message: string }) => {
      setError(`Auth error: ${message}`)
    })

    player.addListener('account_error', () => {
      setError('Spotify Premium is required for playback')
    })

    player.addListener('initialization_error', ({ message }: { message: string }) => {
      setError(`Init error: ${message}`)
    })

    player.connect()
    playerRef.current = player

    return () => {
      player.disconnect()
      playerRef.current = null
      setDeviceId(null)
      setPlayerState(null)
    }
  }, [sdkReady, authenticated])

  // Smooth local position tracking
  useEffect(() => {
    if (positionTimer.current) clearInterval(positionTimer.current)
    if (playerState && !playerState.paused) {
      positionTimer.current = setInterval(() => {
        setLocalPosition(playerState.position + (Date.now() - lastStateTime.current))
      }, 250)
    }
    return () => { if (positionTimer.current) clearInterval(positionTimer.current) }
  }, [playerState?.paused, playerState?.position])

  // Ctrl+Shift+M visibility toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    setError(null)
    try {
      await startSpotifyLogin()
      // Page will redirect — loggingIn state won't matter after navigation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoggingIn(false)
    }
  }, [])

  const handleLogout = useCallback(() => {
    playerRef.current?.disconnect()
    clearSpotifyAuth()
    setPlayerState(null)
    setDeviceId(null)
  }, [])

  const togglePlay = useCallback(() => playerRef.current?.togglePlay(), [])
  const skipNext = useCallback(() => playerRef.current?.nextTrack(), [])
  const skipPrev = useCallback(() => playerRef.current?.previousTrack(), [])

  const seekTo = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerState) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const ms = Math.round(pct * playerState.duration)
    playerRef.current?.seek(ms)
    setLocalPosition(ms)
    lastStateTime.current = Date.now()
  }, [playerState])

  // Search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const params = new URLSearchParams({ q, type: 'track,album,playlist,artist', limit: '8' })
      const res = await spotifyFetch(`/search?${params}`)
      if (!res.ok) { setResults([]); return }
      const data = await res.json()
      const items: SearchResult[] = []
      for (const t of data.tracks?.items ?? []) {
        items.push({ type: 'track', id: t.id, uri: t.uri, name: t.name, subtitle: t.artists?.map((a: { name: string }) => a.name).join(', '), imageUrl: t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url })
      }
      for (const a of data.albums?.items ?? []) {
        items.push({ type: 'album', id: a.id, uri: a.uri, name: a.name, subtitle: a.artists?.map((x: { name: string }) => x.name).join(', '), imageUrl: a.images?.[2]?.url ?? a.images?.[0]?.url })
      }
      for (const p of data.playlists?.items ?? []) {
        items.push({ type: 'playlist', id: p.id, uri: p.uri, name: p.name, subtitle: `by ${p.owner?.display_name ?? 'Unknown'}`, imageUrl: p.images?.[0]?.url })
      }
      for (const ar of data.artists?.items ?? []) {
        items.push({ type: 'artist', id: ar.id, uri: ar.uri, name: ar.name, subtitle: `${(ar.followers?.total ?? 0).toLocaleString()} followers`, imageUrl: ar.images?.[2]?.url ?? ar.images?.[0]?.url })
      }
      setResults(items.slice(0, 8))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const onQueryChange = useCallback((v: string) => {
    setQuery(v)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(v), 350)
  }, [doSearch])

  const playItem = useCallback(async (r: SearchResult) => {
    if (!deviceId) return
    try {
      const body = r.type === 'track'
        ? { uris: [r.uri] }
        : { context_uri: r.uri }
      await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setShowSearch(false)
      setQuery('')
      setResults([])
    } catch {}
  }, [deviceId])

  if (!visible || !spotifyAvailable()) return null

  // Not authenticated — collapsed icon to open login
  if (!authenticated) {
    if (collapsed) {
      return (
        <button
          onClick={() => setCollapsed(false)}
          className="fixed bottom-8 right-4 z-40 w-8 h-8 rounded-full bg-[var(--bg-tertiary)]/80 backdrop-blur-xl border border-[var(--border-hover)] shadow-lg flex items-center justify-center text-[var(--text-disabled)] hover:text-[#1DB954] hover:scale-110 transition-all duration-200 cursor-pointer opacity-50 hover:opacity-100"
          title="Connect to Spotify"
        >
          <Icon icon="simple-icons:spotify" width={14} height={14} />
        </button>
      )
    }

    return (
      <div className="fixed bottom-8 right-4 z-40 w-[280px] rounded-2xl bg-[var(--bg-tertiary)]/95 backdrop-blur-xl border border-[var(--border-hover)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between h-8 px-2.5 border-b border-[var(--border-hover)]/50">
          <div className="flex items-center gap-1.5">
            <Icon icon="simple-icons:spotify" width={12} height={12} className="text-[#1DB954]" />
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">Spotify</span>
          </div>
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
            <Icon icon="lucide:minus" width={11} height={11} />
          </button>
        </div>
        <div className="flex flex-col items-center py-6 px-4 gap-3">
          <p className="text-[10px] text-[var(--text-tertiary)] text-center">Sign-in to Spotify to play full songs</p>
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-semibold bg-[#1DB954] text-white hover:bg-[#1ed760] transition-colors cursor-pointer disabled:opacity-50"
          >
            {loggingIn ? (
              <Icon icon="lucide:loader-2" width={13} height={13} className="animate-spin" />
            ) : (
              <Icon icon="simple-icons:spotify" width={13} height={13} />
            )}
            {loggingIn ? 'Connecting...' : 'Connect Spotify'}
          </button>
          {error && <p className="text-[9px] text-[var(--error)] text-center">{error}</p>}
        </div>
      </div>
    )
  }

  // Authenticated — full player
  const track = playerState?.track_window.current_track ?? null
  const paused = playerState?.paused ?? true
  const duration = playerState?.duration ?? 0
  const progressPct = duration > 0 ? Math.min(100, (localPosition / duration) * 100) : 0

  // Collapsed state — show small icon
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-8 right-4 z-40 w-8 h-8 rounded-full bg-[var(--bg-tertiary)]/80 backdrop-blur-xl border border-[var(--border-hover)] shadow-lg flex items-center justify-center text-[#1DB954] hover:scale-110 transition-all duration-200 cursor-pointer opacity-70 hover:opacity-100"
        title={track ? `${track.name} — ${track.artists[0]?.name}` : 'Spotify Player'}
      >
        <Icon icon={!paused ? 'lucide:volume-2' : 'simple-icons:spotify'} width={14} height={14} className={!paused ? 'animate-pulse' : ''} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-8 right-4 z-40 w-[300px] rounded-2xl bg-[var(--bg-tertiary)]/95 backdrop-blur-xl border border-[var(--border-hover)] shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-center justify-between h-8 px-2.5 border-b border-[var(--border-hover)]/50">
        <div className="flex items-center gap-1.5">
          <Icon icon="simple-icons:spotify" width={12} height={12} className="text-[#1DB954]" />
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">
            {deviceId ? 'Knot Code' : 'Connecting...'}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setShowSearch(v => !v); setTimeout(() => inputRef.current?.focus(), 100) }}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title="Search"
          >
            <Icon icon="lucide:search" width={11} height={11} />
          </button>
          <button onClick={handleLogout} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Disconnect">
            <Icon icon="lucide:log-out" width={11} height={11} />
          </button>
          <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors" title="Collapse">
            <Icon icon="lucide:minus" width={11} height={11} />
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="border-b border-[var(--border-hover)]/50">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <Icon icon="lucide:search" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setQuery(''); setResults([]) } }}
              placeholder="Search songs, albums, playlists..."
              className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }} className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-pointer">
                <Icon icon="lucide:x" width={10} height={10} />
              </button>
            )}
          </div>
          {(results.length > 0 || searching) && (
            <div className="max-h-[200px] overflow-y-auto border-t border-[var(--border-hover)]/50">
              {searching ? (
                <div className="flex items-center gap-2 px-3 py-3">
                  <Icon icon="lucide:loader-2" width={12} height={12} className="text-[var(--text-disabled)] animate-spin" />
                  <span className="text-[10px] text-[var(--text-disabled)]">Searching...</span>
                </div>
              ) : results.map(r => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => playItem(r)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                >
                  {r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                      <Icon icon="lucide:music" width={12} height={12} className="text-[var(--text-disabled)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium text-[var(--text-primary)] truncate">{r.name}</div>
                    <div className="text-[9px] text-[var(--text-tertiary)] truncate">{r.subtitle}</div>
                  </div>
                  <span className="text-[8px] font-mono uppercase text-[var(--text-disabled)] px-1 py-0.5 rounded bg-[var(--bg-subtle)] shrink-0">{r.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--error)_8%,transparent)] border-b border-[var(--border-hover)]/50">
          <p className="text-[9px] text-[var(--error)]">{error}</p>
        </div>
      )}

      {/* Now playing */}
      {track ? (
        <div className="p-2.5">
          <div className="flex items-center gap-2.5 mb-2">
            {/* Album art */}
            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow-md">
              {track.album.images[0] ? (
                <img src={track.album.images[0].url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--bg-subtle)] flex items-center justify-center">
                  <Icon icon="lucide:music" width={18} height={18} className="text-[var(--text-disabled)]" />
                </div>
              )}
            </div>
            {/* Track info */}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-[var(--text-primary)] truncate leading-tight">{track.name}</div>
              <div className="text-[10px] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">{track.artists.map(a => a.name).join(', ')}</div>
              <div className="text-[9px] text-[var(--text-disabled)] truncate leading-tight mt-0.5">{track.album.name}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[8px] font-mono text-[var(--text-disabled)] w-7 text-right">{formatMs(localPosition)}</span>
            <div
              className="flex-1 h-1 rounded-full bg-[var(--border-hover)] cursor-pointer group relative"
              onClick={seekTo}
            >
              <div
                className="h-full rounded-full bg-[#1DB954] transition-[width] duration-200 ease-linear relative"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[var(--text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-[8px] font-mono text-[var(--text-disabled)] w-7">{formatMs(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => {
                const next = playerState ? [0, 2, 1][playerState.repeat_mode] : 0
                spotifyFetch(`/me/player/repeat?state=${['off', 'context', 'track'][next]}&device_id=${deviceId}`, { method: 'PUT' }).catch(() => {})
              }}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                (playerState?.repeat_mode ?? 0) > 0 ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
              title="Repeat"
            >
              <Icon icon={playerState?.repeat_mode === 2 ? 'lucide:repeat-1' : 'lucide:repeat'} width={12} height={12} />
            </button>
            <button onClick={skipPrev} className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
              <Icon icon="lucide:skip-back" width={14} height={14} />
            </button>
            <button onClick={togglePlay} className="p-2 rounded-full bg-[var(--text-primary)] text-[var(--bg)] hover:scale-105 cursor-pointer transition-transform shadow-md">
              <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} width={16} height={16} />
            </button>
            <button onClick={skipNext} className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
              <Icon icon="lucide:skip-forward" width={14} height={14} />
            </button>
            <button
              onClick={() => {
                spotifyFetch(`/me/player/shuffle?state=${!(playerState?.shuffle ?? false)}&device_id=${deviceId}`, { method: 'PUT' }).catch(() => {})
              }}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                playerState?.shuffle ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
              }`}
              title="Shuffle"
            >
              <Icon icon="lucide:shuffle" width={12} height={12} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-6 px-4 text-center">
          {!deviceId ? (
            <>
              <Icon icon="lucide:loader-2" width={20} height={20} className="text-[var(--text-disabled)] animate-spin mb-2" />
              <p className="text-[10px] text-[var(--text-disabled)]">Connecting to Spotify...</p>
            </>
          ) : (
            <>
              <Icon icon="lucide:music" width={20} height={20} className="text-[var(--text-disabled)] mb-2" />
              <p className="text-[10px] text-[var(--text-tertiary)]">Nothing playing</p>
              <p className="text-[9px] text-[var(--text-disabled)] mt-1">Search for a song or start playing from Spotify</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
