'use client'
import { Icon } from '@iconify/react'

interface BreadcrumbsProps {
  filePath: string | null
  repoName?: string
  onClick?: (segment: string, fullPath: string) => void
}

export function Breadcrumbs({ filePath, repoName, onClick }: BreadcrumbsProps) {
  if (!filePath) return null

  const segments = filePath.split('/')
  const fileName = segments.pop() || ''
  const dirs = segments

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 py-1 text-[10px] text-[var(--text-tertiary)] scrollbar-none select-none">
      {repoName && (
        <>
          <span className="text-[var(--text-disabled)] shrink-0">{repoName}</span>
          <Icon
            icon="lucide:chevron-right"
            width={12}
            className="text-[var(--text-disabled)] shrink-0"
          />
        </>
      )}
      {dirs.map((dir, i) => {
        const fullPath = segments.slice(0, i + 1).join('/')
        return (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onClick?.(dir, fullPath)}
              className="rounded px-1 py-0.5 transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)] cursor-pointer"
            >
              {dir}
            </button>
            <Icon icon="lucide:chevron-right" width={12} className="text-[var(--text-disabled)]" />
          </span>
        )
      })}
      {/* Active (last) segment with file icon */}
      <span className="flex items-center gap-1.5 shrink-0">
        <Icon icon="lucide:file-code" width={12} className="text-[var(--brand)]" />
        <span className="font-medium text-[var(--text-primary)]">{fileName}</span>
      </span>
    </div>
  )
}
