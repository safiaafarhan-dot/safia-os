import * as THREE from 'three'

/**
 * THE READING COLUMN, AND KEEPING THE WORLD OUT OF IT.
 *
 * The canvas sits behind the entire document, so no 3D object can literally
 * cover text — the DOM always paints on top. What actually goes wrong is
 * legibility and composition: a metal slab or a rock field parked directly
 * behind a paragraph turns it into noise, and an object drifting behind the
 * nav bar reads as a collision even though nothing intersects.
 *
 * So the fix is not z-index and it is not per-object nudging. It is a keep-out
 * volume expressed in CAMERA SPACE, derived from where the interface actually
 * is on screen:
 *
 *   1. Measure the real layout. Every section marks its content container with
 *      `data-safe`, and the union of the visible ones becomes a rectangle in
 *      normalised device coordinates. Because it is measured rather than
 *      assumed, it tracks the responsive layout for free — a 1024px column on
 *      a wide desktop and a near-full-width column on a phone.
 *
 *   2. Push, don't hide. An object that projects inside the column is moved
 *      sideways along the camera's own right vector until it clears, with the
 *      correction eased in by how deep inside it is. The object keeps its
 *      distance, its scale and its parallax — it just travels past the frame
 *      beside the text rather than behind it. Removing objects instead would
 *      empty the world, which is the one solution explicitly ruled out.
 *
 *   3. Only near things are pushed. Galaxies and nebulae hundreds of units out
 *      are atmosphere; shoving those around would break the sky. They stay put
 *      and simply dim behind the column instead.
 *
 * All of this runs off two cached matrices per frame, so the per-instance cost
 * is a handful of multiplies — cheap enough for the instanced fields with a
 * few hundred members each.
 */

/** Live description of the protected region, in NDC. */
export const safeZone = {
  /**
   * Horizontal bounds of the reading column in NDC, -1..1.
   *
   * These are LEFT and RIGHT rather than a half-width because the column is
   * not always centred. The hero's text block is left-aligned and occupies
   * roughly -0.56..0.0, so a symmetric +/-0.17 zone protected the middle of the
   * screen while leaving shards free to drift across the name.
   */
  left: -0.42,
  right: 0.42,
  /** Widest half-extent, kept for layers that only need a rough measure. */
  halfWidth: 0.42,
  /** Vertical extent of the column. */
  top: 0.9,
  bottom: -0.9,
  /**
   * NDC y above which the navigation bar sits. Kept separate from the column
   * because it spans the FULL width, not just the reading measure.
   */
  navFloor: 0.82,
  /** Beyond this many world units an object counts as atmosphere and is left alone. */
  near: 150,
  /** Narrow viewports get a wider column and lose the near fields entirely. */
  mobile: false,
}

/* ------------------------------------------------------------- measuring -- */

let lastMeasured = 0

/**
 * Re-measure the reading column from the DOM.
 *
 * Throttled hard: this reads layout, and doing that every frame would trash
 * the main thread for a rectangle that only changes on resize or when a new
 * section scrolls in. 200ms is far below the rate at which the answer moves.
 */
export function measureSafeZone(force = false) {
  if (typeof document === 'undefined') return
  const now = performance.now()
  if (!force && now - lastMeasured < 200) return
  lastMeasured = now

  const vw = window.innerWidth
  const vh = window.innerHeight
  safeZone.mobile = vw < 768

  const nodes = document.querySelectorAll('[data-safe]')
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  let found = false

  // Only containers crossing the CENTRAL band of the viewport contribute.
  //
  // "Anything touching the viewport at all" was too generous: sections are
  // several screens tall, so at the top of the page the hero, About and Skills
  // all technically intersect, and their union is a column far wider than
  // anything actually being read. Requiring an overlap with the middle of the
  // screen keeps the zone tied to what the visitor is looking at, and it makes
  // the handover between sections happen where the eye already is.
  const bandTop = vh * 0.12
  const bandBottom = vh * 0.88

  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (r.bottom < bandTop || r.top > bandBottom) continue
    found = true
    if (r.left < left) left = r.left
    if (r.right > right) right = r.right
    if (r.top < top) top = r.top
    if (r.bottom > bottom) bottom = r.bottom
  }

  if (!found) {
    // Nothing measurable in frame (between sections, or pre-hydration). Fall
    // back to the design measure rather than to "no protection at all", so the
    // world never briefly swings back over the text during a transition.
    const column = Math.min(1024, vw - 48)
    const half = Math.min(0.92, column / vw)
    safeZone.left = -half
    safeZone.right = half
    safeZone.halfWidth = half
    safeZone.top = 0.9
    safeZone.bottom = -0.9
    return
  }

  // Screen pixels to NDC. A little padding on each side so objects clear the
  // text with visible air rather than grazing it.
  const padX = safeZone.mobile ? 24 : 56
  safeZone.left = Math.max(-1.1, ((left - padX) / vw) * 2 - 1)
  safeZone.right = Math.min(1.1, ((right + padX) / vw) * 2 - 1)
  safeZone.halfWidth = Math.max(Math.abs(safeZone.left), Math.abs(safeZone.right))
  // Clamped to the viewport. Sections are several screens tall, so a container
  // scrolled halfway past produces a rect whose edges are well outside NDC.
  // Left unclamped those values are meaningless to compare against, and they
  // made the nav guard below fire for objects metres above the top of frame.
  safeZone.top = Math.min(1, 1 - ((top - 24) / vh) * 2)
  safeZone.bottom = Math.max(-1, 1 - ((bottom + 24) / vh) * 2)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__safeZone = safeZone
}

