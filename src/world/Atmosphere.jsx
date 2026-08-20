import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS, STATION_SPACING, WORLD_DEPTH } from './stations'

/**
 * The living environment the camera flies through.
 *
 * Everything in here moves on its own, forever, with no input — the brief is a
 * laboratory that is running whether or not anyone is watching it. The motion
 * is deliberately slow and low-contrast: this is depth and atmosphere, not
 * decoration, and it must never compete with the text sitting in front of it.
 *
 * All continuous motion is computed in vertex shaders from a single uTime
 * uniform. Animating tens of thousands of particles by writing to a
 * Float32Array each frame is what makes background particle systems expensive;
 * driving them from a uniform costs one number per frame regardless of count.
 */

const DUST_SLAB = 90 // depth of the particulate volume that follows the camera

/* ---------------------------------------------------------------- dust ---- */

const dustVertex = /* glsl */ `
  attribute float aSpeed;
  attribute float aSize;
  attribute float aPhase;

  uniform float uTime;
  uniform float uCamZ;
  uniform float uSlab;
  uniform vec2  uPointer;
  uniform float uEnergy;

  varying float vAlpha;
  varying float vDepth;

  void main() {
    // Stream the mote toward the camera and wrap it back to the far edge of
    // the slab. Because the slab is anchored to uCamZ, the field is infinite:
    // the camera can travel the whole corridor and never outrun it.
    float travel = mod(aPhase + uTime * aSpeed, 1.0);
    float zRel = travel * uSlab;

    vec3 pos = position;
    pos.z = uCamZ - uSlab + zRel;

    // Nearer motes swing further with the cursor, which is the parallax cue
    // that sells the volume as something the camera is actually inside of.
    float near = 1.0 - travel;
    pos.x += uPointer.x * near * 2.2;
    pos.y += uPointer.y * near * 1.4;

    // Energy stirs the field laterally rather than speeding it up, so
    // interaction reads as disturbance instead of fast-forward.
    pos.x += sin(uTime * 0.6 + aPhase * 40.0) * uEnergy * 0.5;
    pos.y += cos(uTime * 0.5 + aPhase * 33.0) * uEnergy * 0.35;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Fade in at the far edge and out as it passes the camera, so motes never
    // pop into or out of existence.
    vAlpha = smoothstep(0.0, 0.18, travel) * smoothstep(1.0, 0.72, travel);
    vDepth = travel;

    gl_PointSize = aSize * (300.0 / max(-mv.z, 1.0)) * (1.0 + uEnergy * 0.3);
  }
`

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uEnergy;

  varying float vAlpha;
  varying float vDepth;

  void main() {
    // Round, soft-edged mote. Discarding outside the disc keeps the sprite
    // from reading as a square at large point sizes.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.06, d);

    // A minority of motes carry the station accent, so the field picks up the
    // colour of wherever the camera currently is without turning into confetti.
    vec3 col = mix(uColor, uAccent, step(0.86, vDepth) * (0.5 + uEnergy * 0.5));

    gl_FragColor = vec4(col, soft * vAlpha * 0.55);
  }
`

function DustField({ count, quality }) {
  const matRef = useRef()

  const { positions, speeds, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Hollow-ish distribution: keep the very centre of the corridor clear so
      // motes don't crawl across the reader's text.
      const angle = Math.random() * Math.PI * 2
      const radius = 3.2 + Math.pow(Math.random(), 0.65) * 16
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.sin(angle) * radius * 0.55
      positions[i * 3 + 2] = 0 // z is authored entirely in the shader
      speeds[i] = 0.012 + Math.random() * 0.05
      sizes[i] = (0.6 + Math.random() * 2.4) * quality
      phases[i] = Math.random()
    }
    return { positions, speeds, sizes, phases }
  }, [count, quality])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCamZ: { value: 0 },
      uSlab: { value: DUST_SLAB },
      uPointer: { value: new THREE.Vector2() },
      uEnergy: { value: 0 },
      uColor: { value: new THREE.Color('#8f9099') },
      uAccent: { value: new THREE.Color('#b3122e') },
    }),
    []
  )

  useFrame((state) => {
    const u = matRef.current?.uniforms
    if (!u) return
    const s = scrollState()
    u.uTime.value = s.time
    u.uCamZ.value = state.camera.position.z
    u.uPointer.value.set(s.pointerSmoothX, s.pointerSmoothY)
    u.uEnergy.value = s.energy
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSpeed" count={count} array={speeds} itemSize={1} />
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
      />
    </points>
  )
}

/* --------------------------------------------------------------- stars ---- */

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  varying float vTwinkle;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Slow, out-of-phase breathing. Fast twinkle would read as noise.
    vTwinkle = 0.55 + 0.45 * sin(uTime * 0.35 + aPhase * 6.283);
    gl_PointSize = aSize;
  }
`

