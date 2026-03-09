'use client'

import React, { type ReactNode, useCallback, useEffect, useRef, useState, Component } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import { Icon } from '@iconify/react'
import { emit } from '@/lib/events'
import { KnotLogo } from '@/components/knot-logo'
import { useEditor } from '@/context/editor-context'
import { useLayout } from '@/context/layout-context'
import { useLocal } from '@/context/local-context'
import { useRepo } from '@/context/repo-context'
import { useTheme } from '@/context/theme-context'
import { installAbortErrorSuppression, isAbortError } from '@/lib/abort-error'
import { registerEditorTheme } from '@/lib/monaco-theme'
import { useGateway } from '@/context/gateway-context'
import { createInlineCompletionsProvider } from '@/lib/inline-completions'
import { showInlineDiff } from '@/lib/inline-diff'
import { formatShortcut } from '@/lib/platform'
import { InlineEdit } from '@/components/inline-edit'
import { MarkdownPreview } from '@/components/markdown-preview'
import { MarkdownModeToggle, type MarkdownViewMode } from '@/components/markdown-mode-toggle'
import '@/lib/clipboard'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'

if (typeof self !== 'undefined' && !(self as any).MonacoEnvironment) {
  const noopDataUrl =
    'data:text/javascript;charset=utf-8,' + encodeURIComponent('self.onmessage=function(){}')
  ;(self as any).MonacoEnvironment = {
    getWorker() {
      try {
        const w = new Worker(noopDataUrl)
        w.onerror = (e) => e.preventDefault()
        return w
      } catch {
        return {
          postMessage() {},
          terminate() {},
          addEventListener() {},
          removeEventListener() {},
        } as unknown as Worker
      }
    },
    getWorkerUrl() {
      return noopDataUrl
    },
  }
}

installAbortErrorSuppression()

class MonacoErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(error: unknown) {
    if (isAbortError(error)) return null
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    if (isAbortError(error)) return
    console.error('[Monaco] Uncaught error:', error)
  }

  render() {
    if (this.state.hasError) {
      return <div className="h-full w-full bg-[var(--bg)]" />
    }
    return this.props.children
  }
}

