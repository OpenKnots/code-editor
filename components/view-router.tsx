'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useView } from '@/context/view-context'
import { ErrorBoundary } from '@/components/error-boundary'

const EditorView = dynamic(
  () => import('@/components/views/editor-view').then((m) => m.EditorView),
  { ssr: false },
)
const GitView = dynamic(() => import('@/components/views/git-view').then((m) => m.GitView), {
  ssr: false,
})
const KanbanView = dynamic(
  () => import('@/components/views/kanban-view').then((m) => m.KanbanView),
  { ssr: false },
)
const SkillsView = dynamic(
  () => import('@/components/views/skills-view').then((m) => m.SkillsView),
  { ssr: false },
)
const PromptLibraryView = dynamic(
  () => import('@/components/views/prompt-library-view').then((m) => m.PromptLibraryView),
  { ssr: false },
)
const SettingsPanel = dynamic(
  () => import('@/components/settings-panel').then((m) => m.SettingsPanel),
  { ssr: false },
)
const PreviewPanel = dynamic(
  () => import('@/components/preview/preview-panel').then((m) => m.PreviewPanel),
  { ssr: false },
)
const AgentPanel = dynamic(() => import('@/components/agent-panel').then((m) => m.AgentPanel), {
  ssr: false,
})
const GatewayTerminal = dynamic(
  () => import('@/components/gateway-terminal').then((m) => m.GatewayTerminal),
  { ssr: false },
)
const SplitPreviewChat = dynamic(
  () => import('@/components/split-preview-chat').then((m) => m.SplitPreviewChat),
  { ssr: false },
)
const WorkshopView = dynamic(
  () => import('@/components/views/workshop-view').then((m) => m.WorkshopView),
  { ssr: false },
)
const VIEW_ICONS: Record<string, { label: string }> = {
  chat: { label: 'Chat' },
  editor: { label: 'Editor' },
  preview: { label: 'Preview' },
  git: { label: 'Git' },
  kanban: { label: 'Kanban' },
  skills: { label: 'Skills' },
  prompts: { label: 'Prompts' },
  settings: { label: 'Settings' },
  terminal: { label: 'Gateway Terminal' },
  workshop: { label: 'Workshop' },
}

const viewVariants = {
  enter: () => ({
    opacity: 0,
  }),
  center: {
    opacity: 1,
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: () => ({
    opacity: 0,
    transition: { duration: 0.1 },
  }),
}

export function ViewRouter() {
  const { activeView, direction, setView } = useView()
  const [previewDocked, setPreviewDocked] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('knot-code:preview-docked') === 'true'
    }
    return false
  })
  const [previewUrl, setPreviewUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('knot-code:preview-url') || 'http://localhost:3000'
    }
    return 'http://localhost:3000'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('knot-code:preview-docked', previewDocked.toString())
    }
  }, [previewDocked])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('knot-code:preview-url', previewUrl)
    }
  }, [previewUrl])

  // Show split view when on chat view AND preview is docked
  const showSplitView = activeView === 'chat' && previewDocked

  return (
    <div className="view-router-frame flex flex-1 min-h-0 min-w-0 overflow-hidden">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={showSplitView ? 'split-view' : activeView}
          custom={direction}
          variants={viewVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="flex-1 flex min-h-0 min-w-0 w-full overflow-hidden"
        >
          <ErrorBoundary
            key={showSplitView ? 'split-view' : activeView}
            fallbackLabel={`${VIEW_ICONS[activeView]?.label ?? activeView} failed to render`}
          >
            {showSplitView ? (
              <SplitPreviewChat previewUrl={previewUrl} onClose={() => setPreviewDocked(false)} />
            ) : (
              <>
                {activeView === 'chat' && <AgentPanel />}
                {activeView === 'editor' && <EditorView />}
                {activeView === 'preview' && <PreviewPanel />}
                {activeView === 'git' && <GitView />}
                {activeView === 'kanban' && <KanbanView />}
                {activeView === 'skills' && <SkillsView />}
                {activeView === 'prompts' && <PromptLibraryView />}
                {activeView === 'workshop' && <WorkshopView />}
                {activeView === 'settings' && <SettingsPanel onBack={() => setView('chat')} />}
                {activeView === 'terminal' && (
                  <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
                    <GatewayTerminal />
                  </div>
                )}
              </>
            )}
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