const starFragment = /* glsl */ `
  varying float vTwinkle;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.62, 0.65, 0.74), smoothstep(0.5, 0.0, d) * vTwinkle * 0.4);
  }
`

/**
 * The furthest layer. Sits well beyond the fog's far plane at a huge radius so
 * it barely shifts as the camera travels — which is exactly what makes the
 * corridor read as open space rather than a closed tube.
 */
function StarField({ count }) {
  const matRef = useRef()
  const groupRef = useRef()

  const { positions, sizes, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = 260 + Math.random() * 220
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.6
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      sizes[i] = 0.8 + Math.random() * 1.8
      phases[i] = Math.random()
    }
    return { positions, sizes, phases }
  }, [count])

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = scrollState().time
    // Anchor to the camera so the starfield is never escaped, and rotate it
    // imperceptibly so the sky itself is alive.
    if (groupRef.current) {
      groupRef.current.position.z = state.camera.position.z
      groupRef.current.rotation.y = scrollState().time * 0.004
    }
  })

  return (
    <group ref={groupRef}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
          <bufferAttribute attach="attributes-aPhase" count={count} array={phases} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={starVertex}
          fragmentShader={starFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

/* ------------------------------------------------------------- strata ----- */

/**
 * The architecture: wireframe frames and slabs flanking the corridor for its
 * full length. One InstancedMesh, so several hundred structures cost a single
 * draw call. This is the layer that makes scrolling feel like travelling past
 * something rather than zooming into a texture.
 */
function CorridorStrata({ count }) {
  const meshRef = useRef()

  const instances = useMemo(() => {
    const out = []
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const z = -(Math.random() * (WORLD_DEPTH + STATION_SPACING * 2)) + STATION_SPACING
      // Structures stay outside a clear lateral corridor. Spawning them across
      // the full width put architecture directly behind the reading column,
      // which both wrecked text contrast and turned the frame into noise. The
      // corridor is the negative space that lets the composition breathe.
      out.push({
        position: [
          side * (14 + Math.random() * 20),
          (Math.random() - 0.5) * 26,
          z,
        ],
        rotation: [
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 0.4,
        ],
        scale: [
          0.6 + Math.random() * 5,
          0.6 + Math.random() * 9,
          0.4 + Math.random() * 3,
        ],
        drift: 0.1 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
      })
    }
    return out
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { time } = scrollState()

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      dummy.position.set(
        inst.position[0],
        // Barely-there vertical breathing keeps the architecture from reading
        // as a static backdrop when the visitor stops scrolling.
        inst.position[1] + Math.sin(time * inst.drift + inst.phase) * 0.6,
        inst.position[2]
      )
      dummy.rotation.set(
        inst.rotation[0],
        inst.rotation[1] + time * inst.drift * 0.04,
        inst.rotation[2]
      )
      dummy.scale.set(inst.scale[0], inst.scale[1], inst.scale[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Solid, reflective slabs — not wireframe. As dark wireframe at 72%
          opacity these structures were invisible against the black, so the
          corridor had no landmarks and no sense of scale. Solid metal picks up
          the environment map and the crimson rim, which is what turns them
          into architecture you can see yourself travelling past. */}
      <meshStandardMaterial
        color="#3b4152"
        metalness={0.82}
        roughness={0.34}
        envMapIntensity={1.5}
      />
    </instancedMesh>
  )
}

/* ---------------------------------------------------------- fragments ----- */

/** Mid-depth debris: solid, lit, and slowly tumbling. Catches the key light. */
function FloatingFragments({ count }) {
  const meshRef = useRef()

  const instances = useMemo(() => {
    const out = []
    for (let i = 0; i < count; i++) {
      // Ring distribution with a hollow centre, for the same reason as the
      // strata: debris tumbling across the headline is clutter, not depth.
      // The inner radius is generous because a single fragment drifting near
      // the camera projects large enough to upstage the hero core entirely.
      const angle = Math.random() * Math.PI * 2
      const radius = 11 + Math.random() * 14
      out.push({
        position: [
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.5,
          -(Math.random() * (WORLD_DEPTH + STATION_SPACING)) + STATION_SPACING * 0.5,
        ],
        scale: 0.05 + Math.random() * 0.19,
        spin: (Math.random() - 0.5) * 0.25,
        bob: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      })
    }
    return out
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { time, energy } = scrollState()

    for (let i = 0; i < instances.length; i++) {
      const f = instances[i]
      dummy.position.set(
        f.position[0] + Math.sin(time * f.bob * 0.5 + f.phase) * 0.4,
        f.position[1] + Math.cos(time * f.bob + f.phase) * 0.5,
        f.position[2]
      )
      const spin = time * f.spin
      dummy.rotation.set(spin, spin * 1.3, spin * 0.6)
      // Fragments swell slightly with world energy — the environment reacting.
      const s = f.scale * (1 + energy * 0.25)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      {/* Rougher and less reflective than the core, so debris reads as
          background material and never competes with the focal object. */}
      <meshStandardMaterial
        color="#59607a"
        metalness={0.9}
        roughness={0.35}
        envMapIntensity={1.2}
      />
    </instancedMesh>
  )
}

/* -------------------------------------------------------- light shafts ---- */

const shaftFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Soft-edged vertical wedge: bright along the centre line, gone at the
    // edges, fading out top and bottom. Reads as haze catching light.
    float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
    float vert = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
    gl_FragColor = vec4(uColor, edge * vert * uOpacity);
  }
`

const shaftVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Volumetric light. Real volumetrics need a raymarch pass we cannot afford on
 * a 90ms-TBT budget, so these are additive billboards — the standard trick,
 * and convincing once fog and the dust field sit in front of them.
 */
function LightShafts({ reducedMotion }) {
  const groupRef = useRef()

  const shafts = useMemo(
    () =>
      STATIONS.flatMap((s, i) => [
        {
          key: `${s.id}-a`,
          position: [s.position[0] - 7, 6, s.position[2] - 8],
          rotation: [0, 0.4, 0.22],
          scale: [7, 26, 1],
          color: s.mood.accent,
          phase: i * 1.7,
        },
        {
          key: `${s.id}-b`,
          position: [s.position[0] + 8, 5, s.position[2] - 20],
          rotation: [0, -0.5, -0.3],
          scale: [5.5, 22, 1],
          color: s.mood.accent,
          phase: i * 2.3 + 0.9,
        },
      ]),
    []
  )

  useFrame(() => {
    if (!groupRef.current || reducedMotion) return
    const { time, energy } = scrollState()
    groupRef.current.children.forEach((child, i) => {
      const mat = child.material
      if (!mat?.uniforms) return
      // Independent slow pulses so the shafts never beat in unison.
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.22 + shafts[i].phase)
      mat.uniforms.uOpacity.value = (0.035 + pulse * 0.05) * (1 + energy * 0.6)
    })
  })

  return (
    <group ref={groupRef}>
      {shafts.map((s) => (
        <mesh key={s.key} position={s.position} rotation={s.rotation} scale={s.scale} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={shaftVertex}
            fragmentShader={shaftFragment}
            uniforms={{
              uColor: { value: new THREE.Color(s.color) },
              uOpacity: { value: 0.05 },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ----------------------------------------------------------- assembly ----- */

const Atmosphere = ({ tier, reducedMotion }) => (
  <group>
    <StarField count={tier.stars} />
    <CorridorStrata count={tier.strata} />
    <FloatingFragments count={tier.fragments} />
    <LightShafts reducedMotion={reducedMotion} />
    <DustField count={tier.dust} quality={tier.dustScale} />
  </group>
)

export default Atmosphere
