'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { usePreview } from '@/context/preview-context'
import { useEditor } from '@/context/editor-context'
import { useView } from '@/context/view-context'

/* ─── Keyboard listener (⌘⇧I) ─── */
export function ComponentIsolatorListener() {
  const { isolateComponent } = usePreview()
  const { activeFile, files } = useEditor()
  const { setView } = useView()

  useEffect(() => {
    const handler = () => {
      if (!activeFile) return
      const name = activeFile.split('/').pop()?.replace(/\.\w+$/, '') ?? 'Component'
      const openFile = files.find(f => f.path === activeFile)
      isolateComponent({ name, filePath: activeFile, props: {}, code: openFile?.content })
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
  }, [activeFile, files, isolateComponent, setView])

  return null
}

/* ─── Prop editor row ─── */
function PropField({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-mono text-[var(--brand)] font-medium w-24 shrink-0 truncate" title={name}>{name}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 px-2 py-1 rounded-md text-[11px] font-mono bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-disabled)]"
        placeholder="value"
        spellCheck={false}
      />
    </div>
  )
}

/* ─── Extract export names + props from source ─── */
function extractComponentInfo(code: string) {
  const exports: string[] = []
  // export default function Name / export function Name / export const Name
  const re = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/g
  let m
  while ((m = re.exec(code)) !== null) exports.push(m[1])
  if (exports.length === 0) {
    // Try: module.exports = Name or export default Name
    const fallback = /export\s+default\s+([A-Z]\w*)/.exec(code)
    if (fallback) exports.push(fallback[1])
  }

  // Extract prop names from destructured params: ({ prop1, prop2 }: Props) or ({ prop1, prop2 })
  const propNames: string[] = []
  const propRe = /(?:function|const)\s+[A-Z]\w*\s*(?:=\s*)?(?:\([^)]*\)\s*=>)?\s*\(\s*\{([^}]+)\}/
  const propMatch = propRe.exec(code)
  if (propMatch) {
    propMatch[1].split(',').forEach(p => {
      const name = p.trim().split(/[=:]/)[0].trim()
      if (name && /^[a-zA-Z_$]/.test(name)) propNames.push(name)
    })
  }

  return { exports, propNames }
}

/* ─── Extract imported identifiers from source ─── */
function extractImportedIdentifiers(code: string): string[] {
  const ids: string[] = []
  // Named imports: import { A, B as C } from '...'  (single or multiline)
  const namedRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"]/g
  let m
  while ((m = namedRe.exec(code)) !== null) {
    m[1].split(',').forEach(id => {
      const name = id.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && /^[A-Za-z_$]/.test(name)) ids.push(name)
    })
  }
  // Default imports: import Foo from '...'
  const defaultRe = /import\s+([A-Za-z_$]\w*)\s+from\s+['"][^'"]+['"]/g
  while ((m = defaultRe.exec(code)) !== null) {
    if (m[1] !== 'type') ids.push(m[1])
  }
  return ids
}

