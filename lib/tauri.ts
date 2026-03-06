/**
 * Tauri detection + IPC wrapper
 *
 * In Tauri v2, the runtime injects `__TAURI_INTERNALS__` on the window.
 * `@tauri-apps/api` also re-exports it as `__TAURI__` in some builds.
 * We check both, and also try the API import as a final fallback.
 */

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}

/** Call a Tauri command. Returns null if not in Tauri. */
export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

/** Listen to a Tauri event. Returns unlisten function, or noop if not in Tauri. */
export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<T>(event, (e) => handler(e.payload))
}

/** Read an absolute file path as a base64 string via the local_read_file_base64 command. */
export async function tauriReadFileBase64(absolutePath: string): Promise<string | null> {
  const lastSlash = absolutePath.lastIndexOf('/')
  if (lastSlash < 0) return null
  const root = absolutePath.slice(0, lastSlash) || '/'
  const file = absolutePath.slice(lastSlash + 1)
  return tauriInvoke<string>('local_read_file_base64', { root, path: file })
}

export async function openNewEditorInstance(): Promise<void> {
  if (isTauri()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = `editor-${Date.now()}`
    new WebviewWindow(label, {
      url: 'index.html',
      title: 'KnotCode',
      width: 1440,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      resizable: true,
      decorations: true,
      transparent: true,
    })
    return
  }

  if (typeof window !== 'undefined') {
    window.open('/', '_blank', 'noopener,noreferrer')
  }
}
