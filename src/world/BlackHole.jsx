import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { getNoiseTexture } from './noise'
import { BH_HORIZON_R, BH_POSITION, bhPresence, blackHoleState } from './blackHoleState'

/**
 * The black hole.
 *
 * A physical destination inside the corridor rather than a picture hung behind
 * it. It is parked off the travel axis roughly three and a half stations down,
 * so scrolling genuinely carries you toward it, past it, and away — it grows,
 * dominates the frame, and falls behind you.
 *
 * FOUR LAYERS, EACH DOING ONE JOB
 * -------------------------------
 *  1. EVENT HORIZON — a pure black sphere that writes depth. This is the only
 *     object in the world allowed to be flat black, because that is what it
 *     physically is: the one place no light escapes from. It occludes the disk
 *     behind it, which is what makes the disk read as passing around a solid.
 *  2. ACCRETION DISK — a shaded ring with differential rotation (inner
 *     material orbits faster than outer, as it actually does), a white-hot
 *     inner edge falling to crimson, and relativistic beaming so the side
 *     rotating toward the camera is brighter. That asymmetry is the single
 *     detail that separates a real-looking disk from a spinning texture.
 *  3. PHOTON RING — a thin, very bright ring just outside the horizon.
 *  4. INFALLING DEBRIS — points on decaying orbits, spiralling in.
 *
 * The actual light-bending is NOT here: it is a screen-space warp in the
 * composite pass, because lensing has to distort what is already behind the
 * hole. This component publishes its screen position and apparent size to
 * blackHoleState, and PostFX reads them.
 */

/**
 * Where the hole sits, and when it owns the frame.
 *
 * These are two different numbers, and conflating them was the first mistake:
 * parking it AT the station where it should be most present put it exactly
 * abeam the camera at that moment - ninety degrees off the view axis, and so
 * never in frame at all.
 *
 * It sits BEYOND the last station, so it is always ahead of the camera and
 * never abeam or behind it. That is what makes it a destination: it appears
 * small and near the centre of frame, grows steadily across the whole second
 * half of the journey as the camera closes, dominates, and is then released.
 *
 * The lateral offset is small - just enough to sit right of the reading column
 * without leaving the middle of the composition.
 */
// Position, size and timing are shared with the camera - see blackHoleState.
const HORIZON_R = BH_HORIZON_R
const DISK_INNER = HORIZON_R * 1.45
const DISK_OUTER = HORIZON_R * 2.4

/* ------------------------------------------------------------------ disk -- */

const diskVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const diskFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vLocal;

  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uOpacity;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCold;
  uniform vec2 uBeamDir;

  // Noise comes from a shared texture now.
  //
  // This used to be procedural: two noise() calls per fragment, each doing
  // four hash() calls - eight sin() and eight fract() per pixel. That was
  // affordable when the disk covered a small part of the frame and appeared
  // only briefly. The hole is now a permanent feature covering a large share
  // of the screen, and that cost became the single most expensive thing added
  // to every frame. Two texture fetches replace all of it.
  uniform sampler2D uNoise;

  void main() {
    float r = length(vLocal.xy);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);

    // DIFFERENTIAL ROTATION. Material close in orbits much faster than
    // material further out, so the disk shears itself into spiral banding
    // instead of turning as one rigid plate.
    // 1/x^1.5 written as inversesqrt(x)/x: same curve, no pow().
    float rr = max(r, 0.001) * 0.09;
    float omega = inversesqrt(rr) / rr;
    float swirl = angle + uTime * omega * 0.02;

    // Two noise octaves along the sheared coordinate: filaments, not fog.
    float n = texture2D(uNoise, vec2(swirl * 0.38, t * 1.1)).r * 0.65
            + texture2D(uNoise, vec2(swirl * 0.81, t * 2.4)).r * 0.35;

    // Radial falloff: incandescent at the inner edge, gone at the outer.
    float body = pow(1.0 - t, 2.2) * smoothstep(0.0, 0.06, t);
    float density = body * (0.7 + n * 1.15);

    // RELATIVISTIC BEAMING. The limb rotating toward the viewer is brighter
    // and bluer; the receding limb dims. Faked as a directional gain, but it
    // is the asymmetry the eye reads as "this is really spinning".
    vec2 dir = normalize(vLocal.xy + vec2(0.0001));
    float beam = dot(dir, uBeamDir);
    density *= mix(0.55, 2.6, smoothstep(-1.0, 1.0, beam));

    vec3 col = mix(uMid, uHot, pow(1.0 - t, 3.0));
    col = mix(uCold, col, smoothstep(0.0, 0.55, 1.0 - t));

    gl_FragColor = vec4(col, clamp(density, 0.0, 1.4) * uOpacity);
  }
