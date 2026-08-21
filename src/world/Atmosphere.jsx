import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { safeZone } from './safeZone'
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
  uniform vec2 uResolution;
  // The measured reading column, in NDC: (left, bottom, right, top).
  uniform vec4 uColumn;
  // How far the sky is pulled down inside that column. 1 = untouched.
  uniform float uColumnDim;
  // Softness of the column's edge, in NDC units.
  uniform float uColumnFeather;

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y * 0.5 + 0.5;
    vec3 col = mix(uNadir, uZenith, smoothstep(0.0, 0.92, h));

    // THE SOURCE IS A SOURCE, NOT A WASH.
    //
    // These lobes used to run at pow(d, 2.6) and pow(d, 3.4) — wide enough
    // that between them they covered most of the sphere, so every pixel of
    // the frame carried some of the light and the image had no dark end at
    // all. A wide, medium-strength lobe is a colour cast; a tight, bright one
    // is a light you can point at. The exponent is the whole difference.
    float d = max(dot(dir, normalize(uGlowDir)), 0.0);
    // The core: small and hot, so there is a genuine highlight in frame.
    col += uGlow * pow(d, 11.0) * uGlowPower * 1.9;
    // Its falloff: wider and much weaker, so the core sits in a halo rather
    // than ending at a hard edge. It must stay faint — this is the term that
    // turns into a wash the moment it is generous.
    col += uGlow * pow(d, 3.2) * uGlowPower * 0.15;

    // The counter-source, opposite and cooler. Kept deliberately smaller than
    // the key: two equal lights leave nowhere for the frame to fall dark, and
    // the dark is what the opening is made of.
    float d2 = max(dot(dir, normalize(-uGlowDir)), 0.0);
    col += uCoolGlow * pow(d2, 7.0) * uCoolPower;

    // A very wide, very weak violet across the belly of the sphere, so the
    // region between the two sources is not a dead value. It is a hint — at
    // any strength where it is identifiable as its own light it has become
    // the flat cast this grade exists to avoid.
    float band = 1.0 - abs(dir.y);
    col += vec3(0.030, 0.017, 0.050) * pow(band, 4.0) * 0.5;

    // THE COLUMN KNOWS WHERE THE TEXT IS.
    //
    // Everything above is the environment's own lighting. This is the part
    // that makes it content-aware: the reading column is measured from the
    // real DOM every frame (see safeZone.js) and handed here in NDC, and the
    // sky is pulled down inside it with a wide, soft falloff. The light is
    // therefore incapable of drifting over the type — not by authoring, not
    // by a scrim painted on top, but because the source is dimmed exactly
    // where the words are and nowhere else.
    //
    // Signed distance to the rectangle: negative inside, positive outside.
    vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    vec2 centre = vec2(uColumn.x + uColumn.z, uColumn.y + uColumn.w) * 0.5;
    vec2 extent = vec2(uColumn.z - uColumn.x, uColumn.w - uColumn.y) * 0.5;
    vec2 q = abs(ndc - centre) - extent;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float shade = 1.0 - smoothstep(-uColumnFeather * 0.35, uColumnFeather, sd);
    col *= mix(1.0, uColumnDim, shade);

    // Hash dither. Very dark wide gradients band badly on 8-bit displays, and
    // banding is the single most "cheap render" artefact there is. It matters
    // more now than it did, because the frame spends far more of its range
    // down near black.
    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * 0.010;

    gl_FragColor = vec4(col, 1.0);
  }
