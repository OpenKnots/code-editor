'use client'

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
} from 'react'
import { useView } from '@/context/view-context'

// ─── Panel Definitions ──────────────────────────────────
// Add a new panel here → it automatically gets toggle, resize, persistence, presets

export type PanelId = 'sidebar' | 'tree' | 'chat' | 'engine' | 'terminal' | 'plugins' | 'gitPanel'

export type PanelAxis = 'horizontal' | 'vertical'

export type Breakpoint = 'gt1200' | 'lte1200' | 'lte992' | 'lte768' | 'lte640'

export interface ViewportInfo {
  width: number
  height: number
  breakpoint: Breakpoint
}

export type FloatingPanelId = 'chat' | 'terminal'

export interface FloatingPanelState {
  floating: boolean
  x: number
  y: number
  w: number
  h: number
  z: number
}

function computeBreakpoint(width: number): Breakpoint {
  if (width <= 640) return 'lte640'
  if (width <= 768) return 'lte768'
  if (width <= 992) return 'lte992'
  if (width <= 1200) return 'lte1200'
  return 'gt1200'
}

function bpRank(bp: Breakpoint): number {
  switch (bp) {
    case 'gt1200':
      return 5
    case 'lte1200':
      return 4
    case 'lte992':
      return 3
    case 'lte768':
      return 2
    case 'lte640':
      return 1
  }
}

interface PanelDef {
  /** localStorage key suffix */
  key: string
  /** Default visibility */
  defaultVisible: boolean
  /** Default size (width or height depending on axis) */
  defaultSize: number
  /** Min size for resize clamping */
  minSize: number
  /** Max size for resize clamping */
  maxSize: number
  /** Resize axis */
  axis: PanelAxis
  /** Whether the panel can be resized */
  resizable: boolean
}

export const PANEL_DEFS: Record<PanelId, PanelDef> = {
  sidebar: {
    key: 'sidebar-collapsed',
    defaultVisible: true,
    defaultSize: 260,
    minSize: 200,
    maxSize: 420,
    axis: 'horizontal',
    resizable: true,
  },
  tree: {
    key: 'tree',
    defaultVisible: false,
    defaultSize: 220,
    minSize: 160,
    maxSize: 400,
    axis: 'horizontal',
    resizable: true,
  },
  chat: {
    key: 'chat',
    defaultVisible: true,
    defaultSize: 500,
    minSize: 320,
    maxSize: 720,
    axis: 'horizontal',
    resizable: true,
  },
  engine: {
    key: 'engine',
    defaultVisible: false,
    defaultSize: 240,
    minSize: 120,
    maxSize: 500,
    axis: 'vertical',
    resizable: true,
  },
  terminal: {
    key: 'terminal',
    defaultVisible: false,
    defaultSize: 240,
    minSize: 100,
    maxSize: 500,
    axis: 'vertical',
    resizable: true,
  },
  plugins: {
    key: 'plugins',
    defaultVisible: true,
    defaultSize: 220,
    minSize: 160,
    maxSize: 400,
    axis: 'horizontal',
    resizable: true,
  },
  gitPanel: {
    key: 'git-panel',
    defaultVisible: true,
    defaultSize: 300,
    minSize: 220,
    maxSize: 480,
    axis: 'horizontal',
    resizable: true,
  },
}

const PANEL_IDS = Object.keys(PANEL_DEFS) as PanelId[]

// ─── State Shape ────────────────────────────────────────

interface PanelState {
  visible: boolean
  size: number
}

export interface LayoutState {
  panels: Record<PanelId, PanelState>
  /** Editor area collapsed (no files open / intentionally collapsed) */
  editorCollapsed: boolean
  floating: Record<FloatingPanelId, FloatingPanelState>
}

// ─── Actions ────────────────────────────────────────────

