import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS } from './stations'
import { chargedInfluenceAt, cursorField } from './cursorFieldState'
import { getNoiseTexture } from './noise'

/**
 * ENCOUNTERS — the things you find by going deeper.
 *
 * The universe had scale but no PROGRESSION. Two galaxies, two planets and a
 * black hole sat at fixed points and were visible for the entire journey, so
 * travelling further never revealed anything new. Depth existed; discovery did
 * not.
 *
 * This places a sequence of distinct celestial features along the flight path,
 * each a different KIND of thing, each waking as the camera comes into range
 * and dimming as it falls behind. The point is variety over distance: a belt of
 * asteroids, then a binary pair, then a globular cluster, then a pulsar — so
 * every stretch of scroll turns up something the visitor has not seen yet.
 *
 * They are concentrated in the DEEP SPACE half of the journey. The later
 * stations are reserved for the liquid-metal city, so the arc reads as
 * wilderness first, architecture second — and the derelict ring station is
 * placed last of all, as the first built thing you meet on the way in.
 *
 * PERFORMANCE
 * The world already carries a measured startup regression, so this is built to
 * add as little as possible:
 *
 *   - Encounters are plain geometry. No new shaders, no new textures, nothing
 *     that adds to the vendor bundle.
 *   - Each one is a single group whose `visible` flag is driven by proximity,
 *     so anything out of range costs one boolean per frame, not a draw call.
 *   - Fields of small bodies are InstancedMesh, so a belt of two hundred rocks
 *     is one draw call.
 *   - Counts are tier-aware and everything scales down together.
 */

