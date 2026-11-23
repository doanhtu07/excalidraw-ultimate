import type { AppState } from '@excalidraw/excalidraw/types'
import type { ExcalidrawAgentBridge } from '../agent-types'
import type { BridgeContext } from './bridge-types'

type CanvasCommands = Pick<ExcalidrawAgentBridge, 'setViewport'>

/** Commands that move the viewport instead of editing the scene. */
export function createCanvasCommands({ api }: BridgeContext): CanvasCommands {
  return {
    setViewport: ({ fit, ids, zoom, animate = true }) => {
      const instance = api()

      if (typeof zoom === 'number' && Number.isFinite(zoom)) {
        const value = Math.min(8, Math.max(0.1, zoom))

        instance.updateScene({
          appState: {
            zoom: { value: value as unknown as AppState['zoom']['value'] },
          },
        })
      }

      if (ids?.length) {
        const selected = new Set(ids)
        const elements = instance
          .getSceneElements()
          .filter((element) => selected.has(element.id))

        if (elements.length === 0) {
          throw new Error('None of the requested element ids exist.')
        }

        instance.scrollToContent(elements, { fitToContent: true, animate })
      } else if (fit) {
        instance.scrollToContent(undefined, { fitToContent: true, animate })
      }
    },
  }
}
