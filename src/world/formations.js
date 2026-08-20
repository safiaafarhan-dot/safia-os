/**
 * The states the field organises itself into.
 *
 * SAFIA.OS has exactly one thing in it: a field of points. It is the
 * environment, the structures, the character and the typography — all the same
 * substance, in different states of organisation. Scrolling does not move a
 * camera past scenery; it REORGANISES the substance, and the camera watches.
 *
 * That is the whole reason the site reads as one continuous environment rather
 * than as eight scenes: there are no boundaries to cross, because there is
 * nothing to cross between.
 *
 * Every generator below fills a Float32Array of xyz triples for the SAME point
 * indices, so point `i` has a target in every formation and can be tracked
 * continuously from one to the next. All formations are authored in a unit box
 * roughly -1..1 and scaled by FIELD_RADIUS at the end, so they are directly
 * interpolable without one state dwarfing another.
 */

export const FIELD_RADIUS = 7.2

/**
 * Deterministic PRNG.
 *
 * Math.random() would reshuffle every formation on every reload, and — worse —
 * would break the correspondence between a point's position in one formation
 * and its position in the next, because generators are called independently.
 * A seeded stream means point `i` is always the same point.
 */
export function makeRandom(seed = 1) {
  let s = seed >>> 0
  return () => {
    // xorshift32
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

const TAU = Math.PI * 2

/** Uniform direction on the unit sphere, from two uniforms. */
const sphereDir = (u, v, out) => {
  const z = u * 2 - 1
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  const a = v * TAU
  out[0] = r * Math.cos(a)
  out[1] = z
  out[2] = r * Math.sin(a)
  return out
}

/* ------------------------------------------------------------ 0 attractor -- */

/**
 * A shell collapsing inward along spiral filaments.
 *
 * The opening state. Reads as something enormous holding itself together —
 * dense at the core, thinning outward, with visible structure in the falloff
 * so it never looks like a plain sphere of noise.
 */
function attractor(out, count, rnd) {
  const dir = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    sphereDir(rnd(), rnd(), dir)
    // pow < 1 biases outward, giving a hollow-ish shell with a dense core.
    const t = Math.pow(rnd(), 0.55)
    const r = 0.16 + t * 0.92

    // Spiral the shell: the further out, the further the point has been
    // dragged around the axis. This is what turns a sphere into a vortex.
    const twist = (1 - t) * 2.4
    const ca = Math.cos(twist)
    const sa = Math.sin(twist)
    const x = dir[0] * ca - dir[2] * sa
    const z = dir[0] * sa + dir[2] * ca

    out[i * 3] = x * r * FIELD_RADIUS
    out[i * 3 + 1] = dir[1] * r * FIELD_RADIUS * 0.86
    out[i * 3 + 2] = z * r * FIELD_RADIUS
  }
}

/* --------------------------------------------------------------- 1 figure -- */

/**
 * A standing figure, built from capsules.
 *
 * This is the character — and it is made of the world rather than placed in
 * front of it. Points are distributed along body segments weighted by segment
 * volume, and pushed toward the SURFACE of each capsule rather than filling
 * it, because a solid volume of points reads as a blob while a shell reads as
 * a silhouette.
 *
 * Authored in normalised units: y runs -1 (feet) to +1 (crown), x is half a
 * shoulder width at ±0.26.
 */
const FIGURE_SEGMENTS = [
  // [ax, ay, az, bx, by, bz, radiusA, radiusB]
  [0, 0.86, 0, 0, 1.0, 0, 0.155, 0.115], // head
  [0, 0.75, 0, 0, 0.87, 0, 0.06, 0.075], // neck
  [0, 0.3, 0, 0, 0.76, 0, 0.17, 0.215], // torso (broader at the shoulders)
  [0, 0.06, 0, 0, 0.32, 0, 0.165, 0.155], // hips
  [-0.05, 0.73, 0, -0.25, 0.7, 0, 0.1, 0.085], // shoulder L
  [0.05, 0.73, 0, 0.25, 0.7, 0, 0.1, 0.085], // shoulder R
  [-0.26, 0.7, 0, -0.3, 0.37, 0.02, 0.062, 0.052], // upper arm L
  [0.26, 0.7, 0, 0.3, 0.37, 0.02, 0.062, 0.052], // upper arm R
  [-0.3, 0.37, 0.02, -0.285, 0.07, 0.07, 0.05, 0.04], // forearm L
  [0.3, 0.37, 0.02, 0.285, 0.07, 0.07, 0.05, 0.04], // forearm R
  [-0.1, 0.07, 0, -0.125, -0.42, 0, 0.095, 0.075], // thigh L
  [0.1, 0.07, 0, 0.125, -0.42, 0, 0.095, 0.075], // thigh R
  [-0.125, -0.42, 0, -0.115, -0.88, 0.015, 0.072, 0.05], // shin L
  [0.125, -0.42, 0, 0.115, -0.88, 0.015, 0.072, 0.05], // shin R
  [-0.115, -0.9, 0.0, -0.115, -0.97, 0.1, 0.055, 0.045], // foot L
  [0.115, -0.9, 0.0, 0.115, -0.97, 0.1, 0.055, 0.045], // foot R
]

/** Cumulative volume weights, so limbs get points in proportion to their mass. */
const FIGURE_CDF = (() => {
  const w = FIGURE_SEGMENTS.map((s) => {
    const dx = s[3] - s[0]
    const dy = s[4] - s[1]
    const dz = s[5] - s[2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const r = (s[6] + s[7]) * 0.5
    return len * r * r
  })
  const total = w.reduce((a, b) => a + b, 0)
  let acc = 0
  return w.map((x) => (acc += x / total))
})()

function figure(out, count, rnd) {
  const dir = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    const pick = rnd()
    let seg = 0
    while (seg < FIGURE_CDF.length - 1 && pick > FIGURE_CDF[seg]) seg++
    const s = FIGURE_SEGMENTS[seg]

    const t = rnd()
    const px = s[0] + (s[3] - s[0]) * t
    const py = s[1] + (s[4] - s[1]) * t
    const pz = s[2] + (s[5] - s[2]) * t
    const radius = s[6] + (s[7] - s[6]) * t

    // Surface-biased offset: mostly on the shell, a few inside, so the figure
    // has a defined edge but is not hollow when seen against the light.
    sphereDir(rnd(), rnd(), dir)
    const shell = 0.72 + Math.pow(rnd(), 0.4) * 0.34

    // The scale here is chosen so the figure fills the same envelope as the
    // other formations — a figure noticeably smaller than the attractor would
    // read as the world shrinking rather than as the world resolving.
    const k = FIELD_RADIUS * 0.98
    out[i * 3] = (px + dir[0] * radius * shell) * k
    out[i * 3 + 1] = (py + dir[1] * radius * shell) * k
    out[i * 3 + 2] = (pz + dir[2] * radius * shell * 0.8) * k
  }
}

/* ------------------------------------------------------------- 2 manifold -- */

/**
 * A curved sheet — the way a learned representation is usually drawn.
 *
 * A saddle warped by two sine terms, sampled on a jittered grid so it reads as
 * a continuous surface rather than as scattered points that happen to be
 * coplanar. Rotated off-axis so it is never seen edge-on or face-on.
 */
function manifold(out, count, rnd) {
  for (let i = 0; i < count; i++) {
    // Disc sampling rather than a square, so the sheet has no visible corners.
    const a = rnd() * TAU
    const rad = Math.sqrt(rnd())
    const u = Math.cos(a) * rad
    const v = Math.sin(a) * rad

    const h =
      Math.sin(u * 2.6) * 0.32 +
      Math.cos(v * 2.1) * 0.28 +
      Math.sin((u + v) * 1.4) * 0.16

    // Slight thickness so the sheet catches light as a volume.
    const thick = (rnd() - 0.5) * 0.07

    const x = u * 1.0
    const y = h + thick
    const z = v * 1.0

    // Tilt: rotate about X then Z so the sheet presents as a form in space.
    const cx = Math.cos(-0.42)
    const sx = Math.sin(-0.42)
    const y1 = y * cx - z * sx
    const z1 = y * sx + z * cx
    const cz = Math.cos(0.3)
    const sz = Math.sin(0.3)

    out[i * 3] = (x * cz - y1 * sz) * FIELD_RADIUS
    out[i * 3 + 1] = (x * sz + y1 * cz) * FIELD_RADIUS
    out[i * 3 + 2] = z1 * FIELD_RADIUS
  }
}

/* --------------------------------------------------------------- 3 ribbon -- */

/**
 * A helical ribbon receding into depth — time made geometric.
 *
 * Points are ordered along the helix by index, which matters: because the same
 * point index is used in every formation, an ordered formation makes the morph
 * INTO it read as a sweep rather than as a random settle.
 */
function ribbon(out, count, rnd) {
  for (let i = 0; i < count; i++) {
    const t = i / count
    const turns = 2.6
    const a = t * TAU * turns
    const radius = 0.35 + t * 0.62

    // Width across the ribbon, and a little thickness through it.
    const w = (rnd() - 0.5) * 0.42
    const thick = (rnd() - 0.5) * 0.05

    const nx = Math.cos(a)
    const nz = Math.sin(a)

    out[i * 3] = (nx * (radius + w * 0.35) ) * FIELD_RADIUS
    out[i * 3 + 1] = (-0.85 + t * 1.7 + w * 0.5) * FIELD_RADIUS * 0.72
    out[i * 3 + 2] = (nz * (radius + w * 0.35) + thick) * FIELD_RADIUS
  }
}

/* ------------------------------------------------------------- 4 clusters -- */

/**
 * Discrete clusters — one per real project in the portfolio.
 *
 * The count is read from the actual project data rather than hard-coded, so
 * the world stays honest: what you are looking at is the shape of the work,
 * and it changes if the work does.
 */
function clusters(out, count, rnd, opts) {
  const k = Math.max(3, Math.min(10, opts?.clusterCount ?? 6))
  const centres = []
  for (let c = 0; c < k; c++) {
    // Fibonacci placement so clusters are evenly spread and never overlap.
    const y = 1 - (c / Math.max(1, k - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = c * 2.399963
    centres.push([Math.cos(theta) * r * 0.72, y * 0.62, Math.sin(theta) * r * 0.72])
  }

  const dir = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    // A tenth of the points become the threads BETWEEN clusters, which is what
    // makes the set read as a linked system rather than as separate blobs.
    if (i % 10 === 0) {
      const a = centres[i % k]
      const b = centres[(i + 1 + ((i / k) | 0)) % k]
      const t = rnd()
      const jitter = 0.02
      out[i * 3] = (a[0] + (b[0] - a[0]) * t + (rnd() - 0.5) * jitter) * FIELD_RADIUS
      out[i * 3 + 1] = (a[1] + (b[1] - a[1]) * t + (rnd() - 0.5) * jitter) * FIELD_RADIUS
      out[i * 3 + 2] = (a[2] + (b[2] - a[2]) * t + (rnd() - 0.5) * jitter) * FIELD_RADIUS
      continue
    }

    const c = centres[i % k]
    sphereDir(rnd(), rnd(), dir)
    // pow > 1 concentrates toward each centre, giving a soft core and halo.
    const r = Math.pow(rnd(), 1.6) * 0.26
    out[i * 3] = (c[0] + dir[0] * r) * FIELD_RADIUS
    out[i * 3 + 1] = (c[1] + dir[1] * r) * FIELD_RADIUS
    out[i * 3 + 2] = (c[2] + dir[2] * r) * FIELD_RADIUS
  }
}

/* ---------------------------------------------------------- 5 turbulence -- */

/**
 * Unresolved churn — the field thinking.
 *
 * Cheap curl-like advection: take a volume of points and push each one along a
 * divergence-free-ish field built from a few sine terms. The result has the
 * filaments and voids of real turbulence, which uniform noise never produces.
 */
function turbulence(out, count, rnd) {
  const dir = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    sphereDir(rnd(), rnd(), dir)
    let x = dir[0] * Math.pow(rnd(), 0.4) * 1.0
    let y = dir[1] * Math.pow(rnd(), 0.4) * 0.9
    let z = dir[2] * Math.pow(rnd(), 0.4) * 1.0

    // Four advection steps. More steps means longer, wispier filaments.
    for (let s = 0; s < 4; s++) {
      const vx = Math.sin(y * 3.1 + 1.3) - Math.cos(z * 2.7)
      const vy = Math.sin(z * 2.9 + 0.7) - Math.cos(x * 3.3)
      const vz = Math.sin(x * 2.5 + 2.1) - Math.cos(y * 3.0)
      x += vx * 0.055
      y += vy * 0.05
      z += vz * 0.055
    }

    out[i * 3] = x * FIELD_RADIUS * 0.82
    out[i * 3 + 1] = y * FIELD_RADIUS * 0.82
    out[i * 3 + 2] = z * FIELD_RADIUS * 0.82
  }
}

/* -------------------------------------------------------------- 6 lattice -- */

/**
 * A crystalline lattice — order, arrived at.
 *
 * Points snap to a cubic grid with a small jitter, and the grid is culled to a
 * rounded envelope so it reads as a crystal rather than as a cube of dots.
 */
function lattice(out, count, rnd) {
  const n = 13 // cells per axis
  const step = 2 / (n - 1)
  let i = 0
  let guard = 0

  while (i < count && guard < count * 40) {
    guard++
    const gx = Math.floor(rnd() * n)
    const gy = Math.floor(rnd() * n)
    const gz = Math.floor(rnd() * n)
    const x = -1 + gx * step
    const y = -1 + gy * step
    const z = -1 + gz * step

    // Rounded envelope, and a hollowed centre so the crystal has a shell.
    const d = Math.sqrt(x * x + y * y * 1.25 + z * z)
    if (d > 1.02 || d < 0.34) continue

    const j = 0.06
    out[i * 3] = (x + (rnd() - 0.5) * j) * FIELD_RADIUS
    out[i * 3 + 1] = (y + (rnd() - 0.5) * j) * FIELD_RADIUS * 0.9
    out[i * 3 + 2] = (z + (rnd() - 0.5) * j) * FIELD_RADIUS
    i++
  }

  // Anything the rejection sampler could not place goes to the shell, so the
  // buffer is never left with zeros at the origin.
  const dir = [0, 0, 0]
  for (; i < count; i++) {
    sphereDir(rnd(), rnd(), dir)
    out[i * 3] = dir[0] * FIELD_RADIUS
    out[i * 3 + 1] = dir[1] * FIELD_RADIUS * 0.9
    out[i * 3 + 2] = dir[2] * FIELD_RADIUS
  }
}

/* ---------------------------------------------------------- 7 convergence -- */

/**
 * Everything falls into a single point of light.
 *
 * The closing state, and the only formation with a strong directional read:
 * a dense core with long tails trailing off, so the last thing the visitor
 * sees is the world resolving to one answer.
 */
function convergence(out, count, rnd) {
  const dir = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    sphereDir(rnd(), rnd(), dir)
    // Heavy bias toward the centre: most points are in the core, a minority
    // stream in from far out.
    const t = Math.pow(rnd(), 3.2)
    const r = t * 1.15

    // Tails curve as they fall in, rather than pointing straight at the core.
    const swirl = t * 3.4
    const ca = Math.cos(swirl)
    const sa = Math.sin(swirl)
    const x = dir[0] * ca - dir[2] * sa
    const z = dir[0] * sa + dir[2] * ca

    out[i * 3] = x * r * FIELD_RADIUS
    out[i * 3 + 1] = dir[1] * r * FIELD_RADIUS * 0.8
    out[i * 3 + 2] = z * r * FIELD_RADIUS
  }
}

/* ------------------------------------------------------------------ build -- */

export const FORMATION_GENERATORS = [
  attractor,
  figure,
  manifold,
  ribbon,
  clusters,
  turbulence,
  lattice,
  convergence,
]

export const FORMATION_COUNT = FORMATION_GENERATORS.length

/** The index of the figure formation, which other systems light differently. */
export const FIGURE_FORMATION = 1

/**
 * Build every formation buffer for `count` points.
 *
 * Each generator gets its OWN seeded stream so adding or reordering a
 * formation cannot shift the others — otherwise a change to one state would
 * silently re-scatter every other state's correspondence.
 */
export function buildFormations(count, opts = {}) {
  return FORMATION_GENERATORS.map((gen, i) => {
    const buf = new Float32Array(count * 3)
    gen(buf, count, makeRandom(0x9e3779b9 + i * 2654435761), opts)
    return buf
  })
}
