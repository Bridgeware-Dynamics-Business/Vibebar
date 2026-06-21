import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DETACHABLE_PANEL_IDS, type DetachablePanelId } from '@shared/tools.js'
import '../shared/styles.css'
import { DetachedPanelApp } from './DetachedPanelApp'

function resolvePanelId(): DetachablePanelId {
  const requested = new URLSearchParams(window.location.search).get('panel')
  return (DETACHABLE_PANEL_IDS as readonly string[]).includes(requested ?? '')
    ? (requested as DetachablePanelId)
    : 'prompt-library'
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <DetachedPanelApp panelId={resolvePanelId()} />
    </StrictMode>
  )
}
