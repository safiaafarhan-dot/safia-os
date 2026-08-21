import React, { useEffect, useMemo, useRef } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { ENTRANCE_K, ENTRANCE_ZETA, MAX_FRAME, STEP, dampingFor, stepSpring } from '../../lib/spring'

/**
 * TYPOGRAPHY THAT ARRIVES AS MATTER, NOT AS AN OPACITY CHANGE.
 *
 * A heading built with this starts as loose fragments scattered through the
 * space in front of the page — displaced, rotated, out of focus. As the section
 * comes into view each fragment finds its seat on a spring, overshoots very
 * slightly, and settles. Leave the section and the word comes apart again and
 * the fragments drift back out into the environment.
 *
 * WHY THIS RATHER THAN A FADE. The rest of this site is a physical place: the
 * camera has inertia, the particulate has velocity, objects have mass. Text
 * that fades in is the one thing on the page with no physics, and that single
 * inconsistency is enough to make the 3D read as a backdrop with a webpage in
 * front of it. Giving the words the same rules as everything else is what makes
 * them belong to the world.
 *
 * IT IS DELIBERATELY NOT AVAILABLE TO EVERY PIECE OF TEXT. This is reserved for
 * section mastheads and a handful of signature moments. Applied to body copy it
 * would be unreadable, expensive, and — worse — meaningless, because an effect
 * used everywhere stops signifying anything.
 *
 * ---------------------------------------------------------------- the physics
 *
 * Each fragment is a real damped spring, integrated at a FIXED timestep:
 *
 *     a = -k(x - target) - c·v
 *
 * Fixed timestep because a spring integrated against a variable frame delta is
 * a different spring on every machine, and on a long frame it can go unstable
 * and throw the glyph off screen. The loop accumulates real time and steps the
 * simulation in constant 1/120s slices, so a 60Hz display, a 144Hz display and
 * a stuttering one all resolve the same motion.
 *
 * `zeta` is a little under 1 — around 0.72 — which gives a single small
 * overshoot and a heavy settle. That is the difference between product motion
 * and game-UI bouncing: one overshoot reads as mass, three reads as rubber.
 *
 * ------------------------------------------------------------------- the cost
 *
 * The same five rules as useProximityText, because this is the same class of
 * effect and the same trap:
 *
 *   1. ONE rAF loop and ONE pointer listener for the whole heading.
 *   2. Geometry is cached, re-measured only on resize and scroll-end.
 *   3. Only `transform`, `opacity` and `filter` are written — compositor
 *      properties, so no layout and no paint.
 *   4. THE LOOP IS GATED ON VISIBILITY. Fragments keep a slow idle drift once
 *      settled, so unlike a pure spring this never reaches absolute rest and
 *      cannot park on stillness alone. It parks on being off screen instead,
 *      which in practice means at most one or two headings are ever animating.
 *   5. Peak displacement is bounded and the settle is quick, because a heading
 *      you cannot read is a heading that has failed regardless of how good the
 *      motion is.
 *
 * Under reduced motion it renders as plain text with no wrappers at all.
 * Fragments are `aria-hidden` and the full string is the container's accessible
 * name, so assistive tech gets one heading rather than forty letters.
 */

/**
 * Diagnostic: ?revealed=1 renders every heading already assembled.
 *
 * Same switch, and the same reason, as Reveal.jsx. Assembly is driven by an
 * IntersectionObserver, which never fires in a hidden tab — and the tab is
 * always hidden under browser automation. Without this every section would
 * screenshot with no heading at all, which reads as catastrophic breakage in
 * whatever was actually being tested. DEV-only.
 */
const forceRevealed =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('revealed')

/** Cursor field over the fragments. Level 2 in the interaction hierarchy: felt, not seen. */
const CURSOR_RADIUS = 150
const CURSOR_PULL = 4.5

