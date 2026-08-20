import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pulseEnergy, scrollState } from '../state/scrollStore'
import { useWorldStore } from '../state/worldStore'
import { consumeSpin, registerInteractive } from './interaction'
import { buildFormations, FIELD_RADIUS, FORMATION_COUNT } from './formations'
import { PALETTE, STATIONS, figurePresence, sampleMood, stationSpan } from './stations'
import { projects } from '../data/projects'

/**
 * The field.
 *
 * This is the entire world. Not a background, not a hero prop — the one object
 * the site is made of. It is the environment, the structures, the character
 * and the subject of every shot, and scrolling reorganises it rather than
 * moving past it.
 *
 * HOW THE MORPH IS AFFORDABLE
 * ---------------------------
 * Every formation is precomputed once into its own vertex attribute, so all
 * eight target states live on the GPU simultaneously and morphing is a `mix`
 * between two of them selected by a uniform. There is no per-frame buffer
 * upload, no CPU-side interpolation of tens of thousands of positions, and no
 * hitch when the state changes — the cost of the morph is one lerp per vertex,
 * which is free.
 *
 * The alternative — swapping attribute data on the CPU at each transition —
 * uploads hundreds of kilobytes mid-scroll, which is exactly when a hitch is
 * most visible.
 */

const vertexShader = /* glsl */ `
  attribute vec3 aF0;
  attribute vec3 aF1;
  attribute vec3 aF2;
  attribute vec3 aF3;
  attribute vec3 aF4;
  attribute vec3 aF5;
  attribute vec3 aF6;
  attribute vec3 aF7;
  attribute float aSeed;
  attribute float aSize;

  uniform float uFormA;
  uniform float uFormB;
  uniform float uBlend;
  uniform float uFigure;
  uniform float uTime;
  uniform float uDispersion;
  uniform float uPointScale;
  uniform float uEnergy;
  uniform vec3  uCursor;
  uniform float uCursorRadius;
  uniform float uCursorPush;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uPixelRatio;

  varying float vFog;
  varying float vSignal;
  varying float vSeed;

  // Uniform-driven branch: every invocation takes the same path, so this is
  // coherent and cheap despite looking like eight comparisons.
  vec3 pickForm(float id) {
    if (id < 0.5) return aF0;
    if (id < 1.5) return aF1;
    if (id < 2.5) return aF2;
    if (id < 3.5) return aF3;
    if (id < 4.5) return aF4;
    if (id < 5.5) return aF5;
    if (id < 6.5) return aF6;
    return aF7;
  }

  void main() {
    vec3 target = mix(pickForm(uFormA), pickForm(uFormB), uBlend);

    // A fraction of the field always traces the figure, so a silhouette keeps
    // surfacing inside whatever else the substance is doing. The band is a
    // smoothstep rather than a step so points TRAVEL between the two states
    // instead of teleporting when the fraction changes.
    float trace = smoothstep(1.0 - uFigure - 0.07, 1.0 - uFigure, aSeed);
    target = mix(target, aF1, trace);
    vSignal = trace;

    // Dispersion: how loosely points sit on their targets. Low reads as
    // resolved and crystalline, high as unresolved and thinking.
    vec3 wobble = vec3(
      sin(uTime * 0.47 + aSeed * 63.0),
      cos(uTime * 0.41 + aSeed * 41.0),
      sin(uTime * 0.35 + aSeed * 77.0)
    );
    vec3 pos = target + wobble * uDispersion * (0.35 + aSeed * 0.75);

    // The cursor is a disturbance IN the substance, not an overlay on top of
    // it: points near it are pushed outward, opening a void that follows the
    // pointer through the field.
    vec3 toCursor = pos - uCursor;
    float dist = length(toCursor);
    float infl = exp(-(dist * dist) / (uCursorRadius * uCursorRadius));
    pos += normalize(toCursor + vec3(0.0001)) * infl * uCursorPush;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Manual fog. Points do not receive three's fog, and without depth falloff
    // a point cloud has no volume — it reads as a flat sprite sheet.
    float depth = -mv.z;
    vFog = 1.0 - smoothstep(uFogNear, uFogFar, depth);
    vSeed = aSeed;

    // Perspective sizing, clamped at both ends: unclamped, near points bloom
    // into bokeh blobs and far ones vanish below a pixel and alias into noise.
    float size = aSize * uPointScale * (1.0 + uEnergy * 0.25 + infl * 1.6);
    gl_PointSize = clamp(size * (220.0 / max(depth, 1.0)), 0.8, 7.0) * uPixelRatio;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uCool;
  uniform vec3 uWarm;
  uniform float uAccentPower;
  uniform float uDensity;
  uniform float uEnergy;

  varying float vFog;
  varying float vSignal;
  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // A tight core with a soft halo, rather than one uniform blob. The halo is
    // what the bloom pass catches, and it is what makes a point read as a
    // light source instead of as a dot.
    float core = smoothstep(0.26, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.32;

    // Crimson is a SIGNAL, not a wash: it is carried by the points tracing the
    // figure plus a small deterministic minority of the rest. Tinting the
    // whole field is what turned the previous direction magenta.
    float warmth = max(vSignal, step(0.93, vSeed)) * uAccentPower;
    vec3 col = mix(uCool, uWarm, clamp(warmth + uEnergy * 0.18, 0.0, 1.0));

    float alpha = (core + halo) * vFog * uDensity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col, alpha);
  }
`

