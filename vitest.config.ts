import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const r = (p: string): string => resolve(__dirname, p)

export default defineConfig({
  resolve: {
    alias: {
      '@vibebar/codesync/api': r('packages/codesync/src/api.ts'),
      '@vibebar/codesync': r('packages/codesync/src/index.ts'),
      '@vibebar/project-detector': r('packages/project-detector/src/index.ts'),
      '@vibebar/prompt-engine': r('packages/prompt-engine/src/index.ts'),
      '@vibebar/prompt-packs': r('packages/prompt-packs/src/index.ts'),
      '@shared': r('apps/vibebar/src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/release/**']
  }
})
