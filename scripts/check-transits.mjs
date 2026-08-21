/**
 * Headless check of the transit choreography across the whole scroll.
 *
 * These are properties of the JOURNEY, not of any one frame, which is exactly
 * what a screenshot cannot tell you: that no two transits are ever live at
 * once, that there is no dead stretch between them where nothing is happening,
 * that each boundary flashes exactly once, and that the approach is monotone.
 *
 *   node scripts/check-transits.mjs
 */
import { timelineAt, TRANSIT_COUNT, startFor, shockwaveAt } from '../src/world/transitTimeline.js'

const STEP = 0.002
const FROM = 0
const TO = TRANSIT_COUNT + 0.6

let failures = 0
const fail = (msg) => { console.error('  FAIL ' + msg); failures++ }
const ok = (msg) => console.log('  ok   ' + msg)

/* 1. Never two transits live at once, and each boundary is live as one run. */
const runs = []
let cur = null
for (let st = FROM; st <= TO; st += STEP) {
  const t = timelineAt(st)
  if (t.live) {
    if (!cur || cur.at !== t.at) { cur = { at: t.at, from: st, to: st }; runs.push(cur) }
    else cur.to = st
  } else cur = null
}
const perBoundary = new Map()
for (const r of runs) {
  if (perBoundary.has(r.at)) fail(`boundary ${r.at} goes live in ${perBoundary.get(r.at) ? 2 : 2}+ separate runs — it flickers`)
  perBoundary.set(r.at, r)
}
if (perBoundary.size !== TRANSIT_COUNT) fail(`expected ${TRANSIT_COUNT} transits, saw ${perBoundary.size}`)
else ok(`all ${TRANSIT_COUNT} transits go live exactly once`)

/* 2. No overlap between consecutive runs. */
let overlap = false
for (let i = 1; i < runs.length; i++) {
  if (runs[i].from <= runs[i - 1].to + 1e-9) { fail(`transit ${runs[i - 1].at} and ${runs[i].at} overlap`); overlap = true }
}
if (!overlap) ok('no two transits are ever on screen together')

/* 3. No dead stretch longer than a boundary gap. */
let worstGap = 0, worstAt = 0
for (let i = 1; i < runs.length; i++) {
  const gap = runs[i].from - runs[i - 1].to
  if (gap > worstGap) { worstGap = gap; worstAt = runs[i].at }
}
if (worstGap > 0.12) fail(`dead stretch of ${worstGap.toFixed(3)} stations before transit ${worstAt}`)
else ok(`largest gap between transits is ${worstGap.toFixed(3)} stations`)

/* 4. Each boundary flashes exactly once, and peaks near the boundary itself. */
for (let at = 1; at <= TRANSIT_COUNT; at++) {
  let peak = 0, peakAt = 0, crossings = 0, was = false
  // From at-0.6, NOT at-1: the previous boundary's flash runs until at-0.89,
  // and a window that includes it counts its crossing against this boundary.
  for (let st = at - 0.6; st <= at + 0.4; st += STEP) {
    const f = timelineAt(st).flash
    const on = f > 0.02
    if (on && !was) crossings++
    was = on
    if (f > peak) { peak = f; peakAt = st }
  }
  if (crossings !== 1) fail(`boundary ${at} flashes ${crossings} times`)
  else if (peak < 0.6) fail(`boundary ${at} flash peaks at only ${peak.toFixed(2)}`)
  else if (Math.abs(peakAt - at) > 0.05) fail(`boundary ${at} flash peaks at ${peakAt.toFixed(3)}, off-boundary`)
}
if (!failures) ok('every boundary flashes once, peaking at the boundary')

/* 5. The approach is monotone: distance only ever closes while live. */
let nonMonotone = 0
for (const r of runs) {
  let last = Infinity
  for (let st = r.from; st <= r.to; st += STEP) {
    const t = timelineAt(st)
    if (t.travel > 0 && t.dist > last + 1e-6) nonMonotone++
    last = t.dist
  }
}
if (nonMonotone) fail(`distance increases mid-approach on ${nonMonotone} samples`)
else ok('every approach closes monotonically')

