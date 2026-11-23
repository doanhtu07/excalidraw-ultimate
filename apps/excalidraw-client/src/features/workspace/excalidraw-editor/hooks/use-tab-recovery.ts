import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { DrawingScene } from '@/features/workspace/files/scene'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import { hashScene } from '@/features/workspace/files/scene'
import {
  recoveryFileName,
  recoveryRelativePath,
  removeRecovery,
  writeRecoveryScene,
} from '@/features/workspace/workspace-recovery'
import { recoveryPath } from '@/features/workspace/workspace-layout'
import { beaconWrite } from '@/features/workspace/workspace-beacon'

const RECOVERY_DEBOUNCE_MS = 800

interface TabRecoveryOptions {
  stateDir: string | null
  tabs: Array<EditorTab>
  savedVersionsRef: RefObject<Map<string, number>>
  recoveryFilesRef: RefObject<Map<string, string>>
  persistLayout: () => Promise<void>
}

interface TabRecovery {
  scheduleRecovery: (tabId: string, scene: DrawingScene) => void
  clearRecovery: (tabId: string) => void
}

/** Writes dirty scenes to `recovery/` and keeps the layout in sync. */
export function useTabRecovery({
  stateDir,
  tabs,
  savedVersionsRef,
  recoveryFilesRef,
  persistLayout,
}: TabRecoveryOptions): TabRecovery {
  const [saveError, setSaveError] = useState<string | null>(null)
  const tabsRef = useRef(tabs)
  const stateDirRef = useRef(stateDir)
  const timersRef = useRef(new Map<string, number>())
  const pendingScenesRef = useRef(new Map<string, DrawingScene>())
  const writingRef = useRef(new Set<string>())
  const jsonCacheRef = useRef(new Map<string, { path: string; json: string }>())

  const runWrite = useCallback(
    async (tabId: string) => {
      const dir = stateDirRef.current
      if (!dir || writingRef.current.has(tabId)) return

      const tab = tabsRef.current.find((candidate) => candidate.id === tabId)
      if (!tab) return

      writingRef.current.add(tabId)

      try {
        while (pendingScenesRef.current.has(tabId)) {
          const scene = pendingScenesRef.current.get(tabId)
          pendingScenesRef.current.delete(tabId)
          if (!scene) continue

          // The tab was saved or closed after this write was queued.
          const stillOpen = tabsRef.current.some(
            (candidate) => candidate.id === tabId,
          )
          const isDirty =
            hashScene(scene.elements) !== savedVersionsRef.current.get(tabId)

          if (!stillOpen || !isDirty) continue

          const recovery = recoveryRelativePath(
            recoveryFileName(tabId, tab.name),
          )
          const json = await writeRecoveryScene(dir, recovery, scene)

          // Close/save may have raced the write; never reference a recovery
          // file for a tab that is gone or clean by now.
          if (!tabsRef.current.some((candidate) => candidate.id === tabId)) {
            await removeRecovery(dir, recovery).catch(() => {})
            continue
          }

          recoveryFilesRef.current.set(tabId, recovery)
          jsonCacheRef.current.set(tabId, {
            path: recoveryPath(dir, recovery),
            json,
          })
        }

        // The layout references recovery files; persist it once the dirty
        // scene is safely on disk.
        await persistLayout()
        setSaveError(null)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error))
      } finally {
        writingRef.current.delete(tabId)
      }
    },
    [persistLayout, recoveryFilesRef, savedVersionsRef],
  )

  const scheduleRecovery = useCallback(
    (tabId: string, scene: DrawingScene) => {
      if (!stateDirRef.current) return

      pendingScenesRef.current.set(tabId, scene)

      const existing = timersRef.current.get(tabId)
      if (existing !== undefined) window.clearTimeout(existing)

      const timer = window.setTimeout(() => {
        timersRef.current.delete(tabId)
        void runWrite(tabId)
      }, RECOVERY_DEBOUNCE_MS)

      timersRef.current.set(tabId, timer)
    },
    [runWrite],
  )

  const clearRecovery = useCallback(
    (tabId: string) => {
      const dir = stateDirRef.current
      const timer = timersRef.current.get(tabId)

      if (timer !== undefined) {
        window.clearTimeout(timer)
        timersRef.current.delete(tabId)
      }

      pendingScenesRef.current.delete(tabId)
      jsonCacheRef.current.delete(tabId)

      const recovery = recoveryFilesRef.current.get(tabId)

      if (dir && recovery) {
        recoveryFilesRef.current.delete(tabId)
        void removeRecovery(dir, recovery).catch(() => {})
      }
    },
    [recoveryFilesRef],
  )

  // MARK: Effects

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    stateDirRef.current = stateDir
  }, [stateDir])

  useEffect(() => {
    const flush = () => {
      for (const entry of jsonCacheRef.current.values()) {
        beaconWrite(entry.path, entry.json)
      }
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
  }, [])

  useEffect(() => {
    const timers = timersRef.current

    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }

      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (saveError) {
      console.warn(`[excalidraw] recovery write failed: ${saveError}`)
    }
  }, [saveError])

  // MARK: Return value

  return { scheduleRecovery, clearRecovery }
}