`

/* --------------------------------------------------------------- debris --- */

const debrisVertex = /* glsl */ `
  attribute float aRadius;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aTilt;
  attribute float aSize;

  uniform float uTime;
  uniform float uInner;

  varying float vFade;

  void main() {
    // Decaying orbit: radius shrinks over the particle's own lifetime, then it
    // wraps back out. Everything here is falling in, which is the behaviour
    // that makes the hole read as gravity rather than as a spinning ring.
    float life = fract(aPhase + uTime * 0.018 * aSpeed);
    float r = mix(aRadius, uInner * 0.92, life);

    // Angular speed rises sharply as it falls, per Kepler.
    float omega = uTime * aSpeed * (2.4 / pow(max(r, 0.5) * 0.1, 1.5)) * 0.02;
    float a = aPhase * 6.283 + omega;

    vec3 p = vec3(cos(a) * r, sin(a) * r, 0.0);
    // A little vertical scatter so the disk has thickness near the plane.
    p.z = sin(a * 3.0 + aPhase * 12.0) * aTilt * r * 0.05;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Fade in as it appears at the outer edge, out as it crosses the horizon.
    vFade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.86, life);
    gl_PointSize = clamp(aSize * (260.0 / max(-mv.z, 1.0)), 0.7, 4.5);
  }
`

const debrisFragment = /* glsl */ `
  varying float vFade;
  uniform float uOpacity;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.3, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.72, 0.62), core * vFade * uOpacity);
  }
`


/* -------------------------------------------------------------- lensing -- */

/**
 * The arc of the disk that lensing wraps OVER the top of the shadow.
 *
 * A flat accretion disk drawn honestly is an ellipse with a black sphere in
 * the middle of it - which reads as a hole punched in a sheet, not as a black
 * hole. The reason the real thing looks the way it does is that gravity bends
 * light from the FAR side of the disk up and over the shadow, so you see the
 * underside of the disk arcing above the horizon and the top side arcing
 * below it.
 *
 * Actually integrating those null geodesics is not something this frame budget
 * can carry, so this is a camera-facing annulus whose brightness is
 * concentrated at the top and bottom - the two places the lensed images
 * appear. Combined with the honest tilted disk behind it, it produces the
 * silhouette everyone recognises for the cost of one billboard.
 */
const arcFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uOpacity;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uHot;
  uniform vec3 uCold;
  uniform float uTime;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r < uInner || r > uOuter) discard;

    float t = (r - uInner) / (uOuter - uInner);

    // Brightness concentrated at the top and bottom of the ring, falling away
    // at the sides where the honest disk already covers the silhouette.
    float vertical = abs(normalize(p + vec2(0.0001)).y);
    float lobes = pow(vertical, 2.6);

    // The upper arc is the brighter one, because it is the image of the disk
    // material moving toward the observer.
    float upper = p.y > 0.0 ? 1.0 : 0.62;

    // A slow shimmer, so the arc is never a static decal.
    float shimmer = 0.86 + 0.14 * sin(uTime * 0.8 + atan(p.y, p.x) * 3.0);

    float band = smoothstep(0.0, 0.22, t) * smoothstep(1.0, 0.45, t);
    vec3 col = mix(uCold, uHot, pow(1.0 - t, 2.0));

    gl_FragColor = vec4(col, band * lobes * upper * shimmer * uOpacity);
  }
`

/* ------------------------------------------------------------------ root -- */

/**
 * Diagnostic switch: ?bh=1 pins the hole to full presence.
 *
 * Its presence is normally a function of scroll station, which makes it
 * genuinely awkward to iterate on - every look at it requires landing the
 * scroll within a narrow band. This holds it at full strength so the disk,
 * beaming and lensing can be judged directly.
 */
const pinned = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('bh')

