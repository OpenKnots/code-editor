'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { motion, AnimatePresence } from 'framer-motion'

export interface PickerItem {
  id: string
  name: string
  description?: string
  icon?: string
  category?: string
  enabled?: boolean
}

interface InlinePickerProps {
  items: PickerItem[]
  visible: boolean
  onSelect: (item: PickerItem) => void
  onClose: () => void
  activeIndex: number
  setActiveIndex: (i: number) => void
  title: string
  emptyMessage?: string
  searchQuery: string
}

export function InlinePicker({
  items,
  visible,
  onSelect,
  onClose,
  activeIndex,
  setActiveIndex,
  title,
  emptyMessage = 'No items found',
  searchQuery,
}: InlinePickerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)

  // Filter items based on search query
  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  // Reset active index when items change
  useEffect(() => {
    if (activeIndex >= filteredItems.length) {
      setActiveIndex(Math.max(0, filteredItems.length - 1))
    }
  }, [filteredItems.length, activeIndex, setActiveIndex])

  if (!visible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">{title}</span>
          <button
            onClick={onClose}
            className="text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={12} height={12} />
          </button>
        </div>

        {/* Items list */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Icon
                icon="lucide:search-x"
                width={20}
                height={20}
                className="mx-auto mb-2 text-[var(--text-disabled)]"
              />
              <p className="text-[11px] text-[var(--text-disabled)]">{emptyMessage}</p>
            </div>
          ) : (
            filteredItems.map((item, i) => (
              <button
                key={item.id}
                ref={i === activeIndex ? activeItemRef : null}
                onClick={() => onSelect(item)}
                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                  i === activeIndex
                    ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] border-l-2 border-l-[var(--brand)]'
                    : 'hover:bg-[var(--bg-subtle)] border-l-2 border-l-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    i === activeIndex
                      ? 'bg-[var(--brand)] text-[var(--brand-contrast)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]'
                  }`}
                >
                  <Icon icon={item.icon || 'lucide:box'} width={14} height={14} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[12px] font-medium ${
                        i === activeIndex ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {item.name}
                    </span>
                    {item.enabled === false && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-[var(--bg-subtle)] text-[var(--text-disabled)] border border-[var(--border)]">
                        disabled
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
                      {item.description}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
