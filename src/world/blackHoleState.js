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
/**
 * Solved, not chosen: scripts/trace-flight.mjs unprojects the desired screen
 * position back into the world, so this is exactly the point that lands at
 * ndc(-0.42, 0.20) — upper left, opposite the guardian — 700 units from the
 * opening camera. Nudging a position by hand and re-checking in a browser
 * costs a round trip per attempt and never quite converges.
 */
export const BH_POSITION = new THREE.Vector3(-324, 35, -620)

/**
 * Event horizon radius. Enormous, because it is 700 units away and has to read
 * as a deep-space feature rather than a nearby object. At this size and range
 * the disk covers roughly the same share of frame as the guardian does, on the
 * opposite side — which is the balance that makes it create scale instead of
 * dominating.
 */
export const BH_HORIZON_R = 40

/**
 * How much the camera keeps it composed, 0..1.
 *
 * It never drops to zero, because the hole is now a PERMANENT feature of this
 * universe rather than an event the journey passes. Without a floor the
 * curving path swings it out of frame within half a station - the heading
 * changes by up to 30 degrees between stations, which is most of the frame
 * width.
 *
 * It also never reaches 1: the rig keeps some of its own heading throughout,
 * so it reads as a camera that knows the hole is there rather than a turret
 * locked onto it. Position and banking are untouched either way - only the
 * aim is influenced.
 */
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export const bhAttention = (station) => 0.5 + 0.42 * smoothstep(1.4, 3.6, station)

/**
 * How present the hole is in the world, 0..1.
 *
 * Starts over half strength: it is in the opening frame by design, as a deep
 * space feature the universe is built around rather than something discovered
 * later. It still intensifies through the first third, so the journey has
 * somewhere to go.
 */
export const bhPresence = (station) => 0.55 + 0.45 * smoothstep(0.5, 3.0, station)

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
