'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import { Icon } from '@iconify/react'
import { useEditor } from '@/context/editor-context'
import { useTheme } from '@/context/theme-context'
import { registerEditorTheme } from '@/lib/monaco-theme'
import { useGateway } from '@/context/gateway-context'
import { createInlineCompletionsProvider } from '@/lib/inline-completions'
import { InlineEdit } from '@/components/inline-edit'
import { MarkdownPreview } from '@/components/markdown-preview'
import { MarkdownModeToggle, type MarkdownViewMode } from '@/components/markdown-mode-toggle'
import { VimCheatsheet } from '@/components/vim-cheatsheet'

export function CodeEditor() {
  const { files, activeFile, updateFileContent } = useEditor()
  const { sendRequest, status: gatewayStatus } = useGateway()
  const [completionsEnabled, setCompletionsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('code-editor:ai-completions') !== 'false'
  })
  const completionsDisposable = useRef<{ dispose: () => void } | null>(null)
  const { version: themeVersion } = useTheme()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoInstanceRef = useRef<Parameters<BeforeMount>[0] | null>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [vimEnabled, setVimEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('code-editor:vim-mode') === 'true'
  })
  const [readOnly, setReadOnly] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('code-editor:read-only') === 'true'
  })
  const vimModeRef = useRef<{ dispose: () => void } | null>(null)
  const vimStatusRef = useRef<HTMLDivElement>(null)
  const [inlineEdit, setInlineEdit] = useState<{
    visible: boolean
    position: { top: number; left: number }
    selectedText: string
    startLine: number
    endLine: number
  }>({ visible: false, position: { top: 0, left: 0 }, selectedText: '', startLine: 0, endLine: 0 })
  const [markdownModes, setMarkdownModes] = useState<Record<string, MarkdownViewMode>>({})
  const [vimCheatsheetOpen, setVimCheatsheetOpen] = useState(false)

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

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monacoInstanceRef.current = monaco
    monaco.languages.typescript?.typescriptDefaults?.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    })
    monaco.languages.typescript?.javascriptDefaults?.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ES2022,
    })
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    registerEditorTheme(monaco)
  }, [])

  // Re-register + reapply Monaco theme when theme context changes
  useEffect(() => {
    const monaco = monacoInstanceRef.current
    if (!monaco) return
    // Small delay so CSS vars have flushed after DOM class/attr change
    const id = requestAnimationFrame(() => {
      registerEditorTheme(monaco)
      monaco.editor.setTheme('code-editor')
    })
    return () => cancelAnimationFrame(id)
  }, [themeVersion])

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()
  }, [])

  // Register AI inline completions
  useEffect(() => {
    if (!monacoReady || !completionsEnabled || gatewayStatus !== 'connected') {
      // Dispose if disabled
      if (completionsDisposable.current) {
        completionsDisposable.current.dispose()
        completionsDisposable.current = null
      }
      return
    }

    let disposed = false
    ;(async () => {
      const monaco = await import('monaco-editor')
      if (disposed) return

      const provider = createInlineCompletionsProvider(
        (method, params) => sendRequest(method, params) as Promise<unknown>
      )

      completionsDisposable.current = monaco.languages.registerInlineCompletionsProvider(
        { pattern: '**' },
        provider
      )
    })()

    return () => {
      disposed = true
      if (completionsDisposable.current) {
        completionsDisposable.current.dispose()
        completionsDisposable.current = null
      }
    }
  }, [monacoReady, completionsEnabled, gatewayStatus, sendRequest])

  // Persist completions preference
  useEffect(() => {
    localStorage.setItem('code-editor:ai-completions', String(completionsEnabled))
  }, [completionsEnabled])

  // ⌘⇧K: Inline edit at selection (global keyboard listener)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const editor = editorRef.current
        if (!editor) return

        const selection = editor.getSelection()
        const model = editor.getModel()
        if (!selection || !model) return

        const selectedText = model.getValueInRange(selection)
        const pos = editor.getScrolledVisiblePosition(selection.getStartPosition())
        const domNode = editor.getDomNode()
        const rect = domNode?.getBoundingClientRect()

        setInlineEdit({
          visible: true,
          position: {
            top: (rect?.top ?? 0) + (pos?.top ?? 0) + (pos?.height ?? 20) + 4,
            left: (rect?.left ?? 0) + (pos?.left ?? 0),
          },
          selectedText: selectedText || model.getLineContent(selection.startLineNumber),
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'v') return
      if (!file || file.kind !== 'text' || !/\.(md|mdx)$/i.test(file.path)) return
      e.preventDefault()
      const current = markdownModes[file.path] ?? 'edit'
      const next: MarkdownViewMode = current === 'edit' ? 'preview' : current === 'preview' ? 'split' : 'edit'
      setMarkdownModes(prev => ({ ...prev, [file.path]: next }))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [file, markdownModes])

  // Vim mode activation
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !monacoReady) return

    // Cleanup previous vim instance
    if (vimModeRef.current) {
      vimModeRef.current.dispose()
      vimModeRef.current = null
    }

    if (!vimEnabled) return

    let disposed = false
    ;(async () => {
      const { initVimMode } = await import('monaco-vim')
      if (disposed || !vimStatusRef.current) return
      vimModeRef.current = initVimMode(editor, vimStatusRef.current)
    })()

    return () => {
      disposed = true
      if (vimModeRef.current) {
        vimModeRef.current.dispose()
        vimModeRef.current = null
      }
    }
  }, [vimEnabled, monacoReady, activeFile])

  // Persist vim mode preference
  useEffect(() => {
    localStorage.setItem('code-editor:vim-mode', String(vimEnabled))
  }, [vimEnabled])

  // Persist read-only preference
  useEffect(() => {
    localStorage.setItem('code-editor:read-only', String(readOnly))
  }, [readOnly])

  // Command palette -> Monaco command bridge
  useEffect(() => {
    const runMonacoAction = async (actionIds: string[]) => {
      const editor = editorRef.current
      if (!editor) return
      for (const actionId of actionIds) {
        const action = editor.getAction(actionId)
        if (!action) continue
        try {
          await action.run()
          return
        } catch {
          // Try the next fallback action id.
        }
      }
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ commandId: string }>).detail
      if (!detail?.commandId) return
      const editor = editorRef.current
      if (!editor) return

      switch (detail.commandId) {
        case 'format-document':
          void runMonacoAction(['editor.action.formatDocument'])
          break
        case 'find-in-file':
          editor.trigger('keyboard', 'actions.find', null)
          break
        case 'replace-in-file':
          editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null)
          break
        case 'toggle-case-sensitive':
          editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null)
          void runMonacoAction(['editor.action.toggleCaseSensitive', 'toggleFindCaseSensitive'])
          break
        case 'toggle-whole-word':
          editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null)
          void runMonacoAction(['editor.action.toggleWholeWord', 'toggleFindWholeWord'])
          break
        case 'toggle-regex':
          editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null)
          void runMonacoAction(['editor.action.toggleRegex', 'toggleFindRegex'])
          break
      }
    }

    window.addEventListener('editor-command', handler)
    return () => window.removeEventListener('editor-command', handler)
  }, [])

  const handleChange = useCallback((value: string | undefined) => {
    if (activeFile && value !== undefined) {
      updateFileContent(activeFile, value)
    }
  }, [activeFile, updateFileContent])

  // Listen for line navigation events from agent panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { startLine, endLine } = (e as CustomEvent).detail
      const editor = editorRef.current
      if (!editor) return
      editor.revealLineInCenter(startLine)
      editor.setSelection({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine ?? startLine,
        endColumn: editor.getModel()?.getLineMaxColumn(endLine ?? startLine) ?? 1,
      })
      editor.focus()
    }
    window.addEventListener('editor-navigate', handler)
    return () => window.removeEventListener('editor-navigate', handler)
  }, [])

  const fileIcon = file?.kind === 'image'
    ? 'lucide:image'
    : file?.kind === 'video'
      ? 'lucide:video'
      : file?.kind === 'audio'
        ? 'lucide:music'
      : 'lucide:file-code'
  const isMarkdown = Boolean(file?.kind === 'text' && /\.(md|mdx)$/i.test(file.path))
  const markdownMode = (file && isMarkdown ? (markdownModes[file.path] ?? 'edit') : 'edit') as MarkdownViewMode

  const setMarkdownMode = (mode: MarkdownViewMode) => {
    if (!file || !isMarkdown) return
    setMarkdownModes(prev => ({ ...prev, [file.path]: mode }))
  }

  const monacoEditor = (
    monacoReady ? (
      <Editor
        key={file?.path}
        path={file?.path}
        height="100%"
        defaultValue={file?.content}
        language={file?.language}
        theme="code-editor"
        onChange={handleChange}
        beforeMount={handleBeforeMount}
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
          readOnly,
          domReadOnly: readOnly,
        }}
      />
    ) : (
      <div className="h-full w-full bg-[var(--bg)]" />
    )
  )

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
      {/* Breadcrumb navigation */}
      <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0">
          <Icon icon={fileIcon} width={12} height={12} className="text-[var(--text-tertiary)] shrink-0" />
          {file.path.split('/').map((segment, i, arr) => (
            <div key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && (
                <Icon icon="lucide:chevron-right" width={10} height={10} className="text-[var(--text-tertiary)]" />
              )}
              <button
                className={`text-[10px] font-mono px-1 py-0.5 rounded transition-colors cursor-pointer ${
                  i === arr.length - 1
                    ? 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
                onClick={() => {
                  if (i < arr.length - 1) {
                    // Navigate to directory — dispatch search with prefix
                    const dirPath = arr.slice(0, i + 1).join('/')
                    window.dispatchEvent(new CustomEvent('quick-open-prefill', { detail: { query: dirPath + '/' } }))
                  }
                }}
                title={arr.slice(0, i + 1).join('/')}
              >
                {segment}
              </button>
            </div>
          ))}
          {file.dirty && (
            <span className="text-[9px] text-[var(--brand)] font-medium ml-1 shrink-0">modified</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* AI completions toggle */}
          <button
            onClick={() => setCompletionsEnabled(v => !v)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              completionsEnabled
                ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={completionsEnabled ? 'AI completions: ON (Tab to accept)' : 'AI completions: OFF'}
          >
            <Icon icon="lucide:sparkles" width={11} height={11} />
            {completionsEnabled ? 'AI' : 'AI'}
          </button>
          {/* Save button */}
          {file.dirty && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('save-file', { detail: { path: file.path } }))}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_20%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)]"
              title="Save file (commit to GitHub)"
            >
              <Icon icon="lucide:save" width={11} height={11} />
              Save
            </button>
          )}
          {/* Read-only toggle */}
          <button
            onClick={() => setReadOnly(v => !v)}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
              readOnly
                ? 'bg-[color-mix(in_srgb,var(--color-deletions)_12%,transparent)] text-[var(--color-deletions)] border border-[color-mix(in_srgb,var(--color-deletions)_30%,transparent)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
            title={readOnly ? 'Read-only — click to edit' : 'Click to make read-only'}
          >
            <Icon icon={readOnly ? 'lucide:lock' : 'lucide:lock-open'} width={10} height={10} />
            {readOnly ? 'RO' : 'RW'}
          </button>
          {/* Vim mode toggle + cheatsheet */}
          <div className="flex items-center">
            <button
              onClick={() => setVimEnabled(v => !v)}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono transition-colors cursor-pointer ${
                vimEnabled
                  ? 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--brand)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)] rounded-l'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] rounded'
              }`}
              title={vimEnabled ? 'Disable Vim mode' : 'Enable Vim mode'}
            >
              VIM
            </button>
            {vimEnabled && (
              <button
                onClick={() => setVimCheatsheetOpen(true)}
                className="px-1 py-0.5 rounded-r border border-l-0 border-[color-mix(in_srgb,var(--brand)_30%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_20%,transparent)] transition-colors cursor-pointer"
                title="Vim Cheatsheet"
              >
                <Icon icon="lucide:help-circle" width={11} height={11} />
              </button>
            )}
          </div>
          {isMarkdown && (
            <MarkdownModeToggle mode={markdownMode} onModeChange={setMarkdownMode} />
          )}
        </div>
      </div>

      {/* ⌘K Inline Edit */}
      <InlineEdit
        visible={inlineEdit.visible}
        position={inlineEdit.position}
        selectedText={inlineEdit.selectedText}
        filePath={file.path}
        onSubmit={(instruction) => {
          // Dispatch to agent with selection context
          window.dispatchEvent(new CustomEvent('inline-edit-request', {
            detail: {
              filePath: file.path,
              instruction,
              selectedText: inlineEdit.selectedText,
              startLine: inlineEdit.startLine,
              endLine: inlineEdit.endLine,
            },
          }))
        }}
        onClose={() => setInlineEdit(prev => ({ ...prev, visible: false }))}
      />

      {/* Preview / Monaco */}
      <div className="flex-1 min-h-0">
        {file.kind === 'image' ? (
          <div className="h-full w-full flex items-center justify-center p-4 bg-[var(--bg-subtle)] overflow-auto">
            {file.content ? (
              <img
                src={file.content}
                alt={file.path.split('/').pop() ?? file.path}
                className="max-w-full max-h-full object-contain rounded border border-[var(--border)] bg-[var(--bg)]"
              />
            ) : (
              <div className="text-center text-[var(--text-tertiary)]">
                <p className="text-[12px]">Image preview unavailable</p>
              </div>
            )}
          </div>
        ) : file.kind === 'video' ? (
          <div className="h-full w-full flex items-center justify-center p-4 bg-[var(--bg-subtle)] overflow-auto">
            {file.content ? (
              <video
                src={file.content}
                controls
                className="max-w-full max-h-full rounded border border-[var(--border)] bg-black"
              />
            ) : (
              <div className="text-center text-[var(--text-tertiary)]">
                <p className="text-[12px]">Video preview unavailable</p>
              </div>
            )}
          </div>
        ) : file.kind === 'audio' ? (
          <div className="h-full w-full flex items-center justify-center p-4 bg-[var(--bg-subtle)] overflow-auto">
            {file.content ? (
              <div className="w-full max-w-[720px] rounded border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-center gap-2 mb-3 text-[var(--text-secondary)]">
                  <Icon icon="lucide:music-2" width={14} height={14} />
                  <span className="text-[12px] truncate">{file.path.split('/').pop() ?? file.path}</span>
                </div>
                <audio src={file.content} controls className="w-full" />
              </div>
            ) : (
              <div className="text-center text-[var(--text-tertiary)]">
                <p className="text-[12px]">Audio preview unavailable</p>
              </div>
            )}
          </div>
        ) : isMarkdown ? (
          markdownMode === 'preview' ? (
            <div className="h-full overflow-auto bg-[var(--bg)]">
              <MarkdownPreview content={file.content} className="max-w-5xl mx-auto p-5" />
            </div>
          ) : markdownMode === 'split' ? (
            <div className="h-full min-h-0 flex">
              <div className="w-1/2 min-w-0 border-r border-[var(--border)]">
                {monacoEditor}
              </div>
              <div className="w-1/2 min-w-0 overflow-auto bg-[var(--bg)]">
                <MarkdownPreview content={file.content} className="max-w-none p-5" />
              </div>
            </div>
          ) : monacoEditor
        ) : (
          monacoEditor
        )}
      </div>

      {/* Vim status bar */}
      {vimEnabled && (
        <div className="flex items-center h-5 px-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
          <div
            ref={vimStatusRef}
            className="text-[10px] font-mono text-[var(--brand)] [&>*]:!text-[10px] [&>*]:!font-mono"
          />
        </div>
      )}

      {/* Vim Cheatsheet */}
      <VimCheatsheet
        open={vimCheatsheetOpen}
        onClose={() => setVimCheatsheetOpen(false)}
      />
    </div>
  )
}
