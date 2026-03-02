'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useView } from '@/context/view-context'
import { EditorTabs } from '@/components/editor-tabs'
import { SourceSwitcher } from '@/components/source-switcher'

const FileExplorer = dynamic(() => import('@/components/file-explorer').then(m => ({ default: m.FileExplorer })), { ssr: false })
const CodeEditor = dynamic(() => import('@/components/code-editor').then(m => ({ default: m.CodeEditor })), { ssr: false })
const EnginePanel = dynamic(() => import('@/components/engine-panel').then(m => ({ default: m.EnginePanel })), { ssr: false })
const AgentPanel = dynamic(() => import('@/components/agent-panel').then(m => ({ default: m.AgentPanel })), { ssr: false })

export function EditorView() {
  const { files, activeFile } = useEditor()
  const local = useLocal()
  const { repo } = useRepo()
  const { setView } = useView()

  const [treeVisible, setTreeVisible] = useState(true)
  const [treeWidth, setTreeWidth] = useState(() => {
    try { const s = parseInt(localStorage.getItem('ce:tree-w') || ''); return s >= 160 && s <= 400 ? s : 220 } catch { return 220 }
  })
  const [engineVisible, setEngineVisible] = useState(false)
  const [chatVisible, setChatVisible] = useState(() => {
    try { return localStorage.getItem('ce:chat-visible') === 'true' } catch { return false }
  })
  const [chatWidth, setChatWidth] = useState(() => {
    try { const s = parseInt(localStorage.getItem('ce:chat-w') || ''); return s >= 280 && s <= 600 ? s : 360 } catch { return 360 }
  })

  // Persist tree width
  useEffect(() => { try { localStorage.setItem('ce:tree-w', String(treeWidth)) } catch {} }, [treeWidth])
  useEffect(() => { try { localStorage.setItem('ce:chat-visible', String(chatVisible)) } catch {} }, [chatVisible])
  useEffect(() => { try { localStorage.setItem('ce:chat-w', String(chatWidth)) } catch {} }, [chatWidth])

  // ⌘B toggle tree
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setTreeVisible(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i' && !e.shiftKey) { e.preventDefault(); setChatVisible(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hasFiles = files.length > 0 || activeFile
  const branchName = repo?.branch ?? local.gitInfo?.branch ?? null

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
      {/* File Tree */}
      {treeVisible && (
        <div className="shrink-0 bg-[var(--sidebar-bg)] overflow-hidden border-r border-[var(--border)] flex flex-col" style={{ width: treeWidth }}>
          <div className="flex items-center justify-between h-7 px-2.5 border-b border-[var(--border)] shrink-0">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Explorer</span>
            <button onClick={() => setTreeVisible(false)} className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Hide (⌘B)">
              <Icon icon="lucide:panel-left-close" width={11} height={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto"><FileExplorer /></div>
        </div>
      )}

      {/* Tree resize handle */}
      {treeVisible && (
        <div className="resize-handle w-[3px] cursor-col-resize hover:bg-[var(--brand)] transition-all opacity-0 hover:opacity-50 shrink-0 z-10"
          onMouseDown={e => {
            e.preventDefault(); const startX = e.clientX; const startW = treeWidth
            const onMove = (ev: MouseEvent) => setTreeWidth(Math.max(160, Math.min(400, startW + (ev.clientX - startX))))
            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
          }}
        />
      )}

      {/* Editor column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Tree toggle when collapsed */}
        {!treeVisible && (
          <button onClick={() => setTreeVisible(true)} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-3.5 h-10 flex items-center justify-center bg-[var(--bg-elevated)] border border-l-0 border-[var(--border)] rounded-r hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Show explorer (⌘B)">
            <Icon icon="lucide:chevron-right" width={9} height={9} />
          </button>
        )}

        {hasFiles ? (
          <>
            {/* Tabs */}
            <EditorTabs />

            {/* Editor */}
            <div className="flex-1 min-h-0 flex flex-col">
              <CodeEditor />
            </div>

            {/* Engine panel */}
            {engineVisible && (
              <>
                <div className="h-[3px] cursor-row-resize hover:bg-[var(--brand)] transition-colors opacity-0 hover:opacity-50 shrink-0"
                  onMouseDown={e => {
                    e.preventDefault(); const startY = e.clientY; const startH = 240
                    const onMove = (ev: MouseEvent) => { /* engine resize handled locally */ }
                    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
                  }}
                />
                <div className="shrink-0 border-t border-[var(--border)]" style={{ height: 240 }}>
                  <EnginePanel />
                </div>
              </>
            )}
          </>
        ) : (
          /* Empty state — no files open */
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Icon icon="lucide:file-code-2" width={28} height={28} className="text-[var(--text-disabled)] opacity-30" />
            <p className="text-[12px] text-[var(--text-tertiary)]">No file open</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTreeVisible(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--text-disabled)] transition-colors cursor-pointer"
              >
                <Icon icon="lucide:folder" width={11} height={11} />
                Browse files
              </button>
              <span className="text-[10px] text-[var(--text-disabled)]">or</span>
              <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] font-mono text-[var(--text-disabled)]">⌘P</kbd>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center h-6 px-2.5 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0 gap-1">
          <button onClick={() => setTreeVisible(v => !v)} className={`p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] cursor-pointer ${treeVisible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`} title="Explorer (⌘B)">
            <Icon icon="lucide:folder" width={11} height={11} />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('toggle-terminal'))} className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] cursor-pointer text-[var(--text-disabled)]" title="Terminal (⌘J)">
            <Icon icon="lucide:terminal" width={11} height={11} />
          </button>
          <button onClick={() => setEngineVisible(v => !v)} className={`p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] cursor-pointer ${engineVisible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`} title="Engine">
            <Icon icon="lucide:cpu" width={11} height={11} />
          </button>
          <div className="flex-1" />
          <button onClick={() => setChatVisible(v => !v)} className={`p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] cursor-pointer ${chatVisible ? 'text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`} title="Chat (⌘I)">
            <Icon icon="lucide:message-square" width={11} height={11} />
          </button>
          {branchName && (
            <span className="text-[9px] font-mono text-[var(--text-disabled)] flex items-center gap-1 ml-1">
              <Icon icon="lucide:git-branch" width={9} height={9} />{branchName}
            </span>
          )}
        </div>
      </div>

      {/* Chat resize handle */}
      {chatVisible && (
        <div className="resize-handle w-[3px] cursor-col-resize hover:bg-[var(--brand)] transition-all opacity-0 hover:opacity-50 shrink-0 z-10"
          onMouseDown={e => {
            e.preventDefault(); const startX = e.clientX; const startW = chatWidth
            const onMove = (ev: MouseEvent) => setChatWidth(Math.max(280, Math.min(600, startW - (ev.clientX - startX))))
            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
          }}
        />
      )}

      {/* Chat sidebar */}
      {chatVisible && (
        <div className="shrink-0 flex flex-col border-l border-[var(--border)] bg-[var(--bg)] overflow-hidden" style={{ width: chatWidth }}>
          <div className="flex items-center justify-between h-7 px-2.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-disabled)] flex items-center gap-1.5">
              <Icon icon="lucide:bot" width={10} height={10} className="text-[var(--brand)]" />
              Agent
            </span>
            <button onClick={() => setChatVisible(false)} className="p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-disabled)] hover:text-[var(--text-tertiary)] cursor-pointer" title="Hide (⌘I)">
              <Icon icon="lucide:panel-right-close" width={11} height={11} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <AgentPanel />
          </div>
        </div>
      )}
    </div>
  )
}
