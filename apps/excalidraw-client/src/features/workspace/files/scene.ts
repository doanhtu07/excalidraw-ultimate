import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'

export const DRAWING_FILE_EXTENSION = '.excalidraw'

/** Latest scene snapshot of a tab, kept in sync through Excalidraw's `onChange`. */
export interface DrawingScene {
  elements: ReadonlyArray<ExcalidrawElement>
  appState: Partial<AppState> | null
  files: BinaryFiles
}

/** Cheap version marker for a file, used to detect external changes. */
export interface FileStat {
  lastModified: number
  size: number
}

/**
 * Excalidraw modules touch browser APIs at import time, so the package may
 * only be imported dynamically (the component lazy-loads it the same way).
 */
export async function loadDrawingScene(file: File): Promise<DrawingScene> {
  const { loadFromBlob } = await import('@excalidraw/excalidraw')
  const restored = await loadFromBlob(file, null, null)

  return {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
  }
}

export async function serializeDrawingScene(
  scene: DrawingScene,
): Promise<string> {
  const { serializeAsJSON } = await import('@excalidraw/excalidraw')

  return serializeAsJSON(
    scene.elements,
    scene.appState ?? {},
    scene.files,
    'local',
  )
}

/**
 * Cheap hash mirroring Excalidraw's element version hash: any edit, add,
 * delete, or undo produces a different value, which is what tab dirty
 * indicators are derived from.
 */
export function hashScene(elements: ReadonlyArray<ExcalidrawElement>): number {
  return elements.reduce(
    (hash, element) => (hash * 31 + element.version) | 0,
    1,
  )
}

export function hasFileChanged(
  previous: FileStat | undefined,
  next: FileStat,
): boolean {
  return (
    previous === undefined ||
    previous.lastModified !== next.lastModified ||
    previous.size !== next.size
  )
}

export function stripDrawingExtension(name: string): string {
  return name.endsWith(DRAWING_FILE_EXTENSION)
    ? name.slice(0, -DRAWING_FILE_EXTENSION.length)
    : name
}
