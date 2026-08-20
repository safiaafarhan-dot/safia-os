import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { scrollState } from '../state/scrollStore'
import { sampleMood } from './stations'
import { blackHoleState } from './blackHoleState'

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
      vec2 dir = normalize(vec2(d.x / uAspect, d.y));
      lensUv = vUv - dir * pull * dist;
    }

    // Chromatic aberration, scaled by distance from centre so the middle of
    // the frame — where the text lives — stays perfectly sharp.
    vec2 offset = centre * uAberration * r;
    vec3 col;
    col.r = texture2D(tScene, lensUv + offset).r;
    col.g = texture2D(tScene, lensUv).g;
    col.b = texture2D(tScene, lensUv - offset).b;

    col += texture2D(tBloom, lensUv).rgb * uBloom;

    // THE SHADOW.
    //
    // The warp above displaces UVs radially, which means that just inside the
    // horizon it samples pixels from OUTSIDE it - dragging the bright inner
    // edge of the accretion disk into the middle of the shadow as a white
    // smear. That is precisely backwards: the shadow is the one region no
    // light reaches the camera from.
    //
    // Re-imposing it in screen space is the cheap correct answer. Soft-edged,
    // so the photon ring still reads as the hard rim rather than a cutout.
    if (uBHStrength > 0.001) {
      vec2 sd = vUv - uBH;
      sd.x *= uAspect;
      float shadow = smoothstep(uBHRadius * 1.04, uBHRadius * 0.86, length(sd));
      col = mix(col, vec3(0.0), shadow * 0.97 * uBHStrength);
    }

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
      },
      depthTest: false,
      depthWrite: false,
    })

    return { rtScene, rtA, rtB, brightMat, blurMat, finalMat, quad: new FullScreenQuad() }
  }, [])

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

      // One wide octave rather than two. The taps are spread further apart to
      // keep the long falloff that stops the glow reading as a uniform sticker
      // around every source, for half the passes.
      blur(rtA, rtB, 2.1 / bw, 0)
      blur(rtB, rtA, 0, 2.1 / bh)
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
