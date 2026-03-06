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
    visibleViews: ['editor', 'preview', 'git', 'workshop'],
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
      gitPanel: true,
    },
  },
  chat: {
    id: 'chat',
    label: 'Chat',
    description: 'Chat-first mode with optional editor and git views',
    visibleViews: ['chat', 'editor', 'git', 'workshop'],
    defaultView: 'chat',
    hideTabs: true,
    accent: '#60a5fa',
    panelDefaults: {
      sidebar: true,
      tree: false,
      chat: false,
      terminal: false,
      plugins: false,
      engine: false,
      gitPanel: true,
    },
  },
  tui: {
    id: 'tui',
    label: 'TUI',
    description: 'Terminal-first — editor available on demand',
    visibleViews: ['editor', 'git', 'workshop'],
    defaultView: 'editor',
    terminalCenter: true,
    hideTabs: true,
    accent: '#4ade80',
    panelDefaults: {
      sidebar: false,
      tree: false,
      chat: false,
      terminal: false,
      plugins: true,
      engine: false,
      gitPanel: false,
    },
  },
}

export const APP_MODES = Object.keys(MODE_REGISTRY) as AppMode[]