const rand = (seed) => {
  // Deterministic per-index scatter. Math.random would re-roll on every render
  // and, worse, give a different word shape on each remount of the same
  // heading — the scatter should be a property of the glyph, not of the frame.
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const Assemble = ({
  children,
  className = '',
  as: Tag = 'span',
  /** How far fragments start from their seat, in px. */
  scatter = 46,
  /** Extra delay per fragment, in seconds — the word assembles left to right. */
  stagger = 0.028,
  /** Whether the word comes apart again when it leaves the viewport. */
  reversible = true,
  ...rest
}) => {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()
  const text = typeof children === 'string' ? children : String(children ?? '')
  const words = useMemo(() => text.split(' '), [text])

  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion || forceRevealed || typeof window === 'undefined') return

    const frags = Array.from(root.querySelectorAll('[data-frag]'))
    if (frags.length === 0) return

    // SCATTER FROM JS, DO NOT RENDER SCATTERED.
    //
    // The markup ships the heading fully legible and the effect takes it apart
    // on mount. Rendering the scattered state instead would mean a heading that
    // is invisible until JavaScript runs — so a failed chunk, a hydration
    // error, or simply a slow connection leaves the section with no title, and
    // the page fails closed on its most important text. This way the worst case
    // is that the animation never happens.

    const hoverable = window.matchMedia('(hover: hover) and (pointer: fine)').matches

    // Per-fragment simulation state. `ox/oy` is the scattered origin, `x/y` the
    // current displacement from the seat, `v*` the velocity.
    const st = frags.map((el, i) => {
      const a = rand(i + 1) * Math.PI * 2
      const r = 0.45 + rand(i + 7) * 0.55
      return {
        ox: Math.cos(a) * scatter * r,
        // Biased downward-ish so the word looks like it is being lifted into
        // place rather than converging from a uniform ring, which reads as a
        // logo animation.
        oy: (Math.sin(a) * 0.55 + 0.75) * scatter * r,
        orot: (rand(i + 13) - 0.5) * 46,
        phase: rand(i + 23) * Math.PI * 2,
        drift: 0.55 + rand(i + 31) * 0.7,
        delay: i * stagger,
        x: 0, y: 0, rot: 0, vx: 0, vy: 0, vrot: 0,
        // 0 = scattered, 1 = seated. Springs toward the target below.
        seat: 0, vseat: 0,
        cx: 0, cy: 0,
        px: 0, py: 0, // cursor displacement, eased separately
      }
    })

    let target = 0 // 0 scattered, 1 assembled
    let elapsed = 0
    let pointerX = -9999
    let pointerY = -9999
    let raf = 0
    let running = false
    let visible = false
    let acc = 0
    let last = 0

    const measure = () => {
      for (let i = 0; i < frags.length; i++) {
        const prev = frags[i].style.transform
        frags[i].style.transform = ''
        const r = frags[i].getBoundingClientRect()
        frags[i].style.transform = prev
        st[i].cx = r.left + r.width / 2
        st[i].cy = r.top + r.height / 2
      }
    }

    // Shared with scripts/check-springs.mjs, which verifies overshoot, settle
    // time and frame-rate independence against this exact code.
    const C = dampingFor(ENTRANCE_K, ENTRANCE_ZETA)
    const springState = st.map((s) => ({ x: s.seat, v: s.vseat }))

    const step = () => {
      elapsed += STEP
      for (let i = 0; i < frags.length; i++) {
        const s = st[i]
        // The stagger is expressed as a delay on the TARGET, not as a delayed
        // start, so a fragment that is already moving when the direction flips
        // reverses smoothly instead of freezing until its turn comes round.
        const gate = target > 0.5 ? (elapsed > s.delay ? 1 : 0) : 0
        const sp = springState[i]
        stepSpring(sp, gate, ENTRANCE_K, C)
        s.seat = sp.x
        s.vseat = sp.v
      }
    }

    const paint = (time) => {
      const stillSeated = target > 0.5
      for (let i = 0; i < frags.length; i++) {
        const s = st[i]
        // 1 at the scattered origin, 0 in the seat.
        const away = 1 - s.seat
        // IDLE DRIFT. Never reaches absolute rest — the word keeps breathing
        // once it has landed, so a section left alone is still alive. Small:
        // a heading whose letters visibly wander is a heading you re-read.
        const idle = stillSeated ? s.seat : 0
        const bob = Math.sin(time * 0.55 * s.drift + s.phase) * 1.6 * idle
        const sway = Math.cos(time * 0.37 * s.drift + s.phase * 1.7) * 1.1 * idle

        // CURSOR, level 2: very subtle on typography by design. Eased on its
        // own rate rather than through the spring, so the pointer feels
        // immediate while the assembly still feels heavy.
        let tpx = 0
        let tpy = 0
        if (hoverable && stillSeated) {
          const dx = pointerX - s.cx
          const dy = pointerY - s.cy
          const d = Math.hypot(dx, dy)
          if (d < CURSOR_RADIUS && d > 0.001) {
            const f = 1 - d / CURSOR_RADIUS
            const k = f * f * s.seat
            tpx = (dx / d) * k * CURSOR_PULL
            tpy = (dy / d) * k * CURSOR_PULL
          }
        }
        s.px += (tpx - s.px) * 0.16
        s.py += (tpy - s.py) * 0.16

        const x = s.ox * away + bob * 0.3 + sway + s.px
        const y = s.oy * away + bob + s.py
        const rot = s.orot * away
        const el = frags[i]
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg)`
        el.style.opacity = (0.06 + 0.94 * s.seat).toFixed(3)
        // Focus pull. Out-of-focus fragments read as being at a different
        // DEPTH, which is what makes them look like they are travelling
        // through the space rather than sliding across the page. Dropped
        // entirely once seated so the type is never soft while being read.
        el.style.filter = away > 0.012 ? `blur(${(away * 5).toFixed(2)}px)` : ''
      }
    }

    const frame = (now) => {
      if (!last) last = now
      let dt = (now - last) / 1000
      last = now
      if (dt > MAX_FRAME) dt = MAX_FRAME
      acc += dt

      while (acc >= STEP) {
        step()
        acc -= STEP
      }
      paint(now / 1000)

      if (visible) {
        raf = requestAnimationFrame(frame)
      } else {
        // Fully scattered and off screen: stop entirely.
        running = false
      }
    }

    const wake = () => {
      if (running) return
      running = true
      last = 0
      acc = 0
      raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visible = e.isIntersecting
          if (e.isIntersecting) {
            target = 1
            elapsed = 0
            measure()
            wake()
          } else if (reversible) {
            // Coming apart again. The fragments keep their springs, so a
            // section scrolled past mid-assembly reverses from wherever it
            // had got to rather than snapping.
            target = 0
            wake()
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    )
    io.observe(root)

    const onMove = (e) => {
      pointerX = e.clientX
      pointerY = e.clientY
    }
    let settle = 0
    const onScrollOrResize = () => {
      clearTimeout(settle)
      settle = setTimeout(measure, 120)
    }

    measure()
    // Progressive-enhancement marker, and the only externally observable proof
    // the effect armed — the motion itself cannot be verified under automation,
    // because Chrome pauses rAF outright in a hidden tab.
    root.dataset.assemble = 'armed'
    if (hoverable) window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)

    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      delete root.dataset.assemble
      if (hoverable) window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
      for (const el of frags) {
        el.style.transform = ''
        el.style.opacity = ''
        el.style.filter = ''
      }
    }
  }, [reducedMotion, text, scatter, stagger, reversible])

  if (reducedMotion || forceRevealed) {
    return (
      <Tag className={className} {...rest}>
        {text}
      </Tag>
    )
  }

  return (
    <Tag ref={ref} className={className} aria-label={text} {...rest}>
      {words.map((word, w) => (
        <span key={`w${w}`} aria-hidden="true" className="inline-block whitespace-pre">
          {Array.from(word).map((ch, c) => (
            <span
              key={`c${w}-${c}`}
              data-frag
              className="inline-block"
              style={{ willChange: 'transform, opacity, filter' }}
            >
              {ch}
            </span>
          ))}
          {w < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}

export default Assemble