/** Deterministic hash — a belt that reshuffles every reload is noise, not a place. */
const hash = (n, salt = 1) => {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/**
 * Where each encounter sits, expressed as a station float plus an offset from
 * the path. Placing them BETWEEN stations rather than at them is deliberate:
 * arriving at a section and finding something new is a coincidence, whereas
 * finding it on the way there is a journey.
 */
const ENCOUNTERS = [
  // The journey is staged so that nothing shows its whole hand at the start.
  // Each band introduces a new CLASS of thing, and the material weight builds:
  // light first, mass last. Placing a rock field beside the title, as this list
  // used to, spent the most physical objects in the world before the visitor
  // had finished reading the name.
  //
  //   0.0-1.4  intro          light, glass, cosmic - nothing physical
  //   1.4-2.6  deeper space   energy and distance
  //   2.6-3.9  worlds         planets, then crystal
  //   3.9-5.0  matter         stone, then built metal
  //   5.0-6.0  structure      the middle, where the black hole used to be
  //   6.0-7.0  deeper worlds  opening back out toward contact

  /* -- INTRO. Clean, spatial, luminous. The title has to be the heaviest thing
        on screen here, so everything in this band is weightless: stars, a dust
        veil, and one cool gas bloom well off-axis. No mass, no silhouettes
        cutting across the reading column. -- */
  { kind: 'cluster', at: 0.45, off: [-60, 18, -38], scale: 1.0, tint: '#cfe0f5' },
  { kind: 'dust', at: 0.85, off: [36, -8, -32], scale: 1.0, tint: '#9dc0e4' },
  { kind: 'nebula', at: 1.25, off: [68, 20, -54], scale: 0.95, tint: '#3f7fb5', outer: '#0a121c' },

  /* -- DEEPER UNIVERSE. Still weightless, but further out and more energetic,
        so distance starts to read as something being travelled into. -- */
  { kind: 'binary', at: 1.7, off: [46, 22, -34], scale: 1.0, tint: '#ffd9b8' },
  { kind: 'pulsar', at: 2.1, off: [-42, -18, -32], scale: 1.0, tint: '#ff8f9f' },
  { kind: 'dust', at: 2.4, off: [-32, 8, -34], scale: 1.0, tint: '#8fb6dd' },

  /* -- WORLDS. First solid bodies, then the crystal that bridges into matter. -- */
  { kind: 'moons', at: 2.8, off: [-38, -20, -28], scale: 1.0, tint: '#b8c6dd' },
  { kind: 'gasgiant', at: 3.2, off: [52, 20, -40], scale: 1.0, tint: '#7d93b8' },
  { kind: 'shards', at: 3.6, off: [-44, 12, -26], scale: 1.0, tint: '#9db3d4' },

  /* -- MATTER. The heavy band. Stone first, then the first clearly BUILT thing,
        so the shift from wilderness to architecture is foreshadowed rather than
        abrupt. -- */
  { kind: 'belt', at: 4.1, off: [-52, 14, -30], scale: 1.0, tint: '#8fa3c2' },
  { kind: 'derelict', at: 4.6, off: [44, 10, -36], scale: 1.2, tint: '#5d6a83' },

  /* -- THE MIDDLE. Stations 5-6 were left almost empty when the black hole that
        used to occupy exactly this stretch was removed, which is why the middle
        read as flat rather than deep. These fill it with distance cues rather
        than with light: gas, dust and stars placed far out, so the eye has
        something to measure the space against. -- */
  { kind: 'nebula', at: 5.1, off: [-78, 22, -56], scale: 1.0, tint: '#8e1f33' },
  { kind: 'cluster', at: 5.6, off: [62, -24, -38], scale: 1.0, tint: '#dfe7f2' },

  /* -- DEEPER WORLDS. Opening back out on the approach to contact. -- */
  { kind: 'dust', at: 6.1, off: [-30, 6, -34], scale: 1.0, tint: '#7d93b8' },
  { kind: 'nebula', at: 6.5, off: [70, 18, -50], scale: 0.9, tint: '#6d1730' },
  { kind: 'cluster', at: 6.9, off: [-66, 26, -40], scale: 0.85, tint: '#c9d6ea' },
]


/** World position for an encounter, interpolated along the station path. */
function positionFor(e) {
  const c = Math.max(0, Math.min(STATIONS.length - 1, e.at))
  const i = Math.floor(c)
  const j = Math.min(STATIONS.length - 1, i + 1)
  const t = c - i
  const a = STATIONS[i].position
  const b = STATIONS[j].position
  return [
    a[0] + (b[0] - a[0]) * t + e.off[0],
    a[1] + (b[1] - a[1]) * t + e.off[1],
    a[2] + (b[2] - a[2]) * t + e.off[2],
  ]
}

/* ------------------------------------------------------------- bodies ----- */

/** A belt of tumbling rocks. One InstancedMesh, so the whole belt is one call. */
function Belt({ count, tint }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const rocks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // A ring rather than a ball: belts read as belts because they are flat.
        angle: hash(i, 1) * Math.PI * 2,
        radius: 12 + hash(i, 2) * 16,
        y: (hash(i, 3) - 0.5) * 3.2,
        size: 0.25 + Math.pow(hash(i, 4), 2.4) * 1.6,
        spin: (hash(i, 5) - 0.5) * 0.4,
        speed: 0.02 + hash(i, 6) * 0.05,
      })),
    [count]
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !mesh.visible) return
    const { time } = scrollState()
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i]
      const a = r.angle + time * r.speed
      let bx = Math.cos(a) * r.radius
      let by = r.y
      const bz = Math.sin(a) * r.radius

      // A belt uses a tighter radius and lifts less than loose debris: heavier
      // bodies on established orbits should be harder to disturb. Different
      // profiles per object type are what stop the world feeling uniform.
      const inf = chargedInfluenceAt(bx, by, bz, 14)
      by += inf * 4.5

      dummy.position.set(bx, by, bz)
      dummy.rotation.set(time * r.spin + inf * 3, a * 1.3, time * r.spin * 0.6)
      dummy.scale.setScalar(r.size * (1 + inf * 0.35))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={tint} roughness={0.85} metalness={0.25} flatShading />
    </instancedMesh>
  )
}