export default function BlackHole({ enabled = true, debrisCount = 900, reducedMotion = false }) {
  const groupRef = useRef()
  const diskRef = useRef()
  const debrisRef = useRef()
  const photonRef = useRef()
  const arcRef = useRef()
  const horizonRef = useRef()

  const projected = useMemo(() => new THREE.Vector3(), [])

  const debris = useMemo(() => {
    const n = debrisCount
    const radii = new Float32Array(n)
    const speeds = new Float32Array(n)
    const phases = new Float32Array(n)
    const tilts = new Float32Array(n)
    const sizes = new Float32Array(n)
    const positions = new Float32Array(n * 3) // required by three, authored in shader
    for (let i = 0; i < n; i++) {
      radii[i] = DISK_INNER + Math.pow(Math.random(), 0.7) * (DISK_OUTER * 1.25 - DISK_INNER)
      speeds[i] = 0.6 + Math.random() * 1.1
      phases[i] = Math.random()
      tilts[i] = Math.random()
      sizes[i] = 0.5 + Math.pow(Math.random(), 2.5) * 2.4
    }
    return { radii, speeds, phases, tilts, sizes, positions, n }
  }, [debrisCount])

  const diskUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uNoise: { value: getNoiseTexture() },
      uInner: { value: DISK_INNER },
      uOuter: { value: DISK_OUTER },
      uOpacity: { value: 0 },
      // White-hot inner edge falling through ember to the brand crimson. The
      // ramp is what carries the temperature read.
      uHot: { value: new THREE.Color('#fff2ec') },
      uMid: { value: new THREE.Color('#ff6a4d') },
      uCold: { value: new THREE.Color('#8e0f22') },
      uBeamDir: { value: new THREE.Vector2(1, 0) },
    }),
    []
  )

  const arcUniforms = useMemo(
    () => ({
      uOpacity: { value: 0 },
      // Expressed as a fraction of the billboard's half-size, which is set to
      // DISK_OUTER below - so these track the disk automatically.
      uInner: { value: (HORIZON_R * 1.06) / DISK_OUTER },
      uOuter: { value: (HORIZON_R * 2.3) / DISK_OUTER },
      uHot: { value: new THREE.Color('#fff0e6') },
      uCold: { value: new THREE.Color('#c9243f') },
      uTime: { value: 0 },
    }),
    []
  )

  const debrisUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uInner: { value: DISK_INNER }, uOpacity: { value: 0 } }),
    []
  )

  useFrame((state) => {
    if (!enabled || !groupRef.current) return
    const s = scrollState()
    const { camera, size } = state

    /* ---- how present is it right now ---- */
    // ASYMMETRIC. A symmetric bump around one station is wrong for an
    // approach: arriving should be a long slow build and leaving should be
    // decisive. It rises across four stations, holds through the climax, then
    // falls away over one - which also stops the hole from engulfing the frame
    // as the camera closes the last stretch, where its apparent radius grows
    // faster than any presence curve could sensibly track.
    const presence = pinned() ? 1 : bhPresence(s.station)

    blackHoleState.presence = presence
    groupRef.current.visible = presence > 0.005
    if (!groupRef.current.visible) {
      blackHoleState.strength = 0
      return
    }

    const time = reducedMotion ? 0 : s.time

    if (diskRef.current) {
      diskRef.current.material.uniforms.uTime.value = time
      diskRef.current.material.uniforms.uOpacity.value = presence * (1.3 + s.energy * 0.3)
      // The beaming axis is fixed in the disk's own frame, so the bright limb
      // stays on the same side of the disk as the camera moves past it.
      diskRef.current.material.uniforms.uBeamDir.value.set(Math.cos(0.6), Math.sin(0.6))
    }
    if (debrisRef.current) {
      debrisRef.current.material.uniforms.uTime.value = time
      debrisRef.current.material.uniforms.uOpacity.value = presence * 1.15
    }
    if (arcRef.current) {
      // Camera-facing: the lensed images always appear around the silhouette
      // from wherever it is being viewed.
      arcRef.current.quaternion.copy(camera.quaternion)
      arcRef.current.material.uniforms.uOpacity.value = presence * 0.95
      arcRef.current.material.uniforms.uTime.value = time
    }
    if (photonRef.current) {
      photonRef.current.material.opacity = presence * 1.0
      // Always edge-on to the camera: the photon ring is the image of light
      // orbiting the hole, so it faces the viewer from every angle.
      photonRef.current.quaternion.copy(camera.quaternion)
    }
    if (horizonRef.current) horizonRef.current.visible = presence > 0.02

    /* ---- publish screen position for the lensing pass ---- */
    // The camera's world matrix must be current before projecting. CameraRig
    // sets position and calls lookAt in its own useFrame, but lookAt only
    // touches the quaternion - matrixWorld is still last frame's until three
    // refreshes it. Projecting against the stale matrix produced screen-space
    // y values in the tens (they are meant to be 0..1), which the in-frame
    // gate then correctly rejected - so the lensing silently switched itself
    // off at exactly the moment the hole filled the shot.
    camera.updateMatrixWorld()
    projected.copy(BH_POSITION).project(camera)
    const onScreen = projected.z < 1
    blackHoleState.x = projected.x * 0.5 + 0.5
    blackHoleState.y = projected.y * 0.5 + 0.5

    // Apparent radius, converted from world units to a fraction of screen
    // height using the camera's own vertical FOV at that distance.
    const dist = camera.position.distanceTo(BH_POSITION)
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist
    blackHoleState.radius = HORIZON_R / Math.max(halfH, 0.001) * 0.5
    const inFrame =
      onScreen && Math.abs(projected.x) < 1.5 && Math.abs(projected.y) < 1.5
    blackHoleState.strength = inFrame && !reducedMotion ? presence : 0
    void size
  })

  if (!enabled) return null

  return (
    <group ref={groupRef} position={BH_POSITION}>
      {/* Event horizon. The one object in this world allowed to be flat black,
          because that is literally what it is. It writes depth so the far side
          of the disk is correctly hidden behind it. */}
      <mesh ref={horizonRef} renderOrder={5}>
        <sphereGeometry args={[HORIZON_R, 48, 32]} />
        <meshBasicMaterial color="#000000" fog={false} toneMapped={false} />
      </mesh>

      {/* Lensed arcs over and under the shadow. Drawn before the photon ring
          so the ring reads as the hard inner edge on top of them. */}
      <mesh ref={arcRef} renderOrder={5}>
        <planeGeometry args={[DISK_OUTER * 2, DISK_OUTER * 2]} />
        <shaderMaterial
          uniforms={arcUniforms}
          vertexShader={diskVertex}
          fragmentShader={arcFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>

      {/* Photon ring: the bright halo at the edge of the shadow. */}
      <mesh ref={photonRef} renderOrder={6}>
        <ringGeometry args={[HORIZON_R * 1.01, HORIZON_R * 1.09, 128]} />
        <meshBasicMaterial
          color="#ffd9c9"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Accretion disk, tilted so it is seen at a dramatic angle rather than
          face-on or edge-on. */}
      <mesh ref={diskRef} rotation={[Math.PI / 2 - 0.42, 0, 0.35]} renderOrder={4}>
        {/* 128x12 rather than 192x48. The radial detail was buying nothing -
            the disk's structure comes from the shader, not the tessellation -
            and 48 radial rings cost 18k triangles for a shape whose silhouette
            is two circles. */}
        <ringGeometry args={[DISK_INNER, DISK_OUTER, 128, 12]} />
        <shaderMaterial
          uniforms={diskUniforms}
          vertexShader={diskVertex}
          fragmentShader={diskFragment}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>

      {/* Infalling debris, on the same plane as the disk. */}
      <points ref={debrisRef} rotation={[Math.PI / 2 - 0.42, 0, 0.35]} frustumCulled={false} renderOrder={4}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={debris.n} array={debris.positions} itemSize={3} />
          <bufferAttribute attach="attributes-aRadius" count={debris.n} array={debris.radii} itemSize={1} />
          <bufferAttribute attach="attributes-aSpeed" count={debris.n} array={debris.speeds} itemSize={1} />
          <bufferAttribute attach="attributes-aPhase" count={debris.n} array={debris.phases} itemSize={1} />
          <bufferAttribute attach="attributes-aTilt" count={debris.n} array={debris.tilts} itemSize={1} />
          <bufferAttribute attach="attributes-aSize" count={debris.n} array={debris.sizes} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={debrisUniforms}
          vertexShader={debrisVertex}
          fragmentShader={debrisFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </group>
  )
}
