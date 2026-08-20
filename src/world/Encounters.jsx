import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS } from './stations'

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
  { kind: 'belt', at: 0.55, off: [-52, 14, -30], scale: 1.0, tint: '#8fa3c2' },
  { kind: 'binary', at: 0.95, off: [46, 22, -34], scale: 1.0, tint: '#ffd9b8' },
  { kind: 'moons', at: 1.35, off: [-38, -20, -28], scale: 1.0, tint: '#b8c6dd' },
  { kind: 'cluster', at: 1.75, off: [-56, 18, -30], scale: 1.0, tint: '#ffe6c4' },
  { kind: 'gasgiant', at: 2.15, off: [52, 20, -40], scale: 1.0, tint: '#c98a4b' },
  { kind: 'pulsar', at: 2.55, off: [40, -18, -32], scale: 1.0, tint: '#ff8f9f' },
  { kind: 'shards', at: 2.95, off: [-44, 12, -26], scale: 1.0, tint: '#9db3d4' },
  // The derelict sits last, on the approach to the city: the first clearly
  // BUILT thing out here, so the transition from wilderness to architecture is
  // foreshadowed rather than abrupt.
  { kind: 'derelict', at: 3.45, off: [44, 10, -36], scale: 1.2, tint: '#5d6a83' },
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
      dummy.position.set(Math.cos(a) * r.radius, r.y, Math.sin(a) * r.radius)
      dummy.rotation.set(time * r.spin, a * 1.3, time * r.spin * 0.6)
      dummy.scale.setScalar(r.size)
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

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        color={tint}
        size={1.6}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
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
        <meshStandardMaterial color="#3a2a1c" roughness={0.9} metalness={0.05} emissive={tint} emissiveIntensity={0.18} />
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
    const { time } = scrollState()
    const camZ = state.camera.position.z

    for (let i = 0; i < bits.length; i++) {
      const b = bits[i]
      const travel = (b.offset + time * b.speed) % 1
      dummy.position.set(
        Math.cos(b.angle) * b.radius,
        Math.sin(b.angle) * b.radius * 0.45 + b.yBias,
        camZ - SLAB + travel * SLAB
      )
      dummy.rotation.set(b.angle + time * b.spin, b.angle * 1.7, time * b.spin * 0.5)
      dummy.scale.setScalar(b.size)
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