type LayoutAction =
  | { type: 'TOGGLE'; panel: PanelId }
  | { type: 'SHOW'; panel: PanelId }
  | { type: 'HIDE'; panel: PanelId }
  | { type: 'SET_VISIBLE'; panel: PanelId; visible: boolean }
  | { type: 'RESIZE'; panel: PanelId; size: number }
  | { type: 'SET_EDITOR_COLLAPSED'; collapsed: boolean }
  | { type: 'SET_FLOATING'; panel: FloatingPanelId; floating: boolean }
  | { type: 'SET_FLOAT_BOUNDS'; panel: FloatingPanelId; x: number; y: number; w: number; h: number }
  | { type: 'BRING_FLOAT_FRONT'; panel: FloatingPanelId; z: number }
  | { type: 'PRESET'; preset: LayoutPreset }
  | { type: 'HYDRATE'; state: Partial<LayoutState> }
  | { type: 'BATCH'; actions: LayoutAction[] }

export type LayoutPreset = 'focus' | 'review' | 'build' | 'default'

// ─── Presets ────────────────────────────────────────────

const PRESETS: Record<
  LayoutPreset,
  Partial<Record<PanelId, boolean>> & { editorCollapsed?: boolean }
> = {
  focus: {
    tree: false,
    engine: false,
    chat: false,
    terminal: false,
    gitPanel: false,
    editorCollapsed: false,
  },
  review: {
    tree: true,
    engine: false,
    chat: true,
    terminal: false,
    gitPanel: true,
    editorCollapsed: false,
  },
  build: {
    tree: false,
    engine: true,
    chat: false,
    terminal: true,
    gitPanel: true,
    editorCollapsed: false,
  },
  default: {
    tree: false,
    engine: false,
    chat: true,
    terminal: false,
    gitPanel: true,
    editorCollapsed: false,
  },
}

// ─── Reducer ────────────────────────────────────────────

function clampSize(panel: PanelId, size: number): number {
  const def = PANEL_DEFS[panel]
  if (!def.resizable) return def.defaultSize
  return Math.max(def.minSize, Math.min(def.maxSize, size))
}

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'TOGGLE': {
      const panel = state.panels[action.panel]
      // Sidebar is inverted: "collapsed" = not visible
      return {
        ...state,
        panels: { ...state.panels, [action.panel]: { ...panel, visible: !panel.visible } },
      }
    }
    case 'SHOW':
      if (state.panels[action.panel].visible) return state
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: { ...state.panels[action.panel], visible: true },
        },
      }
    case 'HIDE':
      if (!state.panels[action.panel].visible) return state
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: { ...state.panels[action.panel], visible: false },
        },
      }
    case 'SET_VISIBLE':
      if (state.panels[action.panel].visible === action.visible) return state
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: { ...state.panels[action.panel], visible: action.visible },
        },
      }
    case 'RESIZE': {
      const clamped = clampSize(action.panel, action.size)
      if (state.panels[action.panel].size === clamped) return state
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: { ...state.panels[action.panel], size: clamped },
        },
      }
    }
    case 'SET_EDITOR_COLLAPSED':
      if (state.editorCollapsed === action.collapsed) return state
      return { ...state, editorCollapsed: action.collapsed }
    case 'SET_FLOATING': {
      const cur = state.floating[action.panel]
      if (cur.floating === action.floating) return state
      return {
        ...state,
        floating: { ...state.floating, [action.panel]: { ...cur, floating: action.floating } },
      }
    }
    case 'SET_FLOAT_BOUNDS': {
      const cur = state.floating[action.panel]
      return {
        ...state,
        floating: {
          ...state.floating,
          [action.panel]: { ...cur, x: action.x, y: action.y, w: action.w, h: action.h },
        },
      }
    }
    case 'BRING_FLOAT_FRONT': {
      const cur = state.floating[action.panel]
      if (cur.z === action.z) return state
      return { ...state, floating: { ...state.floating, [action.panel]: { ...cur, z: action.z } } }
    }
    case 'PRESET': {
      const preset = PRESETS[action.preset]
      const panels = { ...state.panels }
      for (const [id, vis] of Object.entries(preset)) {
        if (id === 'editorCollapsed') continue
        if (id in panels) {
          panels[id as PanelId] = { ...panels[id as PanelId], visible: vis as boolean }
        }
      }
      return {
        ...state,
        panels,
        editorCollapsed: preset.editorCollapsed ?? state.editorCollapsed,
      }
    }
    case 'HYDRATE': {
      if (!action.state.panels && !action.state.floating) return state
      const panels = { ...state.panels }
      if (action.state.panels) {
        for (const [id, ps] of Object.entries(action.state.panels)) {
          if (id in panels) {
            panels[id as PanelId] = { ...panels[id as PanelId], ...ps }
          }
        }
      }
      const floating = { ...state.floating }
      if (action.state.floating) {
        for (const [id, fs] of Object.entries(action.state.floating)) {
          if (id in floating) {
            floating[id as FloatingPanelId] = {
              ...floating[id as FloatingPanelId],
              ...(fs as Partial<FloatingPanelState>),
            }
          }
        }
      }
      return {
        ...state,
        panels,
        editorCollapsed: action.state.editorCollapsed ?? state.editorCollapsed,
        floating,
      }
    }
    case 'BATCH': {
      return action.actions.reduce(layoutReducer, state)
    }
    default:
      return state
  }
}

