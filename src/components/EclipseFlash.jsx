import React, { useEffect, useRef } from 'react'
import { artifactState } from '../world/artifactState'
import { safeZone } from '../world/safeZone'
import { flashOpacity } from '../world/transitTimeline'
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
    let maskedFor = ''

    /**
     * PUNCH THE READING COLUMN OUT OF THE FLASH.
     *
     * This is the same rule the sky and the bloom already follow, applied to
     * the last light in the chain that could still land on type. The overlay
     * is masked so it falls away over the measured reading column: the frame
     * still blows out around the content, and the content itself stays
     * legible through it.
     *
     * It matters most at exactly the moment it was worst. Every section here
     * is between 1.8 and 3.0 viewports tall, so when the flash peaks the
     * arriving section already covers the whole screen — the overlay was never
     * washing out a transition, it was washing out the page.
     *
     * safeZone is in NDC with y up; CSS gradients are in percentages with y
     * down, hence the flip.
     */
    const applyMask = () => {
      const cx = ((safeZone.left + safeZone.right) * 0.5 + 1) * 50
      const cy = (1 - (safeZone.top + safeZone.bottom) * 0.5) * 50
      const rx = Math.max(12, ((safeZone.right - safeZone.left) * 0.5) * 50 * 1.15)
      const ry = Math.max(12, ((safeZone.top - safeZone.bottom) * 0.5) * 50 * 1.15)
      const key = `${cx.toFixed(0)},${cy.toFixed(0)},${rx.toFixed(0)},${ry.toFixed(0)}`
      if (key === maskedFor) return
      maskedFor = key
      // Transparent over the column, opaque outside it, with a wide feather so
      // the boundary is never a visible edge.
      const mask = `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.34) 55%, rgba(0,0,0,1) 130%)`
      el.style.maskImage = mask
      el.style.webkitMaskImage = mask
    }

    const tick = () => {
      const v = artifactState.flash

      if (v > 0.002) {
        idleFrames = 0
        if (!shown) {
          el.style.visibility = 'visible'
          shown = true
        }
        applyMask()
        // Eased so the ramp is not linear with the raw progress: light blooms
        // fast and clears slowly, which is how an actual overexposure behaves.
        //
        // The ceiling is shared with the timeline rather than written here, so
        // there is one answer to "how much of the page may this erase" and the
        // headless check asserts the real number. It was 0.88, which does not
        // read as light passing through the page — it reads as the page being
        // replaced by a white rectangle.
        el.style.opacity = String(flashOpacity(v))
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
        //
        // ELLIPSE, NOT CIRCLE, and that is the difference between a flash and
        // nothing at all on a phone. A circle is sized off the box's diagonal,
        // so on a 390x844 portrait viewport the bright core lands as a ~150px
        // disc floating in the middle of the screen with the top and bottom
        // thirds completely untouched — at full strength it barely registered.
        // The same circle on a landscape desktop covers the frame, which is why
        // this read as correct when it was only ever correct at one aspect. An
        // ellipse resolves its radii per axis, so the light fills the frame on
        // both — the same rule the 3D quad already follows by sizing itself to
        // the frustum rather than to a fixed width.
        //
        // The falloff is also flatter than it was. The old profile dropped to
        // three-quarter alpha within a third of the radius, which under the
        // 0.88 cap composites to a haze — light in the room rather than a lens
        // blowing out. Holding near-full alpha across most of the frame and
        // falling off only at the edge is what makes it read as an exposure.
        background:
          'radial-gradient(ellipse at 50% 50%, rgba(226,246,255,0.97) 0%, rgba(205,238,255,0.93) 30%, rgba(150,214,255,0.66) 58%, rgba(70,140,220,0.24) 82%, rgba(10,20,40,0) 100%)',
        willChange: 'opacity',
      }}
    />
  )
}

export default EclipseFlash
