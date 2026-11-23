import { useEffect, useRef } from 'react'
import { createBridge } from './create-bridge'
import type { AgentBridgeOptions } from './bridge-types'

/**
 * Publishes the agent control surface while the editor is mounted. The bridge
 * reads a ref so the methods always see the latest tabs and canvas API without
 * re-registering `window.__EXCALIDRAW_AGENT__` on every render.
 */
export function useAgentBridge(options: AgentBridgeOptions): void {
  // MARK: Variables + States

  const optionsRef = useRef(options)

  // MARK: Effects

  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    if (!optionsRef.current.enabled) return

    const bridge = createBridge(optionsRef)

    window.__EXCALIDRAW_AGENT__ = bridge

    return () => {
      if (window.__EXCALIDRAW_AGENT__ === bridge) {
        delete window.__EXCALIDRAW_AGENT__
      }
    }
  }, [options.enabled])
}
