import { createCanvasCommands } from './canvas-commands'
import { createFileCommands } from './file-commands'
import { createReadCommands } from './read-commands'
import { createWriteCommands } from './write-commands'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { AgentState, ExcalidrawAgentBridge } from '../agent-types'
import type { AgentBridgeOptions, BridgeContext } from './bridge-types'

/** Builds the command surface published as `window.__EXCALIDRAW_AGENT__`. */
export function createBridge(optionsRef: {
  current: AgentBridgeOptions
}): ExcalidrawAgentBridge {
  const options = () => optionsRef.current

  const api = (): ExcalidrawImperativeAPI => {
    const instance = options().apiRef.current

    if (!instance) {
      throw new Error(
        'No drawing is open. Call open(path) with a .excalidraw file first.',
      )
    }

    return instance
  }

  const state = (): AgentState => {
    const { tabs, activeTabId, workspaceRoot } = options()

    return {
      version: 1,
      ready: options().apiRef.current !== null,
      url: window.location.href,
      workspaceRoot,
      activeTabId,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        filePath: tab.filePath,
        fileName: tab.fileName,
        dirty: tab.dirty,
        active: tab.id === activeTabId,
      })),
    }
  }

  const context: BridgeContext = { options, api, state }

  return {
    version: 1,
    ...createReadCommands(context),
    ...createFileCommands(context),
    ...createWriteCommands(context),
    ...createCanvasCommands(context),
  }
}
