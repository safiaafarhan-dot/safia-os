import React, { useEffect, useRef } from 'react'
import { artifactState } from '../world/artifactState'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

/**
 * THE DOM HALF OF THE ECLIPSE.
 *
 * The world canvas sits BEHIND the entire document, so an object that fills
 * the viewport in 3D still has every heading, paragraph and nav item painted
 * on top of it. Without this the cut is a cut that the interface does not
 * participate in — the object swallows the frame and the text just sits there,
 * which instantly reads as a video playing behind a webpage.
 *
 * This is one fixed element above the content that takes the same flash value
 * the 3D quad uses, so light appears to pass through the whole page rather
 * than only through the scene.
 *
 * WHY IT IS NOT REACT STATE. The value changes every frame during the event.
 * Driving it through state would re-render the tree sixty times a second for a
 * number nothing reads except one style property. It reads the same mutable
 * object the world writes and sets `opacity` directly.
 *
 * The rAF only runs while the value is non-zero — see the parking logic — so
 * this costs nothing for the 95% of the session that is not the eclipse.
 */
const EclipseFlash = () => {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const el = ref.current
    if (!el) return

    let raf = 0
    let idleFrames = 0
    let shown = false

    const tick = () => {
      const v = artifactState.flash

      if (v > 0.002) {
        idleFrames = 0
        if (!shown) {
          el.style.visibility = 'visible'
          shown = true
        }
        // Eased so the ramp is not linear with the raw progress: light blooms
        // fast and clears slowly, which is how an actual overexposure behaves.
        // Capped below 1. The page's content sits under this, and fully
        // erasing it — even briefly — is a worse trade than a flash that
        // reads as very bright rather than as total.
        el.style.opacity = String(Math.min(0.88, v * v * 1.15))
      } else if (shown) {
        el.style.opacity = '0'
        el.style.visibility = 'hidden'
        shown = false
      }

      // Park after a second of nothing happening, and let the pointer/scroll
      // listeners below wake it again.
      if (v <= 0.002) idleFrames++
      else idleFrames = 0

      if (idleFrames > 60) {
        raf = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (!raf) {
        idleFrames = 0
        raf = requestAnimationFrame(tick)
      }
    }

    wake()
    window.addEventListener('scroll', wake, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', wake)
    }
  }, [reducedMotion])

  if (reducedMotion) return null

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        pointerEvents: 'none',
        opacity: 0,
        visibility: 'hidden',
        // Cool white with a cyan core, matching the artifact's own light —
        // a neutral white flash would read as a page transition rather than
        // as this object's light.
        background:
          'radial-gradient(circle at 50% 50%, rgba(226,246,255,0.97) 0%, rgba(150,214,255,0.75) 32%, rgba(70,140,220,0.32) 58%, rgba(10,20,40,0) 82%)',
        willChange: 'opacity',
      }}
    />
  )
}

export default EclipseFlash
