'use client'

import { useEffect } from 'react'
import { usePlugins } from '@/context/plugin-context'
import { SpotifyPlayer } from './spotify-player'
import { SpotifyStatusBar } from './spotify-status-bar'

export function SpotifyPlugin() {
  const { registerPlugin, unregisterPlugin } = usePlugins()

  useEffect(() => {
    registerPlugin('sidebar', {
      id: 'spotify-player',
      component: SpotifyPlayer,
      order: 10,
    })

    registerPlugin('status-bar-right', {
      id: 'spotify-status-bar',
      component: SpotifyStatusBar,
      order: 10,
    })

    return () => {
      unregisterPlugin('spotify-player')
      unregisterPlugin('spotify-status-bar')
    }
  }, [registerPlugin, unregisterPlugin])

  return null
}
