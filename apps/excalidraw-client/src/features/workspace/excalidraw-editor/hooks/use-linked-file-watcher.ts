import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import type { DrawingScene, FileStat } from '@/features/workspace/files/scene'
import {
  readAgentDrawingFile,
  statAgentFile,
} from '@/features/workspace/files/agent-client'
import {
  hasFileChanged,
  hashScene,
  loadDrawingScene,
} from '@/features/workspace/files/scene'

/** How often linked files are checked for external changes, in ms. */
const FILE_POLL_INTERVAL = 2000

export interface LinkedFileWatcherProps {
  tabs: ReadonlyArray<EditorTab>
  setTabs: Dispatch<SetStateAction<Array<EditorTab>>>
  scenesRef: RefObject<Map<string, DrawingScene>>
  savedVersionsRef: RefObject<Map<string, number>>
  fileStatsRef: RefObject<Map<string, FileStat>>
}

/**
 * Reflects changes made to path-linked drawings outside the app.
 *
 * Polling only reads metadata; a file whose `lastModified`/`size` match the
 * last known stat is never read. Tabs with unsaved edits are left alone so
 * local work is never clobbered. A deleted/moved file marks the tab dirty so
 * the next save can recreate it.
 */
export function useLinkedFileWatcher({
  tabs,
  setTabs,
  scenesRef,
  savedVersionsRef,
  fileStatsRef,
}: LinkedFileWatcherProps): void {
  const tabsRef = useRef<ReadonlyArray<EditorTab>>(tabs)
  const warnedRef = useRef(new Set<string>())

  // MARK: Effects

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    const watcher = { cancelled: false }
    const isCancelled = () => watcher.cancelled
    let checking = false

    const checkLinkedFiles = async () => {
      if (checking || document.hidden) return
      checking = true

      try {
        for (const tab of tabsRef.current) {
          if (!tab.filePath) continue

          let stat: FileStat

          try {
            stat = await statAgentFile(tab.filePath)
          } catch {
            if (!warnedRef.current.has(tab.id)) {
              warnedRef.current.add(tab.id)
              setTabs((prev) =>
                prev.map((candidate) =>
                  candidate.id === tab.id
                    ? { ...candidate, dirty: true }
                    : candidate,
                ),
              )
            }
            continue
          }

          warnedRef.current.delete(tab.id)

          if (!hasFileChanged(fileStatsRef.current.get(tab.id), stat)) {
            continue
          }

          // Keep local unsaved work untouched, but remember the new stat so
          // the file is not re-read on every tick.
          if (tab.dirty) {
            fileStatsRef.current.set(tab.id, stat)
            continue
          }

          let scene: DrawingScene

          try {
            const opened = await readAgentDrawingFile(tab.filePath)
            scene = await loadDrawingScene(opened.file)
          } catch {
            continue
          }

          if (isCancelled()) return

          const version = hashScene(scene.elements)

          // Our own save or a content-neutral touch: no canvas reload needed.
          if (version === savedVersionsRef.current.get(tab.id)) {
            fileStatsRef.current.set(tab.id, stat)
            continue
          }

          scenesRef.current.set(tab.id, scene)
          savedVersionsRef.current.set(tab.id, version)
          fileStatsRef.current.set(tab.id, stat)

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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkLinkedFiles()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      watcher.cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fileStatsRef, scenesRef, savedVersionsRef, setTabs])
}
