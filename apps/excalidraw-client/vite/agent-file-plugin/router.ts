import { AgentFileError } from './errors.ts'
import {
  deleteDrawingFile,
  readDrawingFile,
  statDrawingFile,
  writeDrawingFile,
} from './files.ts'
import { readJsonBody, sendJson } from './http.ts'
import {
  initializeWorkspace,
  readWorkspaceRegistry,
  registerWorkspace,
  removeWorkspace,
} from './workspaces.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Exposed under `AGENT_FILE_PREFIX`:
 *
 * - `GET /health` — liveness probe (`{ ok, service, root }`).
 * - `GET /file?path=<absolute path>` — read a drawing (`{ path, name, text, stat }`).
 * - `GET /stat?path=<absolute path>` — metadata only (`{ path, name, stat }`).
 * - `POST /file` with `{ path, text }` — write a drawing (`{ path, bytes, stat }`).
 * - `DELETE /file?path=<absolute path>` — delete a drawing or state file.
 * - `GET /workspaces` — registered workspaces.
 * - `POST /workspaces` with `{ root, name? }` — upsert a workspace.
 * - `DELETE /workspaces?root=<absolute path>` — forget a workspace.
 * - `POST /workspace/init` with `{ root }` — create `.excalidraw-ultimate/`.
 */
export async function agentRouter(input: {
  request: IncomingMessage
  response: ServerResponse
  allowedRoots: ReadonlyArray<string>
  appRoot: string
}): Promise<void> {
  const { request, response, allowedRoots, appRoot } = input

  const url = new URL(request.url ?? '/', 'http://localhost')
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  try {
    // GET {prefix}/health — dev-server liveness probe.
    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, {
        ok: true,
        service: 'excalidraw-ultimate-agent',
        root: process.cwd(),
      })
      return
    }

    // GET {prefix}/file?path=<absolute path> — read a drawing.
    if (pathname === '/file' && request.method === 'GET') {
      const filePath = url.searchParams.get('path')

      if (!filePath) throw new AgentFileError(400, 'Missing ?path=.')

      sendJson(response, 200, await readDrawingFile(filePath, allowedRoots))
      return
    }

    // GET {prefix}/stat?path=<absolute path> — metadata only.
    if (pathname === '/stat' && request.method === 'GET') {
      const filePath = url.searchParams.get('path')

      if (!filePath) throw new AgentFileError(400, 'Missing ?path=.')

      sendJson(response, 200, await statDrawingFile(filePath, allowedRoots))
      return
    }

    // POST {prefix}/file — write a drawing from a `{ path, text }` body.
    if (pathname === '/file' && request.method === 'POST') {
      sendJson(response, 200, await writeDrawingFile(request, allowedRoots))
      return
    }

    // DELETE {prefix}/file?path=<absolute path> — remove a state/recovery file.
    if (pathname === '/file' && request.method === 'DELETE') {
      const filePath = url.searchParams.get('path')

      if (!filePath) throw new AgentFileError(400, 'Missing ?path=.')

      sendJson(response, 200, await deleteDrawingFile(filePath, allowedRoots))
      return
    }

    // GET {prefix}/workspaces — registered project workspaces.
    if (pathname === '/workspaces' && request.method === 'GET') {
      sendJson(response, 200, {
        workspaces: await readWorkspaceRegistry(appRoot),
      })
      return
    }

    // POST {prefix}/workspaces — upsert a workspace by root.
    if (pathname === '/workspaces' && request.method === 'POST') {
      const body = await readJsonBody(request)
      const root = body.root
      const name = body.name

      if (typeof root !== 'string') {
        throw new AgentFileError(400, 'Expected JSON { root: string }.')
      }

      const workspace = await registerWorkspace({
        rootInput: root,
        name: typeof name === 'string' ? name : undefined,
        allowedRoots,
        appRoot,
      })

      sendJson(response, 200, { workspace })
      return
    }

    // DELETE {prefix}/workspaces — forget a workspace without deleting files.
    if (pathname === '/workspaces' && request.method === 'DELETE') {
      const root = url.searchParams.get('root')

      if (!root) throw new AgentFileError(400, 'Missing ?root=.')

      sendJson(response, 200, {
        root: await removeWorkspace({ rootInput: root, allowedRoots, appRoot }),
      })
      return
    }

    // POST {prefix}/workspace/init — create the project-local state directory.
    if (pathname === '/workspace/init' && request.method === 'POST') {
      const body = await readJsonBody(request)
      const root = body.root
      const name = body.name

      if (typeof root !== 'string') {
        throw new AgentFileError(400, 'Expected JSON { root: string }.')
      }

      sendJson(
        response,
        200,
        await initializeWorkspace({
          rootInput: root,
          name: typeof name === 'string' ? name : undefined,
          allowedRoots,
          appRoot,
        }),
      )
      return
    }

    throw new AgentFileError(404, `Unknown agent route: ${pathname}`)
  } catch (error) {
    if (error instanceof AgentFileError) {
      sendJson(response, error.status, { error: error.message })
      return
    }

    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
