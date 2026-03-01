'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'

export function CodeEditor() {
  const { files, activeFile, updateFileContent } = useEditor()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  useEffect(() => {
    let mounted = true

    const initMonaco = async () => {
      const monaco = await import('monaco-editor')
      loader.config({ monaco })
      if (mounted) setMonacoReady(true)
    }

    void initMonaco()

    return () => {
      mounted = false
    }
  }, [])

  const file = files.find(f => f.path === activeFile)

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()
  }, [])

  const handleChange = useCallback((value: string | undefined) => {
    if (activeFile && value !== undefined) {
      updateFileContent(activeFile, value)
    }
  }, [activeFile, updateFileContent])

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center bg-[var(--bg)]">
        <Icon icon="lucide:code" width={48} height={48} className="text-[var(--text-tertiary)] mb-4" />
        <p className="text-[14px] font-medium text-[var(--text-secondary)]">No file open</p>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-1 max-w-[280px]">
          Select a file from the explorer or use the agent to generate code
        </p>
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          {['/edit', '/explain', '/generate', '/search'].map(cmd => (
            <span key={cmd} className="text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)]">
              {cmd}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* File path bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <Icon icon="lucide:file-code" width={12} height={12} className="text-[var(--text-tertiary)]" />
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">{file.path}</span>
        {file.dirty && (
          <span className="text-[9px] text-[var(--brand)] font-medium">modified</span>
        )}
      </div>

      {/* Monaco */}
      <div className="flex-1 min-h-0">
        {monacoReady ? (
          <Editor
            key={file.path}
            height="100%"
            defaultValue={file.content}
            language={file.language}
            theme="vs-dark"
            onChange={handleChange}
            onMount={handleMount}
            options={{
              fontSize: 13,
              fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              guides: { indentation: true, bracketPairs: true },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              tabSize: 2,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="h-full w-full bg-[var(--bg)]" />
        )}
      </div>
    </div>
  )
}
