'use client'

import { useId, useMemo } from 'react'

const CX = 256
const CY = 256
const ANGLES = [0, 60, 120, 180, 240, 300]

function buildLobePaths(): string[] {
  const lobes: string[] = []
  const startR = 42
  const tipR = 155
  const bulge = 80

  for (const deg of ANGLES) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const perp = rad + Math.PI / 2
    const px = Math.cos(perp)
    const py = Math.sin(perp)

    const sx = CX + startR * cos
    const sy = CY + startR * sin
    const tx = CX + tipR * cos
    const ty = CY + tipR * sin

    const cp1x = CX + (startR + 50) * cos + bulge * px
    const cp1y = CY + (startR + 50) * sin + bulge * py
    const cp2x = CX + (tipR - 20) * cos + bulge * 0.7 * px
    const cp2y = CY + (tipR - 20) * sin + bulge * 0.7 * py
    const cp3x = CX + (tipR - 20) * cos - bulge * 0.7 * px
    const cp3y = CY + (tipR - 20) * sin - bulge * 0.7 * py
    const cp4x = CX + (startR + 50) * cos - bulge * px
    const cp4y = CY + (startR + 50) * sin - bulge * py

    const f = (n: number) => n.toFixed(1)
    lobes.push(
      `M${f(sx)},${f(sy)} C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(tx)},${f(ty)} C${f(cp3x)},${f(cp3y)} ${f(cp4x)},${f(cp4y)} ${f(sx)},${f(sy)}Z`,
    )
  }
  return lobes
}

const LOBE_PATHS = buildLobePaths()

function KnotPaths({ strokeWidth = 10 }: { strokeWidth?: number }) {
  return (
    <g
      style={{ stroke: 'var(--brand)' }}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {LOBE_PATHS.map((d, i) => (
        <path key={i} d={d} opacity={i % 2 === 0 ? 0.9 : 0.6} />
      ))}
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
          <pattern id={`kp${pid}`} width="110" height="110" patternUnits="userSpaceOnUse">
            <svg viewBox="0 0 512 512" width="100" height="100">
              <KnotPaths strokeWidth={10} />
            </svg>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#kp${pid})`} />
      </svg>
    </div>
  )
}
