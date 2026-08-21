import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ignitionAt, scrollState } from '../state/scrollStore'
import { artifactState } from './artifactState'
import { influenceAt } from './cursorFieldState'

/**
 * THE UNIVERSE BUILDS THE NAME.
 *
 * Particles scattered through the volume are drawn in, accelerate, and settle
 * into the shape of the wordmark — in real 3D space, in front of the camera —
 * and the crisp DOM type resolves inside the shape they just built. Scroll on
 * and they let go of it and escape back into the field.
 *
 * WHY THE PARTICLES ARE NOT THE TEXT. The obvious version of this effect makes
 * the particles the identity and reads it as a shape. That is unreadable at
 * small sizes, invisible to assistive technology, illegible on a phone, and
 * gone entirely if WebGL fails — for the one string on the page that must be
 * legible instantly and unconditionally. So the particles build the FORM and
 * the DOM wordmark is the CONTENT. The universe constructs the identity; what
 * you actually read is real, selectable, accessible text sitting inside it.
 *
 * IT IS REGISTERED TO THE REAL LAYOUT, NOT TO A COORDINATE. The targets are
 * sampled from the actual glyphs and then anchored to the wordmark's measured
 * bounding box, so the cloud lands exactly on the type at any viewport, at any
 * font size, on a phone or a widescreen. Authoring a position in world units
 * would mean the two agreeing at one window size and drifting apart at every
 * other.
 *
 * ------------------------------------------------------------------ the flight
 *
 * Every particle's path is a closed-form function of its seed and two uniforms,
 * so the whole cloud costs two numbers per frame and no CPU integration — the
 * same discipline as the dust field and the embers.
 *
 *   ORIGIN    a scattered point in a volume much larger than the word
 *   TARGET    a point sampled from inside a glyph
 *   EASE      a damped oscillation, so each particle accelerates in, overshoots
 *             its seat once, and settles. A linear or smoothstep arrival reads
 *             as interpolation; the overshoot is what reads as attraction.
 *   DELAY     per-particle, so the word does not snap into being all at once
 *   TURBULENCE decaying with arrival, so the flight is disturbed and the
 *             landing is exact
 *
 * On the way out they do NOT retrace that path. Reversing an assembly is a
 * rewind, and a rewind reads as a video being scrubbed; escaping along a fresh
 * outward vector reads as the form letting go.
 */

