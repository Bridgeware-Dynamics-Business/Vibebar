import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { installErrorConsole } from '../shared/errorCapture'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { App } from './App'

document.documentElement.classList.add('vibe-overlay-root')
document.body.classList.add('vibe-overlay-root')

// Capture uncaught errors / promise rejections in this renderer and surface them in the always-on
// -top in-app error console. Installed exactly once at startup; guarded internally against HMR.
installErrorConsole()

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      {typeof window.vibebar === 'undefined' ? (
        <div
          className="vibe-no-drag flex h-full w-full items-center justify-center bg-[#0d0f14] p-4 text-center text-sm text-red-300"
          style={{ minHeight: '100vh' }}
        >
          VibeBar preload failed. Quit all Electron instances from the tray, then run{' '}
          <code className="mx-1 text-white">npm run dev</code> again.
        </div>
      ) : (
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      )}
    </StrictMode>
  )
}
