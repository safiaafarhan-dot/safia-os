/**
 * Where the black hole currently is on screen, and how hard it is bending
 * light.
 *
 * The gravitational lensing is a SCREEN-SPACE effect: it has to warp whatever
 * has already been rendered behind the hole, which means it belongs in the
 * composite pass, not on the object itself. But only the object knows where it
 * is. This is the handoff between the two.
 *
 * Deliberately a plain mutable object rather than a store: it is written and
 * read every frame by two different useFrame callbacks, and routing that
 * through React would re-render the tree sixty times a second for a value no
 * component ever displays.
 */
export const blackHoleState = {
  /** Screen position in UV space, 0..1, origin bottom-left. */
  x: 0.5,
  y: 0.5,
  /** Apparent radius of the event horizon, in UV units of screen height. */
  radius: 0,
  /** 0 when off screen or far away, up to 1 at closest approach. */
  strength: 0,
  /**
   * How close the approach is, regardless of whether the hole is on screen.
   *
   * Separate from `strength` on purpose. `strength` drives the lensing warp
   * and therefore has to be gated on the hole actually being in frame;
   * `presence` drives ENVIRONMENT choreography - the corridor thinning out as
   * you fall toward it - which must keep happening even when the hole has
   * swung off the edge of the shot.
   */
  presence: 0,
}

// Dev-only handle so the approach curve can be measured from the console
// rather than judged by eye. Stripped from production by the DEV guard.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__bh = blackHoleState
}