const identityVertex = /* glsl */ `
  attribute vec3 aTarget;
  attribute vec3 aOrigin;
  attribute vec3 aEscape;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aSize;

  uniform float uForm;      // 0..1 assembly
  uniform float uEscape;    // 0..1 dispersal
  uniform float uTime;
  uniform float uCursor;    // 0..1 local pointer influence
  uniform float uIdle;      // 0..1 how still the page is

  varying float vAlpha;
  varying float vSeat;

  void main() {
    // Per-particle progress. The delay is applied to the TARGET rather than as
    // a delayed start, so a particle already in flight when the direction
    // changes keeps moving instead of freezing until its turn.
    float t = clamp((uForm - aDelay) / max(0.0001, 1.0 - aDelay), 0.0, 1.0);

    // Damped oscillation: accelerate in, overshoot once, settle. This is the
    // difference between a particle being ATTRACTED and a value being lerped.
    float e = 1.0 - exp(-5.2 * t) * cos(6.6 * t);

    vec3 p = mix(aOrigin, aTarget, e);

    // EVERY AMPLITUDE BELOW IS IN WORD-WIDTHS.
    //
    // The targets are normalised so the whole wordmark spans exactly 1.0 in x,
    // which makes this local space deceptively small: a displacement of 0.26
    // is not a small nudge, it is a quarter of the entire word. The first pass
    // used values sized as though these were world units and the seated cloud
    // was scattered so far off its targets that no letterform survived — a
    // diffuse haze around the type instead of the shape of it. Anything that
    // acts on a SEATED particle has to be a low single-digit percentage.
    //
    // Turbulence while travelling is the exception and is deliberately large:
    // that is flight, not form. It decays to nothing on arrival, because
    // anything still moving at the seat blurs the letterform the DOM type has
    // to sit inside.
    float unsettled = 1.0 - t;
    float w = unsettled * unsettled * 1.2;
    p.x += sin(aSeed * 6.283 + uTime * 1.3) * w;
    p.y += cos(aSeed * 9.171 + uTime * 1.1) * w;
    p.z += sin(aSeed * 4.113 + uTime * 0.9) * w * 1.6;

    // Once seated, a shallow breath so the form is alive rather than frozen.
    // Strongest when the page is still, like everything else in this world.
    float seated = t * (1.0 - uEscape);
    // ~0.4% of the word at rest, ~1% when the page has been still a while.
    // Enough that the form is alive; far too little to soften a letter.
    float breathe = 0.004 + uIdle * 0.006;
    p.x += sin(uTime * 0.5 + aSeed * 12.0) * breathe * seated;
    p.y += cos(uTime * 0.42 + aSeed * 7.3) * breathe * seated;
    p.z += sin(uTime * 0.33 + aSeed * 5.1) * breathe * 1.8 * seated;

    // The cursor lifts the cloud very slightly off the plane. Level 2 in the
    // interaction hierarchy — felt, never seen, and never enough to disturb
    // the shape the type is sitting in.
    p.z += uCursor * (0.5 + aSeed) * 0.06 * seated;

    // LETTING GO. A fresh outward vector rather than the path back, so the
    // exit is a dispersal and not a rewind.
    float esc = uEscape * uEscape;
    p += aEscape * esc * 26.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vSeat = t;
    // Dim while travelling, brightest at the moment of arrival, then settling
    // back — so the form announces itself as it lands rather than simply
    // being there.
    float arrive = smoothstep(0.55, 1.0, t);
    vAlpha = (0.25 + 0.75 * t) * (1.0 - uEscape) * (0.75 + arrive * 0.25);

    gl_PointSize = aSize * (1.0 + (1.0 - t) * 0.8) * (140.0 / max(1.0, -mv.z));
  }
`

const identityFragment = /* glsl */ `
  uniform vec3 uCold;
  uniform vec3 uHot;
  uniform float uOpacity;

  varying float vAlpha;
  varying float vSeat;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.34, 0.0, d);
    float skirt = smoothstep(0.5, 0.0, d) * 0.28;
    // Cools as it seats: hot while it is still energy, cold once it is form.
    vec3 col = mix(uHot, uCold, smoothstep(0.3, 1.0, vSeat));
    gl_FragColor = vec4(col, (core + skirt) * vAlpha * uOpacity);
  }
`

/** Depth in front of the camera the identity plane sits at. */
const PLANE_DIST = 26

/**
 * Sample points from inside the glyphs of a string.
 *
 * Rendering the text to an offscreen canvas and reading back which pixels are
 * covered is the only way to get targets that match the ACTUAL letterforms,
 * including the font's real curves and the kerning the browser applied. The
 * alternative — hand-authored point lists per glyph — cannot track a font
 * change and cannot express a typeface at all.
 *
 * Returns points normalised to x in -0.5..0.5 and y scaled by the aspect of
 * the rendered text, so the caller can map them onto any measured rectangle.
 */
