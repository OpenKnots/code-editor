'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { usePlugins } from '@/context/plugin-context'
import { isSpotifyAuthenticated, spotifyAvailable } from '@/lib/spotify-auth'

interface TrackInfo {
  name: string
  artist: string
  paused: boolean
}

function dispatchSpotifyCommand(type: string) {
  window.dispatchEvent(new CustomEvent('spotify-command', { detail: { type } }))
}

export function SpotifyStatusBar() {
  const { setPipPluginId, pipPluginId } = usePlugins()
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    setAuthenticated(isSpotifyAuthenticated())
    const authHandler = () => setAuthenticated(isSpotifyAuthenticated())
    window.addEventListener('spotify-auth-changed', authHandler)
    return () => window.removeEventListener('spotify-auth-changed', authHandler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const state = (e as CustomEvent).detail
      if (!state?.track_window?.current_track) {
        setTrack(null)
        return
      }
      const t = state.track_window.current_track
      setTrack({
        name: t.name,
        artist: t.artists?.[0]?.name ?? '',
        paused: state.paused,
      })
    }
    window.addEventListener('spotify-state-changed', handler)
    return () => window.removeEventListener('spotify-state-changed', handler)
  }, [])

  const togglePip = useCallback(() => {
    setPipPluginId(pipPluginId === 'spotify-player' ? null : 'spotify-player')
  }, [setPipPluginId, pipPluginId])

  if (!spotifyAvailable()) return null

  const isActive = pipPluginId === 'spotify-player'
  const hasTrack = Boolean(track)

  return (
    <span className="flex items-center gap-0.5">
      {/* Spotify icon — toggles PiP */}
      <button
        onClick={togglePip}
        className={`flex items-center gap-1 cursor-pointer transition-colors rounded px-1 py-0.5 ${
          isActive
            ? 'text-[#1DB954] bg-[color-mix(in_srgb,#1DB954_10%,transparent)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
        }`}
        title={track ? `${track.name} — ${track.artist}` : 'Open Spotify'}
      >
        <Icon
          icon="simple-icons:spotify"
          width={10}
          height={10}
          className={track && !track.paused ? 'text-[#1DB954]' : ''}
        />
        {track ? (
          <span className="truncate text-[10px] max-w-[100px]">
            {track.name}
          </span>
        ) : authenticated ? (
          <span className="text-[10px]">Spotify</span>
        ) : null}
      </button>

      {/* Inline controls — only when a track is loaded */}
      {hasTrack && (
        <>
          <button
            onClick={() => dispatchSpotifyCommand('previous-track')}
            className="flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title="Previous"
          >
            <Icon icon="lucide:skip-back" width={9} height={9} />
          </button>
          <button
            onClick={() => dispatchSpotifyCommand('toggle-play')}
            className="flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title={track?.paused ? 'Play' : 'Pause'}
          >
            <Icon icon={track?.paused ? 'lucide:play' : 'lucide:pause'} width={9} height={9} />
          </button>
          <button
            onClick={() => dispatchSpotifyCommand('next-track')}
            className="flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title="Next"
          >
            <Icon icon="lucide:skip-forward" width={9} height={9} />
          </button>
        </>
      )}
    </span>
  )
}
