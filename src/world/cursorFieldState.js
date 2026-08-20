import * as THREE from 'three'

/**
 * THE CURSOR AS A PHYSICAL FORCE.
 *
 * With the black hole and the guardian gone, the environment itself is the
 * character and the cursor is what acts on it. This is the shared state that
 * makes that possible: one world-space point, a velocity, and a dwell value,
 * written once per frame and read by every system that wants to respond.
 *
 * Deliberately a plain mutable object rather than a store. It is written and
 * read every frame by several useFrame callbacks; routing that through React
 * would re-render the tree sixty times a second for values no component ever
 * displays.
 *
 * WHY DWELL MATTERS
 * A mouse-follow effect reacts to POSITION. That always reads as an overlay
 * tracking the pointer. What makes it read as a force acting on the world is
 * that it also reacts to TIME: hold still and the field charges, so objects
 * near it drift up further and further; move away and it discharges, so they
 * settle. Charge is slow and discharge is slower, because a field that snaps
 * back reads as an animation resetting rather than as energy dissipating.
 */
export const cursorField = {
  /** Cursor position in world space, on a plane facing the camera. */
  position: new THREE.Vector3(0, 0, -20),
  /** Smoothed world-space velocity — how hard the cursor is being moved. */
  velocity: new THREE.Vector3(),
  /** Speed magnitude, smoothed. Stirring the field is different from resting in it. */
  speed: 0,
  /**
   * 0..1 charge from holding still. Rises over a couple of seconds of
   * stillness, falls over about four of movement.
   */
  dwell: 0,
  /** Master gain. Zero under reduced motion, so nothing reacts to the pointer. */
  gain: 1,
  /** True once the visitor has actually moved a pointing device. */
  live: false,
}

/**
 * Local influence of the field at a world point.
 *
 * Returns 0 outside the radius and rises toward 1 at the centre, shaped so the
 * falloff is soft at the edge and steep near the middle — objects should drift
 * INTO the effect rather than crossing a visible boundary.
 *
 * `radius` is per-caller on purpose: the point of the brief is that different
 * things respond differently, so a debris field can use a wide gentle radius
 * while a cluster of small parts uses a tight aggressive one.
 */
export function influenceAt(x, y, z, radius) {
  if (!cursorField.live || cursorField.gain <= 0) return 0
  const p = cursorField.position
  const dx = x - p.x
  const dy = y - p.y
  const dz = z - p.z
  const d2 = dx * dx + dy * dy + dz * dz
  const r2 = radius * radius
  if (d2 >= r2) return 0
  // 1 - (d/r)^2, squared again for a soft shoulder.
  const t = 1 - d2 / r2
  return t * t * cursorField.gain
}

/** Charged influence: the same falloff, scaled by how long the cursor has rested. */
export function chargedInfluenceAt(x, y, z, radius) {
  return influenceAt(x, y, z, radius) * (0.35 + cursorField.dwell * 0.65)
}
