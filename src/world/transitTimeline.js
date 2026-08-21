/**
 * THE PURE TIMELINE BEHIND THE TRANSITS.
 *
 * Everything in the approach — which boundary owns the frame, how far away the
 * object is, how much of the frame it fills, when the flash peaks — is a
 * function of one number: the fractional station. None of it needs three.js, a
 * canvas, or a GPU.
 *
 * It lives in its own module for one reason: it is the part that can be WRONG
 * in a way a screenshot will not catch. A gap between two transits, an overlap
 * where two are live at once, a flash that fires twice or never — those are
 * properties of the whole scroll, and checking them by scrubbing a browser is
 * both slow and, under automation, unreliable (a hidden tab pauses rAF outright
 * and Chrome runs out of WebGL contexts after a handful of reloads).
 *
 * Pulling it out means `scripts/check-transits.mjs` exercises THE SHIPPING CODE
 * headlessly across the entire journey, rather than a copy of it that can drift.
 */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const span = (v, a, b) => clamp01((v - a) / (b - a))
export const easeIn = (t) => t * t * t
export const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/**
 * How far before its boundary a transit begins.
 *
 * The first one has the whole opening to itself and keeps the original, longer
 * run-up. Every later one has to start AFTER its predecessor has finished
 * blowing past the lens at +0.26, or two objects share the frame and the shot
 * loses its subject. -0.70 is the first value that clears it.
 */
export const startFor = (at) => (at === 1 ? -0.84 : -0.7)

/** Boundaries are the gaps between stations: 1..7 for an eight-station journey. */
export const TRANSIT_COUNT = 7

/**
 * Resolve the whole event at a given fractional station.
 *
 * `at` is the boundary that owns this frame. The previous transit is still
 * blowing past the lens until +0.26, so the next one cannot claim the frame
 * before +0.3; handing over on the nearest integer instead would either cut a
 * fracture short or start an approach halfway down its run-up.
 */
export function timelineAt(station, { reducedMotion = false } = {}) {
  const prev = Math.floor(station)
  const at = Math.max(1, Math.min(TRANSIT_COUNT, station - prev < 0.3 ? prev : prev + 1))
  const start = startFor(at)
  // Relative to the boundary, so a transit at station 5 behaves exactly as the
  // verified one at station 1.
  const s = station - at
  const live = s > start && s < 0.3

  if (!live) {
    return { at, s, start, live: false, p: 0, dominance: 0, travel: 0, dist: 300, grow: 1, eclipseBreak: 0, flash: 0, charge: 0 }
  }

  const p = span(s, start, 0.26)
  const dominance = reducedMotion ? 0 : span(s, -0.42, -0.03)

  // Inverse-square-ish, not linear. A constant-rate approach reads as a zoom;
  // real approach is dominated by the inverse square of distance, so almost all
  // the apparent size change happens in the last fifth of the travel.
  const travel = reducedMotion ? 0.42 : span(s, start, 0)
  const FAR = 300
  const NEAR = 1.35
  const dist = FAR - (FAR - NEAR) * easeIn(travel)

  const centring = easeOut(span(s, -0.45, -0.06))
  const grow = 1 + easeIn(span(s, -0.4, 0.02)) * 5.5
  const eclipseBreak = span(s, -0.02, 0.2)
  // A PUNCH, NOT A WASH: a fast rise and a quick fall, so it reads as an
  // exposure blowing out and recovering rather than as an obstruction.
  const flash = reducedMotion ? 0 : clamp01(span(s, -0.05, 0.01)) * (1 - span(s, 0.02, 0.11))
  const charge = span(s, -0.6, 0)

  return { at, s, start, live: true, p, dominance, travel, dist, centring, grow, eclipseBreak, flash, charge }
}