function sampleGlyphs(text, count) {
  if (typeof document === 'undefined') return null
  const W = 1024
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Weight and family match the wordmark's own class so the sampled silhouette
  // is the silhouette the visitor ends up reading.
  ctx.font = `700 ${Math.round(H * 0.62)}px Inter, system-ui, sans-serif`
  ctx.fillText(text, W / 2, H / 2)

  let data
  try {
    data = ctx.getImageData(0, 0, W, H).data
  } catch {
    // Tainted canvas should be impossible here (nothing external is drawn),
    // but a failure must not take the world down with it.
    return null
  }

  // Collect every covered pixel, then take an evenly spaced stride through the
  // list. Random sampling clumps; a stride gives even coverage across all the
  // glyphs, so no letter ends up sparser than its neighbours.
  const hits = []
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 140) hits.push(x, y)
    }
  }
  const total = hits.length / 2
  if (total === 0) return null

  const out = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    // Golden-ratio stride, so consecutive particles are never neighbours and
    // the form fills in all over at once rather than sweeping.
    const k = Math.floor(((i * 0.6180339887) % 1) * total)
    const x = hits[k * 2]
    const y = hits[k * 2 + 1]
    // Jitter within the sampling cell so the cloud does not sit on a grid.
    // Both axes are divided by the same W, so the aspect of the real
    // letterforms survives.
    out[i * 2] = (x + Math.random() * 2 - 1) / W
    out[i * 2 + 1] = -(y + Math.random() * 2 - 1) / W
  }

  // NORMALISE TO THE INK, NOT TO THE CANVAS.
  //
  // The caller maps these onto the wordmark's measured box by assuming they
  // span exactly 1.0 in x. They do not: the drawn string only covers part of
  // the canvas, so the raw sample spanned about 0.72 and the cloud landed
  // noticeably narrower than the type it was supposed to be building. Fitting
  // to the actual ink bounds makes the assumption true, and makes it hold for
  // any string and any font metrics rather than for this one by luck.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < count; i++) {
    const px = out[i * 2]
    const py = out[i * 2 + 1]
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  // Uniform scale from the x span only — scaling the axes independently would
  // stretch the glyphs to fill the box and stop them being the letterforms.
  const k = 1 / spanX
  for (let i = 0; i < count; i++) {
    out[i * 2] = (out[i * 2] - cx) * k
    out[i * 2 + 1] = (out[i * 2 + 1] - cy) * k
  }
  return out
}

