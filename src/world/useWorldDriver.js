import { useEffect } from 'react'
import { setScrollState, useScrollStore } from '../state/scrollStore'
import { useWorldStore } from '../state/worldStore'
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

      const stationTarget = stationAt(focus)
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

      setScrollState({
        progress,
        smooth,
        velocity,
        station,
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

    const onPointerMove = (e) => {
      setScrollState({
        pointerX: (e.clientX / window.innerWidth) * 2 - 1,
        pointerY: -((e.clientY / window.innerHeight) * 2 - 1),
      })
    }

    // Re-measure on anything that can reflow the page. Sections mount lazily
    // and images settle late, so a one-shot measure would leave stale anchors.
    const onResize = () => measure()
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null
    if (observer) observer.observe(document.body)

    const onVisibility = () => {
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
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion])
}
