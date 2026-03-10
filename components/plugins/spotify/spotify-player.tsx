'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { emit } from '@/lib/events'
import {
  spotifyAvailable,
  isSpotifyAuthenticated,
  ensureSpotifyToken,
  spotifyFetch,
  startSpotifyLogin,
  clearSpotifyAuth,
  handleSpotifyCallback,
  handleSpotifyAuthHandoff,
} from '@/lib/spotify-auth'

declare global {
  interface Window {
    Spotify: { Player: new (opts: Record<string, unknown>) => Spotify.Player }
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

declare namespace Spotify {
  interface Player {
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: string, cb: (...args: any[]) => void): boolean
    removeListener(event: string, cb?: (...args: any[]) => void): boolean
    getCurrentState(): Promise<PlayerState | null>
    setVolume(v: number): Promise<void>
    getVolume(): Promise<number>
    pause(): Promise<void>
    resume(): Promise<void>
    togglePlay(): Promise<void>
    seek(ms: number): Promise<void>
    previousTrack(): Promise<void>
    nextTrack(): Promise<void>
  }
  interface PlayerState {
    paused: boolean
    position: number
    duration: number
    track_window: {
      current_track: {
        id: string
        uri: string
        name: string
        artists: Array<{ name: string; uri: string }>
        album: { name: string; images: Array<{ url: string; width: number; height: number }> }
        duration_ms: number
      }
    }
  }
}

interface SearchResult {
  id: string
  name: string
  subtitle: string
  imageUrl?: string
  uri: string
  type: 'track' | 'album' | 'playlist'
}

type SpotifyCommandDetail =
  | { type: 'toggle-play' }
  | { type: 'previous-track' }
  | { type: 'next-track' }
  | { type: 'set-volume'; value: number }
  | { type: 'toggle-mute' }

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js'

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SpotifyPlayer() {
  const [authenticated, setAuthenticated] = useState(false)
  const [visible, setVisible] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const [sdkReady, setSdkReady] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<Spotify.PlayerState | null>(null)
  const [localPosition, setLocalPosition] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const [muted, setMuted] = useState(false)
  const volumeBeforeMute = useRef(0.5)

  const playerRef = useRef<Spotify.Player | null>(null)
  const positionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStateTime = useRef(0)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Handle tauri:// → localhost handoff (redirects to Spotify if params present)
    if (handleSpotifyAuthHandoff()) return
    handleSpotifyCallback()
      .catch((err) => setError(err instanceof Error ? err.message : 'Auth failed'))
      .finally(() => setAuthenticated(isSpotifyAuthenticated()))
    const handler = () => setAuthenticated(isSpotifyAuthenticated())
    window.addEventListener('spotify-auth-changed', handler)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'knot:spotify-token' && e.newValue) setAuthenticated(true)
    }
    window.addEventListener('storage', storageHandler)
    return () => {
      window.removeEventListener('spotify-auth-changed', handler)
      window.removeEventListener('storage', storageHandler)
    }
  }, [])

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

  useEffect(() => {
    if (!sdkReady || !authenticated) return
    const player = new window.Spotify.Player({
      name: 'KnotCode',
      getOAuthToken: async (cb: (t: string) => void) => {
        const token = await ensureSpotifyToken()
        if (token) cb(token)
      },
      volume: 0.5,
    })
    player.addListener('ready', ({ device_id }: { device_id: string }) => {
      setDeviceId(device_id)
      setError(null)
      player
        .getVolume()
        .then((v: number) => {
          setVolume(v)
          setMuted(v === 0)
        })
        .catch(() => {})
      spotifyFetch('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [device_id], play: false }),
      })
        .then(() => {
          // Auto-start Liked Songs as default playlist
          return spotifyFetch('/me/tracks?limit=50&market=US')
        })
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          const uris = (data.items ?? [])
            .map((item: { track?: { uri?: string } }) => item.track?.uri)
            .filter(Boolean) as string[]
          if (uris.length === 0) return
          // Only start if nothing is already playing
          const state = await player.getCurrentState()
          if (state) return
          await spotifyFetch(`/me/player/play?device_id=${device_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris }),
          })
        })
        .catch(() => {})
    })
    player.addListener('not_ready', () => setDeviceId(null))
    player.addListener('player_state_changed', (state: Spotify.PlayerState) => {
      setPlayerState(state ?? null)
      if (state) {
        setLocalPosition(state.position)
        lastStateTime.current = Date.now()
      }
    })
    player.addListener('authentication_error', ({ message }: { message: string }) =>
      setError(`Auth: ${message}`),
    )
    player.addListener('account_error', () => setError('Premium required'))
    player.addListener('initialization_error', ({ message }: { message: string }) =>
      setError(`Init: ${message}`),
    )
    player.connect()
    playerRef.current = player
    return () => {
      player.disconnect()
      playerRef.current = null
    }
  }, [sdkReady, authenticated])

  useEffect(() => {
    emit('spotify-state-changed', {
      authenticated,
      deviceId,
      paused: playerState?.paused ?? true,
      muted,
      volume,
      track_window: playerState?.track_window ?? null,
    })
  }, [authenticated, deviceId, muted, playerState, volume])

  useEffect(() => {
    if (positionTimer.current) clearInterval(positionTimer.current)
    if (playerState && !playerState.paused) {
      positionTimer.current = setInterval(() => {
        setLocalPosition(playerState.position + (Date.now() - lastStateTime.current))
      }, 250)
    }
    return () => {
      if (positionTimer.current) clearInterval(positionTimer.current)
    }
  }, [playerState])

  const togglePlay = useCallback(() => {
    playerRef.current?.togglePlay()
  }, [])
  const prevTrack = useCallback(() => {
    playerRef.current?.previousTrack()
  }, [])
  const nextTrack = useCallback(() => {
    playerRef.current?.nextTrack()
  }, [])

  const handleVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolume(clamped)
    setMuted(clamped === 0)
    playerRef.current?.setVolume(clamped)
  }, [])

  const toggleMute = useCallback(() => {
    if (muted) {
      handleVolume(volumeBeforeMute.current)
    } else {
      volumeBeforeMute.current = volume
      handleVolume(0)
    }
  }, [muted, volume, handleVolume])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SpotifyCommandDetail>).detail
      switch (detail?.type) {
        case 'toggle-play':
          togglePlay()
          break
        case 'previous-track':
          prevTrack()
          break
        case 'next-track':
          nextTrack()
          break
        case 'set-volume':
          handleVolume(detail.value)
          break
        case 'toggle-mute':
          toggleMute()
          break
      }
    }

    window.addEventListener('spotify-command', handler)
    return () => window.removeEventListener('spotify-command', handler)
  }, [handleVolume, nextTrack, prevTrack, toggleMute, togglePlay])

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    setError(null)
    try {
      await startSpotifyLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }, [])

  const handleLogout = useCallback(() => {
    clearSpotifyAuth()
    setAuthenticated(false)
    setPlayerState(null)
    setDeviceId(null)
  }, [])

  const onQueryChange = useCallback((v: string) => {
    setQuery(v)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!v.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: v,
          type: 'track,album,playlist',
          limit: '8',
          market: 'US',
        })
        const res = await spotifyFetch(`/search?${params}`)
        if (!res.ok) {
          setResults([])
          return
        }
        const data = await res.json()
        const items: SearchResult[] = [
          ...(data.tracks?.items ?? []).map((t: Record<string, unknown>) => ({
            id: t.id as string,
            name: t.name as string,
            subtitle: (t.artists as Array<{ name: string }>)?.[0]?.name ?? '',
            imageUrl:
              (t.album as { images: Array<{ url: string }> })?.images?.[2]?.url ??
              (t.album as { images: Array<{ url: string }> })?.images?.[0]?.url,
            uri: t.uri as string,
            type: 'track' as const,
          })),
          ...(data.albums?.items ?? []).slice(0, 3).map((a: Record<string, unknown>) => ({
            id: a.id as string,
            name: a.name as string,
            subtitle: (a.artists as Array<{ name: string }>)?.[0]?.name ?? 'Album',
            imageUrl:
              (a.images as Array<{ url: string }>)?.[2]?.url ??
              (a.images as Array<{ url: string }>)?.[0]?.url,
            uri: a.uri as string,
            type: 'album' as const,
          })),
        ]
        setResults(items)
      } catch {
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [])

  const playItem = useCallback(
    async (r: SearchResult) => {
      if (!deviceId) return
      try {
        const body = r.type === 'track' ? { uris: [r.uri] } : { context_uri: r.uri }
        await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        setShowSearch(false)
        setQuery('')
        setResults([])
      } catch {}
    },
    [deviceId],
  )

  if (!visible || !spotifyAvailable()) return null

  const track = authenticated ? (playerState?.track_window.current_track ?? null) : null
  const paused = playerState?.paused ?? true
  const duration = playerState?.duration ?? 0
  const progressPct = duration > 0 ? Math.min(100, (localPosition / duration) * 100) : 0
  const albumArt = track?.album?.images?.[0]?.url

  // ─── Thin sidebar panel ───
  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-7 px-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <Icon
          icon="simple-icons:spotify"
          width={11}
          height={11}
          className="text-[#1DB954] shrink-0"
        />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] ml-1.5">
          Music
        </span>
        <div className="flex-1" />
        {authenticated && (
          <button
            onClick={() => setShowSearch((v) => !v)}
            className={`p-0.5 rounded cursor-pointer ${showSearch ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`}
            title="Search"
          >
            <Icon icon="lucide:search" width={11} height={11} />
          </button>
        )}
      </div>

      {!authenticated ? (
        /* ─── Connect state ─── */
        <div className="flex flex-col items-center justify-center gap-2.5 py-6 px-3">
          <Icon
            icon="simple-icons:spotify"
            width={20}
            height={20}
            className="text-[var(--text-disabled)]"
          />
          <p className="text-[10px] text-[var(--text-tertiary)] text-center">
            Connect Spotify to play music while you code
          </p>
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="h-7 px-3 rounded-md text-[10px] font-semibold bg-[#1a9e48] text-white hover:bg-[#1DB954] disabled:opacity-50 cursor-pointer"
          >
            {loggingIn ? 'Connecting…' : 'Connect'}
          </button>
          {error && <p className="text-[12px] text-[var(--error)] text-center">{error}</p>}
        </div>
      ) : (
        <>
          {/* ─── Search ─── */}
          {showSearch && (
            <div className="border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                <Icon
                  icon="lucide:search"
                  width={10}
                  height={10}
                  className="text-[var(--text-disabled)] shrink-0"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearch(false)
                      setQuery('')
                      setResults([])
                    }
                  }}
                  placeholder="Search songs…"
                  className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none"
                  autoFocus
                  spellCheck={false}
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('')
                      setResults([])
                    }}
                    className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-pointer"
                  >
                    <Icon icon="lucide:x" width={10} height={10} />
                  </button>
                )}
              </div>
              {(results.length > 0 || searching) && (
                <div className="max-h-[200px] overflow-y-auto border-t border-[var(--border)]">
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <Icon
                        icon="lucide:loader-2"
                        width={11}
                        height={11}
                        className="text-[var(--text-disabled)] animate-spin"
                      />
                      <span className="text-[9px] text-[var(--text-disabled)]">Searching…</span>
                    </div>
                  ) : (
                    results.map((r) => (
                      <button
                        key={`${r.type}-${r.id}`}
                        onClick={() => playItem(r)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] cursor-pointer text-left"
                      >
                        {r.imageUrl ? (
                          <img
                            src={r.imageUrl}
                            alt=""
                            className="w-6 h-6 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded bg-[var(--bg-subtle)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-[var(--text-primary)] truncate">
                            {r.name}
                          </div>
                          <div className="text-[9px] text-[var(--text-tertiary)] truncate">
                            {r.subtitle}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Now playing ─── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {track ? (
              <div className="flex flex-col gap-2 p-3">
                {/* Album art */}
                {albumArt && (
                  <div className="w-full max-h-[200px] rounded-lg overflow-hidden bg-[var(--bg-subtle)]">
                    <img
                      src={albumArt}
                      alt={track.album.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Track info */}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                    {track.name}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                    {track.artists.map((a) => a.name).join(', ')}
                  </p>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-mono text-[var(--text-disabled)] w-7 text-right shrink-0">
                    {formatMs(localPosition)}
                  </span>
                  <div
                    className="flex-1 h-1 rounded-full bg-[var(--bg-subtle)] cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const pct = (e.clientX - rect.left) / rect.width
                      playerRef.current?.seek(Math.floor(pct * duration))
                    }}
                  >
                    <div
                      className="h-full rounded-full bg-[#1DB954]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-[var(--text-disabled)] w-7 shrink-0">
                    {formatMs(duration)}
                  </span>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={prevTrack}
                    className="w-7 h-7 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center cursor-pointer"
                    title="Previous"
                  >
                    <Icon icon="lucide:skip-back" width={13} height={13} />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="w-8 h-8 rounded-full bg-[var(--text-primary)] text-[var(--bg)] flex items-center justify-center cursor-pointer hover:opacity-90"
                    title={paused ? 'Play' : 'Pause'}
                  >
                    <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} width={14} height={14} />
                  </button>
                  <button
                    onClick={nextTrack}
                    className="w-7 h-7 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center cursor-pointer"
                    title="Next"
                  >
                    <Icon icon="lucide:skip-forward" width={13} height={13} />
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    onClick={toggleMute}
                    className="w-5 h-5 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer shrink-0"
                  >
                    <Icon
                      icon={
                        muted || volume === 0
                          ? 'lucide:volume-x'
                          : volume < 0.5
                            ? 'lucide:volume-1'
                            : 'lucide:volume-2'
                      }
                      width={12}
                      height={12}
                    />
                  </button>
                  <div
                    className="flex-1 h-1 rounded-full bg-[var(--bg-subtle)] cursor-pointer group relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      handleVolume((e.clientX - rect.left) / rect.width)
                    }}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--text-tertiary)] group-hover:bg-[#1DB954] transition-colors relative"
                      style={{ width: `${volume * 100}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--text-primary)] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <span className="text-[8px] font-mono text-[var(--text-disabled)] w-5 text-right shrink-0">
                    {Math.round(volume * 100)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 px-3">
                {!deviceId ? (
                  <>
                    <Icon
                      icon="lucide:loader-2"
                      width={18}
                      height={18}
                      className="text-[var(--text-disabled)] animate-spin"
                    />
                    <p className="text-[10px] text-[var(--text-disabled)]">Connecting…</p>
                  </>
                ) : (
                  <>
                    <Icon
                      icon="lucide:music"
                      width={18}
                      height={18}
                      className="text-[var(--text-disabled)]"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary)]">Nothing playing</p>
                    <button
                      onClick={() => {
                        setShowSearch(true)
                        setTimeout(() => inputRef.current?.focus(), 100)
                      }}
                      className="h-6 px-2.5 rounded-md text-[9px] font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer mt-1"
                    >
                      Search for a song
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center h-6 px-2.5 border-t border-[var(--border)] shrink-0">
            <span className="text-[8px] text-[var(--text-disabled)]">
              {deviceId ? 'KnotCode' : 'Connecting…'}
            </span>
            <div className="flex-1" />
            <button
              onClick={handleLogout}
              className="text-[8px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}
