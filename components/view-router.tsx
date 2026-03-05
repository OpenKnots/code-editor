'use client'

import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useView } from '@/context/view-context'
import { ErrorBoundary } from '@/components/error-boundary'

const EditorView = dynamic(
  () => import('@/components/views/editor-view').then((m) => ({ default: m.EditorView })),
  { ssr: false },
)
const GitView = dynamic(
  () => import('@/components/views/git-view').then((m) => ({ default: m.GitView })),
  { ssr: false },
)
const SettingsPanel = dynamic(
  () => import('@/components/settings-panel').then((m) => ({ default: m.SettingsPanel })),
  { ssr: false },
)
const PreviewPanel = dynamic(
  () => import('@/components/preview/preview-panel').then((m) => ({ default: m.PreviewPanel })),
  { ssr: false },
)

const VIEW_ICONS: Record<string, { label: string }> = {
  editor: { label: 'Editor' },
  preview: { label: 'Preview' },
  git: { label: 'Git' },
  settings: { label: 'Settings' },
}

const viewVariants = {
  enter: (dir: 'forward' | 'back') => ({
    x: dir === 'forward' ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 35 },
  },
  exit: (dir: 'forward' | 'back') => ({
    x: dir === 'forward' ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.15 },
  }),
}

export function ViewRouter() {
  const { activeView, direction, setView } = useView()

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={activeView}
          custom={direction}
          variants={viewVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="flex-1 flex min-h-0 min-w-0 w-full overflow-hidden"
        >
          <ErrorBoundary
            key={activeView}
            fallbackLabel={`${VIEW_ICONS[activeView]?.label ?? activeView} failed to render`}
          >
            {activeView === 'editor' && <EditorView />}
            {activeView === 'preview' && <PreviewPanel />}
            {activeView === 'git' && <GitView />}
            {activeView === 'settings' && (
              <div className="flex-1 flex items-center justify-center">
                <SettingsPanel open={true} onClose={() => setView('editor')} />
              </div>
            )}
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
