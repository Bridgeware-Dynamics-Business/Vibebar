import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { PromptLibraryWindowApp } from './PromptLibraryWindowApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PromptLibraryWindowApp />
    </StrictMode>
  )
}