/** Two stars orbiting a shared centre, one hot and one cool. */
function Binary({ tint }) {
  const groupRef = useRef()
  useFrame(() => {
    const g = groupRef.current
    if (!g || !g.visible) return
    g.rotation.y = scrollState().time * 0.05
  })
  return (
    <group ref={groupRef}>
      <mesh position={[6, 0, 0]}>
        <sphereGeometry args={[2.6, 20, 16]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      <mesh position={[-6, 0, 0]}>
        <sphereGeometry args={[1.7, 20, 16]} />
        <meshBasicMaterial color="#9fc4ff" toneMapped={false} />
      </mesh>
      <pointLight position={[6, 0, 0]} color={tint} intensity={40} distance={90} decay={2} />
    </group>
  )
}

/** A small family of icy bodies, tidally locked to nothing in particular. */
function Moons({ tint }) {
  const groupRef = useRef()
  useFrame(() => {
    const g = groupRef.current
    if (!g || !g.visible) return
    const { time } = scrollState()
    g.children.forEach((c, i) => {
      const a = time * (0.04 + i * 0.015) + i * 2.1
      c.position.set(Math.cos(a) * (7 + i * 5), Math.sin(a * 0.6) * 3, Math.sin(a) * (7 + i * 5))
      c.rotation.y = time * 0.05
    })
  })
  return (
    <group ref={groupRef}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[1.4 + i * 0.7, 20, 14]} />
          <meshStandardMaterial color={tint} roughness={0.95} metalness={0.05} />
        </mesh>
      ))}
    </group>
  )
}

/** A broken ring station — the one clearly artificial thing out here. */
function Derelict({ tint }) {
  const groupRef = useRef()
  useFrame(() => {
    const g = groupRef.current
    if (!g || !g.visible) return
    const { time } = scrollState()
    // Tumbling slowly on two axes: nothing is maintaining its attitude.
    g.rotation.set(0.4 + time * 0.008, time * 0.02, 0.25 + time * 0.004)
  })
  return (
    <group ref={groupRef}>
      {/* An arc, not a full ring — the gap is what makes it read as wreckage. */}
      <mesh>
        <torusGeometry args={[14, 0.9, 8, 48, Math.PI * 1.45]} />
        <meshStandardMaterial color={tint} metalness={0.85} roughness={0.4} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.6) * 14, Math.sin(i * 1.6) * 14, 0]}>
          <boxGeometry args={[2.2, 1.1, 3.4]} />
          <meshStandardMaterial color={tint} metalness={0.8} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

const clusterVertex = /* glsl */ `
  attribute float size;
  uniform float uPixelRatio;
  varying float vSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vSize = size;
    gl_PointSize = clamp(size * (90.0 / max(-mv.z, 1.0)), 0.7, 4.0) * uPixelRatio;
  }
`

const clusterFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vSize;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // Tight core plus a faint halo — the halo is what the bloom pass turns
    // into a star rather than a lit pixel.
    float core = smoothstep(0.3, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.28;
    gl_FragColor = vec4(uColor, (core + halo) * 0.75);
  }
