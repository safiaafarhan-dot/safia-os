import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { blackHoleState } from './blackHoleState'

/**
 * THE DISTANT UNIVERSE.
 *
 * The environment used to be six element types — sky, stars, corridor ribs,
 * tumbling fragments, light shafts and dust — and every one of them lived at
 * roughly the same distance and the same size. That is the entire reason it
 * read as empty and generic: with nothing very large and nothing very close,
 * the eye has no way to judge scale, so a corridor 300 units long feels like a
 * small dark room with some bars in it.
 *
 * What was missing was not MORE objects. It was a SCALE HIERARCHY. This file
 * supplies the two tiers the world never had:
 *
 *   DISTANT SPACE — galaxies, nebulae, planets and minor singularities, tens
 *   to hundreds of units across, effectively static. They are the backdrop
 *   that makes everything in front of them read as being somewhere.
 *
 *   FOREGROUND — a handful of large, near-black shards that stream past very
 *   close to the camera. These are the single strongest depth cue available:
 *   something crossing frame in a fifth of a second, unlit and out of focus,
 *   tells the eye how fast it is travelling far more convincingly than any
 *   amount of mid-distance parallax.
 *
 * Everything here is placed deliberately and sparsely — a handful of large
 * things, not a scatter of small ones. Nothing is inside the reading corridor,
 * and nothing competes with the guardian.
 */

/* --------------------------------------------------------------- noise ---- */

/**
 * One small tileable noise texture, shared by every nebula.
 *
 * Procedural fbm in the fragment shader is the obvious approach, but nebulae
 * cover large areas of screen, so per-pixel fbm is a fill-rate bill paid every
 * frame forever. Baking it once turns that into two cheap samples.
 */
function makeNoiseTexture(size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)

  const rand = (x, y, s) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return n - Math.floor(n)
  }
  const smooth = (t) => t * t * (3 - 2 * t)
  const octave = (gx, gy, freq, seed) => {
    const fx = (gx / size) * freq
    const fy = (gy / size) * freq
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = smooth(fx - x0)
    const ty = smooth(fy - y0)
    const w = (v) => ((v % freq) + freq) % freq
    const a = rand(w(x0), w(y0), seed)
    const b = rand(w(x0 + 1), w(y0), seed)
    const c = rand(w(x0), w(y0 + 1), seed)
    const d = rand(w(x0 + 1), w(y0 + 1), seed)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      let amp = 0.5
      let freq = 4
      for (let o = 0; o < 4; o++) {
        v += octave(x, y, freq, o + 1) * amp
        amp *= 0.5
        freq *= 2
      }
      const i = (y * size + x) * 4
      const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

const billboardVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/* ------------------------------------------------------------ galaxies ---- */

const galaxyVertex = /* glsl */ `
  attribute float aSize;
  attribute float aCore;
  uniform float uTime;
  varying float vCore;
  void main() {
    vCore = aCore;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(aSize * (900.0 / max(-mv.z, 1.0)), 0.6);
  }
`

const galaxyFragment = /* glsl */ `
  varying float vCore;
  uniform float uOpacity;
  uniform vec3 uCore;
  uniform vec3 uArm;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    // Hot, slightly warm core falling to a cold dusty arm colour.
    vec3 col = mix(uArm, uCore, vCore);
    gl_FragColor = vec4(col, soft * uOpacity * (0.25 + vCore * 0.75));
  }
`

/**
 * A barred spiral, built as a point cloud.
 *
 * Logarithmic arms with scatter, plus a dense bulge. Points rather than a
 * textured billboard because a galaxy at this distance is genuinely a cloud of
 * unresolved stars, and a point cloud gets the grain of that for free —
 * a blurred sprite always reads as a sticker.
 */
function Galaxy({ count, position, rotation, radius, tint }) {
  const groupRef = useRef()
  const matRef = useRef()

  const { positions, sizes, cores } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const cores = new Float32Array(count)
    const ARMS = 2
    for (let i = 0; i < count; i++) {
      // Bulge for a fifth of the stars, arms for the rest.
      const inBulge = Math.random() < 0.2
      let r, theta
      if (inBulge) {
        r = Math.pow(Math.random(), 2.2) * radius * 0.22
        theta = Math.random() * Math.PI * 2
      } else {
        r = Math.pow(Math.random(), 0.65) * radius
        const arm = Math.floor(Math.random() * ARMS)
        // Logarithmic spiral, with scatter that widens outward.
        theta = (arm / ARMS) * Math.PI * 2 + Math.log(1 + r / (radius * 0.16)) * 2.4
        theta += (Math.random() - 0.5) * (0.5 + (r / radius) * 0.9)
      }
      const thickness = radius * 0.035 * (1 - (r / radius) * 0.7)
      positions[i * 3] = Math.cos(theta) * r
      positions[i * 3 + 1] = (Math.random() - 0.5) * thickness * (inBulge ? 5 : 1)
      positions[i * 3 + 2] = Math.sin(theta) * r
      sizes[i] = 0.4 + Math.pow(Math.random(), 3) * 2.2
      // Core-ness drives colour and brightness: bright warm centre, dim arms.
      cores[i] = Math.max(0, 1 - r / (radius * 0.5)) * (inBulge ? 1 : 0.55)
    }
    return { positions, sizes, cores }
  }, [count, radius])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0.42 },
      uCore: { value: new THREE.Color(tint.core) },
      uArm: { value: new THREE.Color(tint.arm) },
    }),
    [tint]
  )

  useFrame(() => {
    const s = scrollState()
    if (matRef.current) matRef.current.uniforms.uTime.value = s.time
    // Turning almost imperceptibly. At this distance it should read as alive,
    // never as spinning.
    if (groupRef.current) groupRef.current.rotation.y = s.time * 0.004
  })

  return (
    <group position={position} rotation={rotation}>
      <group ref={groupRef}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
            <bufferAttribute attach="attributes-aCore" count={count} array={cores} itemSize={1} />
          </bufferGeometry>
          <shaderMaterial
            ref={matRef}
            uniforms={uniforms}
            vertexShader={galaxyVertex}
            fragmentShader={galaxyFragment}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </points>
      </group>
    </group>
  )
}

