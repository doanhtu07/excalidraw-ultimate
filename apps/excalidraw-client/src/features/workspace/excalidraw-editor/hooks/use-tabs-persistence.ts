import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import type { FileStat } from '@/features/workspace/files/scene'
import type { WorkspaceLayout } from '@/features/workspace/workspace-layout'
import { layoutPath } from '@/features/workspace/workspace-layout'
import { writeWorkspaceLayout } from '@/features/workspace/workspace-layout-io'
import { workspaceLabel } from '@/features/workspace/workspace-paths'
import { beaconWrite } from '@/features/workspace/workspace-beacon'

const LAYOUT_DEBOUNCE_MS = 300

interface TabsPersistenceOptions {
  workspaceRoot: string
  stateDir: string | null
  hydrated: boolean
  tabs: Array<EditorTab>
  activeTabId: string | null
  savedVersionsRef: RefObject<Map<string, number>>
  fileStatsRef: RefObject<Map<string, FileStat>>
  recoveryFilesRef: RefObject<Map<string, string>>
}

interface TabsPersistence {
  persistLayout: () => Promise<void>
  saveError: string | null
}

/** Persists the tab layout (order, active tab, linked paths) to disk. */
export function useTabsPersistence({
  workspaceRoot,
  stateDir,
  hydrated,
  tabs,
  activeTabId,
  savedVersionsRef,
  fileStatsRef,
  recoveryFilesRef,
}: TabsPersistenceOptions): TabsPersistence {
  const [saveError, setSaveError] = useState<string | null>(null)

  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)
  const stateDirRef = useRef(stateDir)
  const workspaceRootRef = useRef(workspaceRoot)
  const layoutTimerRef = useRef<number | null>(null)

  const buildLayout = useCallback((): WorkspaceLayout | null => {
    const root = workspaceRootRef.current
    const dir = stateDirRef.current

    if (!dir) return null

    return {
      version: 1,
      root,
      name: workspaceLabel(root),
      activeTabId: activeTabIdRef.current,
      updatedAt: new Date().toISOString(),
      tabs: tabsRef.current.map((tab) => ({
        id: tab.id,
        name: tab.name,
        fileName: tab.fileName,
        filePath: tab.filePath,
        revision: tab.revision,
        savedVersion: savedVersionsRef.current.get(tab.id) ?? 0,
        stat: fileStatsRef.current.get(tab.id) ?? null,
        recovery: recoveryFilesRef.current.get(tab.id) ?? null,
      })),
    }
  }, [fileStatsRef, recoveryFilesRef, savedVersionsRef])

  const persistLayout = useCallback(async () => {
    const dir = stateDirRef.current
    const layout = buildLayout()

    if (!dir || !layout) return

    try {
      await writeWorkspaceLayout(dir, layout)
      setSaveError(null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    }
  }, [buildLayout])

  // MARK: Effects

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    stateDirRef.current = stateDir
  }, [stateDir])

  useEffect(() => {
    workspaceRootRef.current = workspaceRoot
  }, [workspaceRoot])

  useEffect(() => {
    if (!hydrated || !stateDir) return

    if (layoutTimerRef.current !== null) {
      window.clearTimeout(layoutTimerRef.current)
    }

    layoutTimerRef.current = window.setTimeout(() => {
      layoutTimerRef.current = null
      void persistLayout()
    }, LAYOUT_DEBOUNCE_MS)

    return () => {
      if (layoutTimerRef.current !== null) {
        window.clearTimeout(layoutTimerRef.current)
        layoutTimerRef.current = null
      }
    }
  }, [tabs, activeTabId, hydrated, stateDir, persistLayout])

  useEffect(() => {
    const flush = () => {
      const dir = stateDirRef.current
      const layout = buildLayout()

      if (!dir || !layout) return

      beaconWrite(layoutPath(dir), `${JSON.stringify(layout, null, 2)}\n`)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [buildLayout])

  // MARK: Return value

  return { persistLayout, saveError }
}
