import { audioBus } from './crackAudio'

/**
 * THE ATMOSPHERE, AS SOUND.
 *
 * Everything else in the audio layer is an EVENT — a crack, an impact, a
 * whoosh. Events tell you something just happened. They cannot tell you that
 * you are somewhere, because a place is not a sequence of events, it is a
 * continuous bed you stop noticing and would immediately miss.
 *
 * So this is the bed: moving air, a low room tone under it, and a faint
 * harmonic that says the space is powered rather than merely empty. It has no
 * beginning and no end, it never resolves, and at rest it sits close to the
 * noise floor. If a visitor can point at it, it is too loud.
 *
 * ---------------------------------------------------------------- what it is
 *
 *   WIND    Looped noise through a bandpass whose centre frequency and width
 *           drift on two slow, mutually prime periods, so the composite never
 *           audibly repeats even though the source buffer does. Panned slowly
 *           across the stereo field.
 *   RUMBLE  The same noise, lowpassed hard. This is the one that does the work
 *           of making a space feel LARGE, and it is almost inaudible on
 *           laptop speakers by design — it is for headphones, and it should
 *           never be raised to compensate.
 *   HUM     Two slightly detuned oscillators. Detuned rather than unison
 *           because the beating between them is what makes it read as a
 *           machine running rather than as a test tone.
 *
 * ------------------------------------------------------- how it is driven
 *
 * `setAmbience` is fed the world's own motion state — scroll energy, signed
 * flow, stillness, station — and moves the bed with it. Scrolling fast opens
 * the wind up and pushes the filter brighter; stopping lets it fall back and
 * the hum come forward. That is the same energy model the visuals run on, so
 * the two are describing one event rather than two.
 *
 * IT IS RAMPED, NEVER SET. Every parameter change goes through
 * `setTargetAtTime`, which is a one-pole smoother running in the audio thread.
 * Writing values directly at frame rate produces zipper noise — audible steps
 * on every change — and is the single most common way a procedural bed ends up
 * sounding cheap. The updater is also throttled well below frame rate, because
 * the smoothing is doing the interpolation and there is nothing to gain from
 * more messages.
 *
 * AUTOPLAY: it cannot start on its own. `audioBus()` returns null until the
 * visitor has explicitly enabled sound, so `start()` is a no-op before then.
 */

let nodes = null
let lastUpdate = 0

/** Long enough that the loop point is not a rhythm. */
const LOOP_SECONDS = 8

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * LOOP_SECONDS)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    // Brown-ish noise rather than white. Integrating white noise tilts the
    // spectrum down at 6dB/octave, which is roughly what moving air actually
    // sounds like; white noise through a filter still reads as hiss.
    let v = 0
    for (let i = 0; i < len; i++) {
      v = (v + (Math.random() * 2 - 1) * 0.02) * 0.997
      data[i] = v * 8
    }
    // Match the ends so the loop seam is inaudible.
    const fade = Math.floor(ctx.sampleRate * 0.25)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      data[i] = data[i] * k + data[len - fade + i] * (1 - k)
    }
  }
  return buf
}

/** True once the bed is running. */
export function isAmbienceRunning() {
  return nodes !== null
}

export function startAmbience() {
  if (nodes) return true
  const bus = audioBus()
  if (!bus) return false
  const { ctx, master } = bus
  const t = ctx.currentTime

  const buf = makeNoise(ctx)

  // ---- wind -------------------------------------------------------------
  const windSrc = ctx.createBufferSource()
  windSrc.buffer = buf
  windSrc.loop = true

  const windBand = ctx.createBiquadFilter()
  windBand.type = 'bandpass'
  windBand.frequency.value = 480
  windBand.Q.value = 0.7

  const windGain = ctx.createGain()
  windGain.gain.value = 0.0001

  // Cheap spatialisation. A StereoPanner rather than a PannerNode: the effect
  // wanted here is "the air is moving across the space", which is a stereo
  // gesture, and a full HRTF panner costs far more for something nobody should
  // consciously notice.
  const windPan = ctx.createStereoPanner()
  windPan.pan.value = 0

  windSrc.connect(windBand).connect(windGain).connect(windPan).connect(master)

  // ---- rumble -----------------------------------------------------------
  const rumbleSrc = ctx.createBufferSource()
  rumbleSrc.buffer = buf
  rumbleSrc.loop = true
  rumbleSrc.playbackRate.value = 0.6

  const rumbleLow = ctx.createBiquadFilter()
  rumbleLow.type = 'lowpass'
  rumbleLow.frequency.value = 110
  rumbleLow.Q.value = 0.5

  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.0001
  rumbleSrc.connect(rumbleLow).connect(rumbleGain).connect(master)

  // ---- hum --------------------------------------------------------------
  const humGain = ctx.createGain()
  humGain.gain.value = 0.0001
  const humLow = ctx.createBiquadFilter()
  humLow.type = 'lowpass'
  humLow.frequency.value = 900

  const oscA = ctx.createOscillator()
  oscA.type = 'sine'
  oscA.frequency.value = 68
  const oscB = ctx.createOscillator()
  oscB.type = 'sine'
  // ~0.6Hz of beating. Slow enough to read as breathing, fast enough not to
  // sound like a tuning error.
  oscB.frequency.value = 68.6
  oscA.connect(humLow)
  oscB.connect(humLow)
  humLow.connect(humGain).connect(master)

  windSrc.start(t)
  rumbleSrc.start(t)
  oscA.start(t)
  oscB.start(t)

  // Fade the whole bed in over a couple of seconds. Arriving at full level is
  // how a bed announces itself, which is exactly what it must not do.
  windGain.gain.setTargetAtTime(0.05, t, 1.2)
  rumbleGain.gain.setTargetAtTime(0.07, t, 1.6)
  humGain.gain.setTargetAtTime(0.012, t, 2.0)

  nodes = { ctx, windSrc, windBand, windGain, windPan, rumbleSrc, rumbleGain, oscA, oscB, humGain, humLow }
  return true
}