function WelcomeView() {
  const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const recentFolders = (() => {
    try {
      const raw = localStorage.getItem('code-editor:recent-folders')
      return raw ? (JSON.parse(raw) as string[]).slice(0, 5) : []
    } catch {
      return []
    }
  })()

  const startItems = [
    {
      icon: 'lucide:folder-open',
      label: 'Open Folder',
      hint: formatShortcut('meta+O'),
      action: () => emit('open-folder'),
    },
    {
      icon: 'lucide:file-plus',
      label: 'New File',
      hint: formatShortcut('meta+N'),
      action: () => emit('file-select', { path: 'untitled', sha: '' }),
    },
    {
      icon: 'lucide:search',
      label: 'Quick Open',
      hint: formatShortcut('meta+P'),
      action: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true })),
    },
    ...(isDesktop
      ? [
          {
            icon: 'lucide:terminal',
            label: 'Open Terminal',
            hint: formatShortcut('meta+`'),
            action: () => emit('toggle-terminal'),
          },
        ]
      : []),
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg)] select-none">
      <div className="w-full max-w-[520px] px-8">
        {/* App identity */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 flex items-center justify-center">
            <KnotLogo size={40} />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight">
              KnotCode
            </h1>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              AI-powered code editor by OpenKnots
            </p>
          </div>
        </div>

        {/* Start section */}
        <div className="mb-6">
          <h2 className="text-[11px] font-medium text-[var(--text-disabled)] uppercase tracking-wider mb-2.5">
            Start
          </h2>
          <div className="flex flex-col gap-0.5">
            {startItems.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex items-center gap-2.5 w-full px-2.5 py-1.5 -mx-2.5 rounded-lg text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
              >
                <Icon
                  icon={item.icon}
                  width={14}
                  height={14}
                  className="text-[var(--text-tertiary)] group-hover:text-[var(--brand)] transition-colors shrink-0"
                />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] font-mono text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)]">
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent */}
        {recentFolders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[11px] font-medium text-[var(--text-disabled)] uppercase tracking-wider mb-2.5">
              Recent
            </h2>
            <div className="flex flex-col gap-0.5">
              {recentFolders.map((folder) => {
                const name = folder.split('/').pop() || folder
                const parent = folder.split('/').slice(-2, -1)[0] || ''
                return (
                  <button
                    key={folder}
                    onClick={() => emit('open-recent', { path: folder })}
                    className="flex items-center gap-2.5 w-full px-2.5 py-1.5 -mx-2.5 rounded-lg text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
                  >
                    <Icon
                      icon="lucide:folder"
                      width={14}
                      height={14}
                      className="text-[var(--text-tertiary)] group-hover:text-[var(--brand)] transition-colors shrink-0"
                    />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-[10px] text-[var(--text-disabled)] truncate max-w-[140px]">
                      {parent}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Agent */}
        <div className="mb-6">
          <h2 className="text-[11px] font-medium text-[var(--text-disabled)] uppercase tracking-wider mb-2.5">
            Agent
          </h2>
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true }))
            }}
            className="flex items-center gap-2.5 w-full px-2.5 py-1.5 -mx-2.5 rounded-lg text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer group"
          >
            <Icon
              icon="lucide:bot"
              width={14}
              height={14}
              className="text-[var(--text-tertiary)] group-hover:text-[var(--brand)] transition-colors shrink-0"
            />
            <span className="flex-1">Open Agent Panel</span>
            <span className="text-[10px] font-mono text-[var(--text-disabled)] group-hover:text-[var(--text-tertiary)]">
              {formatShortcut('meta+J')}
            </span>
          </button>
          <div className="flex gap-1.5 mt-2 px-2.5">
            {['/edit', '/explain', '/generate', '/search'].map((cmd) => (
              <span
                key={cmd}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-disabled)]"
              >
                {cmd}
              </span>
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div>
          <h2 className="text-[11px] font-medium text-[var(--text-disabled)] uppercase tracking-wider mb-2.5">
            Keyboard
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
            {[
              ['meta+P', 'Quick Open'],
              ['meta+B', 'Toggle Explorer'],
              ['meta+J', 'Toggle Agent'],
              ['meta+K', 'Inline Edit'],
              ['meta+S', 'Save'],
              ['meta+shift+F', 'Search Files'],
              ['meta+`', 'Terminal'],
              ['?', 'All Shortcuts'],
            ].map(([combo, label]) => (
              <div key={combo} className="flex items-center gap-2 py-0.5">
                <kbd className="inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-subtle)] text-[9px] font-mono text-[var(--text-tertiary)] shrink-0">
                  {formatShortcut(combo)}
                </kbd>
                <span className="text-[var(--text-disabled)]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CodeEditor() {
  const { files, activeFile, updateFileContent } = useEditor()
  const { sendRequest, status: gatewayStatus } = useGateway()
  const layout = useLayout()
  const local = useLocal()
  const { repo } = useRepo()
  const [completionsEnabled, setCompletionsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('code-editor:ai-completions') !== 'false'
  })
  const completionsDisposable = useRef<{ dispose: () => void } | null>(null)
  const { version: themeVersion } = useTheme()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoInstanceRef = useRef<Parameters<BeforeMount>[0] | null>(null)
  const [monacoReady, setMonacoReady] = useState(false)
  const [readOnly, setReadOnly] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('code-editor:read-only') === 'true'
  })
  const inlineDiffRef = useRef<{
    dispose: () => void
    accept: () => void
    reject: () => void
  } | null>(null)
  const [diffBar, setDiffBar] = useState(false)
  const [selToolbar, setSelToolbar] = useState<{
    visible: boolean
    top: number
    left: number
    text: string
    sl: number
    el: number
  }>({ visible: false, top: 0, left: 0, text: '', sl: 0, el: 0 })
  const [inlineEdit, setInlineEdit] = useState<{
    visible: boolean
    position: { top: number; left: number }
    selectedText: string
    startLine: number
    endLine: number
  }>({ visible: false, position: { top: 0, left: 0 }, selectedText: '', startLine: 0, endLine: 0 })
  const [markdownModes, setMarkdownModes] = useState<Record<string, MarkdownViewMode>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  const getEditor = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return null
    try {
      editor.getModel()
      return editor
    } catch {
      editorRef.current = null
      return null
    }
  }, [])

  // Inline AI diff UX (baseline): show agent proposals as inline editor decorations
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { proposals?: Array<{ filePath: string; content: string }> }
        | undefined
      const proposals = detail?.proposals ?? []
      if (!proposals.length) return
      const editor = getEditor()
      const monaco = monacoInstanceRef.current
      if (!editor || !monaco) return

      const currentPath = activeFile
      const match =
        (currentPath ? proposals.find((p) => p.filePath === currentPath) : undefined) ??
        proposals[0]
      if (!match?.filePath) return

      // Only show inline diff for the currently open file to avoid surprising navigation.
      if (currentPath && match.filePath !== currentPath) return

      const existing = files.find((f) => f.path === match.filePath)
      if (!existing || existing.kind !== 'text') return

      try {
        inlineDiffRef.current?.dispose()
        const res = showInlineDiff(
          editor,
          monaco as any,
          existing.content,
          match.content,
          () => {
            setDiffBar(false)
            try {
              updateFileContent(existing.path, editor.getModel()?.getValue() ?? match.content)
            } catch {}
            inlineDiffRef.current = null
          },
          () => {
            setDiffBar(false)
            try {
              updateFileContent(existing.path, editor.getModel()?.getValue() ?? existing.content)
            } catch {}
            inlineDiffRef.current = null
          },
        )
        inlineDiffRef.current = res
        setDiffBar(true)
      } catch (err) {
        console.warn('Failed to show inline diff:', err)
      }
    }
    window.addEventListener('show-inline-diff', handler)
    return () => window.removeEventListener('show-inline-diff', handler)
  }, [activeFile, files, getEditor, updateFileContent])

  // Keyboard reject: Esc closes current inline diff review.
  useEffect(() => {
    if (!diffBar) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!inlineDiffRef.current) return
      e.preventDefault()
      inlineDiffRef.current.reject()
      setDiffBar(false)
      inlineDiffRef.current = null
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [diffBar])

  // Keyboard-first: allow global shortcuts to focus the editor region.
  useEffect(() => {
    const handler = () => {
      const editor = getEditor()
      if (editor) {
        editor.focus()
        return
      }
      containerRef.current?.focus()
    }
    window.addEventListener('focus-editor', handler)
    return () => window.removeEventListener('focus-editor', handler)
  }, [getEditor])

  useEffect(() => {
    let mounted = true

    const initMonaco = async () => {
      const base = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/esm/vs'
      const workerUrls: Record<string, string> = {
        editor: `${base}/editor/editor.worker.js`,
        json: `${base}/language/json/json.worker.js`,
        css: `${base}/language/css/css.worker.js`,
        html: `${base}/language/html/html.worker.js`,
        typescript: `${base}/language/typescript/ts.worker.js`,
      }

      const workerDataUrls = new Map<string, string>()
      await Promise.all(
        Object.entries(workerUrls).map(async ([key, url]) => {
          try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
            const text = await res.text()
            if (!text || text.length < 100) throw new Error(`Empty/truncated response for ${url}`)
            workerDataUrls.set(
              key,
              URL.createObjectURL(new Blob([text], { type: 'text/javascript' })),
            )
          } catch (err) {
            console.warn(`[Monaco] Failed to fetch worker "${key}":`, err)
          }
        }),
      )

      const noopDataUrl =
        'data:text/javascript;charset=utf-8,' + encodeURIComponent('self.onmessage=function(){}')

      const createFallbackWorker = () => {
        try {
          const w = new Worker(noopDataUrl)
          w.onerror = (e) => e.preventDefault()
          return w
        } catch {
          return {
            postMessage() {},
            terminate() {},
            addEventListener() {},
            removeEventListener() {},
          } as unknown as Worker
        }
      }

      self.MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
          const labelMap: Record<string, string> = {
            json: 'json',
            css: 'css',
            scss: 'css',
            less: 'css',
            html: 'html',
            handlebars: 'html',
            razor: 'html',
            typescript: 'typescript',
            javascript: 'typescript',
          }
          const key = labelMap[label] || 'editor'
          const dataUrl = workerDataUrls.get(key) ?? workerDataUrls.get('editor')
          if (!dataUrl) return createFallbackWorker()
          try {
            const w = new Worker(dataUrl)
            w.onerror = (e) => {
              e.preventDefault()
              e.stopImmediatePropagation()
            }
            return w
          } catch {
            return createFallbackWorker()
          }
        },
      }

      const monaco = await import('monaco-editor')
      loader.config({ monaco })

      if (mounted) setMonacoReady(true)
    }

    void initMonaco().catch((err) => {
      if (!isAbortError(err)) console.error('[Monaco] init failed:', err)
    })

    return () => {
      mounted = false
    }
  }, [])

  const file = files.find((f) => f.path === activeFile)

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

    editor.onDidChangeCursorPosition((e) => {
      emit('cursor-change', { line: e.position.lineNumber, column: e.position.column })
    })

    const monaco = monacoInstanceRef.current
    // ⌘L: Send selection to agent chat
    if (monaco)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
        const sel = editor.getSelection()
        const model = editor.getModel()
        if (!sel || sel.isEmpty() || !model) return
        emit('add-to-chat', {
          path: activeFile || 'untitled',
          content: model.getValueInRange(sel),
          startLine: sel.startLineNumber,
          endLine: sel.endLineNumber,
        })
      })

    // Accept/Reject inline diff shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (inlineDiffRef.current) inlineDiffRef.current.accept()
    })

    // Selection toolbar
    editor.onDidChangeCursorSelection((e) => {
      const sel = e.selection
      const model = editor.getModel()
      if (!sel || sel.isEmpty() || !model) {
        setSelToolbar((p) => (p.visible ? { ...p, visible: false } : p))
        return
      }
      const pos = editor.getScrolledVisiblePosition(sel.getStartPosition())
      const dom = editor.getDomNode()
      if (!pos || !dom) return
      const rect = dom.getBoundingClientRect()
      setSelToolbar({
        visible: true,
        top: rect.top + pos.top - 36,
        left: rect.left + pos.left,
        text: model.getValueInRange(sel),
        sl: sel.startLineNumber,
        el: sel.endLineNumber,
      })
    })
    editor.focus()

    // Override clipboard actions to use Tauri plugin instead of browser API
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (isTauri && monaco) {
      editor.addAction({
        id: 'tauri-clipboard-copy',
        label: 'Copy',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
        run: (ed) => {
          const sel = ed.getSelection()
          const model = ed.getModel()
          if (!sel || !model) return
          const text = sel.isEmpty()
            ? model.getLineContent(sel.startLineNumber)
            : model.getValueInRange(sel)
          writeText(text).catch(() => {})
        },
      })
      editor.addAction({
        id: 'tauri-clipboard-cut',
        label: 'Cut',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
        run: (ed) => {
          const sel = ed.getSelection()
          const model = ed.getModel()
          if (!sel || !model) return
          const text = sel.isEmpty()
            ? model.getLineContent(sel.startLineNumber)
            : model.getValueInRange(sel)
          writeText(text).catch(() => {})
          if (sel.isEmpty()) {
            ed.executeEdits('tauri-cut', [
              {
                range: new monaco.Range(sel.startLineNumber, 1, sel.startLineNumber + 1, 1),
                text: '',
              },
            ])
          } else {
            ed.executeEdits('tauri-cut', [
              {
                range: sel,
                text: '',
              },
            ])
          }
        },
      })
      editor.addAction({
        id: 'tauri-clipboard-paste',
        label: 'Paste',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
        run: async (ed) => {
          try {
            const text = await readText()
            if (!text) return
            const sel = ed.getSelection()
            if (!sel) return
            ed.executeEdits('tauri-paste', [
              {
                range: sel,
                text,
              },
            ])
          } catch {
            /* ignore */
          }
        },
      })
    }

    editor.onDidDispose(() => {
      if (editorRef.current === editor) {
        editorRef.current = null
      }
    })
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
        (method, params) => sendRequest(method, params) as Promise<unknown>,
      )

      const disposable = monaco.languages.registerInlineCompletionsProvider(
        { pattern: '**' },
        provider,
      )

      if (disposed) {
        disposable.dispose()
        return
      }
      completionsDisposable.current = disposable
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
        const editor = getEditor()
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
  }, [getEditor])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'v') return
      if (!file || file.kind !== 'text' || !/\.(md|mdx)$/i.test(file.path)) return
      e.preventDefault()
      const current = markdownModes[file.path] ?? 'edit'
      const next: MarkdownViewMode =
        current === 'edit' ? 'preview' : current === 'preview' ? 'split' : 'edit'
      setMarkdownModes((prev) => ({ ...prev, [file.path]: next }))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [file, markdownModes])

  // Persist read-only preference
  useEffect(() => {
    localStorage.setItem('code-editor:read-only', String(readOnly))
  }, [readOnly])

  // Command palette -> Monaco command bridge
  useEffect(() => {
    const runMonacoAction = async (actionIds: string[]) => {
      const editor = getEditor()
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
      const editor = getEditor()
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
  }, [getEditor])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (activeFile && value !== undefined) {
        updateFileContent(activeFile, value)
      }
    },
    [activeFile, updateFileContent],
  )

  // Listen for line navigation events from agent panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { startLine, endLine } = (e as CustomEvent).detail
      const editor = getEditor()
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
  }, [getEditor])

  const fileIcon =
    file?.kind === 'image'
      ? 'lucide:image'
      : file?.kind === 'video'
        ? 'lucide:video'
        : file?.kind === 'audio'
          ? 'lucide:music'
          : 'lucide:file-code'
  const isMarkdown = Boolean(file?.kind === 'text' && /\.(md|mdx)$/i.test(file.path))
  const markdownMode = (
    file && isMarkdown ? (markdownModes[file.path] ?? 'edit') : 'edit'
  ) as MarkdownViewMode

  const setMarkdownMode = (mode: MarkdownViewMode) => {
    if (!file || !isMarkdown) return
    setMarkdownModes((prev) => ({ ...prev, [file.path]: mode }))
  }

  const monacoEditor = monacoReady ? (
    <MonacoErrorBoundary>
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
          lineHeight: 22,
          letterSpacing: 0.2,
          fontFamily:
            (typeof window !== 'undefined'
              ? getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
              : '') || "'JetBrains Mono', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
          guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          cursorStyle: 'line',
          cursorWidth: 2,
          tabSize: 2,
          wordWrap: 'on',
          automaticLayout: true,
          colorDecorators: true,
          linkedEditing: true,
          showFoldingControls: 'mouseover',
          foldingHighlight: true,
          readOnly,
          domReadOnly: readOnly,
        }}
      />
    </MonacoErrorBoundary>
  ) : (
    <div className="h-full w-full bg-[var(--bg)]" />
  )

  if (!file) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <WelcomeView />
      </div>
    )
  }

  const rootLabel = (() => {
    if (local.localMode && local.rootPath) {
      const parts = local.rootPath.split(/[\\/]/).filter(Boolean)
      return parts[parts.length - 1] ?? 'Project'
    }
    if (repo?.repo) return repo.repo
    if (repo?.fullName) return repo.fullName
    return 'Repo'
  })()
  const isCompactBreadcrumb = layout.isAtMost('lte640')

  return (
    <div ref={containerRef} tabIndex={-1} className="flex-1 flex flex-col min-h-0 outline-none">
      {/* Breadcrumb navigation */}
      <div className="flex items-center justify-between gap-2 px-3 py-0.5 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0">
          <Icon
            icon={fileIcon}
            width={12}
            height={12}
            className="text-[var(--text-tertiary)] shrink-0 mr-0.5"
          />
          {(() => {
            const parts = file.path.split('/').filter(Boolean)
            const crumbs = [
              { label: rootLabel, prefix: '' },
              ...parts.map((label, idx) => ({ label, prefix: parts.slice(0, idx + 1).join('/') })),
            ]
            const visible = isCompactBreadcrumb
              ? [
                  crumbs[0]!,
                  ...(crumbs.length > 3 ? [{ label: '…', prefix: '__ellipsis__' }] : []),
                  ...crumbs.slice(-2),
                ]
              : crumbs

            return visible.map((c, i) => {
              const isEllipsis = c.prefix === '__ellipsis__'
              const isLast = i === visible.length - 1
              const title = isEllipsis ? file.path : c.prefix ? c.prefix : rootLabel
              return (
                <div key={`${c.prefix}:${i}`} className="flex items-center gap-0.5 shrink-0">
                  {i > 0 && (
                    <Icon
                      icon="lucide:chevron-right"
                      width={8}
                      height={8}
                      className="text-[var(--text-disabled)]"
                    />
                  )}
                  {isEllipsis ? (
                    <span
                      className="text-[10px] font-mono px-1 py-0.5 rounded text-[var(--text-disabled)]"
                      title={title}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      className={`text-[10px] font-mono px-1 py-0.5 rounded transition-all duration-150 cursor-pointer ${
                        isLast
                          ? 'text-[var(--text-primary)] font-medium hover:bg-[var(--bg-subtle)]'
                          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                      onClick={() => {
                        if (isLast) {
                          emit('focus-editor')
                          return
                        }
                        // Root or folder: open explorer context and prefill search to that folder.
                        layout.show('tree')
                        requestAnimationFrame(() => emit('focus-tree'))
                        if (c.prefix) {
                          emit('explorer-search', { query: c.prefix + '/' })
                        } else {
                          emit('explorer-search', { query: '' })
                        }
                      }}
                      title={title}
                    >
                      {c.label}
                    </button>
                  )}
                </div>
              )
            })
          })()}
          {file.dirty && (
            <span className="flex items-center gap-1 text-[9px] text-[var(--brand)] font-medium ml-1.5 shrink-0 px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]">
              <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
              modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* AI completions toggle */}
          <button
            onClick={() => setCompletionsEnabled((v) => !v)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              completionsEnabled
                ? 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={
              completionsEnabled ? 'AI completions: ON (Tab to accept)' : 'AI completions: OFF'
            }
          >
            <Icon icon="lucide:sparkles" width={11} height={11} />
            {completionsEnabled ? 'AI' : 'AI'}
          </button>
          {/* Save button */}
          {file.dirty && (
            <button
              onClick={() => emit('save-file', { path: file.path })}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_20%,transparent)] border border-[color-mix(in_srgb,var(--brand)_25%,transparent)]"
              title="Save file (commit to GitHub)"
            >
              <Icon icon="lucide:save" width={11} height={11} />
              Save
            </button>
          )}
          {/* Read-only toggle */}
          <button
            onClick={() => setReadOnly((v) => !v)}
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

          {isMarkdown && <MarkdownModeToggle mode={markdownMode} onModeChange={setMarkdownMode} />}
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
          emit('inline-edit-request', {
            filePath: file.path,
            instruction,
            selectedText: inlineEdit.selectedText,
            startLine: inlineEdit.startLine,
            endLine: inlineEdit.endLine,
          })
        }}
        onClose={() => setInlineEdit((prev) => ({ ...prev, visible: false }))}
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
                  <span className="text-[12px] truncate">
                    {file.path.split('/').pop() ?? file.path}
                  </span>
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
              <div className="w-1/2 min-w-0 border-r border-[var(--border)]">{monacoEditor}</div>
              <div className="w-1/2 min-w-0 overflow-auto bg-[var(--bg)]">
                <MarkdownPreview content={file.content} className="max-w-none p-5" />
              </div>
            </div>
          ) : (
            monacoEditor
          )
        ) : (
          monacoEditor
        )}
      </div>

      {/* Inline diff accept/reject bar */}
      {diffBar && inlineDiffRef.current && (
        <div className="absolute top-2 right-4 z-50 flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
          <span className="text-[10px] text-[var(--text-secondary)] mr-1">Review changes</span>
          <button
            onClick={() => inlineDiffRef.current?.accept()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--color-additions)] text-[var(--on-additions)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Icon icon="lucide:check" width={11} height={11} />
            Accept
          </button>
          <button
            onClick={() => inlineDiffRef.current?.reject()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--color-deletions)] text-[var(--on-deletions)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Icon icon="lucide:x" width={11} height={11} />
            Reject
          </button>
          <span className="text-[8px] text-[var(--text-disabled)] ml-1">
            {formatShortcut('meta+Enter')} accept · Esc reject
          </span>
        </div>
      )}

      {/* Selection action toolbar */}
      {selToolbar.visible && selToolbar.text && (
        <div
          className="fixed z-[100] flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl"
          style={{ top: Math.max(8, selToolbar.top), left: Math.max(8, selToolbar.left) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {[
            {
              icon: 'lucide:message-square',
              tip: `Add to Chat (${formatShortcut('meta+L')})`,
              ev: 'add-to-chat',
              detail: {
                path: activeFile || 'untitled',
                content: selToolbar.text,
                startLine: selToolbar.sl,
                endLine: selToolbar.el,
              },
            },
            {
              icon: 'lucide:pencil',
              tip: `Edit (${formatShortcut('meta+K')})`,
              ev: 'inline-edit-request',
              detail: { text: selToolbar.text },
            },
            {
              icon: 'lucide:book-open',
              tip: 'Explain',
              ev: 'add-to-chat',
              detail: {
                path: activeFile || 'untitled',
                content: selToolbar.text,
                startLine: selToolbar.sl,
                endLine: selToolbar.el,
              },
              agentCmd: '/explain ',
            },
            {
              icon: 'lucide:bug',
              tip: 'Fix',
              ev: 'add-to-chat',
              detail: {
                path: activeFile || 'untitled',
                content: selToolbar.text,
                startLine: selToolbar.sl,
                endLine: selToolbar.el,
              },
              agentCmd: '/fix ',
            },
          ].map((item) => (
            <button
              key={item.tip}
              onClick={() => {
                window.dispatchEvent(new CustomEvent(item.ev, { detail: item.detail }))
                if ((item as any).agentCmd)
                  emit('set-agent-input', { text: (item as any).agentCmd })
                setSelToolbar((p) => ({ ...p, visible: false }))
              }}
              title={item.tip}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            >
              <Icon icon={item.icon} width={12} height={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
