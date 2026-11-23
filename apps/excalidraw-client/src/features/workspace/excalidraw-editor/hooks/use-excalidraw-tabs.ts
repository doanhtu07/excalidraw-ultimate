import { useCallback, useRef, useState } from 'react'
import { useLinkedFileWatcher } from './use-linked-file-watcher'
import type { RefObject } from 'react'
import type {
  DrawingScene,
  FileStat,
} from '@/features/workspace/excalidraw-file'
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
  canSaveWithFileHandle,
  fileStatOf,
  hashScene,
  isAbortError,
  loadDrawingScene,
  pickDrawingFiles,
  saveDrawingFile,
  serializeDrawingScene,
  stripDrawingExtension,
} from '@/features/workspace/excalidraw-file'

export interface ExcalidrawTabs {
  tabs: Array<EditorTab>
  activeTab: EditorTab | null
  activeTabId: string | null
  hasUnsavedTabs: boolean
  /** Latest scene snapshot per tab, kept in sync through Excalidraw's `onChange`. */
  scenesRef: RefObject<Map<string, DrawingScene>>
  setActiveTabId: (tabId: string | null) => void
  syncScene: (tabId: string, scene: DrawingScene) => void
  newDrawing: () => void
  openDrawingFile: (file: File, handle: FileSystemFileHandle | null) => void
  openDrawings: () => Promise<void>
  saveActiveDrawing: () => Promise<void>
  closeTab: (tabId: string) => void
  /** Moves a tab next to another one; used by drag-and-drop in the tab bar. */
  moveTab: (
    tabId: string,
    targetTabId: string,
    position: TabDropPosition,
  ) => void
}

/**
 * Owns the workspace tabs and everything tied to them: the scene snapshot of
 * each tab, the files tabs are linked to, dirty tracking, and the actions to
 * create, open, save and close drawings.
 *
 * Scenes live in refs because Excalidraw's `onChange` fires on every pointer
 * move; keeping them out of React state avoids re-rendering on every stroke.
 * Only dirty-flag flips reach React state.
 */
