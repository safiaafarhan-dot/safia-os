import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { chargedInfluenceAt } from './cursorFieldState'
import { pushOutOfColumn, safeZone } from './safeZone'

/**
 * THE HERO STRUCTURE — one assembly, not fifty.
 *
 * A single dimensional structure in the midground that gathers itself out of
 * loose particles, holds while energy runs through it, then comes apart and
 * returns to the environment. It is the only scripted event in the opening, and
 * that is the point: one thing worth watching beats a field of things moving.
 *
 * THE CYCLE (about 26 seconds, then repeats with a new orientation):
 *
 *   0.00-0.22  gather     scattered shards drift inward and slow
 *   0.22-0.34  align      they rotate into their places on the shell
 *   0.34-0.62  hold       assembled; a pulse of energy travels through it
 *   0.62-0.78  release    the shell loosens and the shards drift apart
 *   0.78-1.00  disperse   they return to the environment and idle
 *
 * Two details do most of the work:
 *
 *   1. EASING PER PHASE, not one curve across the whole cycle. Gathering eases
 *      out (fast then settling, like something arriving), releasing eases in
 *      (reluctant then sudden). A single smoothstep for both makes assembly and
 *      disassembly look like the same animation played backwards, which reads
 *      as a loop rather than as an event.
 *
 *   2. THE SHELL IS NOT A SPHERE. Shard homes are taken from an icosahedron's
 *      vertices, each pushed out along its own normal and given a facing, so
 *      the assembled form has flat planes catching different lights instead of
 *      a ball of fragments.
 *
 * It lives in the hero and the first sections only, and is placed on the side
 * of frame away from the text.
 */

const CYCLE = 26
const SHARDS = 14

const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeIn = (t) => t * t * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Progress through a phase of the cycle, 0..1. */
const phase = (t, a, b) => clamp01((t - a) / (b - a))

const coreVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const coreFragment = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  uniform vec3 uColor;
  uniform float uStrength;

  void main() {
    // Fresnel only: bright at grazing angles, invisible face-on. That is what
    // makes a shape read as a shell of glass rather than as a solid ball.
    float f = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), 2.4);
    gl_FragColor = vec4(uColor * (0.6 + f * 2.4), f * uStrength);
  }
