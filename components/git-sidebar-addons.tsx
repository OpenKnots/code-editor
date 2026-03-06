'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useLayout } from '@/context/layout-context'
import { usePlugins } from '@/context/plugin-context'

const PLUGIN_META: Record<string, { label: string; icon: string; color: string; hint: string }> = {
  'spotify-player': {
    label: 'Spotify',
    icon: 'simple-icons:spotify',
    color: '#1DB954',
    hint: 'Queue tracks and keep the volume close by.',
  },
  'youtube-player': {
    label: 'YouTube',
    icon: 'mdi:youtube',
    color: '#FF0000',
    hint: 'Jump playlists or videos without leaving source control.',
  },
}

const SECTION_COLLAPSED_KEY = 'ce:git-addons-collapsed'
const MINIMIZED_KEY = 'ce:git-addons-minimized'

type MinimizedState = Record<string, boolean>

interface SpotifyBridgeState {
  authenticated?: boolean
  deviceId?: string | null
  paused?: boolean
  muted?: boolean
  volume?: number
  track_window?: {
    current_track?: {
      name?: string
      artists?: Array<{ name: string }>
    }
  } | null
}

interface YouTubeBridgeState {
  playing?: boolean
  muted?: boolean
  volume?: number
  current?: {
    id: string
    label: string
    type: 'playlist' | 'video'
  } | null
}

function dispatchPluginCommand<T>(eventName: string, detail: T) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

function CardShell({
  children,
  accentColor,
  dimmed = false,
}: {
  children: React.ReactNode
  accentColor: string
  dimmed?: boolean
}) {
  return (
    <article
      className={`shrink-0 snap-start overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] ${
        dimmed
          ? 'border-[var(--border)] opacity-80'
          : 'border-[color-mix(in_srgb,var(--border)_65%,transparent)]'
      }`}
      style={{
        width: 296,
        boxShadow: dimmed
          ? undefined
          : `inset 0 1px 0 color-mix(in_srgb, ${accentColor} 16%, transparent), var(--shadow-sm)`,
      }}
    >
      {children}
    </article>
  )
}

function CompactButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      title={label}
      aria-label={label}
    >
      <Icon icon={icon} width={14} height={14} />
    </button>
  )
}

