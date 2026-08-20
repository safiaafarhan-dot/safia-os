import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import { pulseEnergy, scrollState } from '../state/scrollStore'
import { STATIONS } from './stations'
import { consumeSpin, registerInteractive } from './interaction'

/**
 * The objects that inhabit the corridor.
 *
 * Nothing here fades in. Every structure is built out of parts that fly in from
 * different depths, rotate onto their axis, lock, and only then illuminate —
 * the camera arriving at a station is what powers the machine there up. Scroll
 * back out and it comes apart again, because a thing that assembles once and
 * then just sits there is a loading animation, not a world.
 */

const WORLD_UP = new THREE.Vector3(0, 1, 0)

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/**
 * How assembled a station's machinery should be right now.
 * 1 when the camera is parked at it, falling to 0 roughly a station away.
 */
const proximityTo = (index, station, range = 1.15) =>
  clamp01(1 - Math.abs(station - index) / range)

/**
 * Deterministic scatter: fragment start positions must be stable across
 * frames, so they come from a hash of the index rather than Math.random(),
 * which would re-scatter the piece on every re-render.
 */
const hash = (n, salt = 1) => {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Drives one part from its scattered origin to its locked position.
 *
 * Parts are staggered so the structure builds up progressively instead of every
 * piece landing on the same frame — that simultaneity is what makes assembly
 * animations read as a single scale-up rather than construction.
 */
function applyAssembly(obj, i, count, p, target, opts = {}) {
  const { stagger = 0.5, spread = 1 } = opts
  const start = (i / Math.max(1, count)) * stagger
  const local = clamp01((p - start) / (1 - stagger))
  const e = easeOutCubic(local)

  // Origin: far out in a random direction, and deeper down the corridor, so
  // parts visibly travel through depth rather than sliding in on a plane.
  const a = hash(i, 3) * Math.PI * 2
  const r = (9 + hash(i, 5) * 16) * spread
  const ox = target[0] + Math.cos(a) * r
  const oy = target[1] + (hash(i, 7) - 0.5) * 14 * spread
  const oz = target[2] - (5 + hash(i, 11) * 22) * spread

  obj.position.set(
    ox + (target[0] - ox) * e,
    oy + (target[1] - oy) * e,
    oz + (target[2] - oz) * e
  )

  // Spin down to rest: parts tumble on approach and settle as they seat.
  const tumble = (1 - e) * (4 + hash(i, 13) * 8)
  obj.rotation.set(
    tumble * (hash(i, 17) - 0.5),
    tumble * (hash(i, 19) - 0.5),
    tumble * (hash(i, 23) - 0.5)
  )

  obj.scale.setScalar(0.15 + 0.85 * e)
  return local
}

/* ------------------------------------------------------ assembly stages --- */

/**
 * THE BUILD ORDER.
 *
 * The guardian used to assemble as one undifferentiated cloud: every part
 * scattered to a hashed random point and eased back on a shared curve with an
 * index stagger. It read as "a pile of debris converges" — a particle effect,
 * not an assembly. You could not tell a leg from a pauldron on the way in, and
 * nothing ever looked like it was being BUILT.
 *
 * It is now staged, in the order a machine would actually go together: spine,
 * legs, hips, torso, arms, shoulders, vanes, helmet — then power.
 *
 * Two details do most of the work:
 *
 *   ENTRY DIRECTION. Each stage arrives from where it should. Legs rise from
 *   below, the helmet descends from above, arms come in laterally, the torso
 *   closes from the front, vanes from behind. Direction is what tells the eye
 *   a part is being FITTED rather than simply appearing.
 *
 *   OVERSHOOT. Parts travel slightly past their seat and settle back. That
 *   small back-easing is the difference between a part sliding to a stop and a
 *   part LOCKING — it reads as mass meeting a hard stop.
 *
 * Windows overlap deliberately, so the build flows continuously rather than
 * stepping through eight discrete beats.
 */
const STAGES = [
  // [ start, end, entry direction, entry distance ]
  { start: 0.0, end: 0.16, dir: [0, -1, 0], dist: 3.5 }, // 0 spine, up from below
  { start: 0.11, end: 0.34, dir: [0, -1, 0], dist: 5.5 }, // 1 legs, rising
  { start: 0.3, end: 0.44, dir: [0, 0, -1], dist: 4.0 }, // 2 hips, from behind
  { start: 0.4, end: 0.56, dir: [0, 0, 1], dist: 4.5 }, // 3 torso, closing in front
  { start: 0.52, end: 0.7, dir: [1, 0, 0], dist: 5.0 }, // 4 arms, laterally
  { start: 0.66, end: 0.8, dir: [0, 1, 0], dist: 4.0 }, // 5 shoulders, from above
  { start: 0.74, end: 0.86, dir: [0, 0, -1], dist: 3.0 }, // 6 vanes, from behind
  { start: 0.82, end: 0.96, dir: [0, 1, 0], dist: 5.0 }, // 7 helmet, descending
]

/** Power-up windows, after the plating has seated. */
const REACTOR_WINDOW = [0.86, 0.97]
const VISOR_WINDOW = [0.93, 1.0]

/**
 * Back-easing: travel slightly past the seat, then settle.
 * Kept small — a large overshoot reads as bounce, which is rubber, not metal.
 */
const backOut = (t, k = 1.15) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2)

