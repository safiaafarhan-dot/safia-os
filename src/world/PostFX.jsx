import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { scrollState } from '../state/scrollStore'
import { sampleMood } from './stations'
import { blackHoleState } from './blackHoleState'
import { shockwaveAt } from './transitTimeline'
import { STATIONS } from './stations'

/**
 * The photographic grade.
 *
 * This is the difference between "a 3D scene in a browser" and "a shot". Four
 * things do almost all of that work:
 *
 *  1. BLOOM. Every point in the field is an emissive source. Light that does
 *     not bleed reads as a screen-space graphic; bloom is what makes those
 *     points read as light in a room that has air in it.
 *  2. VIGNETTE. Corners falling off focuses the eye on the reading column, and
 *     is most of why a frame feels shot rather than rendered.
 *  3. GRAIN. Very dark wide gradients band on 8-bit displays, and banding is
 *     the single most "cheap render" artefact there is.
 *  4. CHROMATIC ABERRATION, driven by scroll velocity, so fast travel visibly
 *     stresses the optics.
 *
 * WHY THIS IS HAND-ROLLED
 * -----------------------
 * The first version used EffectComposer with UnrealBloomPass and OutputPass.
 * Bisected against the live page, each pass rendered correctly on its own, but
 * the assembled four-pass chain silently dropped every additive-transparent
 * object in the scene — which here is the entire world. Rather than ship a
 * render chain whose failure mode was not understood, this is three explicit
 * render targets driven by hand: predictable, debuggable, a fraction of the
 * draw calls (UnrealBloom runs five mip levels; this runs one), and it keeps
 * the examples/jsm postprocessing bundle out of the chunk.
 */

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Isolate what is bright enough to glow. */
const brightFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // A soft knee rather than a hard cut: a hard threshold makes bloom pop on
    // and off as a source crosses it, which reads as flicker.
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + uKnee, l), 1.0);
  }
`

/** Separable gaussian. Run once horizontally, once vertically. */
const blurFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;

  void main() {
    // 5-tap, weights from a normalised gaussian. Sampling at non-integer
    // offsets exploits bilinear filtering to cover 13 texels for 5 fetches.
    vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
    sum += texture2D(tDiffuse, vUv + uDirection * 1.3846153846) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - uDirection * 1.3846153846) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + uDirection * 3.2307692308) * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - uDirection * 3.2307692308) * 0.0702702703;
    gl_FragColor = sum;
  }
`

const finalFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform vec2  uBH;
  uniform float uBHRadius;
  uniform float uBHStrength;
  uniform float uAspect;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uAberration;
  uniform float uGrain;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec3  uTint;
  // The blast front thrown off by a transit breaking. Radius is in units of
  // half-frame-height; strength is its remaining energy. See shockwaveAt().
  uniform float uShockRadius;
  uniform float uShockStrength;
  uniform vec3  uShockTint;
  // SIGNED radial smear under travel. Sign is the scroll direction, so
  // reversing streaks the other way.
  uniform float uStreak;

  void main() {
    vec2 centre = vUv - 0.5;
    float r = length(centre);

    // GRAVITATIONAL LENSING.
    //
    // Light bending has to distort what is ALREADY BEHIND the hole — stars,
    // corridor architecture, the far side of its own disk — so it cannot live
    // on the object. It lives here, warping the rendered frame around the
    // hole's projected screen position.
    //
    // The displacement falls off as 1/r^2 from the horizon, which is the right
    // shape: strong enough at the rim to smear the background into arcs,
    // effectively gone a few radii out. Clamped, because near r=0 the term
    // diverges and would tear the image apart.
    vec2 lensUv = vUv;
    if (uBHStrength > 0.001) {
      vec2 d = vUv - uBH;
      d.x *= uAspect;
      float dist = max(length(d), 0.0008);
      float pull = uBHStrength * (uBHRadius * uBHRadius) / (dist * dist);
      pull = min(pull, 0.42);

      // Fade the displacement out INSIDE the horizon. This is what stops the
      // warp sampling from outside the shadow and dragging the bright inner
      // edge of the disk into the middle of it as a white smear. Killing the
      // warp there means those pixels sample themselves - and what is actually
      // there is the horizon sphere, which is real geometry with real depth.
      pull *= smoothstep(uBHRadius * 0.72, uBHRadius * 1.18, dist);

      vec2 dir = normalize(vec2(d.x / uAspect, d.y));
      lensUv = vUv - dir * pull * dist;
    }

    // THE SHOCKWAVE.
    //
    // A ring of radial displacement expanding from the centre of frame, which
    // is where the transit that emitted it just broke. It displaces what is
    // ALREADY RENDERED — the same reason the black hole's lensing lives here
    // rather than on the object — so the whole world bulges as the front
    // passes through it rather than a ring being drawn on top of it.
    //
    // The front WIDENS as it expands. A constant-width ring reads as a
    // scaling graphic; a dispersing one reads as a pressure wave losing
    // coherence, which is what one actually does.
    float shockRing = 0.0;
    if (uShockStrength > 0.001) {
      vec2 sd = centre;
      sd.x *= uAspect;
      float sr = length(sd);
      float width = 0.04 + uShockRadius * 0.075;
      float band = (sr - uShockRadius * 0.5) / width;
      shockRing = exp(-band * band);
      vec2 sdir = sr > 0.0001 ? normalize(vec2(sd.x / uAspect, sd.y)) : vec2(0.0);
      // Sampling INWARD makes the image appear pushed outward at the front.
      lensUv -= sdir * shockRing * uShockStrength * 0.045;
    }

    // Chromatic aberration, scaled by distance from centre so the middle of
    // the frame — where the text lives — stays perfectly sharp. The blast
    // front bends light as it passes, so it splits harder there.
    vec2 offset = centre * (uAberration + shockRing * uShockStrength * 0.004) * r;
    vec3 col;
    col.r = texture2D(tScene, lensUv + offset).r;
    col.g = texture2D(tScene, lensUv).g;
    col.b = texture2D(tScene, lensUv - offset).b;

    // LIGHT STREAKS UNDER TRAVEL.
    //
    // A short radial smear whose length and direction come from the signed
    // scroll flow, so moving fast draws every point source out into a streak
    // and reversing draws it the other way. This is the optical consequence of
    // the speed the aberration above is already responding to — the two are
    // the same lens under the same stress, which is why it belongs here rather
    // than in a trail system bolted to the particles.
    //
    // The branch is on a uniform, so it costs nothing at rest — the whole
    // wavefront takes the same path.
    //
    // Safe for legibility by construction: the canvas holds only the world.
    // Every word on the page is DOM painted on top of it, so smearing this
    // buffer cannot touch a glyph, and softening what sits behind the reading
    // column raises contrast rather than lowering it.
    if (abs(uStreak) > 0.002) {
      vec3 acc = col;
      float total = 1.0;
      for (int i = 1; i <= 6; i++) {
        float k = float(i) / 6.0;
        // Weighted toward the current pixel so the image stays anchored and
        // only trails; a flat average reads as the whole frame going soft.
        float w = 1.0 - k * 0.82;
        acc += texture2D(tScene, lensUv - centre * uStreak * 0.075 * k).rgb * w;
        total += w;
      }
      col = acc / total;
    }

    col += texture2D(tBloom, lensUv).rgb * uBloom;

    // The front itself is luminous — compressed medium glowing as it is swept.
    // Additive and thin, so it reads as the edge of the blast rather than as a
    // drawn circle.
    col += uShockTint * shockRing * uShockStrength * 0.5;

    // NOTE: the shadow is NOT re-imposed here any more.
    //
    // An earlier pass painted a black disc in screen space to kill the smear.
    // It worked, but a screen-space disc has no depth information, so it also
    // erased anything drawn in FRONT of the hole - which, now that the
    // guardian travels into the foreground during the approach, means the
    // protagonist. Attenuating the warp inside the horizon fixes the smear at
    // its cause and lets the horizon sphere occlude properly.

    // Vignette. Multiplied, not subtracted, so it darkens without crushing
    // colour toward grey at the edges.
    float vig = smoothstep(1.08, 0.26, r * uVignette);
    col *= mix(1.0, vig, 0.85);

    // Interaction tints the whole frame very slightly crimson — the image
    // responds, not just the object that was touched.
    col += uTint * uEnergy * 0.03 * (1.0 - r);

    float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 137.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`

/**
 * Bloom resolution divisor.
 *
 * Bloom is blur by definition, so resolution is nearly free to give up - and
 * this chain is fill-rate bound, so every step down is a square saving. At /6
 * the difference from /4 is not visible even side by side, and it cut the
 * measured blocking time of the grade substantially.
 */
const BLOOM_DIV = 6

/**
 * Update the glow every other frame.
 *
 * Bloom is a low-frequency signal: it is a heavily blurred copy of the frame,
 * so halving its update rate is imperceptible even during fast scrolling,
 * while halving the cost of the most expensive part of the chain. The scene
 * pass and the composite still run every frame, so nothing about the image
 * itself is stale - only the glow lags by up to one frame.
 */
const BLOOM_EVERY = 2

/** Scratch colour for the blast front. Module scope so no allocation per frame. */
const shockColour = new THREE.Color()

/**
 * Mounted only on the tiers that can carry it — see WorldCanvas. On weak
 * hardware the extra full-screen passes are the first thing that should go.
 */
export default function PostFX({ reducedMotion = false }) {
  const { gl, scene, camera, size, viewport } = useThree()
  const frame = useRef(0)

  const fx = useMemo(() => {
    // The scene target keeps a depth buffer; the bloom ping-pongs do not need
    // one, and allocating them without it saves a third of the memory.
    const rtScene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    })
    const half = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }
    const rtA = new THREE.WebGLRenderTarget(1, 1, half)
    const rtB = new THREE.WebGLRenderTarget(1, 1, half)

    const brightMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: brightFragment,
      uniforms: {
        tDiffuse: { value: null },
        // Threshold sits high on purpose. At 0.4 every mid-bright crimson
        // surface in the scene qualified as a light source, so the reactor and
        // the edge lines all flared into one red smear. Only genuinely hot
        // pixels should bloom; everything else keeps its shape.
        uThreshold: { value: 0.72 },
        uKnee: { value: 0.28 },
      },
      depthTest: false,
      depthWrite: false,
    })

    const blurMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: blurFragment,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
    })

    const finalMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: finalFragment,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBH: { value: new THREE.Vector2(0.5, 0.5) },
        uBHRadius: { value: 0 },
        uBHStrength: { value: 0 },
        uAspect: { value: 1 },
        uBloom: { value: 0.7 },
        uVignette: { value: 1 },
        uAberration: { value: 0 },
        uGrain: { value: 0.03 },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uTint: { value: new THREE.Color('#ff3350') },
        uShockRadius: { value: 0 },
        uShockStrength: { value: 0 },
        uShockTint: { value: new THREE.Color('#bfe6ff') },
        uStreak: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    return { rtScene, rtA, rtB, brightMat, blurMat, finalMat, quad: new FullScreenQuad() }
  }, [])

  /**
   * Diagnostic handle, matching `__world`, `__artifact` and `__safeZone`.
   *
   * The grade's materials live on a FullScreenQuad, not in the scene graph, so
   * nothing that walks `scene` can see them — which makes every value in this
   * pass invisible to exactly the kind of probe used to verify the rest of the
   * world. The shockwave and the streak are both driven from world state and
   * both need to be checkable without trying to catch them in a screenshot.
   *
   * IT IS PUBLISHED FROM AN EFFECT, NOT FROM THE useMemo.
   *
   * Assigning it inside the memo looked equivalent and was not: in development
   * the component renders more than once (StrictMode, and every HMR update),
   * each render builds a memo, and only one of those instances survives to run
   * the frame loop. The handle therefore pointed at a DISCARDED material while
   * the live one updated normally — so every uniform read through it was
   * frozen at its initial value, and the effects looked completely dead while
   * working perfectly. An effect only runs for the committed instance.
   *
   * DEV only; nothing in the app reads this.
   */
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    window.__postfx = fx.finalMat.uniforms
  }, [fx])

  useEffect(() => {
    const dpr = viewport.dpr || 1
    const w = Math.max(1, Math.round(size.width * dpr))
    const h = Math.max(1, Math.round(size.height * dpr))
    fx.rtScene.setSize(w, h)
    const bw = Math.max(1, Math.round(w / BLOOM_DIV))
    const bh = Math.max(1, Math.round(h / BLOOM_DIV))
    fx.rtA.setSize(bw, bh)
    fx.rtB.setSize(bw, bh)
  }, [fx, size, viewport.dpr])

  useEffect(
    () => () => {
      fx.rtScene.dispose()
      fx.rtA.dispose()
      fx.rtB.dispose()
      fx.brightMat.dispose()
      fx.blurMat.dispose()
      fx.finalMat.dispose()
      fx.quad.dispose()
    },
    [fx]
  )

  // priority > 0 takes the render loop away from react-three-fiber, which is
  // what lets this own the final frame.
  useFrame((state, delta) => {
    const s = scrollState()
    const { rtScene, rtA, rtB, brightMat, blurMat, finalMat, quad } = fx

    // Exposure is a per-station dial, so scrolling genuinely changes how the
    // world is photographed rather than only what is in front of the lens.
    const targetExposure = sampleMood(s.station, 'exposure') * (1 + s.energy * 0.08)
    gl.toneMappingExposure += (targetExposure - gl.toneMappingExposure) * Math.min(1, delta * 3)

    /* ---- 1. scene ---- */
    gl.setRenderTarget(rtScene)
    gl.clear()
    gl.render(scene, camera)

    /* ---- 2-3. bright pass + blur, on alternate frames ---- */
    frame.current += 1
    if (frame.current % BLOOM_EVERY === 0) {
      brightMat.uniforms.tDiffuse.value = rtScene.texture
      quad.material = brightMat
      gl.setRenderTarget(rtA)
      gl.clear()
      quad.render(gl)

      const bw = rtA.width
      const bh = rtA.height
      quad.material = blurMat

      const blur = (src, dst, dx, dy) => {
        blurMat.uniforms.tDiffuse.value = src.texture
        blurMat.uniforms.uDirection.value.set(dx, dy)
        gl.setRenderTarget(dst)
        gl.clear()
        quad.render(gl)
      }

      // TWO octaves, not one.
      //
      // A single octave at this resolution was visibly broken: the reactor is
      // a sub-pixel source at 1/6 scale, so a 5-tap blur spread it over only a
      // few texels and upsampling turned it into a blocky red grid across the
      // guardian's chest. It read as a rendering fault, which it was. A second
      // wider pass spreads a point source far enough that nothing blocky
      // survives the upsample. Four quad renders at 1/36 area each is
      // negligible next to what it fixes.
      blur(rtA, rtB, 1.2 / bw, 0)
      blur(rtB, rtA, 0, 1.2 / bh)
      blur(rtA, rtB, 3.4 / bw, 0)
      blur(rtB, rtA, 0, 3.4 / bh)
    }

    /* ---- 4. composite to screen ---- */
    const u = finalMat.uniforms
    u.tScene.value = rtScene.texture
    u.tBloom.value = rtA.texture
    u.uBloom.value = sampleMood(s.station, 'bloom') * (1 + s.energy * 0.45)
    u.uTime.value = s.time
    u.uEnergy.value = s.energy
    u.uVignette.value += (sampleMood(s.station, 'vignette') - u.uVignette.value) * Math.min(1, delta * 3)
    // Optics stress under speed. Clamped low: past ~0.004 it stops reading as
    // a lens and starts reading as a broken image.
    const targetAb = reducedMotion ? 0 : Math.min(0.0035, Math.abs(s.velocity) * 0.0016) + 0.0005
    u.uAberration.value += (targetAb - u.uAberration.value) * Math.min(1, delta * 6)
    u.uGrain.value = reducedMotion ? 0.018 : 0.03

    // THE BLAST FRONT FROM THE TRANSIT THAT JUST BROKE.
    //
    // Read straight from the same pure timeline the transit itself runs on —
    // see shockwaveAt() — so the wave cannot drift out of sync with the event
    // that emitted it, and so its envelope is verifiable headlessly rather than
    // by trying to catch it in a screenshot.
    const wave = shockwaveAt(s.station, { reducedMotion })
    u.uShockRadius.value = wave.radius
    u.uShockStrength.value = wave.strength
    if (wave.live) {
      // The front carries the colour of the station it is arriving INTO, so
      // the wave is part of the palette handover rather than a white flash
      // sitting on top of it.
      const idx = Math.max(0, Math.min(STATIONS.length - 1, wave.at))
      shockColour.set(STATIONS[idx].mood.accent)
      u.uShockTint.value.lerp(shockColour, 0.25)
    }

    // SPEED SMEARS THE OPTICS. Signed, so reversing streaks the other way.
    // Clamped hard: past about 0.1 the frame stops reading as a fast pan and
    // starts reading as a dropped frame.
    const targetStreak = reducedMotion
      ? 0
      : Math.max(-0.11, Math.min(0.11, s.flow * 0.16))
    u.uStreak.value += (targetStreak - u.uStreak.value) * Math.min(1, delta * 7)

    // The black hole publishes where it is; the warp is applied here.
    u.uBH.value.set(blackHoleState.x, blackHoleState.y)
    u.uBHRadius.value = blackHoleState.radius
    u.uBHStrength.value = blackHoleState.strength
    u.uAspect.value = state.size.width / Math.max(1, state.size.height)

    quad.material = finalMat
    gl.setRenderTarget(null)
    quad.render(gl)
  }, 1)

  return null
}
