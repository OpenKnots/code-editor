'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MobileConnect } from './mobile-connect'
import { SessionPresence } from './session-presence'
import { CaffeinateToggle } from './caffeinate-toggle'
import { KnotLogo } from './knot-logo'
import { useGateway } from '@/context/gateway-context'
import { useGitHubAuth } from '@/context/github-auth-context'
import {
  fetchAuthenticatedUser,
  startDeviceFlow,
  pollDeviceFlow,
  fetchUserRepos,
  type GitHubUser,
  type Repo,
} from '@/lib/github-api'
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  isFavorite,
  getRecents,
  addRecent,
  type SavedRepo,
} from '@/lib/github-repos-store'
import { THEME_PRESETS, useTheme, type ThemeMode, type ThemePreset } from '@/context/theme-context'
import {
  getAgentConfig,
  saveAgentConfig,
  APPROVAL_TIERS,
  type ApprovalTier,
} from '@/lib/agent-session'
type SettingsTab = 'connect' | 'general'

const APPEARANCE_MODES: Array<{ id: ThemeMode; label: string; icon: string }> = [
  { id: 'dark', label: 'Dark', icon: 'lucide:moon-star' },
  { id: 'light', label: 'Light', icon: 'lucide:sun-medium' },
  { id: 'system', label: 'System', icon: 'lucide:laptop-minimal' },
]

const THEME_GROUP_LABELS: Record<ThemePreset['group'], string> = {
  core: 'Core',
  tweakcn: 'Extras',
}

function groupThemes() {
  return (Object.keys(THEME_GROUP_LABELS) as Array<ThemePreset['group']>).map((group) => ({
    group,
    label: THEME_GROUP_LABELS[group],
    themes: THEME_PRESETS.filter((preset) => preset.group === group),
  }))
}

/**
 * Settings Panel — Gateway connection, mobile connect, device presence, and preferences.
 * Slides in from the right as a side panel overlay.
 */
