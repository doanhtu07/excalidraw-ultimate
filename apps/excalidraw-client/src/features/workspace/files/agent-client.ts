import type { FileStat } from './scene'

/**
 * Dev-only endpoints served by the Vite agent plugin. They let the app read
 * and write any drawing by absolute path, which the browser cannot do on its
 * own.
 */
export const AGENT_FILE_ENDPOINT = '/__excalidraw/agent'

export interface OpenedAgentFile {
  file: File
  stat: FileStat
}

interface AgentErrorPayload {
  error?: string
}

interface AgentFilePayload {
  path: string
  name: string
  text: string
  stat: FileStat
}

interface AgentStatPayload {
  path: string
  name: string
  stat: FileStat
}

interface AgentWritePayload {
  path: string
  bytes: number
  stat: FileStat
}

export function agentUrl(
  pathname: string,
  params?: Record<string, string>,
): string {
  const url = new URL(
    `${AGENT_FILE_ENDPOINT}${pathname}`,
    window.location.origin,
  )

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

export async function readAgentError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const payload = (await response
    .json()
    .catch(() => null)) as AgentErrorPayload | null

  return new Error(payload?.error ?? fallback)
}

export function fileNameOfPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/** Reads a drawing from disk through the dev-only agent bridge. */
export async function readAgentDrawingFile(
  filePath: string,
): Promise<OpenedAgentFile> {
  const response = await fetch(agentUrl('/file', { path: filePath }))

  if (!response.ok) {
    throw await readAgentError(response, `Could not open ${filePath}.`)
  }

  const payload = (await response.json()) as AgentFilePayload

  return {
    file: new File([payload.text], payload.name, {
      type: 'application/json',
    }),
    stat: payload.stat,
  }
}

/** Reads any allowed `.json` / `.excalidraw` file as text. */
export async function readAgentTextFile(filePath: string): Promise<string> {
  const response = await fetch(agentUrl('/file', { path: filePath }))

  if (!response.ok) {
    throw await readAgentError(response, `Could not read ${filePath}.`)
  }

  return ((await response.json()) as AgentFilePayload).text
}

/** Writes a drawing or workspace state file back to disk. */
export async function writeAgentFile(
  filePath: string,
  text: string,
): Promise<FileStat> {
  const response = await fetch(agentUrl('/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, text }),
  })

  if (!response.ok) {
    throw await readAgentError(response, `Could not save ${filePath}.`)
  }

  return ((await response.json()) as AgentWritePayload).stat
}

export async function statAgentFile(filePath: string): Promise<FileStat> {
  const response = await fetch(agentUrl('/stat', { path: filePath }))

  if (!response.ok) {
    throw await readAgentError(response, `Could not stat ${filePath}.`)
  }

  return ((await response.json()) as AgentStatPayload).stat
}

export async function deleteAgentFile(filePath: string): Promise<void> {
  const response = await fetch(agentUrl('/file', { path: filePath }), {
    method: 'DELETE',
  })

  if (!response.ok && response.status !== 404) {
    throw await readAgentError(response, `Could not delete ${filePath}.`)
  }
}
