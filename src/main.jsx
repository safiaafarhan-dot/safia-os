import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

/**
 * Start every visit at the top of the timeline.
 *
 * The whole site is one continuous scroll-driven camera move, so the browser
 * restoring a previous scroll position drops the visitor into the middle of a
 * shot with the world already half-flown. Worse, it leaves above-the-fold
 * scroll-reveals stuck at opacity 0 — reload anywhere below the hero and the
 * headline never appears, because its in-view trigger had already been skipped
 * past. Both are cured by owning the restore ourselves.
 *
 * Set before render so it beats the browser's own restoration.
 */
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
