'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useView } from '@/context/view-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { EditorTabs } from '@/components/editor-tabs'
import { FloatingPanel } from '@/components/floating-panel'
import { KnotLogo } from '@/components/knot-logo'
import { KnotBackground } from '@/components/knot-background'
import { isTauri } from '@/lib/tauri'
import { emit } from '@/lib/events'

const FileExplorer = dynamic(
  () => import('@/components/file-explorer').then((m) => ({ default: m.FileExplorer })),
  { ssr: false },
)
const CodeEditor = dynamic(
  () => import('@/components/code-editor').then((m) => ({ default: m.CodeEditor })),
  { ssr: false },
)
const AgentPanel = dynamic(
  () => import('@/components/agent-panel').then((m) => ({ default: m.AgentPanel })),
  { ssr: false },
)

const PANEL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

const QUICK_ACTIONS = [
  { icon: 'lucide:file-search', label: 'File', shortcut: '\u2318P', event: 'quick-open' },
  { icon: 'lucide:folder', label: 'Browse', shortcut: '\u2318B', event: 'toggle-tree' },
  {
    icon: 'lucide:message-square',
    label: 'Chat',
    shortcut: '\u2318L',
    event: 'open-side-chat',
  },
  { icon: 'lucide:terminal', label: 'Terminal', shortcut: '\u2318J', event: 'toggle-terminal' },
]

