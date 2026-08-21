import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { nearFieldsSuppressed, pushOutOfColumn } from './safeZone'
import { blackHoleState } from './blackHoleState'
import { STATIONS, STATION_SPACING, WORLD_DEPTH, sampleMood } from './stations'

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


/* ----------------------------------------------------------------- sky ---- */

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * A graded sky, not a clear colour.
 *
 * The environment used to be a transparent canvas over a CSS gradient. That
 * gradient was three saturated veils — crimson, teal, violet — whose composite
 * was the muddy magenta wash that made the whole page look cheap. The grade
 * now renders opaque, so the sky has to live in the scene, which is where it
 * belonged anyway: a real shot has a gradient, a horizon and a source
 * somewhere off frame, and that is what tells the eye it is looking INTO a
 * space rather than at an unlit rectangle.
 *
 * There is no flat black anywhere in this world — every pixel of background
 * carries a gradient, a dither and a light source.
 */
const skyFragment = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uNadir;
  uniform vec3 uGlow;
  uniform float uGlowPower;
  uniform vec3 uGlowDir;
  uniform vec3 uCoolGlow;
  uniform float uCoolPower;
  uniform float uTime;

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y * 0.5 + 0.5;
    vec3 col = mix(uNadir, uZenith, smoothstep(0.0, 0.92, h));

    // The off-frame key bleeding into the sky. Wide and weak — it should read
    // as "there is something bright over there", never as a lens flare.
    float d = max(dot(dir, normalize(uGlowDir)), 0.0);
    col += uGlow * pow(d, 2.6) * uGlowPower;

    // THE COOL SOURCE. This used to be a token counter-glow at a twentieth of
    // the crimson's strength, which meant the sky only ever had one light in
    // it and everything away from that light fell to near-black. It is now a
    // real source of its own, opposite the warm one and slightly wider, so the
    // background is lit FROM TWO SIDES. Complementary sources are what give a
    // dark frame depth without raising its overall brightness.
    float d2 = max(dot(dir, normalize(-uGlowDir)), 0.0);
    col += uCoolGlow * pow(d2, 3.4) * uCoolPower;

    // A third, very wide violet wash across the middle of the sphere. Broad and
    // weak: it exists to stop the band between the two sources reading as a
    // dead zone, and should never be identifiable as its own light.
    float band = 1.0 - abs(dir.y);
    col += vec3(0.072, 0.040, 0.115) * pow(band, 3.0) * 0.72;

    // A GLASS-WHITE ZENITH BLOOM. Very wide, very weak, and pure highlight:
    // it is what stops the top of frame reading as a ceiling. Without a
    // near-white anywhere in the gradient the eye reads the whole image as
    // underexposed no matter how saturated the mid-tones are.
    col += vec3(0.05, 0.068, 0.098) * pow(smoothstep(0.42, 1.0, h), 2.4);

    // Hash dither. Very dark wide gradients band badly on 8-bit displays, and
    // banding is the single most "cheap render" artefact there is.
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.007;

    gl_FragColor = vec4(col, 1.0);
  }
