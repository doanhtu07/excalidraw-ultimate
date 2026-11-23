import { applyPatch } from './apply-patch'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { AgentPatch, ExcalidrawAgentBridge } from '../agent-types'
import type { BridgeContext } from './bridge-types'

type WriteCommands = Pick<
  ExcalidrawAgentBridge,
  'add' | 'apply' | 'update' | 'deleteElements' | 'clear' | 'restore'
>

/** Commands that mutate the active scene. */
export function createWriteCommands(context: BridgeContext): WriteCommands {
  const runPatch = (patch: AgentPatch) => applyPatch(context, patch)

  return {
    add: async (skeletons, addOptions) => {
      const result = await runPatch({
        create: Array.isArray(skeletons) ? skeletons : [skeletons],
      })

      if (addOptions?.scroll && result.created.length > 0) {
        const instance = context.api()
        const ids = new Set(result.created)
        const created = instance
          .getSceneElements()
          .filter((element) => ids.has(element.id))

        instance.scrollToContent(created, {
          fitToContent: true,
          animate: true,
        })
      }

      return result
    },

    apply: runPatch,

    update: (id, set) => runPatch({ update: [{ id, set }] }),

    deleteElements: (ids) => runPatch({ delete: ids }),

    clear: () => {
      const instance = context.api()
      const deleted = instance
        .getSceneElements()
        .filter((element) => !element.isDeleted)
        .map((element) => element.id)

      instance.resetScene()

      return { created: [], updated: [], deleted, warnings: [] }
    },

    restore: ({ elements, appState, files }) => {
      const instance = context.api()

      if (files && Object.keys(files).length > 0) {
        instance.addFiles(Object.values(files))
      }

      const restoredState: Partial<AppState> = appState
        ? {
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            zoom: {
              value: appState.zoom as unknown as AppState['zoom']['value'],
            },
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize ?? undefined,
            gridModeEnabled: appState.gridModeEnabled,
            theme: appState.theme as AppState['theme'],
          }
        : {}

      instance.updateScene({
        elements,
        appState: restoredState as unknown as AppState,
        captureUpdate: 'IMMEDIATELY',
      })

      return { restored: elements.length }
    },
  }
}
