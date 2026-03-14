'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getAgentConfig } from '@/lib/agent-session'
import { useRepo } from '@/context/repo-context'

export interface WorkspaceFilters {
  labels: string[]
  authors: string[]
  assignees: string[]
}

export interface WorkspaceSettings {
  repo: string
  brain: string
  filters: WorkspaceFilters
}

interface WorkspaceSettingsContextValue {
  settings: WorkspaceSettings
  updateSettings: (patch: Partial<WorkspaceSettings>) => void
  updateFilters: (patch: Partial<WorkspaceFilters>) => void
  resetSettings: () => void
  effectiveRepo: string
  effectiveBrain: string
}

const STORAGE_KEY = 'code-editor:workspace-settings'

const DEFAULT_SETTINGS: WorkspaceSettings = {
  repo: '',
  brain: '',
  filters: {
    labels: [],
    authors: [],
    assignees: [],
  },
}

const WorkspaceSettingsContext = createContext<WorkspaceSettingsContextValue | null>(null)

function sanitizeList(values?: string[]) {
  if (!Array.isArray(values)) return []
  return values.map((value) => value.trim()).filter(Boolean)
}

function sanitizeSettings(value: Partial<WorkspaceSettings> | null | undefined): WorkspaceSettings {
  return {
    repo: value?.repo?.trim() ?? '',
    brain: value?.brain?.trim() ?? '',
    filters: {
      labels: sanitizeList(value?.filters?.labels),
      authors: sanitizeList(value?.filters?.authors),
      assignees: sanitizeList(value?.filters?.assignees),
    },
  }
}

function loadSettings(): WorkspaceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function WorkspaceSettingsProvider({ children }: { children: ReactNode }) {
  const { repo } = useRepo()
  const [settings, setSettings] = useState<WorkspaceSettings>(loadSettings)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {}
  }, [settings])

  const updateSettings = useCallback((patch: Partial<WorkspaceSettings>) => {
    setSettings((current) =>
      sanitizeSettings({
        ...current,
        ...patch,
        filters: {
          ...current.filters,
          ...patch.filters,
        },
      }),
    )
  }, [])

  const updateFilters = useCallback((patch: Partial<WorkspaceFilters>) => {
    setSettings((current) =>
      sanitizeSettings({
        ...current,
        filters: {
          ...current.filters,
          ...patch,
        },
      }),
    )
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  const effectiveRepo = settings.repo || repo?.fullName || ''
  const effectiveBrain = settings.brain || getAgentConfig()?.modelPreference || 'Balanced'

  const value = useMemo<WorkspaceSettingsContextValue>(
    () => ({
      settings,
      updateSettings,
      updateFilters,
      resetSettings,
      effectiveRepo,
      effectiveBrain,
    }),
    [settings, updateSettings, updateFilters, resetSettings, effectiveRepo, effectiveBrain],
  )

  return (
    <WorkspaceSettingsContext.Provider value={value}>{children}</WorkspaceSettingsContext.Provider>
  )
}

export function useWorkspaceSettings() {
  const context = useContext(WorkspaceSettingsContext)
  if (!context)
    throw new Error('useWorkspaceSettings must be used within WorkspaceSettingsProvider')
  return context
}