const stageProgress = (stage, p, jitter) => {
  const { start, end } = STAGES[stage]
  // A little per-part offset inside the stage, so members of one stage do not
  // all land on the same frame.
  const a = start + (end - start) * 0.35 * jitter
  return clamp01((p - a) / Math.max(0.0001, end - a))
}

/**
 * Drives one part from its staged entry point onto its seat.
 *
 * `mirror` flips the lateral entry for left-side parts, so arms arrive from
 * their own side instead of both sweeping in from the right.
 */
function applyStagedAssembly(obj, part, i, p) {
  const stage = STAGES[part.stage]
  const jitter = hash(i, 3)
  const local = stageProgress(part.stage, p, jitter)

  if (local <= 0) {
    // Hidden until its stage opens, so nothing sits at the origin waiting to
    // pop into existence.
    obj.visible = false
    return 0
  }
  obj.visible = true

  const e = backOut(local)
  const mirror = part.pos[0] < 0 ? -1 : 1
  const reach = 0.75 + jitter * 0.5
  const dx = stage.dir[0] * mirror * stage.dist * reach
  const dy = stage.dir[1] * stage.dist * reach
  const dz = stage.dir[2] * stage.dist * reach

  obj.position.set(
    part.pos[0] + dx * (1 - e),
    part.pos[1] + dy * (1 - e),
    part.pos[2] + dz * (1 - e)
  )

  // Settles onto the authored bevel rather than onto zero, so a part meant to
  // sit at an angle does not snap straight on the final frame.
  const rest = part.rot || [0, 0, 0]
  const tumble = (1 - local) * (1.6 + jitter * 2.2)
  obj.rotation.set(
    rest[0] + tumble * (hash(i, 17) - 0.5),
    rest[1] + tumble * (hash(i, 19) - 0.5),
    rest[2] + tumble * (hash(i, 23) - 0.5)
  )

  const sc = part.scale || [1, 1, 1]
  const grow = 0.55 + 0.45 * clamp01(local * 1.6)
  obj.scale.set(sc[0] * grow, sc[1] * grow, sc[2] * grow)
  return local
}

/* ------------------------------------------------------------ hero core --- */

/**
 * THE GUARDIAN — the armoured AI avatar of SAFIA.OS.
 *
 * An ORIGINAL powered-armour design. It deliberately borrows none of the
 * proportions, plating language, colour split or face of any existing
 * copyrighted character; what it takes is only the general idea of an
 * articulated armoured figure with an illuminated core, which is a genre
 * rather than a design. The read here is a machined graphite sentinel with
 * crimson energy — not a hero suit.
 *
 * WHY IT IS BUILT LIKE THIS
 * -------------------------
 * The previous core was five primitives stacked vertically: a subdivided
 * sphere on a large octahedron with two small icosahedra for shoulders. At
 * hero scale it read as a pile of shapes, not a figure. Silhouette is what
 * makes a figure legible at a glance, so the parts below are chosen for
 * OUTLINE first — helmet, gorget, layered pauldrons, tapering chest, a
 * suspended keel instead of legs — and for detail second.
 *
 * Forms stay MATERIAL. Filling them with emissive is what turned the old head
 * into a glowing balloon; the crimson lives on the edges, the visor and the
 * chest core, which is how the silhouette gets its energy lines while the
 * plating still reads as metal.
 *
 * Authored in local units where 1 is roughly a shoulder half-width.
 */
