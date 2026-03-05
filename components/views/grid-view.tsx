'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { useGrid, type SavedItem } from '@/context/grid-context'
import { GridCanvas } from '@/components/grid/grid-canvas'

export function GridView() {
  const { grids, activeGridId, activeGrid, createGrid, deleteGrid, renameGrid, switchGrid, addCard, updateViewport, addSavedItem, removeSavedItem, convertSavedItemToCard } = useGrid()
  const [editingGridId, setEditingGridId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'grids' | 'saved'>('grids')
  const [addingItem, setAddingItem] = useState<SavedItem['type'] | null>(null)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemContent, setNewItemContent] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const addTitleRef = useRef<HTMLInputElement>(null)
  const zoom = activeGrid?.zoom ?? 1
  const savedItems = activeGrid?.savedItems || []

  useEffect(() => {
    if (editingGridId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingGridId])

  useEffect(() => {
    if (addingItem && addTitleRef.current) {
      addTitleRef.current.focus()
    }
  }, [addingItem])

  const handleRename = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed) renameGrid(id, trimmed)
    setEditingGridId(null)
  }, [renameGrid])

  const handleZoom = useCallback((delta: number) => {
    if (!activeGrid) return
    const newZoom = Math.min(3, Math.max(0.15, activeGrid.zoom + delta))
    updateViewport(activeGrid.viewportX, activeGrid.viewportY, newZoom)
  }, [activeGrid, updateViewport])

  const handleResetView = useCallback(() => {
    if (!activeGrid) return
    updateViewport(0, 0, 1)
  }, [activeGrid, updateViewport])

  const handleAddSavedItem = useCallback(() => {
    if (!addingItem || !newItemTitle.trim()) return
    const url = addingItem === 'link' ? newItemContent.trim() : undefined
    addSavedItem(addingItem, newItemTitle.trim(), newItemContent.trim(), url)
    setAddingItem(null)
    setNewItemTitle('')
    setNewItemContent('')
  }, [addingItem, newItemTitle, newItemContent, addSavedItem])

  const handleCancelAdd = useCallback(() => {
    setAddingItem(null)
    setNewItemTitle('')
    setNewItemContent('')
  }, [])

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--bg)]">
      {/* Sidebar */}
      <div className={`shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] transition-all duration-200 ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-56'}`}>
        {/* Tab switcher */}
        <div className="flex items-center h-9 border-b border-[var(--border)] shrink-0">
          <button
            onClick={() => setSidebarTab('grids')}
            className={`flex-1 h-full flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
              sidebarTab === 'grids'
                ? 'text-[var(--text-primary)] border-[var(--brand)]'
                : 'text-[var(--text-disabled)] border-transparent hover:text-[var(--text-secondary)]'
            }`}
          >
            <Icon icon="lucide:layout-grid" width={12} height={12} />
            Grids
          </button>
          <button
            onClick={() => setSidebarTab('saved')}
            className={`flex-1 h-full flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
              sidebarTab === 'saved'
                ? 'text-[var(--text-primary)] border-[var(--brand)]'
                : 'text-[var(--text-disabled)] border-transparent hover:text-[var(--text-secondary)]'
            }`}
          >
            <Icon icon="lucide:bookmark" width={12} height={12} />
            Saved
            {savedItems.length > 0 && (
              <span className="text-[9px] px-1 py-px rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] font-bold leading-tight">{savedItems.length}</span>
            )}
          </button>
        </div>

        {/* Grids tab */}
        {sidebarTab === 'grids' && (
          <>
            <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-disabled)]">{grids.length} grid{grids.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => createGrid()}
                className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="New grid"
              >
                <Icon icon="lucide:plus" width={14} height={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto py-1">
              {grids.map(grid => (
                <div
                  key={grid.id}
                  className={`group flex items-center gap-2 mx-1 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    grid.id === activeGridId
                      ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                  onClick={() => switchGrid(grid.id)}
                  onDoubleClick={() => setEditingGridId(grid.id)}
                >
                  <Icon icon="lucide:layout-grid" width={13} height={13} className="shrink-0 text-[var(--text-disabled)]" />
                  {editingGridId === grid.id ? (
                    <input
                      ref={editInputRef}
                      defaultValue={grid.name}
                      onBlur={e => handleRename(grid.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(grid.id, e.currentTarget.value)
                        if (e.key === 'Escape') setEditingGridId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-[12px] bg-transparent border-none outline-none text-[var(--text-primary)] min-w-0"
                    />
                  ) : (
                    <span className="flex-1 text-[12px] truncate">{grid.name}</span>
                  )}
                  <span className="text-[10px] text-[var(--text-disabled)]">{grid.cards.length}</span>
                  {grids.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteGrid(grid.id) }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg)] text-[var(--text-disabled)] hover:text-red-400 transition-all cursor-pointer"
                    >
                      <Icon icon="lucide:trash-2" width={11} height={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Saved items tab */}
        {sidebarTab === 'saved' && (
          <>
            <div className="flex items-center justify-between h-8 px-3 border-b border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-disabled)]">{savedItems.length} item{savedItems.length !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setAddingItem('link')}
                  className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Save a link"
                >
                  <Icon icon="lucide:link" width={13} height={13} />
                </button>
                <button
                  onClick={() => setAddingItem('text')}
                  className="p-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Save a text snippet"
                >
                  <Icon icon="lucide:file-text" width={13} height={13} />
                </button>
              </div>
            </div>

            {/* Add form */}
            {addingItem && (
              <div className="px-2.5 py-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon
                    icon={addingItem === 'link' ? 'lucide:link' : 'lucide:file-text'}
                    width={12} height={12}
                    className="text-[var(--brand)] shrink-0"
                  />
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    New {addingItem === 'link' ? 'Link' : 'Text Snippet'}
                  </span>
                </div>
                <input
                  ref={addTitleRef}
                  value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  placeholder="Title..."
                  className="w-full px-2 py-1 rounded-md text-[11px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-disabled)]"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSavedItem()
                    if (e.key === 'Escape') handleCancelAdd()
                  }}
                />
                <input
                  value={newItemContent}
                  onChange={e => setNewItemContent(e.target.value)}
                  placeholder={addingItem === 'link' ? 'https://...' : 'Content...'}
                  className="w-full px-2 py-1 rounded-md text-[11px] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] placeholder:text-[var(--text-disabled)]"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSavedItem()
                    if (e.key === 'Escape') handleCancelAdd()
                  }}
                />
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    onClick={handleAddSavedItem}
                    disabled={!newItemTitle.trim()}
                    className="flex-1 py-1 rounded-md text-[10px] font-medium bg-[var(--brand)] text-[var(--brand-contrast)] hover:brightness-110 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelAdd}
                    className="flex-1 py-1 rounded-md text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto py-1">
              {savedItems.length === 0 && !addingItem && (
                <div className="flex flex-col items-center justify-center py-8 px-4 gap-2 text-center">
                  <Icon icon="lucide:bookmark" width={20} height={20} className="text-[var(--text-disabled)]" />
                  <p className="text-[11px] text-[var(--text-disabled)] leading-relaxed">
                    Save links and text snippets, then convert them to canvas widgets.
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => setAddingItem('link')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-subtle)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:link" width={11} height={11} />
                      Add Link
                    </button>
                    <button
                      onClick={() => setAddingItem('text')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-subtle)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:file-text" width={11} height={11} />
                      Add Text
                    </button>
                  </div>
                </div>
              )}
              {savedItems.map(item => (
                <div
                  key={item.id}
                  className="group flex items-start gap-2 mx-1 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <Icon
                    icon={item.type === 'link' ? 'lucide:link' : 'lucide:file-text'}
                    width={13} height={13}
                    className="shrink-0 mt-0.5 text-[var(--text-disabled)]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">{item.title}</div>
                    <div className="text-[10px] text-[var(--text-disabled)] truncate mt-0.5">
                      {item.type === 'link' ? (item.url || item.content) : item.content}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => convertSavedItemToCard(item.id)}
                      className="p-1 rounded hover:bg-[var(--bg)] text-[var(--brand)] hover:text-[var(--brand)] transition-colors cursor-pointer"
                      title="Add to canvas as widget"
                    >
                      <Icon icon="lucide:layout-dashboard" width={12} height={12} />
                    </button>
                    <button
                      onClick={() => removeSavedItem(item.id)}
                      className="p-1 rounded hover:bg-[var(--bg)] text-[var(--text-disabled)] hover:text-red-400 transition-colors cursor-pointer"
                      title="Remove"
                    >
                      <Icon icon="lucide:trash-2" width={11} height={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center h-9 px-2 gap-1 border-b border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="p-1.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            title={sidebarCollapsed ? 'Show grids' : 'Hide grids'}
          >
            <Icon icon={sidebarCollapsed ? 'lucide:panel-left' : 'lucide:panel-left-close'} width={14} height={14} />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-1" />

          {/* Add card buttons */}
          <button
            onClick={() => addCard('text')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Add text card"
          >
            <Icon icon="lucide:file-text" width={13} height={13} />
            <span className="hidden md:inline">Text</span>
          </button>
          <button
            onClick={() => addCard('ai')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Add AI card"
          >
            <Icon icon="lucide:sparkles" width={13} height={13} />
            <span className="hidden md:inline">AI</span>
          </button>
          <button
            onClick={() => addCard('website')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Add website card"
          >
            <Icon icon="lucide:globe" width={13} height={13} />
            <span className="hidden md:inline">Web</span>
          </button>
          <button
            onClick={() => addCard('link')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Add grid link card"
          >
            <Icon icon="lucide:link" width={13} height={13} />
            <span className="hidden md:inline">Link</span>
          </button>

          <div className="flex-1" />

          {/* Zoom controls */}
          <button
            onClick={() => handleZoom(-0.1)}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Zoom out"
          >
            <Icon icon="lucide:minus" width={14} height={14} />
          </button>
          <button
            onClick={handleResetView}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-disabled)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer min-w-[36px] text-center"
            title="Reset view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => handleZoom(0.1)}
            className="p-1 rounded hover:bg-[var(--bg-subtle)] text-[var(--text-disabled)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Zoom in"
          >
            <Icon icon="lucide:plus" width={14} height={14} />
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0">
          <GridCanvas />
        </div>
      </div>
    </div>
  )
}