/* ─── Strip imports/exports/TS-only syntax so code is plain JS declarations ─── */
function stripForIsolation(code: string): string {
  return code
    // Remove 'use client' / 'use server'
    .replace(/^['"]use (client|server)['"];?\s*/gm, '')
    // Remove import lines (single + multi-line)
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')
    // Remove 'export default ' and 'export ' but keep the declaration
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^export\s+/gm, '')
    // Remove standalone type/interface blocks (TS-only, not valid JS)
    .replace(/^type\s+\w+(?:<[^>]*>)?\s*=\s*[\s\S]*?(?:^[}\]];?\s*$|;\s*$)/gm, '')
    .replace(/^interface\s+\w+(?:<[^>]*>)?\s*(?:extends\s+\w+(?:<[^>]*>)?\s*)?{[\s\S]*?^}\s*$/gm, '')
    // Remove remaining standalone type aliases on a single line
    .replace(/^type\s+\w+(?:<[^>]*>)?\s*=\s*.+$/gm, '')
    // Strip inline type annotations from function params: (x: Type) → (x)
    .replace(/:\s*(?:React\.(?:FC|ReactNode|CSSProperties|MouseEvent|ChangeEvent|KeyboardEvent|RefObject|MutableRefObject|Dispatch|SetStateAction|ComponentProps)\b(?:<[^>]*>)?|string|number|boolean|null|undefined|void|any|never|unknown|object|bigint|symbol|Record<[^>]*>|Array<[^>]*>|Map<[^>]*>|Set<[^>]*>|Promise<[^>]*>|\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*(?:\[\])?)(?=\s*[,)=}])/g, '')
    // Strip return type annotations: ) : Type => or ): Type {
    .replace(/\)\s*:\s*(?:React\.\w+(?:<[^>]*>)?|JSX\.Element|string|number|boolean|void|null|undefined|any|never|unknown|Promise<[^>]*>|\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*)\s*(?=[{=])/g, ') ')
    // Remove `as Type` casts
    .replace(/\s+as\s+(?:const|(?:React\.)?\w+(?:<[^>]*>)?(?:\s*\|\s*\w+(?:<[^>]*>)?)*)/g, '')
    // Remove angle-bracket generics on function calls that TS uses: foo<Type>(...)
    .replace(/(?<=\w)<(?:string|number|boolean|any|unknown|\w+(?:\s*,\s*\w+)*)>(?=\()/g, '')
    // Remove non-null assertions
    .replace(/!(?=\.|\[)/g, '')
}

/* ─── Build shim declarations for imported identifiers that would be undefined ─── */
function buildImportShims(code: string, stripped: string): string {
  const imported = extractImportedIdentifiers(code)
  if (imported.length === 0) return ''

  const reactBuiltins = new Set([
    'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useReducer',
    'useContext', 'useLayoutEffect', 'useId', 'useDeferredValue', 'useTransition',
    'useSyncExternalStore', 'createContext', 'forwardRef', 'memo', 'lazy',
    'Suspense', 'Fragment', 'createElement', 'cloneElement', 'Children',
    'isValidElement', 'React', 'ReactDOM',
  ])

  const defined = new Set<string>()
  const defRe = /(?:function|const|let|var|class)\s+([A-Za-z_$]\w*)/g
  let m
  while ((m = defRe.exec(stripped)) !== null) defined.add(m[1])

  const missing = imported.filter(id => !reactBuiltins.has(id) && !defined.has(id))
  if (missing.length === 0) return ''

  const lines = missing.map(id => {
    if (/^[A-Z]/.test(id)) {
      return `if (typeof ${id} === 'undefined') var ${id} = ({ children, className = '', ...rest }) => React.createElement('div', { className, ...rest }, children);`
    }
    return `if (typeof ${id} === 'undefined') var ${id} = (...args) => args[0];`
  })

  return '// ─── Auto-generated shims for stripped imports ───\n' + lines.join('\n') + '\n'
}

/* ─── Build sandboxed HTML for rendering ─── */
function buildIsolationHtml(code: string, componentName: string, props: Record<string, string>, theme: 'dark' | 'light') {
  const stripped = stripForIsolation(code)
  const shims = buildImportShims(code, stripped)

  // Build JSX props string: <Component foo="bar" count={3} />
  const propsJsx = Object.entries(props)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => {
      const t = v.trim()
      if (/^(true|false|null|undefined)$/.test(t) || /^-?\d/.test(t) || /^[\[{]/.test(t)) {
        return `${k}={${t}}`
      }
      return `${k}=${JSON.stringify(v.replace(/^["']|["']$/g, ''))}`
    })
    .join(' ')

  const bg = theme === 'dark' ? '#0a0a0a' : '#ffffff'
  const fg = theme === 'dark' ? '#e5e5e5' : '#1a1a1a'
  const border = theme === 'dark' ? '#222' : '#e0e0e0'

  // Everything in ONE Babel script block — component def + render in same scope
  const babelSource = `
// ─── Make React hooks + APIs available (since imports are stripped) ───
const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext,
        useLayoutEffect, useId, useDeferredValue, useTransition, useSyncExternalStore,
        createContext, forwardRef, memo, lazy, Suspense, Fragment,
        createElement, cloneElement, Children, isValidElement } = React;

// ─── Stub common external deps so missing imports don't crash ───
const __stub = () => null;
const __stubObj = new Proxy({}, { get: () => __stub });

// Icon libraries
if (typeof Icon === 'undefined') var Icon = (props) =>
  React.createElement('span', { title: props.icon || '', style: { display: 'inline-block', width: props.width || 16, height: props.height || 16 } }, '⬡');

// Next.js stubs
if (typeof Link === 'undefined') var Link = ({ children, href, ...rest }) =>
  React.createElement('a', { href: href || '#', ...rest }, children);
if (typeof Image === 'undefined') var Image = ({ src, alt, width, height, ...rest }) =>
  React.createElement('img', { src, alt, width, height, style: { maxWidth: '100%' }, ...rest });
if (typeof useRouter === 'undefined') var useRouter = () => ({
  push: __stub, replace: __stub, back: __stub, forward: __stub,
  refresh: __stub, prefetch: __stub, pathname: '/', query: {}, asPath: '/',
});
if (typeof usePathname === 'undefined') var usePathname = () => '/';
if (typeof useSearchParams === 'undefined') var useSearchParams = () => new URLSearchParams();
if (typeof useParams === 'undefined') var useParams = () => ({});

// cn / clsx / classnames utility
if (typeof cn === 'undefined') var cn = (...args) => args.filter(Boolean).join(' ');
if (typeof clsx === 'undefined') var clsx = cn;
if (typeof classNames === 'undefined') var classNames = cn;

// fetch stub (allow but warn)
const __origFetch = window.fetch;
window.fetch = (...args) => {
  console.warn('[Isolation] fetch() called — network requests may fail in sandbox:', args[0]);
  return __origFetch(...args);
};

class IsolationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    window.parent.postMessage({ type: '__isolation_error__', message: error.message, stack: error.stack, componentStack: info?.componentStack }, '*');
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', { className: 'error-box' },
        React.createElement('b', null, 'Render error'),
        '\\n\\n',
        this.state.error.message,
        this.state.error.stack ? '\\n\\n' + this.state.error.stack : ''
      );
    }
    return this.props.children;
  }
}

${shims}
${stripped}

// ─── Render ───
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <IsolationErrorBoundary>
    <div className="render-frame">
      <${componentName} ${propsJsx} />
    </div>
  </IsolationErrorBoundary>
);
`

  // JSON-stringify the source for safe embedding, then escape close-script tags
  const jsonSource = JSON.stringify(babelSource).replace(/<\/script/gi, '<\\/script')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"><\/script>
<script crossorigin src="https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js"><\/script>
<script crossorigin src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: ${bg}; color: ${fg};
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 24px;
  }
  #root { width: 100%; max-width: 800px; }
  .error-box {
    padding: 16px; border-radius: 8px; border: 1px solid #ef4444;
    background: rgba(239,68,68,0.08); color: #ef4444;
    font-size: 13px; font-family: monospace; white-space: pre-wrap;
    word-break: break-word;
  }
  .render-frame {
    border: 1px dashed ${border}; border-radius: 8px; padding: 16px;
    min-height: 60px;
  }
</style>
</head>
<body>
<div id="root"></div>
<script>
window.addEventListener('error', function(e) {
  document.getElementById('root').innerHTML =
    '<div class="error-box"><b>Runtime error</b>\\n\\n' + (e.error ? (e.error.stack || e.error.message) : e.message) + '</div>';
  window.parent.postMessage({ type: '__isolation_error__', message: e.error ? e.error.message : e.message, stack: e.error ? e.error.stack : '' }, '*');
});
window.addEventListener('unhandledrejection', function(e) {
  var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection';
  document.getElementById('root').innerHTML =
    '<div class="error-box"><b>Async error</b>\\n\\n' + msg + '</div>';
  window.parent.postMessage({ type: '__isolation_error__', message: msg }, '*');
});
</script>
<script>
(function() {
  var source = ${jsonSource};
  var compiled;
  try {
    compiled = Babel.transform(source, {
      presets: [
        ['typescript', { isTSX: true, allExtensions: true }],
        'react'
      ],
      filename: 'component.tsx',
    }).code;
  } catch (err) {
    document.getElementById('root').innerHTML =
      '<div class="error-box"><b>Babel transform error</b>\\n\\n' + (err.stack || err.message) + '</div>';
    window.parent.postMessage({ type: '__isolation_error__', message: 'Babel: ' + err.message, stack: err.stack }, '*');
    return;
  }
  try {
    new Function(compiled)();
  } catch (err) {
    document.getElementById('root').innerHTML =
      '<div class="error-box"><b>Render error</b>\\n\\n' + (err.stack || err.message) + '</div>';
    window.parent.postMessage({ type: '__isolation_error__', message: err.message, stack: err.stack }, '*');
  }
})();
<\/script>
</body>
</html>`
}

/* ─── Main isolator view ─── */
export function ComponentIsolator() {
  const { isolatedComponent, exitIsolation } = usePreview()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [selectedExport, setSelectedExport] = useState('')
  const [propValues, setPropValues] = useState<Record<string, string>>({})
  const [newPropName, setNewPropName] = useState('')
  const [bgMode, setBgMode] = useState<'dark' | 'light' | 'checker'>('dark')
  const [error, setError] = useState<string | null>(null)

  const info = useMemo(() => {
    if (!isolatedComponent?.code) return { exports: [], propNames: [] }
    return extractComponentInfo(isolatedComponent.code)
  }, [isolatedComponent?.code])

  // Auto-select first export
  useEffect(() => {
    if (info.exports.length > 0 && !selectedExport) {
      setSelectedExport(info.exports[0])
    }
  }, [info.exports, selectedExport])

  // Auto-populate prop fields
  useEffect(() => {
    if (info.propNames.length > 0) {
      setPropValues(prev => {
        const next = { ...prev }
        for (const p of info.propNames) {
          if (!(p in next)) next[p] = ''
        }
        return next
      })
    }
  }, [info.propNames])

  const updateProp = useCallback((name: string, value: string) => {
    setPropValues(prev => ({ ...prev, [name]: value }))
  }, [])

  const addProp = useCallback(() => {
    const n = newPropName.trim()
    if (!n) return
    setPropValues(prev => ({ ...prev, [n]: '' }))
    setNewPropName('')
  }, [newPropName])

  const removeProp = useCallback((name: string) => {
    setPropValues(prev => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const renderComponent = useCallback(() => {
    if (!isolatedComponent?.code || !selectedExport) return
    try {
      setError(null)
      const theme = bgMode === 'checker' ? 'light' : bgMode
      const html = buildIsolationHtml(isolatedComponent.code, selectedExport, propValues, theme)
      const iframe = iframeRef.current
      if (iframe) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        if (iframe.dataset.blobUrl) URL.revokeObjectURL(iframe.dataset.blobUrl)
        iframe.dataset.blobUrl = url
        iframe.src = url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [isolatedComponent?.code, selectedExport, propValues, bgMode])

  // Re-render on changes
  useEffect(() => { renderComponent() }, [renderComponent])

  // Listen for error messages posted from the sandboxed iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === '__isolation_error__') {
        setError(e.data.message + (e.data.componentStack ? '\n\nComponent stack:' + e.data.componentStack : ''))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  if (!isolatedComponent) return null

  const bgClass = bgMode === 'checker'
    ? 'bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]'
    : bgMode === 'dark'
      ? 'bg-[#0a0a0a]'
      : 'bg-white'

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
        <Icon icon="lucide:component" width={13} height={13} className="text-[var(--brand)]" />

        {/* Component selector */}
        {info.exports.length > 1 ? (
          <select
            value={selectedExport}
            onChange={e => setSelectedExport(e.target.value)}
            className="text-[11px] font-mono font-semibold text-[var(--text-primary)] bg-transparent border-none outline-none cursor-pointer"
          >
            {info.exports.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span className="text-[11px] font-mono font-semibold text-[var(--text-primary)]">{selectedExport || isolatedComponent.name}</span>
        )}

        <span className="text-[9px] font-mono text-[var(--text-disabled)] truncate max-w-[200px]">{isolatedComponent.filePath}</span>

        <div className="flex-1" />

        {/* Background toggle */}
        <div className="flex items-center gap-px rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] p-[2px]">
          {(['dark', 'light', 'checker'] as const).map(m => (
            <button
              key={m}
              onClick={() => setBgMode(m)}
              className={`px-1.5 py-0.5 rounded-[4px] text-[9px] font-medium cursor-pointer transition-colors ${
                bgMode === m ? 'bg-[var(--bg)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-disabled)] hover:text-[var(--text-tertiary)]'
              }`}
            >
              {m === 'checker' ? '▦' : m === 'dark' ? '●' : '○'}
            </button>
          ))}
        </div>

        {/* Re-render */}
        <button onClick={renderComponent} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer" title="Re-render">
          <Icon icon="lucide:refresh-cw" width={12} height={12} />
        </button>

        {/* Exit */}
        <button onClick={exitIsolation} className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] cursor-pointer" title="Exit isolation (Esc)">
          <Icon icon="lucide:x" width={12} height={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Live render area */}
        <div className={`flex-1 min-w-0 ${bgClass}`}>
          {error ? (
            <div className="p-4">
              <div className="rounded-lg border border-[var(--color-deletions)] bg-[color-mix(in_srgb,var(--color-deletions)_8%,transparent)] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} className="text-[var(--color-deletions)]" />
                  <span className="text-[11px] font-semibold text-[var(--color-deletions)]">Render Error</span>
                </div>
                <pre className="text-[10px] font-mono text-[var(--color-deletions)] whitespace-pre-wrap opacity-80">{error}</pre>
              </div>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
              title={`Isolated: ${selectedExport}`}
            />
          )}
        </div>

        {/* Props panel */}
        <div className="w-56 shrink-0 border-l border-[var(--border)] bg-[var(--bg)] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[9px] font-semibold text-[var(--text-disabled)] uppercase tracking-wider">Props</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {Object.keys(propValues).length === 0 && (
              <p className="text-[10px] text-[var(--text-disabled)] text-center py-4">No props detected.<br/>Add one below.</p>
            )}
            {Object.entries(propValues).map(([name, val]) => (
              <div key={name} className="group relative">
                <PropField name={name} value={val} onChange={v => updateProp(name, v)} />
                <button
                  onClick={() => removeProp(name)}
                  className="absolute -right-0.5 -top-0.5 w-4 h-4 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-disabled)] hover:text-[var(--color-deletions)] hover:border-[var(--color-deletions)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Icon icon="lucide:x" width={8} height={8} />
                </button>
              </div>
            ))}
          </div>

          {/* Add prop */}
          <div className="p-2.5 border-t border-[var(--border)]">
            <div className="flex items-center gap-1">
              <input
                value={newPropName}
                onChange={e => setNewPropName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addProp()}
                placeholder="propName"
                className="flex-1 min-w-0 px-2 py-1 rounded-md text-[10px] font-mono bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-disabled)]"
                spellCheck={false}
              />
              <button
                onClick={addProp}
                disabled={!newPropName.trim()}
                className="p-1 rounded-md bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon icon="lucide:plus" width={11} height={11} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
