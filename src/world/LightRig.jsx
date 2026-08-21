import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import NativeEnv from './NativeEnv'
import { scrollState } from '../state/scrollStore'
import { STATIONS, sampleMood } from './stations'

/**
 * Lighting and reflections for the corridor.
 *
 * Two things here are load-bearing for whether the world is visible at all:
 *
 * 1. THE ENVIRONMENT MAP. Every structure in this world is a metal
 *    (metalness ~0.9), and metals have no diffuse response — they render as
 *    near-black unless there is something for them to reflect. Direct lights
 *    alone give a metal one tiny specular dot and nothing else, which is
 *    exactly why the geometry read as an empty black screen. The Environment
 *    below is generated procedurally into a cube map ONCE (frames={1}) from
 *    the Lightformer panels, so it costs one small render at startup, needs no
 *    network fetch, and gives every surface real reflections.
 *
 * 2. THE LIGHT GROUP FOLLOWS THE CAMERA. Lights used to sit at fixed world
 *    positions while the camera travelled 300 units down -Z, so by the third
 *    station everything was lit from behind and the world went dark. Parenting
 *    the rig to the camera's depth keeps the key/rim relationship identical at
 *    every station.
 */
/** Diagnostic switches, e.g. ?noenv=1 — for bisecting a stall in the browser. */
const flag = (name) =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(name)

export default function LightRig({ reducedMotion }) {
  const skipEnv = flag('noenv')
  const rigRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()
  const accentRef = useRef()
  const ambientRef = useRef()
  const fillRef = useRef()

  const coolRef = useRef()
  const coolAccentRef = useRef()

  const accentColor = useRef(new THREE.Color('#b3122e'))
  const nextColor = useRef(new THREE.Color())

  useFrame((state, delta) => {
    const s = scrollState()
    const ease = 1 - Math.exp(-3 * delta)

    // Keep the whole rig at the camera's depth so lighting is station-invariant.
    if (rigRef.current) rigRef.current.position.z = state.camera.position.z

    if (ambientRef.current) {
      const target = sampleMood(s.station, 'ambient') * (1 + s.energy * 0.3)
      ambientRef.current.intensity += (target - ambientRef.current.intensity) * ease
    }

    if (keyRef.current) {
      const target = sampleMood(s.station, 'light') * 2.6
      keyRef.current.intensity += (target - keyRef.current.intensity) * ease
      // The key tracks the cursor, so moving the mouse visibly relights the
      // geometry rather than only sliding a parallax layer around.
      keyRef.current.position.x += (-6 + s.pointerSmoothX * 5 - keyRef.current.position.x) * ease
      keyRef.current.position.y += (7 + s.pointerSmoothY * 3.5 - keyRef.current.position.y) * ease
    }

    // THE WARM/COOL BALANCE IS NOW A FUNCTION OF DEPTH.
    //
    // Both rims used to run at fixed intensities, which meant the crimson one
    // was at full strength in the hero — and a crimson rim on every silhouette
    // is most of what made the opening read warm no matter what the accent
    // colour said. `warmth` ramps in across the first two stations, so the
    // abstract dimension is edged almost purely cyan and the crimson arrives
    // with the matter band it belongs to.
    const warmth = THREE.MathUtils.smoothstep(s.station, 0.6, 2.6)

    if (rimRef.current) {
      rimRef.current.intensity = (0.28 + warmth * 1.32) * (1 + s.energy * 0.6)
    }

    if (coolRef.current) {
      // The cyan rim comes from the opposite side to the crimson one, so a
      // silhouette is edged warm on one side and cool on the other. That single
      // relationship does more for perceived depth than any amount of extra
      // brightness, and it is what keeps the palette from collapsing into red.
      // Strongest in the opening, where it is carrying the frame alone.
      coolRef.current.intensity = (4.4 - warmth * 1.7) + s.energy * 1.5
    }

    if (accentRef.current) {
      const i = Math.max(0, Math.min(STATIONS.length - 1, Math.floor(s.station)))
      const j = Math.min(STATIONS.length - 1, i + 1)
      const f = Math.max(0, Math.min(1, s.station - i))
      nextColor.current.set(STATIONS[i].mood.accent).lerp(new THREE.Color(STATIONS[j].mood.accent), f)
      accentColor.current.lerp(nextColor.current, ease)
      accentRef.current.color.copy(accentColor.current)
      accentRef.current.intensity = 26 + s.energy * 22

      if (!reducedMotion) {
        // Slow orbit of the accent source keeps highlights sliding across the
        // metal even when the visitor is completely still.
        accentRef.current.position.x = Math.sin(s.time * 0.18) * 7
        accentRef.current.position.y = 1.5 + Math.cos(s.time * 0.14) * 2.4
      }
    }

    if (fillRef.current) {
      fillRef.current.intensity = 1.35 + s.energy * 0.5
    }

    if (coolAccentRef.current && !reducedMotion) {
      // A second travelling source, orbiting counter to the crimson one. Two
      // lights moving at different rates means highlights are always crossing
      // the geometry somewhere -- the world stays alive with the visitor
      // completely still, which is the whole point of an ambient scene.
      coolAccentRef.current.position.x = Math.sin(s.time * 0.11 + 2.1) * -9
      coolAccentRef.current.position.y = 0.5 + Math.cos(s.time * 0.09) * 3.2
      coolAccentRef.current.intensity = 22 + s.energy * 16
    }
  })

  return (
    <>
      {/* Reflections. Four emissive panels rendered once into a small cube
          map — see NativeEnv. Every surface out here is a metal with no
          diffuse response, so without something to reflect the geometry
          renders as black shapes; this is load-bearing, not decoration.

          It replaces drei's Environment/Lightformer, which measured as the
          second-largest contributor to a vendor bundle that is 86% of the
          page's main-thread work. Same panel positions, colours and
          intensities, so the lighting is unchanged. */}
      {!skipEnv && <NativeEnv resolution={128} />}

      {/* Ambient is a deep blue rather than a neutral grey. It is the floor of
          the whole image: at a neutral tint, unlit surfaces fall to grey-black
          and large areas of the frame die. */}
      <ambientLight ref={ambientRef} intensity={0.34} color="#68809f" />

      <group ref={rigRef}>
        <directionalLight
          ref={keyRef}
          position={[-6, 7, 5]}
          intensity={2.4}
          color="#eef1f6"
        />
        {/* Rim from behind: separates silhouettes from the fog. */}
        <directionalLight
          ref={rimRef}
          position={[7, 2, -14]}
          intensity={1.5}
          color="#ff3355"
        />
        {/* Cyan rim from the opposite side. The counterpart to the crimson one:
            together they edge a silhouette warm and cool, which reads as form
            rather than as a shape cut out of the fog. */}
        <directionalLight
          ref={coolRef}
          position={[-8, 3, -13]}
          intensity={2.6}
          color="#4fd2f0"
        />
        {/* Cool fill from below-left. */}
        <directionalLight
          ref={fillRef}
          position={[-7, -4, -2]}
          intensity={1.35}
          color="#5fb2d8"
        />
        {/* Travelling accent source — the moving highlight in the corridor. */}
        <pointLight ref={accentRef} position={[0, 1.5, -12]} intensity={26} distance={46} decay={2} />
        {/* The cool travelling source. Violet-cyan rather than pure cyan so the
            two moving lights never read as a matched pair. */}
        <pointLight
          ref={coolAccentRef}
          position={[-9, 0.5, -15]}
          intensity={22}
          distance={54}
          decay={2}
          color="#54c8f0"
        />
      </group>
    </>
  )
}
