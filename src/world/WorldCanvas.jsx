import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import Atmosphere from './Atmosphere'
import CameraRig, { WorldMood } from './CameraRig'
import LightRig from './LightRig'
import WorldPointer from './WorldPointer'
import StationProps from './StationProps'
import { useWorldStore } from '../state/worldStore'

/**
 * Quality tiers.
 *
 * The world is persistent and always on screen, so its cost is paid on every
 * page rather than only inside one section. Counts are therefore chosen to keep
 * the frame budget intact on mid-range hardware, and the monitor below drops
 * resolution further if the machine still can't hold frame rate.
 */
const TIERS = {
  high: { dust: 2200, stars: 900, strata: 200, fragments: 80, dustScale: 1, dpr: [1, 1.75] },
  mid: { dust: 1100, stars: 460, strata: 110, fragments: 40, dustScale: 0.9, dpr: [1, 1.4] },
  low: { dust: 420, stars: 220, strata: 48, fragments: 16, dustScale: 0.8, dpr: 1 },
}

const pickTier = () => {
  if (typeof window === 'undefined') return 'mid'
  const cores = navigator.hardwareConcurrency || 4
  const narrow = window.innerWidth < 768
  const mem = navigator.deviceMemory || 4

  if (narrow || cores <= 4 || mem <= 4) return 'low'
  if (cores <= 8) return 'mid'
  return 'high'
}

const WorldCanvas = ({ reducedMotion = false }) => {
  const fogRef = useRef()

  const [tierName] = useState(pickTier)
  const tier = TIERS[tierName]
  const [dpr, setDpr] = useState(tier.dpr)

  const setWorldReady = useWorldStore((s) => s.setWorldReady)
  useEffect(() => {
    setWorldReady(true)
    return () => setWorldReady(false)
  }, [setWorldReady])

  // Reduced motion keeps the space and the depth — it removes the drifting.
  // Stripping the environment entirely would leave those visitors on the flat
  // black page the brief explicitly rules out.
  const effectiveTier = useMemo(
    () =>
      reducedMotion
        ? { ...tier, dust: Math.round(tier.dust * 0.35), fragments: Math.round(tier.fragments * 0.4) }
        : tier,
    [tier, reducedMotion]
  )

  return (
    <Canvas
      dpr={dpr}
      // pointer-events stays off: the world is behind the entire document, and
      // capturing events here would break every link and button on the page.
      // World interaction is raycast manually in WorldPointer instead.
      className="!fixed inset-0 !w-screen !h-screen pointer-events-none"
      style={{ zIndex: 0 }}
      camera={{ position: [0, 0.9, 0], fov: 42, near: 0.1, far: 900 }}
      gl={{
        antialias: tierName === 'high',
        alpha: true,
        powerPreference: 'high-performance',
        // Transparent so the CSS backdrop underneath provides the base tone and
        // keeps painting if WebGL is slow, lost, or unavailable.
        premultipliedAlpha: false,
      }}
      onCreated={(state) => {
        const { gl } = state
        gl.setClearColor(new THREE.Color('#07070a'), 0)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        // Dev-only handle for inspecting the world from the console. Stripped
        // from production builds by the import.meta.env.DEV guard.
        if (import.meta.env.DEV) window.__world = state
      }}
    >
      {/* Degrade resolution before frame rate. A soft-but-smooth world reads
          far better than a sharp one that stutters as you scroll. */}
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(tier.dpr)}
        flipflops={3}
      />

      {/* Fog is a desaturated blue-grey, not near-black. Fogging to black makes
          distance read as "nothing there"; fogging to a lit haze reads as depth
          and is what gives the corridor its sense of scale. */}
      <fog ref={fogRef} attach="fog" args={['#141a26', 9, 62]} />

      <LightRig reducedMotion={reducedMotion} />

      <CameraRig reducedMotion={reducedMotion} />
      <WorldMood fogRef={fogRef} />

      <Atmosphere tier={effectiveTier} reducedMotion={reducedMotion} />
      <StationProps tier={effectiveTier} reducedMotion={reducedMotion} />
      <WorldPointer />
    </Canvas>
  )
}

export default WorldCanvas
