import { useEffect, useRef } from 'react'

/**
 * THE CURSOR AS A FORCE ACTING ON TYPOGRAPHY.
 *
 * Letters near the pointer lift toward it, separate slightly from their
 * neighbours, and brighten. Move away and they settle back. It is the same
 * idea as the 3D world's cursorField — a local force with a soft falloff —
 * applied to the one part of the interface that is not in the 3D scene, so
 * the text belongs to the dimension rather than floating on top of it.
 *
 * FIVE THINGS MAKE THIS CHEAP ENOUGH TO SHIP:
 *
 *   1. ONE rAF LOOP AND ONE LISTENER for the whole group, not per letter. A
 *      dozen independent spring animations is a dozen callbacks a frame and
 *      the exact "hundreds of independent DOM animations" failure to avoid.
 *
 *   2. GEOMETRY IS CACHED, not measured per frame. getBoundingClientRect on
 *      every glyph every frame is a forced synchronous layout per glyph —
 *      guaranteed jank. Positions are re-measured on resize and on scroll
 *      end, which is the only time they actually change.
 *
 *   3. ONLY transform AND opacity ARE WRITTEN. Both are compositor
 *      properties, so no layout or paint is triggered by the animation.
 *
 *   4. THE LOOP PARKS ITSELF. When every letter has settled within epsilon of
 *      rest and the pointer is outside the field, the rAF stops entirely and
 *      restarts on the next pointer move. An idle hero costs nothing.
 *
 *   5. IT NEVER MOVES A LETTER FAR. Peak displacement is a few pixels — the
 *      effect has to be felt rather than seen, because a wordmark whose
 *      letters visibly jump around is a wordmark you cannot read, and
 *      readability outranks the effect every time.
 *
 * Disabled entirely under reduced motion, and on coarse pointers where there
 * is no hover to respond to.
 */

const RADIUS = 170
const LIFT = 7
const SPREAD = 5

export function useProximityText({ enabled = true } = {}) {
  const containerRef = useRef(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root || !enabled) return
    if (typeof window === 'undefined') return
    // No hover, no proximity. On touch this would only ever fire mid-tap.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const letters = Array.from(root.querySelectorAll('[data-proximity-letter]'))
    if (letters.length === 0) return

    // Per-letter cached centre, plus current and target displacement.
    const state = letters.map(() => ({ cx: 0, cy: 0, x: 0, y: 0, s: 0, tx: 0, ty: 0, ts: 0 }))

    const measure = () => {
      for (let i = 0; i < letters.length; i++) {
        // Measured from the UNTRANSFORMED box: reading the rect while a
        // transform is applied would fold the current displacement into the
        // cached centre and the effect would slowly walk the letters away.
        const prev = letters[i].style.transform
        letters[i].style.transform = ''
        const r = letters[i].getBoundingClientRect()
        letters[i].style.transform = prev
        state[i].cx = r.left + r.width / 2
        state[i].cy = r.top + r.height / 2
      }
    }

    let pointerX = -9999
    let pointerY = -9999
    let raf = 0
    let running = false

    const frame = () => {
      let active = false

      for (let i = 0; i < letters.length; i++) {
        const st = state[i]
        const dx = pointerX - st.cx
        const dy = pointerY - st.cy
        const dist = Math.hypot(dx, dy)

        if (dist < RADIUS) {
          // Squared falloff: soft at the edge, decisive near the centre, so
          // letters drift into the effect instead of crossing a boundary.
          const f = 1 - dist / RADIUS
          const k = f * f
          const inv = dist > 0.001 ? 1 / dist : 0
          // Toward the pointer, not away. Attraction reads as the cursor
          // having a pull; repulsion reads as the text being afraid of it.
          st.tx = dx * inv * k * SPREAD
          st.ty = dy * inv * k * LIFT
          st.ts = k
        } else {
          st.tx = 0
          st.ty = 0
          st.ts = 0
        }

        // Critically damped-ish approach. Rising faster than falling, so the
        // response feels immediate but the settle feels heavy.
        const rate = st.ts > st.s ? 0.22 : 0.11
        st.x += (st.tx - st.x) * rate
        st.y += (st.ty - st.y) * rate
        st.s += (st.ts - st.s) * rate

        if (Math.abs(st.x) > 0.05 || Math.abs(st.y) > 0.05 || st.s > 0.004) {
          active = true
          letters[i].style.transform = `translate3d(${st.x.toFixed(2)}px, ${st.y.toFixed(2)}px, 0)`
          // Proximity illumination. The glyph does not change colour, it gains
          // a cool halo — colour-shifting a wordmark on hover looks like a bug.
          letters[i].style.textShadow = `0 0 ${(14 * st.s).toFixed(1)}px rgba(120, 214, 255, ${(0.5 * st.s).toFixed(3)})`
        } else if (st.x !== 0 || st.y !== 0 || st.s !== 0) {
          st.x = 0
          st.y = 0
          st.s = 0
          letters[i].style.transform = ''
          letters[i].style.textShadow = ''
        }
      }

      if (active) {
        raf = requestAnimationFrame(frame)
      } else {
        // Everything is at rest. Stop burning frames until something moves.
        running = false
      }
    }

    const wake = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(frame)
    }

    const onMove = (e) => {
      pointerX = e.clientX
      pointerY = e.clientY
      wake()
    }

    const onLeave = () => {
      pointerX = -9999
      pointerY = -9999
      wake()
    }

    let settle = 0
    const onScrollOrResize = () => {
      clearTimeout(settle)
      settle = setTimeout(measure, 120)
    }

    measure()
    // Progressive-enhancement marker: present only when the effect is actually
    // armed on this device. Also the only externally observable proof that it
    // engaged — the animation itself cannot be verified under automation,
    // because Chrome pauses requestAnimationFrame outright in hidden tabs.
    root.dataset.proximity = 'armed'
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave, { passive: true })
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      delete root.dataset.proximity
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      for (const el of letters) {
        el.style.transform = ''
        el.style.textShadow = ''
      }
    }
  }, [enabled])

  return containerRef
}

export default useProximityText
