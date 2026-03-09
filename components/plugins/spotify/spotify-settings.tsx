'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import {
  spotifyAvailable,
  isSpotifyAuthenticated,
  startSpotifyLogin,
  clearSpotifyAuth,
} from '@/lib/spotify-auth'

export function SpotifySettings() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAuthenticated(isSpotifyAuthenticated())
    const handler = () => setAuthenticated(isSpotifyAuthenticated())
    window.addEventListener('spotify-auth-changed', handler)
    return () => window.removeEventListener('spotify-auth-changed', handler)
  }, [])

  const handleLogin = async () => {
    setLoggingIn(true)
    setError(null)
    try {
      await startSpotifyLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoggingIn(false)
    }
  }

  const handleLogout = () => {
    clearSpotifyAuth()
    setError(null)
  }

  if (!spotifyAvailable()) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon icon="simple-icons:spotify" width={14} height={14} className="text-[#1DB954]" />
          <span className="text-[11px] font-medium text-[var(--text-primary)]">Spotify</span>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          Set{' '}
          <code className="font-mono text-[9px] px-1 py-0.5 rounded bg-[var(--bg-subtle)]">
            NEXT_PUBLIC_SPOTIFY_CLIENT_ID
          </code>{' '}
          in your environment to enable Spotify integration.
        </p>
        <p className="text-[9px] text-[var(--text-disabled)]">
          Create an app at{' '}
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--brand)] hover:underline"
          >
            developer.spotify.com
          </a>
          . No client secret needed — uses PKCE flow.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon icon="simple-icons:spotify" width={14} height={14} className="text-[#1DB954]" />
        <span className="text-[11px] font-medium text-[var(--text-primary)]">Spotify</span>
      </div>

      {authenticated ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]">
            <Icon
              icon="lucide:check-circle"
              width={12}
              height={12}
              className="text-[var(--color-additions)] shrink-0"
            />
            <span className="text-[10px] text-[var(--text-secondary)] flex-1">
              Connected to Spotify
            </span>
            <button
              onClick={handleLogout}
              className="text-[9px] text-[var(--text-disabled)] hover:text-[var(--error)] transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          </div>
          <p className="text-[9px] text-[var(--text-disabled)]">
            Premium account required for full playback. Use Ctrl+Shift+M to toggle the player.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
            Connect your Spotify Premium account to play full songs, search, and control playback
            from the editor.
          </p>
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-[#1a9e48] text-white hover:bg-[#1DB954] transition-colors cursor-pointer disabled:opacity-50"
          >
            {loggingIn ? (
              <Icon icon="lucide:loader-2" width={11} height={11} className="animate-spin" />
            ) : (
              <Icon icon="simple-icons:spotify" width={11} height={11} />
            )}
            {loggingIn ? 'Connecting...' : 'Connect Spotify'}
          </button>
          {error && <p className="text-[12px] text-[var(--error)]">{error}</p>}
        </div>
      )}
    </div>
  )
}
