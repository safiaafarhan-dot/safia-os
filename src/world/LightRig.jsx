import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { PALETTE, sampleMood } from './stations'

/**
 * Lighting.
 *
 * Radically smaller than the previous rig, because the subject changed. The
 * old world was built from metals, and metals have no diffuse response — they
 * render as near-black unless there is an environment map for them to reflect,
 * which is why that build needed a generated cube map, four Lightformer panels
 * and a travelling accent source just to be visible at all.
 *
 * The field is emissive points. It needs no lighting whatsoever. The only lit
 * geometry left in the world is the distant structure, which wants exactly two
 * things: a cold ambient so it is not a hole in the sky, and one crimson key
 * grazing it so it has a lit edge. Deleting the environment map with it takes
 * a startup cube render and a permanent sampler cost off the budget.
 *
 * Two light families, no more — cold steel and crimson. Every extra hue in a
 * dark scene reads as cheap, and restraint is most of what reads as expensive.
 */
export default function LightRig() {
  const ambientRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()
  const accentRef = useRef()

  useFrame((state, delta) => {
    const s = scrollState()
    const ease = 1 - Math.exp(-3 * delta)

    if (ambientRef.current) {
      const target = sampleMood(s.station, 'ambient') * (1 + s.energy * 0.25)
      ambientRef.current.intensity += (target - ambientRef.current.intensity) * ease
    }

    if (keyRef.current) {
      const target = sampleMood(s.station, 'key') * 1.6
      keyRef.current.intensity += (target - keyRef.current.intensity) * ease
      // The key tracks the cursor, so moving the mouse visibly relights the
      // distant structure rather than only sliding a parallax layer around.
      keyRef.current.position.x += (-60 + s.pointerSmoothX * 40 - keyRef.current.position.x) * ease
      keyRef.current.position.y += (70 + s.pointerSmoothY * 30 - keyRef.current.position.y) * ease
    }

    if (rimRef.current) {
      rimRef.current.intensity = (1.4 + s.energy * 1.2) * (0.4 + sampleMood(s.station, 'accentPower'))
    }

    if (accentRef.current) {
      accentRef.current.intensity = 18 + sampleMood(s.station, 'accentPower') * 26 + s.energy * 20
      // A slow orbit of the accent source keeps highlights sliding even when
      // the visitor is completely still.
      accentRef.current.position.set(
        Math.sin(s.time * 0.13) * 16,
        3 + Math.cos(s.time * 0.1) * 5,
        Math.cos(s.time * 0.13) * 16
      )
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.45} color="#4e5a72" />

      {/* Cold key from high off-frame left. */}
      <directionalLight ref={keyRef} position={[-60, 70, 50]} intensity={1.8} color="#e6ecf6" />

      {/* Crimson rim from behind: separates silhouettes from the fog. */}
      <directionalLight ref={rimRef} position={[70, 20, -140]} intensity={1.6} color={PALETTE.crimson} />

      {/* Travelling accent near the field, so the haze around it is never
          uniformly lit. */}
      <pointLight
        ref={accentRef}
        position={[0, 3, -12]}
        color={PALETTE.crimson}
        intensity={24}
        distance={90}
        decay={2}
      />
    </>
  )
}

/** Shared so other modules do not re-parse the accent hex. */
export const ACCENT = new THREE.Color(PALETTE.crimson)
