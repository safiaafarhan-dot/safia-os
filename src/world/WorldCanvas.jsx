import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import AdaptiveDpr from './AdaptiveDpr'
import Artifact from './Artifact'
import Atmosphere from './Atmosphere'
import Beacon from './Beacon'
import Crystals from './Crystals'
import CursorField from './CursorField'
import DeepSpace from './DeepSpace'
import DimensionalForms from './DimensionalForms'
import Encounters from './Encounters'
import EnergyField from './EnergyField'
import GlassAssembly from './GlassAssembly'
import NeuralField from './NeuralField'
import CameraRig, { WorldMood } from './CameraRig'
import LightRig from './LightRig'
import WorldPointer from './WorldPointer'
import { useWorldStore } from '../state/worldStore'

// The grade is the most expensive thing in the world and the first thing that
// should go on weak hardware, so it is split out and only requested on the
// tiers that can carry it.
const PostFX = lazy(() => import('./PostFX'))

/** Diagnostic switches, e.g. ?nofx=1 — for bisecting the render chain. */
const flag = (name) =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(name)

/**
 * Quality tiers.
 *
 * The world is persistent and always on screen, so its cost is paid on every
 * page rather than only inside one section. Counts are therefore chosen to keep
 * the frame budget intact on mid-range hardware, and the monitor below drops
 * resolution further if the machine still can't hold frame rate.
 */
