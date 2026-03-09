'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { fetchRepoTreeByName as fetchRepoTree } from '@/lib/github-api'

export interface RepoInfo {
  owner: string
  repo: string
  branch: string
  fullName: string
}

export interface TreeNode {
  path: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
}

interface RepoContextValue {
  repo: RepoInfo | null
  setRepo: (repo: RepoInfo | null) => void
  tree: TreeNode[]
  treeLoading: boolean
  treeError: string | null
  loadTree: () => Promise<void>
}

const RepoContext = createContext<RepoContextValue | null>(null)

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)

  const loadTree = useCallback(async () => {
    if (!repo) return
    setTreeLoading(true)
    setTreeError(null)
    try {
      const nodes = await fetchRepoTree(repo.fullName, repo.branch)
      setTree(nodes)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed to load tree')
    } finally {
      setTreeLoading(false)
    }
  }, [repo])

  // Auto-load tree when repo changes
  useEffect(() => {
    if (!repo) { setTree([]); return }
    let cancelled = false
    ;(async () => {
      setTreeLoading(true)
      setTreeError(null)
      try {
        const nodes = await fetchRepoTree(repo.fullName, repo.branch)
        if (!cancelled) setTree(nodes)
      } catch (err) {
        if (!cancelled) setTreeError(err instanceof Error ? err.message : 'Failed to load tree')
      } finally {
        if (!cancelled) setTreeLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [repo])  // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<RepoContextValue>(() => ({
    repo, setRepo, tree, treeLoading, treeError, loadTree,
  }), [repo, setRepo, tree, treeLoading, treeError, loadTree])

  return (
    <RepoContext.Provider value={value}>
      {children}
    </RepoContext.Provider>
  )
}

export function useRepo() {
  const ctx = useContext(RepoContext)
  if (!ctx) throw new Error('useRepo must be used within RepoProvider')
  return ctx
}
