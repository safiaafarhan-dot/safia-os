import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { PALETTE, sampleMood } from './stations'

/**
 * The air, the light and the far distance.
 *
 * Nothing in here is a prop. There are no ships, rings, panels or debris —
 * that vocabulary is what made the previous direction read as stock sci-fi.
 * What is here instead is the four things a photographed space actually needs:
 *
 *   1. A GRADED SKY, so the frame is a space rather than an unlit rectangle.
 *      There is no flat black anywhere on this page; every pixel of background
 *      carries a gradient, a dither and a light source somewhere off frame.
 *   2. VOLUMETRIC HAZE that churns, so the air between camera and subject is
 *      visible. Haze separates foreground from background without needing more
 *      objects — which is how you get depth without clutter.
 *   3. A DEEP FIELD far beyond the subject, for parallax. Without it the
 *      camera's orbit is invisible, because there is nothing to orbit against.
 *   4. DISTANT STRUCTURE — a few enormous, near-black silhouettes barely above
 *      the fog. Read as scale and as something unexplained, never as detail.
 *
 * All continuous motion is driven from a single uTime uniform, so tens of
 * thousands of points cost one number per frame regardless of count.
 */

/**
 * Tileable value-noise texture, generated once on a 2D canvas.
 *
 * Procedural fbm in the fragment shader is the obvious way to do haze, but the
 * haze planes cover most of the screen, so per-pixel fbm is a fill-rate bill
 * paid every frame forever. Baking it into a small texture turns that into two
 * cheap samples.
 */
function makeNoiseTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)

  // Deterministic: haze that reshuffles on every reload reads as noise rather
  // than as a place.
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
      for (let o = 0; o < 5; o++) {
        v += octave(x, y, freq, o + 1) * amp
        amp *= 0.5
        freq *= 2
      }
      const i = (y * size + x) * 4
      const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
      img.data[i] = c
      img.data[i + 1] = c
      img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

const billboardVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/* ----------------------------------------------------------------- sky ---- */

const skyFragment = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uNadir;
  uniform vec3 uGlow;
  uniform float uGlowPower;
  uniform vec3 uGlowDir;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y * 0.5 + 0.5;
    vec3 col = mix(uNadir, uZenith, smoothstep(0.0, 0.92, h));

    // An off-frame source bleeding into the sky. Wide and weak: it should
    // register as "there is something bright over there", never as a flare.
    float d = max(dot(dir, normalize(uGlowDir)), 0.0);
    col += uGlow * pow(d, 2.6) * uGlowPower;

    // Cold counter-glow, so the dark half of the sky is never dead.
    float d2 = max(dot(dir, normalize(-uGlowDir)), 0.0);
    col += vec3(0.042, 0.056, 0.086) * pow(d2, 3.0);

    // Hash dither. Very dark wide gradients band badly on 8-bit displays, and
    // banding is the single most "cheap render" artefact there is.
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.007;

    gl_FragColor = vec4(col, 1.0);
  }
`

function Sky() {
  const matRef = useRef()
  const meshRef = useRef()

  const uniforms = useMemo(
    () => ({
      // Never #000. A near-black with a cool cast reads as atmosphere with
      // depth; pure black reads as an unlit surface.
      uZenith: { value: new THREE.Color('#0a0f1a') },
      uNadir: { value: new THREE.Color('#03050a') },
      uGlow: { value: new THREE.Color(PALETTE.crimsonDeep) },
      uGlowPower: { value: 0.4 },
      uGlowDir: { value: new THREE.Vector3(0.6, 0.3, -1) },
      uTime: { value: 0 },
    }),
    []
  )

  useFrame((state) => {
    const s = scrollState()
    if (meshRef.current) meshRef.current.position.copy(state.camera.position)
    const u = matRef.current?.uniforms
    if (!u) return
    u.uTime.value = s.time
    // The source swings slowly as the rig orbits, so the sky is never the same
    // twice across a scroll — the background is part of the choreography.
    const a = s.time * 0.017 + s.station * 0.72
    u.uGlowDir.value.set(Math.sin(a), 0.18 + Math.cos(a * 0.6) * 0.3, Math.cos(a))
    u.uGlowPower.value = 0.3 + sampleMood(s.station, 'accentPower') * 0.42 + s.energy * 0.16
  })

  return (
    <mesh ref={meshRef} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[600, 32, 24]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={skyFragment}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

/* ----------------------------------------------------------- deep field --- */

const deepVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aWarm;
  uniform float uTime;
  varying float vTwinkle;
  varying float vWarm;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Slow, out-of-phase breathing. Fast twinkle reads as noise, not as sky.
    vTwinkle = 0.5 + 0.5 * sin(uTime * 0.24 + aPhase * 6.283);
    vWarm = aWarm;
    gl_PointSize = aSize;
  }
`