/* -------------------------------------------------------------- nebulae --- */

const nebulaFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    // Two samples drifting at different rates. One scrolling sample reads as a
    // moving texture; two beating against each other read as gas that is
    // genuinely churning.
    vec2 a = vUv * 1.2 + vec2(uTime * 0.0035, uTime * 0.0016) + uSeed;
    vec2 b = vUv * 2.3 - vec2(uTime * 0.0022, -uTime * 0.0011) + uSeed * 1.7;
    float n = texture2D(uNoise, a).r * 0.65 + texture2D(uNoise, b).r * 0.45;

    float r = length(vUv - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.04, r);
    // Contrast into wisps rather than a flat cloud.
    float wisp = smoothstep(0.46, 0.98, n) * falloff;

    vec3 col = mix(uColorA, uColorB, smoothstep(0.4, 0.9, n));
    gl_FragColor = vec4(col, wisp * uOpacity);
  }
`

/** Camera-facing gas. Kept very low contrast: this is air, not a feature. */
function Nebulae({ clouds, noise }) {
  const groupRef = useRef()

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const s = scrollState()
    g.children.forEach((child, i) => {
      child.quaternion.copy(state.camera.quaternion)
      const u = child.material.uniforms
      u.uTime.value = s.time
      const c = clouds[i]
      u.uOpacity.value = c.base * (0.75 + 0.25 * Math.sin(s.time * 0.07 + c.phase))
    })
  })

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <mesh key={i} position={c.position} frustumCulled={false} renderOrder={-600}>
          <planeGeometry args={[c.scale, c.scale]} />
          <shaderMaterial
            vertexShader={billboardVertex}
            fragmentShader={nebulaFragment}
            uniforms={{
              uNoise: { value: noise },
              uTime: { value: 0 },
              uSeed: { value: c.seed },
              uOpacity: { value: 0 },
              uColorA: { value: new THREE.Color(c.warm ? '#3d0a16' : '#0c1220') },
              uColorB: { value: new THREE.Color(c.warm ? '#a81e33' : '#2f4463') },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------------- planets --- */

const limbFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    // A ring peaking just outside the body's silhouette, plus a faint bleed.
    float rim = smoothstep(0.60, 0.635, r) * smoothstep(0.98, 0.64, r);
    float bleed = smoothstep(1.0, 0.62, r) * 0.14;
    gl_FragColor = vec4(uColor, (rim + bleed) * uOpacity);
  }
`

