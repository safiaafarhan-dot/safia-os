import * as THREE from 'three'
import { STATION_SPACING } from './stations.js'

/**
 * WHERE THE BLACK HOLE IS, and when the camera pays attention to it.
 *
 * These live here rather than inside BlackHole.jsx because the CAMERA needs
 * them too. On a straight corridor a fixed point stays roughly ahead on its
 * own; on a curved path with tangent-following heading it does not - traced
 * across the journey, the old position was in frame at the hero (where it must
 * not be) and nowhere else, swinging to ndc.x of 12 by station 3.
 *
 * The answer is not to keep moving the object. It is to let the camera turn
 * and look at it, which is what a camera operator would do and what makes the
 * approach read as discovery rather than as something sliding into shot.
 */
export const BH_POSITION = new THREE.Vector3(10, 4, -7.5 * STATION_SPACING)

/** Event horizon radius, in world units. */
export const BH_HORIZON_R = 11

/**
 * How much the camera is watching it, 0..1.
 *
 * Rises from station 2.2 as the anomaly becomes recognisable, holds through
 * the climax, releases after 6.2 so the hole falls behind and the universe
 * opens onto whatever is next. Never reaches 1: the rig keeps a little of its
 * own heading throughout, so it reads as a camera glancing across rather than
 * as a turret locked on.
 */
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const bhAttention = (station) =>
  smoothstep(1.4, 3.4, station) * (1 - smoothstep(6.2, 7.0, station)) * 0.92

/**
 * How present the hole is in the world, 0..1.
 *
 * Deliberately WIDER than the attention window at the front: the anomaly is
 * faintly there before the camera turns toward it, so the visitor can notice
 * it first. That is the difference between discovering something and being
 * shown it.
 */
export const bhPresence = (station) =>
  smoothstep(1.2, 4.2, station) * (1 - smoothstep(6.0, 7.0, station))

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
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__bh = blackHoleState
}
