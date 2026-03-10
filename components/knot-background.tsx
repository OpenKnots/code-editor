'use client'

/**
 * Ambient gradient background for ChatHome
 * True black with subtle blue-purple radial glow in center
 * Optional animated grain texture for living feel
 */
export function KnotBackground() {
  return (
    <div className="knot-bg-root" aria-hidden="true">
      {/* Ambient radial gradient glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 45%,
              rgba(59, 130, 246, 0.06) 0%,
              rgba(139, 92, 246, 0.03) 40%,
              transparent 70%),
            #000000
          `,
        }}
      />

      {/* Optional subtle grain texture */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          animation: 'grain 8s steps(10) infinite',
        }}
      />
    </div>
  )
}