const CORE_PARTS = [
  // STAGE 0 - SPINE. The internal column the rest of the machine hangs on.
  { stage: 0, pos: [0, 0.06, 0], geo: 'hex', args: [0.3, 0.24, 0.34, 6] },       // waist
  { stage: 0, pos: [0, 1.34, 0], geo: 'cyl', args: [0.1, 0.1, 0.22, 8] },        // neck

  // STAGE 1 - LEGS, rising from below.
  { stage: 1, pos: [-0.23, -0.96, 0], geo: 'cyl', args: [0.16, 0.125, 0.6, 6] },
  { stage: 1, pos: [0.23, -0.96, 0], geo: 'cyl', args: [0.16, 0.125, 0.6, 6] },
  { stage: 1, pos: [-0.23, -1.32, 0.02], geo: 'ico', args: [0.13, 0] },
  { stage: 1, pos: [0.23, -1.32, 0.02], geo: 'ico', args: [0.13, 0] },
  { stage: 1, pos: [-0.23, -1.68, 0.01], geo: 'cyl', args: [0.125, 0.1, 0.62, 6] },
  { stage: 1, pos: [0.23, -1.68, 0.01], geo: 'cyl', args: [0.125, 0.1, 0.62, 6] },
  { stage: 1, pos: [-0.23, -2.04, 0.08], geo: 'box', args: [0.24, 0.14, 0.44], accent: true },
  { stage: 1, pos: [0.23, -2.04, 0.08], geo: 'box', args: [0.24, 0.14, 0.44], accent: true },

  // STAGE 2 - HIPS, seating from behind onto the legs.
  { stage: 2, pos: [0, -0.3, 0], geo: 'hex', args: [0.4, 0.32, 0.36, 6] },       // pelvis
  { stage: 2, pos: [-0.23, -0.62, 0], geo: 'box', args: [0.3, 0.22, 0.32], accent: true },
  { stage: 2, pos: [0.23, -0.62, 0], geo: 'box', args: [0.3, 0.22, 0.32], accent: true },

  // STAGE 3 - TORSO, closing over the spine from the front.
  { stage: 3, pos: [0, 0.62, 0], geo: 'hex', args: [0.46, 0.3, 0.94, 6], accent: true },
  { stage: 3, pos: [0, 1.16, 0], geo: 'hex', args: [0.3, 0.44, 0.2, 6] },        // gorget

  // STAGE 4 - ARMS, in from their own side.
  { stage: 4, pos: [-0.64, 0.5, 0.02], geo: 'cyl', args: [0.13, 0.11, 0.56, 6] },
  { stage: 4, pos: [0.64, 0.5, 0.02], geo: 'cyl', args: [0.13, 0.11, 0.56, 6] },
  { stage: 4, pos: [-0.66, 0.16, 0.03], geo: 'ico', args: [0.11, 0] },
  { stage: 4, pos: [0.66, 0.16, 0.03], geo: 'ico', args: [0.11, 0] },
  { stage: 4, pos: [-0.68, -0.16, 0.06], geo: 'cyl', args: [0.1, 0.085, 0.5, 6] },
  { stage: 4, pos: [0.68, -0.16, 0.06], geo: 'cyl', args: [0.1, 0.085, 0.5, 6] },
  { stage: 4, pos: [-0.69, -0.48, 0.07], geo: 'box', args: [0.15, 0.22, 0.13], accent: true },
  { stage: 4, pos: [0.69, -0.48, 0.07], geo: 'box', args: [0.15, 0.22, 0.13], accent: true },

  // STAGE 5 - SHOULDERS, dropping from above. Two layered plates each, which
  // is what gives the silhouette its stepped armoured line.
  { stage: 5, pos: [-0.62, 1.12, 0], geo: 'box', args: [0.46, 0.2, 0.44], rot: [0, 0, 0.28], accent: true },
  { stage: 5, pos: [0.62, 1.12, 0], geo: 'box', args: [0.46, 0.2, 0.44], rot: [0, 0, -0.28], accent: true },
  { stage: 5, pos: [-0.66, 0.9, 0], geo: 'box', args: [0.36, 0.16, 0.36], rot: [0, 0, 0.42] },
  { stage: 5, pos: [0.66, 0.9, 0], geo: 'box', args: [0.36, 0.16, 0.36], rot: [0, 0, -0.42] },

  // STAGE 6 - BACK VANES. The heat-sink language, found after the silhouette
  // has already landed.
  { stage: 6, pos: [-0.46, 0.86, -0.34], geo: 'box', args: [0.06, 0.56, 0.24], rot: [0.22, 0, 0.46] },
  { stage: 6, pos: [0.46, 0.86, -0.34], geo: 'box', args: [0.06, 0.56, 0.24], rot: [0.22, 0, -0.46] },

  // STAGE 7 - HELMET, descending last onto the neck.
  { stage: 7, pos: [0, 1.62, -0.02], geo: 'oct', args: [0.3, 1], scale: [0.92, 1.2, 1.02], accent: true },
  { stage: 7, pos: [0, 1.58, 0.2], geo: 'box', args: [0.3, 0.26, 0.16], accent: true },
]

/** Local bounds of the assembled figure, including the diagnostic rings. */
const CORE_HALF_HEIGHT = 2.0 // helmet crown (1.92) down to sole (-2.11)
const CORE_HALF_WIDTH = 1.3 // the widest diagnostic ring
/**
 * The figure is not symmetric about its own origin - it runs from +1.92 at the
 * crown to -2.11 at the soles - so the optical centre sits slightly BELOW
 * zero. Framing has to compensate, or the figure hangs high in its box and the
 * composition reads as if it is floating away from the layout.
 */
const CORE_CENTRE_Y = -0.1

