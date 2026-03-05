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
}

export const MODE_REGISTRY: Record<AppMode, ModeSpec> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Full editor workflow with panels',
    visibleViews: ['editor', 'preview', 'git', 'prs'],
    defaultView: 'editor',
    panelDefaults: {
      sidebar: true,
      tree: false,
      chat: true,
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
    description: 'Minimal terminal-first shell',
    visibleViews: ['editor', 'git'],
    defaultView: 'editor',
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
