import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const root = dirname(fileURLToPath(import.meta.url))
const r = (p: string): string => resolve(root, p)

// Workspace packages are bundled from source via these aliases. Order matters: the more
// specific '@vibebar/codesync/api' entry must precede '@vibebar/codesync' so the preload
// can import the pure channel/types module without pulling in the Node-only sync engine.
const alias = {
  '@vibebar/codesync/api': r('../../packages/codesync/src/api.ts'),
  '@vibebar/codesync': r('../../packages/codesync/src/index.ts'),
  '@vibebar/project-detector': r('../../packages/project-detector/src/index.ts'),
  '@vibebar/prompt-engine': r('../../packages/prompt-engine/src/index.ts'),
  '@vibebar/prompt-packs': r('../../packages/prompt-packs/src/index.ts'),
  '@shared': r('src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: r('src/main/index.ts')
      }
    }
  },
  // Preload must be CJS: ESM fails in Electron sandboxed preloads when package.json has
  // "type": "module" (Cannot use import statement outside a module).
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          overlay: r('src/preload/overlay.ts'),
          codesync: r('src/preload/codesync.ts'),
          terminal: r('src/preload/terminal.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js'
        }
      }
    }
  },
  renderer: {
    root: r('src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          overlay: r('src/renderer/overlay/index.html'),
          codesync: r('src/renderer/codesync/index.html'),
          panel: r('src/renderer/panel/index.html'),
          terminal: r('src/renderer/terminal/index.html'),
          snip: r('src/renderer/snip/index.html'),
          errorconsole: r('src/renderer/errorconsole/index.html')
        }
      }
    }
  }
})
