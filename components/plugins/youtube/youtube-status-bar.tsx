'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { usePlugins } from '@/context/plugin-context'

interface TrackInfo {
  label: string
  playing: boolean
  hasCurrent: boolean
  muted: boolean
  volume: number
}

function dispatchYouTubeCommand(type: string, extra?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('youtube-command', { detail: { type, ...extra } }))
}

export function YouTubeStatusBar() {
  const { setPipPluginId, pipPluginId } = usePlugins()
  const [track, setTrack] = useState<TrackInfo | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) { setTrack(null); return }
      setTrack({
        label: detail.current?.label ?? '',
        playing: detail.playing ?? false,
        hasCurrent: Boolean(detail.current),
      })
    }
    window.addEventListener('youtube-state-changed', handler)
    return () => window.removeEventListener('youtube-state-changed', handler)
  }, [])

  const togglePip = useCallback(() => {
    setPipPluginId(pipPluginId === 'youtube-player' ? null : 'youtube-player')
  }, [setPipPluginId, pipPluginId])

  const isActive = pipPluginId === 'youtube-player'
  const hasCurrent = track?.hasCurrent ?? false

  return (
    <span className="flex items-center gap-0.5">
      {/* YouTube icon — toggles PiP */}
      <button
        onClick={togglePip}
        className={`flex items-center gap-1 cursor-pointer transition-colors rounded px-1 py-0.5 ${
          isActive
            ? 'text-[#FF0000] bg-[color-mix(in_srgb,#FF0000_10%,transparent)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
        }`}
        title={track?.playing ? `YouTube: ${track.label || 'Playing'}` : 'Open YouTube'}
      >
        <Icon
          icon="mdi:youtube"
          width={11}
          height={11}
          className={track?.playing ? 'text-[#FF0000]' : ''}
        />
        {track?.playing ? (
          <span className="truncate text-[10px] max-w-[80px]">{track.label || 'Playing'}</span>
        ) : (
          <span className="text-[10px]">YouTube</span>
        )}
      </button>

      {/* Inline controls — only when something is loaded */}
      {hasCurrent && (
        <>
          <button
            onClick={() => dispatchYouTubeCommand('toggle-play')}
            className="flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            title={track?.playing ? 'Pause' : 'Play'}
          >
            <Icon icon={track?.playing ? 'lucide:pause' : 'lucide:play'} width={9} height={9} />
          </button>
          <button
            onClick={() => dispatchYouTubeCommand('next-video')}
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
