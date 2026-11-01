import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: {
      alias: {
        ...shared,
        '@renderer': resolve('src/renderer/src')
      }
    },
    server: { port: 3000, strictPort: true },
    plugins: [react(), tailwindcss()]
  }
})
