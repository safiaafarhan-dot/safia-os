import * as THREE from 'three'

/**
 * One tileable value-noise texture, shared by everything that needs noise.
 *
 * Two reasons this is a module rather than a local helper:
 *
 * 1. IT WAS BEING GENERATED TWICE. DeepSpace built its own for the nebulae,
 *    and the black hole's accretion disk computed noise procedurally in its
 *    fragment shader instead. Same signal, two implementations, and one of
 *    them paid for per pixel.
 *
 * 2. THE PROCEDURAL VERSION WAS EXPENSIVE. The disk shader ran two noise()
 *    calls per fragment, each doing four hash() calls — eight sin() and eight
 *    fract() per pixel — across a region that now covers a large share of the
 *    screen permanently. Two texture fetches replace all of it. Bilinear
 *    filtering also gives smoother interpolation than the smoothstep lattice
 *    did, so the disk banding got slightly better as well as cheaper.
 *
 * Deterministic, so the world looks identical on every load: a nebula that
 * reshuffles on refresh reads as noise rather than as a place.
 */
let cached = null

export function getNoiseTexture(size = 128) {
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)

  const rand = (x, y, s) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return n - Math.floor(n)
  }
  const smooth = (t) => t * t * (3 - 2 * t)

  const octave = (gx, gy, freq, seed) => {
    const fx = (gx / size) * freq
    const fy = (gy / size) * freq
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = smooth(fx - x0)
    const ty = smooth(fy - y0)
    // Wrap the lattice so the texture tiles seamlessly.
    const w = (v) => ((v % freq) + freq) % freq
    const a = rand(w(x0), w(y0), seed)
    const b = rand(w(x0 + 1), w(y0), seed)
    const c = rand(w(x0), w(y0 + 1), seed)
    const d = rand(w(x0 + 1), w(y0 + 1), seed)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      let amp = 0.5
      let freq = 4
      for (let o = 0; o < 4; o++) {
        v += octave(x, y, freq, o + 1) * amp
        amp *= 0.5
        freq *= 2
      }
      const i = (y * size + x) * 4
      const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  cached = tex
  return cached
}
