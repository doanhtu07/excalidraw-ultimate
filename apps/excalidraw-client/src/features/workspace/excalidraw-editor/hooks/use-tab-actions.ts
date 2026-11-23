import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { DrawingScene, FileStat } from '@/features/workspace/files/scene'
import type {
  EditorTab,
  TabDropPosition,
} from '@/features/workspace/editor-tabs'
import {
  createTabId,
  createUntitledName,
  reorderTabs,
} from '@/features/workspace/editor-tabs'
import {
  fileNameOfPath,
  readAgentDrawingFile,
  writeAgentFile,
} from '@/features/workspace/files/agent-client'
import {
  hashScene,
  loadDrawingScene,
  serializeDrawingScene,
  stripDrawingExtension,
} from '@/features/workspace/files/scene'

// MARK: Types

export interface SaveResult {
  saved: boolean
  needsPath?: boolean
  error?: string
}

interface TabActionsProps {
  tabs: Array<EditorTab>
  activeTab: EditorTab | null
  activeTabId: string | null
  setTabs: Dispatch<SetStateAction<Array<EditorTab>>>
  setActiveTabId: Dispatch<SetStateAction<string | null>>
  scenesRef: RefObject<Map<string, DrawingScene>>
  savedVersionsRef: RefObject<Map<string, number>>
  fileStatsRef: RefObject<Map<string, FileStat>>
  scheduleRecovery: (tabId: string, scene: DrawingScene) => void
  clearRecovery: (tabId: string) => void
}

interface TabActions {
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

/** Create, open, save, close, and reorder tabs for one workspace. */
export function useTabActions({
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
}: TabActionsProps): TabActions {
  // MARK: Actions

  const rememberTab = useCallback(
    (
      scene: DrawingScene,
      savedVersion: number,
      tab: Omit<EditorTab, 'dirty' | 'revision'>,
      stat: FileStat | null,
    ) => {
      scenesRef.current.set(tab.id, scene)
      savedVersionsRef.current.set(tab.id, savedVersion)
      if (stat) fileStatsRef.current.set(tab.id, stat)

      setTabs((prev) => [
        ...prev,
        {
          ...tab,
          dirty: hashScene(scene.elements) !== savedVersion,
          revision: 0,
        },
      ])
      setActiveTabId(tab.id)
    },
    [fileStatsRef, savedVersionsRef, scenesRef, setActiveTabId, setTabs],
  )

  // MARK: Creating and opening

  const newDrawing = useCallback(() => {
    const id = createTabId()
    const scene: DrawingScene = { elements: [], appState: null, files: {} }

    rememberTab(
      scene,
      hashScene(scene.elements),
      { id, name: createUntitledName(tabs), fileName: null, filePath: null },
      null,
    )
  }, [tabs, rememberTab])

  const openDrawingFromPath = useCallback(
    async (filePath: string) => {
      const existing = tabs.find((tab) => tab.filePath === filePath)

      if (existing) {
        setActiveTabId(existing.id)
        return existing.id
      }

      try {
        const opened = await readAgentDrawingFile(filePath)
        const scene = await loadDrawingScene(opened.file)
        const id = createTabId()
        const fileName = fileNameOfPath(filePath)

        rememberTab(
          scene,
          hashScene(scene.elements),
          {
            id,
            name: stripDrawingExtension(fileName),
            fileName,
            filePath,
          },
          opened.stat,
        )

        return id
      } catch (error) {
        console.error(
          `[excalidraw] could not open ${filePath}:`,
          error instanceof Error ? error.message : error,
        )
        return null
      }
    },
    [tabs, rememberTab, setActiveTabId],
  )

  const openDroppedFile = useCallback(
    async (file: File) => {
      try {
        const scene = await loadDrawingScene(file)
        const id = createTabId()

        // A dropped File exposes no absolute path, so the tab starts dirty
        // and the first save asks for a path.
        rememberTab(
          scene,
          hashScene([]),
          {
            id,
            name: stripDrawingExtension(file.name),
            fileName: null,
            filePath: null,
          },
          null,
        )

        scheduleRecovery(id, scene)

        return null
      } catch {
        window.alert(`Couldn't open "${file.name}" as an Excalidraw drawing.`)
        return null
      }
    },
    [rememberTab, scheduleRecovery],
  )

  // MARK: Saving

  const saveActiveDrawingToPath = useCallback(
    async (filePath: string): Promise<SaveResult> => {
      if (!activeTab) return { saved: false, error: 'No active drawing.' }

      const scene = scenesRef.current.get(activeTab.id)
      if (!scene) return { saved: false, error: 'No scene to save.' }

      try {
        const json = await serializeDrawingScene(scene)
        const stat = await writeAgentFile(filePath, json)
        const fileName = fileNameOfPath(filePath)
        const tabId = activeTab.id

        savedVersionsRef.current.set(tabId, hashScene(scene.elements))
        fileStatsRef.current.set(tabId, stat)
        clearRecovery(tabId)

        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  dirty: false,
                  filePath,
                  fileName,
                  name: stripDrawingExtension(fileName),
                }
              : tab,
          ),
        )

        return { saved: true }
      } catch (error) {
        return {
          saved: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
    [
      activeTab,
      clearRecovery,
      fileStatsRef,
      savedVersionsRef,
      scenesRef,
      setTabs,
    ],
  )

  const saveActiveDrawing = useCallback(async (): Promise<SaveResult> => {
    if (!activeTab) return { saved: false, error: 'No active drawing.' }
    if (!activeTab.filePath) return { saved: false, needsPath: true }

    return saveActiveDrawingToPath(activeTab.filePath)
  }, [activeTab, saveActiveDrawingToPath])

  // MARK: Closing and ordering

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId)
      if (!tab) return

      if (
        tab.dirty &&
        !window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`)
      ) {
        return
      }

      clearRecovery(tabId)
      scenesRef.current.delete(tabId)
      savedVersionsRef.current.delete(tabId)
      fileStatsRef.current.delete(tabId)

      const index = tabs.findIndex((candidate) => candidate.id === tabId)
      const remaining = tabs.filter((candidate) => candidate.id !== tabId)
      setTabs(remaining)

      if (activeTabId === tabId) {
        setActiveTabId(
          remaining[Math.min(index, remaining.length - 1)]?.id ?? null,
        )
      }
    },
    [
      tabs,
      activeTabId,
      clearRecovery,
      scenesRef,
      savedVersionsRef,
      fileStatsRef,
      setTabs,
      setActiveTabId,
    ],
  )

  const moveTab = useCallback(
    (tabId: string, targetTabId: string, position: TabDropPosition) => {
      setTabs((prev) => reorderTabs(prev, tabId, targetTabId, position))
    },
    [setTabs],
  )

  return {
    newDrawing,
    openDrawingFromPath,
    openDroppedFile,
    saveActiveDrawing,
    saveActiveDrawingToPath,
    closeTab,
    moveTab,
  }
}
