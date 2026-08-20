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
  // Torso first, so the assembly stagger builds outward from the core.
  { pos: [0, 0.62, 0], geo: 'hex', args: [0.46, 0.3, 0.94, 6], accent: true },   // chest plate
  { pos: [0, 1.16, 0], geo: 'hex', args: [0.3, 0.44, 0.2, 6] },                  // gorget
  { pos: [0, 0.06, 0], geo: 'hex', args: [0.3, 0.24, 0.34, 6] },                 // waist
  { pos: [0, -0.36, 0], geo: 'hex', args: [0.36, 0.16, 0.6, 6] },                // hip plates
  { pos: [0, -0.98, 0], geo: 'oct', args: [0.3, 0], scale: [0.7, 2.1, 0.7] },    // keel
  { pos: [0, 1.34, 0], geo: 'cyl', args: [0.1, 0.1, 0.22, 8] },                  // neck
  { pos: [0, 1.62, -0.02], geo: 'oct', args: [0.3, 1], scale: [0.92, 1.2, 1.02], accent: true }, // helmet
  { pos: [0, 1.58, 0.2], geo: 'box', args: [0.3, 0.26, 0.16], accent: true },    // faceplate
  { pos: [-0.62, 1.12, 0], geo: 'box', args: [0.46, 0.2, 0.44], rot: [0, 0, 0.28], accent: true },
  { pos: [0.62, 1.12, 0], geo: 'box', args: [0.46, 0.2, 0.44], rot: [0, 0, -0.28], accent: true },
  { pos: [-0.66, 0.9, 0], geo: 'box', args: [0.36, 0.16, 0.36], rot: [0, 0, 0.42] },
  { pos: [0.66, 0.9, 0], geo: 'box', args: [0.36, 0.16, 0.36], rot: [0, 0, -0.42] },
  { pos: [-0.64, 0.5, 0.02], geo: 'cyl', args: [0.13, 0.11, 0.56, 6] },          // upper arm L
  { pos: [0.64, 0.5, 0.02], geo: 'cyl', args: [0.13, 0.11, 0.56, 6] },           // upper arm R
  { pos: [-0.66, 0.16, 0.03], geo: 'ico', args: [0.11, 0] },                     // elbow L
  { pos: [0.66, 0.16, 0.03], geo: 'ico', args: [0.11, 0] },                      // elbow R
  { pos: [-0.68, -0.16, 0.06], geo: 'cyl', args: [0.1, 0.085, 0.5, 6] },         // forearm L
  { pos: [0.68, -0.16, 0.06], geo: 'cyl', args: [0.1, 0.085, 0.5, 6] },          // forearm R
  { pos: [-0.46, 0.86, -0.34], geo: 'box', args: [0.06, 0.56, 0.24], rot: [0.22, 0, 0.46] },
  { pos: [0.46, 0.86, -0.34], geo: 'box', args: [0.06, 0.56, 0.24], rot: [0.22, 0, -0.46] },
]

/** Local bounds of the assembled figure, including the diagnostic rings. */
const CORE_HALF_HEIGHT = 1.95 // helmet crown down to keel tip
const CORE_HALF_WIDTH = 1.3 // the widest diagnostic ring

/** Depth in front of the camera at which the figure is parked. */
const CORE_DEPTH = 10.5

/**
 * Where the figure sits, expressed in normalised device coordinates rather
 * than world units.
 *
 * The composition is what matters, and NDC is the only frame the composition
 * is actually defined in — world coordinates that look right at 16:9 put the
 * figure completely off-screen in portrait, which is exactly what happened
 * when this was a fixed world position. Solving from NDC each frame means the
 * hero frames itself correctly at any viewport, including after a rotate.
 */