`

const skyAccent = new THREE.Color()
const skyAccentNext = new THREE.Color()

/**
 * THE LIFT IS SCOPED TO THE OPENING.
 *
 * The luminous ladder belongs to the hero's abstract-dimension direction. The
 * rest of the journey — the matter band, the worlds, the deep archive — was
 * graded against the darker sky it already had, and quietly raising the floor
 * under all eight stations would have re-lit six sections nobody asked to
 * change. These are the two ends, blended by depth.
 */
const SKY_OPEN_ZENITH = new THREE.Color('#1d3a6b')
const SKY_OPEN_NADIR = new THREE.Color('#070f20')
const SKY_DEEP_ZENITH = new THREE.Color('#0c1424')
const SKY_DEEP_NADIR = new THREE.Color('#05080f')

function Sky() {
  const matRef = useRef()
  const meshRef = useRef()

  const uniforms = useMemo(
    () => ({
      // Never #000. A near-black with a cool cast reads as atmosphere with
      // depth; pure black reads as an unlit surface.
      // Lifted off black. The nadir in particular was #03050a, which is within
      // rounding distance of pure black across the whole lower hemisphere.
      // LIFTED, AND GENUINELY NAVY.
      //
      // These were #0c1424 over #05080f — a very dark navy over something
      // within rounding distance of pure black. Combined with a CRIMSON key
      // light, the background of every frame was "near-black, tinted red",
      // which is precisely the dull look this direction rejects. The ladder now
      // runs a lit electric navy down to a deep midnight that still has colour
      // in it, and the key light is no longer a fixed crimson at all.
      uZenith: { value: new THREE.Color('#1d3a6b') },
      // The floor stays genuinely dark. Luminous does not mean uniformly
      // bright: the first pass lifted every value at once and the frame became
      // a flat blue wash with no range in it, which reads as cheap in exactly
      // the same way flat black does. The image needs a lit core AND a dark
      // edge — that contrast is what depth actually is.
      uNadir: { value: new THREE.Color('#070f20') },
      // Tracks the station accent — cyan through the opening, violet at
      // Skills, crimson deeper in. One value, so the sky's own light is
      // always the same colour as the light in the scene instead of arguing
      // with it.
      uGlow: { value: new THREE.Color('#3ad4ff') },
      uGlowPower: { value: 0.6 },
      // A real electric blue rather than the previous dull teal, and strong
      // enough to be a source rather than a counter-glow.
      uCoolGlow: { value: new THREE.Color('#3f9ae8') },
      uCoolPower: { value: 0.34 },
      uGlowDir: { value: new THREE.Vector3(0.6, 0.3, -1) },
      uTime: { value: 0 },
    }),
    []
  )

  useFrame((state) => {
    const s = scrollState()
    // Anchored to the camera so the sky is never escaped as the rig travels.
    if (meshRef.current) meshRef.current.position.copy(state.camera.position)
    const u = matRef.current?.uniforms
    if (!u) return
    u.uTime.value = s.time
    // The source swings slowly across the scroll, so the background itself is
    // part of the choreography rather than a static backdrop.
    const a = s.time * 0.017 + s.station * 0.62
    u.uGlowDir.value.set(Math.sin(a), 0.2 + Math.cos(a * 0.6) * 0.28, Math.cos(a) - 0.4)
    // Lerp the key toward the current station's accent. Doing this here rather
    // than hardcoding a hue is what lets the whole sky turn over the course of
    // the journey without a second palette existing anywhere.
    const i = Math.max(0, Math.min(STATIONS.length - 1, Math.floor(s.station)))
    const j = Math.min(STATIONS.length - 1, i + 1)
    skyAccent.set(STATIONS[i].mood.accent).lerp(skyAccentNext.set(STATIONS[j].mood.accent), s.station - i)
    u.uGlow.value.lerp(skyAccent, 0.05)
    // FIRST TO ARRIVE. The sources come up out of near-darkness, so the
    // session opens on deep space with light entering it rather than on a
    // finished frame.
    // Fully lifted through hero and About, back to the original grade by
    // Experience, so the handover happens across the same stations the accent
    // hue does and reads as travel rather than as a lighting change.
    const openness = 1 - THREE.MathUtils.smoothstep(s.station, 1.2, 3.0)
    u.uZenith.value.copy(SKY_DEEP_ZENITH).lerp(SKY_OPEN_ZENITH, openness)
    u.uNadir.value.copy(SKY_DEEP_NADIR).lerp(SKY_OPEN_NADIR, openness)

    const lit = 0.12 + ignitionAt(0, 0.4) * 0.88
    u.uGlowPower.value = (0.4 + sampleMood(s.station, 'accentPower') * 0.36 + s.energy * 0.16) * lit
    // The cool source breathes on its own slow cycle, out of phase with the
    // warm one, so the sky is never static even when nothing is happening.
    // Tuned down from 0.4 + cool*0.4: at station 0 that resolved to ~1.02 and
    // the cool lobe flooded most of the frame.
    u.uCoolPower.value =
      (0.24 + sampleMood(s.station, 'coolPower') * 0.26 + Math.sin(s.time * 0.06) * 0.06 + s.energy * 0.1) * lit
  })

  return (
    <mesh ref={meshRef} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[620, 32, 24]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

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

    // CLAMPED. Unclamped, near motes projected to 40+ pixels of soft white,
    // which is what turned the field into bokeh snow drifting across the
    // headline. Dust should read as dust, not as lens blur.
    gl_PointSize = min(aSize * (190.0 / max(-mv.z, 1.0)), 5.0) * (1.0 + uEnergy * 0.25);
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
    // Tight core plus a faint halo, rather than one soft blob. The halo is
    // what the bloom pass catches and turns into an actual light source.
    float soft = smoothstep(0.26, 0.0, d) + smoothstep(0.5, 0.0, d) * 0.3;

    // A minority of motes carry the station accent, so the field picks up the
    // colour of wherever the camera currently is without turning into confetti.
    vec3 col = mix(uColor, uAccent, step(0.86, vDepth) * (0.5 + uEnergy * 0.5));

    gl_FragColor = vec4(col, soft * vAlpha * 0.34);
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
      sizes[i] = (0.5 + Math.random() * 1.5) * quality
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
 * STRUCTURE DRIFTS.
 *
 * These used to be laid out in three lateral bands running parallel to the
 * travel axis - which is to say, walls. Two walls and a path between them is
 * a corridor no matter what you put on them, and that single layout decision
 * was most of why the world read as a tunnel with scenery rather than as open
 * space.
 *
 * They are now CLUSTERS, scattered in irregular volumes near the flight path
 * rather than along either side of it. The camera passes through some, well
 * clear of others, and sometimes has nothing nearby at all. That irregularity
 * is the point: a constant density either side of you is a corridor, while
 * varying density with real gaps reads as a place that happens to have things
 * in it.
 *
 * Orientation is varied too. Parallel alignment was doing useful work when
 * these were speed lines in a tunnel, but in open space everything pointing
 * the same way reads as manufactured.
 *
 * Still one InstancedMesh, so several hundred structures cost a single draw
 * call.
 */
function CorridorStrata({ count }) {
  const meshRef = useRef()
  const safe = useRef(new THREE.Vector3())

  const instances = useMemo(() => {
    const out = []
    // Cluster centres, spread along the flight path and pushed off it in a
    // random direction. Anchoring to the STATIONS means the drifts follow the
    // curve the camera actually flies, so it meets them rather than watching
    // them slide past on rails.
    const CLUSTERS = Math.max(5, Math.round(count / 12))
    const centres = []
    for (let c = 0; c < CLUSTERS; c++) {
      // Weighted into the SECOND HALF of the flight. These are anodised metal
      // slabs several units across - the heaviest material in the world - and
      // spreading them evenly along the path put a scrapyard beside the title
      // before the visitor had read it. The intro carries stars, dust and gas;
      // structure is something the journey travels far enough to find.
      const PATH_START = 0.48
      const t = PATH_START + ((c + 0.5) / CLUSTERS) * (1 - PATH_START)
      const si = Math.min(STATIONS.length - 1, Math.floor(t * (STATIONS.length - 1)))
      const sj = Math.min(STATIONS.length - 1, si + 1)
      const f = t * (STATIONS.length - 1) - si
      const a = STATIONS[si].position
      const b = STATIONS[sj].position

      // Direction away from the path, biased toward the horizontal so drifts
      // sit around the flight rather than directly above and below it.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      // Distance from the path. The first pass started at 18 units with a
      // heavy inward bias, which put the camera INSIDE the drifts - the frame
      // filled with grey slabs and read as a scrapyard. Clusters now start
      // well clear and bias outward, so a drift is something seen across a gap
      // rather than something flown into.
      const dist = 52 + Math.pow(Math.random(), 0.8) * 120

      centres.push([
        a[0] + (b[0] - a[0]) * f + Math.sin(phi) * Math.cos(theta) * dist,
        a[1] + (b[1] - a[1]) * f + Math.cos(phi) * dist * 0.55,
        a[2] + (b[2] - a[2]) * f + Math.sin(phi) * Math.sin(theta) * dist * 0.7,
      ])
    }

    for (let i = 0; i < count; i++) {
      const c = centres[i % CLUSTERS]
      // Spread within the cluster, elongated so a drift reads as a formation
      // rather than as a ball of debris.
      const spread = 8 + Math.random() * 18
      out.push({
        position: [
          c[0] + (Math.random() - 0.5) * spread * 1.6,
          c[1] + (Math.random() - 0.5) * spread * 0.8,
          c[2] + (Math.random() - 0.5) * spread * 2.6,
        ],
        // Varied orientation. Everything parallel reads as manufactured.
        rotation: [
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          (Math.random() - 0.5) * 0.9,
        ],
        // Chunkier proportions. Long thin sticks were right when these were
        // speed lines along a tunnel wall, but scattered in open space a
        // forest of splinters reads as twigs, not architecture. A slab needs
        // enough width and height to catch light on a face.
        scale: [
          1.2 + Math.random() * 4.5,
          1.0 + Math.random() * 5.5,
          4 + Math.random() * 16,
        ],
        drift: 0.05 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
      })
    }
    return out
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const { time, station } = scrollState()

    // Held out of the intro. Weighting the cluster CENTRES toward the far half
    // of the path was not enough on its own: each cluster is pushed up to 170
    // units off the path in a random direction, so a late cluster can still
    // land beside the opening frame. This is the guarantee - before the matter
    // band these collapse to nothing, and the whole layer costs one draw call
    // of degenerate geometry rather than a frame full of grey slabs behind the
    // title.
    const arrived = THREE.MathUtils.smoothstep(station, 3.2, 4.2)
    const shrink = nearFieldsSuppressed() ? 0.45 : 1
    if (arrived <= 0.001) {
      if (mesh.visible) mesh.visible = false
      return
    }
    mesh.visible = true

    // NOTE: these used to fade out against blackHoleState.presence, on the
    // premise that the corridor "gave way" as a transient black hole took the
    // frame. The hole is now a permanent deep-space feature whose presence
    // never returns to zero, so that fade would have erased the midground for
    // the entire journey. The layer stays.

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      dummy.position.set(
        inst.position[0],
        // Barely-there vertical breathing keeps the architecture from reading
        // as a static backdrop when the visitor stops scrolling.
        inst.position[1] + Math.sin(time * inst.drift + inst.phase) * 0.6,
        inst.position[2]
      )
      // SAFE ZONE. A slab is the single most opaque thing that can end up
      // behind a heading, and these are laid out in clusters the camera flies
      // through - so some of them WILL cross the column without this.
      pushOutOfColumn(dummy.position.x, dummy.position.y, dummy.position.z, safe.current, 1, 220, inst.scale[0] * 1.6)
      dummy.position.copy(safe.current)

      dummy.rotation.set(
        inst.rotation[0],
        inst.rotation[1] + time * inst.drift * 0.02,
        inst.rotation[2]
      )
      const k = arrived * shrink
      dummy.scale.set(inst.scale[0] * k, inst.scale[1] * k, inst.scale[2] * k)
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
      {/* Dark anodised metal. It is the environment map and the crimson rim
          that make these visible at all - a diffuse material would render as
          flat grey bars and kill the depth entirely. */}
      {/* Dark anodised metal, deliberately ROUGH. A long rib presents a big
          broadside to the crimson panel in the environment map, and at low
          roughness it mirrors that panel almost perfectly - which turned the
          left of frame into a row of glowing red bars. Roughness scatters that
          reflection into a dim sheen, so the ribs read as structure catching a
          little light rather than as light sources themselves. */}
      <meshStandardMaterial
        color="#2a3142"
        metalness={0.72}
        roughness={0.55}
        envMapIntensity={0.9}
        transparent
        opacity={1}
      />
    </instancedMesh>
  )
}

/* ---------------------------------------------------------- fragments ----- */

/** Mid-depth debris: solid, lit, and slowly tumbling. Catches the key light. */
/**
 * Small metal chunks orbiting the flight path.
 *
 * These belong to the MATTER band with the rest of the physical layers. They
 * used to run for the whole journey, which put a scatter of grey shrapnel
 * around the title -- objects with no compositional job, which is exactly the
 * kind of thing that makes a designed frame look accidental.
 */
function FloatingFragments({ count }) {
  const meshRef = useRef()
  const fragSafe = useRef(new THREE.Vector3())

  const instances = useMemo(() => {
    const out = []
    for (let i = 0; i < count; i++) {
      // Ring distribution with a hollow centre, for the same reason as the
      // strata: debris tumbling across the headline is clutter, not depth.
      // The inner radius is generous because a single fragment drifting near
      // the camera projects large enough to upstage the hero core entirely.
      const angle = Math.random() * Math.PI * 2
      // Pushed further out than before. A fragment drifting near the camera
      // projects large enough to upstage the guardian entirely, and fragments
      // crossing the headline are clutter rather than depth.
      const radius = 16 + Math.random() * 18
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
    const { time, energy, station } = scrollState()
    const arrived = THREE.MathUtils.smoothstep(station, 3.2, 4.2)
    if (arrived <= 0.001) {
      if (mesh.visible) mesh.visible = false
      return
    }
    mesh.visible = true
    // NOTE: these used to fade out against blackHoleState.presence, on the
    // premise that the corridor "gave way" as a transient black hole took the
    // frame. The hole is now a permanent deep-space feature whose presence
    // never returns to zero, so that fade would have erased the midground for
    // the entire journey. The layer stays.

    for (let i = 0; i < instances.length; i++) {
      const f = instances[i]
      dummy.position.set(
        f.position[0] + Math.sin(time * f.bob * 0.5 + f.phase) * 0.4,
        f.position[1] + Math.cos(time * f.bob + f.phase) * 0.5,
        f.position[2]
      )
      // Fragments swell slightly with world energy — the environment reacting.
      const s = f.scale * (1 + energy * 0.25) * arrived

      // SAFE ZONE. These orbit 16-34 units out, which is close enough that a
      // handful sit inside the reading column at any moment. Individually they
      // are small, but a steady trickle of them crossing a paragraph is the
      // "particles passing through the interface" problem, so they clear it
      // like every other near layer.
      pushOutOfColumn(dummy.position.x, dummy.position.y, dummy.position.z, fragSafe.current, 1, undefined, s * 1.4)
      dummy.position.copy(fragSafe.current)

      const spin = time * f.spin
      dummy.rotation.set(spin, spin * 1.3, spin * 0.6)
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
        transparent
        opacity={1}
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
      STATIONS.flatMap((s, i) => {
        // The shafts take each station's accent, which is crimson everywhere.
        // Over the intro that put two glowing red wedges directly behind the
        // title and was most of why the opening read as a red room rather than
        // as space. The first two stations get a cool cosmic tone instead and
        // sit dimmer, so the intro is lit like glass and the crimson identity
        // arrives with the rest of the world.
        const intro = i <= 1
        const color = intro ? '#4f93c6' : s.mood.accent
        const gain = intro ? 0.55 : 1
        return [
          {
            key: `${s.id}-a`,
            position: [s.position[0] - 7, 6, s.position[2] - 8],
            rotation: [0, 0.4, 0.22],
            scale: [7, 26, 1],
            color,
            gain,
            phase: i * 1.7,
          },
          {
            key: `${s.id}-b`,
            position: [s.position[0] + 8, 5, s.position[2] - 20],
            rotation: [0, -0.5, -0.3],
            scale: [5.5, 22, 1],
            color,
            gain,
            phase: i * 2.3 + 0.9,
          },
        ]
      }),
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
      mat.uniforms.uOpacity.value = (0.035 + pulse * 0.05) * (1 + energy * 0.6) * shafts[i].gain
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
    <Sky />
    <StarField count={tier.stars} />
    <CorridorStrata count={tier.strata} />
    <FloatingFragments count={tier.fragments} />
    <LightShafts reducedMotion={reducedMotion} />
    <DustField count={tier.dust} quality={tier.dustScale} />
  </group>
)

export default Atmosphere
