import React, { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { cursorField } from './cursorFieldState'

/**
 * Drives the cursor field, and renders the motes that gather in it.
 *
 * Two jobs, deliberately in one place so they cannot disagree:
 *
 *   1. Each frame, project the pointer into world space, integrate velocity,
 *      and charge or discharge the dwell value. Everything else in the world
 *      reads that state via influenceAt().
 *
 *   2. Draw the field itself — a cloud of motes that rise and orbit where the
 *      cursor rests. Without something visible AT the cursor, the effect on
 *      distant objects reads as unexplained drift; the motes are what make the
 *      cause legible.
 *
 * All mote motion is computed in the vertex shader from a handful of uniforms,
 * so the cost is a few numbers per frame regardless of count. Nothing here
 * writes to a Float32Array per frame.
 */

const vertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;
  uniform vec3  uCursor;
  uniform float uDwell;
  uniform float uSpeed;
  uniform float uRadius;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vWarm;

  void main() {
    float s = aSeed;

    // Each mote holds its own slot on a slowly precessing orbit. Radius,
    // height and rate all vary per mote so the cloud never reads as a ring.
    float ang = s * 6.2831 + uTime * (0.25 + s * 0.7);
    float orbit = uRadius * (0.18 + s * 0.62);

    // CHARGE LIFTS. Dwell raises the whole cloud and widens it, which is what
    // makes resting the cursor feel like energy accumulating rather than like
    // a static decoration sitting under the pointer.
    float lift = uDwell * (1.4 + s * 3.2);
    float bob = sin(uTime * (0.8 + s * 1.6) + s * 12.0) * 0.35;

    vec3 pos = uCursor;
    pos.x += cos(ang) * orbit * (0.7 + uDwell * 0.6);
    pos.z += sin(ang) * orbit * (0.7 + uDwell * 0.6);
    pos.y += lift + bob + (s - 0.5) * uRadius * 0.5;

    // Moving the cursor smears the cloud behind it: motes lag rather than
    // teleporting, so fast movement reads as drag through a medium.
    pos -= normalize(vec3(1.0, 0.0, 0.0)) * 0.0; // no-op, keeps layout readable

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Brighter when charged and when stirred, so both kinds of input register.
    // Visible, but still under the bloom threshold. These were dimmed hard
    // earlier on the assumption that they were the source of the blocky
    // squares in frame; they were not — that was the globular cluster, which
    // used PointsMaterial and therefore drew square sprites. Corrected back to
    // a level where resting the cursor actually reads as energy gathering.
    vAlpha = (0.16 + uDwell * 0.46) * (0.62 + uSpeed * 0.38);
    vWarm = step(0.86, s);

    gl_PointSize = clamp(aSize * (135.0 / max(-mv.z, 1.0)), 0.8, 4.2) * uPixelRatio;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // Tight core, soft halo — the halo is what the bloom pass turns into light.
    float core = smoothstep(0.28, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.3;
    vec3 cool = vec3(0.62, 0.72, 0.9);
    vec3 warm = vec3(1.0, 0.55, 0.42);
    gl_FragColor = vec4(mix(cool, warm, vWarm), (core + halo) * vAlpha);
  }
`

export default function CursorField({ count = 260, radius = 7, reducedMotion = false }) {
  const { camera } = useThree()
  const matRef = useRef()

  const ndc = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3(0, 0, -20))
  const previous = useRef(new THREE.Vector3(0, 0, -20))
  const stillFor = useRef(0)
  const lastPointer = useRef({ x: 0, y: 0 })

  const { positions, seeds, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Golden-ratio stride rather than random: evenly distributed seeds mean
      // the orbits spread instead of clumping.
      seeds[i] = (i * 0.6180339887) % 1
      sizes[i] = 0.5 + Math.pow((i * 0.7548776662) % 1, 2.6) * 2.6
    }
    return { positions, seeds, sizes }
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCursor: { value: new THREE.Vector3(0, 0, -20) },
      uDwell: { value: 0 },
      uSpeed: { value: 0 },
      uRadius: { value: radius },
      uPixelRatio: { value: 1 },
    }),
    [radius]
  )

  useFrame((state, delta) => {
    const s = scrollState()
    const dt = Math.min(0.05, delta)

    // Reduced motion switches the whole field off rather than slowing it: a
    // pointer-driven force is exactly the kind of continuous motion the
    // preference exists to remove.
    cursorField.gain = reducedMotion ? 0 : 1
    if (reducedMotion) {
      cursorField.dwell = 0
      if (matRef.current) matRef.current.uniforms.uDwell.value = 0
      return
    }

    // A pointer that has never moved sits at NDC 0,0 — dead centre, not
    // "nowhere". Reacting to that would charge the field over the middle of
    // the page for touch and keyboard visitors who never moved anything.
    if (Math.abs(s.pointerX) > 0.0001 || Math.abs(s.pointerY) > 0.0001) {
      cursorField.live = true
    }
    if (!cursorField.live) return

    /* ---- project the pointer onto a plane facing the camera ---- */
    // Placed at a fixed distance ahead rather than on geometry: raycasting the
    // scene every frame to find a surface is expensive, and there is often no
    // surface under the pointer at all out here.
    ndc.current.set(s.pointerSmoothX, s.pointerSmoothY, 0.5).unproject(camera)
    const dir = ndc.current.sub(camera.position).normalize()
    target.current.copy(camera.position).addScaledVector(dir, 26)

    // Spring toward the target rather than snapping: the field has mass, so it
    // trails the pointer slightly and overshoots on a fast flick.
    const ease = 1 - Math.exp(-7 * dt)
    previous.current.copy(cursorField.position)
    cursorField.position.lerp(target.current, ease)

    /* ---- velocity and stillness, measured in SCREEN space ---- */
    // This has to come from the pointer, not from the field's world position.
    // The camera is always moving along its curved path, so the projected
    // world point chases it every frame even when the mouse is perfectly
    // still — measured that way, a motionless cursor reported a constant speed
    // of 0.7 and dwell could never charge at all. Stillness is a fact about
    // the user's hand, which is a screen-space quantity.
    const dxs = s.pointerX - lastPointer.current.x
    const dys = s.pointerY - lastPointer.current.y
    lastPointer.current.x = s.pointerX
    lastPointer.current.y = s.pointerY
    const screenSpeed = Math.hypot(dxs, dys) / Math.max(dt, 0.0001)

    cursorField.velocity.copy(cursorField.position).sub(previous.current).divideScalar(Math.max(dt, 0.0001))
    cursorField.speed += (Math.min(1, screenSpeed / 1.6) - cursorField.speed) * (1 - Math.exp(-7 * dt))

    // Charge while still, discharge while moving. Charging is faster than
    // discharging on purpose: energy should build in a couple of seconds and
    // bleed away over four, so leaving an area looks like settling rather than
    // like an animation being cancelled.
    if (cursorField.speed < 0.06) {
      stillFor.current += dt
      cursorField.dwell = Math.min(1, cursorField.dwell + dt / 2.0)
    } else {
      stillFor.current = 0
      cursorField.dwell = Math.max(0, cursorField.dwell - dt / 4.0)
    }

    /* ---- feed the motes ---- */
    const u = matRef.current?.uniforms
    if (!u) return
    u.uTime.value = s.time
    u.uCursor.value.copy(cursorField.position)
    u.uDwell.value = cursorField.dwell
    u.uSpeed.value = cursorField.speed
    u.uPixelRatio.value = state.viewport.dpr || 1
  })

  if (reducedMotion) return null

  return (
    <points frustumCulled={false} renderOrder={8}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aSeed" count={count} array={seeds} itemSize={1} />
        <bufferAttribute attach="attributes-aSize" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
