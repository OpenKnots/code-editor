'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { usePreview } from '@/context/preview-context'
import { useEditor } from '@/context/editor-context'
import { useView } from '@/context/view-context'

export function ComponentIsolatorListener() {
  const { isolateComponent } = usePreview()
  const { activeFile } = useEditor()
  const { setView } = useView()

  useEffect(() => {
    const handler = () => {
      if (!activeFile) return
      const name = activeFile.split('/').pop()?.replace(/\.\w+$/, '') ?? 'Component'
      isolateComponent({ name, filePath: activeFile, props: {} })
      setView('preview')
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('preview-isolate-component', handler)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('preview-isolate-component', handler)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeFile, isolateComponent, setView])

  return null
}

export function ComponentIsolator() {
  const { isolatedComponent, exitIsolation } = usePreview()

  if (!isolatedComponent) return null

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <Icon icon="lucide:component" width={13} height={13} className="text-[var(--brand)]" />
        <span className="text-[11px] font-semibold text-[var(--text-primary)]">{isolatedComponent.name}</span>
        <span className="text-[10px] font-mono text-[var(--text-disabled)] truncate">{isolatedComponent.filePath}</span>
        <div className="flex-1" />
        <button
          onClick={exitIsolation}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
        >
          <Icon icon="lucide:minimize-2" width={11} height={11} />
          Exit
        </button>
      </div>

      {/* Isolated render area */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-6 overflow-auto bg-white dark:bg-[#1a1a1a]">
        {isolatedComponent.code ? (
          <div className="w-full max-w-2xl">
            <pre className="text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--bg)] rounded-lg p-4 border border-[var(--border)] overflow-auto max-h-full">
              {isolatedComponent.code}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] flex items-center justify-center">
              <Icon icon="lucide:component" width={24} height={24} className="text-[var(--brand)]" />
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--text-primary)]">{isolatedComponent.name}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">Component isolated from {isolatedComponent.filePath}</p>
            </div>
            {Object.keys(isolatedComponent.props).length > 0 && (
              <div className="mt-2 text-left w-full max-w-sm">
                <p className="text-[9px] uppercase tracking-wider font-medium text-[var(--text-disabled)] mb-1">Props</p>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[10px] text-[var(--text-secondary)]">
                  {Object.entries(isolatedComponent.props).map(([key, val]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-[var(--brand)]">{key}</span>
                      <span className="text-[var(--text-disabled)]">=</span>
                      <span className="text-[var(--text-tertiary)] truncate">{JSON.stringify(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
