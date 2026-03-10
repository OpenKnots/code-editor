'use client'

import { motion } from 'framer-motion'

interface ReadinessRingProps {
  score: number
  size?: number
}

export function ReadinessRing({ score, size = 80 }: ReadinessRingProps) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const getLabel = () => {
    if (score >= 80) return 'Ready'
    if (score >= 50) return 'Almost'
    return 'Needs Work'
  }

  const getColor = () => {
    if (score >= 80) return 'var(--brand)'
    if (score >= 50) return '#f59e0b' // amber
    return '#ef4444' // red
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          />
        </svg>

        {/* Percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-2xl font-bold"
            style={{ color: getColor() }}
          >
            {score}%
          </motion.span>
        </div>
      </div>

      {/* Label */}
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="text-sm font-medium text-[var(--text-secondary)]"
      >
        {getLabel()}
      </motion.span>
    </div>
  )
}
