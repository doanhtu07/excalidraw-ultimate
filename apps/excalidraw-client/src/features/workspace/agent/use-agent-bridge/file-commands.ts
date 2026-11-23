import type { ExcalidrawAgentBridge } from '../agent-types'
import type { BridgeContext } from './bridge-types'

type FileCommands = Pick<ExcalidrawAgentBridge, 'open' | 'save'>

/** Commands that open drawings from disk and save them back. */
export function createFileCommands({
  options,
  state,
}: BridgeContext): FileCommands {
  return {
    open: async (filePath) => ({
      tabId: await options().openPath(filePath),
      path: filePath,
    }),

    save: async () => {
      await options().saveActiveDrawing()

      // Let the tab's dirty flag settle before reporting state.
      await new Promise((resolve) => setTimeout(resolve, 50))

      return state()
    },
  }
}
