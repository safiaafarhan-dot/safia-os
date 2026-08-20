import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { chargedInfluenceAt, cursorField } from './cursorFieldState'
import { nearFieldsSuppressed, pushOutOfColumn } from './safeZone'

const WHITE = new THREE.Color('#ffffff')
const NO_RAYCAST = () => null

/**
 * CRYSTALLINE / GLASS FRAGMENTS — the foreground layer of the early journey.
 *
 * The first three sections had depth but no near layer: stars and gas far out,
 * text in front, and nothing in between to establish that the camera is inside
 * a volume. These are that missing layer — angular shards of glass drifting
 * close to the lens, catching the cyan and crimson sources as they turn.
 *
 * They are NOT the metal fragments from the matter band wearing a new colour.
 * Two things make them read as glass rather than as rock:
 *
 *   1. Two passes per shard. A solid, near-transparent body carrying the
 *      environment's reflections, and an additive wireframe of the same
 *      geometry sitting exactly on top of it. The wireframe is what supplies
 *      the emissive edge — a lit facet reads as a surface, a lit EDGE reads as
 *      something with a refractive index.
 *
 *   2. Real transmission is deliberately avoided. MeshPhysicalMaterial's
 *      `transmission` requires a scene backbuffer resolve per frame, which on
 *      an always-on background canvas is an enormous price for a handful of
 *      shards. Low roughness plus a strong env map plus a bright edge gets
 *      most of the way there for effectively nothing.
 *
 * They live in the intro bands and fade out as the matter band takes over, so
 * the journey hands off from glass to stone rather than showing both at once.
 */

const edgeVertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aScale;
  attribute vec3 aTint;
  varying vec3 vTint;
  varying float vFade;
  varying float vGlow;
  uniform float uFade;
  uniform float uPulse;

  void main() {
    vTint = aTint;
    vFade = uFade;
    // Each shard breathes on its own phase, so the field shimmers slowly
    // instead of pulsing as one object.
    vGlow = 0.45 + 0.45 * sin(uPulse + aScale * 9.0);
    vec3 p = position * aScale + aOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const edgeFragment = /* glsl */ `
  varying vec3 vTint;
  varying float vFade;
  varying float vGlow;
  void main() {
    // Over-driven on purpose. The bloom pass keys off luminance, so an edge
    // has to exceed 1.0 to be picked up -- at 0.8 these were drawn but never
    // bloomed, which is why the layer read as grey wireframe rather than as
    // lit glass.
    gl_FragColor = vec4(vTint * (1.7 + vGlow), 0.85 * vFade);
  }
`

export default function Crystals({ count = 46, reducedMotion = false }) {
  const bodyRef = useRef()
  const edgeRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const safe = useMemo(() => new THREE.Vector3(), [])
  const tintScratch = useMemo(() => new THREE.Color(), [])

  // Cyan leads, violet supports, crimson appears rarely. Weighting the palette
  // here rather than tinting the whole layer one colour is what keeps a drift
  // of shards from reading as a single neon prop.
  const PALETTE = useMemo(
    () => [
      new THREE.Color('#5fd6f5'),
      new THREE.Color('#5fd6f5'),
      new THREE.Color('#7ea8ff'),
      new THREE.Color('#a874f0'),
      new THREE.Color('#e8556f'),
    ],
    []
  )

  const shards = useMemo(() => {
    const out = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      out.push({
        angle,
        // Held off the flight axis: a shard through the middle of frame is a
        // smear on the lens, not depth.
        // Pushed further out and spread wider. The first pass clustered them
        // close to the lens where they crowded the lower half of frame.
        radius: 15 + Math.pow(Math.random(), 0.7) * 34,
        yBias: (Math.random() - 0.5) * 30,
        offset: Math.random(),
        speed: 0.012 + Math.random() * 0.03,
        size: 0.24 + Math.pow(Math.random(), 2.4) * 0.95,
        spin: (Math.random() - 0.5) * 0.22,
        phase: Math.random() * Math.PI * 2,
        tint: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      })
    }
    return out
  }, [count, PALETTE])

  // Per-instance attributes for the additive edge pass. These never change, so
  // they are written once at build rather than per frame.
  const { edgeGeometry, edgeUniforms } = useMemo(() => {
    const base = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1, 0))
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.attributes.position = base.attributes.position
    geo.instanceCount = count

    const offsets = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const tints = new Float32Array(count * 3)
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3))
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1))
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))

    return {
      edgeGeometry: geo,
      edgeUniforms: { uFade: { value: 0 }, uPulse: { value: 0 } },
    }
  }, [count])

  useFrame((state) => {
    const body = bodyRef.current
    if (!body) return
    const { time, station } = scrollState()
    const camZ = state.camera.position.z

    // Dominant through the first three sections, then thinned to a remnant
    // rather than removed. The handover from glass to stone still reads -- the
    // layer drops to 30% as the matter band arrives -- but every later section
    // keeps a few shards catching the light, so nowhere on the journey is
    // without a foreground.
    const fade = 1 - THREE.MathUtils.smoothstep(station, 2.9, 4.0) * 0.7
    const shrink = nearFieldsSuppressed() ? 0.45 : 1
    if (fade <= 0.001) {
      if (body.visible) {
        body.visible = false
        if (edgeRef.current) edgeRef.current.visible = false
      }
      return
    }
    body.visible = true
    if (edgeRef.current) edgeRef.current.visible = true

    const offsets = edgeGeometry.attributes.aOffset
    const scales = edgeGeometry.attributes.aScale
    const tints = edgeGeometry.attributes.aTint
    const SLAB = 150

    for (let i = 0; i < shards.length; i++) {
      const c = shards[i]
      const travel = (c.offset + time * c.speed) % 1
      let px = Math.cos(c.angle) * c.radius
      let py = Math.sin(c.angle) * c.radius * 0.5 + c.yBias
      const pz = camZ - SLAB + travel * SLAB

      // Cursor response. Same field the rest of the world reads, so a shard
      // lifting near the pointer and a distant fragment drifting are visibly
      // the same force acting at different strengths.
      const inf = reducedMotion ? 0 : chargedInfluenceAt(px, py, pz, 24)
      let spin = time * c.spin + c.phase
      if (inf > 0.001) {
        const dx = px - cursorField.position.x
        const dz = pz - cursorField.position.z
        const swing = Math.atan2(dz, dx) + inf * 0.9
        const dist = Math.hypot(dx, dz)
        px = cursorField.position.x + Math.cos(swing) * dist
        py += inf * 6
        spin += inf * 2.5
      }

      // Slow independent tumble, so the layer is never still.
      const bob = Math.sin(time * 0.25 + c.phase) * 0.9

      pushOutOfColumn(px, py + bob, pz, safe, 1, undefined, c.size * 1.6)

      const s = c.size * (1 + inf * 0.45) * fade * shrink
      dummy.position.copy(safe)
      dummy.rotation.set(spin * 0.7, spin, spin * 0.4)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)

      offsets.array[i * 3] = safe.x
      offsets.array[i * 3 + 1] = safe.y
      offsets.array[i * 3 + 2] = safe.z
      scales.array[i] = s
      // Charged shards bias toward white — energy reads as the edge going hot,
      // which is a far cheaper and more legible cue than changing the body.
      tintScratch.copy(c.tint).lerp(WHITE, inf * 0.5)
      tints.array[i * 3] = tintScratch.r
      tints.array[i * 3 + 1] = tintScratch.g
      tints.array[i * 3 + 2] = tintScratch.b
    }

    body.instanceMatrix.needsUpdate = true
    offsets.needsUpdate = true
    scales.needsUpdate = true
    tints.needsUpdate = true
    edgeUniforms.uFade.value = fade
    edgeUniforms.uPulse.value = time * 0.5
  })

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        {/* Glass, not metal: no diffuse colour to speak of, very low roughness
            so the environment map does the work, and a faint cool emissive so a
            shard never goes fully dark when it turns away from every source. */}
        {/* Mostly transparent on purpose. At 0.72 opacity over a dark body
            these read as black solids -- silhouettes, which is exactly what
            glass is not. The body is now a faint tinted pane that catches the
            environment, and the EDGES carry the shape. */}
        <meshStandardMaterial
          color="#16283a"
          metalness={0.1}
          roughness={0.04}
          envMapIntensity={3.4}
          emissive="#2c86ad"
          emissiveIntensity={1.9}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </instancedMesh>

      {/* The emissive edges. Additive, so they bloom rather than paint. */}
      <lineSegments ref={edgeRef} geometry={edgeGeometry} frustumCulled={false} visible={false} raycast={NO_RAYCAST}>
        <shaderMaterial
          uniforms={edgeUniforms}
          vertexShader={edgeVertex}
          fragmentShader={edgeFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </lineSegments>
    </group>
  )
}

