import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { SnipApp } from './SnipApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SnipApp />
    </StrictMode>
  )
}
