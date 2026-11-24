import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { agentFilePlugin } from './vite/agent-file-plugin/index.ts'
import {
  portFromAppUrl,
  readAppSettings,
} from './vite/agent-file-plugin/config.ts'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const settings = readAppSettings(appRoot)

export default defineConfig({
  // The app reads the checkout's `.env` itself, so Vite must not load another.
  envDir: false,
  plugins: [
    agentFilePlugin(settings),
    nitro(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: portFromAppUrl(settings.appUrl),
    strictPort: true,
    watch: {
      // Project-local workspace state changes on every edit; it must never
      // trigger an HMR reload or a dev-server restart.
      ignored: ['**/.excalidraw-ultimate/**'],
    },
  },
})
