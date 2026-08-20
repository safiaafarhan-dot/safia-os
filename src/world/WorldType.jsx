import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS } from './stations'

/**
 * Typography set INTO the world.
 *
 * The station names are not overlaid on the render and they are not DOM text
 * with a parallax transform — they are objects in the scene, at a real depth,
 * behind the field. They occlude correctly, they take the fog, they take the
 * bloom, and they swing with the camera as it orbits. That is what makes the
 * type feel like part of the environment rather than a caption on top of it.
 *
 * Held deliberately faint. This is architectural lettering — the word cast on
 * a far wall — not a headline. The DOM headline is still the thing you read;
 * this is the thing you feel.
 */

/** Render a word to a canvas texture, tracked out and letter-spaced. */
function makeWordTexture(text, { size = 256, tracking = 0.18 } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const font = `700 ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.font = font

  const spacing = size * tracking
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const totalWidth = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)

  const padX = size * 0.3
  const padY = size * 0.45
  canvas.width = Math.ceil(totalWidth + padX * 2)
  canvas.height = Math.ceil(size + padY * 2)

  // Re-set after resize: changing canvas dimensions resets the 2D context.
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'

  let x = padX
  const y = canvas.height / 2
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y)
    x += widths[i] + spacing
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.needsUpdate = true
  return { tex, aspect: canvas.width / canvas.height }
}

const wordVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFog;
  uniform float uFogNear;
  uniform float uFogFar;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFog = 1.0 - smoothstep(uFogNear, uFogFar, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const wordFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vFog;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uScan;

  void main() {
    float mask = texture2D(uMap, vUv).a;
    if (mask < 0.01) discard;

    // A slow horizontal wipe of brightness across the word, so the lettering
    // reads as something being lit rather than as a static decal.
    float scan = 0.72 + 0.28 * smoothstep(0.0, 0.35, abs(fract(vUv.x - uScan) - 0.5));

    gl_FragColor = vec4(uColor, mask * uOpacity * vFog * scan);
  }
`

/**
 * One word per station, parked at that station's authored offset from the
 * field's centre.
 *
 * Words are BILLBOARDED, so however far the camera's orbit has travelled the
 * lettering still faces the reader. A fixed-orientation word would be edge-on
 * for half the scroll, which is exactly the kind of detail that makes 3D type
 * look accidental rather than designed.
 */
export default function WorldType({ reducedMotion = false }) {
  const groupRef = useRef()

  const words = useMemo(
    () =>
      STATIONS.map((s) => {
        const { tex, aspect } = makeWordTexture(s.type.text)
        return {
          id: s.id,
          index: s.index,
          tex,
          aspect,
          offset: s.type.offset,
          size: s.type.size,
          opacity: s.type.opacity,
        }
      }),
    []
  )

  useEffect(
    () => () => {
      words.forEach((w) => w.tex.dispose())
    },
    [words]
  )

  useFrame((state) => {
    const g = groupRef.current
    if (!g) return
    const s = scrollState()

    g.children.forEach((child, i) => {
      const w = words[i]
      // Fade in as the station approaches and out as it leaves. The window is
      // generous, so two words are often faintly present at once and the type
      // never blinks on and off at a boundary.
      const near = Math.max(0, 1 - Math.abs(s.station - w.index) / 1.15)
      const u = child.material.uniforms
      u.uOpacity.value = w.opacity * near * near * (1 + s.energy * 0.5)
      child.visible = u.uOpacity.value > 0.001
      if (!child.visible) return

      child.quaternion.copy(state.camera.quaternion)
      u.uScan.value = reducedMotion ? 0.5 : (s.time * 0.06 + i * 0.3) % 1
    })
  })

  return (
    <group ref={groupRef}>
      {words.map((w) => (
        <mesh
          key={w.id}
          position={w.offset}
          scale={[w.size * w.aspect, w.size, 1]}
          frustumCulled={false}
          renderOrder={-300}
        >
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={wordVertex}
            fragmentShader={wordFragment}
            uniforms={{
              uMap: { value: w.tex },
              uColor: { value: new THREE.Color('#cfdcf2') },
              uOpacity: { value: 0 },
              uScan: { value: 0 },
              uFogNear: { value: 20 },
              uFogFar: { value: 180 },
            }}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}
