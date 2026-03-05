'use client'

/**
 * Minimal loading skeleton shown during initial hydration / dynamic import resolution.
 * Matches the app shell layout to prevent flash of unstyled content.
 */
export function AppSkeleton() {
  const sidebarLineWidths = ['72%', '84%', '67%', '79%', '90%']

  return (
    <div className="flex h-full w-full bg-[var(--bg)] text-[var(--text-primary)] overflow-hidden gap-1.5 p-1.5 animate-pulse">
      {/* Sidebar placeholder */}
      <div className="w-[220px] shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="h-12 border-b border-[var(--border)] px-4 flex items-center">
          <div className="h-3 w-24 rounded bg-[var(--border)]" />
        </div>
        <div className="p-3 space-y-2">
          {sidebarLineWidths.map((width, i) => (
            <div key={i} className="h-2.5 rounded bg-[var(--border)]" style={{ width }} />
          ))}
        </div>
      </div>

      {/* Main content placeholder */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-xl overflow-hidden border border-[var(--border)]">
        {/* Accent line */}
        <div className="h-[2px] shrink-0 bg-[var(--border)]" />

        {/* Tab bar */}
        <div className="flex items-center h-12 bg-[var(--bg-elevated)] shrink-0 px-3 gap-3">
          {['Editor', 'Preview', 'Git'].map((_, i) => (
            <div key={i} className="h-3 w-14 rounded bg-[var(--border)]" />
          ))}
          <div className="flex-1" />
          <div className="h-6 w-20 rounded-full bg-[var(--border)]" />
        </div>

        {/* Content area */}
        <div className="flex-1 bg-[var(--bg)]" />

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 h-[22px] border-t border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="h-2 w-32 rounded bg-[var(--border)]" />
          <div className="h-2 w-20 rounded bg-[var(--border)]" />
        </div>
      </div>
    </div>
  )
}
