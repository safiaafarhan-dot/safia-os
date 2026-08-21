import { useEffect } from 'react'
import { setScrollState, useScrollStore } from '../state/scrollStore'
import { useWorldStore } from '../state/worldStore'
import { cursorField } from './cursorFieldState'
import { STATION_IDS, STATIONS } from './stations'

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
const lerp = (a, b, t) => a + (b - a) * t

/**
 * The one loop that drives the entire world.
 *
 * Runs whether or not WebGL ever mounts, because the DOM layers (scrim, HUD,
 * parallax) read the same state. It writes to scrollStore, which is
 * deliberately non-reactive — this loop must never cause a React render.
 *
 * Camera position is derived from where the SECTIONS actually are, not from a
 * uniform 0..1 of document height. Sections differ in height by 3x, so uniform
 * progress would drift the camera out of sync with the content the visitor is
 * reading — the station would arrive well before or after the heading did.
 */
export function useWorldDriver({ reducedMotion = false } = {}) {
  useEffect(() => {
    /**
     * Diagnostic: ?station=4.5 pins the world to one point on the timeline.
     *
     * Every value in this world is a function of the station float, so tuning
     * a moment in the journey otherwise means landing a scroll position inside
     * a narrow band and holding it - which is unreliable, and impossible to
     * repeat exactly between two runs. Pinning makes any moment addressable.
     */
    const pinParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('station')
        : null
    const pinnedStation = pinParam === null ? null : parseFloat(pinParam)
    const hasPin = pinnedStation !== null && Number.isFinite(pinnedStation)

    /**
     * Diagnostic: ?ignition=0.35 pins the arrival sequence to one moment.
     *
     * Same family as ?station= above, and needed for the same reason. The
     * awakening is a seven-second ramp that every layer reads its own slice
     * of, so inspecting one beat of it otherwise means catching a screenshot
     * inside a window a few hundred milliseconds wide — and under automation
     * it is worse than unreliable, it is impossible: a hidden tab's rAF is
     * throttled to about 1Hz, and with dt clamped at 50ms the ramp would take
     * two and a half real minutes to fill. Every screenshot of the "finished"
     * hero would in fact be a screenshot of its first instant.
     *
     * `?ignition=1` is the one to reach for when the target is the settled
     * frame rather than a moment in the arrival.
     */
    const ignitionParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('ignition')
        : null
    const pinnedIgnition = ignitionParam === null ? null : parseFloat(ignitionParam)
    const hasIgnitionPin = pinnedIgnition !== null && Number.isFinite(pinnedIgnition)

    let raf = 0
    let anchors = []
    let lastProgress = 0
    let lastTime = performance.now()
    let running = true

    /**
     * Anchor = the scroll position at which a section is considered "arrived".
     * Measured from the section's vertical centre so tall sections don't hold
     * the camera at their station for the entire scroll through them.
     */
    const measure = () => {
      anchors = STATION_IDS.map((id) => {
        const el = document.getElementById(id)
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return rect.top + window.scrollY + rect.height / 2
      })
    }

    /** Fractional station index for the current scroll position. */
    const stationAt = (focus) => {
      const valid = anchors.map((a, i) => (a == null ? null : { a, i })).filter(Boolean)
      if (valid.length === 0) return 0
      if (focus <= valid[0].a) return valid[0].i
      const last = valid[valid.length - 1]
      if (focus >= last.a) return last.i

      for (let k = 0; k < valid.length - 1; k++) {
        const cur = valid[k]
        const next = valid[k + 1]
        if (focus >= cur.a && focus < next.a) {
          const span = next.a - cur.a
          const t = span > 0 ? (focus - cur.a) / span : 0
          return cur.i + (next.i - cur.i) * t
        }
      }
      return last.i
    }

    const tick = () => {
      if (!running) return
      const now = performance.now()
      // Clamped so a backgrounded tab doesn't resume with a huge dt and snap
      // the camera across the whole corridor in one frame.
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      const doc = document.documentElement
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight)
      const progress = clamp(window.scrollY / scrollable, 0, 1)
      const focus = window.scrollY + window.innerHeight / 2

      const prev = useScrollStore.getState()

      // Frame-rate independent smoothing: the same visual damping on 60Hz and
      // 144Hz displays. A raw lerp factor would make high-refresh monitors
      // follow the scroll noticeably tighter.
      const ease = reducedMotion ? 1 : 1 - Math.exp(-6 * dt)
      const smooth = lerp(prev.smooth, progress, ease)

      const rawVelocity = (progress - lastProgress) / Math.max(dt, 0.0001)
      lastProgress = progress
      const velocity = lerp(prev.velocity, clamp(rawVelocity, -4, 4), 1 - Math.exp(-8 * dt))

      const stationTarget = hasPin ? pinnedStation : stationAt(focus)
      const station = reducedMotion
        ? stationTarget
        : lerp(prev.station, stationTarget, 1 - Math.exp(-7 * dt))

      const pointerEase = reducedMotion ? 1 : 1 - Math.exp(-5 * dt)
      const pointerSmoothX = lerp(prev.pointerSmoothX, prev.pointerX, pointerEase)
      const pointerSmoothY = lerp(prev.pointerSmoothY, prev.pointerY, pointerEase)

      // Scroll feeds the world's energy, then it bleeds off. This is why the
      // environment stirs when you move and settles when you stop.
      const scrollFeed = Math.min(0.5, Math.abs(velocity) * 0.35)
      const energy = clamp(
        Math.max(prev.energy * Math.exp(-1.6 * dt), scrollFeed),
        0,
        1
      )

      // The ignition ramp. Fills over ~7.4s and then stays full for the rest
      // of the session — see the note in scrollStore. Reduced motion skips
      // straight to 1: an arrival sequence is exactly the kind of unrequested
      // motion that preference exists to remove.
      //
      // It was 4.2s, which was long enough to fade a finished frame up but not
      // long enough to be a SEQUENCE. The awakening now has five distinct
      // movements to get through — dark volume, source, dust, structure,
      // identity — and each one needs to be legible as its own beat before the
      // next arrives. Under about seven seconds they overlap into a single
      // fade and the whole thing reads as a slow page load.
      // HELD AT ZERO UNTIL THE BOOT OVERLAY HAS CLEARED. See the note on
      // `bootComplete` in worldStore — the two arrivals have to be one arrival,
      // and that means the world's does not start until the overlay's has
      // finished handing over to it.
      const ignition = hasIgnitionPin
        ? clamp(pinnedIgnition, 0, 1)
        : reducedMotion
          ? 1
          : useWorldStore.getState().bootComplete
            ? Math.min(1, prev.ignition + dt / 7.4)
            : 0

      setScrollState({
        progress,
        smooth,
        velocity,
        station,
        ignition,
        pointerSmoothX,
        pointerSmoothY,
        energy,
        time: prev.time + dt,
      })

      // Reactive stores are only touched when the rounded station changes,
      // keeping this loop render-free the other ~99% of frames.
      const rounded = clamp(Math.round(station), 0, STATIONS.length - 1)
      useWorldStore.getState().setActiveStation(rounded)

      raf = requestAnimationFrame(tick)
    }

    const setPointer = (clientX, clientY) => {
      setScrollState({
        pointerX: (clientX / window.innerWidth) * 2 - 1,
        pointerY: -((clientY / window.innerHeight) * 2 - 1),
      })
    }

    const onPointerMove = (e) => setPointer(e.clientX, e.clientY)

    /**
     * TOUCH IS THE ENVIRONMENTAL FORCE ON MOBILE.
     *
     * Pointer events alone do not cover this. A touch drag emits pointermove
     * only until the browser decides the gesture is a scroll, at which point it
     * fires pointercancel and stops — so on a phone the single most common
     * interaction, dragging up the page, drove the cursor field for a few
     * frames and then went dead. Since the field is what makes the world
     * respond to a visitor at all, that left mobile with a world that reacted
     * to nothing.
     *
     * Listening to touchmove separately keeps the field alive for the whole
     * gesture, including while the page is scrolling under it. Passive, so it
     * never blocks or delays that scroll.
     */
    const onTouch = (e) => {
      const t = e.touches && e.touches[0]
      if (t) setPointer(t.clientX, t.clientY)
    }

    // A finger leaving the glass has no position, unlike a mouse which is
    // always somewhere. Releasing the field rather than freezing it is what
    // makes the environment settle after a gesture instead of staying
    // permanently disturbed at the last place that was touched.
    const onTouchEnd = () => {
      cursorField.dwell = 0
    }

    // Re-measure on anything that can reflow the page. Sections mount lazily
    // and images settle late, so a one-shot measure would leave stale anchors.
    const onResize = () => measure()
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null
    if (observer) observer.observe(document.body)

    /**
     * Diagnostic: ?awake=1 keeps the loop running while the tab is hidden.
     *
     * Pausing on hidden is correct and stays the default — a backgrounded tab
     * has no business burning a core on a world nobody is looking at. But it
     * makes the world untestable under browser automation, where the driven
     * tab is ALWAYS hidden: the camera freezes at whatever station it last
     * saw, and every screenshot then shows the hero's DOM in front of some
     * completely different part of the journey. That is a very convincing
     * bug report about a world that is in fact fine.
     */
    const stayAwake =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('awake')

    const onVisibility = () => {
      if (stayAwake) return
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        lastTime = performance.now()
        measure()
        raf = requestAnimationFrame(tick)
      }
    }

    measure()
    // Sections below the fold mount on scroll; catch their real heights once
    // the first batch has settled.
    const settle = setTimeout(measure, 600)

    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion])
}
