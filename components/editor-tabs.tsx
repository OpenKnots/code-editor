'use client'

import { useState, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { formatShortcut } from '@/lib/platform'

const EXT_ICONS: Record<string, { icon: string; color: string }> = {
  ts: { icon: 'lucide:file-code', color: '#3178c6' },
  tsx: { icon: 'lucide:file-code', color: '#3178c6' },
  js: { icon: 'lucide:file-code', color: '#f7df1e' },
  jsx: { icon: 'lucide:file-code', color: '#f7df1e' },
  css: { icon: 'lucide:palette', color: '#264de4' },
  scss: { icon: 'lucide:palette', color: '#cd6799' },
  json: { icon: 'lucide:braces', color: '#f7df1e' },
  md: { icon: 'lucide:file-text', color: '#519aba' },
  mdx: { icon: 'lucide:file-text', color: '#519aba' },
  html: { icon: 'lucide:globe', color: '#e44d26' },
  svg: { icon: 'lucide:image', color: '#ffb13b' },
  py: { icon: 'lucide:file-code', color: '#3776ab' },
  rs: { icon: 'lucide:file-code', color: '#dea584' },
  toml: { icon: 'lucide:settings', color: '#9c4121' },
  yml: { icon: 'lucide:settings', color: '#cb171e' },
  yaml: { icon: 'lucide:settings', color: '#cb171e' },
  sh: { icon: 'lucide:terminal', color: '#4eaa25' },
  png: { icon: 'lucide:image', color: '#a855f7' },
  jpg: { icon: 'lucide:image', color: '#a855f7' },
  jpeg: { icon: 'lucide:image', color: '#a855f7' },
  gif: { icon: 'lucide:image', color: '#a855f7' },
  webp: { icon: 'lucide:image', color: '#a855f7' },
  avif: { icon: 'lucide:image', color: '#a855f7' },
  ico: { icon: 'lucide:image', color: '#a855f7' },
  bmp: { icon: 'lucide:image', color: '#a855f7' },
  mp4: { icon: 'lucide:video', color: '#ef4444' },
  webm: { icon: 'lucide:video', color: '#ef4444' },
  mov: { icon: 'lucide:video', color: '#ef4444' },
  mkv: { icon: 'lucide:video', color: '#ef4444' },
  mp3: { icon: 'lucide:music', color: '#22c55e' },
  wav: { icon: 'lucide:music', color: '#22c55e' },
  ogg: { icon: 'lucide:music', color: '#22c55e' },
  m4a: { icon: 'lucide:music', color: '#22c55e' },
  flac: { icon: 'lucide:music', color: '#22c55e' },
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? { icon: 'lucide:file', color: 'var(--text-tertiary)' }
}

export function EditorTabs({ onTabSelect }: { onTabSelect?: (path: string) => void }) {
  const { files, activeFile, setActiveFile, closeFile, reorderFiles } = useEditor()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const dragNode = useRef<HTMLDivElement | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index)
    dragNode.current = e.currentTarget as HTMLDivElement
    e.dataTransfer.effectAllowed = 'move'
    // Make drag image semi-transparent
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4'
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) dragNode.current.style.opacity = '1'
    if (dragIndex !== null && dropTarget !== null && dragIndex !== dropTarget) {
      reorderFiles(dragIndex, dropTarget)
    }
    setDragIndex(null)
    setDropTarget(null)
    dragNode.current = null
  }, [dragIndex, dropTarget, reorderFiles])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(index)
  }, [])

  if (files.length === 0) return null

  return (
    <div className="relative flex items-center border-b border-[var(--border)] bg-[var(--bg)] overflow-x-auto no-scrollbar shrink-0 h-[42px]">
      {files.map((file, index) => {
        const name = file.path.split('/').pop() ?? file.path
        const isActive = file.path === activeFile
        const isDragTarget = dropTarget === index && dragIndex !== null && dragIndex !== index
        const { icon, color } = getFileIcon(file.path)

        return (
          <div
            key={file.path}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={() => setDropTarget(null)}
            className={`
              group relative flex items-center gap-2.5 px-5 h-full cursor-pointer transition-all duration-150 select-none min-w-0 shrink-0
              ${
                isActive
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              }
              ${isDragTarget ? 'border-l-2 border-l-[var(--brand)]' : 'border-l-0'}
            `}
            onClick={() => {
              setActiveFile(file.path)
              onTabSelect?.(file.path)
            }}
          >
            {/* Active indicator — bottom bar with gradient edges */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px]">
                <div className="h-full bg-[var(--brand)] rounded-t-full" />
              </div>
            )}

            {/* File icon */}
            <Icon
              icon={icon}
              width={17}
              height={17}
              style={{ color: isActive ? color : undefined }}
              className={`transition-colors duration-150 ${isActive ? '' : 'text-[var(--text-tertiary)]'}`}
            />

            {/* File name */}
            <span className="text-[13px] font-medium truncate max-w-[140px]" title={file.path}>
              {name}
            </span>

            {/* Dirty indicator */}
            {file.dirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]"
                title="Unsaved changes"
              />
            )}

            {/* Close button — show dot when dirty and not hovered */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.path)
              }}
              className="ml-1 cursor-pointer rounded-lg p-1.5 opacity-0 transition-all hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] group-hover:opacity-100"
              title={`Close (${formatShortcut('meta+W')})`}
            >
              <Icon icon="lucide:x" width={14} height={14} />
            </button>

            {/* Separator */}
            {!isActive && (
              <div className="absolute right-0 top-[6px] bottom-[6px] w-px bg-[var(--border)] opacity-30" />
            )}
          </div>
        )
      })}

      {/* Tab count indicator when many tabs are open */}
      {files.length > 6 && (
        <div className="sticky right-0 flex items-center px-2 h-full bg-gradient-to-l from-[var(--bg)] via-[var(--bg)] to-transparent shrink-0">
          <span className="text-[11px] font-mono font-bold text-[var(--text-tertiary)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-full border-[1.5px] border-[var(--border)]">
            {files.length}
          </span>
        </div>
      )}
    </div>
  )
}
