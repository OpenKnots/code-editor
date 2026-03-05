'use client'

import { useId, useMemo } from 'react'

const VERTICAL_LOOP =
  'M176 132 C224 80,288 80,336 132 C368 168,368 344,336 380 C288 432,224 432,176 380 C144 344,144 168,176 132Z'

const HORIZONTAL_LOOP =
  'M132 176 C80 224,80 288,132 336 C168 368,344 368,380 336 C432 288,432 224,380 176 C344 144,168 144,132 176Z'

const FLOATERS = [
  { size: 340, x: '-6%', y: '-10%', delay: '0s', dur: '50s' },
  { size: 280, x: '72%', y: '55%', delay: '-20s', dur: '58s' },
  { size: 220, x: '35%', y: '82%', delay: '-35s', dur: '44s' },
] as const

function KnotPaths({ strokeWidth = 14, opacity = 1 }: { strokeWidth?: number; opacity?: number }) {
  return (
    <g
      style={{ stroke: 'var(--brand)' }}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity={opacity}
    >
      <path d={VERTICAL_LOOP} />
      <path d={HORIZONTAL_LOOP} />
      <g transform="rotate(45 256 256)">
        <path d={VERTICAL_LOOP} />
      </g>
      <g transform="rotate(-45 256 256)">
        <path d={VERTICAL_LOOP} />
      </g>
    </g>
  )
}

export function KnotBackground() {
  const uid = useId()
  const pid = useMemo(() => uid.replace(/:/g, ''), [uid])

  return (
    <div className="knot-bg-root" aria-hidden="true">
      {/* Layer 1: tiled knot pattern */}
      <svg
        className="knot-bg-pattern"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern id={`kp${pid}`} width="120" height="120" patternUnits="userSpaceOnUse">
            <svg viewBox="0 0 512 512" width="100" height="100">
              <KnotPaths strokeWidth={12} />
            </svg>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#kp${pid})`} />
      </svg>

      {/* Layer 2: floating blurred knot silhouettes */}
      {FLOATERS.map((f, i) => (
        <div
          key={i}
          className="knot-bg-float"
          style={{
            width: f.size,
            height: f.size,
            left: f.x,
            top: f.y,
            animationDelay: f.delay,
            animationDuration: f.dur,
          }}
        >
          <svg viewBox="0 0 512 512" fill="none" width="100%" height="100%">
            <g
              style={{ stroke: 'var(--mode-accent, var(--brand))' }}
              strokeWidth={36}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            >
              <path d={VERTICAL_LOOP} />
              <path d={HORIZONTAL_LOOP} />
              <g transform="rotate(45 256 256)">
                <path d={VERTICAL_LOOP} />
              </g>
              <g transform="rotate(-45 256 256)">
                <path d={VERTICAL_LOOP} />
              </g>
            </g>
          </svg>
        </div>
      ))}

      {/* Layer 3: mode-accent glow */}
      <div className="knot-bg-glow" />
    </div>
  )
}