export function EditorView() {
  const { files, activeFile } = useEditor()
  const local = useLocal()
  const { repo } = useRepo()
  const { setView } = useView()
  const layout = useLayout()
  const isMobile = layout.isAtMost('lte768')
  const isNarrow = layout.isAtMost('lte992')
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

  // Derived from layout context
  const treeVisible = layout.isVisible('tree')
  const treeWidth = layout.getSize('tree')
  const chatVisible = layout.isVisible('chat')
  const chatWidth = layout.getSize('chat')
  const editorCollapsed = layout.editorCollapsed
  const chatFloating = layout.isFloating('chat')

  // Resize hooks
  const treeResize = usePanelResize('tree')
  const chatResize = usePanelResize('chat')

  // Auto-expand editor when a file is opened (user action that needs the editor visible)
  const { setEditorCollapsed } = layout
  const prevFileCount = useRef(files.length)
  useEffect(() => {
    const fileOpened =
      files.length > prevFileCount.current || (activeFile && prevFileCount.current === 0)
    prevFileCount.current = files.length
    if (fileOpened && editorCollapsed) {
      setEditorCollapsed(false)
    }
  }, [files.length, activeFile, editorCollapsed, setEditorCollapsed])

  // ⌘B toggle tree, ⌘I toggle chat
  const { toggle } = layout
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggle('tree')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        toggle('chat')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  // Command palette events & open-side-chat are now handled by LayoutContext's event bridge

  // ─── Chat unread state ───
  const [agentUnread, setAgentUnread] = useState(false)

  useEffect(() => {
    const onAgent = () => {
      if (!chatVisible) setAgentUnread(true)
    }
    window.addEventListener('agent-reply', onAgent)
    return () => {
      window.removeEventListener('agent-reply', onAgent)
    }
  }, [chatVisible])

  // Clear unread when chat opens
  useEffect(() => {
    if (chatVisible) setAgentUnread(false)
  }, [chatVisible])

  const hasFiles = files.length > 0 || activeFile
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  const { show, hide } = layout
  const handleQuickAction = useCallback(
    (event: string) => {
      switch (event) {
        case 'quick-open':
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }))
          break
        case 'toggle-tree':
          show('tree')
          break
        case 'open-side-chat':
          show('chat')
          requestAnimationFrame(() => emit('focus-agent-input'))
          break
        case 'toggle-terminal':
          toggle('terminal')
          break
      }
    },
    [show, toggle],
  )

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative bg-[var(--sidebar-bg)]">
      {/* ── Editor collapsed: narrow toggle strip ── */}
      {editorCollapsed ? (
        <div className="flex flex-col items-center w-[52px] shrink-0 bg-[var(--bg-elevated)] border-r border-[var(--border)]">
          <button
            onClick={() => layout.setEditorCollapsed(false)}
            className="mt-3 p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Expand editor (⌘E)"
          >
            <Icon icon="lucide:code-2" width={20} height={20} />
          </button>
          <button
            onClick={() => {
              layout.setEditorCollapsed(false)
              layout.show('tree')
            }}
            className="mt-1.5 p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
            title="Open explorer (⌘B)"
          >
            <Icon icon="lucide:folder" width={18} height={18} />
          </button>
          {isDesktop && (
            <button
              onClick={() => emit('toggle-terminal')}
              className="mt-1.5 p-2.5 rounded-xl hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] transition-colors cursor-pointer"
              title="Terminal (⌘J)"
            >
              <Icon icon="lucide:terminal" width={18} height={18} />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* File Tree — docked (desktop/tablet) */}
          {!isMobile && (
            <AnimatePresence initial={false}>
              {treeVisible && (
                <motion.div
                  key="file-tree"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: treeResize.resizing ? undefined : treeWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={treeResize.resizing ? { duration: 0 } : PANEL_SPRING}
                  style={treeResize.resizing ? { width: treeWidth } : undefined}
                  className="shrink-0 bg-[var(--sidebar-bg)] overflow-hidden border-r border-[var(--border)] flex flex-col"
                >
                  <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)]">
                      Explorer
                    </span>
                    <button
                      onClick={() => layout.hide('tree')}
                      className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                      title="Hide (⌘B)"
                    >
                      <Icon icon="lucide:panel-left-close" width={15} height={15} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <FileExplorer />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Tree resize handle */}
          {treeVisible && !isMobile && (
            <div
              className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
              onMouseDown={treeResize.onResizeStart}
            >
              <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
            </div>
          )}

          {/* Editor column */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Tree toggle when collapsed */}
            {!treeVisible && !isMobile && (
              <button
                onClick={() => layout.show('tree')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 flex items-center justify-center bg-[var(--bg-elevated)] border border-l-0 border-[var(--border)] rounded-r-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                title="Show explorer (⌘B)"
              >
                <Icon icon="lucide:chevron-right" width={14} height={14} />
              </button>
            )}
            {!treeVisible && isMobile && (
              <button
                onClick={() => layout.show('tree')}
                className="absolute left-2 top-2 z-30 h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="Files (⌘B)"
              >
                <Icon icon="lucide:folder" width={16} height={16} />
              </button>
            )}

            {hasFiles ? (
              <>
                <EditorTabs />
                <div className="flex-1 min-h-0 flex flex-col">
                  <CodeEditor />
                </div>
              </>
            ) : (
              <div className="welcome-screen flex-1 flex flex-col items-center justify-center relative overflow-hidden select-none">
                {/* Match chat background styling for visual consistency */}
                <KnotBackground />
                <div className="welcome-grid z-[1]" aria-hidden="true" />

                <div className="relative z-10 flex flex-col items-center gap-8 max-w-[480px] px-6">
                  {/* Logo hero */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex items-center justify-center"
                  >
                    <div
                      className="absolute w-64 h-64 rounded-full opacity-[0.12] animate-breathe"
                      style={{
                        background: 'radial-gradient(circle, var(--brand) 0%, transparent 70%)',
                      }}
                    />
                    <div
                      className="absolute w-40 h-40 rounded-full opacity-[0.18] animate-breathe"
                      style={{
                        background: 'radial-gradient(circle, var(--brand) 0%, transparent 70%)',
                        animationDelay: '0.5s',
                      }}
                    />
                    <KnotLogo size={72} className="text-[var(--brand)] welcome-logo-spin" />
                  </motion.div>

                  {/* Brand text */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center gap-2"
                  >
                    <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
                      Knot<span className="text-[var(--brand)]">Code</span>
                    </h1>
                    <p className="text-[14px] text-[var(--text-tertiary)] font-medium tracking-[-0.01em]">
                      Open a file or start a conversation to begin
                    </p>
                  </motion.div>

                  {/* Action cards */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="grid grid-cols-2 gap-3 w-full"
                  >
                    {QUICK_ACTIONS.filter((a) => a.event !== 'toggle-terminal' || isDesktop).map(
                      (item, i) => (
                        <motion.button
                          key={item.label}
                          onClick={() => handleQuickAction(item.event)}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.4,
                            delay: 0.35 + i * 0.07,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className="welcome-action-card group relative flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer text-left"
                        >
                          <div className="welcome-action-icon-wrap shrink-0">
                            <Icon
                              icon={item.icon}
                              width={20}
                              height={20}
                              className="text-[var(--text-tertiary)] group-hover:text-[var(--brand)] transition-colors duration-200"
                            />
                          </div>
                          <span className="flex-1 text-[13px] text-[var(--text-secondary)] font-semibold group-hover:text-[var(--text-primary)] transition-colors duration-200">
                            {item.label}
                          </span>
                          <kbd className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text-disabled)] shrink-0 font-mono group-hover:border-[var(--text-disabled)] transition-colors duration-200">
                            {item.shortcut}
                          </kbd>
                        </motion.button>
                      ),
                    )}
                  </motion.div>

                  {/* Tip line */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="text-[12px] text-[var(--text-disabled)] font-medium flex items-center gap-2"
                  >
                    <Icon
                      icon="lucide:lightbulb"
                      width={13}
                      height={13}
                      className="text-[var(--brand)] opacity-60"
                    />
                    Press{' '}
                    <kbd className="mx-0.5 px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] text-[10px] font-mono">
                      ⌘P
                    </kbd>{' '}
                    to quickly find any file
                  </motion.p>
                </div>
              </div>
            )}

            {/* Bottom bar */}
            <div className="flex items-center h-8 px-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-2">
              {branchName && (
                <span className="text-[12px] font-mono text-[var(--text-disabled)] flex items-center gap-1.5 ml-1">
                  <Icon icon="lucide:git-branch" width={14} height={14} />
                  {branchName}
                </span>
              )}

              <div className="flex-1" />

              <button
                onClick={() => layout.toggle('chat')}
                className={`relative h-7 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${chatVisible ? 'bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand)]' : 'text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]'}`}
                title="Chat (⌘I)"
              >
                <Icon icon="lucide:message-square" width={14} height={14} />
                {!isNarrow && <span>Agent</span>}
                {agentUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--brand)] animate-pulse ring-2 ring-[var(--bg-elevated)]" />
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat resize handle */}
      {chatVisible && !editorCollapsed && !isMobile && !chatFloating && (
        <div
          className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
          onMouseDown={chatResize.onResizeStart}
        >
          <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
        </div>
      )}

      {/* Chat panel — animated open/close, direct width during resize */}
      <AnimatePresence initial={false}>
        {chatVisible && !isMobile && !chatFloating && (
          <motion.div
            key="chat-panel"
            initial={editorCollapsed ? { opacity: 0 } : { width: 0, opacity: 0 }}
            animate={
              editorCollapsed
                ? { opacity: 1 }
                : { width: chatResize.resizing ? undefined : chatWidth, opacity: 1 }
            }
            exit={editorCollapsed ? { opacity: 0 } : { width: 0, opacity: 0 }}
            transition={chatResize.resizing ? { duration: 0 } : PANEL_SPRING}
            style={chatResize.resizing && !editorCollapsed ? { width: chatWidth } : undefined}
            className={`shrink-0 flex flex-col bg-[var(--bg)] overflow-hidden ${editorCollapsed ? 'flex-1' : 'border-l border-[var(--border)]'}`}
          >
            <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-2">
                <Icon icon="lucide:bot" width={14} height={14} className="text-[var(--brand)]" />
                Agent
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => layout.setFloating('chat', true)}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                  title="Float panel"
                >
                  <Icon icon="lucide:app-window" width={14} height={14} />
                </button>
                <button
                  onClick={() => layout.hide('chat')}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
                  title="Hide (⌘I)"
                >
                  <Icon icon="lucide:panel-right-close" width={14} height={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <AgentPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile drawers */}
      <AnimatePresence initial={false}>
        {isMobile && treeVisible && !editorCollapsed && (
          <>
            <motion.button
              key="tree-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => layout.hide('tree')}
              aria-label="Close files"
            />
            <motion.div
              key="tree-drawer"
              initial={{ x: -420 }}
              animate={{ x: 0 }}
              exit={{ x: -420 }}
              transition={PANEL_SPRING}
              className="absolute inset-y-0 left-0 z-50 w-[min(92vw,360px)] bg-[var(--sidebar-bg)] border-r border-[var(--border)] flex flex-col"
            >
              <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-elevated)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)]">
                  Explorer
                </span>
                <button
                  onClick={() => layout.hide('tree')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer"
                  title="Close"
                >
                  <Icon icon="lucide:x" width={14} height={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FileExplorer />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isMobile && chatVisible && !editorCollapsed && !chatFloating && (
          <>
            <motion.button
              key="chat-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-black/40"
              onClick={() => layout.hide('chat')}
              aria-label="Close chat"
            />
            <motion.div
              key="chat-drawer"
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={PANEL_SPRING}
              className="absolute inset-y-0 right-0 z-50 w-[min(96vw,420px)] bg-[var(--bg)] border-l border-[var(--border)] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-2">
                  <Icon icon="lucide:bot" width={14} height={14} className="text-[var(--brand)]" />
                  Agent
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => layout.setFloating('chat', true)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer"
                    title="Float panel"
                  >
                    <Icon icon="lucide:app-window" width={14} height={14} />
                  </button>
                  <button
                    onClick={() => layout.hide('chat')}
                    className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer"
                    title="Close"
                  >
                    <Icon icon="lucide:x" width={14} height={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AgentPanel />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {chatVisible && chatFloating && (
        <FloatingPanel
          panel="chat"
          title="Agent"
          icon="lucide:bot"
          onDock={() => layout.setFloating('chat', false)}
          onClose={() => {
            layout.setFloating('chat', false)
            layout.hide('chat')
          }}
          minW={340}
          minH={320}
        >
          <AgentPanel />
        </FloatingPanel>
      )}
    </div>
  )
}
