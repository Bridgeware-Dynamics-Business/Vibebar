import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { CodeSyncApp } from './CodeSyncApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <CodeSyncApp />
    </StrictMode>
  )
}
