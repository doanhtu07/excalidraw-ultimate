import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { AgentAppState } from '../agent-types'

// MARK: Elements

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Mirrors Excalidraw's own `mutateElement`: a new version is what tells the
 * editor that a programmatic change is a real edit.
 */
export function bumpElement<T extends ExcalidrawElement>(
  element: T,
  updates: Record<string, unknown>,
): T {
  return {
    ...element,
    ...updates,
    version: element.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    updated: Date.now(),
  }
}

/** Applies one `update(id, set)` entry, following a bound label when asked. */
export function applyUpdate(
  elements: Array<ExcalidrawElement>,
  index: number,
  set: Record<string, unknown>,
  warnings: Array<string>,
): Array<ExcalidrawElement> {
  const target = elements[index]
  const updates = { ...set }
  const text = updates.text
  delete updates.text

  const next = [...elements]

  if (Object.keys(updates).length > 0) {
    next[index] = bumpElement(target, updates)
  }

  if (typeof text === 'string') {
    const textIndex = next.findIndex(
      (element) => element.type === 'text' && element.containerId === target.id,
    )

    if (textIndex >= 0) {
      next[textIndex] = bumpElement(next[textIndex], {
        text,
        originalText: text,
      })
    } else if (target.type === 'text') {
      next[index] = bumpElement(next[index], { text, originalText: text })
    } else {
      warnings.push(
        `"${target.id}" has no bound label; recreate it with "text" to change its label.`,
      )
    }
  }

  return next
}

// MARK: App state

/** Reduces Excalidraw's `AppState` to the serialisable fields agents need. */
export function appStateOf(state: AppState): AgentAppState {
  return {
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoom: state.zoom.value,
    viewBackgroundColor: state.viewBackgroundColor,
    gridSize: state.gridSize,
    gridModeEnabled: Boolean(state.gridModeEnabled),
    theme: state.theme,
  }
}
