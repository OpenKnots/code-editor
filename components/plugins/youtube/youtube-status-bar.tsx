'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { usePlugins } from '@/context/plugin-context'

interface TrackInfo {
  label: string
  playing: boolean
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
      })
    }
    window.addEventListener('youtube-state-changed', handler)
    return () => window.removeEventListener('youtube-state-changed', handler)
  }, [])

  const togglePip = useCallback(() => {
    setPipPluginId(pipPluginId === 'youtube-player' ? null : 'youtube-player')
  }, [setPipPluginId, pipPluginId])

  const isActive = pipPluginId === 'youtube-player'

  return (
    <button
      onClick={togglePip}
      className={`flex items-center gap-1 max-w-[120px] cursor-pointer transition-colors rounded px-1 py-0.5 ${
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
        <span className="truncate text-[10px]">{track.label || 'Playing'}</span>
      ) : (
        <span className="text-[10px]">YouTube</span>
      )}
    </button>
  )
}
