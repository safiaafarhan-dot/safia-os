import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import Atmosphere from './Atmosphere'
import CameraRig, { WorldMood } from './CameraRig'
import LatentField from './LatentField'
import LightRig from './LightRig'
import WorldPointer from './WorldPointer'
import WorldType from './WorldType'
import { PALETTE } from './stations'
import { useWorldStore } from '../state/worldStore'

// The grade is the single most expensive thing in the world and the first
// thing that should go on weak hardware, so it is split out of the main chunk
// and only requested on the tiers that can carry it.
const PostFX = lazy(() => import('./PostFX'))

/**
 * Quality tiers.
 *
 * The world is persistent and on screen for the entire visit, so its cost is
 * paid on every page rather than inside one section. Counts are chosen to hold
 * the frame budget on mid-range hardware, and the monitor below drops
 * resolution further if the machine still cannot keep up.
 */
const TIERS = {
  high: { points: 34000, deep: 1400, haze: 14, structure: true, grade: true, dpr: [1, 1.75] },
  mid: { points: 16000, deep: 700, haze: 9, structure: true, grade: true, dpr: [1, 1.4] },
  low: { points: 6000, deep: 320, haze: 5, structure: false, grade: false, dpr: 1 },
}

/** Diagnostic switches, e.g. ?nofx=1 — for bisecting the render chain. */
const flag = (name) =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(name)

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

  // Reduced motion keeps the space, the depth and the field — it removes the
  // drifting. Stripping the environment would leave those visitors on the flat
  // black page the whole direction exists to avoid.
  const effectiveTier = useMemo(
    () => (reducedMotion ? { ...tier, points: Math.round(tier.points * 0.6), haze: Math.max(3, tier.haze - 4) } : tier),
    [tier, reducedMotion]
  )

  return (
    <Canvas
      dpr={dpr}
      // pointer-events stays off: the canvas spans the whole document behind
      // the content, and capturing events here would swallow every link and
      // button on the page. World interaction is raycast manually in
      // WorldPointer instead.
      className="!fixed inset-0 !w-screen !h-screen pointer-events-none"
      style={{ zIndex: 0 }}
      camera={{ position: [0, 2, 17], fov: 42, near: 0.1, far: 1200 }}
      gl={{
        antialias: tierName === 'high',
        alpha: false,
        powerPreference: 'high-performance',
      }}
      onCreated={(state) => {
        const { gl } = state
        // Opaque: the world owns its own sky now, so there is no CSS layer
        // showing through and nothing to composite against.
        gl.setClearColor(new THREE.Color(PALETTE.ink), 1)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.15
        // Dev-only handle for inspecting the world from the console. Stripped
        // from production builds by the import.meta.env.DEV guard.
        if (import.meta.env.DEV) window.__world = state
      }}
    >
      {/* Degrade resolution before frame rate. A soft-but-smooth world reads
          far better than a sharp one that stutters as you scroll. */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(tier.dpr)} flipflops={3} />

      {/* Fog is a lit haze, not near-black. Fogging to black makes distance
          read as "nothing there"; fogging to haze reads as depth, and is what
          gives the field its sense of scale. */}
      <fog ref={fogRef} attach="fog" args={[PALETTE.haze, 12, 62]} />

      <LightRig />
      <CameraRig reducedMotion={reducedMotion} />
      <WorldMood fogRef={fogRef} />

      <Atmosphere tier={effectiveTier} reducedMotion={reducedMotion} />
      <WorldType reducedMotion={reducedMotion} />
      <LatentField count={effectiveTier.points} reducedMotion={reducedMotion} />

      <WorldPointer />

      {tier.grade && !flag('nofx') && (
        <Suspense fallback={null}>
          <PostFX reducedMotion={reducedMotion} />
        </Suspense>
      )}
    </Canvas>
  )
}

export default WorldCanvas
