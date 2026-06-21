import type { CodeSyncApi } from '@vibebar/codesync/api'
import type { VibeBarApi } from '@shared/api.js'
import type { TerminalBridge } from '@shared/terminalApi.js'

declare global {
  interface Window {
    vibebar: VibeBarApi
    codesync: CodeSyncApi
    codesyncWindow: { hide: () => Promise<{ ok: boolean }> }
    terminal: TerminalBridge
  }

  // React 19 removed the ambient global JSX namespace; re-expose it from the react package
  // so existing `JSX.Element` return annotations keep resolving.
  namespace JSX {
    type Element = import('react').JSX.Element
    type ElementClass = import('react').JSX.ElementClass
    type IntrinsicElements = import('react').JSX.IntrinsicElements
  }
}

export {}
