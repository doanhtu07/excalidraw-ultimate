import { formatSceneSummary, summarizeElements } from '../agent-scene'
import { BRIDGE_HELP } from './help'
import { appStateOf } from './scene-helpers'
import type { AgentScenePayload, ExcalidrawAgentBridge } from '../agent-types'
import type { BridgeContext } from './bridge-types'

type ReadCommands = Pick<
  ExcalidrawAgentBridge,
  'help' | 'getState' | 'getScene' | 'describe'
>

/** Commands that only read the workspace or the active scene. */
export function createReadCommands({
  api,
  options,
  state,
}: BridgeContext): ReadCommands {
  return {
    help: () => BRIDGE_HELP,

    getState: () => state(),

    getScene: (): AgentScenePayload => {
      const instance = api()

      return {
        elements: instance.getSceneElements(),
        appState: appStateOf(instance.getAppState()),
        files: instance.getFiles(),
      }
    },

    describe: () => {
      const instance = api()
      const tabs = options().tabs
      const active = tabs.find((tab) => tab.id === options().activeTabId)
      const summary = summarizeElements(instance.getSceneElements())

      return {
        ...summary,
        filePath: active?.filePath ?? null,
        name: active?.name ?? null,
        dirty: active?.dirty ?? false,
        text: formatSceneSummary(summary),
      }
    },
  }
}