const deepFragment = /* glsl */ `
  varying float vTwinkle;
  varying float vWarm;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // Tight core plus faint halo — the halo is what the bloom pass turns into
    // a real light rather than a lit pixel.
    float core = smoothstep(0.24, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.22;
    vec3 cool = vec3(0.60, 0.67, 0.82);
    vec3 warm = vec3(0.92, 0.62, 0.60);
    gl_FragColor = vec4(mix(cool, warm, vWarm), (core + halo) * vTwinkle * 0.72);
  }
`

/**
 * The far distance, in two shells at different radii.
 *
 * Two shells rather than one because the camera ORBITS: a single shell at a
 * huge radius is effectively static, and a static distance makes an orbit
 * invisible. The inner shell sliding against the outer one is what tells the
 * eye the camera is moving through a space rather than turning on the spot.
 */
function DeepShell({ count, radius, sizeScale, spin }) {
  const matRef = useRef()
  const groupRef = useRef()

  const { positions, sizes, phases, warms } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const warms = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = radius * (0.7 + Math.random() * 0.5)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.75
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      // Heavy tail: mostly sub-pixel dust, a few bright. Uniform sizes are the
      // clearest tell of a generated star field.
      sizes[i] = (0.5 + Math.pow(Math.random(), 3.4) * 2.8) * sizeScale
      phases[i] = Math.random()
      warms[i] = Math.random() < 0.1 ? Math.random() : 0
    }
    return { positions, sizes, phases, warms }
  }, [count, radius, sizeScale])

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(() => {
    const s = scrollState()
    if (matRef.current) matRef.current.uniforms.uTime.value = s.time
    if (groupRef.current) groupRef.current.rotation.y = s.time * spin
  })

  return (
    <group ref={groupRef}>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
          <bufferAttribute attach="attributes-aPhase" count={count} array={phases} itemSize={1} />
          <bufferAttribute attach="attributes-aWarm" count={count} array={warms} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={deepVertex}
          fragmentShader={deepFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </group>
  )
}

/* ------------------------------------------------------------------ haze -- */

const hazeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    // Two samples scrolling at different rates in different directions. One
    // scrolling sample reads as a moving texture; two beating against each
    // other read as gas that is genuinely churning.
    vec2 a = vUv * 1.3 + vec2(uTime * uSpeed, uTime * uSpeed * 0.42) + uSeed;
    vec2 b = vUv * 2.6 - vec2(uTime * uSpeed * 0.63, -uTime * uSpeed * 0.28) + uSeed * 1.7;
    float n = texture2D(uNoise, a).r * 0.65 + texture2D(uNoise, b).r * 0.45;

    // Radial falloff so a plane never shows its own edges.
    float r = length(vUv - 0.5) * 2.0;
    float falloff = smoothstep(1.0, 0.05, r);

    // Contrast the noise into wisps rather than a flat cloud.
    float wisp = smoothstep(0.44, 0.95, n) * falloff;

    vec3 col = mix(uColorA, uColorB, smoothstep(0.4, 0.88, n));
    gl_FragColor = vec4(col, wisp * uOpacity);
  }
