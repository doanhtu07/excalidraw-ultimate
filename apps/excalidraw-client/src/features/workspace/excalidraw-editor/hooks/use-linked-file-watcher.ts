import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import type {
  DrawingScene,
  FileStat,
} from '@/features/workspace/excalidraw-file'
import {
  fileStatOf,
  hasFileChanged,
  hashScene,
  isMissingFileError,
  loadDrawingScene,
} from '@/features/workspace/excalidraw-file'

/** How often linked files are checked for external changes, in ms. */
const FILE_POLL_INTERVAL = 2000

export interface LinkedFileWatcherProps {
  tabs: ReadonlyArray<EditorTab>
  setTabs: Dispatch<SetStateAction<Array<EditorTab>>>
  scenesRef: RefObject<Map<string, DrawingScene>>
  savedVersionsRef: RefObject<Map<string, number>>
  handlesRef: RefObject<Map<string, FileSystemFileHandle>>
  fileStatsRef: RefObject<Map<string, FileStat>>
  fileTextsRef: RefObject<Map<string, string>>
}

/**
 * Reflects changes made to linked files outside the app.
 *
 * - The File System Access API has no change notifications, so linked files
 *   are polled. A tab that is saved to disk (or opened) is linked to its
 *   file; when that file changes, the tab reloads it.
 * - Polling only reads metadata: a file whose `lastModified`/`size` match the
 *   last known stat is never read, so unchanged files cost a stat.
 * - Tabs with unsaved edits are left alone so local work is never clobbered.
 * - A deleted/moved file unlinks the tab, which keeps the canvas contents
 *   and marks the tab dirty so the next save picks a new location.
 */
export function useLinkedFileWatcher({
  tabs,
  setTabs,
  scenesRef,
  savedVersionsRef,
  handlesRef,
  fileStatsRef,
  fileTextsRef,
}: LinkedFileWatcherProps): void {
  // Mirror of `tabs` so the watcher can read the latest state without
  // re-subscribing on every change.
  const tabsRef = useRef<ReadonlyArray<EditorTab>>(tabs)

  // MARK: Effects

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    // Wrapped in an object + helper so TypeScript cannot narrow it to `false`.
    const watcher = { cancelled: false }
    const isCancelled = () => watcher.cancelled
    let checking = false

    const checkLinkedFiles = async () => {
      // Hidden tabs are throttled anyway; the visibility handler checks
      // immediately when the user returns.
      if (checking || document.hidden) return
      checking = true

      try {
        for (const tab of tabsRef.current) {
          const handle = handlesRef.current.get(tab.id)
          if (!handle) continue

          let file: File

          try {
            file = await handle.getFile()
          } catch (error) {
            if (!isMissingFileError(error)) continue

            handlesRef.current.delete(tab.id)
            fileStatsRef.current.delete(tab.id)
            fileTextsRef.current.delete(tab.id)

            setTabs((prev) =>
              prev.map((candidate) =>
                candidate.id === tab.id
                  ? { ...candidate, fileName: null, dirty: true }
                  : candidate,
              ),
            )

            window.alert(
              `"${tab.name}" was deleted or moved outside the app. ` +
                'The tab is no longer linked to a file; save it to choose a new location.',
            )

            continue
          }

          const stat = fileStatOf(file)

          // Nothing changed on disk since the last read.
          if (!hasFileChanged(fileStatsRef.current.get(tab.id), stat)) continue

          const text = await file.text()

          if (isCancelled()) return

          // Our own save (or a touch that kept the contents): just refresh the
          // version marker without reloading the canvas.
          if (text === fileTextsRef.current.get(tab.id)) {
            fileStatsRef.current.set(tab.id, stat)
            continue
          }

          // The file changed externally. Keep local unsaved work untouched,
          // but remember the version so it is not read again every tick.
          if (tab.dirty) {
            fileStatsRef.current.set(tab.id, stat)
            fileTextsRef.current.set(tab.id, text)
            continue
          }

          let scene: DrawingScene

          try {
            scene = await loadDrawingScene(file)
          } catch {
            continue
          }

          if (isCancelled()) return

          scenesRef.current.set(tab.id, scene)
          savedVersionsRef.current.set(tab.id, hashScene(scene.elements))
          fileStatsRef.current.set(tab.id, stat)
          fileTextsRef.current.set(tab.id, text)

          setTabs((prev) =>
            prev.map((candidate) =>
              candidate.id === tab.id
                ? {
                    ...candidate,
                    dirty: false,
                    revision: candidate.revision + 1,
                  }
                : candidate,
            ),
          )
        }
      } finally {
        checking = false
      }
    }

    const intervalId = window.setInterval(() => {
      void checkLinkedFiles()
    }, FILE_POLL_INTERVAL)

    // Re-check right away when the user returns to the app.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkLinkedFiles()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      watcher.cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    handlesRef,
    fileStatsRef,
    fileTextsRef,
    scenesRef,
    savedVersionsRef,
    setTabs,
  ])
}