`

/** A globular cluster: a dense ball of unresolved stars. */
function Cluster({ count, tint }) {
  const matRef = useRef()
  const { positions, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Concentrated core, sparse halo — the defining shape of a globular.
      const r = Math.pow(hash(i, 7), 2.6) * 18
      const theta = hash(i, 8) * Math.PI * 2
      const phi = Math.acos(2 * hash(i, 9) - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      sizes[i] = 1 + Math.pow(hash(i, 10), 3) * 3
    }
    return { positions, sizes }
  }, [count])

  const clusterUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(tint) }, uPixelRatio: { value: 1 } }),
    [tint]
  )

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uPixelRatio.value = state.viewport.dpr || 1
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      {/* Custom shader rather than PointsMaterial.
          THREE.PointsMaterial with no map draws SQUARE sprites — that is what
          made the cluster read as a grid of blocks rather than as stars, and
          why it looked like a rendering fault. Every other point system in
          this world already uses a circular discard; this one was the
          exception. */}
      <shaderMaterial
        ref={matRef}
        uniforms={clusterUniforms}
        vertexShader={clusterVertex}
        fragmentShader={clusterFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/** A pulsar: a small hot core with two sweeping beams. */
function Pulsar({ tint }) {
  const groupRef = useRef()
  const coreRef = useRef()
  useFrame(() => {
    const g = groupRef.current
    if (!g || !g.visible) return
    const { time } = scrollState()
    // Fast rotation is the whole identity of the object.
    g.rotation.y = time * 1.4
    g.rotation.z = 0.5
    if (coreRef.current) {
      coreRef.current.scale.setScalar(1 + Math.sin(time * 6) * 0.08)
    }
  })
  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {[1, -1].map((dir) => (
        <mesh key={dir} position={[0, dir * 11, 0]} scale={[1, dir, 1]}>
          <coneGeometry args={[2.6, 20, 16, 1, true]} />
          <meshBasicMaterial
            color={tint}
            transparent
            opacity={0.16}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight color={tint} intensity={30} distance={70} decay={2} />
    </group>
  )
}

/** A drift of angular crystal shards catching the light. */
function Shards({ count, tint }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        pos: [
          (hash(i, 11) - 0.5) * 40,
          (hash(i, 12) - 0.5) * 26,
          (hash(i, 13) - 0.5) * 40,
        ],
        scale: [
          0.4 + hash(i, 14) * 0.9,
          1.6 + hash(i, 15) * 4.5,
          0.4 + hash(i, 16) * 0.9,
        ],
        spin: (hash(i, 17) - 0.5) * 0.25,
        phase: hash(i, 18) * Math.PI * 2,
      })),
    [count]
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !mesh.visible) return
    const { time } = scrollState()
    for (let i = 0; i < items.length; i++) {
      const s = items[i]
      dummy.position.set(s.pos[0], s.pos[1] + Math.sin(time * 0.2 + s.phase) * 1.4, s.pos[2])
      dummy.rotation.set(s.phase, s.phase + time * s.spin, s.phase * 0.5)
      dummy.scale.set(...s.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={tint} metalness={0.95} roughness={0.15} flatShading />
    </instancedMesh>
  )
}

/** A banded gas giant with a tilted ring and a shepherd moon. */
function GasGiant({ tint }) {
  const bodyRef = useRef()
  useFrame(() => {
    if (bodyRef.current?.visible) bodyRef.current.rotation.y = scrollState().time * 0.02
  })
  return (
    <group>
      <mesh ref={bodyRef}>
        <sphereGeometry args={[13, 40, 28]} />
        <meshStandardMaterial color="#1c2430" roughness={0.9} metalness={0.05} emissive={tint} emissiveIntensity={0.18} />
      </mesh>
      <mesh rotation={[Math.PI / 2.5, 0.3, 0]}>
        <ringGeometry args={[18, 27, 96]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[31, 4, 0]}>
        <sphereGeometry args={[1.6, 16, 12]} />
        <meshStandardMaterial color="#a8b4c8" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* -------------------------------------------------------- floating field -- */

/**
 * The stuff that is simply everywhere.
 *
 * Anchored to the camera's own depth and wrapped, so the field is effectively
 * infinite — the rig can travel the whole path and never run out of things
 * drifting past. Deliberately varied in size and slow: this is texture between
 * the encounters, not an event of its own.
 */
function FloatingField({ count }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const SLAB = 260

  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: hash(i, 19) * Math.PI * 2,
        radius: 18 + Math.pow(hash(i, 20), 0.6) * 90,
        offset: hash(i, 21),
        speed: 0.004 + hash(i, 22) * 0.012,
        size: 0.3 + Math.pow(hash(i, 23), 3) * 3.4,
        spin: (hash(i, 24) - 0.5) * 0.3,
        yBias: (hash(i, 25) - 0.5) * 60,
      })),
    [count]
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const { time, station } = scrollState()
    const camZ = state.camera.position.z

    // These are metal fragments, so they belong to the MATTER band, not to
    // the intro. Anchored to the camera, they would otherwise travel with it
    // and put mass over the title from the very first frame.
    //
    // The early journey is NOT emptied, though: distant bits stay, at reduced
    // scale. Motion is what makes the opening feel alive, and killing the
    // layer outright trades a busy frame for a dead one. Only the near, large
    // fragments — the ones that read as physical objects rather than as
    // parallax — wait for the band where matter is the subject.
    const arrived = THREE.MathUtils.smoothstep(station, 3.4, 4.4)

    for (let i = 0; i < bits.length; i++) {
      const b = bits[i]
      const distant = THREE.MathUtils.smoothstep(b.radius, 34, 70)
      const presence = arrived + (1 - arrived) * distant * 0.28
      const travel = (b.offset + time * b.speed) % 1
      let px = Math.cos(b.angle) * b.radius
      let py = Math.sin(b.angle) * b.radius * 0.45 + b.yBias
      const pz = camZ - SLAB + travel * SLAB

      // LOCAL RESPONSE. Only bodies inside the field's radius move, and the
      // closer they are the more they lift — so the effect reads as something
      // acting on a patch of the world rather than the whole scene sliding
      // whenever the pointer twitches.
      const inf = chargedInfluenceAt(px, py, pz, 26)
      let spin = time * b.spin
      if (inf > 0.001) {
        // Rise, and swing around the cursor rather than straight at it: a
        // direct pull reads as snapping, an orbit reads as being caught.
        const dx = px - cursorField.position.x
        const dz = pz - cursorField.position.z
        const swing = Math.atan2(dz, dx) + inf * 1.2
        const dist = Math.hypot(dx, dz)
        px = cursorField.position.x + Math.cos(swing) * dist
        py += inf * 9
        spin += inf * 4
      }

      dummy.position.set(px, py, pz)
      dummy.rotation.set(b.angle + spin, b.angle * 1.7, spin * 0.5)
      // Charged bodies swell slightly — energy, not just displacement.
      dummy.scale.setScalar(b.size * (1 + inf * 0.5) * presence)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#39435a" metalness={0.7} roughness={0.55} flatShading />
    </instancedMesh>
  )
}


/* ------------------------------------------------------------- nebula ----- */

const nebulaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nebulaFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uInner;
  uniform vec3 uOuter;

  void main() {
    // Two samples drifting against each other so the gas churns rather than
    // scrolls. One sample alone always reads as a moving texture.
    vec2 a = vUv * 1.15 + vec2(uTime * 0.0028, uTime * 0.0013) + uSeed;
    vec2 b = vUv * 2.1 - vec2(uTime * 0.0019, -uTime * 0.0009) + uSeed * 1.6;
    float n = texture2D(uNoise, a).r * 0.62 + texture2D(uNoise, b).r * 0.48;

    float r = length(vUv - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.05, r);
    // Contrasted into wisps. A flat cloud reads as fog on the lens; wisps read
    // as something with structure at a distance.
    float wisp = smoothstep(0.44, 0.96, n) * falloff;

    vec3 col = mix(uOuter, uInner, smoothstep(0.38, 0.9, n));
    gl_FragColor = vec4(col, wisp * uOpacity);
  }
`

