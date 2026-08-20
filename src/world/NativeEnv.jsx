import React, { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The environment map, built by hand instead of by drei.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every metal in this world — the guardian's plating, the corridor drifts, the
 * derelict station — is metalness ~0.95, and metals have no diffuse response.
 * Without something to reflect they render as near-black shapes. So an
 * environment map is not a nicety here; it is the difference between visible
 * geometry and silhouettes.
 *
 * drei's <Environment> + <Lightformer> did this, and measured in isolation
 * they were the second-largest contributor to the vendor bundle after Html.
 * That bundle is 86% of the page's main-thread work, so the cost was real.
 *
 * This reproduces the same setup — four coloured emissive panels and a dark
 * shell, rendered once into a small cube map — using nothing but three. It is
 * about sixty lines, it renders exactly one frame at startup, and it removes
 * the dependency entirely.
 *
 * The panel positions, colours and intensities are carried over unchanged from
 * the drei version, so the lighting is meant to look identical rather than
 * merely similar: a cool overhead strip as the dominant top reflection, a
 * crimson signal panel behind and right for the brand rim, a cold counter
 * panel left so shadow sides do not go flat, and a faint floor bounce.
 */

const PANELS = [
  // [ position, rotation, scale, colour, intensity ]
  // Rebalanced so cyan leads and crimson answers. The crimson panel used to be
  // the brightest surface in the map at 2.9, and since these are metals with no
  // diffuse response, the cube map is effectively their colour -- everything
  // reflected red. Crimson is now the SECOND strongest, which is the intended
  // reading: a cool world with warm energy in it.
  { pos: [0, 8, -6], rot: [Math.PI / 2, 0, 0], scale: [24, 14], color: '#a9c2e4', intensity: 2.7 },
  { pos: [9, 1, -10], rot: [0, -Math.PI / 2.4, 0], scale: [16, 10], color: '#ff2d4d', intensity: 1.9 },
  { pos: [-10, 0, -4], rot: [0, Math.PI / 2.4, 0], scale: [14, 10], color: '#3fc2e8', intensity: 3.0 },
  // Violet from below. Narrow and dim: it tints the underside of a fragment as
  // it rotates, which is what stops crystalline shapes reading as grey facets.
  { pos: [-6, -6, -12], rot: [-Math.PI / 3, 0.5, 0], scale: [12, 8], color: '#7b4de0', intensity: 1.3 },
  { pos: [0, -7, -6], rot: [-Math.PI / 2, 0, 0], scale: [20, 12], color: '#343d52', intensity: 0.9 },
]

export default function NativeEnv({ resolution = 128 }) {
  const { gl, scene } = useThree()
  const applied = useRef(false)

  const envTexture = useMemo(() => {
    // A throwaway scene holding just the light panels and a dark shell. This
    // never joins the real scene graph; it exists only to be photographed.
    const rig = new THREE.Scene()

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#0b0d14', side: THREE.BackSide })
    )
    rig.add(shell)

    const disposables = [shell.geometry, shell.material]

    PANELS.forEach((p) => {
      const geo = new THREE.PlaneGeometry(p.scale[0], p.scale[1])
      const mat = new THREE.MeshBasicMaterial({
        // Intensity is folded into the colour: a basic material has no
        // intensity of its own, and multiplying the colour is exactly what
        // the cube camera will integrate.
        color: new THREE.Color(p.color).multiplyScalar(p.intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...p.pos)
      mesh.rotation.set(...p.rot)
      rig.add(mesh)
      disposables.push(geo, mat)
    })

    // Render the rig once into a cube target, then convert to the equirect-ish
    // PMREM three wants for physically-based reflections.
    const cubeTarget = new THREE.WebGLCubeRenderTarget(resolution, {
      type: THREE.HalfFloatType,
    })
    const cubeCam = new THREE.CubeCamera(0.1, 200, cubeTarget)
    cubeCam.update(gl, rig)

    const pmrem = new THREE.PMREMGenerator(gl)
    pmrem.compileCubemapShader()
    const envMap = pmrem.fromCubemap(cubeTarget.texture).texture

    // Everything above was scaffolding for one frame; only envMap survives.
    pmrem.dispose()
    cubeTarget.dispose()
    disposables.forEach((d) => d.dispose())

    return envMap
  }, [gl, resolution])

  useEffect(() => {
    if (applied.current) return
    applied.current = true
    const previous = scene.environment
    scene.environment = envTexture
    return () => {
      scene.environment = previous
      envTexture.dispose()
    }
  }, [scene, envTexture])

  return null
}
