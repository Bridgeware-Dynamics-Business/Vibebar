import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  // Preload must be CJS: ESM (.mjs + import) fails in Electron with
  // "Cannot use import statement outside a module" when package.json has "type": "module".
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
          chunkFileNames: '[name]-[hash].js'
        }
      }
    }
  },
  renderer: {}
})
