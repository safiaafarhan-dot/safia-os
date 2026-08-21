/**
 * PROCEDURAL GLASS AUDIO.
 *
 * Every sound here is synthesised at call time from noise and a couple of
 * filters — there are no audio files, so this costs nothing to load and cannot
 * block first paint. It is also the only way to make the sound track a
 * continuous physical quantity: a fracture that is 20% open and one that is
 * 90% open produce genuinely different spectra, which a fixed sample cannot.
 *
 * AUTOPLAY POLICY IS RESPECTED ABSOLUTELY.
 *
 *   - The AudioContext is not even CONSTRUCTED until the visitor explicitly
 *     enables sound. Constructing one on load is what leaves a suspended
 *     context sitting in the tab and, in some browsers, shows an audio
 *     indicator on a page that has never made a sound.
 *   - Default state is off. There is no "ask forgiveness" path.
 *   - Everything is a no-op while disabled, so callers never have to check.
 *
 * It is also gated on prefers-reduced-motion. Sudden sharp transients are a
 * vestibular and startle problem, not only a motion one, and a visitor who has
 * asked for calm should not get a glass shatter.
 */

let ctx = null
let master = null
let enabled = false
let reduced = false

const now = () => (ctx ? ctx.currentTime : 0)

/** Short burst of shaped noise — the body of any impact sound. */
function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    // Decaying noise rather than flat noise: the decay envelope baked into the
    // buffer is what stops it sounding like a burst of static.
    const t = i / len
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5)
  }
  return buf
}

export function isAudioEnabled() {
  return enabled
}

/**
 * Turn sound on. MUST be called from a real user gesture — that is the whole
 * contract with the browser's autoplay policy.
 */
export async function enableAudio() {
  if (typeof window === 'undefined') return false
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return false

  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return false
    ctx = new AudioCtx()
    master = ctx.createGain()
    // Quiet by design. This is texture under a visual event, not a sound
    // effect the visitor is meant to notice on its own.
    master.gain.value = 0.16
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') await ctx.resume()
  enabled = true
  return true
}

export function disableAudio() {
  enabled = false
  if (ctx && ctx.state === 'running') ctx.suspend()
}

/**
 * A crack. `intensity` 0..1 scales both level and brightness, so a shell that
 * is barely opening ticks and one that is coming apart genuinely cracks.
 */
export function playCrack(intensity = 1) {
  if (!enabled || !ctx || reduced) return
  const i = Math.max(0, Math.min(1, intensity))
  const t = now()

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(0.09 + i * 0.13)

  // Bandpass sweeping downward: glass transients start bright and fall as the
  // energy moves into the larger pieces. A static filter sounds like a click.
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 1.1 + i * 2.2
  band.frequency.setValueAtTime(2600 + i * 3800, t)
  band.frequency.exponentialRampToValueAtTime(700 + i * 500, t + 0.14 + i * 0.1)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.35 + i * 0.65, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + i * 0.22)

  src.connect(band).connect(gain).connect(master)
  src.start(t)
  src.stop(t + 0.45)
}

/**
 * Reassembly: the inverse gesture. Rising filter, softer attack, no transient —
 * pieces finding their places rather than something breaking.
 */
export function playReassemble(intensity = 1) {
  if (!enabled || !ctx || reduced) return
  const i = Math.max(0, Math.min(1, intensity))
  const t = now()

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(0.3)

  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 3.5
  band.frequency.setValueAtTime(500, t)
  band.frequency.exponentialRampToValueAtTime(3000 + i * 2000, t + 0.28)

  const gain = ctx.createGain()
  // Slow attack is the whole difference. A fast attack on this material reads
  // as another break no matter what the filter is doing.
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(0.18 * i, t + 0.12)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)

  src.connect(band).connect(gain).connect(master)
  src.start(t)
  src.stop(t + 0.5)
}

/** The low sub-thump under the eclipse. Felt more than heard. */
export function playImpact() {
  if (!enabled || !ctx || reduced) return
  const t = now()

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, t)
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.5)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.9, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)

  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + 0.8)
}

export function disposeAudio() {
  if (ctx) {
    ctx.close()
    ctx = null
    master = null
  }
  enabled = false
}
