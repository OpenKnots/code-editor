'use client'

import { useId } from 'react'

interface KnotLogoProps {
  size?: number
  className?: string
  color?: string
}

/**
 * 6-loop interwoven Celtic knot with over/under weaving.
 * Each loop is drawn as a thick teardrop lobe radiating from center,
 * with SVG masks creating the woven crossing effect.
 */
export function KnotLogo({ size = 24, className, color }: KnotLogoProps) {
  const uid = useId()
  const id = uid.replace(/:/g, '')
  const c = color || 'currentColor'

  const cx = 256
  const cy = 256
  const sw = 28
  const gap = sw + 10

  const lobes: string[] = []
  const angles = [0, 60, 120, 180, 240, 300]

  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const startR = 42
    const tipR = 155
    const bulge = 80

    const sx = cx + startR * cos
    const sy = cy + startR * sin
    const tx = cx + tipR * cos
    const ty = cy + tipR * sin

    const perp = rad + Math.PI / 2
    const px = Math.cos(perp)
    const py = Math.sin(perp)

    const cp1x = cx + (startR + 50) * cos + bulge * px
    const cp1y = cy + (startR + 50) * sin + bulge * py
    const cp2x = cx + (tipR - 20) * cos + bulge * 0.7 * px
    const cp2y = cy + (tipR - 20) * sin + bulge * 0.7 * py

    const cp3x = cx + (tipR - 20) * cos - bulge * 0.7 * px
    const cp3y = cy + (tipR - 20) * sin - bulge * 0.7 * py
    const cp4x = cx + (startR + 50) * cos - bulge * px
    const cp4y = cy + (startR + 50) * sin - bulge * py

    lobes.push(
      `M${f(sx)},${f(sy)} C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(tx)},${f(ty)} C${f(cp3x)},${f(cp3y)} ${f(cp4x)},${f(cp4y)} ${f(sx)},${f(sy)}Z`,
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="KnotCode"
      role="img"
    >
      <defs>
        {angles.map((_, i) => {
          const prevIdx = (i + 5) % 6
          const prevRad = (angles[prevIdx] * Math.PI) / 180

          const crossR = 100
          const mx = Math.round(cx + crossR * Math.cos(prevRad))
          const my = Math.round(cy + crossR * Math.sin(prevRad))

          return (
            <mask key={i} id={`${id}w${i}`}>
              <rect width="512" height="512" fill="white" />
              <ellipse cx={mx} cy={my} rx={gap} ry={gap} fill="black" />
            </mask>
          )
        })}
      </defs>

      {lobes.map((d, i) => (
        <g key={i}>
          <path
            d={d}
            stroke={c}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            mask={`url(#${id}w${i})`}
          />
          <path
            d={d}
            stroke={c}
            strokeWidth={sw * 0.45}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.3}
            mask={`url(#${id}w${i})`}
          />
        </g>
      ))}
    </svg>
  )
}

function f(n: number): string {
  return n.toFixed(1)
}