const TIERS = {
  high: { dust: 2200, stars: 900, strata: 200, fragments: 80, dustScale: 1, grade: true, blackHole: true, bhDebris: 900, galaxy: 5000, nebulae: 6, singularities: true, foreground: 14, beltRocks: 220, clusterStars: 900, shardCount: 90, floaters: 260, cursorMotes: 300, dustVeil: 700, crystals: 16, energyTrails: 100, neurons: 92, forms: true, dpr: [1, 1.75] },
  mid: { dust: 1100, stars: 460, strata: 110, fragments: 40, dustScale: 0.9, grade: true, blackHole: true, bhDebris: 450, galaxy: 2400, nebulae: 4, singularities: true, foreground: 9, beltRocks: 120, clusterStars: 450, shardCount: 48, floaters: 140, cursorMotes: 170, dustVeil: 360, crystals: 10, energyTrails: 60, neurons: 58, forms: true, dpr: [1, 1.4] },
  // The forms stay on at the low tier even though almost everything else is
  // cut. They are four draw calls, and they are the only thing standing
  // between a phone and an empty gradient — exactly the "overwhelmingly black
  // home page" the brief rules out.
  low: { dust: 420, stars: 220, strata: 48, fragments: 16, dustScale: 0.8, grade: false, blackHole: true, bhDebris: 260, galaxy: 900, nebulae: 3, singularities: false, foreground: 5, beltRocks: 50, clusterStars: 180, shardCount: 20, floaters: 60, cursorMotes: 80, dustVeil: 150, crystals: 6, energyTrails: 30, neurons: 34, forms: true, dpr: 1 },
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
        alpha: false,
        powerPreference: 'high-performance',
        // Opaque: the world owns its own graded sky now. The CSS backdrop
        // stays as the pre-WebGL and no-WebGL fallback only.
        premultipliedAlpha: false,
      }}
      onCreated={(state) => {
        const { gl } = state
        // Deep navy, not near-black. The brief is explicit that the home page
        // must not be overwhelmingly black, and the clear colour is the floor
        // every other value sits on — at #04060b the darkest 60% of the frame
        // was a single flat value and no amount of atmosphere above it read as
        // depth. A lifted, saturated ground gives the fog and the forms
        // something to separate FROM.
        gl.setClearColor(new THREE.Color('#070d1c'), 1)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        // Dev-only handle for inspecting the world from the console. Stripped
        // from production builds by the import.meta.env.DEV guard.
        if (import.meta.env.DEV) window.__world = state
      }}
    >
      {/* Degrade resolution before frame rate. A soft-but-smooth world reads
          far better than a sharp one that stutters as you scroll. */}
      {/* Native FPS sampling rather than drei's PerformanceMonitor — same
          policy, without keeping the whole package in the vendor chunk. */}
      <AdaptiveDpr onDecline={() => setDpr(1)} onIncline={() => setDpr(tier.dpr)} flipflops={3} />

      {/* Fog is a desaturated blue-grey, not near-black. Fogging to black makes
          distance read as "nothing there"; fogging to a lit haze reads as depth
          and is what gives the corridor its sense of scale. */}
      <fog ref={fogRef} attach="fog" args={['#12203b', 9, 62]} />

      <LightRig reducedMotion={reducedMotion} />

      <CameraRig reducedMotion={reducedMotion} />
      <WorldMood fogRef={fogRef} />

      {/* Distant space and foreground: the two scale tiers the world never
          had. Mounted before the corridor so the depth reads outward from
          here. */}
      <DeepSpace tier={effectiveTier} />

      {/* Discovery layer: distinct celestial features spread along the path,
          each waking on approach, so travelling deeper keeps turning up
          something new rather than re-showing the same two galaxies. */}
      <Encounters tier={effectiveTier} />

      {/* The cursor is the force acting on this world now that the guardian
          and the black hole are gone. This drives the shared field every frame;
          it draws nothing itself, because a cloud of motes bound to the pointer
          sat on top of whatever control the visitor was reaching for. */}
      <CursorField reducedMotion={reducedMotion} />

      {/* The two layers that carry the first three sections. Crystals are the
          foreground the early journey never had -- glass close to the lens,
          catching the cyan and crimson sources -- and EnergyField is the
          midground of travelling light between them and the galaxies. Both
          fade out as the matter band takes over, so the world hands off from
          glass to stone rather than showing everything at once. */}
      <Crystals count={effectiveTier.crystals} reducedMotion={reducedMotion} />
      <EnergyField count={effectiveTier.energyTrails} reducedMotion={reducedMotion} />

      {/* THE FIRST THING IN THE WORLD. A point of light far down the corridor,
          present before the volume around it has finished lifting out of
          black. It is the subject the opening frame did not have, and its
          lateral placement is derived from the measured reading column, so it
          cannot end up behind the type on any layout. See Beacon.jsx. */}
      <Beacon reducedMotion={reducedMotion} />

      {/* THE ABSTRACT DIMENSION. Four large translucent structures that replace
          the ringed planet the opening used to be built around — an incomplete
          shell, a ring around nothing, a lattice fragment and a set of floating
          planes. Nothing here resolves into a nameable object, which is what
          keeps the first impression off "space portfolio". */}
      <DimensionalForms enabled={effectiveTier.forms} />

      {/* THE ONE CINEMATIC EVENT. A single abstract instrument that starts as
          a point of light far down the corridor, closes on the lens as the
          visitor scrolls, fills and exceeds the frame, then breaks and blows
          past. Deliberately singular — one object the eye can track from four
          pixels to larger than the screen is a scene; a swarm is a screensaver. */}
      <Artifact reducedMotion={reducedMotion} />

      {/* THE AI/ML IDENTITY, expressed as behaviour rather than iconography:
          data points that cluster, connections that form from proximity, one
          node at a time reassigning itself, and inference pulses that
          propagate hop by hop through the graph. Hero band only — Skills has
          its own constellation for the named-technology version of this. */}
      <NeuralField count={effectiveTier.neurons} reducedMotion={reducedMotion} />

      {/* The one scripted event in the opening: a structure that gathers itself
          out of loose shards, holds while energy runs through it, and comes
          apart again. Deliberately singular -- a field of things animating
          reads as effects, one thing worth watching reads as a world. */}
      <GlassAssembly reducedMotion={reducedMotion} />

      <Atmosphere tier={effectiveTier} reducedMotion={reducedMotion} />
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
