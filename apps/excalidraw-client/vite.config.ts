import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { agentFilePlugin } from './vite/agent-file-plugin.ts'

export default defineConfig({
  plugins: [
    agentFilePlugin(),
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
    watch: {
      // Project-local workspace state changes on every edit; it must never
      // trigger an HMR reload or a dev-server restart.
      ignored: ['**/.excalidraw-ultimate/**'],
    },
  },
})