`

export default function GlassAssembly({ reducedMotion = false }) {
  const groupRef = useRef()
  const shellRef = useRef()
  const coreRef = useRef()
  const lightRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const anchor = useMemo(() => new THREE.Vector3(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  // Shard homes: icosahedron vertices, pushed out along their own direction.
  const shards = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const pos = geo.attributes.position
    const seen = new Map()
    const verts = []
    for (let i = 0; i < pos.count && verts.length < SHARDS; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i)
      const key = `${v.x.toFixed(2)}|${v.y.toFixed(2)}|${v.z.toFixed(2)}`
      if (seen.has(key)) continue
      seen.set(key, true)
      verts.push(v)
    }
    geo.dispose()

    return verts.map((v, i) => ({
      home: v.clone().normalize().multiplyScalar(2.3),
      normal: v.clone().normalize(),
      // Where it waits between assemblies. Wide enough that the gather is a
      // real journey, close enough that the shards never leave frame.
      rest: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 13,
        (Math.random() - 0.5) * 18
      ),
      size: 0.26 + Math.random() * 0.26,
      spin: (Math.random() - 0.5) * 1.6,
      seed: i / SHARDS,
    }))
  }, [])

  const coreUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color('#63dcff') }, uStrength: { value: 0 } }),
    []
  )

  useFrame((state, delta) => {
    const g = groupRef.current
    const shell = shellRef.current
    if (!g || !shell) return
    const { time, station } = scrollState()

    // Hero and the first sections only. Beyond that the journey has other
    // subjects and a repeating set piece would start to feel like a loop.
    const present = 1 - THREE.MathUtils.smoothstep(station, 1.9, 3.1)
    if (present <= 0.001) {
      if (g.visible) g.visible = false
      return
    }
    g.visible = true

    // ---- park it opposite the text -------------------------------------
    // Anchored to the camera so it holds its place in frame as the rig
    // travels, and biased to whichever side of the reading column has room.
    const cam = state.camera
    const toRight = safeZone.right < 0.35
    scratch.set(toRight ? 12 : -12, -6.0, -40).applyMatrix4(cam.matrixWorld)
    pushOutOfColumn(scratch.x, scratch.y, scratch.z, anchor, 1, 260, 5)
    // Eased so the structure trails the camera slightly instead of being
    // welded to it, which is what keeps it feeling like a thing in the world
    // rather than an overlay.
    if (g.position.lengthSq() === 0) g.position.copy(anchor)
    else g.position.lerp(anchor, 1 - Math.exp(-1.6 * Math.min(0.05, delta)))

    // ---- where in the cycle are we -------------------------------------
    const cycle = reducedMotion ? 0.48 : (time % CYCLE) / CYCLE
    const gather = easeOut(phase(cycle, 0.0, 0.22))
    const align = easeOut(phase(cycle, 0.22, 0.34))
    const release = easeIn(phase(cycle, 0.62, 0.78))
    // 0 dispersed, 1 fully assembled.
    const built = clamp01(gather * 0.85 + align * 0.15 - release)

    // Each cycle turns the finished structure a little, so the repeat is a
    // variation rather than a replay.
    const era = Math.floor(time / CYCLE)
    g.rotation.y = era * 1.13 + time * 0.045
    g.rotation.x = Math.sin(era * 2.7) * 0.3

    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i]
      // Stagger so shards arrive in sequence rather than as one block.
      const lead = clamp01(built * 1.35 - sh.seed * 0.35)

      scratch.copy(sh.rest).lerp(sh.home, lead)
      // Idle drift while dispersed, fading out as the shard takes its place.
      const idle = 1 - lead
      scratch.x += Math.sin(time * 0.3 + sh.seed * 9) * 1.5 * idle
      scratch.y += Math.cos(time * 0.24 + sh.seed * 7) * 1.2 * idle

      // The cursor disturbs loose shards but cannot pull the assembled form
      // apart -- the structure has to stay readable as one object.
      const inf = reducedMotion ? 0 : chargedInfluenceAt(
        g.position.x + scratch.x, g.position.y + scratch.y, g.position.z + scratch.z, 22
      ) * idle
      scratch.y += inf * 4

      dummy.position.copy(scratch)
      // Tumbling when loose, facing outward when placed.
      const tumble = time * sh.spin * (0.4 + idle)
      dummy.rotation.set(tumble * 0.6, tumble, tumble * 0.3)
      dummy.scale.setScalar(sh.size * present * (0.75 + lead * 0.25))
      dummy.updateMatrix()
      shell.setMatrixAt(i, dummy.matrix)
    }
    shell.instanceMatrix.needsUpdate = true

    // ---- the core, and the energy that runs through it -------------------
    const hold = phase(cycle, 0.34, 0.62)
    // A single pulse crossing the structure while it is assembled.
    const pulse = Math.sin(hold * Math.PI) * Math.max(0, Math.sin(hold * Math.PI * 3))
    if (coreRef.current) {
      const k = built * present
      coreRef.current.scale.setScalar(2.0 * k)
      coreUniforms.uStrength.value = k * (0.35 + pulse * 0.65)
    }
    if (lightRef.current) {
      lightRef.current.intensity = built * present * (5 + pulse * 14)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <instancedMesh ref={shellRef} args={[undefined, undefined, SHARDS]} frustumCulled={false}>
        <tetrahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial
          color="#1a3346"
          metalness={0.1}
          roughness={0.03}
          envMapIntensity={3.6}
          emissive="#2f8fb8"
          emissiveIntensity={1.6}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </instancedMesh>

      {/* The shell of light the shards enclose once assembled. */}
      <mesh ref={coreRef} scale={0}>
        <icosahedronGeometry args={[1, 2]} />
        <shaderMaterial
          uniforms={coreUniforms}
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>

      <pointLight ref={lightRef} color="#63dcff" intensity={0} distance={38} decay={2} />
    </group>
  )
}
