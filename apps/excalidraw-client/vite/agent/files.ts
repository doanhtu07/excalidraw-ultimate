import { promises as fs } from 'node:fs'
import path from 'node:path'
import { AgentFileError } from './errors.ts'
import { MAX_FILE_BYTES, readJsonBody, statPayload } from './http.ts'
import { resolveDrawingPath } from './paths.ts'
import type { IncomingMessage } from 'node:http'
import type {
  ReadFilePayload,
  StatFilePayload,
  WriteFilePayload,
} from './types.ts'

export async function readDrawingFile(
  filePath: string,
  allowedRoots: ReadonlyArray<string>,
): Promise<ReadFilePayload> {
  const absolutePath = resolveDrawingPath(filePath, allowedRoots)

  let stat

  try {
    stat = await fs.stat(absolutePath)
  } catch {
    throw new AgentFileError(404, `Drawing not found: ${absolutePath}`)
  }

  if (!stat.isFile()) {
    throw new AgentFileError(400, `Not a file: ${absolutePath}`)
  }

  if (stat.size > MAX_FILE_BYTES) {
    throw new AgentFileError(
      413,
      `Drawing is larger than 20 MB: ${absolutePath}`,
    )
  }

  const text = await fs.readFile(absolutePath, 'utf8')

  return {
    path: absolutePath,
    name: path.basename(absolutePath),
    text,
    stat: statPayload(stat),
  }
}

export async function statDrawingFile(
  filePath: string,
  allowedRoots: ReadonlyArray<string>,
): Promise<StatFilePayload> {
  const absolutePath = resolveDrawingPath(filePath, allowedRoots)

  let stat

  try {
    stat = await fs.stat(absolutePath)
  } catch {
    throw new AgentFileError(404, `Drawing not found: ${absolutePath}`)
  }

  if (!stat.isFile()) {
    throw new AgentFileError(400, `Not a file: ${absolutePath}`)
  }

  return {
    path: absolutePath,
    name: path.basename(absolutePath),
    stat: statPayload(stat),
  }
}

export async function writeDrawingFile(
  request: IncomingMessage,
  allowedRoots: ReadonlyArray<string>,
): Promise<WriteFilePayload> {
  const body = await readJsonBody(request)

  if (typeof body.path !== 'string' || typeof body.text !== 'string') {
    throw new AgentFileError(
      400,
      'Expected JSON { path: string, text: string }.',
    )
  }

  const absolutePath = resolveDrawingPath(body.path, allowedRoots)
  const directory = path.dirname(absolutePath)

  let stat

  try {
    stat = await fs.stat(directory)
  } catch {
    throw new AgentFileError(404, `Directory not found: ${directory}`)
  }

  if (!stat.isDirectory()) {
    throw new AgentFileError(400, `Not a directory: ${directory}`)
  }

  if (Buffer.byteLength(body.text, 'utf8') > MAX_FILE_BYTES) {
    throw new AgentFileError(413, 'Drawing is larger than 20 MB.')
  }

  // Write to a sibling temp file first so a failed write never truncates the
  // user's drawing.
  const tempPath = path.join(
    directory,
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  )

  try {
    await fs.writeFile(tempPath, body.text, 'utf8')
    await fs.rename(tempPath, absolutePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  const written = await fs.stat(absolutePath)

  return {
    path: absolutePath,
    bytes: Buffer.byteLength(body.text, 'utf8'),
    stat: statPayload(written),
  }
}

export async function deleteDrawingFile(
  filePath: string,
  allowedRoots: ReadonlyArray<string>,
): Promise<{ path: string; removed: true }> {
  const absolutePath = resolveDrawingPath(filePath, allowedRoots)

  await fs.rm(absolutePath, { force: true })

  return { path: absolutePath, removed: true }
}