/**
 * WHERE THE GUARDIAN STANDS, STATION BY STATION.
 *
 * This table is the fix for the single worst problem in the build: the figure
 * used to be gated to `proximityTo(0, station, 1.4)` and hard-hidden past
 * station 1.4, so it simply did not exist for four fifths of the journey -
 * including the entire black-hole sequence. It was not being overpowered by
 * the composition; it was absent from it.
 *
 * It is now the protagonist for the whole scroll, and the framing is authored
 * per station so it plays a part in each shot rather than being parked in one
 * spot forever.
 *
 * The important entries are 4 and 5. Through the black hole the guardian moves
 * into the FOREGROUND - depth 7 instead of 18 - so it is small in frame but
 * very close to the camera. That is what makes the hole read as enormous:
 * scale contrast against a protagonist you already know the size of. A giant
 * black circle with nothing to measure it against is just a big circle.
 *
 * Coordinates are NORMALISED DEVICE COORDINATES, because the composition is
 * what matters and NDC is the only frame the composition is defined in. World
 * coordinates that look right at 16:9 put the figure off-screen in portrait.
 *
 * x/y  position in frame, -1..1
 * h    height as a fraction of the viewport
 * d    distance in front of the camera - the depth/scale dial
 * yaw  which way it is facing, radians
 */
const CAST = [
  // 0 HERO - large, right of the reading column, turned toward the text.
  { x: 0.52, y: 0.10, h: 0.72, d: 10.5, yaw: -0.35 },
  // 1 IDENTITY - has walked ahead and turned away while you read its file.
  { x: 0.64, y: 0.24, h: 0.44, d: 14.0, yaw: -1.30 },
  // 2 CAPABILITY - opposite the constellation, turned back toward it.
  { x: -0.60, y: 0.26, h: 0.40, d: 15.0, yaw: 0.70 },
  // 3 RECORD - small and low; the corridor opens out and it gives it scale.
  { x: 0.66, y: -0.32, h: 0.30, d: 18.0, yaw: -0.80 },
  // 4 APPROACH - into the foreground, low and right, against the disk.
  { x: 0.60, y: -0.34, h: 0.50, d: 8.0, yaw: 0.45 },
  // 5 CLIMAX - closer still, a rim-lit silhouette on the bright limb.
  { x: 0.56, y: -0.26, h: 0.62, d: 6.4, yaw: 0.30 },
  // 6 HONOURS - pulling back out, mid-right, as the phenomenon releases.
  { x: 0.60, y: 0.28, h: 0.34, d: 16.0, yaw: -0.60 },
  // 7 UPLINK - centred and facing you for the first time since the hero.
  { x: 0.00, y: 0.30, h: 0.42, d: 12.0, yaw: 0.00 },
]

const CAST_KEYS = ['x', 'y', 'h', 'd', 'yaw']

/**
 * Blend the framing between stations, into `out` rather than a fresh object -
 * this runs every frame, and per-frame allocation in a render loop is the kind
 * of garbage that surfaces later as periodic hitching.
 */
function sampleCast(stationFloat, out) {
  const c = Math.max(0, Math.min(CAST.length - 1, stationFloat))
  const i = Math.floor(c)
  const j = Math.min(CAST.length - 1, i + 1)
  const t = c - i
  for (const k of CAST_KEYS) out[k] = CAST[i][k] * (1 - t) + CAST[j][k] * t
  return out
}

/** The three diagnostic rings that orbit the figure. */
const DIAGNOSTIC_RINGS = [
  { radius: 1.28, tube: 0.007, tilt: [Math.PI / 2.4, 0, 0], spin: 0.3, y: 0.6 },
  { radius: 0.95, tube: 0.005, tilt: [Math.PI / 2.9, 0.5, 0.3], spin: -0.44, y: 0.9 },
  { radius: 0.52, tube: 0.004, tilt: [Math.PI / 2.1, -0.4, 0.7], spin: 0.62, y: 1.62 },
]

function partGeometry(part) {
  if (part.geo === 'ico') return <icosahedronGeometry args={part.args} />
  if (part.geo === 'oct') return <octahedronGeometry args={part.args} />
  // A 6-sided cylinder is a machined prism, not a tube — it catches the rim
  // light on flats instead of smearing it into a single highlight band.
  if (part.geo === 'hex' || part.geo === 'cyl') return <cylinderGeometry args={part.args} />
  return <boxGeometry args={part.args} />
}

/**
 * Diagnostic pin for the assembly sequence: ?assembly=0.45 holds the build at
 * one instant. An eleven-stage sequence that plays once in four seconds on
 * load is otherwise close to impossible to inspect — you cannot hold a moment
 * still to check whether a part arrives from the right direction or seats
 * correctly.
 */