export function useExcalidrawTabs(): ExcalidrawTabs {
  const [tabs, setTabs] = useState<Array<EditorTab>>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const scenesRef = useRef(new Map<string, DrawingScene>())
  const savedVersionsRef = useRef(new Map<string, number>())
  const handlesRef = useRef(new Map<string, FileSystemFileHandle>())
  // Last-known version and contents of each linked file, used to detect
  // external changes: the stat is compared on every poll so unchanged files
  // are never read, and the text tells apart our own saves from real edits.
  const fileStatsRef = useRef(new Map<string, FileStat>())
  const fileTextsRef = useRef(new Map<string, string>())
  // Whether the "saves are downloads" explanation has already been shown.
  const hasWarnedAboutDownloadsRef = useRef(false)

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const hasUnsavedTabs = tabs.some((tab) => tab.dirty)

  const syncScene = useCallback((tabId: string, scene: DrawingScene) => {
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
  }, [])

  const newDrawing = useCallback(() => {
    const id = createTabId()

    scenesRef.current.set(id, { elements: [], appState: null, files: {} })
    savedVersionsRef.current.set(id, hashScene([]))

    setTabs((prev) => [
      ...prev,
      {
        id,
        name: createUntitledName(prev),
        dirty: false,
        fileName: null,
        revision: 0,
      },
    ])

    setActiveTabId(id)
  }, [])

  const openDrawingFile = useCallback(
    async (file: File, handle: FileSystemFileHandle | null) => {
      try {
        const [scene, text] = await Promise.all([
          loadDrawingScene(file),
          file.text(),
        ])

        const id = createTabId()

        scenesRef.current.set(id, scene)
        savedVersionsRef.current.set(id, hashScene(scene.elements))
        fileTextsRef.current.set(id, text)
        fileStatsRef.current.set(id, fileStatOf(file))

        if (handle) handlesRef.current.set(id, handle)

        setTabs((prev) => [
          ...prev,
          {
            id,
            name: stripDrawingExtension(file.name),
            dirty: false,
            // Only link the tab when a real handle is available: without one
            // (file input fallback) saving cannot write back to this file.
            fileName: handle ? file.name : null,
            revision: 0,
          },
        ])

        setActiveTabId(id)
      } catch {
        window.alert(`Couldn't open "${file.name}" as an Excalidraw drawing.`)
      }
    },
    [],
  )

  const openDrawings = useCallback(async () => {
    try {
      const opened = await pickDrawingFiles()

      await Promise.all(
        opened.map(({ file, handle }) => openDrawingFile(file, handle)),
      )
    } catch (error) {
      if (!isAbortError(error)) {
        window.alert('Something went wrong while opening the drawing.')
      }
    }
  }, [openDrawingFile])

  const saveActiveDrawing = useCallback(async () => {
    if (!activeTab) return

    const tabId = activeTab.id
    const scene = scenesRef.current.get(tabId)
    if (!scene) return

    const handle = handlesRef.current.get(tabId) ?? null

    let json: string
    let savedHandle: FileSystemFileHandle | null

    try {
      json = await serializeDrawingScene(scene)
      savedHandle = await saveDrawingFile(json, activeTab.name, handle)
    } catch (error) {
      // The save picker was dismissed: nothing failed, nothing to report.
      if (!isAbortError(error)) {
        window.alert(`Saving "${activeTab.name}" failed.`)
      }

      return
    }

    // The saved text is the baseline for external-change detection.
    fileTextsRef.current.set(tabId, json)
    savedVersionsRef.current.set(tabId, hashScene(scene.elements))

    // Record the file's new stat so the watcher doesn't mistake our own write
    // for an external change.
    const linkedHandle = savedHandle ?? handle
    if (linkedHandle) {
      try {
        fileStatsRef.current.set(
          tabId,
          fileStatOf(await linkedHandle.getFile()),
        )
      } catch {
        // The watcher re-checks the file on its next tick.
        fileStatsRef.current.delete(tabId)
      }
    }

    // First save of an untitled drawing may have created a real file — from
    // now on the tab is linked to it and saving writes back to it silently.
    if (savedHandle) {
      handlesRef.current.set(tabId, savedHandle)

      const fileName = savedHandle.name

      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                dirty: false,
                fileName,
                name: stripDrawingExtension(fileName),
              }
            : tab,
        ),
      )

      return
    }

    // Without the File System Access API the save was a download: it cannot
    // be linked or written back to, so explain why only once per session.
    if (!canSaveWithFileHandle() && !hasWarnedAboutDownloadsRef.current) {
      hasWarnedAboutDownloadsRef.current = true
      window.alert(
        'This browser cannot write back to a saved file, so every save downloads a new copy. ' +
          'In Brave, enable brave://flags/#file-system-access-api; Chrome and Edge support it out of the box.',
      )
    }

    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, dirty: false } : tab)),
    )
  }, [activeTab])

  const closeTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId)
      if (!tab) return

      if (
        tab.dirty &&
        !window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`)
      )
        return

      scenesRef.current.delete(tabId)
      savedVersionsRef.current.delete(tabId)
      handlesRef.current.delete(tabId)
      fileStatsRef.current.delete(tabId)
      fileTextsRef.current.delete(tabId)

      const index = tabs.findIndex((candidate) => candidate.id === tabId)
      const remaining = tabs.filter((candidate) => candidate.id !== tabId)
      setTabs(remaining)

      if (activeTabId === tabId) {
        setActiveTabId(
          remaining[Math.min(index, remaining.length - 1)]?.id ?? null,
        )
      }
    },
    [tabs, activeTabId],
  )

  const moveTab = useCallback(
    (tabId: string, targetTabId: string, position: TabDropPosition) => {
      setTabs((prev) => reorderTabs(prev, tabId, targetTabId, position))
    },
    [],
  )

  // MARK: Effects

  useLinkedFileWatcher({
    tabs,
    setTabs,
    scenesRef,
    savedVersionsRef,
    handlesRef,
    fileStatsRef,
    fileTextsRef,
  })

  // MARK: Return value

  return {
    tabs,
    activeTab,
    activeTabId,
    hasUnsavedTabs,
    scenesRef,
    setActiveTabId,
    syncScene,
    newDrawing,
    openDrawingFile,
    openDrawings,
    saveActiveDrawing,
    closeTab,
    moveTab,
  }
}
