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

interface PlaylistItem {
  id: string
  uri: string
  name: string
  description: string
  imageUrl?: string
  trackCount: number
  ownerName: string
}

interface PlaylistTrack {
  id: string
  uri: string
  name: string
  artists: string
  albumName: string
  imageUrl?: string
  durationMs: number
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
  const [expanded, setExpanded] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistItem | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [likedSongs, setLikedSongs] = useState<PlaylistTrack[]>([])
  const [loadingLiked, setLoadingLiked] = useState(false)
  const [showLikedSongs, setShowLikedSongs] = useState(false)
  const [likedTotal, setLikedTotal] = useState(0)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  // SDK state
  const [sdkReady, setSdkReady] = useState(false)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<Spotify.PlayerState | null>(null)
  const [localPosition, setLocalPosition] = useState(0)

  const [volume, setVolume] = useState(0.5)
  const [showVolume, setShowVolume] = useState(false)
  const [muted, setMuted] = useState(false)
  const volumeBeforeMute = useRef(0.5)

  const playerRef = useRef<Spotify.Player | null>(null)
  const positionTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastStateTime = useRef(0)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)

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
      player.getVolume().then(v => { setVolume(v); setMuted(v === 0) }).catch(() => {})
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

  const changeVolume = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol))
    setVolume(clamped)
    setMuted(clamped === 0)
    playerRef.current?.setVolume(clamped)
  }, [])

  const toggleMute = useCallback(() => {
    if (muted) {
      const restore = volumeBeforeMute.current > 0 ? volumeBeforeMute.current : 0.5
      setVolume(restore)
      setMuted(false)
      playerRef.current?.setVolume(restore)
    } else {
      volumeBeforeMute.current = volume
      setVolume(0)
      setMuted(true)
      playerRef.current?.setVolume(0)
    }
  }, [muted, volume])

  const handleVolumeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    changeVolume(pct)
  }, [changeVolume])

  const handleVolumeDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    changeVolume(pct)
  }, [changeVolume])

  useEffect(() => {
    if (!showVolume) return
    const handler = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolume(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showVolume])

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

  const fetchPlaylists = useCallback(async () => {
    setLoadingPlaylists(true)
    setLibraryError(null)
    try {
      const res = await spotifyFetch('/me/playlists?limit=50')
      if (!res.ok) {
        if (res.status === 403) {
          setLibraryError('Missing permissions — disconnect and reconnect Spotify')
        } else {
          setLibraryError(`Failed to load playlists (${res.status})`)
        }
        return
      }
      const data = await res.json()
      const items: PlaylistItem[] = (data.items ?? []).map((p: { id: string; uri: string; name: string; description: string; images: { url: string }[]; tracks: { total: number }; owner: { display_name: string } }) => ({
        id: p.id,
        uri: p.uri,
        name: p.name,
        description: p.description ?? '',
        imageUrl: p.images?.[0]?.url,
        trackCount: p.tracks?.total ?? 0,
        ownerName: p.owner?.display_name ?? 'Unknown',
      }))
      setPlaylists(items)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Failed to load playlists')
    } finally {
      setLoadingPlaylists(false)
    }
  }, [])

  const fetchPlaylistTracks = useCallback(async (playlist: PlaylistItem) => {
    setSelectedPlaylist(playlist)
    setShowLikedSongs(false)
    setLoadingTracks(true)
    setPlaylistTracks([])
    setLibraryError(null)
    try {
      const res = await spotifyFetch(`/playlists/${playlist.id}/tracks?limit=50&fields=items(track(id,uri,name,artists(name),album(name,images),duration_ms))`)
      if (!res.ok) {
        setLibraryError(`Failed to load tracks (${res.status})`)
        return
      }
      const data = await res.json()
      const tracks: PlaylistTrack[] = (data.items ?? [])
        .filter((item: { track: { id: string } | null }) => item.track?.id)
        .map((item: { track: { id: string; uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; duration_ms: number } }) => ({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artists: item.track.artists?.map(a => a.name).join(', ') ?? '',
          albumName: item.track.album?.name ?? '',
          imageUrl: item.track.album?.images?.[2]?.url ?? item.track.album?.images?.[0]?.url,
          durationMs: item.track.duration_ms,
        }))
      setPlaylistTracks(tracks)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Failed to load tracks')
    } finally {
      setLoadingTracks(false)
    }
  }, [])

  const fetchLikedSongs = useCallback(async () => {
    setShowLikedSongs(true)
    setSelectedPlaylist(null)
    setLoadingLiked(true)
    setLikedSongs([])
    setLibraryError(null)
    try {
      const res = await spotifyFetch('/me/tracks?limit=50')
      if (!res.ok) {
        if (res.status === 403) {
          setLibraryError('Missing permissions — disconnect and reconnect Spotify')
        } else {
          setLibraryError(`Failed to load liked songs (${res.status})`)
        }
        return
      }
      const data = await res.json()
      setLikedTotal(data.total ?? 0)
      const tracks: PlaylistTrack[] = (data.items ?? [])
        .filter((item: { track: { id: string } | null }) => item.track?.id)
        .map((item: { track: { id: string; uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] }; duration_ms: number } }) => ({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artists: item.track.artists?.map(a => a.name).join(', ') ?? '',
          albumName: item.track.album?.name ?? '',
          imageUrl: item.track.album?.images?.[2]?.url ?? item.track.album?.images?.[0]?.url,
          durationMs: item.track.duration_ms,
        }))
      setLikedSongs(tracks)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Failed to load liked songs')
    } finally {
      setLoadingLiked(false)
    }
  }, [])

  const openLibrary = useCallback(() => {
    setShowLibrary(true)
    setShowSearch(false)
    setSelectedPlaylist(null)
    setPlaylistTracks([])
    setShowLikedSongs(false)
    setLibraryError(null)
    if (playlists.length === 0) fetchPlaylists()
  }, [playlists.length, fetchPlaylists])

  const playPlaylistTrack = useCallback(async (track: PlaylistTrack, contextUri?: string, offset?: number) => {
    if (!deviceId) return
    try {
      const body = contextUri
        ? { context_uri: contextUri, offset: { position: offset ?? 0 } }
        : { uris: [track.uri] }
      await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {}
  }, [deviceId])

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
    <div className={`fixed z-40 rounded-2xl bg-[var(--bg-tertiary)]/95 backdrop-blur-xl border border-[var(--border-hover)] shadow-2xl overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
      expanded
        ? 'bottom-6 right-6 w-[420px]'
        : 'bottom-8 right-4 w-[300px]'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-2.5 border-b border-[var(--border-hover)]/50 ${expanded ? 'h-9' : 'h-8'}`}>
        <div className="flex items-center gap-1.5">
          <Icon icon="simple-icons:spotify" width={12} height={12} className="text-[#1DB954]" />
          <span className={`font-medium text-[var(--text-secondary)] ${expanded ? 'text-[11px]' : 'text-[10px]'}`}>
            {deviceId ? 'Knot Code' : 'Connecting...'}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setShowSearch(v => !v); setShowLibrary(false); setTimeout(() => inputRef.current?.focus(), 100) }}
            className={`p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${showSearch ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`}
            title="Search"
          >
            <Icon icon="lucide:search" width={11} height={11} />
          </button>
          <button
            onClick={openLibrary}
            className={`p-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${showLibrary ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'}`}
            title="My Playlists"
          >
            <Icon icon="lucide:library" width={11} height={11} />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title={expanded ? 'Compact' : 'Expand'}
          >
            <Icon icon={expanded ? 'lucide:minimize-2' : 'lucide:maximize-2'} width={11} height={11} />
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
            <div className={`overflow-y-auto border-t border-[var(--border-hover)]/50 ${expanded ? 'max-h-[320px]' : 'max-h-[200px]'}`}>
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

      {/* Library / Playlists / Liked Songs */}
      {showLibrary && (
        <div className="border-b border-[var(--border-hover)]/50">
          {libraryError && (
            <div className="px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--error)_8%,transparent)] border-b border-[var(--border-hover)]/30">
              <p className="text-[9px] text-[var(--error)]">{libraryError}</p>
            </div>
          )}
          {showLikedSongs ? (
            <>
              <button
                onClick={() => { setShowLikedSongs(false); setLikedSongs([]); setLibraryError(null) }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border-b border-[var(--border-hover)]/30"
              >
                <Icon icon="lucide:chevron-left" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                <Icon icon="lucide:heart" width={10} height={10} className="text-[#1DB954] shrink-0" />
                <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">Liked Songs</span>
                <span className="text-[8px] text-[var(--text-disabled)] ml-auto shrink-0">{likedTotal} songs</span>
              </button>
              <div className={`overflow-y-auto ${expanded ? 'max-h-[400px]' : 'max-h-[260px]'}`}>
                {loadingLiked ? (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <Icon icon="lucide:loader-2" width={12} height={12} className="text-[var(--text-disabled)] animate-spin" />
                    <span className="text-[10px] text-[var(--text-disabled)]">Loading liked songs...</span>
                  </div>
                ) : likedSongs.length === 0 && !libraryError ? (
                  <div className="px-3 py-3">
                    <span className="text-[10px] text-[var(--text-disabled)]">No liked songs found</span>
                  </div>
                ) : likedSongs.map((t, idx) => (
                  <button
                    key={t.id}
                    onClick={() => playPlaylistTrack(t, undefined, idx)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left group"
                  >
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                        <Icon icon="lucide:music" width={12} height={12} className="text-[var(--text-disabled)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-[var(--text-primary)] truncate">{t.name}</div>
                      <div className="text-[9px] text-[var(--text-tertiary)] truncate">{t.artists}</div>
                    </div>
                    <span className="text-[8px] font-mono text-[var(--text-disabled)] shrink-0">{formatMs(t.durationMs)}</span>
                    <Icon icon="lucide:play" width={10} height={10} className="text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </>
          ) : selectedPlaylist ? (
            <>
              <button
                onClick={() => { setSelectedPlaylist(null); setPlaylistTracks([]); setLibraryError(null) }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border-b border-[var(--border-hover)]/30"
              >
                <Icon icon="lucide:chevron-left" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                <span className="text-[10px] font-medium text-[var(--text-secondary)] truncate">{selectedPlaylist.name}</span>
                <span className="text-[8px] text-[var(--text-disabled)] ml-auto shrink-0">{selectedPlaylist.trackCount} tracks</span>
              </button>
              <div className={`overflow-y-auto ${expanded ? 'max-h-[400px]' : 'max-h-[260px]'}`}>
                {loadingTracks ? (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <Icon icon="lucide:loader-2" width={12} height={12} className="text-[var(--text-disabled)] animate-spin" />
                    <span className="text-[10px] text-[var(--text-disabled)]">Loading tracks...</span>
                  </div>
                ) : playlistTracks.length === 0 && !libraryError ? (
                  <div className="px-3 py-3">
                    <span className="text-[10px] text-[var(--text-disabled)]">No tracks found</span>
                  </div>
                ) : playlistTracks.map((t, idx) => (
                  <button
                    key={t.id}
                    onClick={() => playPlaylistTrack(t, selectedPlaylist.uri, idx)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left group"
                  >
                    {t.imageUrl ? (
                      <img src={t.imageUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                        <Icon icon="lucide:music" width={12} height={12} className="text-[var(--text-disabled)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-[var(--text-primary)] truncate">{t.name}</div>
                      <div className="text-[9px] text-[var(--text-tertiary)] truncate">{t.artists}</div>
                    </div>
                    <span className="text-[8px] font-mono text-[var(--text-disabled)] shrink-0">{formatMs(t.durationMs)}</span>
                    <Icon icon="lucide:play" width={10} height={10} className="text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-hover)]/30">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">My Library</span>
                <button
                  onClick={() => { setShowLibrary(false); setLibraryError(null) }}
                  className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] cursor-pointer"
                >
                  <Icon icon="lucide:x" width={10} height={10} />
                </button>
              </div>
              <div className={`overflow-y-auto ${expanded ? 'max-h-[400px]' : 'max-h-[260px]'}`}>
                {/* Liked Songs entry */}
                <button
                  onClick={fetchLikedSongs}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                >
                  <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-gradient-to-br from-[#4B27A4] to-[#89CCF0]">
                    <Icon icon="lucide:heart" width={14} height={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium text-[var(--text-primary)] truncate">Liked Songs</div>
                    <div className="text-[9px] text-[var(--text-tertiary)] truncate">Your saved tracks</div>
                  </div>
                  <Icon icon="lucide:chevron-right" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                </button>

                {/* Playlists */}
                {loadingPlaylists ? (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <Icon icon="lucide:loader-2" width={12} height={12} className="text-[var(--text-disabled)] animate-spin" />
                    <span className="text-[10px] text-[var(--text-disabled)]">Loading playlists...</span>
                  </div>
                ) : playlists.length === 0 && !libraryError ? (
                  <div className="px-3 py-2">
                    <span className="text-[10px] text-[var(--text-disabled)]">No playlists found</span>
                  </div>
                ) : playlists.map(p => (
                  <button
                    key={p.id}
                    onClick={() => fetchPlaylistTracks(p)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer text-left"
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[var(--bg-subtle)] flex items-center justify-center shrink-0">
                        <Icon icon="lucide:list-music" width={14} height={14} className="text-[var(--text-disabled)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-[var(--text-primary)] truncate">{p.name}</div>
                      <div className="text-[9px] text-[var(--text-tertiary)] truncate">{p.ownerName} · {p.trackCount} tracks</div>
                    </div>
                    <Icon icon="lucide:chevron-right" width={11} height={11} className="text-[var(--text-disabled)] shrink-0" />
                  </button>
                ))}
              </div>
            </>
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
        <div className={expanded ? 'p-4' : 'p-2.5'}>
          {expanded ? (
            <>
              <div className="flex flex-col items-center mb-3">
                <div className="w-44 h-44 rounded-xl overflow-hidden shrink-0 shadow-lg mb-3">
                  {track.album.images[0] ? (
                    <img src={track.album.images[0].url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--bg-subtle)] flex items-center justify-center">
                      <Icon icon="lucide:music" width={40} height={40} className="text-[var(--text-disabled)]" />
                    </div>
                  )}
                </div>
                <div className="w-full text-center">
                  <div className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">{track.name}</div>
                  <div className="text-xs text-[var(--text-tertiary)] truncate leading-tight mt-1">{track.artists.map(a => a.name).join(', ')}</div>
                  <div className="text-[10px] text-[var(--text-disabled)] truncate leading-tight mt-0.5">{track.album.name}</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[9px] font-mono text-[var(--text-disabled)] w-8 text-right">{formatMs(localPosition)}</span>
                <div
                  className="flex-1 h-1.5 rounded-full bg-[var(--border-hover)] cursor-pointer group relative"
                  onClick={seekTo}
                >
                  <div
                    className="h-full rounded-full bg-[#1DB954] transition-[width] duration-200 ease-linear relative"
                    style={{ width: `${progressPct}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-[9px] font-mono text-[var(--text-disabled)] w-8">{formatMs(duration)}</span>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const next = playerState ? [0, 2, 1][playerState.repeat_mode] : 0
                    spotifyFetch(`/me/player/repeat?state=${['off', 'context', 'track'][next]}&device_id=${deviceId}`, { method: 'PUT' }).catch(() => {})
                  }}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    (playerState?.repeat_mode ?? 0) > 0 ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Repeat"
                >
                  <Icon icon={playerState?.repeat_mode === 2 ? 'lucide:repeat-1' : 'lucide:repeat'} width={16} height={16} />
                </button>
                <button onClick={skipPrev} className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
                  <Icon icon="lucide:skip-back" width={18} height={18} />
                </button>
                <button onClick={togglePlay} className="p-3 rounded-full bg-[var(--text-primary)] text-[var(--bg)] hover:scale-105 cursor-pointer transition-transform shadow-lg">
                  <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} width={22} height={22} />
                </button>
                <button onClick={skipNext} className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
                  <Icon icon="lucide:skip-forward" width={18} height={18} />
                </button>
                <button
                  onClick={() => {
                    spotifyFetch(`/me/player/shuffle?state=${!(playerState?.shuffle ?? false)}&device_id=${deviceId}`, { method: 'PUT' }).catch(() => {})
                  }}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    playerState?.shuffle ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                  }`}
                  title="Shuffle"
                >
                  <Icon icon="lucide:shuffle" width={16} height={16} />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2 mt-2 px-2">
                <button
                  onClick={toggleMute}
                  className="p-1 rounded-full text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors shrink-0"
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  <Icon
                    icon={muted || volume === 0 ? 'lucide:volume-x' : volume < 0.5 ? 'lucide:volume-1' : 'lucide:volume-2'}
                    width={14} height={14}
                  />
                </button>
                <div
                  className="flex-1 h-1.5 rounded-full bg-[var(--border-hover)] cursor-pointer group relative"
                  onClick={handleVolumeClick}
                  onMouseMove={handleVolumeDrag}
                >
                  <div
                    className="h-full rounded-full bg-[var(--text-tertiary)] group-hover:bg-[#1DB954] transition-colors relative"
                    style={{ width: `${volume * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow-md">
                  {track.album.images[0] ? (
                    <img src={track.album.images[0].url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--bg-subtle)] flex items-center justify-center">
                      <Icon icon="lucide:music" width={18} height={18} className="text-[var(--text-disabled)]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text-primary)] truncate leading-tight">{track.name}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">{track.artists.map(a => a.name).join(', ')}</div>
                  <div className="text-[9px] text-[var(--text-disabled)] truncate leading-tight mt-0.5">{track.album.name}</div>
                </div>
              </div>

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
                <div className="relative ml-0.5" ref={volumeRef}>
                  <button
                    onClick={() => setShowVolume(v => !v)}
                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                      showVolume ? 'text-[#1DB954]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)]'
                    }`}
                    title="Volume"
                  >
                    <Icon
                      icon={muted || volume === 0 ? 'lucide:volume-x' : volume < 0.5 ? 'lucide:volume-1' : 'lucide:volume-2'}
                      width={12} height={12}
                    />
                  </button>
                  {showVolume && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-2 rounded-xl bg-[var(--bg-tertiary)]/95 backdrop-blur-xl border border-[var(--border-hover)] shadow-xl w-32">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={toggleMute}
                          className="p-0.5 rounded text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors shrink-0"
                        >
                          <Icon
                            icon={muted || volume === 0 ? 'lucide:volume-x' : volume < 0.5 ? 'lucide:volume-1' : 'lucide:volume-2'}
                            width={10} height={10}
                          />
                        </button>
                        <div
                          className="flex-1 h-1 rounded-full bg-[var(--border-hover)] cursor-pointer group relative"
                          onClick={handleVolumeClick}
                          onMouseMove={handleVolumeDrag}
                        >
                          <div
                            className="h-full rounded-full bg-[var(--text-tertiary)] group-hover:bg-[#1DB954] transition-colors relative"
                            style={{ width: `${volume * 100}%` }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--text-primary)] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[8px] font-mono text-[var(--text-disabled)] w-5 text-right shrink-0">{Math.round(volume * 100)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={`flex flex-col items-center text-center ${expanded ? 'py-10 px-6' : 'py-6 px-4'}`}>
          {!deviceId ? (
            <>
              <Icon icon="lucide:loader-2" width={expanded ? 28 : 20} height={expanded ? 28 : 20} className="text-[var(--text-disabled)] animate-spin mb-2" />
              <p className={`text-[var(--text-disabled)] ${expanded ? 'text-[11px]' : 'text-[10px]'}`}>Connecting to Spotify...</p>
            </>
          ) : (
            <>
              <Icon icon="lucide:music" width={expanded ? 28 : 20} height={expanded ? 28 : 20} className="text-[var(--text-disabled)] mb-2" />
              <p className={`text-[var(--text-tertiary)] ${expanded ? 'text-[11px]' : 'text-[10px]'}`}>Nothing playing</p>
              <p className={`text-[var(--text-disabled)] mt-1 ${expanded ? 'text-[10px]' : 'text-[9px]'}`}>Search for a song or start playing from Spotify</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
