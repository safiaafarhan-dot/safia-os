/**
 * Registry of world objects the visitor can actually touch.
 *
 * Objects register themselves rather than being raycast by traversing the whole
 * scene: the atmosphere holds hundreds of instanced structures that must never
 * be hit-tested, and walking the graph every frame to skip them is wasted work.
 * The registry keeps the raycast set to the handful of things that respond.
 */

const registry = new Map()

/**
 * @param {string} id
 * @param {{ object: object, label?: string, draggable?: boolean, onActivate?: () => void }} entry
 * @returns {() => void} unregister
 */
export function registerInteractive(id, entry) {
  registry.set(id, { id, ...entry })
  return () => registry.delete(id)
}

export function interactiveEntries() {
  return registry
}

/**
 * Angular velocity injected by dragging, consumed and damped by each object's
 * own frame loop. Kept outside React so a drag never triggers a render.
 */
export const dragState = {
  /** id currently being dragged, or null. */
  activeId: null,
  /** Pixel delta accumulated since the last frame consumed it. */
  dx: 0,
  dy: 0,
}

/** Per-object spin velocity, keyed by id. */
export const spinState = new Map()

export function addSpin(id, vx, vy) {
  const s = spinState.get(id) || { vx: 0, vy: 0 }
  s.vx += vx
  s.vy += vy
  spinState.set(id, s)
}

/**
 * Integrate and damp an object's drag-induced spin.
 * Returns the rotation delta to apply this frame.
 */
export function consumeSpin(id, delta) {
  const s = spinState.get(id)
  if (!s) return null
  const out = { x: s.vx * delta, y: s.vy * delta }
  // Heavy damping: a flick should coast for about a second, not spin forever.
  const damp = Math.exp(-2.4 * delta)
  s.vx *= damp
  s.vy *= damp
  if (Math.abs(s.vx) < 0.001 && Math.abs(s.vy) < 0.001) spinState.delete(id)
  return out
}
