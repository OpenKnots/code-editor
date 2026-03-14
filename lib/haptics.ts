export type HapticFeedback = 'light' | 'medium' | 'success' | 'warning'

export function triggerHaptic(kind: HapticFeedback = 'light'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return

  const duration = kind === 'success' ? 18 : kind === 'warning' ? 24 : kind === 'medium' ? 16 : 10

  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration)
    }
  } catch {
    // Graceful no-op on unsupported platforms / webviews.
  }
}
