import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { installErrorConsole } from '../shared/errorCapture'
import { App } from './App'

// Capture uncaught errors / promise rejections in this renderer and surface them in the always-on
// -top in-app error console. Installed exactly once at startup; guarded internally against HMR.
installErrorConsole()

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
