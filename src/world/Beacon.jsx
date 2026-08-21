import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { artifactState } from './artifactState'
import { safeZone } from './safeZone'
import { STATIONS, sampleMood } from './stations'

/**
 * THE BEACON — the first thing in the world, and the subject of the opening.
 *
 * The hero used to have no subject at all. The sky carried a wide wash, the
 * dimensional forms were cropped at the frame edge, and the artifact's first
 * approach does not begin until station 0.16 — so the frame a visitor actually
 * lands on had nothing in it to look at. A composition with no subject reads as
 * a background image no matter how much is rendering, and that is most of what
 * "generic" meant here.
 *
 * So: one point of light, far down the corridor, present before anything else.
 * It is four or five pixels when the session opens. It brightens, it acquires a
 * halo, dust starts crossing in front of it, and only then does the rest of the
 * environment resolve around it. That is the awakening — a light in a dark
 * volume, and a world that turns out to have been there all along.
 *
 * IT IS THE SAME LIGHT THE SKY IS LIT BY. Both the beacon's position and the
 * sky's hot lobe are derived from `safeZone`'s free side, so the tight highlight
 * in the sky is this object's atmospheric halo rather than an unrelated second
 * source. One light in frame; two renderings of it.
 *
 * IT CANNOT DRIFT OVER THE TEXT, BY CONSTRUCTION. Its lateral placement is a
 * function of the measured reading column, not an authored coordinate: it sits
 * on whichever side the column does not occupy and above the copy. When the
 * layout changes — a narrower window, a phone, a section with a centred
 * measure — the beacon moves with it. That is the difference between a light
 * that happens to be out of the way today and one that cannot be in the way.
 *
 * IT HANDS OFF RATHER THAN VANISHING. As the first transit takes the frame the
 * beacon dims out under `artifactState.dominance`, exactly as every other layer
 * does, so the shot still has one subject. After the opening band it is gone.
 */