export default function LatentField({ count = 24000, reducedMotion = false }) {
  const { camera } = useThree()
  const groupRef = useRef()
  const pointsRef = useRef()
  const matRef = useRef()
  const colliderRef = useRef()
  const spin = useRef({ x: 0, y: 0 })
  const cursorWorld = useRef(new THREE.Vector3())
  const cursorTarget = useRef(new THREE.Vector3())
  const ndc = useRef(new THREE.Vector3())
  const cool = useRef(new THREE.Color(PALETTE.steel))
  const warm = useRef(new THREE.Color(PALETTE.crimson))

  const setHovered = useWorldStore((s) => s.setHovered)

  /**
   * Formation buffers. Built once, off the render path.
   *
   * The cluster formation reads its cluster count from the real project data,
   * so what the visitor is looking at is genuinely the shape of the work
   * rather than a decorative number.
   */
  const { geometry } = useMemo(() => {
    const forms = buildFormations(count, { clusterCount: projects.length })
    const geometry = new THREE.BufferGeometry()

    forms.forEach((buf, i) => {
      geometry.setAttribute(`aF${i}`, new THREE.BufferAttribute(buf, 3))
    })
    // `position` is required by three for bounds and by the shader pipeline,
    // even though every position in this material is authored from aF*.
    geometry.setAttribute('position', new THREE.BufferAttribute(forms[0], 3))

    const seeds = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Golden-ratio stride rather than random: it distributes seeds evenly
      // across 0..1, so the figure-trace threshold selects a spatially even
      // subset instead of a clumped one.
      seeds[i] = (i * 0.6180339887) % 1
      // A heavy tail: most points are dust, a few are bright. Uniform sizes
      // are the single clearest tell of a generated particle system.
      sizes[i] = 0.45 + Math.pow((i * 0.7548776662) % 1, 3.2) * 3.2
    }
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FIELD_RADIUS * 2)

    return { geometry }
  }, [count])

  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uFormA: { value: 0 },
      uFormB: { value: 0 },
      uBlend: { value: 0 },
      uFigure: { value: 0.12 },
      uTime: { value: 0 },
      uDispersion: { value: 0.4 },
      uPointScale: { value: 1 },
      uEnergy: { value: 0 },
      uCursor: { value: new THREE.Vector3(999, 999, 999) },
      uCursorRadius: { value: 2.2 },
      uCursorPush: { value: 0 },
      uFogNear: { value: 12 },
      uFogFar: { value: 62 },
      uPixelRatio: { value: 1 },
      uCool: { value: new THREE.Color(PALETTE.steel) },
      uWarm: { value: new THREE.Color(PALETTE.crimson) },
      uAccentPower: { value: 0.8 },
      uDensity: { value: 1 },
    }),
    []
  )

  /**
   * A collider, not a visual.
   *
   * Raycasting a 24,000-point cloud per frame is not viable, and point
   * raycasting needs a threshold that either misses everything or hits
   * everything. An invisible sphere gives the pointer something honest to hit,
   * which is what makes the field hoverable and drag-rotatable at all.
   */
  useEffect(
    () =>
      registerInteractive('latent-field', {
        object: colliderRef,
        label: 'LATENT FIELD',
        draggable: true,
        onActivate: () => pulseEnergy(0.75),
      }),
    []
  )

  // The hover label names whatever the field currently IS, so the readout is
  // part of the narrative rather than a generic tooltip.
  const hovered = useWorldStore((s) => s.hovered)
  useEffect(() => {
    if (hovered?.id !== 'latent-field') return
    const { i } = stationSpan(scrollState().station)
    const label = `LATENT FIELD — ${STATIONS[i].label}`
    if (hovered.label !== label) setHovered({ id: 'latent-field', label })
  }, [hovered, setHovered])

  useFrame((state, delta) => {
    const s = scrollState()
    const { i, j, t } = stationSpan(s.station)
    const u = matRef.current?.uniforms
    if (!u) return

    /* ---- formation ---- */
    u.uFormA.value = i
    u.uFormB.value = j
    // Ease the blend so the field lingers in each resolved state and moves
    // decisively between them, instead of being permanently half-formed.
    u.uBlend.value = t * t * (3 - 2 * t)
    u.uFigure.value += (figurePresence(s.station) - u.uFigure.value) * Math.min(1, delta * 2)

    u.uTime.value = reducedMotion ? 0 : s.time
    u.uEnergy.value = s.energy

    /* ---- mood ---- */
    const ease = Math.min(1, delta * 3)
    u.uDispersion.value += (sampleMood(s.station, 'dispersion') * (1 + s.energy * 0.5) - u.uDispersion.value) * ease
    u.uPointScale.value += (sampleMood(s.station, 'pointScale') - u.uPointScale.value) * ease
    u.uDensity.value += (sampleMood(s.station, 'density') - u.uDensity.value) * ease
    u.uAccentPower.value += (sampleMood(s.station, 'accentPower') - u.uAccentPower.value) * ease
    u.uFogNear.value += (sampleMood(s.station, 'fogNear') - u.uFogNear.value) * ease
    u.uFogFar.value += (sampleMood(s.station, 'fogFar') - u.uFogFar.value) * ease
    u.uPixelRatio.value = state.viewport.dpr || 1
    u.uCool.value.copy(cool.current)
    u.uWarm.value.copy(warm.current)

    /* ---- cursor disturbance ---- */
    // Unproject the pointer onto the plane through the field's centre that
    // faces the camera, so the disturbance sits at the depth the visitor is
    // actually looking at rather than at an arbitrary distance.
    ndc.current.set(s.pointerSmoothX, s.pointerSmoothY, 0.5).unproject(camera)
    const dir = ndc.current.sub(camera.position).normalize()
    const camDist = camera.position.length()
    cursorTarget.current.copy(camera.position).addScaledVector(dir, camDist)
    cursorWorld.current.lerp(cursorTarget.current, Math.min(1, delta * 6))
    u.uCursor.value.copy(cursorWorld.current)
    u.uCursorPush.value = reducedMotion ? 0 : 0.9 + s.energy * 1.6

    /* ---- the field turns ---- */
    const g = groupRef.current
    if (g) {
      const drag = consumeSpin('latent-field', delta)
      if (drag) {
        spin.current.x += drag.x
        spin.current.y += drag.y
      }
      // A permanent slow rotation, so the subject is never static even when
      // the visitor stops scrolling. Damped hard on reduced motion.
      const idle = reducedMotion ? 0 : s.time * 0.022
      g.rotation.set(spin.current.x * 0.6, idle + spin.current.y, 0)
    }
  })

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <mesh ref={colliderRef} visible={false}>
        <sphereGeometry args={[FIELD_RADIUS * 1.05, 12, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

export { FORMATION_COUNT }