`

/**
 * Volumetric atmosphere.
 *
 * Real volumetrics need a raymarch pass this performance budget cannot carry,
 * so these are camera-facing additive billboards at spread depths — the
 * standard trick, and entirely convincing once the field sits in front of them
 * and fog sits behind.
 */
function Haze({ count, noise }) {
  const groupRef = useRef()

  const clouds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const theta = (i / count) * Math.PI * 2 + Math.random() * 0.7
        const r = 18 + Math.random() * 34
        return {
          key: i,
          position: [Math.cos(theta) * r, (Math.random() - 0.5) * 26, Math.sin(theta) * r],
          scale: 30 + Math.random() * 46,
          seed: Math.random() * 10,
          speed: 0.004 + Math.random() * 0.009,
          // Most haze is cold; a minority carries the crimson signal, so the
          // accent stays an accent instead of becoming a wash.
          warm: Math.random() < 0.3,
          phase: Math.random() * Math.PI * 2,
          base: 0.14 + Math.random() * 0.14,
        }
      }),
    [count]
  )

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const s = scrollState()
    const density = sampleMood(s.station, 'density')

    g.children.forEach((child, i) => {
      const c = clouds[i]
      // Billboard toward the camera so a cloud never shows as a flat card.
      child.quaternion.copy(state.camera.quaternion)
      const u = child.material.uniforms
      u.uTime.value = s.time
      const pulse = 0.72 + 0.28 * Math.sin(s.time * 0.1 + c.phase)
      u.uOpacity.value = c.base * pulse * density * (1 + s.energy * 0.3)
    })
  })

  return (
    <group ref={groupRef}>
      {clouds.map((c) => (
        <mesh key={c.key} position={c.position} frustumCulled={false} renderOrder={-500}>
          <planeGeometry args={[c.scale, c.scale]} />
          <shaderMaterial
            vertexShader={billboardVertex}
            fragmentShader={hazeFragment}
            uniforms={{
              uNoise: { value: noise },
              uTime: { value: 0 },
              uSpeed: { value: c.speed },
              uSeed: { value: c.seed },
              uOpacity: { value: 0.18 },
              uColorA: { value: new THREE.Color(c.warm ? '#4a0c1b' : '#0e1524') },
              uColorB: { value: new THREE.Color(c.warm ? '#c22440' : '#3d5378') },
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

/* ---------------------------------------------------- distant structure --- */

/**
 * Three enormous, near-black shells far outside the subject.
 *
 * Deliberately abstract and deliberately barely visible: at this size and this
 * value they read as scale and as something unexplained, which is the
 * "mysterious" half of the brief. The moment they become legible objects they
 * become sci-fi props, which is exactly what this direction avoids — so they
 * are lit along one edge only and never come closer than the fog.
 */
function DistantStructure({ enabled }) {
  const groupRef = useRef()

  const shells = useMemo(
    () => [
      { pos: [-190, 60, -140], rot: [0.4, 0.8, 0.2], scale: 78, spin: 0.0035 },
      { pos: [210, -50, 120], rot: [-0.3, 0.2, 0.6], scale: 96, spin: -0.0022 },
      { pos: [40, 130, -240], rot: [1.1, 0.4, -0.3], scale: 64, spin: 0.0028 },
    ],
    []
  )

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const { time } = scrollState()
    g.children.forEach((child, i) => {
      child.rotation.y = shells[i].rot[1] + time * shells[i].spin
      child.rotation.x = shells[i].rot[0] + Math.sin(time * 0.02 + i) * 0.05
    })
  })

  if (!enabled) return null

  return (
    <group ref={groupRef}>
      {shells.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} scale={s.scale} frustumCulled={false}>
          {/* An open shell, not a solid — the gap is what keeps the silhouette
              ambiguous and stops it reading as a planet or a ship. */}
          <sphereGeometry args={[1, 32, 20, 0, Math.PI * 1.35, 0.3, Math.PI * 0.62]} />
          <meshStandardMaterial
            color="#0b0f18"
            roughness={0.85}
            metalness={0.35}
            emissive="#160a10"
            emissiveIntensity={0.4}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------- light shafts ---- */

const shaftFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // A soft-edged wedge: bright along the centre line, gone at the edges,
    // fading out at both ends. Reads as haze catching light.
    float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
    float vert = smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.48, vUv.y);
    gl_FragColor = vec4(uColor, pow(edge, 1.7) * vert * uOpacity);
  }
`

/** Raking light through the haze — the cue that there is air in the room. */
function LightShafts({ reducedMotion }) {
  const groupRef = useRef()

  const shafts = useMemo(
    () => [
      { pos: [-16, 12, -8], rot: [0, 0.5, 0.34], scale: [13, 52, 1], phase: 0 },
      { pos: [19, 9, 10], rot: [0, -0.7, -0.4], scale: [10, 44, 1], phase: 2.1 },
      { pos: [4, 15, -22], rot: [0, 0.15, 0.2], scale: [16, 60, 1], phase: 4.3 },
    ],
    []
  )

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const s = scrollState()
    g.children.forEach((child, i) => {
      const u = child.material.uniforms
      if (!u) return
      const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(s.time * 0.16 + shafts[i].phase)
      u.uOpacity.value =
        (0.022 + pulse * 0.042) *
        (0.5 + sampleMood(s.station, 'accentPower') * 0.9) *
        (1 + s.energy * 0.6)
    })
  })

  return (
    <group ref={groupRef}>
      {shafts.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} scale={s.scale} frustumCulled={false}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={billboardVertex}
            fragmentShader={shaftFragment}
            uniforms={{
              uColor: { value: new THREE.Color(PALETTE.crimson) },
              uOpacity: { value: 0.04 },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------- assembly --- */

const Atmosphere = ({ tier, reducedMotion }) => {
  const noise = useMemo(() => makeNoiseTexture(256), [])

  return (
    <group>
      <Sky />
      <DeepShell count={tier.deep} radius={340} sizeScale={1} spin={0.0016} />
      <DeepShell count={Math.round(tier.deep * 0.5)} radius={120} sizeScale={1.15} spin={-0.0045} />
      <DistantStructure enabled={tier.structure} />
      <Haze count={tier.haze} noise={noise} />
      <LightShafts reducedMotion={reducedMotion} />
    </group>
  )
}

export default Atmosphere
