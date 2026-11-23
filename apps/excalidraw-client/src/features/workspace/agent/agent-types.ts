import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import type { AgentSceneSummary } from './agent-scene'

/**
 * Public shape of `window.__EXCALIDRAW_AGENT__`, the control surface the
 * `excalidraw-ultimate` skill drives through the Chrome DevTools Protocol.
 * It intentionally returns plain JSON so CDP can serialise every result.
 */

export interface AgentTabState {
  id: string
  name: string
  filePath: string | null
  fileName: string | null
  dirty: boolean
  active: boolean
}

export interface AgentState {
  version: 1
  ready: boolean
  url: string
  workspaceRoot: string | null
  activeTabId: string | null
  tabs: Array<AgentTabState>
}

export interface AgentAppState {
  scrollX: number
  scrollY: number
  zoom: number
  viewBackgroundColor: string
  gridSize: number | null
  gridModeEnabled: boolean
  theme: string
}

export interface AgentScenePayload {
  elements: ReadonlyArray<ExcalidrawElement>
  appState: AgentAppState
  files: BinaryFiles
}

export interface AgentDescribeResult extends AgentSceneSummary {
  filePath: string | null
  name: string | null
  dirty: boolean
  text: string
}

export interface AgentUpdate {
  id: string
  set?: Record<string, unknown>
  [key: string]: unknown
}

export interface AgentPatch {
  create?: Array<unknown>
  update?: Array<AgentUpdate>
  delete?: Array<string>
}

export interface AgentMutationResult {
  created: Array<string>
  updated: Array<string>
  deleted: Array<string>
  warnings: Array<string>
}

export interface AgentViewportOptions {
  fit?: boolean
  ids?: Array<string>
  zoom?: number
  animate?: boolean
}

export interface ExcalidrawAgentBridge {
  version: 1
  help: () => string
  getState: () => AgentState
  getScene: () => AgentScenePayload
  describe: () => AgentDescribeResult
  open: (filePath: string) => Promise<{ tabId: string | null; path: string }>
  save: () => Promise<AgentState>
  add: (
    elements: unknown,
    options?: { scroll?: boolean },
  ) => Promise<AgentMutationResult>
  apply: (patch: AgentPatch) => Promise<AgentMutationResult>
  update: (
    id: string,
    set: Record<string, unknown>,
  ) => Promise<AgentMutationResult>
  deleteElements: (ids: Array<string>) => Promise<AgentMutationResult>
  clear: () => AgentMutationResult
  restore: (
    scene: Pick<AgentScenePayload, 'elements'> &
      Partial<Pick<AgentScenePayload, 'appState' | 'files'>>,
  ) => { restored: number }
  setViewport: (options: AgentViewportOptions) => void
}

declare global {
  interface Window {
    __EXCALIDRAW_AGENT__?: ExcalidrawAgentBridge
  }
}
