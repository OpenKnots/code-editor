'use client'

import { useState, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { PREVIEW_TAB_ID, useEditor } from '@/context/editor-context'
import { useView } from '@/context/view-context'
import { formatShortcut } from '@/lib/platform'

const EXT_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'lucide:file-code', color: 'var(--syntax-type)' },
  tsx: { icon: 'lucide:file-code', color: 'var(--syntax-type)' },
  js: { icon: 'lucide:file-code', color: 'var(--syntax-number)' },
  jsx: { icon: 'lucide:file-code', color: 'var(--syntax-number)' },
  css: { icon: 'lucide:palette', color: 'var(--syntax-keyword)' },
  scss: { icon: 'lucide:palette', color: 'var(--brand)' },
  json: { icon: 'lucide:braces', color: 'var(--syntax-string)' },
  md: { icon: 'lucide:file-text', color: 'var(--info)' },
  mdx: { icon: 'lucide:file-text', color: 'var(--info)' },
  html: { icon: 'lucide:globe', color: 'var(--error)' },
  svg: { icon: 'lucide:image', color: 'var(--warning)' },
  py: { icon: 'lucide:file-code', color: 'var(--syntax-function)' },
  rs: { icon: 'lucide:file-code', color: 'var(--warning)' },
  toml: { icon: 'lucide:settings', color: 'var(--text-secondary)' },
  yml: { icon: 'lucide:settings', color: 'var(--error)' },
  yaml: { icon: 'lucide:settings', color: 'var(--error)' },
  sh: { icon: 'lucide:terminal', color: 'var(--success)' },
  png: { icon: 'lucide:image', color: 'var(--brand)' },
  jpg: { icon: 'lucide:image', color: 'var(--brand)' },
  jpeg: { icon: 'lucide:image', color: 'var(--brand)' },
  gif: { icon: 'lucide:image', color: 'var(--brand)' },
  webp: { icon: 'lucide:image', color: 'var(--brand)' },
  avif: { icon: 'lucide:image', color: 'var(--brand)' },
  ico: { icon: 'lucide:image', color: 'var(--brand)' },
  bmp: { icon: 'lucide:image', color: 'var(--brand)' },
  mp4: { icon: 'lucide:video', color: 'var(--error)' },
  webm: { icon: 'lucide:video', color: 'var(--error)' },
  mov: { icon: 'lucide:video', color: 'var(--error)' },
  mkv: { icon: 'lucide:video', color: 'var(--error)' },
  mp3: { icon: 'lucide:music', color: 'var(--success)' },
  wav: { icon: 'lucide:music', color: 'var(--success)' },
  ogg: { icon: 'lucide:music', color: 'var(--success)' },
  m4a: { icon: 'lucide:music', color: 'var(--success)' },
  flac: { icon: 'lucide:music', color: 'var(--success)' },
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? { icon: 'lucide:file', color: 'var(--text-tertiary)' }
}

export function EditorTabs({ onTabSelect }: { onTabSelect?: (path: string) => void }) {
  const {
    tabs,
    files,
    activeFile,
    setActiveFile,
    closeFile,
    reorderTabs,
    closePreviewTab,
    openPreviewTab,
  } = useEditor()
  const { activeView, setView } = useView()
  const previewActive = activeView === 'preview'
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const dragNode = useRef<HTMLDivElement | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    dragNode.current = e.currentTarget as HTMLDivElement
    e.dataTransfer.effectAllowed = 'move'
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4'
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) dragNode.current.style.opacity = '1'
    if (dragIndex !== null && dropTarget !== null && dragIndex !== dropTarget) {
      reorderTabs(dragIndex, dropTarget)
    }
    setDragIndex(null)
    setDropTarget(null)
    dragNode.current = null
  }, [dragIndex, dropTarget, reorderTabs])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(index)
  }, [])

  if (tabs.length === 0) return null

  return (
    <div className="relative flex items-center border-b border-[var(--border)] bg-[var(--bg)] overflow-x-auto no-scrollbar shrink-0 h-[42px]">
      {tabs.map((tab, index) => {
        const isPreview = tab.type === 'preview'
        const tabPath = tab.type === 'file' ? tab.path : null
        const isActive = isPreview ? previewActive : !previewActive && tabPath === activeFile
        const isDragTarget = dropTarget === index && dragIndex !== null && dragIndex !== index

        const label = isPreview ? 'Preview' : (tabPath?.split('/').pop() ?? '')
        const dirty = tabPath ? files.find((file) => file.path === tabPath)?.dirty : false
        const iconMeta = isPreview
          ? { icon: 'lucide:eye', color: 'var(--brand)' }
          : getFileIcon(tabPath ?? '')

        return (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={() => setDropTarget(null)}
            className={`
              group relative flex items-center gap-2.5 px-4 h-full cursor-pointer transition-colors duration-150 select-none min-w-0 shrink-0 border-b border-transparent
              ${
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              }
              ${isDragTarget ? 'border-b-[var(--brand)] bg-[var(--bg-subtle)]' : ''}
            `}
            onClick={() => {
              if (isPreview) {
                openPreviewTab()
                setView('preview')
                return
              }
              if (!tabPath) return
              setActiveFile(tabPath)
              setView('editor')
              onTabSelect?.(tabPath)
            }}
          >
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px]">
                <div className="h-full bg-[var(--brand)] rounded-t-full" />
              </div>
            )}

            <Icon
              icon={iconMeta.icon}
              width={17}
              height={17}
              style={{ color: isActive ? iconMeta.color : undefined }}
              className={`transition-colors duration-150 ${isActive ? '' : 'text-[var(--text-tertiary)]'}`}
            />

            <span
              className="text-[13px] font-medium truncate max-w-[140px]"
              title={isPreview ? 'Preview' : (tabPath ?? '')}
            >
              {label}
            </span>

            {dirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]"
                title="Unsaved changes"
              />
            )}

            <button
              onClick={(e) => {
                e.stopPropagation()
                if (isPreview) {
                  closePreviewTab()
                  if (previewActive) setView('editor')
                  return
                }
                if (tabPath) closeFile(tabPath)
              }}
              className="ml-1 cursor-pointer rounded-lg p-1.5 opacity-0 transition-colors hover:bg-[var(--bg)] group-hover:opacity-100 focus:opacity-100"
              title={`Close (${formatShortcut('meta+W')})`}
            >
              <Icon icon="lucide:x" width={14} height={14} />
            </button>

            {!isActive && (
              <div className="absolute right-0 top-[6px] bottom-[6px] w-px bg-[var(--border)] opacity-30" />
            )}
          </div>
        )
      })}

      {tabs.length > 6 && (
        <div className="sticky right-0 flex items-center px-2 h-full bg-gradient-to-l from-[var(--bg)] via-[var(--bg)] to-transparent shrink-0">
          <span className="text-[11px] font-mono font-bold text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-full border-[1.5px] border-[var(--border)]">
            {tabs.length}
          </span>
        </div>
      )}
    </div>
  )
}
