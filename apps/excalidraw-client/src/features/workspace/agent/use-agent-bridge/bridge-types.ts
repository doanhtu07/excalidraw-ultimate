import type { RefObject } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { EditorTab } from '@/features/workspace/editor-tabs'
import type { AgentState } from '../agent-types'

// MARK: Options

export interface AgentBridgeOptions {
  enabled: boolean
  workspaceRoot: string | null
  tabs: ReadonlyArray<EditorTab>
  activeTabId: string | null
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  openPath: (filePath: string) => Promise<string | null>
  saveActiveDrawing: () => Promise<void>
}

// MARK: Context

/** What every command module receives from `createBridge`. */
export interface BridgeContext {
  /** Latest props, read from a ref so commands never go stale. */
  options: () => AgentBridgeOptions
  /** The mounted canvas, or a helpful error when no drawing is open. */
  api: () => ExcalidrawImperativeAPI
  /** Snapshot of tabs and readiness for agents. */
  state: () => AgentState
}
