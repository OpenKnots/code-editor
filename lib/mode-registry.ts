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
    label: 'Code',
    description: 'Editor-first workspace with files front and center',
    visibleViews: ['editor', 'preview', 'git', 'skills', 'prompts'],
    defaultView: 'editor',
    autoExpandEditor: true,
    accent: '#d2a34f',
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
    description: 'Conversation-first workspace with the editor nearby',
    visibleViews: ['chat', 'editor', 'git', 'skills', 'prompts'],
    defaultView: 'chat',
    hideTabs: true,
    accent: '#86b5ff',
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
    label: 'Terminal',
    description: 'Terminal-first workspace with the editor available on demand',
    visibleViews: ['chat', 'editor', 'git', 'skills', 'prompts'],
    defaultView: 'editor',
    terminalCenter: true,
    hideTabs: true,
    accent: '#36c48c',
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
