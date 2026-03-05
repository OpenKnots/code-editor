'use client'

import { useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useGrid, type GridCard } from '@/context/grid-context'

interface Props {
  card: GridCard
}

export function GridLinkCard({ card }: Props) {
  const { grids, switchGrid, updateCard } = useGrid()
  const targetGrid = grids.find(g => g.id === card.targetGridId)

  const handleNavigate = useCallback(() => {
    if (card.targetGridId) switchGrid(card.targetGridId)
  }, [card.targetGridId, switchGrid])

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      {/* Grid selector */}
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">
        Link to Grid
      </label>
      <select
        value={card.targetGridId || ''}
        onChange={e => updateCard(card.id, { targetGridId: e.target.value || undefined })}
        className="text-[12px] bg-[var(--bg)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-2 py-1.5 outline-none focus:border-[var(--border-focus)] cursor-pointer"
      >
        <option value="">Select a grid...</option>
        {grids.map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>

      {/* Navigate button */}
      {targetGrid && (
        <button
          onClick={handleNavigate}
          className="flex items-center justify-center gap-2 mt-auto py-2 rounded-lg bg-[var(--brand)] text-[var(--brand-contrast)] text-[12px] font-medium hover:brightness-110 transition-all cursor-pointer"
        >
          <Icon icon="lucide:arrow-right" width={14} height={14} />
          Go to {targetGrid.name}
        </button>
      )}

      {!targetGrid && !card.targetGridId && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-disabled)] text-[11px]">
          Choose a grid to link to
        </div>
      )}
    </div>
  )
}
