import React, { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { chargedInfluenceAt } from './cursorFieldState'
import { artifactState } from './artifactState'
import { playCrack, playImpact, playReassemble } from '../lib/crackAudio'

/**
 * THE ARTIFACT — the one cinematic event in the home experience.
 *
 * A single abstract computational object that begins as a point of light far
 * down the corridor, closes on the camera as the visitor scrolls, fills the
 * entire viewport, breaks, and blows past the lens. It is the "shot" the rest
 * of the opening is composed around.
 *
 * IT IS ONE OBJECT, AND THAT IS THE DESIGN. The temptation with a directive
 * like this is fifty things flying around. Fifty things flying around is a
 * screensaver; one thing that grows from four pixels to larger than the screen
 * is a scene, because the eye can actually track it and therefore feels the
 * scale change. Everything else in the world stays where it is.
 *
 * WHAT IT IS NOT: not a saucer, not a craft, not anything with a front or a
 * cockpit. It is a lens of glass held inside two counter-rotating angular
 * rings — closer to an instrument than a vehicle. The moment it reads as a
 * ship it becomes science fiction set dressing, and this world is supposed to
 * be abstract.
 *
 * THE TIMELINE, in station units (0 = hero, 1 = about):
 *
 *   0.00-0.16  dormant    nothing drawn
 *   0.16-0.58  approach   a far point, growing slowly, drifting laterally
 *   0.58-0.86  closing    accelerating hard; it becomes the subject
 *   0.86-1.00  eclipse    fills and exceeds the frame; the flash peaks
 *   1.00-1.26  fracture   the shell bursts and the shards blow past the lens
 *   1.26+      gone
 *
 * The acceleration is not linear and must not be. A constant-rate approach
 * reads as a zoom; real approach is dominated by the inverse-square of
 * distance, so almost all of the apparent size change happens in the last
 * fifth of the travel. That is what makes the final moment feel like impact
 * rather than like a scale animation.
 *
 * CURSOR: while the object is mid-distance the pointer can stress the shell —
 * shards lift off their seats, the seams light, and it audibly ticks. Move
 * away and it pulls itself back together. The eclipse then overrides all of
 * it and breaks the shell completely.
 */

const SHARDS = 84

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const span = (v, a, b) => clamp01((v - a) / (b - a))
const easeIn = (t) => t * t * t
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/* ------------------------------------------------------------------ core -- */

const coreVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vView;
  void main() {
    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const coreFragment = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vView;
  uniform vec3 uCold;
  uniform vec3 uHot;
  uniform float uCharge;
  uniform float uOpacity;

  void main() {
    float f = pow(1.0 - max(dot(normalize(vNormalW), normalize(vView)), 0.0), 2.0);

    // Chromatic split across the fresnel: the rim runs hot and the face stays
    // cold, so the lens reads as a refracting solid rather than a coloured
    // shell. Cheap stand-in for real dispersion, and at this scale the eye
    // cannot tell the difference.
    vec3 tint = mix(uCold, uHot, f * (0.5 + uCharge * 0.5));

    // Internal glow: the object is lit from inside, which is what makes it an
    // instrument rather than a rock catching the scene's lights.
    float inner = 0.18 + uCharge * 0.55;

    gl_FragColor = vec4(tint * (inner + f * 2.2), (0.10 + f * 0.82) * uOpacity);
  }
`

/* ------------------------------------------------------------------ halo -- */

const haloFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uAmount;
  uniform vec3 uColor;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    // Tight core plus a wide bloom, so it reads as a point source rather than
    // a soft blob — a distant light has a hard centre.
    float core = smoothstep(0.16, 0.0, r);
    float glow = pow(smoothstep(1.0, 0.0, r), 2.6);
    gl_FragColor = vec4(uColor * (1.4 + core * 2.2), (core * 0.9 + glow * 0.42) * uAmount);
  }
`

/* ----------------------------------------------------------------- flash -- */

const flashFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uAmount;
  uniform vec3 uColor;
  void main() {
    // Brightest at the centre, falling off to the corners, so the flash reads
    // as light coming THROUGH something rather than as the renderer clearing
    // to white.
    float r = length(vUv - 0.5) * 1.7;
    float core = smoothstep(1.0, 0.0, r);
    gl_FragColor = vec4(uColor, core * uAmount);
  }
`

const flashVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export default function Artifact({ reducedMotion = false }) {
  const { camera } = useThree()

  const groupRef = useRef()
  const shellRef = useRef()
  const coreRef = useRef()
  const coreMatRef = useRef()
  const ringARef = useRef()
  const ringBRef = useRef()
  const lightRef = useRef()
  const haloRef = useRef()
  const haloMatRef = useRef()
  const flashRef = useRef()
  const flashMatRef = useRef()

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  const seatPos = useMemo(() => new THREE.Vector3(), [])

  // Audio edge-detection. Sound must fire on TRANSITIONS, not on levels —
  // triggering from a continuous value plays a crack every frame.
  const lastFracture = useRef(0)
  const crackCooldown = useRef(0)
  const impactFired = useRef(false)

  /**
   * Shard seats, arranged on a LENS rather than a sphere.
   *
   * The radius falls off with |y|, so the silhouette is a flattened disc seen
   * edge-on and a ring seen face-on. That single choice is most of what stops
   * it reading as a ball of debris.
   */
  const shards = useMemo(() => {
    const out = []
    for (let i = 0; i < SHARDS; i++) {
      // Fibonacci distribution, then squashed. Even coverage without the
      // pole-clustering a naive lat/long loop produces.
      const t = (i + 0.5) / SHARDS
      const y = 1 - 2 * t
      const rad = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = i * 2.399963
      const squash = 0.34

      const seat = new THREE.Vector3(Math.cos(theta) * rad, y * squash, Math.sin(theta) * rad)
      // Push out along the lens normal so seats sit on the surface.
      const normal = seat.clone().normalize()

      out.push({
        seat,
        normal,
        // Where the shard flies to when the shell breaks. Outward and
        // forward — toward the camera — so the burst comes at the viewer.
        burst: normal
          .clone()
          .multiplyScalar(3.2 + Math.random() * 5.5)
          .add(new THREE.Vector3(0, 0, 2.2 + Math.random() * 3.5)),
        size: 0.07 + Math.pow(Math.random(), 1.7) * 0.1,
        spin: (Math.random() - 0.5) * 3.4,
        seed: Math.random(),
      })
    }
    return out
  }, [])

  const coreUniforms = useMemo(
    () => ({
      uCold: { value: new THREE.Color('#1d5f96') },
      uHot: { value: new THREE.Color('#9df0ff') },
      uCharge: { value: 0 },
      uOpacity: { value: 0 },
    }),
    []
  )

  const haloUniforms = useMemo(
    () => ({ uAmount: { value: 0 }, uColor: { value: new THREE.Color('#8fe2ff') } }),
    []
  )

  const flashUniforms = useMemo(
    () => ({ uAmount: { value: 0 }, uColor: { value: new THREE.Color('#cfeeff') } }),
    []
  )

  useFrame((_state, delta) => {
    const g = groupRef.current
    const shell = shellRef.current
    if (!g || !shell) return

    const { station, time, energy } = scrollState()
    const dt = Math.min(0.05, delta)

    /* ---- presence ------------------------------------------------------ */
    const live = station > 0.16 && station < 1.3
    if (!live) {
      if (g.visible) {
        g.visible = false
        artifactState.progress = 0
        artifactState.flash = 0
        artifactState.fracture = 0
        artifactState.dominance = 0
      }
      if (flashRef.current) flashRef.current.visible = false
      impactFired.current = false
      return
    }
    g.visible = true

    // 0..1 across the whole event.
    const p = span(station, 0.16, 1.26)
    artifactState.progress = p
    // Rises through the closing phase and holds through the break, so the rest
    // of the world clears the frame while this is the subject.
    artifactState.dominance = reducedMotion ? 0 : span(station, 0.58, 0.97)

    /* ---- distance: inverse-square-ish, not linear ---------------------- */
    // Reduced motion parks it mid-approach and never brings it at the camera.
    // A large object rushing the viewport is exactly the kind of vestibular
    // trigger the preference exists to prevent.
    const travel = reducedMotion ? 0.42 : span(station, 0.16, 1.0)
    const eased = easeIn(travel)
    const FAR = 300
    const NEAR = 1.35
    const dist = FAR - (FAR - NEAR) * eased

    // Held off-axis for most of the approach so it does not read as a
    // dead-centre zoom, then pulled to centre as it closes.
    const centring = easeOut(span(station, 0.55, 0.94))
    const offX = (1 - centring) * 26 * Math.cos(station * 1.9 + 0.4)
    const offY = (1 - centring) * 13 * Math.sin(station * 2.4)

    scratch.set(offX, offY, -dist).applyMatrix4(camera.matrixWorld)
    g.position.copy(scratch)
    // Faces the camera, then rolls slowly on its own axis.
    g.quaternion.copy(camera.quaternion)
    g.rotateZ(time * 0.11 + station * 2.2)
    g.rotateX(0.34 + Math.sin(station * 1.6) * 0.22)

    // Scale grows with proximity as well as distance shrinking, so the last
    // stretch is genuinely overwhelming rather than merely nearer.
    const grow = 1 + easeIn(span(station, 0.6, 1.02)) * 5.5
    g.scale.setScalar(grow)

    /* ---- fracture ------------------------------------------------------ */
    // Two sources: the cursor stressing the shell mid-approach, and the
    // eclipse breaking it outright.
    const cursorStress = reducedMotion
      ? 0
      : chargedInfluenceAt(g.position.x, g.position.y, g.position.z, 34 + grow * 6)
    const eclipseBreak = span(station, 0.98, 1.2)
    const fracture = clamp01(Math.max(cursorStress * 0.72, eclipseBreak))
    artifactState.fracture = fracture

    /* ---- audio, on edges only ------------------------------------------ */
    crackCooldown.current -= dt
    const rising = fracture - lastFracture.current
    if (rising > 0.035 && crackCooldown.current <= 0 && fracture > 0.06) {
      playCrack(fracture)
      crackCooldown.current = 0.11
      artifactState.justCracked = true
    } else {
      artifactState.justCracked = false
    }
    if (rising < -0.05 && crackCooldown.current <= 0 && lastFracture.current > 0.25) {
      playReassemble(lastFracture.current)
      crackCooldown.current = 0.3
    }
    if (!impactFired.current && station > 0.99) {
      playImpact()
      impactFired.current = true
    }
    if (station < 0.9) impactFired.current = false
    lastFracture.current = fracture

    /* ---- shards -------------------------------------------------------- */
    const burstAmount = easeIn(eclipseBreak)
    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i]

      // Staggered so the shell peels rather than exploding as one piece.
      const lead = clamp01(fracture * 1.5 - sh.seed * 0.5)
      const blast = clamp01(burstAmount * 1.6 - sh.seed * 0.6)

      seatPos.copy(sh.seat)
      // Cursor stress lifts a shard along its own normal — the seam opens.
      seatPos.addScaledVector(sh.normal, lead * 0.5)
      // The eclipse throws it away entirely.
      seatPos.lerp(sh.burst, blast)

      // Idle breathing so the shell is never rigid.
      const breathe = Math.sin(time * 1.4 + sh.seed * 8) * 0.012 * (1 - blast)
      seatPos.addScaledVector(sh.normal, breathe)

      dummy.position.copy(seatPos)
      const tumble = time * sh.spin * (0.15 + lead + blast * 3)
      dummy.rotation.set(tumble * 0.7, tumble, tumble * 0.4)
      dummy.scale.setScalar(sh.size * (1 - blast * 0.35))
      dummy.updateMatrix()
      shell.setMatrixAt(i, dummy.matrix)
    }
    shell.instanceMatrix.needsUpdate = true

    /* ---- core and rings ------------------------------------------------ */
    const charge = clamp01(span(station, 0.4, 1.0) + energy * 0.2 + cursorStress * 0.4)
    if (coreMatRef.current) {
      const u = coreMatRef.current.uniforms
      u.uCharge.value = charge
      // The core survives the shell and keeps burning until the very end.
      u.uOpacity.value = clamp01(1 - span(station, 1.05, 1.24))
    }
    if (coreRef.current) {
      coreRef.current.scale.setScalar(0.82 + charge * 0.1 - burstAmount * 0.5)
    }
    if (ringARef.current) ringARef.current.rotation.z = time * 0.6 + fracture * 3
    if (ringBRef.current) ringBRef.current.rotation.z = -time * 0.42 - fracture * 2.2
    if (lightRef.current) {
      lightRef.current.intensity = (8 + charge * 40) * clamp01(1 - span(station, 1.05, 1.24))
      lightRef.current.distance = 40 + grow * 20
    }

    /* ---- the distant halo ---------------------------------------------- */
    // Owns the object visually while it is far away, hands over to the real
    // geometry as it closes. Scaled in WORLD units against distance so its
    // apparent size stays roughly constant until the handover.
    if (haloRef.current && haloMatRef.current) {
      const near = span(dist, 26, 150)
      const amt = clamp01(near) * clamp01(span(station, 0.16, 0.28)) * (0.8 + charge * 0.5)
      haloMatRef.current.uniforms.uAmount.value = amt
      haloRef.current.visible = amt > 0.004
      if (haloRef.current.visible) {
        haloRef.current.quaternion.copy(camera.quaternion)
        // Divided by the group's own scale so the group's growth does not
        // double-apply to the halo.
        const size = (dist * 0.17) / grow
        haloRef.current.scale.set(size, size, 1)
      }
    }

    /* ---- the eclipse flash --------------------------------------------- */
    // Rises as the object swallows the frame and decays through the fracture.
    // A PUNCH, NOT A WASH. The first window ran 0.90-1.22, which in scroll
    // terms is a few hundred pixels of near-white screen — long enough to stop
    // being a cut and start being an obstruction, with the page's text
    // unreadable underneath it the whole time. Tightened to a fast rise and a
    // quick fall so it reads as an exposure blowing out and recovering.
    const flash = clamp01(span(station, 0.95, 1.01)) * (1 - span(station, 1.02, 1.11))
    artifactState.flash = reducedMotion ? 0 : flash

    const fq = flashRef.current
    if (fq && flashMatRef.current) {
      if (flash > 0.002 && !reducedMotion) {
        fq.visible = true
        // Parked just in front of the near plane and sized to the frustum, so
        // it covers the frame exactly at any aspect ratio.
        const d = 0.6
        const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360)
        fq.position.set(0, 0, -d).applyMatrix4(camera.matrixWorld)
        fq.quaternion.copy(camera.quaternion)
        fq.scale.set(h * camera.aspect * 1.1, h * 1.1, 1)
        flashMatRef.current.uniforms.uAmount.value = flash
      } else {
        fq.visible = false
        flashMatRef.current.uniforms.uAmount.value = 0
      }
    }
  })

  return (
    <>
      <group ref={groupRef} visible={false}>
        {/* The shell: angular shards seated on a lens. */}
        <instancedMesh
          ref={shellRef}
          args={[undefined, undefined, SHARDS]}
          frustumCulled={false}
        >
          <tetrahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#13314c"
            metalness={0.18}
            roughness={0.06}
            envMapIntensity={4}
            emissive="#3f9fd0"
            emissiveIntensity={1.5}
            transparent
            opacity={0.72}
            depthWrite={false}
            // NOT FOGGED. The corridor's fog reaches 150 units at the hero, and
            // this object starts its approach at 300 — fogged, it was erased
            // completely for the entire first half of the event and simply
            // faded into existence at mid-distance, which loses the whole point
            // of watching something come from very far away. Its own distance
            // response is handled by the halo below instead.
            fog={false}
          />
        </instancedMesh>

        {/* THE DISTANT PRESENCE.
            A camera-facing halo that carries the object when it is too small
            for its geometry to resolve. At 300 units the shell is sub-pixel;
            without this there is literally nothing on screen to notice and
            begin tracking, and the "tiny object in the distance" beat does not
            exist. It fades out as the real geometry takes over. */}
        <mesh ref={haloRef} renderOrder={-50}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            ref={haloMatRef}
            uniforms={haloUniforms}
            vertexShader={flashVertex}
            fragmentShader={haloFragment}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>

        {/* The lens of glass the shell encloses. */}
        <mesh ref={coreRef}>
          <icosahedronGeometry args={[0.78, 3]} />
          <shaderMaterial
            ref={coreMatRef}
            uniforms={coreUniforms}
            vertexShader={coreVertex}
            fragmentShader={coreFragment}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>

        {/* Two counter-rotating rings. Thin, angular, and NOT concentric with
            each other's tilt — matched rings read as a planet, offset ones
            read as a mechanism. */}
        <mesh ref={ringARef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.28, 0.012, 3, 96]} />
          <meshBasicMaterial
            color="#7fe4ff"
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </mesh>
        <mesh ref={ringBRef} rotation={[Math.PI / 2.35, 0.4, 0]}>
          <torusGeometry args={[1.62, 0.008, 3, 96]} />
          <meshBasicMaterial
            color="#9d8cff"
            transparent
            opacity={0.34}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </mesh>

        <pointLight ref={lightRef} color="#7fd8ff" intensity={0} distance={60} decay={2} />
      </group>

      {/* The eclipse flash, camera-locked. Separate from the group so it is
          not scaled or rotated with the object. */}
      <mesh ref={flashRef} visible={false} renderOrder={9000} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={flashMatRef}
          uniforms={flashUniforms}
          vertexShader={flashVertex}
          fragmentShader={flashFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
    </>
  )
}