export default function IdentityForm({ count = 1400, reducedMotion = false }) {
  const groupRef = useRef()
  const matRef = useRef()
  const pointsRef = useRef()
  const [glyphs, setGlyphs] = useState(null)
  const rect = useRef({ cx: 0, cy: 0, w: 0, h: 0, found: false })
  const lastMeasure = useRef(0)

  /**
   * Sampled after the webfont has actually loaded.
   *
   * Sampling immediately would silhouette the FALLBACK face, and the particles
   * would then build a shape the wordmark does not have. `document.fonts.ready`
   * is the only reliable signal for that.
   */
  useEffect(() => {
    if (reducedMotion) return
    let cancelled = false
    const build = () => {
      if (cancelled) return
      setGlyphs(sampleGlyphs('SAFIA.OS', count))
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build).catch(build)
    } else {
      build()
    }
    return () => {
      cancelled = true
    }
  }, [count, reducedMotion])

  const geo = useMemo(() => {
    if (!glyphs) return null
    const target = new Float32Array(count * 3)
    const origin = new Float32Array(count * 3)
    const escape = new Float32Array(count * 3)
    const delay = new Float32Array(count)
    const seed = new Float32Array(count)
    const size = new Float32Array(count)
    const pos = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      target[i * 3] = glyphs[i * 2]
      target[i * 3 + 1] = glyphs[i * 2 + 1]
      // A little depth in the seat, so the formed word is a slab of particles
      // rather than a flat decal — it has to survive the camera's parallax.
      target[i * 3 + 2] = (Math.random() - 0.5) * 0.02

      // Scattered through a volume far larger than the word, and biased to
      // come from BEHIND and around rather than from the sides, so the
      // convergence reads as the space delivering them.
      const a = Math.random() * Math.PI * 2
      const r = 1.1 + Math.random() * 2.6
      origin[i * 3] = Math.cos(a) * r
      origin[i * 3 + 1] = Math.sin(a) * r * 0.7
      origin[i * 3 + 2] = -1.4 - Math.random() * 5.5

      const ea = Math.random() * Math.PI * 2
      const eu = Math.random() * 2 - 1
      const er = Math.sqrt(Math.max(0, 1 - eu * eu))
      escape[i * 3] = er * Math.cos(ea)
      escape[i * 3 + 1] = er * Math.sin(ea) * 0.6
      escape[i * 3 + 2] = eu * 0.8 + 0.4

      // Squared, so most particles arrive early and a few trail in. A uniform
      // delay makes the whole word land on one beat.
      delay[i] = Math.pow(Math.random(), 2) * 0.55
      seed[i] = Math.random()
      size[i] = 0.7 + Math.random() * 1.5
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aTarget', new THREE.BufferAttribute(target, 3))
    g.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 3))
    g.setAttribute('aEscape', new THREE.BufferAttribute(escape, 3))
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    // Every particle lives at the origin in object space, so the derived
    // bounding sphere is a point and the cloud would vanish the moment that
    // point left the frustum.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return g
  }, [glyphs, count])

  const uniforms = useMemo(
    () => ({
      uForm: { value: 0 },
      uEscape: { value: 0 },
      uTime: { value: 0 },
      uCursor: { value: 0 },
      uIdle: { value: 0 },
      uOpacity: { value: 0.9 },
      uCold: { value: new THREE.Color('#dfefff') },
      uHot: { value: new THREE.Color('#5fc8ff') },
    }),
    []
  )

  useFrame((state) => {
    const g = groupRef.current
    const mat = matRef.current
    if (!g || !mat || reducedMotion) {
      if (g) g.visible = false
      return
    }
    const s = scrollState()

    // Hero band only, and out of the way while a transit owns the frame.
    const escape = THREE.MathUtils.smoothstep(s.station, 0.22, 0.72)
    const gone = escape >= 0.999 || artifactState.dominance > 0.9
    if (gone) {
      g.visible = false
      return
    }
    g.visible = true

    /**
     * ANCHOR TO THE WORDMARK'S REAL BOX.
     *
     * Throttled hard — this reads layout, and the answer only changes on
     * resize or as the hero scrolls. Same reasoning as measureSafeZone.
     */
    const now = state.clock.elapsedTime * 1000
    if (now - lastMeasure.current > 160) {
      lastMeasure.current = now
      const el = document.querySelector('[data-identity]')
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0) {
          rect.current.cx = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1
          rect.current.cy = -(((r.top + r.height / 2) / window.innerHeight) * 2 - 1)
          rect.current.w = (r.width / window.innerWidth) * 2
          rect.current.found = true
        }
      }
    }
    if (!rect.current.found) {
      g.visible = false
      return
    }

    // NDC to world at the plane's depth, through the camera's own basis, so the
    // cloud holds its registration with the type as the rig banks and drifts.
    const halfH = Math.tan((state.camera.fov * Math.PI) / 360) * PLANE_DIST
    const halfW = halfH * state.camera.aspect
    g.position
      .set(rect.current.cx * halfW, rect.current.cy * halfH, -PLANE_DIST)
      .applyMatrix4(state.camera.matrixWorld)
    g.quaternion.copy(state.camera.quaternion)
    // The sampled points span 1.0 in x, so scaling by the box's world width
    // maps them exactly onto the glyphs.
    g.scale.setScalar(rect.current.w * halfW)

    const u = mat.uniforms
    u.uTime.value = s.time
    // Built after the light has entered the volume and before the structures
    // resolve — the identity is what the awakening is FOR, so it lands at the
    // centre of the sequence rather than at the end of it.
    u.uForm.value = ignitionAt(0.3, 0.78)
    u.uEscape.value = escape
    u.uIdle.value = s.stillness
    u.uCursor.value = influenceAt(g.position.x, g.position.y, g.position.z, 26)
    u.uOpacity.value = 0.9 * (1 - artifactState.dominance)
  })

  if (reducedMotion || !geo) return null

  return (
    <group ref={groupRef} visible={false}>
      <points ref={pointsRef} frustumCulled={false} geometry={geo}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={identityVertex}
          fragmentShader={identityFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </group>
  )
}
