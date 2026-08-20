import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { scrollState } from '../state/scrollStore'
import { sampleMood } from './stations'

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

    // Chromatic aberration, scaled by distance from centre so the middle of
    // the frame — where the text lives — stays perfectly sharp.
    vec2 offset = centre * uAberration * r;
    vec3 col;
    col.r = texture2D(tScene, vUv + offset).r;
    col.g = texture2D(tScene, vUv).g;
    col.b = texture2D(tScene, vUv - offset).b;

    col += texture2D(tBloom, vUv).rgb * uBloom;

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

/** Quarter resolution. Bloom is blur by definition, so the loss is invisible. */
const BLOOM_DIV = 4

/**
 * Mounted only on the tiers that can carry it — see WorldCanvas. On weak
 * hardware the extra full-screen passes are the first thing that should go.
 */
export default function PostFX({ reducedMotion = false }) {
  const { gl, scene, camera, size, viewport } = useThree()

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

    /* ---- 2. bright pass at quarter res ---- */
    brightMat.uniforms.tDiffuse.value = rtScene.texture
    quad.material = brightMat
    gl.setRenderTarget(rtA)
    gl.clear()
    quad.render(gl)

    /* ---- 3. separable blur, two octaves ---- */
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

    blur(rtA, rtB, 1 / bw, 0)
    blur(rtB, rtA, 0, 1 / bh)
    // A second, wider octave so the glow has a long falloff. One blur radius
    // reads as a uniform sticker around every source.
    blur(rtA, rtB, 2.4 / bw, 0)
    blur(rtB, rtA, 0, 2.4 / bh)

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

    quad.material = finalMat
    gl.setRenderTarget(null)
    quad.render(gl)
  }, 1)

  return null
}