function SpotifyCompactControls({ pipActive }: { pipActive: boolean }) {
  const [state, setState] = useState<SpotifyBridgeState>({
    authenticated: false,
    deviceId: null,
    paused: true,
    muted: false,
    volume: 0.5,
    track_window: null,
  })

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SpotifyBridgeState>).detail
      setState((current) => ({
        ...current,
        ...detail,
      }))
    }
    window.addEventListener('spotify-state-changed', handler)
    return () => window.removeEventListener('spotify-state-changed', handler)
  }, [])

  const track = state.track_window?.current_track
  const hasControls = Boolean(state.authenticated && state.deviceId)
  const volumePercent = Math.round((state.volume ?? 0.5) * 100)

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
            {track?.name ?? (state.authenticated ? 'Ready to play' : 'Connect Spotify')}
          </span>
          {pipActive ? (
            <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
              PiP
            </span>
          ) : null}
        </div>
        <p className="truncate text-[10px] text-[var(--text-tertiary)]">
          {track?.artists?.map((artist) => artist.name).join(', ') ??
            (state.authenticated
              ? 'Use quick controls or expand the full player.'
              : 'Enable the full card to sign in.')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <CompactButton
          icon="lucide:skip-back"
          label="Previous track"
          onClick={() => dispatchPluginCommand('spotify-command', { type: 'previous-track' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon={state.paused ? 'lucide:play' : 'lucide:pause'}
          label={state.paused ? 'Play' : 'Pause'}
          onClick={() => dispatchPluginCommand('spotify-command', { type: 'toggle-play' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon="lucide:skip-forward"
          label="Next track"
          onClick={() => dispatchPluginCommand('spotify-command', { type: 'next-track' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon={
            state.muted || volumePercent === 0
              ? 'lucide:volume-x'
              : volumePercent < 50
                ? 'lucide:volume-1'
                : 'lucide:volume-2'
          }
          label={state.muted || volumePercent === 0 ? 'Unmute' : 'Mute'}
          onClick={() => dispatchPluginCommand('spotify-command', { type: 'toggle-mute' })}
          disabled={!hasControls}
        />
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
          Vol
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={volumePercent}
          onChange={(event) =>
            dispatchPluginCommand('spotify-command', {
              type: 'set-volume',
              value: Number(event.target.value) / 100,
            })
          }
          disabled={!hasControls}
          className="h-1 flex-1 cursor-pointer accent-[#1DB954]"
          aria-label="Spotify volume"
        />
        <span className="w-8 text-right text-[9px] font-mono text-[var(--text-disabled)]">
          {volumePercent}%
        </span>
      </label>
    </div>
  )
}

function YouTubeCompactControls({ pipActive }: { pipActive: boolean }) {
  const [state, setState] = useState<YouTubeBridgeState>({
    playing: false,
    muted: false,
    volume: 70,
    current: null,
  })

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<YouTubeBridgeState>).detail
      setState((current) => ({
        ...current,
        ...detail,
      }))
    }
    window.addEventListener('youtube-state-changed', handler)
    return () => window.removeEventListener('youtube-state-changed', handler)
  }, [])

  const hasControls = Boolean(state.current)
  const volumePercent = Math.max(0, Math.min(100, Math.round(state.volume ?? 70)))

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
            {state.current?.label ?? 'Nothing loaded'}
          </span>
          {pipActive ? (
            <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
              PiP
            </span>
          ) : null}
        </div>
        <p className="truncate text-[10px] text-[var(--text-tertiary)]">
          {state.current
            ? `${state.current.type === 'playlist' ? 'Playlist' : 'Video'} ready for quick controls.`
            : 'Expand the card to paste a playlist or video link.'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <CompactButton
          icon={state.playing ? 'lucide:pause' : 'lucide:play'}
          label={state.playing ? 'Pause' : 'Play'}
          onClick={() => dispatchPluginCommand('youtube-command', { type: 'toggle-play' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon="lucide:skip-forward"
          label="Next video"
          onClick={() => dispatchPluginCommand('youtube-command', { type: 'next-video' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon={
            state.muted || volumePercent === 0
              ? 'lucide:volume-x'
              : volumePercent < 50
                ? 'lucide:volume-1'
                : 'lucide:volume-2'
          }
          label={state.muted || volumePercent === 0 ? 'Unmute' : 'Mute'}
          onClick={() => dispatchPluginCommand('youtube-command', { type: 'toggle-mute' })}
          disabled={!hasControls}
        />
        <CompactButton
          icon="lucide:replace"
          label="Load another video"
          onClick={() => dispatchPluginCommand('youtube-command', { type: 'show-input' })}
          disabled={!hasControls}
        />
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-disabled)]">
          Vol
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={volumePercent}
          onChange={(event) =>
            dispatchPluginCommand('youtube-command', {
              type: 'set-volume',
              value: Number(event.target.value),
            })
          }
          disabled={!hasControls}
          className="h-1 flex-1 cursor-pointer accent-[#FF0000]"
          aria-label="YouTube volume"
        />
        <span className="w-8 text-right text-[9px] font-mono text-[var(--text-disabled)]">
          {volumePercent}%
        </span>
      </label>
    </div>
  )
}

function PluginCompactState({ pluginId, pipActive }: { pluginId: string; pipActive: boolean }) {
  if (pluginId === 'spotify-player') return <SpotifyCompactControls pipActive={pipActive} />
  if (pluginId === 'youtube-player') return <YouTubeCompactControls pipActive={pipActive} />

  return (
    <div className="p-3 text-[10px] text-[var(--text-tertiary)]">
      Compact controls are not available for this add-on yet.
    </div>
  )
}

export function GitSidebarAddons() {
  const { slots, isPluginEnabled, togglePlugin, pipPluginId } = usePlugins()
  const layout = useLayout()
  const [collapsed, setCollapsed] = useState(false)
  const [minimized, setMinimized] = useState<MinimizedState>({})

  useEffect(() => {
    try {
      const storedCollapsed = localStorage.getItem(SECTION_COLLAPSED_KEY)
      const storedMinimized = localStorage.getItem(MINIMIZED_KEY)
      if (storedCollapsed === 'true') setCollapsed(true)
      if (storedMinimized) setMinimized(JSON.parse(storedMinimized) as MinimizedState)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SECTION_COLLAPSED_KEY, String(collapsed))
      localStorage.setItem(MINIMIZED_KEY, JSON.stringify(minimized))
    } catch {}
  }, [collapsed, minimized])

  const sortedEntries = useMemo(
    () => [...slots.sidebar].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [slots.sidebar],
  )

  if (!layout.isVisible('plugins') || sortedEntries.length === 0) return null

  return (
    <section className="shrink-0 border-t border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
            Add-ons
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
            Scroll through media tools without leaving the git panel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
          title={collapsed ? 'Expand add-ons' : 'Collapse add-ons'}
          aria-label={collapsed ? 'Expand add-ons' : 'Collapse add-ons'}
        >
          <Icon
            icon={collapsed ? 'lucide:chevron-down' : 'lucide:chevron-up'}
            width={14}
            height={14}
          />
        </button>
      </div>

      {collapsed ? (
        <div className="flex gap-2 overflow-x-auto px-3 pb-3">
          {sortedEntries.map((entry) => {
            const meta = PLUGIN_META[entry.id]
            const enabled = isPluginEnabled(entry.id)
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  if (!enabled) togglePlugin(entry.id)
                  setCollapsed(false)
                }}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-medium transition ${
                  enabled
                    ? 'border-[var(--border-hover)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-disabled)]'
                }`}
                title={
                  enabled ? `Open ${meta?.label ?? entry.id}` : `Enable ${meta?.label ?? entry.id}`
                }
              >
                <Icon
                  icon={meta?.icon ?? 'lucide:puzzle'}
                  width={12}
                  height={12}
                  style={{ color: enabled ? meta?.color : 'var(--text-disabled)' }}
                />
                <span>{meta?.label ?? entry.id}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto px-3 pb-3">
          <div className="flex min-w-max gap-3 pr-2">
            {sortedEntries.map((entry) => {
              const meta = PLUGIN_META[entry.id]
              const accentColor = meta?.color ?? 'var(--brand)'
              const label = meta?.label ?? entry.id
              const enabled = isPluginEnabled(entry.id)
              const isMinimized = minimized[entry.id] ?? false
              const pipActive = pipPluginId === entry.id
              const Comp = entry.component
              const shouldMountInline = enabled && !pipActive

              return (
                <CardShell key={entry.id} accentColor={accentColor} dimmed={!enabled}>
                  <div className="flex items-start gap-3 border-b border-[var(--border)] px-3 py-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                      style={{ color: accentColor }}
                    >
                      <Icon icon={meta?.icon ?? 'lucide:puzzle'} width={16} height={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
                          {label}
                        </h3>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide ${
                            enabled
                              ? 'bg-[color-mix(in_srgb,var(--color-additions)_12%,transparent)] text-[var(--color-additions)]'
                              : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)]'
                          }`}
                        >
                          {enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">
                        {enabled ? meta?.hint : `Enable ${label} to pin it beneath your changes.`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {enabled ? (
                        <button
                          type="button"
                          onClick={() =>
                            setMinimized((current) => ({
                              ...current,
                              [entry.id]: !isMinimized,
                            }))
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                          title={isMinimized ? `Expand ${label}` : `Minimize ${label}`}
                          aria-label={isMinimized ? `Expand ${label}` : `Minimize ${label}`}
                        >
                          <Icon
                            icon={isMinimized ? 'lucide:maximize-2' : 'lucide:minimize-2'}
                            width={14}
                            height={14}
                          />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => togglePlugin(entry.id)}
                        className={`inline-flex h-8 items-center justify-center rounded-xl border px-2.5 text-[10px] font-medium transition ${
                          enabled
                            ? 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]'
                            : 'border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_16%,transparent)]'
                        }`}
                        title={enabled ? `Disable ${label}` : `Enable ${label}`}
                      >
                        {enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>

                  {!enabled ? (
                    <div className="space-y-3 p-3">
                      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3">
                        <p className="text-[11px] font-medium text-[var(--text-primary)]">
                          Add this to the git rail
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">
                          Turn on {label} to keep playback controls available while you review or
                          commit.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(isMinimized || pipActive) && (
                        <PluginCompactState pluginId={entry.id} pipActive={pipActive} />
                      )}

                      {shouldMountInline ? (
                        <div
                          className={`transition-[height,opacity] duration-200 ${
                            isMinimized
                              ? 'h-0 overflow-hidden opacity-0 pointer-events-none'
                              : 'h-[360px]'
                          }`}
                          aria-hidden={isMinimized}
                        >
                          <Comp />
                        </div>
                      ) : pipActive ? (
                        <div className="px-3 pb-3">
                          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[10px] text-[var(--text-tertiary)]">
                            {label} is open in picture-in-picture. The quick controls above stay
                            active here.
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardShell>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
