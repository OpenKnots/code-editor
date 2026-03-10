'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useLayout, usePanelResize } from '@/context/layout-context'
import { EditorTabs } from '@/components/editor-tabs'
import { FloatingPanel } from '@/components/floating-panel'
import { formatShortcut } from '@/lib/platform'
import { isTauri } from '@/lib/tauri'
import { emit } from '@/lib/events'

const FileExplorer = dynamic(
  () => import('@/components/file-explorer').then((m) => m.FileExplorer),
  { ssr: false },
)
const CodeEditor = dynamic(() => import('@/components/code-editor').then((m) => m.CodeEditor), {
  ssr: false,
})
const AgentPanel = dynamic(() => import('@/components/agent-panel').then((m) => m.AgentPanel), {
  ssr: false,
})

const PANEL_SPRING = { type: 'spring' as const, stiffness: 500, damping: 35 }

function NoCodebasePane({
  isDesktop,
  onOpenFolder,
}: {
  isDesktop: boolean
  onOpenFolder: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[var(--bg)] px-6 select-none">
      <div className="flex flex-col items-center gap-6 max-w-[420px]">
        <div className="w-20 h-20 rounded-2xl bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] flex items-center justify-center">
          <Icon
            icon="lucide:folder-code"
            width={48}
            height={48}
            className="text-[var(--text-muted)]"
          />
        </div>
        <div className="text-center">
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
            Open a project to start coding
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            Select a local folder or connect a GitHub repository
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-[300px]">
          <button
            onClick={onOpenFolder}
            className="flex items-center justify-center gap-2.5 w-full px-5 py-3.5 rounded-2xl text-[14px] font-medium bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.06)] text-[var(--text-primary)] hover:scale-[1.02] hover:border-[rgba(255,255,255,0.12)] transition-all cursor-pointer"
          >
            <Icon icon="lucide:folder-open" width={18} height={18} />
            Open Folder
          </button>
          <button
            onClick={() => emit('open-settings')}
            className="flex items-center justify-center gap-2.5 w-full px-5 py-3.5 rounded-2xl text-[14px] font-medium bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.06)] text-[var(--text-primary)] hover:scale-[1.02] hover:border-[rgba(255,255,255,0.12)] transition-all cursor-pointer"
          >
            <Icon icon="lucide:github" width={18} height={18} />
            Connect GitHub
          </button>
        </div>
        <div className="text-[10px] text-[var(--text-disabled)] opacity-60 mt-2">
          Tip: Use ⌘O to quickly open a folder
        </div>
      </div>
    </div>
  )
}

function MainEditorPane({
  hasFiles,
  hasCodebase,
  isDesktop,
  isNarrow,
  branchName,
  onBrowse,
  onOpenFolder,
}: {
  hasFiles: boolean
  hasCodebase: boolean
  isDesktop: boolean
  isNarrow: boolean
  branchName: string | null
  onBrowse: () => void
  onOpenFolder: () => void
}) {
  if (!hasCodebase && !hasFiles) {
    return <NoCodebasePane isDesktop={isDesktop} onOpenFolder={onOpenFolder} />
  }

  return hasFiles ? (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col bg-[var(--bg)]">
      <EditorTabs />
      <div className="flex-1 min-h-0 flex flex-col">
        <CodeEditor />
      </div>
      <div className="flex items-center h-8 px-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-2">
        {branchName && (
          <span className="text-[12px] font-mono text-[var(--text-disabled)] flex items-center gap-1.5">
            <Icon icon="lucide:git-branch" width={13} height={13} />
            {branchName}
          </span>
        )}
        <div className="flex-1" />
        {isDesktop && (
          <button
            onClick={() => emit('toggle-terminal')}
            className="h-6 px-2 rounded text-[11px] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] flex items-center gap-1.5 transition-colors cursor-pointer"
            title={`Terminal (${formatShortcut('meta+J')})`}
          >
            <Icon icon="lucide:terminal" width={12} height={12} />
            {!isNarrow && <span>Terminal</span>}
          </button>
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 select-none">
      <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] border border-[var(--border)] flex items-center justify-center">
        <Icon
          icon="lucide:file-code-2"
          width={22}
          height={22}
          className="text-[var(--text-disabled)]"
        />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-medium text-[var(--text-secondary)] mb-1">No file open</p>
        <p className="text-[12px] text-[var(--text-disabled)] leading-relaxed">
          Open a file from the explorer
          <br />
          or ask the agent to edit one
        </p>
      </div>
      <button
        onClick={onBrowse}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] transition-colors cursor-pointer border border-[var(--border)]"
      >
        <Icon icon="lucide:folder-open" width={13} height={13} />
        Browse files
      </button>
    </div>
  )
}

