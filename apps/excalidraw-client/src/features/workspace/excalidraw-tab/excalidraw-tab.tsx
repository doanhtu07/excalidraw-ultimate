import '@excalidraw/excalidraw/index.css'

import { Suspense, lazy, memo, useEffect, useRef, useState } from 'react'
import styles from './excalidraw-tab.module.css'
import type { RefObject } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'
import type { DrawingScene } from '@/features/workspace/files/scene'

// Excalidraw touches browser APIs at import time, so it is dynamically
// imported (and therefore only ever executed) in the browser.
const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then((mod) => ({ default: mod.Excalidraw })),
)

/**
 * Restores only durable view state — scroll, zoom, canvas background and
 * grid. Selections and transient UI state stay local to the session in which
 * they were made.
 */
function buildInitialData(
  scene: DrawingScene | undefined,
): ImportedDataState | null {
  if (!scene) return null

  const { appState } = scene

  return {
    elements: scene.elements,
    files: scene.files,
    appState: {
      scrollX: appState?.scrollX,
      scrollY: appState?.scrollY,
      zoom: appState?.zoom,
      viewBackgroundColor: appState?.viewBackgroundColor,
      gridSize: appState?.gridSize,
      gridModeEnabled: appState?.gridModeEnabled,
    },
  }
}

interface ExcalidrawTabProps {
  tabId: string
  scenesRef: RefObject<Map<string, DrawingScene>>
  syncScene: (tabId: string, scene: DrawingScene) => void
  /** Reports the imperative API of the mounted canvas to the agent bridge. */
  onApiReady?: (api: ExcalidrawImperativeAPI | null) => void
}

/**
 * A single mounted Excalidraw canvas for one tab. The snapshot stored in
 * `scenesRef` is picked up in an effect (refs are only read outside render),
 * then handed to Excalidraw as its initial scene.
 */
export const ExcalidrawTab = memo(function ExcalidrawCanvas({
  tabId,
  scenesRef,
  syncScene,
  onApiReady,
}: ExcalidrawTabProps) {
  const [initialData, setInitialData] = useState<ImportedDataState | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)

  // MARK: Effects

  useEffect(() => {
    setInitialData(buildInitialData(scenesRef.current.get(tabId)))
  }, [tabId, scenesRef])

  useEffect(() => {
    return () => {
      apiRef.current = null
      onApiReady?.(null)
    }
  }, [onApiReady])

  // MARK: Renderers

  if (!initialData) return null

  return (
    <Suspense fallback={null}>
      <div className={styles.root}>
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={(api) => {
            apiRef.current = api
            onApiReady?.(api)
          }}
          onChange={(elements, appState, files) =>
            syncScene(tabId, { elements, appState, files })
          }
        />
      </div>
    </Suspense>
  )
})