/** Round, soft, additive — no texture fetch, no mip chain, one draw call each. */
const beaconFragment = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  // How hard the falloff is. A high value is a star; a low one is a haze.
  uniform float uFalloff;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uFalloff);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`

const beaconVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** How far ahead of the camera the beacon sits, in world units. */
const DISTANCE = 150

const _target = new THREE.Vector3()
const _colour = new THREE.Color()

export default function Beacon({ reducedMotion = false }) {
  const groupRef = useRef()
  const coreRef = useRef()
  const haloRef = useRef()
  const bloomRef = useRef()
  // WRITE THROUGH THE MATERIAL, NOT THROUGH THE OBJECT PASSED AS A PROP.
  //
  // Holding the uniforms in a useMemo and mutating that object is the obvious
  // shape, and it silently does nothing: what ends up on the material is not
  // guaranteed to be the same object handed to the `uniforms` prop, so every
  // write lands on a detached copy and the layer renders at whatever it was
  // initialised to. Here that was zero — so the beacon mounted, positioned
  // and scaled correctly, and was completely invisible. Every other shader
  // layer in this directory reaches its material through a ref, for exactly
  // this reason.
  const coreMat = useRef()
  const haloMat = useRef()
  const bloomMat = useRef()
  /** False until the beacon has been put in frame once. See the note below. */
  const placed = useRef(false)
  /** Clock time at which the arrival finished, or null while it is still running. */
  const settledAt = useRef(null)

  const materials = useMemo(
    () => ({
      // The core: tiny, near-white, and the only genuinely hot value in the
      // opening frame. Everything else is graded down so that this reads.
      core: {
        uColor: { value: new THREE.Color('#eaf9ff') },
        uOpacity: { value: 0 },
        uFalloff: { value: 3.2 },
      },
      // The halo: the accent hue, wider and much weaker.
      halo: {
        uColor: { value: new THREE.Color('#4fd2f0') },
        uOpacity: { value: 0 },
        uFalloff: { value: 2.4 },
      },
      // The atmospheric bloom: very wide, very faint, and what makes the point
      // read as being seen THROUGH something rather than pasted on top.
      bloom: {
        uColor: { value: new THREE.Color('#2f8fd8') },
        uOpacity: { value: 0 },
        uFalloff: { value: 1.35 },
      },
    }),
    []
  )

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const s = scrollState()

    // THE OPENING BAND ONLY. Gone by About, so the rest of the journey is not
    // trailed by a light that belonged to the first shot.
    const present = 1 - THREE.MathUtils.smoothstep(s.station, 0.35, 1.05)
    // Out of the way while a transit owns the frame, like every other layer.
    const clear = 1 - artifactState.dominance
    if (present <= 0.001) {
      g.visible = false
      return
    }
    g.visible = true

    // PLACEMENT FROM THE MEASURED LAYOUT, NOT FROM A COORDINATE.
    // The free side of the frame, high, and out at depth. `safeZone` is in
    // NDC, so the column's own edge tells us exactly how far across to go.
    const columnCentre = (safeZone.left + safeZone.right) * 0.5
    const freeSide = columnCentre > 0 ? -1 : 1
    // Start just outside the column's far edge and go a little further, so
    // there is visible air between the light and the words.
    const edge = freeSide > 0 ? safeZone.right : safeZone.left
    const width = safeZone.right - safeZone.left

    // ON A PHONE THERE IS NO FREE SIDE, SO IT GOES ABOVE INSTEAD.
    //
    // The measured column at 390px runs about -1.00..0.96 — effectively the
    // whole frame — so "just outside its far edge" resolves to NDC 1.30 and
    // the one point of light in the opening is placed off screen. The phone
    // therefore got a hero with no source in it at all, which is the flat dark
    // rectangle this whole pass exists to avoid.
    //
    // The vertical axis is the one with room: the mobile hero's copy sits in
    // the lower two thirds, so the light goes high and slightly off centre,
    // over the space above the wordmark. That is a different composition for a
    // different frame rather than the desktop one squeezed sideways, which is
    // what the responsive brief actually asks for.
    const cramped = safeZone.mobile || width > 1.5
    const lateralNdc = cramped ? 0.34 * freeSide : (Math.abs(edge) + 0.34) * freeSide
    const verticalNdc = cramped ? 0.66 : 0.42

    // NDC to world at this depth, through the camera's own basis.
    const halfH = Math.tan((state.camera.fov * Math.PI) / 360) * DISTANCE
    const halfW = halfH * state.camera.aspect

    _target.set(lateralNdc * halfW, verticalNdc * halfH, -DISTANCE)
    // Into world space via the camera, so the beacon holds its place in FRAME
    // as the rig banks and turns rather than sliding off it.
    _target.applyMatrix4(state.camera.matrixWorld)
    // Eased, so the light drifts to a new composition on resize instead of
    // teleporting — and so the camera's own pointer parallax still moves it.
    //
    // But NOT on the first frame. The group starts at the origin, which is
    // behind and below the camera, so easing from there meant the opening's
    // one point of light spent its first two seconds sliding up into frame
    // from underneath — a move nobody asked for, in the one shot that is
    // supposed to be a still point in the dark. Anything more than a few
    // units out is treated as a placement rather than a drift.
    if (!placed.current || g.position.distanceToSquared(_target) > 900) {
      g.position.copy(_target)
      placed.current = true
    } else {
      g.position.lerp(_target, reducedMotion ? 1 : 0.04)
    }
    g.quaternion.copy(state.camera.quaternion)

    // THE ARRIVAL. The core is first and almost immediate — the point exists
    // before the volume around it does, which is the whole premise. The halo
    // follows, then the wide atmospheric bloom, so the light appears to be
    // reaching further into the dust as it comes up.
    const core = ignitionAt(0.02, 0.18)
    const halo = ignitionAt(0.14, 0.46)
    const bloom = ignitionAt(0.3, 0.72)

    // THE LIGHT HAS ITS MOMENT, THEN BECOMES ENVIRONMENT.
    //
    // Once the arrival finishes, the beacon used to sit at full strength
    // forever — a bright dot parked in the corner of every frame anyone who
    // did not scroll would ever see. An event that never ends is not an event,
    // it is a decoration, and a decoration that bright starts pulling the eye
    // away from the copy.
    //
    // So it retreats: over about six seconds after the awakening completes it
    // drops to roughly a fifth of its peak. It does NOT go to zero — the
    // direction has always been that the light may remain as part of the
    // environment, and a distant source is what the sky's hot lobe is the halo
    // OF. What ends is its claim on the frame, not its existence.
    if (settledAt.current === null && s.ignition >= 0.999) settledAt.current = s.time
    const sinceSettled = settledAt.current === null ? 0 : s.time - settledAt.current
    const RESTING = 0.2
    const retreat = reducedMotion
      ? RESTING
      : 1 - (1 - RESTING) * THREE.MathUtils.smoothstep(sinceSettled, 0.8, 6.5)

    // IT BREATHES HARDER THE LONGER IT IS LEFT ALONE.
    //
    // `stillness` is the counterpart to energy — see scrollStore. Reading it
    // here is what stops "nothing is happening" from meaning "nothing is
    // moving": stop scrolling and the source slowly swells and ebbs, so the
    // resting state is alive rather than merely dim.
    const breath = reducedMotion ? 0 : Math.sin(s.time * 0.32) * 0.5 + 0.5
    const idleLift = 1 + s.stillness * breath * 0.55

    // A slow, shallow breath. Fast flicker reads as a broken sprite; this
    // reads as something running.
    const pulse = reducedMotion ? 1 : 0.86 + Math.sin(s.time * 0.9) * 0.09 + Math.sin(s.time * 0.37) * 0.05
    // Scrolling wakes it back up: the retreat is a resting state, not a
    // one-way door, so travelling through the world re-energises the light
    // that lit it.
    const energy = 1 + s.energy * 1.4
    const k = present * clear * energy * retreat * idleLift

    if (coreMat.current) coreMat.current.uniforms.uOpacity.value = core * k * pulse * 0.95
    if (haloMat.current) haloMat.current.uniforms.uOpacity.value = halo * k * pulse * 0.34
    if (bloomMat.current) bloomMat.current.uniforms.uOpacity.value = bloom * k * 0.13

    // The halo takes the station accent, so the beacon belongs to the same
    // palette the sky and the lights are running.
    if (haloMat.current) {
      _colour.set(STATIONS[0].mood.accent)
      haloMat.current.uniforms.uColor.value.lerp(_colour, 0.02)
    }

    // It GROWS as it wakes: a point that stays the same size while getting
    // brighter reads as an opacity animation, which is what it would be. The
    // scale change is what sells it as a source coming up rather than a layer
    // fading in.
    // A POINT, NOT A POOL.
    //
    // First pass had these at 1.6 / 9 / 34 units at 96 out, which subtended
    // something like 70px of core and 145px of atmospheric bloom — a soft
    // luminous blob a third of the way across the frame. That is not a distant
    // light, it is a lens flare, and it is the exact failure mode the brief
    // rules out twice ("tiny distant point of light", "no random glowing").
    // Roughly halved, and at 150 units rather than 96: the core now lands at a
    // few pixels and the halo stays tight around it, which is what makes the
    // eye read DEPTH rather than a bright thing nearby.
    const grow = 0.34 + core * 0.66
    const accentPower = sampleMood(s.station, 'accentPower')
    if (coreRef.current) coreRef.current.scale.setScalar(1.15 * grow * (0.9 + pulse * 0.2))
    if (haloRef.current) haloRef.current.scale.setScalar(4.6 * (0.4 + halo * 0.6))
    if (bloomRef.current) bloomRef.current.scale.setScalar(15 * (0.3 + bloom * 0.7) * (0.85 + accentPower * 0.3))
  })

  return (
    <group ref={groupRef}>
      {/* Drawn far to near, all additive and depth-write off, so the three
          layers composite into one source rather than occluding each other. */}
      <mesh ref={bloomRef} renderOrder={-40} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={bloomMat}
          uniforms={materials.bloom}
          vertexShader={beaconVertex}
          fragmentShader={beaconFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
      <mesh ref={haloRef} renderOrder={-39} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={haloMat}
          uniforms={materials.halo}
          vertexShader={beaconVertex}
          fragmentShader={beaconFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
      <mesh ref={coreRef} renderOrder={-38} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={coreMat}
          uniforms={materials.core}
          vertexShader={beaconVertex}
          fragmentShader={beaconFragment}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>
    </group>
  )
}