const assemblyPin = (() => {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('assembly')
  if (v === null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null
})()

function HeroCore({ reducedMotion }) {
  const groupRef = useRef()
  const partRefs = useRef([])
  const coreLight = useRef()
  const glowRef = useRef()
  const irisRef = useRef()
  const rimRef = useRef()
  const cast = useRef({ x: 0, y: 0, h: 1, d: 10, yaw: 0 })
  const fwd = useRef(new THREE.Vector3(0, 0, -1))
  const camRight = useRef(new THREE.Vector3(1, 0, 0))
  const camUp = useRef(new THREE.Vector3(0, 1, 0))
  const basePos = useRef(new THREE.Vector3())
  const visorRef = useRef()
  const ringRef = useRef()
  const mounted = useRef(0)
  const spinOffset = useRef({ x: 0, y: 0 })

  useEffect(
    () =>
      registerInteractive('hero-core', {
        object: groupRef,
        label: 'SAFIA.OS CORE',
        draggable: true,
        onActivate: () => pulseEnergy(0.8),
      }),
    []
  )

  useFrame((state, delta) => {
    const s = scrollState()
    const { camera, size } = state

    // The guardian assembles ONCE, on load. It never disassembles again,
    // because a protagonist that falls apart every time you scroll past is a
    // loading animation, not a character.
    mounted.current = Math.min(1, mounted.current + delta / (reducedMotion ? 0.6 : 4.4))
    // Diagnostic: ?assembly=0.45 pins the build at one instant. An eleven-stage
    // sequence that plays once in four seconds on load is otherwise close to
    // impossible to inspect - you cannot hold a moment still to see whether a
    // part is arriving from the right direction or seating correctly.
    const p = assemblyPin === null ? mounted.current : assemblyPin

    /* ---- solve framing for the current viewport ---- */
    const c = sampleCast(s.station, cast.current)
    const aspect = size.width / Math.max(1, size.height)
    const portrait = aspect < 0.95

    const halfH = Math.tan((camera.fov * Math.PI) / 360) * c.d
    const halfW = halfH * aspect

    // Portrait gets a smaller, higher figure: the clear band between the nav
    // bar and the headline is only ~185px tall on an 844px screen, and the
    // wide framing puts the figure straight through the text.
    const heightFrac = portrait ? c.h * 0.5 : c.h
    let scale = (heightFrac * halfH) / CORE_HALF_HEIGHT
    // Never let the diagnostic rings overhang the sides on a narrow screen.
    scale = Math.min(scale, (halfW * 0.92) / CORE_HALF_WIDTH)

    const frameX = portrait ? c.x * 0.35 : c.x
    const frameY = portrait ? Math.max(c.y, 0.42) : c.y

    // SOLVED IN THE CAMERA'S OWN FRAME, not in world axes.
    //
    // This used to be `camera.position.z - depth`, which silently assumed the
    // camera always looked down -Z. It did, until the rig started steering
    // from the path tangent - at which point the guardian was being placed
    // somewhere off to the side of the shot instead of in front of it, and the
    // figure appeared to fly apart. Projecting along the camera's actual
    // forward/right/up is the only placement that survives a camera that
    // turns.
    camera.getWorldDirection(fwd.current)
    camRight.current.crossVectors(fwd.current, WORLD_UP).normalize()
    camUp.current.crossVectors(camRight.current, fwd.current).normalize()

    basePos.current
      .copy(camera.position)
      .addScaledVector(fwd.current, c.d)
      .addScaledVector(camRight.current, frameX * halfW)
      .addScaledVector(camUp.current, frameY * halfH - CORE_CENTRE_Y * scale)
    const base = [basePos.current.x, basePos.current.y, basePos.current.z]

    // Parts are laid out in the group's LOCAL space and the group is placed at
    // `base`, so the whole core rotates about its own centre rather than
    // swinging around the world origin.
    partRefs.current.forEach((ref, i) => {
      if (!ref) return
      applyStagedAssembly(ref, CORE_PARTS[i], i, p)
    })

    if (groupRef.current) {
      groupRef.current.position.set(...base)
      groupRef.current.scale.setScalar(scale)

      const spin = consumeSpin('hero-core', delta)
      if (spin) {
        spinOffset.current.x += spin.x
        spinOffset.current.y += spin.y
      }
      // The authored facing for this station, plus a slow breathing sway so
      // the figure is never mechanically still, plus whatever the visitor has
      // dragged. It no longer spins continuously: a protagonist that rotates
      // forever reads as a turntable model, not as a character standing in a
      // world.
      const sway = reducedMotion ? 0 : Math.sin(s.time * 0.42) * 0.06
      // Facing is relative to where the camera actually is. The authored yaw
      // is an offset from "square to the viewer" - without the camera term it
      // would mean an arbitrary world direction, and the figure would present
      // its back at unpredictable points along the curve.
      const faceCamera = Math.atan2(-fwd.current.x, -fwd.current.z)
      groupRef.current.rotation.set(
        spinOffset.current.x + s.pointerSmoothY * 0.1,
        faceCamera + c.yaw + sway + spinOffset.current.y + s.pointerSmoothX * 0.2,
        0
      )
      // A gentle float, so it reads as suspended rather than pasted in place.
      if (!reducedMotion) groupRef.current.position.y += Math.sin(s.time * 0.6) * 0.05 * scale
      groupRef.current.visible = p > 0.01
    }

    // SEPARATION. A rim light placed behind the guardian along the camera's
    // own sight line, so the silhouette always has a lit edge no matter what
    // is behind it. This is what keeps the figure readable against the
    // accretion disk instead of dissolving into it.
    if (rimRef.current) {
      const dx = base[0] - camera.position.x
      const dy = base[1] - camera.position.y
      const dz = base[2] - camera.position.z
      const len = Math.hypot(dx, dy, dz) || 1
      // Held well back and run gently. At 2.6 units and intensity 7 it was
      // close enough for inverse-square falloff to blow the nearest plates
      // out into hot bands that the bloom pass then smeared across the torso -
      // the figure read as glitching rather than as lit. A rim light should
      // draw an edge, not light the subject.
      rimRef.current.position.set(
        base[0] + (dx / len) * 5.5 * scale,
        base[1] + (dy / len) * 5.5 * scale + 2.2 * scale,
        base[2] + (dz / len) * 5.5 * scale
      )
      rimRef.current.intensity = (2.6 + s.energy * 1.6) * scale * scale
      rimRef.current.distance = 22 * scale
    }

    // Power arrives in two beats after the plating seats: the reactor spins up
    // first, then the visor comes on last. The visor being LAST is the whole
    // point of the sequence - the machine finishes building, and only then
    // does it look at you.
    const reactorLit = clamp01((p - REACTOR_WINDOW[0]) / (REACTOR_WINDOW[1] - REACTOR_WINDOW[0]))
    const visorLit = clamp01((p - VISOR_WINDOW[0]) / (VISOR_WINDOW[1] - VISOR_WINDOW[0]))
    const lit = reactorLit
    // A slow reactor beat, so the figure is never mechanically still.
    const beat = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(s.time * 1.7)
    if (coreLight.current) coreLight.current.intensity = lit * (5.5 + s.energy * 8) * beat
    if (glowRef.current) {
      // Kept deliberately low. The bloom pass is what gives the core its
      // reach; driving the emissive hard as well blew it into a red ball that
      // swallowed the chest and detached from the silhouette.
      glowRef.current.material.emissiveIntensity = lit * (0.42 + s.energy * 0.4) * beat
      glowRef.current.scale.setScalar(lit * (1 + Math.sin(s.time * 2) * 0.08 * lit))
    }
    if (visorRef.current) {
      // The eye line comes up last, after the plating has seated: the figure
      // finishes assembling and only then looks at you.
      visorRef.current.material.emissiveIntensity = visorLit * (1.5 + s.energy * 1.6)
    }
    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.55 + lit * 0.45)
      ringRef.current.children.forEach((ring, i) => {
        const r = DIAGNOSTIC_RINGS[i]
        // Each ring turns on its own axis at its own rate, so they never lock
        // into a single spinning halo.
        ring.rotation.z = r.tilt[2] + (reducedMotion ? 0 : s.time * r.spin)
        ring.material.opacity = lit * (0.34 + s.energy * 0.3)
      })
    }
  })

  return (
    <>
      {/* Sits outside the figure's own group so it is positioned in world
          space relative to the camera, not carried around by the figure's
          rotation. */}
      <pointLight ref={rimRef} color="#ffb46a" intensity={0} distance={14} decay={2} />

      <group ref={groupRef}>
      {CORE_PARTS.map((part, i) => (
        <mesh key={i} ref={(el) => (partRefs.current[i] = el)}>
          {partGeometry(part)}
          {/* Machined graphite alloy, lit by the environment map — NOT
              emissive. The accent belongs on the EDGES, which is how the
              silhouette gets its crimson energy lines while the plating still
              reads as metal. */}
          {/* RED AND GOLD, as metal rather than as paint.
              Accent plates are a deep crimson lacquer over metal - high
              metalness with a dark red base reads as anodised armour, where a
              bright red diffuse would read as plastic. Structure underneath is
              graphite, and the edge line work is warm gold. Keeping the gold
              on the EDGES rather than as broad panels is what stops the figure
              tipping into costume territory. */}
          <meshStandardMaterial
            color={part.accent ? '#7d2230' : '#4d5567'}
            metalness={0.95}
            roughness={part.accent ? 0.26 : 0.38}
            envMapIntensity={2.4}
          />
          <Edges threshold={18} color={part.accent ? '#e8b45c' : '#8fa3c2'} />
        </mesh>
      ))}

      {/* Visor. The single feature that makes the helmet read as a head — and
          the only part of the figure that ever looks back at you. */}
      <mesh ref={visorRef} position={[0, 1.6, 0.29]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.235, 0.045, 0.05]} />
        <meshStandardMaterial
          color="#ff8f9f"
          emissive="#ff2d4d"
          emissiveIntensity={0}
          toneMapped={false}
        />
      </mesh>

      {/* Chest core. Small and tone-mapped: as an untone-mapped emissive it
          blew out into a floating ball that detached from the silhouette. The
          bloom pass is what gives it reach now, not raw intensity. */}
      <mesh ref={glowRef} position={[0, 0.72, 0.36]}>
        <sphereGeometry args={[0.095, 20, 20]} />
        <meshStandardMaterial color="#ff6a80" emissive="#ff2d4d" emissiveIntensity={0} />
      </mesh>
      {/* The housing that holds it, so the core sits IN the chest rather than
          floating in front of it. */}
      <mesh position={[0, 0.72, 0.31]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.1, 6]} />
        <meshStandardMaterial color="#4c5468" metalness={0.96} roughness={0.24} envMapIntensity={2} />
        <Edges threshold={18} color="#ff2d4d" />
      </mesh>

      {/* Iris: a thin ring around the aperture. Without it the core reads as
          a ball glued to the chest; with it, as a light sitting INSIDE a
          machined housing, which is the whole difference between a toy and a
          piece of hardware. */}
      <mesh ref={irisRef} position={[0, 0.72, 0.345]}>
        <torusGeometry args={[0.115, 0.012, 6, 32]} />
        <meshStandardMaterial color="#d8ab5e" metalness={0.96} roughness={0.2} envMapIntensity={2.4} />
      </mesh>

      <pointLight ref={coreLight} position={[0, 0.76, 0.5]} color="#ff2d4d" intensity={0} distance={11} decay={2} />

      {/* Floating diagnostics: three rings on independent axes. Thin enough to
          read as instrumentation rather than as decoration. */}
      <group ref={ringRef}>
        {DIAGNOSTIC_RINGS.map((r, i) => (
          <mesh key={i} position={[0, r.y, 0]} rotation={r.tilt}>
            <torusGeometry args={[r.radius, r.tube, 6, 96]} />
            <meshBasicMaterial color="#b3122e" transparent opacity={0} toneMapped={false} />
          </mesh>
        ))}
      </group>
      </group>
    </>
  )
}

