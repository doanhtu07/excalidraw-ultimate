import { AgentFileError } from './errors.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FileStat } from './types.ts'

export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > MAX_FILE_BYTES) {
        request.destroy()
        reject(new AgentFileError(413, 'Request body is too large.'))
        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const text = await readBody(request)

  try {
    const parsed = JSON.parse(text) as unknown

    if (!isRecord(parsed)) throw new Error('not an object')

    return parsed
  } catch {
    throw new AgentFileError(400, 'Expected a JSON object body.')
  }
}

export function statPayload(stat: { mtimeMs: number; size: number }): FileStat {
  return { lastModified: stat.mtimeMs, size: stat.size }
}
