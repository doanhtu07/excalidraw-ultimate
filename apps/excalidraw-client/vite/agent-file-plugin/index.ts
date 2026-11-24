import { agentRouter } from './router.ts'
import type { AppSettings } from './config.ts'
import type { Plugin } from 'vite'

/**
 * Dev-only bridge between the agent CLI and the drawings on disk.
 *
 * The browser sandbox cannot hand an absolute path to the app, so this
 * middleware lets the app and the agent open, save, and persist workspace
 * state by absolute path while the Vite dev server is running.
 *
 * It is only mounted by `vite dev` (`apply: 'serve'`), only accepts
 * `.excalidraw` / `.json` files, and can be confined with
 * `EXCALIDRAW_ULTIMATE_ALLOWED_ROOTS`.
 */
export const AGENT_FILE_PREFIX = '/__excalidraw/agent'

export function agentFilePlugin(settings: AppSettings): Plugin {
  return {
    name: 'excalidraw-agent-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(AGENT_FILE_PREFIX, (request, response) => {
        void agentRouter({
          request,
          response,
          allowedRoots: settings.allowedRoots,
          appRoot: server.config.root,
        })
      })
    },
  }
}