/* --------------------------------------------------------- per-frame use -- */

const _v = new THREE.Vector3()
let projX = 1
let projY = 1
let viewMatrix = null
let worldMatrix = null

/**
 * Cache the camera's matrices for this frame. Call once, before any of the
 * fast helpers below.
 */
export function beginKeepOut(camera) {
  measureSafeZone()
  camera.updateMatrixWorld()
  viewMatrix = camera.matrixWorldInverse
  worldMatrix = camera.matrixWorld
  const e = camera.projectionMatrix.elements
  projX = e[0]
  projY = e[5]
}

/** Project a world point into NDC using the cached matrices. Returns depth. */
function toNdc(x, y, z) {
  _v.set(x, y, z).applyMatrix4(viewMatrix)
  const depth = -_v.z
  if (depth < 0.1) return -1
  return depth
}

/**
 * How deeply a world point sits inside the protected region: 0 clear, 1 dead
 * centre. Used for dimming the distant layers that are not pushed.
 */
export function keepOutAmount(x, y, z) {
  if (!viewMatrix) return 0
  const depth = toNdc(x, y, z)
  if (depth < 0) return 0
  const ndcX = (projX * _v.x) / depth
  const ndcY = (projY * _v.y) / depth

  // Off screen entirely — nothing to protect against.
  if (Math.abs(ndcX) > 1.05 || Math.abs(ndcY) > 1.05) return 0

  const inColumn =
    ndcX > safeZone.left && ndcX < safeZone.right && ndcY < safeZone.top && ndcY > safeZone.bottom
  const underNav = ndcY > safeZone.navFloor
  if (!inColumn && !underNav) return 0

  // Softer toward the edges so the correction eases in rather than snapping.
  const span = Math.max(safeZone.right - safeZone.left, 0.001)
  const edge = Math.min(ndcX - safeZone.left, safeZone.right - ndcX) / (span * 0.5)
  return underNav ? 1 : Math.min(1, edge * 1.6)
}

/**
 * Move a world point out of the reading column along the camera's right
 * vector, writing the result into `out`. Returns true if it was moved.
 *
 * `strength` scales the correction so a layer can be nudged rather than fully
 * evicted — useful for the far fields, where a hard push would read as objects
 * fleeing the cursor.
 */
export function pushOutOfColumn(x, y, z, out, strength = 1, nearLimit = safeZone.near, radius = 0) {
  out.set(x, y, z)
  if (!viewMatrix) return false

  const depth = toNdc(x, y, z)
  // Behind the camera, or far enough out to count as sky.
  if (depth < 0 || depth > nearLimit) return false

  const ndcX = (projX * _v.x) / depth
  let ndcY = (projY * _v.y) / depth

  // Off screen: nothing to clear.
  if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) return false

  // THE NAVIGATION STRIP. It runs the full width of the viewport, so sliding
  // sideways cannot clear it — the only way out is down. The bar does gain a
  // blurred backdrop once the page scrolls, but it is transparent at the top
  // of the document, which is exactly where the hero's near objects are.
  let moved = false
  if (ndcY + (radius * projY) / depth > safeZone.navFloor) {
    const targetY = ((safeZone.navFloor - (radius * projY) / depth) * depth) / projY
    _v.y += (targetY - _v.y) * Math.min(1, strength)
    ndcY = (projY * _v.y) / depth
    moved = true
  }

  if (ndcY > safeZone.top || ndcY < safeZone.bottom) {
    if (moved) out.copy(_v).applyMatrix4(worldMatrix)
    return moved
  }

  // Clear the object's BOUNDING RADIUS, not its origin. An encounter is tens
  // of units across, so pushing its centre to the column edge still leaves
  // half of it lying over the text. Converting the radius to an angular size
  // at this depth is what makes the push respect the object's real extent.
  const pad = (radius * projX) / depth
  const lo = safeZone.left - pad
  const hi = safeZone.right + pad
  const inside = Math.min(ndcX - lo, hi - ndcX)
  if (inside <= 0) {
    if (moved) out.copy(_v).applyMatrix4(worldMatrix)
    return moved
  }

  // Ease the correction by distance -- something at the far edge of the near
  // band needs less moving than something filling the frame -- but keep the
  // floor high. At a 0.35 floor, fragments around 150 units only leaned out of
  // the column and were still measurably inside it; the point is to clear the
  // text, not to gesture at clearing it.
  const span = Math.max(hi - lo, 0.001)
  const proximity = 1 - depth / nearLimit
  const k = Math.min(1, (inside / (span * 0.5)) * 2.0) * strength * (0.7 + proximity * 0.3)

  // Leave by the NEARER edge, so an object never crosses the whole frame to
  // escape a column it was only just inside.
  const targetNdc = ndcX - lo < hi - ndcX ? lo : hi
  const targetX = (targetNdc * depth) / projX
  _v.x += (targetX - _v.x) * k

  // Back to world space.
  out.copy(_v).applyMatrix4(worldMatrix)
  return true
}

/** True when the near instanced fields should stand down entirely. */
export const nearFieldsSuppressed = () => safeZone.mobile