/**
 * A faint crimson gas bloom.
 *
 * This is the main thing lifting the middle of the journey out of blackness.
 * It works by ADDING structure at distance rather than by raising brightness:
 * the opacity ceiling is deliberately low, so it reads as depth in the dark
 * rather than as a red wash over the frame. A flat overlay would have been far
 * easier and would have destroyed the contrast the rest of the world depends
 * on.
 */
function Nebula({ tint, outer, noise }) {
  const meshRef = useRef()
  const seed = useMemo(() => Math.random() * 10, [])

  const uniforms = useMemo(
    () => ({
      uNoise: { value: noise },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: 0 },
      uInner: { value: new THREE.Color(tint) },
      // Defaults to a dark maroon so crimson blooms stay inside the brand's
      // colour language, but the intro passes a cool near-black instead: a
      // blue gas cloud fading through maroon reads as dirty, not as distance.
      uOuter: { value: new THREE.Color(outer || '#160a12') },
    }),
    [noise, seed, tint, outer]
  )

  useFrame((state) => {
    const m = meshRef.current
    if (!m || !m.visible) return
    const { time, energy } = scrollState()
    m.quaternion.copy(state.camera.quaternion)
    const u = m.material.uniforms
    u.uTime.value = time
    // Breathing, and a small lift on interaction so the field feels connected
    // to the rest of the world rather than painted on behind it.
    u.uOpacity.value = (0.11 + 0.035 * Math.sin(time * 0.09 + seed)) * (1 + energy * 0.3)
  })

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-450}>
      <planeGeometry args={[150, 150]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={nebulaVertex}
        fragmentShader={nebulaFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </mesh>
  )
}

