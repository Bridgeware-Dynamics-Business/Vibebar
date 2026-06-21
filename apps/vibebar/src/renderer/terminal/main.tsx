import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import '../shared/styles.css'
import { TerminalApp } from './TerminalApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <TerminalApp />
    </StrictMode>
  )
}