export function SettingsPanel({
  open = true,
  onClose,
  initialTab,
}: {
  open?: boolean
  onClose: () => void
  initialTab?: string
}) {
  const [tab, setTab] = useState<SettingsTab>((initialTab as SettingsTab) || 'connect')
  const { status, gatewayUrl } = useGateway()
  const { themeId, setThemeId, mode, setMode } = useTheme()
  const { token: ghToken, authenticated: ghAuth, setManualToken, clearToken } = useGitHubAuth()
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null)
  const [patInput, setPatInput] = useState('')
  const [showPatField, setShowPatField] = useState(false)
  const [deviceFlow, setDeviceFlow] = useState<{
    userCode: string
    verificationUri: string
  } | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const deviceFlowAbort = useRef<AbortController | null>(null)
  const [favorites, setFavorites] = useState<SavedRepo[]>([])
  const [recents, setRecents] = useState<SavedRepo[]>([])
  const [userRepos, setUserRepos] = useState<Repo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [showGatewayUrl, setShowGatewayUrl] = useState(false)
  const [connectExpanded, setConnectExpanded] = useState(false)
  const [approvalTier, setApprovalTierState] = useState<ApprovalTier>(() => {
    try {
      return getAgentConfig()?.approvalTier ?? 'ask-all'
    } catch {
      return 'ask-all'
    }
  })

  const updateApprovalTier = useCallback((tier: ApprovalTier) => {
    setApprovalTierState(tier)
    try {
      const cfg = getAgentConfig() ?? {
        persona: '',
        systemPrompt: '',
        behaviors: {},
        modelPreference: '',
      }
      saveAgentConfig({ ...cfg, approvalTier: tier })
    } catch {}
  }, [])

  // Fetch GitHub user on token change
  const ghTokenRef = useRef(ghToken)
  if (ghTokenRef.current !== ghToken) {
    ghTokenRef.current = ghToken
    if (ghToken) {
      fetchAuthenticatedUser().then((u) => setGhUser(u))
      setLoadingRepos(true)
      fetchUserRepos()
        .then((r) => {
          setUserRepos(r)
          setLoadingRepos(false)
        })
        .catch(() => setLoadingRepos(false))
    } else {
      setGhUser(null)
      setUserRepos([])
    }
  }

  // Load favorites + recents on mount
  const loadedRef = useRef(false)
  if (!loadedRef.current) {
    loadedRef.current = true
    setFavorites(getFavorites())
    setRecents(getRecents())
  }

  const startGitHubSignIn = useCallback(async () => {
    setAuthLoading(true)
    setAuthError(null)
    try {
      const flow = await startDeviceFlow()
      setDeviceFlow({ userCode: flow.user_code, verificationUri: flow.verification_uri })
      deviceFlowAbort.current = new AbortController()
      const token = await pollDeviceFlow(
        flow.device_code,
        flow.interval,
        deviceFlowAbort.current.signal,
      )
      setManualToken(token)
      setDeviceFlow(null)
    } catch (err) {
      if ((err as Error).message !== 'Cancelled') {
        setAuthError(err instanceof Error ? err.message : 'Sign-in failed')
      }
      setDeviceFlow(null)
    } finally {
      setAuthLoading(false)
    }
  }, [setManualToken])

  const toggleFavorite = useCallback((repo: Repo | SavedRepo) => {
    const fn =
      'fullName' in repo ? repo.fullName : 'full_name' in repo ? (repo as Repo).full_name : ''
    const saved: SavedRepo = {
      fullName: fn,
      name: 'name' in repo ? repo.name : (fn.split('/').pop() ?? ''),
      owner:
        'owner' in repo && typeof repo.owner === 'object'
          ? (repo.owner as { login: string }).login
          : (fn.split('/')[0] ?? ''),
      defaultBranch:
        'defaultBranch' in repo
          ? (repo as SavedRepo).defaultBranch
          : 'default_branch' in repo
            ? (repo as Repo).default_branch
            : 'main',
      addedAt: Date.now(),
    }
    if (isFavorite(fn)) {
      setFavorites(removeFavorite(fn))
    } else {
      setFavorites(addFavorite(saved))
    }
  }, [])

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return userRepos.slice(0, 20)
    const q = repoSearch.toLowerCase()
    return userRepos.filter((r) => r.full_name.toLowerCase().includes(q)).slice(0, 20)
  }, [userRepos, repoSearch])

  const themeGroups = useMemo(() => groupThemes(), [])
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const [dragOffset, setDragOffset] = useState(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0) setDragOffset(dy)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (dragOffset > 120) {
      onClose()
    }
    setDragOffset(0)
  }, [dragOffset, onClose])

  if (!open) return null

  const sheetContent = (
    <>
      {isMobile && (
        <div
          className="flex justify-center py-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-[var(--text-disabled)] opacity-40" />
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Settings</h2>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            Tune the shell, sync, and system behavior.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[var(--text-disabled)] transition hover:border-[var(--border)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:text-[var(--text-primary)]"
        >
          <Icon icon="lucide:x" width={18} />
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[1000]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={onClose}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: dragOffset > 0 ? dragOffset : 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl border-t border-[var(--border)] bg-[var(--sidebar-bg)] shadow-[var(--shadow-2xl)]"
              style={{
                maxHeight: '80vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
                overscrollBehavior: 'contain',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {sheetContent}

              <div className="border-b border-[var(--border)] px-4 py-3">
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
                  {[
                    { id: 'connect' as SettingsTab, label: 'Connect', icon: 'lucide:smartphone' },
                    {
                      id: 'general' as SettingsTab,
                      label: 'General',
                      icon: 'lucide:sliders-horizontal',
                    },
                  ].map((item) => {
                    const active = tab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon icon={item.icon} width={14} />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:py-5">
                {tab === 'connect' && (
                  <div className="space-y-5">
                    {/* Collapsed connect summary */}
                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <button
                        onClick={() => setConnectExpanded((v) => !v)}
                        className="w-full flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                            <Icon icon="lucide:activity" width={14} />
                          </span>
                          <div className="text-left">
                            <h3 className="text-sm font-medium text-[var(--text-primary)]">
                              Gateway
                            </h3>
                            <p className="text-[11px] text-[var(--text-secondary)]">
                              {status === 'connected'
                                ? 'Connected'
                                : status === 'connecting'
                                  ? 'Connecting…'
                                  : 'Disconnected'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-[var(--success)]' : status === 'connecting' ? 'bg-[var(--warning)]' : 'bg-[var(--text-disabled)]'}`}
                          />
                          <Icon
                            icon={connectExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                            width={14}
                            className="text-[var(--text-disabled)]"
                          />
                        </div>
                      </button>

                      {connectExpanded && (
                        <div className="mt-4 space-y-4">
                          <div className="space-y-3 text-xs">
                            {gatewayUrl && (
                              <div className="flex items-start justify-between gap-3">
                                <span className="pt-0.5 text-[var(--text-secondary)]">URL</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setShowGatewayUrl((v) => !v)
                                  }}
                                  className="max-w-[220px] truncate rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-primary)] cursor-pointer hover:border-[var(--text-disabled)] transition-colors"
                                >
                                  {showGatewayUrl ? gatewayUrl : '••••••••'}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="border-t border-[var(--border)] pt-4">
                            <MobileConnect />
                          </div>
                        </div>
                      )}
                    </section>

                    <SessionPresence />
                  </div>
                )}

                {tab === 'general' && (
                  <div className="space-y-5">
                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                          <Icon icon="lucide:sparkles" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">
                            Appearance
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Switch themes and shell tone instantly.
                          </p>
                        </div>
                      </div>

                      <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {APPEARANCE_MODES.map((appearanceMode) => {
                            const active = mode === appearanceMode.id
                            return (
                              <button
                                key={appearanceMode.id}
                                type="button"
                                onClick={() => setMode(appearanceMode.id)}
                                className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition ${
                                  active
                                    ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                                    : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                <Icon icon={appearanceMode.icon} width={14} />
                                {appearanceMode.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {themeGroups.map(({ group, label, themes }) => (
                          <div key={group} className="space-y-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                              {label}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              {themes.map((preset) => {
                                const active = themeId === preset.id
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setThemeId(preset.id)}
                                    className={`group relative overflow-hidden rounded-xl border px-3 py-3 text-left transition ${
                                      active
                                        ? 'border-[var(--brand)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]'
                                        : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]'
                                    }`}
                                  >
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                      <span
                                        className="h-9 w-9 rounded-[14px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                                        style={{ backgroundColor: preset.color }}
                                      />
                                      {active ? (
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]">
                                          <Icon icon="lucide:check" width={14} />
                                        </span>
                                      ) : (
                                        <Icon
                                          icon="lucide:chevron-right"
                                          width={14}
                                          className="text-[var(--text-disabled)] transition group-hover:translate-x-0.5"
                                        />
                                      )}
                                    </div>
                                    <div className="text-sm font-medium text-[var(--text-primary)]">
                                      {preset.label}
                                    </div>
                                    <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                      {preset.id === 'supreme'
                                        ? 'Metallic accents and luxury shell chrome.'
                                        : preset.group === 'core'
                                          ? 'Native palette tuned for the editor shell.'
                                          : 'Imported palette with custom texture and tone.'}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                          <Icon icon="lucide:cpu" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">System</h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Device-level behavior and power settings.
                          </p>
                        </div>
                      </div>
                      <CaffeinateToggle />
                    </section>

                    {/* Agent Autonomy */}
                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                          <Icon icon="lucide:shield-check" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">
                            Agent Autonomy
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Control what the agent can do without asking.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {APPROVAL_TIERS.map((tier) => (
                          <button
                            key={tier.id}
                            onClick={() => updateApprovalTier(tier.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              approvalTier === tier.id
                                ? 'border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                                : 'border-transparent hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                approvalTier === tier.id
                                  ? 'border-[var(--brand)]'
                                  : 'border-[var(--text-disabled)]'
                              }`}
                            >
                              {approvalTier === tier.id && (
                                <div className="w-2 h-2 rounded-full bg-[var(--brand)]" />
                              )}
                            </div>
                            <div>
                              <p
                                className={`text-[12px] font-medium ${approvalTier === tier.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                              >
                                {tier.label}
                              </p>
                              <p className="text-[10px] text-[var(--text-disabled)]">
                                {tier.description}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* GitHub Account */}
                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                          <Icon icon="lucide:github" width={14} />
                        </span>
                        <div>
                          <h3 className="text-sm font-medium text-[var(--text-primary)]">GitHub</h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            {ghAuth
                              ? 'Manage your account and repositories.'
                              : 'Sign in to browse and favorite repos.'}
                          </p>
                        </div>
                      </div>

                      {/* Signed in — profile */}
                      {ghAuth && ghUser && (
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border)]">
                          <div className="flex items-center gap-2.5">
                            {ghUser.avatar_url && (
                              <img
                                src={ghUser.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full border border-[var(--border)]"
                              />
                            )}
                            <div>
                              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                                {ghUser.name ?? ghUser.login}
                              </p>
                              <p className="text-[11px] text-[var(--text-secondary)]">
                                @{ghUser.login}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              clearToken()
                              setGhUser(null)
                              setUserRepos([])
                            }}
                            className="text-[11px] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer"
                          >
                            Sign out
                          </button>
                        </div>
                      )}

                      {/* Not signed in — auth options */}
                      {!ghAuth && !deviceFlow && (
                        <div className="space-y-3">
                          {/* Device Flow */}
                          <button
                            onClick={startGitHubSignIn}
                            disabled={authLoading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition hover:border-[var(--text-disabled)] cursor-pointer disabled:opacity-50"
                          >
                            <Icon icon="lucide:github" width={16} />
                            {authLoading ? 'Signing in…' : 'Sign in with GitHub'}
                          </button>

                          {/* PAT */}
                          {!showPatField ? (
                            <button
                              onClick={() => setShowPatField(true)}
                              className="w-full text-center text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
                            >
                              or use a personal access token
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 relative">
                                  <Icon
                                    icon="lucide:key-round"
                                    width={13}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                                  />
                                  <input
                                    type="password"
                                    value={patInput}
                                    onChange={(e) => setPatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && patInput.trim()) {
                                        setManualToken(patInput.trim())
                                        setPatInput('')
                                        setShowPatField(false)
                                      }
                                      if (e.key === 'Escape') {
                                        setShowPatField(false)
                                        setPatInput('')
                                      }
                                    }}
                                    placeholder="ghp_xxxx..."
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    if (patInput.trim()) {
                                      setManualToken(patInput.trim())
                                      setPatInput('')
                                      setShowPatField(false)
                                    }
                                  }}
                                  disabled={!patInput.trim()}
                                  className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-medium cursor-pointer disabled:opacity-40 bg-[var(--brand)] text-[var(--brand-contrast,#fff)]"
                                >
                                  Save
                                </button>
                              </div>
                              <p className="text-[10px] text-[var(--text-disabled)]">
                                Create at{' '}
                                <a
                                  href="https://github.com/settings/tokens"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--brand)] underline"
                                >
                                  github.com/settings/tokens
                                </a>{' '}
                                with <span className="font-mono">repo</span> scope.
                              </p>
                            </div>
                          )}
                          {authError && (
                            <p className="text-[11px] text-[var(--color-deletions)]">{authError}</p>
                          )}
                        </div>
                      )}

                      {/* Device flow code */}
                      {deviceFlow && (
                        <div className="text-center space-y-2 py-2">
                          <p className="text-[11px] text-[var(--text-disabled)]">
                            Enter this code at{' '}
                            <a
                              href={deviceFlow.verificationUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--brand)] underline"
                            >
                              github.com/login/device
                            </a>
                          </p>
                          <p className="text-[22px] font-mono font-bold tracking-[0.15em] text-[var(--text-primary)]">
                            {deviceFlow.userCode}
                          </p>
                          <button
                            onClick={() => {
                              deviceFlowAbort.current?.abort()
                              setDeviceFlow(null)
                              setAuthLoading(false)
                            }}
                            className="text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Favorites */}
                      {ghAuth && favorites.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] font-medium mb-2">
                            Favorites
                          </p>
                          <div className="space-y-1">
                            {favorites.map((r) => (
                              <div
                                key={r.fullName}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] group"
                              >
                                <Icon
                                  icon="lucide:star"
                                  width={12}
                                  className="text-amber-400 shrink-0"
                                />
                                <span className="text-[12px] text-[var(--text-primary)] flex-1 truncate">
                                  {r.fullName}
                                </span>
                                <button
                                  onClick={() => toggleFavorite(r)}
                                  className="opacity-0 group-hover:opacity-100 text-[var(--text-disabled)] hover:text-[var(--color-deletions)] cursor-pointer"
                                  title="Remove"
                                >
                                  <Icon icon="lucide:x" width={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Your repos */}
                      {ghAuth && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-disabled)] font-medium mb-2">
                            Your Repositories
                          </p>
                          <div className="relative mb-2">
                            <Icon
                              icon="lucide:search"
                              width={13}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]"
                            />
                            <input
                              type="text"
                              value={repoSearch}
                              onChange={(e) => setRepoSearch(e.target.value)}
                              placeholder="Search repos…"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)] transition-colors"
                            />
                          </div>
                          {loadingRepos ? (
                            <p className="text-[11px] text-[var(--text-disabled)] py-2 text-center">
                              Loading repos…
                            </p>
                          ) : (
                            <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
                              {filteredRepos.map((r) => {
                                const fav = isFavorite(r.full_name)
                                return (
                                  <div
                                    key={r.full_name}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] group"
                                  >
                                    <button
                                      onClick={() => toggleFavorite(r)}
                                      className="shrink-0 cursor-pointer"
                                      title={fav ? 'Unfavorite' : 'Favorite'}
                                    >
                                      <Icon
                                        icon={fav ? 'lucide:star' : 'lucide:star'}
                                        width={13}
                                        className={
                                          fav
                                            ? 'text-amber-400'
                                            : 'text-[var(--text-disabled)] opacity-40 group-hover:opacity-100'
                                        }
                                      />
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] text-[var(--text-primary)] truncate">
                                        {r.full_name}
                                      </p>
                                      <p className="text-[10px] text-[var(--text-disabled)]">
                                        {r.private ? '🔒 Private' : '🌐 Public'} ·{' '}
                                        {r.default_branch}
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 text-[var(--brand)]">
                          <KnotLogo size={28} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
                              KnotCode
                            </span>
                            <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--brand)]">
                              v1.6.0
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">
                            AI-native editor by OpenKnot
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <a
                            href="https://github.com/OpenKnots/code-editor"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-disabled)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                            title="Source on GitHub"
                            aria-label="Source on GitHub"
                          >
                            <Icon icon="lucide:github" width={13} />
                          </a>
                          <a
                            href="https://github.com/OpenKnots/code-editor/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-disabled)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                            title="Report a bug"
                            aria-label="Report a bug"
                          >
                            <Icon icon="lucide:bug" width={13} />
                          </a>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-[color-mix(in_srgb,var(--overlay)_76%,transparent)] backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 left-auto flex w-[400px] max-w-[92vw] flex-col border-l border-[var(--border)] bg-[var(--sidebar-bg)] shadow-[var(--shadow-2xl)]"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {sheetContent}

        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
            {[
              { id: 'connect' as SettingsTab, label: 'Connect', icon: 'lucide:smartphone' },
              { id: 'general' as SettingsTab, label: 'General', icon: 'lucide:sliders-horizontal' },
            ].map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon icon={item.icon} width={14} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {tab === 'connect' && (
            <div className="space-y-5">
              <MobileConnect />
              <SessionPresence />

              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                    <Icon icon="lucide:activity" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Gateway</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Connection state for the local app bridge.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--text-secondary)]">Status</span>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium ${
                        status === 'connected'
                          ? 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]'
                          : status === 'connecting'
                            ? 'bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]'
                            : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {status === 'connected'
                        ? 'Connected'
                        : status === 'connecting'
                          ? 'Connecting'
                          : 'Disconnected'}
                    </span>
                  </div>

                  {gatewayUrl && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="pt-0.5 text-[var(--text-secondary)]">Gateway</span>
                      <button
                        onClick={() => setShowGatewayUrl((v) => !v)}
                        className="max-w-[220px] truncate rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-primary)] cursor-pointer hover:border-[var(--text-disabled)] transition-colors"
                      >
                        {showGatewayUrl ? gatewayUrl : '••••••••'}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === 'general' && (
            <div className="space-y-5">
              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                    <Icon icon="lucide:sparkles" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">Appearance</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Switch themes and shell tone instantly.
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    {APPEARANCE_MODES.map((appearanceMode) => {
                      const active = mode === appearanceMode.id
                      return (
                        <button
                          key={appearanceMode.id}
                          type="button"
                          onClick={() => setMode(appearanceMode.id)}
                          className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition ${
                            active
                              ? 'border border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                              : 'border border-transparent text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Icon icon={appearanceMode.icon} width={14} />
                          {appearanceMode.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  {themeGroups.map(({ group, label, themes }) => (
                    <div key={group} className="space-y-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-disabled)]">
                        {label}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {themes.map((preset) => {
                          const active = themeId === preset.id
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setThemeId(preset.id)}
                              className={`group relative overflow-hidden rounded-xl border px-3 py-3 text-left transition ${
                                active
                                  ? 'border-[var(--brand)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]'
                                  : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]'
                              }`}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <span
                                  className="h-9 w-9 rounded-[14px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                                  style={{ backgroundColor: preset.color }}
                                />
                                {active ? (
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]">
                                    <Icon icon="lucide:check" width={14} />
                                  </span>
                                ) : (
                                  <Icon
                                    icon="lucide:chevron-right"
                                    width={14}
                                    className="text-[var(--text-disabled)] transition group-hover:translate-x-0.5"
                                  />
                                )}
                              </div>
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {preset.label}
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                                {preset.id === 'supreme'
                                  ? 'Metallic accents and luxury shell chrome.'
                                  : preset.group === 'core'
                                    ? 'Native palette tuned for the editor shell.'
                                    : 'Imported palette with custom texture and tone.'}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--brand)]">
                    <Icon icon="lucide:cpu" width={14} />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">System</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Device-level behavior and power settings.
                    </p>
                  </div>
                </div>
                <CaffeinateToggle />
              </section>

              <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 text-[var(--brand)]">
                    <KnotLogo size={28} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
                        KnotCode
                      </span>
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--brand)]">
                        v1.6.0
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-tertiary)]">
                      AI-native editor by OpenKnot
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href="https://github.com/OpenKnots/code-editor"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-disabled)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                      title="Source on GitHub"
                      aria-label="Source on GitHub"
                    >
                      <Icon icon="lucide:github" width={13} />
                    </a>
                    <a
                      href="https://github.com/OpenKnots/code-editor/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-disabled)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                      title="Report a bug"
                      aria-label="Report a bug"
                    >
                      <Icon icon="lucide:bug" width={13} />
                    </a>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