/* 6. The inverse-square shape: most of the size change in the last fifth. */
for (let at = 1; at <= TRANSIT_COUNT; at++) {
  const start = startFor(at)
  const mid = timelineAt(at + start * 0.5).dist
  const late = timelineAt(at + start * 0.2).dist
  const end = timelineAt(at).dist
  if (!(mid > 200 && late > 90 && end < 3)) {
    fail(`boundary ${at} approach is not inverse-square (mid ${mid.toFixed(0)}, late ${late.toFixed(0)}, end ${end.toFixed(1)})`)
  }
}
if (!failures) ok('approach curve is inverse-square at every boundary')

/* 7. Reduced motion never brings the object at the camera, and never flashes. */
let rmWorst = 0, rmFlash = 0
for (let st = FROM; st <= TO; st += STEP) {
  const t = timelineAt(st, { reducedMotion: true })
  if (t.live) { rmWorst = Math.max(rmWorst, t.grow); rmFlash = Math.max(rmFlash, t.flash) }
}
if (rmFlash > 0) fail(`reduced motion still flashes (${rmFlash})`)
else if (timelineAt(1, { reducedMotion: true }).dist < 150) fail('reduced motion still brings the object at the camera')
else ok('reduced motion parks it mid-approach and never flashes')

/* 8. THE SHOCKWAVE. Emitted by the break, expands decelerating, dissipates. */
{
  const before = failures

  // One wave per boundary, and only after the break.
  for (let at = 1; at <= TRANSIT_COUNT; at++) {
    if (shockwaveAt(at - 0.02).live) fail(`boundary ${at} throws a shockwave BEFORE it breaks`)
    if (shockwaveAt(at + 0.3).live) fail(`boundary ${at} shockwave outlives its transit`)
  }
  if (failures === before) ok('every shockwave is emitted at the break and gone by +0.26')

  // Radius rises monotonically; energy falls monotonically. A wave that
  // brightens as it expands is a scaling graphic, not a blast.
  let radBad = 0
  let strBad = 0
  for (let at = 1; at <= TRANSIT_COUNT; at++) {
    let lastR = -1
    let lastS = Infinity
    for (let o = 0.002; o < 0.258; o += 0.002) {
      const w = shockwaveAt(at + o)
      if (!w.live) continue
      if (w.radius < lastR - 1e-9) radBad++
      if (w.strength > lastS + 1e-9) strBad++
      lastR = w.radius
      lastS = w.strength
    }
  }
  if (radBad) fail(`shockwave radius is non-monotonic on ${radBad} samples`)
  else if (strBad) fail(`shockwave energy rises on ${strBad} samples`)
  else ok('shockwave expands monotonically while its energy only falls')

  // Deceleration: the first half of the travel must cover more ground than the
  // second. That is the whole difference between a blast front and a circle
  // being scaled up.
  // Both samples must be INSIDE the live window. 1.26 is one step past its end
  // and returns radius 0, so the original comparison was against a dead frame
  // and passed for the wrong reason — it reported a negative second half.
  const first = shockwaveAt(1.12).radius - shockwaveAt(1.005).radius
  const second = shockwaveAt(1.25).radius - shockwaveAt(1.12).radius
  if (!(first > second * 1.4)) {
    fail(`shockwave expansion is not decelerating (first ${first.toFixed(3)}, second ${second.toFixed(3)})`)
  } else {
    ok(`shockwave decelerates (first half ${first.toFixed(2)} vs second ${second.toFixed(2)})`)
  }

  // Energy must be spent before the front reaches the corners, or it stops
  // being a passing ring and becomes a full-screen wash.
  let worstLate = 0
  for (let at = 1; at <= TRANSIT_COUNT; at++) {
    for (let o = 0.002; o < 0.258; o += 0.002) {
      const w = shockwaveAt(at + o)
      if (w.live && w.radius > 1.0) worstLate = Math.max(worstLate, w.strength)
    }
  }
  if (worstLate > 0.2) fail(`shockwave still carries ${worstLate.toFixed(2)} energy past the frame edge`)
  else ok(`shockwave is spent by the frame edge (max ${worstLate.toFixed(3)})`)

  // Reduced motion gets none of it.
  let rmWave = 0
  for (let st = FROM; st <= TO; st += STEP) {
    if (shockwaveAt(st, { reducedMotion: true }).live) rmWave++
  }
  if (rmWave) fail(`reduced motion still emits ${rmWave} shockwave samples`)
  else ok('reduced motion emits no shockwave')
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll transit invariants hold.')
process.exit(failures ? 1 : 0)