/* --------------------------------------------------------------- dust ----- */

const dustVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFade;
  void main() {
    vec3 p = position;
    // Barely-there drift. Cosmic dust should register as texture, never as
    // motion the eye can follow.
    p.x += sin(uTime * 0.05 + aPhase) * 2.4;
    p.y += cos(uTime * 0.04 + aPhase * 1.7) * 1.8;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vFade = 0.5 + 0.5 * sin(uTime * 0.2 + aPhase * 3.0);
    gl_PointSize = clamp(aSize * (70.0 / max(-mv.z, 1.0)), 0.6, 2.6) * uPixelRatio;
  }
`

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vFade * 0.3);
  }
`

/** A wide, sparse veil of cosmic dust — texture in the empty middle distance. */
function Dust({ count, tint }) {
  const matRef = useRef()

  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (hash(i, 31) - 0.5) * 150
      positions[i * 3 + 1] = (hash(i, 32) - 0.5) * 80
      positions[i * 3 + 2] = (hash(i, 33) - 0.5) * 150
      sizes[i] = 0.5 + Math.pow(hash(i, 34), 2.5) * 2.2
      phases[i] = hash(i, 35) * 6.283
    }
    return { positions, sizes, phases }
  }, [count])

  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 }, uColor: { value: new THREE.Color(tint) } }),
    [tint]
  )

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = scrollState().time
    m.uniforms.uPixelRatio.value = state.viewport.dpr || 1
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-aPhase" count={count} array={phases} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </points>
  )
}

/* ------------------------------------------------------------------ root -- */
/* ------------------------------------------------------------ assembly ---- */

function Encounter({ spec, tier }) {
  const groupRef = useRef()
  const position = useMemo(() => positionFor(spec), [spec])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const { station } = scrollState()
    // Wakes about a station out, holds while alongside, sleeps behind. Out of
    // range it costs one boolean per frame rather than a draw call.
    const near = clamp01(1 - Math.abs(station - spec.at) / 1.6)
    g.visible = near > 0.02
    if (g.visible) {
      const s = spec.scale * (0.6 + near * 0.4)
      g.scale.setScalar(s)
    }
  })

  const body = (() => {
    switch (spec.kind) {
      case 'belt':
        return <Belt count={tier.beltRocks} tint={spec.tint} />
      case 'binary':
        return <Binary tint={spec.tint} />
      case 'moons':
        return <Moons tint={spec.tint} />
      case 'derelict':
        return <Derelict tint={spec.tint} />
      case 'cluster':
        return <Cluster count={tier.clusterStars} tint={spec.tint} />
      case 'pulsar':
        return <Pulsar tint={spec.tint} />
      case 'shards':
        return <Shards count={tier.shardCount} tint={spec.tint} />
      case 'gasgiant':
        return <GasGiant tint={spec.tint} />
      case 'nebula':
        return <Nebula tint={spec.tint} outer={spec.outer} noise={getNoiseTexture()} />
      case 'dust':
        return <Dust count={tier.dustVeil} tint={spec.tint} />
      default:
        return null
    }
  })()

  return (
    <group ref={groupRef} position={position} visible={false}>
      {body}
    </group>
  )
}

const Encounters = ({ tier }) => (
  <group>
    {ENCOUNTERS.map((spec, i) => (
      <Encounter key={i} spec={spec} tier={tier} />
    ))}
    <FloatingField count={tier.floaters} />
  </group>
)

export default Encounters
