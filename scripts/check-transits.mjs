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
import { timelineAt, TRANSIT_COUNT, startFor } from '../src/world/transitTimeline.js'

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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll transit invariants hold.')
process.exit(failures ? 1 : 0)