/**
 * A dark world with a lit limb.
 *
 * Deliberately near-black: it is a silhouette with an atmosphere catching the
 * light, not a texture-mapped globe. That reads as far more expensive than any
 * amount of surface detail would, and costs one sphere and one billboard.
 */
function Planet({ position, radius, tint, ring }) {
  const bodyRef = useRef()
  const limbRef = useRef()

  useFrame((state) => {
    const s = scrollState()
    if (bodyRef.current) bodyRef.current.rotation.y = s.time * 0.008
    if (limbRef.current) limbRef.current.quaternion.copy(state.camera.quaternion)
  })

  return (
    <group position={position}>
      <mesh ref={bodyRef}>
        <sphereGeometry args={[radius, 40, 28]} />
        <meshStandardMaterial
          color="#0b0f18"
          roughness={0.92}
          metalness={0.08}
          emissive={tint}
          emissiveIntensity={0.22}
          fog={false}
        />
      </mesh>

      {ring && (
        <mesh rotation={[Math.PI / 2.6, 0.4, 0]}>
          <ringGeometry args={[radius * 1.5, radius * 2.3, 96]} />
          <meshBasicMaterial
            color={tint}
            transparent
            opacity={0.14}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
      )}

      <mesh ref={limbRef} renderOrder={-400}>
        <planeGeometry args={[radius * 3.4, radius * 3.4]} />
        <shaderMaterial
          vertexShader={billboardVertex}
          fragmentShader={limbFragment}
          uniforms={{
            uColor: { value: new THREE.Color(tint) },
            uOpacity: { value: 0.5 },
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------- minor singularities ---- */

/**
 * Small black holes, far off the travel axis.
 *
 * Same physical language as the main event — shadow, hot rim, tilted disk —
 * at a twentieth of the size. They exist so the major black hole reads as one
 * of a KIND of thing that lives in this universe rather than as a single
 * effect bolted on, and so the deep field has structure worth noticing.
 */
function Singularity({ position, radius, tilt }) {
  const diskRef = useRef()
  const ringRef = useRef()

  useFrame((state) => {
    const s = scrollState()
    if (diskRef.current) diskRef.current.rotation.z = s.time * 0.06
    if (ringRef.current) ringRef.current.quaternion.copy(state.camera.quaternion)
  })

  return (
    <group position={position}>
      <mesh renderOrder={3}>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial color="#000000" fog={false} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} renderOrder={4}>
        <ringGeometry args={[radius * 1.02, radius * 1.14, 64]} />
        <meshBasicMaterial
          color="#ffd2bd"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={diskRef} rotation={tilt} renderOrder={3}>
        <ringGeometry args={[radius * 1.5, radius * 3.6, 72, 1]} />
        <meshBasicMaterial
          color="#c8283f"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------- foreground --- */

/**
 * Large shards streaming past, very close to the camera.
 *
 * This is the tier the world was most obviously missing. Objects at 3-14 units
 * cross the entire frame in a fraction of a second, and because they are
 * unlit near-black silhouettes they never compete with anything — they simply
 * register as things you are moving past. It is the cheapest and most
 * convincing speed cue available, and no amount of mid-distance parallax
 * substitutes for it.
 *
 * The slab is anchored to the camera's depth, so the field is effectively
 * infinite and a handful of instances covers the entire journey.
 */
function Foreground({ count }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const shards = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // Held well outside the centre of frame: a shard crossing the reading
        // column would be a distraction, not depth.
        angle: (i / count) * Math.PI * 2 + Math.random(),
        radius: 7 + Math.random() * 9,
        offset: Math.random(),
        speed: 0.05 + Math.random() * 0.09,
        scale: [
          0.5 + Math.random() * 1.6,
          0.3 + Math.random() * 1.0,
          2.5 + Math.random() * 7,
        ],
        spin: (Math.random() - 0.5) * 0.5,
        phase: Math.random() * Math.PI * 2,
      })),
    [count]
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const s = scrollState()
    const camZ = state.camera.position.z
    const SLAB = 90

    // Fade out through the black hole: the corridor gives way there, and
    // foreground debris would contradict that.
    const bh = blackHoleState.presence
    mesh.material.opacity = 1 - bh * 0.9
    mesh.material.transparent = bh > 0.01

    for (let i = 0; i < shards.length; i++) {
      const f = shards[i]
      // Stream toward the camera and wrap. Anchoring to camZ means the rig can
      // travel the whole corridor and never outrun the field.
      const travel = (f.offset + s.time * f.speed) % 1
      const z = camZ - SLAB + travel * SLAB

      // Nearer shards swing further with the pointer — the parallax cue that
      // sells the volume as something the camera is inside of.
      const near = 1 - travel
      dummy.position.set(
        Math.cos(f.angle) * f.radius + s.pointerSmoothX * near * 3.2,
        Math.sin(f.angle) * f.radius * 0.62 + s.pointerSmoothY * near * 2.2,
        z
      )
      dummy.rotation.set(f.phase, f.phase * 1.3 + s.time * f.spin * 0.1, f.phase * 0.7)
      dummy.scale.set(...f.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Near-black and rough. These must read as occluding silhouettes, not
          as objects — the moment one catches a highlight it stops being depth
          and starts being clutter. */}
      <meshStandardMaterial
        color="#0a0d14"
        metalness={0.3}
        roughness={0.9}
        envMapIntensity={0.15}
        transparent
        opacity={1}
      />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------- assembly --- */

const DeepSpace = ({ tier }) => {
  const noise = useMemo(() => makeNoiseTexture(128), [])

  const clouds = useMemo(() => {
    const out = []
    const n = tier.nebulae
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * Math.PI * 2 + 0.6
      const r = 150 + Math.random() * 180
      out.push({
        position: [Math.cos(theta) * r, (Math.random() - 0.4) * 130, -60 - Math.random() * 340],
        scale: 190 + Math.random() * 220,
        seed: Math.random() * 10,
        warm: i % 3 === 0,
        phase: Math.random() * Math.PI * 2,
        base: 0.1 + Math.random() * 0.1,
      })
    }
    return out
  }, [tier.nebulae])

  return (
    <group>
      {/* Furthest: two galaxies on opposite sides of the corridor, so the
          camera always has one of them somewhere in frame. */}
      <Galaxy
        count={tier.galaxy}
        position={[-330, 120, -200]}
        rotation={[0.9, 0.4, 0.2]}
        radius={95}
        tint={{ core: '#ffd9b8', arm: '#5d7099' }}
      />
      <Galaxy
        count={Math.round(tier.galaxy * 0.7)}
        position={[400, -150, -520]}
        rotation={[-0.6, 1.1, -0.3]}
        radius={120}
        tint={{ core: '#ffc9a8', arm: '#6b5f86' }}
      />

      <Nebulae clouds={clouds} noise={noise} />

      <Planet position={[-165, -70, -250]} radius={30} tint="#b3122e" ring={false} />
      <Planet position={[210, 85, -560]} radius={46} tint="#c98a4b" ring />

      {tier.singularities && (
        <>
          <Singularity position={[-95, 46, -150]} radius={2.6} tilt={[Math.PI / 2.3, 0.3, 0]} />
          <Singularity position={[150, -38, -430]} radius={3.4} tilt={[Math.PI / 2.7, -0.5, 0.2]} />
        </>
      )}

      <Foreground count={tier.foreground} />
    </group>
  )
}

export default DeepSpace