const CORE_FRAMING = {
  // Wide: right of the text column, slightly above centre.
  wide: { x: 0.52, y: 0.1, heightFrac: 0.72 },
  // Portrait: centred in the clear band between the nav bar and the headline.
  // That band is only ~185px tall on a 844px screen, so the figure has to be
  // both smaller and higher than the wide-viewport framing.
  narrow: { x: 0.04, y: 0.63, heightFrac: 0.3 },
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

function HeroCore({ reducedMotion }) {
  const groupRef = useRef()
  const partRefs = useRef([])
  const coreLight = useRef()
  const glowRef = useRef()
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

    // On first load the core builds itself regardless of scroll — this is the
    // boot. After that it is governed by how close the camera is.
    mounted.current = Math.min(1, mounted.current + delta / (reducedMotion ? 0.6 : 2.4))
    const p = Math.max(proximityTo(0, s.station, 1.4), mounted.current * (s.station < 1 ? 1 : 0))

    /* ---- solve framing for the current viewport ---- */
    const aspect = size.width / Math.max(1, size.height)
    const frame = aspect < 0.95 ? CORE_FRAMING.narrow : CORE_FRAMING.wide

    const halfH = Math.tan((camera.fov * Math.PI) / 360) * CORE_DEPTH
    const halfW = halfH * aspect

    // Fit to the requested share of viewport height, then clamp so the ring
    // can never overhang the sides on a narrow screen.
    let scale = (frame.heightFrac * halfH) / CORE_HALF_HEIGHT
    scale = Math.min(scale, (halfW * 0.92) / CORE_HALF_WIDTH)

    // The camera drifts with the pointer; anchoring to camera.position keeps
    // the core locked to its spot in frame instead of sliding with the drift.
    const baseX = camera.position.x + frame.x * halfW
    const baseY = camera.position.y + frame.y * halfH - 0.5 * scale
    const baseZ = camera.position.z - CORE_DEPTH
    const base = [baseX, baseY, baseZ]

    // Parts are laid out in the group's LOCAL space and the group is placed at
    // `base`, so the whole core rotates about its own centre rather than
    // swinging around the world origin.
    partRefs.current.forEach((ref, i) => {
      if (!ref) return
      const part = CORE_PARTS[i]
      applyAssembly(ref, i, CORE_PARTS.length, p, part.pos)
      // Once a part has essentially seated, snap it to its authored bevel and
      // proportions. Interpolating toward these during the tumble would fight
      // the assembly rotation and make the plates wobble as they land.
      if (p > 0.995) {
        if (part.rot) ref.rotation.set(...part.rot)
        if (part.scale) ref.scale.set(...part.scale)
      }
    })

    if (groupRef.current) {
      groupRef.current.position.set(...base)
      groupRef.current.scale.setScalar(scale)

      const spin = consumeSpin('hero-core', delta)
      if (spin) {
        spinOffset.current.x += spin.x
        spinOffset.current.y += spin.y
      }
      // Idle rotation continues under any drag the visitor has applied.
      const idle = reducedMotion ? 0 : s.time * 0.14
      groupRef.current.rotation.set(
        spinOffset.current.x + s.pointerSmoothY * 0.12,
        idle + spinOffset.current.y + s.pointerSmoothX * 0.25,
        0
      )
      groupRef.current.visible = p > 0.01
    }

    // Power only arrives once the plating is essentially seated.
    const lit = clamp01((p - 0.82) / 0.18)
    // A slow reactor beat, so the figure is never mechanically still.
    const beat = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(s.time * 1.7)
    if (coreLight.current) coreLight.current.intensity = lit * (10 + s.energy * 14) * beat
    if (glowRef.current) {
      glowRef.current.material.emissiveIntensity = lit * (2.6 + s.energy * 2.4) * beat
      glowRef.current.scale.setScalar(lit * (1 + Math.sin(s.time * 2) * 0.08 * lit))
    }
    if (visorRef.current) {
      // The eye line comes up last, after the plating has seated: the figure
      // finishes assembling and only then looks at you.
      visorRef.current.material.emissiveIntensity = lit * (2.4 + s.energy * 2.5)
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
    <group ref={groupRef}>
      {CORE_PARTS.map((part, i) => (
        <mesh key={i} ref={(el) => (partRefs.current[i] = el)}>
          {partGeometry(part)}
          {/* Machined graphite alloy, lit by the environment map — NOT
              emissive. The accent belongs on the EDGES, which is how the
              silhouette gets its crimson energy lines while the plating still
              reads as metal. */}
          <meshStandardMaterial
            color={part.accent ? '#78829a' : '#5b6377'}
            metalness={0.96}
            roughness={part.accent ? 0.19 : 0.31}
            envMapIntensity={2.1}
          />
          <Edges threshold={18} color={part.accent ? '#ff2d4d' : '#8fa3c2'} />
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
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshStandardMaterial color="#ff6a80" emissive="#ff2d4d" emissiveIntensity={0} />
      </mesh>
      {/* The housing that holds it, so the core sits IN the chest rather than
          floating in front of it. */}
      <mesh position={[0, 0.72, 0.31]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.19, 0.1, 6]} />
        <meshStandardMaterial color="#4c5468" metalness={0.96} roughness={0.24} envMapIntensity={2} />
        <Edges threshold={18} color="#ff2d4d" />
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
