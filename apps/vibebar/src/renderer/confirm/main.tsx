import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { ConfirmQuitApp } from './ConfirmQuitApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ConfirmQuitApp />
    </StrictMode>
  )
}
