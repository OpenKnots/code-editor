'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useGrid } from '@/context/grid-context'
import { CardWrapper } from './card-wrapper'

export function GridCanvas() {
  const { activeGrid, updateViewport, addCard, setSelectedCardId, selectedCardId, removeCard } = useGrid()
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; vpX: number; vpY: number } | null>(null)
  const isPanningRef = useRef(false)

  const committedVpX = activeGrid?.viewportX ?? 0
  const committedVpY = activeGrid?.viewportY ?? 0
  const committedZoom = activeGrid?.zoom ?? 1

  const liveVp = useRef({ x: committedVpX, y: committedVpY, zoom: committedZoom })
  const scrollCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    if (!isPanningRef.current) {
      liveVp.current = { x: committedVpX, y: committedVpY, zoom: committedZoom }
    }
  }, [committedVpX, committedVpY, committedZoom])

  const applyTransform = useCallback(() => {
    const { x, y, zoom } = liveVp.current
    if (innerRef.current) {
      innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`
    }
    if (containerRef.current) {
      const dotSize = Math.max(0.5, 1 * zoom)
      const gridSpacing = 24 * zoom
      const bgOffsetX = x % gridSpacing
      const bgOffsetY = y % gridSpacing
      containerRef.current.style.backgroundImage = `radial-gradient(circle, var(--text-disabled) ${dotSize}px, transparent ${dotSize}px)`
      containerRef.current.style.backgroundSize = `${gridSpacing}px ${gridSpacing}px`
      containerRef.current.style.backgroundPosition = `${bgOffsetX}px ${bgOffsetY}px`
    }
  }, [])

  useLayoutEffect(() => {
    applyTransform()
  }, [committedVpX, committedVpY, committedZoom, applyTransform])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isEditable = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCardId && !isEditable) {
        e.preventDefault()
        removeCard(selectedCardId)
      }
    }
    window.addEventListener('keydown', down)
    return () => { window.removeEventListener('keydown', down) }
  }, [selectedCardId, removeCard])

  // Native wheel listener (non-passive) so we can preventDefault
  const updateViewportRef = useRef(updateViewport)
  updateViewportRef.current = updateViewport

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const vp = liveVp.current

      if (e.ctrlKey || e.metaKey) {
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.min(3, Math.max(0.15, vp.zoom * delta))
        const ratio = newZoom / vp.zoom
        vp.x = mouseX - (mouseX - vp.x) * ratio
        vp.y = mouseY - (mouseY - vp.y) * ratio
        vp.zoom = newZoom
      } else {
        vp.x -= e.deltaX
        vp.y -= e.deltaY
      }

      applyTransform()

      if (scrollCommitTimer.current) clearTimeout(scrollCommitTimer.current)
      scrollCommitTimer.current = setTimeout(() => {
        updateViewportRef.current(liveVp.current.x, liveVp.current.y, liveVp.current.zoom)
      }, 150)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  // Global mouse handlers for reliable panning even when cursor leaves the container
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !panStart.current) return
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      liveVp.current.x = panStart.current.vpX + dx
      liveVp.current.y = panStart.current.vpY + dy
      applyTransform()
    }
    const onUp = () => {
      if (isPanningRef.current) {
        const { x, y, zoom } = liveVp.current
        updateViewportRef.current(x, y, zoom)
      }
      isPanningRef.current = false
      setIsPanning(false)
      panStart.current = null
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [applyTransform])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.target === e.currentTarget)) {
      e.preventDefault()
      isPanningRef.current = true
      setIsPanning(true)
      const vp = liveVp.current
      panStart.current = { x: e.clientX, y: e.clientY, vpX: vp.x, vpY: vp.y }

      if (e.button === 0 && e.target === e.currentTarget) {
        setSelectedCardId(null)
      }
    }
  }, [setSelectedCardId])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const vp = liveVp.current
    const x = (e.clientX - rect.left - vp.x) / vp.zoom
    const y = (e.clientY - rect.top - vp.y) / vp.zoom
    addCard('text', x, y)
  }, [addCard])

  const dotSize = Math.max(0.5, 1 * committedZoom)
  const gridSpacing = 24 * committedZoom
  const bgOffsetX = committedVpX % gridSpacing
  const bgOffsetY = committedVpY % gridSpacing

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundImage: `radial-gradient(circle, var(--text-disabled) ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
        backgroundPosition: `${bgOffsetX}px ${bgOffsetY}px`,
        backgroundColor: 'var(--bg)',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={innerRef}
        style={{
          transform: `translate(${committedVpX}px, ${committedVpY}px) scale(${committedZoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          willChange: 'transform',
        }}
      >
        {activeGrid?.cards.map(card => (
          <CardWrapper key={card.id} card={card} zoom={committedZoom} />
        ))}
      </div>
    </div>
  )
}
