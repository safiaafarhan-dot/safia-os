/**
 * THE SPRING BEHIND EVERY PHYSICAL ENTRANCE.
 *
 * One damped harmonic oscillator, integrated at a fixed timestep:
 *
 *     a = -k(x - target) - c·v
 *
 * It lives in its own module for the same reason `transitTimeline.js` does: it
 * is the part that can be WRONG in a way a screenshot will not catch. A spring
 * that overshoots three times reads as rubber; one that is unstable at 30fps
 * throws a glyph off screen; one whose settle time drifts with the frame rate
 * behaves differently on every machine. Those are properties of the maths, not
 * of the pixels, and `scripts/check-springs.mjs` exercises THE SHIPPING CODE
 * headlessly rather than a copy of it that can drift.
 *
 * WHY FIXED TIMESTEP. Integrating against a raw frame delta makes the spring a
 * different spring on every frame: at 144Hz it is stiff, at 30Hz it is mushy,
 * and on a 400ms stall it can go unstable outright because explicit Euler
 * diverges once k·dt² exceeds its stability bound. Accumulating real time and
 * stepping in constant slices makes the motion identical everywhere and
 * unconditionally stable, at the cost of a couple of extra multiplies.
 *
 * WHY ZETA JUST UNDER 1. At zeta = 1 the spring is critically damped: it
 * arrives and stops, which is correct and completely characterless. A little
 * under gives exactly one small overshoot before it settles, and that single
 * overshoot is what reads as MASS — the thing had momentum and had to be
 * caught. Push it much lower and the second and third overshoots arrive, which
 * is the line between product motion and game-UI bouncing.
 */

/** Fixed simulation step, in seconds. */
export const STEP = 1 / 120

/**
 * Guard against the spiral of death. After a long stall or a backgrounded tab
 * the accumulated delta can be seconds; without this the next frame would run
 * hundreds of steps and stall the main thread further.
 */
export const MAX_FRAME = 0.25

/** Default stiffness / damping ratio for entrances. One overshoot, heavy settle. */
export const ENTRANCE_K = 150
export const ENTRANCE_ZETA = 0.72

/** Damping coefficient for a given stiffness and damping ratio. */
export const dampingFor = (k, zeta) => 2 * zeta * Math.sqrt(k)

/**
 * Advance one spring by exactly one fixed step, in place.
 *
 * @param {{x:number, v:number}} s mutable state
 * @param {number} target where it is heading
 * @param {number} k stiffness
 * @param {number} c damping coefficient (see dampingFor)
 */
export function stepSpring(s, target, k = ENTRANCE_K, c = dampingFor(ENTRANCE_K, ENTRANCE_ZETA)) {
  const a = -k * (s.x - target) - c * s.v
  s.v += a * STEP
  s.x += s.v * STEP
  return s
}

/**
 * Run an accumulator forward and step as many times as it owes.
 *
 * Returns the leftover accumulator. Callers keep this between frames, which is
 * what makes the simulation rate-independent.
 */
export function integrate(acc, dt, run) {
  let a = acc + Math.min(dt, MAX_FRAME)
  let guard = 0
  while (a >= STEP && guard++ < 512) {
    run()
    a -= STEP
  }
  return a
}
