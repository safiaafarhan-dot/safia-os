import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
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

    if (rimRef.current) {
      rimRef.current.intensity = 2.2 + s.energy * 1.4
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
      fillRef.current.intensity = 0.85 + s.energy * 0.4
    }
  })

  return (
    <>
      {/* Reflections. Rendered once into a 128px cube map — small, local, and
          the difference between visible metal and black shapes. */}
      {!skipEnv && (
      <Environment resolution={128} frames={1} background={false}>
        {/* Cool overhead strip — the dominant reflection on top surfaces. */}
        <Lightformer
          form="rect"
          intensity={2.5}
          color="#9fb4d8"
          position={[0, 8, -6]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[24, 14, 1]}
        />
        {/* Crimson signal panel behind and to the right — the brand rim that
            traces the edge of every structure. */}
        <Lightformer
          form="rect"
          intensity={2.9}
          color="#ff2d4d"
          position={[9, 1, -10]}
          rotation={[0, -Math.PI / 2.4, 0]}
          scale={[16, 10, 1]}
        />
        {/* Cold counter-panel on the left keeps shadow sides from going flat. */}
        <Lightformer
          form="rect"
          intensity={1.6}
          color="#4d7fa8"
          position={[-10, 0, -4]}
          rotation={[0, Math.PI / 2.4, 0]}
          scale={[14, 10, 1]}
        />
        {/* Faint floor bounce so undersides aren't pure black. */}
        <Lightformer
          form="rect"
          intensity={0.7}
          color="#2c3240"
          position={[0, -7, -6]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[20, 12, 1]}
        />
        <mesh scale={60}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#0b0d14" side={THREE.BackSide} />
        </mesh>
      </Environment>
      )}

      <ambientLight ref={ambientRef} intensity={0.34} color="#5c6478" />

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
          intensity={2.2}
          color="#ff3355"
        />
        {/* Cool fill from below-left. */}
        <directionalLight
          ref={fillRef}
          position={[-7, -4, -2]}
          intensity={0.85}
          color="#6f8fc0"
        />
        {/* Travelling accent source — the moving highlight in the corridor. */}
        <pointLight ref={accentRef} position={[0, 1.5, -12]} intensity={26} distance={46} decay={2} />
      </group>
    </>
  )
}
