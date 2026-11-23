import { useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import type { DrawingScene, FileStat } from '@/features/workspace/files/scene'
import { readAgentDrawingFile } from '@/features/workspace/files/agent-client'
import { initAgentWorkspace } from '@/features/workspace/files/workspace-registry'
import { hashScene, loadDrawingScene } from '@/features/workspace/files/scene'
import { readWorkspaceLayout } from '@/features/workspace/workspace-layout-io'
import { readRecoveryScene } from '@/features/workspace/workspace-recovery'

export interface TabsRefs {
  scenesRef: RefObject<Map<string, DrawingScene>>
  savedVersionsRef: RefObject<Map<string, number>>
  fileStatsRef: RefObject<Map<string, FileStat>>
  recoveryFilesRef: RefObject<Map<string, string>>
}

interface TabsHydrationOptions extends TabsRefs {
  workspaceRoot: string
  setTabs: Dispatch<SetStateAction<Array<EditorTab>>>
  setActiveTabId: Dispatch<SetStateAction<string | null>>
}

interface HydratedTab {
  tab: EditorTab
  scene: DrawingScene
  savedVersion: number
  stat: FileStat | null
  recovery: string | null
}

interface TabsHydration {
  hydrated: boolean
  stateDir: string | null
  persistenceError: string | null
}

const EMPTY_SCENE: DrawingScene = { elements: [], appState: null, files: {} }

async function restoreTab(
  stateDir: string,
  record: {
    id: string
    name: string
    fileName: string | null
    filePath: string | null
    revision: number
    savedVersion: number
    recovery: string | null
  },
): Promise<HydratedTab> {
  let scene: DrawingScene | null = null
  let stat: FileStat | null = null
  let recovery: string | null = null
  let savedVersion = record.savedVersion
  let fromRecovery = false

  if (record.recovery) {
    scene = await readRecoveryScene(stateDir, record.recovery)
    if (scene) {
      recovery = record.recovery
      fromRecovery = true
    }
  }

  if (!scene && record.filePath) {
    try {
      const opened = await readAgentDrawingFile(record.filePath)
      scene = await loadDrawingScene(opened.file)
      stat = opened.stat
    } catch {
      scene = null
    }
  }

  const restored = scene ?? EMPTY_SCENE

  // A clean tab re-read from disk is clean against *that* file, even if it
  // changed while the page was closed. Recovery scenes keep the old baseline,
  // which is what makes the tab dirty.
  if (scene && !fromRecovery) {
    savedVersion = hashScene(scene.elements)
  }

  return {
    tab: {
      id: record.id,
      name: record.name,
      fileName: record.fileName,
      filePath: record.filePath,
      dirty: hashScene(restored.elements) !== savedVersion,
      revision: record.revision + 1,
    },
    scene: restored,
    savedVersion,
    stat,
    recovery,
  }
}

/** Loads tabs, scenes, and recovery files for a workspace from disk. */
export function useTabsHydration({
  workspaceRoot,
  scenesRef,
  savedVersionsRef,
  fileStatsRef,
  recoveryFilesRef,
  setTabs,
  setActiveTabId,
}: TabsHydrationOptions): TabsHydration {
  const [hydrated, setHydrated] = useState(false)
  const [stateDir, setStateDir] = useState<string | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const runIdRef = useRef(0)

  // MARK: Effects

  useEffect(() => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId

    scenesRef.current.clear()
    savedVersionsRef.current.clear()
    fileStatsRef.current.clear()
    recoveryFilesRef.current.clear()

    const isCurrent = () => runIdRef.current === runId

    const hydrate = async () => {
      try {
        const initialized = await initAgentWorkspace(workspaceRoot)
        if (!isCurrent()) return

        setStateDir(initialized.stateDir)

        const layout = await readWorkspaceLayout(initialized.stateDir)
        if (!isCurrent()) return

        if (!layout) {
          setHydrated(true)
          return
        }

        const restored = await Promise.all(
          layout.tabs.map((record) =>
            restoreTab(initialized.stateDir, record).catch(() => null),
          ),
        )

        if (!isCurrent()) return

        const tabs: Array<EditorTab> = []
        const items = restored.filter(
          (item): item is HydratedTab => item !== null,
        )

        for (const item of items) {
          const id = item.tab.id

          scenesRef.current.set(id, item.scene)
          savedVersionsRef.current.set(id, item.savedVersion)
          if (item.stat) fileStatsRef.current.set(id, item.stat)
          if (item.recovery) recoveryFilesRef.current.set(id, item.recovery)
          tabs.push(item.tab)
        }

        setTabs(tabs)
        setActiveTabId(
          tabs.find((tab) => tab.id === layout.activeTabId)?.id ?? tabs[0]?.id,
        )
        setHydrated(true)
      } catch (error) {
        if (!isCurrent()) return

        setPersistenceError(
          error instanceof Error ? error.message : String(error),
        )
        setHydrated(true)
      }
    }

    void hydrate()

    return () => {
      runIdRef.current += 1
    }
  }, [
    workspaceRoot,
    scenesRef,
    savedVersionsRef,
    fileStatsRef,
    recoveryFilesRef,
    setTabs,
    setActiveTabId,
  ])

  // MARK: Return value

  return { hydrated, stateDir, persistenceError }
}
