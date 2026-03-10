'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@iconify/react'
import type { WorkshopBlueprint } from '@/lib/agent-workshop/types'
import { buildWorkshopSystemPrompt } from '@/lib/agent-workshop/prompt'

interface LivePreviewProps {
  blueprint: WorkshopBlueprint
  isOpen: boolean
  onToggle: () => void
}

export function LivePreview({ blueprint, isOpen, onToggle }: LivePreviewProps) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'config'>('prompt')

  const systemPrompt = useMemo(() => buildWorkshopSystemPrompt(blueprint), [blueprint])
  const configJson = useMemo(() => JSON.stringify(blueprint, null, 2), [blueprint])
  const tokenCount = useMemo(() => {
    // Rough estimate: ~4 characters per token
    return Math.ceil(systemPrompt.length / 4)
  }, [systemPrompt])

  const handleCopy = () => {
    const content = activeTab === 'prompt' ? systemPrompt : configJson
    navigator.clipboard.writeText(content)
  }

  return (
    <>
      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          onClick={onToggle}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 py-3 px-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg hover:border-[var(--brand)] transition"
          title="Open Live Preview"
        >
          <Icon icon="lucide:eye" width={20} height={20} className="text-[var(--brand)]" />
          <span className="writing-mode-vertical text-xs font-medium text-[var(--text-secondary)]">
            Preview
          </span>
        </motion.button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:eye" width={18} height={18} className="text-[var(--brand)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] transition"
                  title="Copy to clipboard"
                >
                  <Icon icon="lucide:copy" width={16} height={16} />
                </button>
                <button
                  onClick={onToggle}
                  className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] transition"
                  title="Close preview"
                >
                  <Icon icon="lucide:x" width={16} height={16} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('prompt')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition ${
                  activeTab === 'prompt'
                    ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Prompt
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition ${
                  activeTab === 'config'
                    ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Config JSON
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <pre className="p-4 bg-[var(--bg)] rounded-xl text-xs text-[var(--text-secondary)] font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {activeTab === 'prompt' ? systemPrompt : configJson}
                  </pre>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-disabled)]">
                <span>Token estimate</span>
                <span className="font-mono font-medium text-[var(--text-secondary)]">
                  ~{tokenCount.toLocaleString()}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
