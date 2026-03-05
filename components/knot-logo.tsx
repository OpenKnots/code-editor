'use client'

interface KnotLogoProps {
  size?: number
  className?: string
  color?: string
  strokeWidth?: number
}

const VERTICAL_LOOP =
  'M176 132 C224 80,288 80,336 132 C368 168,368 344,336 380 C288 432,224 432,176 380 C144 344,144 168,176 132Z'

const HORIZONTAL_LOOP =
  'M132 176 C80 224,80 288,132 336 C168 368,344 368,380 336 C432 288,432 224,380 176 C344 144,168 144,132 176Z'

export function KnotLogo({ size = 24, className, color, strokeWidth = 56 }: KnotLogoProps) {
  const c = color || 'currentColor'

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
      <g
        stroke={c}
        strokeWidth={strokeWidth}
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
  )
}
