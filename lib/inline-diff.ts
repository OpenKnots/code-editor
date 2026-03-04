/**
 * Inline diff decorations for Monaco editor.
 * Shows agent-proposed changes as green (added) / red (removed) highlights
 * directly in the editor, Cursor-style.
 */

type Monaco = typeof import('monaco-editor')
type IStandaloneCodeEditor = import('monaco-editor').editor.IStandaloneCodeEditor

export interface InlineDiffResult {
  /** Dispose decorations and widgets */
  dispose: () => void
  /** Accept the proposed changes */
  accept: () => void
  /** Reject and restore original */
  reject: () => void
}

/**
 * Apply inline diff decorations showing proposed changes.
 * Returns controls to accept, reject, or dispose.
 */
export function showInlineDiff(
  editor: IStandaloneCodeEditor,
  monaco: Monaco,
  originalContent: string,
  proposedContent: string,
  onAccept?: () => void,
  onReject?: () => void,
): InlineDiffResult {
  const model = editor.getModel()
  if (!model) throw new Error('No editor model')

  const origLines = originalContent.split('\n')
  const propLines = proposedContent.split('\n')
  const sameLineCount = origLines.length === propLines.length

  const buildDecorations = (a: string[], b: string[]) => {
    const decorations: import('monaco-editor').editor.IModelDeltaDecoration[] = []
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      const left = a[i]
      const right = b[i]
      const lineNumber = i + 1

      if (left === undefined && right !== undefined) {
        decorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'inline-diff-added',
            glyphMarginClassName: 'inline-diff-glyph-added',
            minimap: { color: '#22c55e40', position: 2 },
          },
        })
        continue
      }
      if (right === undefined && left !== undefined) {
        if (i < model.getLineCount()) {
          decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
            options: {
              isWholeLine: true,
              className: 'inline-diff-removed',
              glyphMarginClassName: 'inline-diff-glyph-removed',
              minimap: { color: '#ef444440', position: 2 },
            },
          })
        }
        continue
      }
      if (left !== right) {
        if (i < model.getLineCount()) {
          decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
            options: {
              isWholeLine: true,
              className: 'inline-diff-modified',
              glyphMarginClassName: 'inline-diff-glyph-modified',
              minimap: { color: '#eab30840', position: 2 },
            },
          })
        }
      }
    }
    return decorations
  }

  const buildHunks = (a: string[], b: string[]) => {
    const changed: number[] = []
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      if (a[i] !== b[i]) changed.push(i + 1)
    }
    const hunks: Array<{ startLine: number; endLine: number }> = []
    for (const ln of changed) {
      const last = hunks[hunks.length - 1]
      if (!last || ln > last.endLine + 1) hunks.push({ startLine: ln, endLine: ln })
      else last.endLine = ln
    }
    return hunks
  }

  let decorationIds: string[] = []
  let widgets: import('monaco-editor').editor.IContentWidget[] = []

  const applyDecorationsAndWidgets = () => {
    const currentLines = model.getValue().split('\n')
    const decorations = buildDecorations(origLines, currentLines)
    decorationIds = editor.deltaDecorations(decorationIds, decorations)

    // Clean old widgets
    for (const w of widgets) editor.removeContentWidget(w)
    widgets = []

    // Pragmatic baseline: per-hunk controls only when line counts match.
    if (!sameLineCount) return

    const hunks = buildHunks(origLines, currentLines)
    widgets = hunks.map((h, idx) => {
      const dom = document.createElement('div')
      dom.className = 'inline-diff-hunk-widget tauri-no-drag'
      dom.innerHTML = `
        <span class="inline-diff-hunk-label">Hunk ${idx + 1}</span>
        <button class="inline-diff-hunk-btn inline-diff-hunk-accept" type="button">Accept</button>
        <button class="inline-diff-hunk-btn inline-diff-hunk-reject" type="button">Reject</button>
      `

      const onAcceptHunk = () => {
        // Ensure this hunk matches the proposed content.
        const text = propLines.slice(h.startLine - 1, h.endLine).join('\n')
        editor.executeEdits('inline-diff-hunk', [{
          range: new monaco.Range(h.startLine, 1, h.endLine, model.getLineMaxColumn(h.endLine)),
          text,
          forceMoveMarkers: true,
        }])
        applyDecorationsAndWidgets()
      }

      const onRejectHunk = () => {
        const text = origLines.slice(h.startLine - 1, h.endLine).join('\n')
        editor.executeEdits('inline-diff-hunk', [{
          range: new monaco.Range(h.startLine, 1, h.endLine, model.getLineMaxColumn(h.endLine)),
          text,
          forceMoveMarkers: true,
        }])
        applyDecorationsAndWidgets()
      }

      dom.querySelector('.inline-diff-hunk-accept')?.addEventListener('click', onAcceptHunk)
      dom.querySelector('.inline-diff-hunk-reject')?.addEventListener('click', onRejectHunk)

      const widget: import('monaco-editor').editor.IContentWidget = {
        getId: () => `inline-diff-hunk-${idx}-${h.startLine}`,
        getDomNode: () => dom,
        getPosition: () => ({
          position: { lineNumber: h.startLine, column: 1 },
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
        }),
      }
      editor.addContentWidget(widget)
      return widget
    })
  }

  // Apply content change (show proposed) and decorations
  const currentContent = model.getValue()
  model.setValue(proposedContent)
  applyDecorationsAndWidgets()

  // Scroll to first change
  const hunks = buildHunks(origLines, model.getValue().split('\n'))
  if (hunks[0]) editor.revealLineInCenter(hunks[0].startLine)

  return {
    dispose: () => {
      editor.deltaDecorations(decorationIds, [])
      for (const w of widgets) editor.removeContentWidget(w)
      widgets = []
    },
    accept: () => {
      editor.deltaDecorations(decorationIds, [])
      for (const w of widgets) editor.removeContentWidget(w)
      widgets = []
      // Content already set to proposed
      onAccept?.()
    },
    reject: () => {
      editor.deltaDecorations(decorationIds, [])
      for (const w of widgets) editor.removeContentWidget(w)
      widgets = []
      model.setValue(currentContent)
      onReject?.()
    },
  }
}
