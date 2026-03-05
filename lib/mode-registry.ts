import type { ViewId } from '@/context/view-context'
import type { PanelId } from '@/context/layout-context'

export type AppMode = 'classic' | 'chat' | 'tui'

export interface ModeSpec {
  id: AppMode
  label: string
  description: string
  visibleViews: ViewId[]
  defaultView: ViewId
  panelDefaults: Partial<Record<PanelId, boolean>>
  /** Terminal fills center (no editor views unless toggled) */
  terminalCenter?: boolean
  /** Auto-expand editor when file opens */
  autoExpandEditor?: boolean
  /** Hide tab strip entirely */
  hideTabs?: boolean
  /** Mode accent color (CSS color value) */
  accent: string
}

export const MODE_REGISTRY: Record<AppMode, ModeSpec> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Traditional editor — no chat, files open',
    visibleViews: ['editor', 'preview', 'git', 'prs'],
    defaultView: 'editor',
    autoExpandEditor: true,
    accent: '#a78bfa',
    panelDefaults: {
      sidebar: false,
      tree: true,
      chat: false,
      terminal: false,
      plugins: true,
      engine: false,
    },
  },
  chat: {
    id: 'chat',
    label: 'Chat',
    description: 'Agent-first mode with minimal editor chrome',
    visibleViews: ['editor', 'preview'],
    defaultView: 'editor',
    accent: '#60a5fa',
    panelDefaults: {
      sidebar: true,
      tree: false,
      chat: true,
      terminal: false,
      plugins: true,
      engine: false,
    },
  },
  tui: {
    id: 'tui',
    label: 'TUI',
    description: 'Terminal-first — editor available on demand',
    visibleViews: ['editor', 'git'],
    defaultView: 'editor',
    terminalCenter: true,
    hideTabs: true,
    accent: '#4ade80',
    panelDefaults: {
      sidebar: false,
      tree: false,
      chat: false,
      terminal: true,
      plugins: true,
      engine: false,
    },
  },
}

export const APP_MODES = Object.keys(MODE_REGISTRY) as AppMode[]
