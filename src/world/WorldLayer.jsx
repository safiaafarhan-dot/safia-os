import React, { Suspense, lazy, useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useWorldDriver } from './useWorldDriver'
import './world.css'

const WorldCanvas = lazy(() => import('./WorldCanvas'))

const isWebGLAvailable = () => {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    )
  } catch {
    return false
  }
}

/**
 * The environment layer that sits behind the entire document.
 *
 * Two tiers, deliberately:
 *
 * 1. A pure-CSS atmosphere that costs no JavaScript and paints with the first
 *    frame. It is what makes the page never a flat black rectangle — including
 *    before Three.js has loaded, on machines without WebGL, and if the GL
 *    context is ever lost.
 * 2. The WebGL world, which upgrades in on top once the page is interactive.
 *
 * The WebGL half is deliberately NOT on the critical path. Three.js is an
 * ~880kB chunk; mounting it eagerly here would move that cost onto every first
 * paint and take the blocking time with it. Deferring to idle keeps the
 * measured 98 performance score intact while still giving the world time to
 * arrive before anyone has finished reading the hero.
 */
const WorldLayer = () => {
  const reducedMotion = usePrefersReducedMotion()
  const [mountWorld, setMountWorld] = useState(false)

  // The DOM-side driver runs immediately and unconditionally — the scrim,
  // parallax and HUD all read from it whether or not WebGL ever mounts.
  useWorldDriver({ reducedMotion })

  useEffect(() => {
    if (!isWebGLAvailable()) return
    // Diagnostic switch: ?noworld=1 loads the page with the CSS atmosphere only.
    if (new URLSearchParams(window.location.search).has('noworld')) return

    let cancelled = false
    const start = () => {
      if (!cancelled) setMountWorld(true)
    }

    // Diagnostic switch: ?awake=1 mounts the world immediately.
    //
    // The pairing with useWorldDriver's ?awake handling is deliberate — one
    // switch, one meaning: "an automated client is driving this page, so drop
    // the optimisations that assume a human with a visible tab." Idle
    // deferral is the other half of that. requestIdleCallback in a background
    // tab is throttled hard enough that even its 2200ms timeout can take tens
    // of seconds to land, so under automation the world simply never arrives
    // and the page screenshots as a bare CSS gradient.
    if (new URLSearchParams(window.location.search).has('awake')) {
      start()
      return () => {
        cancelled = true
      }
    }

    // requestIdleCallback yields until the browser has nothing better to do,
    // which is exactly the guarantee needed to protect first paint. The timeout
    // stops the world from never arriving on a permanently busy main thread.
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(start, { timeout: 2200 })
      return () => {
        cancelled = true
        cancelIdleCallback(id)
      }
    }
    const t = setTimeout(start, 900)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  return (
    <div className="world-layer" aria-hidden="true">
      {/* Tier 1 — always present, zero JS. */}
      <div className={`world-backdrop${reducedMotion ? ' world-backdrop--still' : ''}`}>
        <span className="world-veil world-veil--a" />
        <span className="world-veil world-veil--b" />
        <span className="world-veil world-veil--c" />
        <span className="world-veil world-veil--d" />
        <span className="world-veil world-veil--e" />
        <span className="world-grain" />
      </div>

      {/* Tier 2 — upgrades in when the browser is idle. */}
      {mountWorld && (
        <Suspense fallback={null}>
          <WorldCanvas reducedMotion={reducedMotion} />
        </Suspense>
      )}
    </div>
  )
}

export default WorldLayer
