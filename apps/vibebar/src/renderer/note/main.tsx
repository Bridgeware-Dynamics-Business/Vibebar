import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/styles.css'
import { NoteWindowApp } from './NoteWindowApp'

function resolveNoteId(): string {
  return new URLSearchParams(window.location.search).get('note') ?? ''
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <NoteWindowApp noteId={resolveNoteId()} />
    </StrictMode>
  )
}