// ─── Initial State ──────────────────────────────────────

function buildInitialState(): LayoutState {
  const panels = {} as Record<PanelId, PanelState>
  for (const id of PANEL_IDS) {
    const def = PANEL_DEFS[id]
    panels[id] = { visible: def.defaultVisible, size: def.defaultSize }
  }
  return {
    panels,
    editorCollapsed: false,
    floating: {
      chat: { floating: false, x: 24, y: 72, w: 420, h: 560, z: 80 },
      terminal: { floating: false, x: 24, y: 120, w: 720, h: 360, z: 80 },
    },
  }
}

// ─── Persistence ────────────────────────────────────────

const STORAGE_PREFIX = 'ce:'

function hydrateFromStorage(): Partial<LayoutState> {
  const panels: Partial<Record<PanelId, Partial<PanelState>>> = {}

  for (const id of PANEL_IDS) {
    const def = PANEL_DEFS[id]
    try {
      if (id === 'sidebar') {
        const ps: Partial<PanelState> = {}
        const raw = localStorage.getItem('code-editor:sidebar-collapsed')
        if (raw !== null) ps.visible = raw !== 'true'
        // Migrate legacy sidebar width key
        const legacyW = localStorage.getItem('code-editor:sidebar-width')
        const sizeKey = `${STORAGE_PREFIX}${def.key}-w`
        const sizeRaw = localStorage.getItem(sizeKey) ?? legacyW
        if (sizeRaw !== null) {
          const n = parseInt(sizeRaw)
          if (!isNaN(n)) ps.size = clampSize(id, n)
        }
        if (Object.keys(ps).length > 0) panels[id] = ps
      } else {
        const visKey = `${STORAGE_PREFIX}${def.key}-visible`
        const sizeKey = `${STORAGE_PREFIX}${def.key}-w`
        const vis = localStorage.getItem(visKey)
        const size = localStorage.getItem(sizeKey)
        const ps: Partial<PanelState> = {}
        if (vis !== null) ps.visible = vis === 'true'
        if (size !== null) {
          const n = parseInt(size)
          if (!isNaN(n)) ps.size = clampSize(id, n)
        }
        if (Object.keys(ps).length > 0) panels[id] = ps
      }
    } catch {}
  }

  let editorCollapsed: boolean | undefined
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}editor-collapsed`)
    if (raw !== null) editorCollapsed = raw === 'true'
  } catch {}

  const floating: Partial<Record<FloatingPanelId, Partial<FloatingPanelState>>> = {}
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}floating-chat`)
    if (raw) floating.chat = JSON.parse(raw)
  } catch {}
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}floating-terminal`)
    if (raw) floating.terminal = JSON.parse(raw)
  } catch {}

  // Also check legacy keys
  try {
    const legacyTermVis = localStorage.getItem('code-editor:terminal-visible')
    if (legacyTermVis !== null && !panels.terminal)
      panels.terminal = { visible: legacyTermVis === 'true' }
  } catch {}
  try {
    const legacyTermH = localStorage.getItem('code-editor:terminal-height')
    if (legacyTermH !== null) {
      const n = parseInt(legacyTermH)
      if (!isNaN(n)) panels.terminal = { ...panels.terminal, size: clampSize('terminal', n) }
    }
  } catch {}

  return {
    panels: panels as Record<PanelId, PanelState>,
    editorCollapsed,
    floating: floating as Record<FloatingPanelId, FloatingPanelState>,
  }
}

function persistToStorage(state: LayoutState) {
  try {
    for (const id of PANEL_IDS) {
      const def = PANEL_DEFS[id]
      const ps = state.panels[id]
      if (id === 'sidebar') {
        localStorage.setItem('code-editor:sidebar-collapsed', String(!ps.visible))
        localStorage.setItem(`${STORAGE_PREFIX}${def.key}-w`, String(ps.size))
      } else {
        localStorage.setItem(`${STORAGE_PREFIX}${def.key}-visible`, String(ps.visible))
        if (def.resizable) {
          localStorage.setItem(`${STORAGE_PREFIX}${def.key}-w`, String(ps.size))
        }
      }
    }
    localStorage.setItem(`${STORAGE_PREFIX}editor-collapsed`, String(state.editorCollapsed))
    localStorage.setItem(`${STORAGE_PREFIX}floating-chat`, JSON.stringify(state.floating.chat))
    localStorage.setItem(
      `${STORAGE_PREFIX}floating-terminal`,
      JSON.stringify(state.floating.terminal),
    )
    // Also persist legacy keys for backward compat
    localStorage.setItem('code-editor:terminal-visible', String(state.panels.terminal.visible))
    localStorage.setItem('code-editor:terminal-height', String(state.panels.terminal.size))
  } catch {}
}

// ─── Context & Hook ─────────────────────────────────────

interface LayoutContextValue {
  state: LayoutState
  dispatch: Dispatch<LayoutAction>
  viewport: ViewportInfo
  isAtMost: (bp: Exclude<Breakpoint, 'gt1200'>) => boolean
  floating: (panel: FloatingPanelId) => FloatingPanelState
  isFloating: (panel: FloatingPanelId) => boolean
  setFloating: (panel: FloatingPanelId, floating: boolean) => void
  setFloatingBounds: (panel: FloatingPanelId, x: number, y: number, w: number, h: number) => void
  bringFloatingToFront: (panel: FloatingPanelId) => void
  /** Toggle panel visibility */
  toggle: (panel: PanelId) => void
  /** Show a panel */
  show: (panel: PanelId) => void
  /** Hide a panel */
  hide: (panel: PanelId) => void
  /** Resize a panel (auto-clamps) */
  resize: (panel: PanelId, size: number) => void
  /** Apply a layout preset */
  preset: (p: LayoutPreset) => void
  /** Get panel state */
  panel: (id: PanelId) => PanelState
  /** Get panel definition */
  panelDef: (id: PanelId) => PanelDef
  /** Is panel visible? */
  isVisible: (id: PanelId) => boolean
  /** Get panel size */
  getSize: (id: PanelId) => number
  /** Collapse/expand the editor */
  setEditorCollapsed: (collapsed: boolean) => void
  /** Is editor collapsed? */
  editorCollapsed: boolean
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(layoutReducer, undefined, buildInitialState)
  const { activeView } = useView()
  const hydrated = useRef(false)
  const [viewport, setViewport] = useState<ViewportInfo>(() => {
    if (typeof window === 'undefined') return { width: 1400, height: 900, breakpoint: 'gt1200' }
    const w = window.innerWidth
    const h = window.innerHeight
    return { width: w, height: h, breakpoint: computeBreakpoint(w) }
  })

  // Hydrate from localStorage after mount
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const stored = hydrateFromStorage()
    dispatch({ type: 'HYDRATE', state: stored })
  }, [])

  // Track viewport + derive breakpoints for responsive logic
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setViewport((prev) => {
        const nextBp = computeBreakpoint(w)
        if (prev.width === w && prev.height === h && prev.breakpoint === nextBp) return prev
        return { width: w, height: h, breakpoint: nextBp }
      })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Pragmatic responsive defaults: when the viewport shrinks into smaller breakpoints,
  // collapse secondary panels to avoid overflow/clipping at tablet/mobile widths.
  // Treat first computed breakpoint as a "shrink" from desktop so narrow screens start collapsed.
  const lastBpRef = useRef<Breakpoint>('gt1200')
  useEffect(() => {
    const prev = lastBpRef.current
    const next = viewport.breakpoint
    if (prev === next) return
    lastBpRef.current = next

    // Only apply on shrink (moving to a smaller breakpoint).
    if (bpRank(next) >= bpRank(prev)) return

    const actions: LayoutAction[] = []
    if (bpRank(next) <= bpRank('lte1200')) {
      actions.push({ type: 'HIDE', panel: 'plugins' })
    }
    if (bpRank(next) <= bpRank('lte992')) {
      actions.push({ type: 'HIDE', panel: 'sidebar' })
      actions.push({ type: 'HIDE', panel: 'chat' })
    }
    if (bpRank(next) <= bpRank('lte768')) {
      actions.push({ type: 'HIDE', panel: 'tree' })
      actions.push({ type: 'HIDE', panel: 'engine' })
      actions.push({ type: 'HIDE', panel: 'terminal' })
    }
    if (actions.length) dispatch({ type: 'BATCH', actions })
  }, [viewport.breakpoint])

  // Persist on every state change (after hydration)
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    if (!hydrated.current) return
    persistToStorage(state)
  }, [state])

  // In editor view, the center coding area should always stay expanded.
  useEffect(() => {
    if (activeView === 'editor' && state.editorCollapsed) {
      dispatch({ type: 'SET_EDITOR_COLLAPSED', collapsed: false })
    }
  }, [activeView, state.editorCollapsed])

  // ─── Convenience methods ───
  const toggle = useCallback((panel: PanelId) => dispatch({ type: 'TOGGLE', panel }), [])
  const show = useCallback((panel: PanelId) => dispatch({ type: 'SHOW', panel }), [])
  const hide = useCallback((panel: PanelId) => dispatch({ type: 'HIDE', panel }), [])
  const resize = useCallback(
    (panel: PanelId, size: number) => dispatch({ type: 'RESIZE', panel, size }),
    [],
  )
  const preset = useCallback((p: LayoutPreset) => dispatch({ type: 'PRESET', preset: p }), [])
  const setEditorCollapsed = useCallback(
    (collapsed: boolean) => {
      if (collapsed && activeView === 'editor') return
      dispatch({ type: 'SET_EDITOR_COLLAPSED', collapsed })
    },
    [activeView],
  )
  const setFloating = useCallback(
    (panel: FloatingPanelId, floating: boolean) =>
      dispatch({ type: 'SET_FLOATING', panel, floating }),
    [],
  )
  const setFloatingBounds = useCallback(
    (panel: FloatingPanelId, x: number, y: number, w: number, h: number) =>
      dispatch({ type: 'SET_FLOAT_BOUNDS', panel, x, y, w, h }),
    [],
  )
  const bringFloatingToFront = useCallback((panel: FloatingPanelId) => {
    const maxZ = Math.max(...Object.values(stateRef.current.floating).map((f) => f.z ?? 0), 80)
    dispatch({ type: 'BRING_FLOAT_FRONT', panel, z: maxZ + 1 })
  }, [])

  const panel = useCallback((id: PanelId) => state.panels[id], [state.panels])
  const panelDef = useCallback((id: PanelId) => PANEL_DEFS[id], [])
  const isVisible = useCallback((id: PanelId) => state.panels[id].visible, [state.panels])
  const getSize = useCallback((id: PanelId) => state.panels[id].size, [state.panels])
  const isAtMost = useCallback(
    (bp: Exclude<Breakpoint, 'gt1200'>) => {
      return bpRank(viewport.breakpoint) <= bpRank(bp)
    },
    [viewport.breakpoint],
  )
  const floating = useCallback((panel: FloatingPanelId) => state.floating[panel], [state.floating])
  const isFloating = useCallback(
    (panel: FloatingPanelId) => state.floating[panel].floating,
    [state.floating],
  )

  // ─── Window event bridge (backward compat) ───
  useEffect(() => {
    const handlers: [string, () => void][] = [
      ['cmd:toggle-files', () => toggle('tree')],
      ['cmd:toggle-engine', () => toggle('engine')],
      ['cmd:toggle-chat', () => toggle('chat')],
      ['cmd:collapse-editor', () => setEditorCollapsed(true)],
      ['toggle-terminal', () => toggle('terminal')],
      ['show-terminal', () => show('terminal')],
      ['hide-terminal', () => hide('terminal')],
      ['open-side-chat', () => show('chat')],
      [
        'cmd:layout-preset',
        (e?: Event) => {
          const p = (e as CustomEvent)?.detail as LayoutPreset
          if (p && p in PRESETS) preset(p)
        },
      ],
    ]
    // Need to handle the event parameter for preset
    const wrappedHandlers = handlers.map(([event, fn]) => {
      const handler = (e: Event) => (fn as (e?: Event) => void)(e)
      window.addEventListener(event, handler)
      return [event, handler] as const
    })
    return () => {
      for (const [event, handler] of wrappedHandlers) {
        window.removeEventListener(event, handler)
      }
    }
  }, [toggle, show, hide, preset, setEditorCollapsed])

  const value = useMemo<LayoutContextValue>(
    () => ({
      state,
      dispatch,
      viewport,
      isAtMost,
      floating,
      isFloating,
      setFloating,
      setFloatingBounds,
      bringFloatingToFront,
      toggle,
      show,
      hide,
      resize,
      preset,
      panel,
      panelDef,
      isVisible,
      getSize,
      setEditorCollapsed,
      editorCollapsed: state.editorCollapsed,
    }),
    [
      state,
      viewport,
      isAtMost,
      floating,
      isFloating,
      setFloating,
      setFloatingBounds,
      bringFloatingToFront,
      toggle,
      show,
      hide,
      resize,
      preset,
      panel,
      panelDef,
      isVisible,
      getSize,
      setEditorCollapsed,
    ],
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider')
  return ctx
}

// ─── Resize Hook ────────────────────────────────────────
// Drag-to-resize for any panel, handles mouse events

export function usePanelResize(panel: PanelId) {
  const { resize, getSize, panelDef } = useLayout()
  const def = panelDef(panel)
  const [resizing, setResizing] = useState(false)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startPos = def.axis === 'horizontal' ? e.clientX : e.clientY
      const startSize = getSize(panel)
      setResizing(true)

      const onMove = (ev: MouseEvent) => {
        const currentPos = def.axis === 'horizontal' ? ev.clientX : ev.clientY
        const invertDelta =
          panel === 'chat' || panel === 'terminal' || panel === 'plugins' || panel === 'gitPanel'
        const delta = invertDelta ? startPos - currentPos : currentPos - startPos
        resize(panel, startSize + delta)
      }
      const onUp = () => {
        setResizing(false)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [panel, def.axis, getSize, resize],
  )

  return { onResizeStart, resizing }
}