export function EditorView() {
  const { files, activeFile } = useEditor()
  const local = useLocal()
  const { repo } = useRepo()
  const layout = useLayout()
  const isMobile = layout.isAtMost('lte768')
  const isNarrow = layout.isAtMost('lte992')
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    setIsDesktop(isTauri())
  }, [])

  const treeVisible = layout.isVisible('tree')
  const treeWidth = layout.getSize('tree')
  const chatPanelVisible = layout.isVisible('chat')
  const chatPanelWidth = layout.getSize('chat')
  const chatFloating = layout.isFloating('chat')
  const treeResize = usePanelResize('tree')
  const chatPanelResize = usePanelResize('chat')

  const hasFiles = files.length > 0 || !!activeFile
  const hasCodebase = !!repo || !!local.rootPath
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        layout.toggle('tree')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) {
        e.preventDefault()
        layout.toggle('chat')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [layout])

  return (
    <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden bg-[var(--sidebar-bg)]">
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
              className="shrink-0 overflow-hidden border-r border-[var(--border)] bg-[var(--sidebar-bg)] flex flex-col"
            >
              <div className="flex items-center justify-between h-10 px-3 border-b border-[var(--border)] shrink-0">
                <button
                  onClick={() => local.openFolder()}
                  className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 -mx-1 hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer group"
                  title={local.rootPath ?? 'Open folder'}
                >
                  <Icon
                    icon="lucide:folder-open"
                    width={13}
                    height={13}
                    className="text-[var(--brand)] shrink-0 group-hover:scale-110 transition-transform"
                  />
                  <span className="text-[11px] font-bold text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)] truncate uppercase tracking-wider transition-colors">
                    {local.rootPath?.split('/').pop() ||
                      (repo ? repo.repo.split('/').pop() : 'Explorer')}
                  </span>
                </button>
                <button
                  onClick={() => layout.hide('tree')}
                  className="p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer shrink-0"
                  title={`Hide (${formatShortcut('meta+B')})`}
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

      {treeVisible && !isMobile && (
        <div
          className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
          onMouseDown={treeResize.onResizeStart}
        >
          <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {!treeVisible && !isMobile && (
          <button
            onClick={() => layout.show('tree')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 flex items-center justify-center bg-[var(--bg-elevated)] border border-l-0 border-[var(--border)] rounded-r-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
            title={`Show explorer (${formatShortcut('meta+B')})`}
          >
            <Icon icon="lucide:chevron-right" width={14} height={14} />
          </button>
        )}
        {!treeVisible && isMobile && hasFiles && (
          <button
            onClick={() => layout.show('tree')}
            className="absolute left-2 top-2 z-30 h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            title={`Files (${formatShortcut('meta+B')})`}
          >
            <Icon icon="lucide:folder" width={16} height={16} />
          </button>
        )}

        {/* Mobile: show file explorer when no files are open (but codebase is selected) */}
        {isMobile && !hasFiles && hasCodebase ? (
          <div className="flex-1 overflow-y-auto">
            <FileExplorer />
          </div>
        ) : (
          <MainEditorPane
            hasFiles={hasFiles}
            hasCodebase={hasCodebase}
            isDesktop={isDesktop}
            isNarrow={isNarrow}
            branchName={branchName}
            onBrowse={() => layout.show('tree')}
            onOpenFolder={() => local.openFolder()}
          />
        )}
      </div>

      {chatPanelVisible && !isMobile && !chatFloating && (
        <div
          className="resize-handle w-[5px] cursor-col-resize shrink-0 z-10 group/resize relative"
          onMouseDown={chatPanelResize.onResizeStart}
        >
          <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-[var(--text-disabled)] opacity-0 group-hover/resize:opacity-30 group-hover/resize:bg-[var(--brand)] transition-all" />
        </div>
      )}

      <AnimatePresence initial={false}>
        {chatPanelVisible && !isMobile && !chatFloating && (
          <motion.div
            key="chat-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: chatPanelResize.resizing ? undefined : chatPanelWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={chatPanelResize.resizing ? { duration: 0 } : PANEL_SPRING}
            style={chatPanelResize.resizing ? { width: chatPanelWidth } : undefined}
            className="shrink-0 overflow-hidden border-l border-[var(--border)] bg-[var(--sidebar-bg)]"
          >
            <AgentPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {!chatPanelVisible && !isMobile && !chatFloating && (
        <button
          onClick={() => layout.show('chat')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-5 h-12 flex items-center justify-center bg-[var(--bg-elevated)] border border-r-0 border-[var(--border)] rounded-l-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer"
          title={`Show chat (${formatShortcut('meta+I')})`}
        >
          <Icon icon="lucide:chevron-left" width={14} height={14} />
        </button>
      )}

      <AnimatePresence initial={false}>
        {isMobile && treeVisible && (
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
                <button
                  onClick={() => local.openFolder()}
                  className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 -mx-1 hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
                  title={local.rootPath ?? 'Open folder'}
                >
                  <Icon
                    icon="lucide:folder-open"
                    width={13}
                    height={13}
                    className="text-[var(--brand)] shrink-0 group-hover:scale-110 transition-transform"
                  />
                  <span className="text-[11px] font-bold text-[var(--text-disabled)] group-hover:text-[var(--text-secondary)] truncate uppercase tracking-wider transition-colors">
                    {local.rootPath?.split('/').pop() ||
                      (repo ? repo.repo.split('/').pop() : 'Explorer')}
                  </span>
                </button>
                <button
                  onClick={() => layout.hide('tree')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-tertiary)] cursor-pointer shrink-0"
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
        {isMobile && chatPanelVisible && !chatFloating && (
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
              className="absolute inset-y-0 right-0 z-50 w-[min(96vw,420px)] overflow-hidden border-l border-[var(--border)] bg-[var(--sidebar-bg)]"
            >
              <button
                type="button"
                onClick={() => layout.hide('chat')}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]"
                aria-label="Close chat"
              >
                <Icon icon="lucide:x" width={16} height={16} />
              </button>
              <AgentPanel />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {chatPanelVisible && chatFloating && (
        <FloatingPanel
          panel="chat"
          title="Chat"
          icon="lucide:message-square"
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
