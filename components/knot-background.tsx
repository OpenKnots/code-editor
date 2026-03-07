'use client'

import { useId, useMemo } from 'react'

const KNOT_CENTER = 256
const KNOT_STROKE = 28
const KNOT_GAP = KNOT_STROKE + 10
const KNOT_ANGLES = [0, 60, 120, 180, 240, 300]

export function KnotBackground() {
  const uid = useId()
  const pid = useMemo(() => uid.replace(/:/g, ''), [uid])
  const knotLobes = useMemo(() => buildKnotLobes(), [])

  return (
    <div className="knot-bg-root" aria-hidden="true">
      {/* Technical dot grid */}
      <svg className="knot-bg-grid" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        <defs>
          <pattern id={`dotgrid${pid}`} width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="16" cy="16" r="0.6" fill="var(--text-disabled)" opacity="0.3" />
          </pattern>
          <pattern id={`crossgrid${pid}`} width="128" height="128" patternUnits="userSpaceOnUse">
            <line
              x1="64"
              y1="60"
              x2="64"
              y2="68"
              stroke="var(--text-disabled)"
              strokeWidth="0.5"
              opacity="0.15"
            />
            <line
              x1="60"
              y1="64"
              x2="68"
              y2="64"
              stroke="var(--text-disabled)"
              strokeWidth="0.5"
              opacity="0.15"
            />
          </pattern>
          <radialGradient id={`gridmask${pid}`} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="white" stopOpacity="0.7" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`gm${pid}`}>
            <rect width="100%" height="100%" fill={`url(#gridmask${pid})`} />
          </mask>
        </defs>
        <g mask={`url(#gm${pid})`}>
          <rect width="100%" height="100%" fill={`url(#dotgrid${pid})`} />
          <rect width="100%" height="100%" fill={`url(#crossgrid${pid})`} />
        </g>
      </svg>

      {/* Repeating knot wallpaper */}
      <svg className="knot-bg-logos" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        <defs>
          {KNOT_ANGLES.map((_, i) => {
            const prevIdx = (i + 5) % 6
            const prevRad = (KNOT_ANGLES[prevIdx] * Math.PI) / 180
            const crossR = 100
            const mx = KNOT_CENTER + crossR * Math.cos(prevRad)
            const my = KNOT_CENTER + crossR * Math.sin(prevRad)

            return (
              <mask key={i} id={`${pid}wallpaper-weave-${i}`}>
                <rect width="512" height="512" fill="white" />
                <ellipse cx={mx} cy={my} rx={KNOT_GAP} ry={KNOT_GAP} fill="black" />
              </mask>
            )
          })}

          <pattern
            id={`knotwallpaper${pid}`}
            width="180"
            height="180"
            patternUnits="userSpaceOnUse"
            viewBox="0 0 180 180"
          >
            <g transform="translate(22 22) scale(0.18)">
              {knotLobes.map((d, i) => (
                <g key={`primary-${i}`}>
                  <path
                    d={d}
                    stroke="var(--brand)"
                    strokeWidth={KNOT_STROKE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity="0.14"
                    mask={`url(#${pid}wallpaper-weave-${i})`}
                  />
                  <path
                    d={d}
                    stroke="var(--text-primary)"
                    strokeWidth={KNOT_STROKE * 0.42}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity="0.045"
                    mask={`url(#${pid}wallpaper-weave-${i})`}
                  />
                </g>
              ))}
            </g>

            <g transform="translate(108 106) rotate(14 46 46) scale(0.1)">
              {knotLobes.map((d, i) => (
                <path
                  key={`secondary-${i}`}
                  d={d}
                  stroke="var(--text-secondary)"
                  strokeWidth={KNOT_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity="0.05"
                  mask={`url(#${pid}wallpaper-weave-${i})`}
                />
              ))}
            </g>
          </pattern>

          <radialGradient id={`patternfade${pid}`} cx="50%" cy="46%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="0.22" />
            <stop offset="44%" stopColor="white" stopOpacity="0.34" />
            <stop offset="76%" stopColor="white" stopOpacity="0.82" />
            <stop offset="100%" stopColor="white" stopOpacity="1" />
          </radialGradient>

          <mask id={`patternmask${pid}`}>
            <rect width="100%" height="100%" fill={`url(#patternfade${pid})`} />
          </mask>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill={`url(#knotwallpaper${pid})`}
          mask={`url(#patternmask${pid})`}
        />
      </svg>

      {/* Ambient glow */}
      <div className="knot-bg-glow" />
    </div>
  )
}

function buildKnotLobes(): string[] {
  const lobes: string[] = []

  for (const deg of KNOT_ANGLES) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const startR = 42
    const tipR = 155
    const bulge = 80

    const sx = KNOT_CENTER + startR * cos
    const sy = KNOT_CENTER + startR * sin
    const tx = KNOT_CENTER + tipR * cos
    const ty = KNOT_CENTER + tipR * sin

    const perp = rad + Math.PI / 2
    const px = Math.cos(perp)
    const py = Math.sin(perp)

    const cp1x = KNOT_CENTER + (startR + 50) * cos + bulge * px
    const cp1y = KNOT_CENTER + (startR + 50) * sin + bulge * py
    const cp2x = KNOT_CENTER + (tipR - 20) * cos + bulge * 0.7 * px
    const cp2y = KNOT_CENTER + (tipR - 20) * sin + bulge * 0.7 * py

    const cp3x = KNOT_CENTER + (tipR - 20) * cos - bulge * 0.7 * px
    const cp3y = KNOT_CENTER + (tipR - 20) * sin - bulge * 0.7 * py
    const cp4x = KNOT_CENTER + (startR + 50) * cos - bulge * px
    const cp4y = KNOT_CENTER + (startR + 50) * sin - bulge * py

    lobes.push(
      `M${formatCoord(sx)},${formatCoord(sy)} C${formatCoord(cp1x)},${formatCoord(cp1y)} ${formatCoord(cp2x)},${formatCoord(cp2y)} ${formatCoord(tx)},${formatCoord(ty)} C${formatCoord(cp3x)},${formatCoord(cp3y)} ${formatCoord(cp4x)},${formatCoord(cp4y)} ${formatCoord(sx)},${formatCoord(sy)}Z`,
    )
  }

  return lobes
}

function formatCoord(n: number): string {
  return n.toFixed(1)
}