`

const skyAccent = new THREE.Color()
const skyAccentNext = new THREE.Color()
const skyZenith = new THREE.Color()
const skyNadir = new THREE.Color()

/**
 * THE OPENING IS GRADED FOR RANGE, NOT FOR BRIGHTNESS.
 *
 * These four values have now been moved twice, in opposite directions, and the
 * reason is worth recording so it does not happen a third time.
 *
 * They started near-black, which read as an unlit rectangle. The correction
 * lifted the opening to #1d3a6b over #070f20 and widened both sky lobes, and
 * the frame stopped being black — but it became a single flat mid-navy from
 * corner to corner, because every term in the shader was adding light
 * everywhere at once. A frame with no black in it is exactly as cheap as a
 * frame with no light in it, and for the same reason: nothing in it has
 * RANGE, so nothing in it reads as depth.
 *
 * The opening is therefore back near black — and this time that is safe,
 * because the light it lost has been given back as a SOURCE rather than as a
 * floor: one tight, hot lobe in the shader above, the beacon down the
 * corridor, dust lit as it crosses in front of the source, and the forms
 * edged against the dark. Contrast, not exposure. That is the whole grade.
 */
const SKY_OPEN_ZENITH = new THREE.Color('#0d1e3a')
const SKY_OPEN_NADIR = new THREE.Color('#03060e')
const SKY_DEEP_ZENITH = new THREE.Color('#0c1424')
const SKY_DEEP_NADIR = new THREE.Color('#05080f')

/** Where the session starts: the volume before any light has entered it. */
const SKY_DARK_ZENITH = new THREE.Color('#04070f')
const SKY_DARK_NADIR = new THREE.Color('#010204')

const _glowAim = new THREE.Vector3()

function Sky() {
  const matRef = useRef()
  const meshRef = useRef()

  const uniforms = useMemo(
    () => ({
      uZenith: { value: SKY_DARK_ZENITH.clone() },
      uNadir: { value: SKY_DARK_NADIR.clone() },
      // Tracks the station accent — cyan through the opening, violet at
      // Skills, crimson deeper in. One value, so the sky's own light is
      // always the same colour as the light in the scene instead of arguing
      // with it.
      uGlow: { value: new THREE.Color('#3ad4ff') },
      uGlowPower: { value: 0 },
      uCoolGlow: { value: new THREE.Color('#3f9ae8') },
      uCoolPower: { value: 0 },
      uGlowDir: { value: new THREE.Vector3(0.62, 0.34, -0.7) },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      // Full frame until the first measurement lands, with no dimming, so a
      // pre-hydration frame is never a dark hole.
      uColumn: { value: new THREE.Vector4(-1, -1, 1, 1) },
      uColumnDim: { value: 1 },
      uColumnFeather: { value: 0.55 },
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
    u.uResolution.value.set(state.size.width, state.size.height)

    // THE SOURCE IS PLACED AGAINST THE LAYOUT, NOT ON A TIMER.
    //
    // It used to swing on a free-running sine, which meant the brightest part
    // of the sky wandered across the reading column roughly once a minute and
    // nothing downstream knew or cared. The aim is now derived from where the
    // text actually is: it sits on the side of the frame the column does NOT
    // occupy, and high, so it is above the copy rather than behind it. The
    // drift survives — it is just bounded to the free half of the frame now.
    const columnCentre = (safeZone.left + safeZone.right) * 0.5
    // Opposite the column, and never dead ahead: a source on the axis of
    // travel is a headlight, and a headlight flattens everything it lights.
    const freeSide = columnCentre > 0 ? -1 : 1
    const drift = Math.sin(s.time * 0.021 + s.station * 0.38)
    // When the column is full-bleed — a phone, or a data-dense section — there
    // is no free SIDE, only a free TOP, so the source lifts rather than sliding
    // to an edge that does not exist. Same reasoning as the beacon's placement.
    const cramped = safeZone.mobile || safeZone.right - safeZone.left > 1.5
    _glowAim.set(
      freeSide * (cramped ? 0.42 : 0.72 + drift * 0.16),
      (cramped ? 0.62 : 0.30) + Math.cos(s.time * 0.017) * 0.10,
      -0.62
    )
    u.uGlowDir.value.lerp(_glowAim, 0.02)

    // Lerp the key toward the current station's accent. Doing this here rather
    // than hardcoding a hue is what lets the whole sky turn over the course of
    // the journey without a second palette existing anywhere.
    const i = Math.max(0, Math.min(STATIONS.length - 1, Math.floor(s.station)))
    const j = Math.min(STATIONS.length - 1, i + 1)
    skyAccent.set(STATIONS[i].mood.accent).lerp(skyAccentNext.set(STATIONS[j].mood.accent), s.station - i)
    u.uGlow.value.lerp(skyAccent, 0.05)

    // THE AWAKENING, FIRST MOVEMENT: the volume itself arrives.
    //
    // The base grade used to be at full value on frame one, so "ignition" only
    // ever ramped the lobes up over a sky that was already fully lit — which
    // is not an arrival, it is a brightness animation on a finished frame. The
    // ground now lifts out of true darkness first, and only then does anything
    // light it.
    const dawn = ignitionAt(0.0, 0.34)
    const openness = 1 - THREE.MathUtils.smoothstep(s.station, 1.2, 3.0)
    skyZenith.copy(SKY_DEEP_ZENITH).lerp(SKY_OPEN_ZENITH, openness)
    skyNadir.copy(SKY_DEEP_NADIR).lerp(SKY_OPEN_NADIR, openness)
    u.uZenith.value.copy(SKY_DARK_ZENITH).lerp(skyZenith, dawn)
    u.uNadir.value.copy(SKY_DARK_NADIR).lerp(skyNadir, dawn)

    // THE CONTENT-AWARE HALF.
    //
    // The measured column, straight from the same keep-out volume the world's
    // geometry already respects, so the sky and the objects agree about where
    // the words are. The dim is strongest through the opening, where the hero
    // runs `.station--clear` and there is no CSS scrim behind the type at all
    // — deeper sections have the radial scrim and only need a light touch.
    //
    // It is also scaled back when the column is very wide: on a phone, or in a
    // data-dense section, the measured rect can cover most of the viewport,
    // and dimming all of that is just the flat black page by another route.
    const coverage = THREE.MathUtils.clamp((safeZone.right - safeZone.left) / 2, 0, 1)
    const openBand = 1 - THREE.MathUtils.smoothstep(s.station, 0.6, 2.4)
    const floorDim = THREE.MathUtils.lerp(0.30, 0.74, coverage)
    u.uColumnDim.value += (THREE.MathUtils.lerp(0.84, floorDim, openBand) - u.uColumnDim.value) * 0.06
    u.uColumn.value.set(safeZone.left, safeZone.bottom, safeZone.right, safeZone.top)

    // THE AWAKENING, SECOND MOVEMENT: the light enters the volume.
    //
    // Strictly after the ground has lifted, so the order the visitor reads is
    // darkness, then a source in it — not both at once, which is just a fade
    // from black and reads as a page loading rather than as a place waking up.
    const lit = ignitionAt(0.16, 0.62)
    u.uGlowPower.value = (0.34 + sampleMood(s.station, 'accentPower') * 0.30 + s.energy * 0.14) * lit
    // The counter-source stays deliberately under the key. It exists so the
    // shadow side has colour in it; the moment it approaches parity the frame
    // is lit from everywhere and the dark end of the range is gone.
    u.uCoolPower.value =
      (0.10 + sampleMood(s.station, 'coolPower') * 0.13 + Math.sin(s.time * 0.06) * 0.03 + s.energy * 0.06) * lit
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
  // 0..1 slice of the arrival ramp. The particulate is the SECOND thing to
  // exist in the session — after the beacon and before anything structural —
  // because a light with nothing around it is a dot, while a light with dust
  // drifting through it is a volume.
  uniform float uArrive;

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

    gl_FragColor = vec4(col, soft * vAlpha * 0.34 * uArrive);
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
      uArrive: { value: 0 },
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
    // Third beat of the awakening: atmosphere. Overlaps the beacon's halo, so
    // the dust appears to be revealed BY the light strengthening rather than
    // switching on beside it.
    u.uArrive.value = ignitionAt(0.06, 0.44)
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
  uniform float uArrive;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vec3(0.62, 0.65, 0.74), smoothstep(0.5, 0.0, d) * vTwinkle * 0.4 * uArrive);
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

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uArrive: { value: 0 } }), [])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = scrollState().time
      // Earliest of all the fields. Stars are what a dark volume resolves into
      // once the eye adjusts, so they belong before the dust and well before
      // anything with a silhouette.
      matRef.current.uniforms.uArrive.value = ignitionAt(0.03, 0.32)
    }
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
