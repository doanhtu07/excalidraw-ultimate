import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'

export const DRAWING_FILE_EXTENSION = '.excalidraw'
const DRAWING_FILE_DESCRIPTION = 'Excalidraw drawings'
const DRAWING_MIME_TYPE = 'application/json'

// MARK: Scene types

/** Latest scene snapshot of a tab, kept in sync through Excalidraw's `onChange`. */
export interface DrawingScene {
  elements: ReadonlyArray<ExcalidrawElement>
  appState: Partial<AppState> | null
  files: BinaryFiles
}

export interface OpenedDrawingFile {
  file: File
  /** Present when opened through the File System Access API, so saving can write back to disk. */
  handle: FileSystemFileHandle | null
}

// MARK: Capabilities

/**
 * `@types/wicg-file-system-access` declares the pickers as globals, but they
 * are not available at runtime in every browser (Brave ships them disabled;
 * Firefox and Safari lack them). Look them up through an optional shape so
 * capability checks stay honest.
 */
type FilePickerGlobals = {
  showOpenFilePicker?: typeof showOpenFilePicker
  showSaveFilePicker?: typeof showSaveFilePicker
}

function pickerGlobals(): FilePickerGlobals {
  return globalThis
}

/**
 * Supported by Chrome and Edge. Brave, Firefox and Safari either lack the API
 * or ship it disabled, so their saves fall back to downloads and tabs cannot
 * be linked to a file. Capabilities are checked per operation: a browser may
 * support saving through a handle while not supporting the open picker, and
 * the package-level `supported` flag of `browser-fs-access` would downgrade
 * both in that case.
 */
export function canSaveWithFileHandle(): boolean {
  return typeof pickerGlobals().showSaveFilePicker === 'function'
}

export function canOpenWithFileHandle(): boolean {
  return typeof pickerGlobals().showOpenFilePicker === 'function'
}

// MARK: Scene serialization

/**
 * Excalidraw modules touch browser APIs at import time, so the package may
 * only be imported dynamically (the component lazy-loads it the same way).
 * These helpers are async for that reason.
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

// MARK: Dirty tracking

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

// MARK: Naming

export function stripDrawingExtension(name: string): string {
  return name.endsWith(DRAWING_FILE_EXTENSION)
    ? name.slice(0, -DRAWING_FILE_EXTENSION.length)
    : name
}

function suggestedFileName(fileName: string): string {
  return fileName.endsWith(DRAWING_FILE_EXTENSION)
    ? fileName
    : fileName + DRAWING_FILE_EXTENSION
}

// MARK: Change detection

/**
 * True when a file handle's file is gone (deleted, moved or renamed outside
 * the app). The File System Access API can change the file at any time, so
 * linked tabs have to detect this by attempting to read the file.
 */
export function isMissingFileError(error: unknown): boolean {
  return (error as DOMException | null)?.name === 'NotFoundError'
}

/** True when the user dismissed a file picker without choosing anything. */
export function isAbortError(error: unknown): boolean {
  return (error as DOMException | null)?.name === 'AbortError'
}

/**
 * Cheap version marker for a file. Reading `lastModified` and `size` only
 * needs the file metadata, so polling can skip reading the contents of
 * unchanged files.
 */
export interface FileStat {
  lastModified: number
  size: number
}

export function fileStatOf(file: File): FileStat {
  return { lastModified: file.lastModified, size: file.size }
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

// MARK: File access

async function writeDrawingFile(
  handle: FileSystemFileHandle,
  json: string,
): Promise<void> {
  const writable = await handle.createWritable()

  await writable.write(json)
  await writable.close()
}

/**
 * Opens one or more drawings. Uses the File System Access API where available
 * so tabs can be linked to their file; falls back to a file input elsewhere.
 * Rejects with an `AbortError` when the user cancels the dialog.
 */
export async function pickDrawingFiles(): Promise<Array<OpenedDrawingFile>> {
  const picker = pickerGlobals().showOpenFilePicker

  if (picker) {
    const handles = await picker({
      multiple: true,
      types: [
        {
          description: DRAWING_FILE_DESCRIPTION,
          accept: { [DRAWING_MIME_TYPE]: [DRAWING_FILE_EXTENSION] },
        },
      ],
    })

    return Promise.all(
      handles.map(async (handle) => ({ file: await handle.getFile(), handle })),
    )
  }

  const { fileOpen } = await import('browser-fs-access')

  const files = await fileOpen({
    multiple: true,
    extensions: [DRAWING_FILE_EXTENSION],
    description: DRAWING_FILE_DESCRIPTION,
  })

  return files.map((file) => ({ file, handle: file.handle ?? null }))
}

/**
 * Saves a drawing through the File System Access API: writes back to the
 * linked `handle` when given, otherwise asks for a location once. Resolves
 * with the handle the file is now stored under, so the tab can be linked to
 * it and later saves can write back silently.
 *
 * Browsers without the API (Brave, Firefox, Safari) download the file on
 * every save and resolve with `null`, since no handle can be obtained.
 */
export async function saveDrawingFile(
  json: string,
  fileName: string,
  handle: FileSystemFileHandle | null,
): Promise<FileSystemFileHandle | null> {
  const name = suggestedFileName(fileName)

  if (handle) {
    let exists = true

    try {
      await handle.getFile()
    } catch (error) {
      if (!isMissingFileError(error)) throw error
      exists = false
    }

    // The linked file is still there: write back to it silently.
    if (exists) {
      await writeDrawingFile(handle, json)
      return handle
    }
  }

  const picker = pickerGlobals().showSaveFilePicker

  if (picker) {
    const picked = await picker({
      suggestedName: name,
      types: [
        {
          description: DRAWING_FILE_DESCRIPTION,
          accept: { [DRAWING_MIME_TYPE]: [DRAWING_FILE_EXTENSION] },
        },
      ],
    })

    await writeDrawingFile(picked, json)
    return picked
  }

  const { fileSave } = await import('browser-fs-access')

  return fileSave(
    new Blob([json], { type: DRAWING_MIME_TYPE }),
    { fileName: name, extensions: [DRAWING_FILE_EXTENSION] },
    null,
  )
}
