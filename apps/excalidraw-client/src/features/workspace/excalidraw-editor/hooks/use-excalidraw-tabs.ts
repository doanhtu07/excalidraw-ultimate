import { useCallback, useRef, useState } from 'react'
import { useTabsHydration } from './use-tabs-hydration'
import { useTabsPersistence } from './use-tabs-persistence'
import { useTabRecovery } from './use-tab-recovery'
import { useTabActions } from './use-tab-actions'
import { useLinkedFileWatcher } from './use-linked-file-watcher'
import type { RefObject } from 'react'
import type {
  EditorTab,
  TabDropPosition,
} from '@/features/workspace/editor-tabs'
import type { SaveResult } from './use-tab-actions'
import type { DrawingScene, FileStat } from '@/features/workspace/files/scene'
import { hashScene } from '@/features/workspace/files/scene'

export type { SaveResult }

export interface ExcalidrawTabs {
  tabs: Array<EditorTab>
  activeTab: EditorTab | null
  activeTabId: string | null
  hasUnsavedTabs: boolean
  hydrated: boolean
  persistenceError: string | null
  scenesRef: RefObject<Map<string, DrawingScene>>
  setActiveTabId: (tabId: string | null) => void
  syncScene: (tabId: string, scene: DrawingScene) => void
  newDrawing: () => void
  openDrawingFromPath: (filePath: string) => Promise<string | null>
  openDroppedFile: (file: File) => Promise<string | null>
  saveActiveDrawing: () => Promise<SaveResult>
  saveActiveDrawingToPath: (filePath: string) => Promise<SaveResult>
  closeTab: (tabId: string) => void
  moveTab: (
    tabId: string,
    targetTabId: string,
    position: TabDropPosition,
  ) => void
}

interface UseExcalidrawTabsProps {
  workspaceRoot: string
}

/**
 * Owns the workspace tabs: hydration, scene snapshots, dirty tracking,
 * persistence, and the tab actions.
 *
 * Scenes live in refs because Excalidraw's `onChange` fires on every pointer
 * move; keeping them out of React state avoids re-rendering on every stroke.
 */
export function useExcalidrawTabs({
  workspaceRoot,
}: UseExcalidrawTabsProps): ExcalidrawTabs {
  const [tabs, setTabs] = useState<Array<EditorTab>>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const scenesRef = useRef(new Map<string, DrawingScene>())
  const savedVersionsRef = useRef(new Map<string, number>())
  const fileStatsRef = useRef(new Map<string, FileStat>())
  const recoveryFilesRef = useRef(new Map<string, string>())

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const hasUnsavedTabs = tabs.some((tab) => tab.dirty)

  const { hydrated, stateDir, persistenceError } = useTabsHydration({
    workspaceRoot,
    scenesRef,
    savedVersionsRef,
    fileStatsRef,
    recoveryFilesRef,
    setTabs,
    setActiveTabId,
  })

  const { persistLayout, saveError } = useTabsPersistence({
    workspaceRoot,
    stateDir,
    hydrated,
    tabs,
    activeTabId,
    savedVersionsRef,
    fileStatsRef,
    recoveryFilesRef,
  })

  const { scheduleRecovery, clearRecovery } = useTabRecovery({
    stateDir,
    tabs,
    savedVersionsRef,
    recoveryFilesRef,
    persistLayout,
  })

  const actions = useTabActions({
    tabs,
    activeTab,
    activeTabId,
    setTabs,
    setActiveTabId,
    scenesRef,
    savedVersionsRef,
    fileStatsRef,
    scheduleRecovery,
    clearRecovery,
  })

  const syncScene = useCallback(
    (tabId: string, scene: DrawingScene) => {
      scenesRef.current.set(tabId, scene)

      const isDirty =
        hashScene(scene.elements) !== savedVersionsRef.current.get(tabId)

      setTabs((prev) => {
        const tab = prev.find((candidate) => candidate.id === tabId)
        if (!tab || tab.dirty === isDirty) return prev

        return prev.map((candidate) =>
          candidate.id === tabId ? { ...candidate, dirty: isDirty } : candidate,
        )
      })

      if (isDirty) scheduleRecovery(tabId, scene)
      else clearRecovery(tabId)
    },
    [scheduleRecovery, clearRecovery],
  )

  useLinkedFileWatcher({
    tabs,
    setTabs,
    scenesRef,
    savedVersionsRef,
    fileStatsRef,
  })

  // MARK: Return value

  return {
    tabs,
    activeTab,
    activeTabId,
    hasUnsavedTabs,
    hydrated,
    persistenceError: persistenceError ?? saveError,
    scenesRef,
    setActiveTabId,
    syncScene,
    ...actions,
  }
}