/* ---------------------------------------------------------- station gate -- */

/**
 * A ring the camera physically flies through at each station.
 *
 * This is the strongest single depth cue in the whole build: watching a
 * structure grow, pass the camera and disappear behind you is unambiguous
 * forward travel in a way that no amount of parallax can fake.
 */
function StationGates({ count }) {
  const groupRef = useRef()

  const gates = useMemo(
    () =>
      STATIONS.flatMap((s, i) =>
        Array.from({ length: count }, (_, k) => ({
          key: `${s.id}-${k}`,
          // Pushed back so the nearest ring sits INSIDE the frustum and reads
          // as a gate you approach. At -6 a radius-7 torus was wider than the
          // frame, so only its corners showed — as arcs wrapping the layout
          // rather than a structure in the distance.
          // Pushed much further out and much larger. At radius ~7 and 15
          // units ahead a gate is NARROWER than the frame, so all you ever saw
          // were red arcs wrapping the layout — a bullseye graphic rather than
          // architecture. At this scale a gate is a distant ellipse when you
          // approach it and passes entirely outside the frame as you arrive,
          // which is unambiguous forward travel and never crosses the text.
          position: [
            s.position[0] * 0.4 + (k - 1) * 2.4,
            s.position[1] * 0.3 + (k - 1) * 1.4,
            s.position[2] - 30 - k * 24,
          ],
          // Tilted off-axis. Perfectly concentric, face-on rings read as a flat
          // bullseye graphic pinned behind the layout; tilting them gives each
          // one its own vanishing ellipse, so they read as structures standing
          // in space at different depths.
          // A consistent shallow tilt, not a random one: matched tilt across
          // the set reads as installed architecture; random tilt reads as junk.
          rotation: [0.2 + k * 0.06, -0.16 + k * 0.08, k * 0.32],
          radius: 22 + k * 10,
          color: s.mood.accent,
          spin: (k % 2 === 0 ? 1 : -1) * (0.03 + k * 0.012),
          index: i,
        }))
      ),
    [count]
  )

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const { time, station, energy } = scrollState()
    g.children.forEach((child, i) => {
      const gate = gates[i]
      // Spin about the ring's own axis, on top of its fixed tilt.
      child.rotation.z = gate.rotation[2] + time * gate.spin
      // Brightest as the camera passes through, dark well before and after.
      const near = clamp01(1 - Math.abs(station - gate.index) / 1.3)
      child.material.opacity = 0.035 + near * (0.16 + energy * 0.12)
    })
  })

  return (
    <group ref={groupRef}>
      {gates.map((g) => (
        <mesh key={g.key} position={g.position} rotation={g.rotation} frustumCulled={false}>
          <torusGeometry args={[g.radius, 0.075, 6, 72]} />
          <meshBasicMaterial color={g.color} transparent opacity={0.1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------- station machine -- */

/**
 * A generic assembling machine parked at a station: a lattice of nodes that
 * flies together, links up, and lights when the camera arrives. Draggable, so
 * the visitor can physically turn it over.
 */
function StationMachine({ index, id, label, nodes = 14, radius = 1.6, reducedMotion }) {
  const groupRef = useRef()
  const nodeRefs = useRef([])
  const linkRef = useRef()
  const lightRef = useRef()
  const spinOffset = useRef({ x: 0, y: 0 })
  const activated = useRef(0)

  const station = STATIONS[index]
  const accent = station.mood.accent

  const base = useMemo(
    () => [
      station.position[0] * 0.4 - 2.6,
      station.position[1] * 0.5,
      station.position[2] - 11,
    ],
    [station]
  )

  // Fibonacci sphere: even coverage without the clumping of random placement.
  const targets = useMemo(
    () =>
      Array.from({ length: nodes }, (_, i) => {
        const y = 1 - (i / Math.max(1, nodes - 1)) * 2
        const r = Math.sqrt(Math.max(0, 1 - y * y))
        const theta = i * 2.399963
        return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]
      }),
    [nodes, radius]
  )

  const linkGeometry = useMemo(() => {
    const pts = []
    // Connect each node to its nearest couple of neighbours so the lattice
    // reads as a structure rather than a cloud.
    for (let i = 0; i < targets.length; i++) {
      const dists = targets
        .map((t, j) => ({ j, d: new THREE.Vector3(...t).distanceTo(new THREE.Vector3(...targets[i])) }))
        .filter((x) => x.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
      dists.forEach(({ j }) => {
        pts.push(new THREE.Vector3(...targets[i]), new THREE.Vector3(...targets[j]))
      })
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [targets])

  useEffect(
    () =>
      registerInteractive(id, {
        object: groupRef,
        label,
        draggable: true,
        onActivate: () => {
          activated.current = 1
          pulseEnergy(0.7)
        },
      }),
    [id, label]
  )

  useFrame((state, delta) => {
    const s = scrollState()
    const p = proximityTo(index, s.station)

    nodeRefs.current.forEach((ref, i) => {
      if (!ref) return
      applyAssembly(ref, i, targets.length, p, targets[i], { spread: 0.7 })
    })

    if (groupRef.current) {
      groupRef.current.position.set(...base)
      const spin = consumeSpin(id, delta)
      if (spin) {
        spinOffset.current.x += spin.x
        spinOffset.current.y += spin.y
      }
      const idle = reducedMotion ? 0 : s.time * 0.1
      groupRef.current.rotation.set(
        spinOffset.current.x + s.pointerSmoothY * 0.1,
        idle + spinOffset.current.y + s.pointerSmoothX * 0.18,
        0
      )
      groupRef.current.visible = p > 0.01
    }

    activated.current = Math.max(0, activated.current - delta * 0.6)
    const lit = clamp01((p - 0.75) / 0.25)

    if (linkRef.current) {
      linkRef.current.material.opacity = lit * (0.3 + s.energy * 0.3 + activated.current * 0.4)
    }
    if (lightRef.current) {
      lightRef.current.intensity = lit * (1.6 + s.energy * 2 + activated.current * 4)
    }
  })

  return (
    <group ref={groupRef}>
      {targets.map((_, i) => (
        <mesh key={i} ref={(el) => (nodeRefs.current[i] = el)}>
          <icosahedronGeometry args={[0.11, 0]} />
          <meshStandardMaterial
            color="#7e879d"
            metalness={0.95}
            roughness={0.18}
            envMapIntensity={2.2}
            emissive={accent}
            emissiveIntensity={0.9}
          />
        </mesh>
      ))}

      <lineSegments ref={linkRef} geometry={linkGeometry}>
        <lineBasicMaterial color={accent} transparent opacity={0} />
      </lineSegments>

      <pointLight ref={lightRef} color={accent} intensity={0} distance={9} />
    </group>
  )
}

/* ----------------------------------------------------------------- root --- */

const StationProps = ({ tier, reducedMotion }) => {
  // Gate density is the cheapest thing to trim on weak hardware and the least
  // missed, since the dust field already carries the sense of travel.
  const gateCount = tier.strata > 120 ? 3 : tier.strata > 60 ? 2 : 1

  return (
    <group>
      <StationGates count={gateCount} />
      <HeroCore reducedMotion={reducedMotion} />

      <StationMachine
        index={2}
        id="skills-lattice"
        label="SKILL LATTICE"
        nodes={tier.strata > 120 ? 18 : 12}
        radius={1.8}
        reducedMotion={reducedMotion}
      />
      <StationMachine
        index={4}
        id="project-array"
        label="PROJECT ARRAY"
        nodes={tier.strata > 120 ? 16 : 10}
        radius={2.1}
        reducedMotion={reducedMotion}
      />
      <StationMachine
        index={5}
        id="lab-reactor"
        label="AI LAB REACTOR"
        nodes={tier.strata > 120 ? 20 : 12}
        radius={1.5}
        reducedMotion={reducedMotion}
      />
      <StationMachine
        index={7}
        id="contact-beacon"
        label="UPLINK BEACON"
        nodes={tier.strata > 120 ? 12 : 8}
        radius={1.3}
        reducedMotion={reducedMotion}
      />
    </group>
  )
}

export default StationProps