export function stopAmbience() {
  if (!nodes) return
  const { ctx, windSrc, rumbleSrc, oscA, oscB, windGain, rumbleGain, humGain } = nodes
  const t = ctx.currentTime
  // Ramp down before stopping. Cutting an oscillator dead produces a click,
  // which on a bed this quiet is the loudest thing it will ever do.
  windGain.gain.setTargetAtTime(0.0001, t, 0.25)
  rumbleGain.gain.setTargetAtTime(0.0001, t, 0.25)
  humGain.gain.setTargetAtTime(0.0001, t, 0.25)
  const stopAt = t + 1.2
  try {
    windSrc.stop(stopAt)
    rumbleSrc.stop(stopAt)
    oscA.stop(stopAt)
    oscB.stop(stopAt)
  } catch {
    // Already stopped; nothing to do.
  }
  nodes = null
}

/**
 * Move the bed with the world.
 *
 * Safe to call every frame — it throttles itself to ~12Hz and every write is a
 * smoothed target, so the audio thread does the interpolation.
 *
 * @param {{energy:number, flow:number, stillness:number, station:number}} s
 */
export function setAmbience(s) {
  if (!nodes) return
  const { ctx } = nodes
  const t = ctx.currentTime
  if (t - lastUpdate < 0.08) return
  lastUpdate = t

  const speed = Math.min(1, Math.abs(s.flow ?? 0))
  const energy = Math.min(1, s.energy ?? 0)
  const still = s.stillness ?? 1
  const drive = Math.max(speed, energy)

  // WIND OPENS UP WITH TRAVEL. Level and brightness together — moving air gets
  // louder AND brighter as it speeds up, and moving only one of them is what
  // makes a synthesised wind sound like a volume fader on a noise generator.
  nodes.windGain.gain.setTargetAtTime(0.05 + drive * 0.16, t, 0.18)
  nodes.windBand.frequency.setTargetAtTime(460 + drive * 1250, t, 0.22)
  nodes.windBand.Q.setTargetAtTime(0.7 + drive * 1.6, t, 0.3)

  // DIRECTION IS AUDIBLE. Scrolling forward pushes the air one way across the
  // stereo field, reversing pushes it back. Subconscious, and the cheapest
  // possible way to make reverse scrolling feel like reversal rather than like
  // the same animation played backwards.
  const flow = Math.max(-1, Math.min(1, s.flow ?? 0))
  nodes.windPan.pan.setTargetAtTime(flow * 0.55, t, 0.35)

  // The floor rises with depth into the journey, so the deeper chapters sit in
  // a heavier room than the opening does.
  const depth = Math.min(1, (s.station ?? 0) / 7)
  nodes.rumbleGain.gain.setTargetAtTime(0.07 + depth * 0.05 + drive * 0.05, t, 0.4)

  // THE HUM COMES FORWARD WHEN NOTHING IS HAPPENING. It is masked by the wind
  // while travelling and emerges as the page settles, so stopping is a change
  // in the character of the sound rather than only a drop in its level. That
  // is what makes standing still feel like arriving somewhere.
  nodes.humGain.gain.setTargetAtTime(0.008 + still * 0.014, t, 0.6)
  nodes.humLow.frequency.setTargetAtTime(700 + still * 700, t, 0.6)
}
