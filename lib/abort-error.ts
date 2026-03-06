export function isAbortError(err: unknown): boolean {
  if (typeof err === 'string') {
    const lower = err.toLowerCase()
    if (
      lower === 'canceled' ||
      lower === 'cancelled' ||
      lower.startsWith('canceled:') ||
      lower.startsWith('cancelled:') ||
      lower.includes('the operation was aborted')
    ) {
      return true
    }
  }
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      err.name === 'Canceled' ||
      err.name === 'CancellationError' ||
      err.name === 'CanceledError' ||
      err.message === 'The operation was aborted.' ||
      err.message === 'Canceled' ||
      err.message === 'Cancelled' ||
      err.message.startsWith('Canceled:') ||
      err.message.startsWith('Cancelled:'))
  )
    return true
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    ((err as { message: unknown }).message === 'The operation was aborted.' ||
      (err as { message: unknown }).message === 'Canceled' ||
      (err as { message: unknown }).message === 'Cancelled')
  )
    return true
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name: unknown }).name === 'AbortError' ||
      (err as { name: unknown }).name === 'Canceled' ||
      (err as { name: unknown }).name === 'CancellationError' ||
      (err as { name: unknown }).name === 'CanceledError')
  )
    return true
  return false
}

const ABORT_SUPPRESSION_KEY = '__knotcode_abort_suppression_installed__'

function hasAbortMessage(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value.includes('The operation was aborted') ||
      value.includes('AbortError') ||
      value.includes('Canceled') ||
      value.includes('Cancelled'))
  )
}

export function installAbortErrorSuppression(): void {
  if (typeof window === 'undefined') return

  const target = window as Window & { [ABORT_SUPPRESSION_KEY]?: boolean }
  if (target[ABORT_SUPPRESSION_KEY]) return
  target[ABORT_SUPPRESSION_KEY] = true

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (args.some((arg) => isAbortError(arg) || hasAbortMessage(arg))) return
    originalConsoleError(...args)
  }

  window.addEventListener(
    'error',
    (event) => {
      if (isAbortError(event.error) || hasAbortMessage(event.message)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true,
  )

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isAbortError(event.reason)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true,
  )
}
