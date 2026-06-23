import { describe, expect, it } from 'vitest'
import {
  isArtifactPath,
  isAuthoredJsPath,
  isBundledOutputContent,
  isScannableFile
} from './scanScope.js'

describe('scanScope', () => {
  it('treats debug-out and build dirs as artifacts', () => {
    expect(isArtifactPath('apps/vibebar/debug-out-dev/index.js')).toBe(true)
    expect(isArtifactPath('apps/vibebar/out/main/index.js')).toBe(true)
    expect(isArtifactPath('dist/bundle.js')).toBe(true)
    expect(isArtifactPath('.vite/deps/react.js')).toBe(true)
  })

  it('allows TypeScript under src', () => {
    expect(isScannableFile('src/main/index.ts')).toBe(true)
    expect(isScannableFile('packages/foo/src/index.ts')).toBe(true)
  })

  it('rejects bundled JS outside source roots', () => {
    expect(isAuthoredJsPath('debug-out-ext/index.js')).toBe(false)
    expect(isScannableFile('debug-out-ext/index.js')).toBe(false)
  })

  it('allows authored JS under src', () => {
    expect(isAuthoredJsPath('src/main/ipc/registerIpc.js')).toBe(true)
    expect(isScannableFile('src/util/helpers.js')).toBe(true)
  })

  it('detects vite/rollup bundle content', () => {
    const bundled = `
      var __defProp = Object.defineProperty;
      const cache = /* @__PURE__ */ new Map();
      function key(content) { return createHash("sha1").update(content).digest("hex"); }
    `
    expect(isBundledOutputContent(bundled)).toBe(true)
    expect(isScannableFile('scratch/index.js', bundled)).toBe(false)
  })

  it('allows small root config scripts', () => {
    expect(isScannableFile('vite.config.js')).toBe(true)
    expect(isScannableFile('eslint.config.js')).toBe(true)
  })
})
