import path from 'node:path'
import { AgentFileError } from './errors.ts'

const DRAWING_EXTENSIONS = new Set(['.excalidraw', '.json'])
const DENIED_SEGMENTS = new Set(['.git', 'node_modules'])

export const ALLOWED_ROOTS_ENV = 'EXCALIDRAW_ULTIMATE_ALLOWED_ROOTS'

function isInsideRoot(absolutePath: string, root: string): boolean {
  return absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`)
}

export function assertPathIsAllowed(
  absolutePath: string,
  allowedRoots: ReadonlyArray<string>,
): void {
  const segments = absolutePath.split(path.sep)

  if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) {
    throw new AgentFileError(403, 'Refusing to access .git or node_modules.')
  }

  if (
    allowedRoots.length > 0 &&
    !allowedRoots.some((root) => isInsideRoot(absolutePath, root))
  ) {
    throw new AgentFileError(
      403,
      `Path is outside ${ALLOWED_ROOTS_ENV} (${allowedRoots.join(', ')}).`,
    )
  }
}

/** Resolves a user-provided path to an absolute drawing path. */
export function resolveDrawingPath(
  input: string,
  allowedRoots: ReadonlyArray<string>,
): string {
  if (!input.trim()) throw new AgentFileError(400, 'A file path is required.')

  const absolutePath = path.resolve(input)
  const extension = path.extname(absolutePath).toLowerCase()

  if (!DRAWING_EXTENSIONS.has(extension)) {
    throw new AgentFileError(
      400,
      `Only ${[...DRAWING_EXTENSIONS].join(' / ')} drawings can be accessed.`,
    )
  }

  assertPathIsAllowed(absolutePath, allowedRoots)

  return absolutePath
}

/** Resolves a user-provided path to an absolute directory path. */
export function resolveDirectoryPath(
  input: string,
  allowedRoots: ReadonlyArray<string>,
): string {
  if (!input.trim()) {
    throw new AgentFileError(400, 'A directory path is required.')
  }

  const absolutePath = path.resolve(input)

  assertPathIsAllowed(absolutePath, allowedRoots)

  return absolutePath
}
