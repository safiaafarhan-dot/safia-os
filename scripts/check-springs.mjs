/**
 * HEADLESS VERIFICATION OF THE ENTRANCE SPRING.
 *
 * The motion in `Assemble.jsx` cannot be checked in a browser here: assembly is
 * driven by an IntersectionObserver, and the automated tab is always hidden, so
 * the observer never fires and requestAnimationFrame is paused outright. A
 * screenshot of a heading therefore proves only that the text exists.
 *
 * But the part that can actually be WRONG is pure maths — overshoot, settle
 * time, stability, frame-rate independence — and none of it needs a GPU. This
 * runs the SHIPPING module from `src/lib/spring.js` rather than a copy, so it
 * cannot drift away from what the page does.
 *
 *     node scripts/check-springs.mjs
 */

import {
  ENTRANCE_K,
  ENTRANCE_ZETA,
  MAX_FRAME,
  STEP,
  dampingFor,
  integrate,
  stepSpring,
} from '../src/lib/spring.js'

let failures = 0
const ok = (msg) => console.log(`  ok   ${msg}`)
const fail = (msg) => {
  failures++
  console.log(`  FAIL ${msg}`)
}
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

const C = dampingFor(ENTRANCE_K, ENTRANCE_ZETA)

/** Run the spring from 0 to 1 for `seconds`, sampling at a given frame rate. */
function run(seconds, fps) {
  const s = { x: 0, v: 0 }
  const frameDt = 1 / fps
  let acc = 0
  const trace = []
  for (let t = 0; t < seconds; t += frameDt) {
    acc = integrate(acc, frameDt, () => stepSpring(s, 1, ENTRANCE_K, C))
    trace.push({ t, x: s.x })
  }
  return { s, trace }
}

console.log('\nEntrance spring\n')

// --- 1. It arrives. ---------------------------------------------------------
{
  const { s } = run(2, 60)
  check(Math.abs(s.x - 1) < 0.005, 'settles on its target within 2s')
}

// --- 2. Exactly one overshoot, and a small one. ------------------------------
//
// This is the whole difference between product motion and game-UI bouncing, so
// it is asserted rather than eyeballed.
{
  const { trace } = run(3, 240)
  // Count EXCURSIONS above the target, not local maxima. Once the spring has
  // settled, x sits at 1 to within floating-point noise and every flat sample
  // is technically a local maximum — the first version of this test counted
  // 182 "overshoots" for a spring that visibly overshoots once. An excursion
  // is a crossing above a threshold that is meaningfully above rest, which is
  // the thing an eye would actually call an overshoot.
  const EPS = 0.002
  let peaks = 0
  let above = false
  let maxOver = 0
  for (const p of trace) {
    const over = p.x - 1
    if (!above && over > EPS) {
      above = true
      peaks++
    } else if (above && over <= 0) {
      above = false
    }
    if (over > maxOver) maxOver = over
  }
  check(peaks === 1, `overshoots exactly once (saw ${peaks})`)
  check(
    maxOver > 0.005 && maxOver < 0.10,
    `overshoot is felt but small: ${(maxOver * 100).toFixed(1)}% (want 0.5–10%)`
  )
}

// --- 3. Frame-rate independence. --------------------------------------------
//
// A spring integrated against a raw frame delta is a different spring on every
// display. The fixed timestep exists to make these three identical.
{
  const at = (fps) => run(1.2, fps).s.x
  const a = at(30)
  const b = at(60)
  const c = at(144)
  const spread = Math.max(a, b, c) - Math.min(a, b, c)
  check(spread < 0.02, `30/60/144Hz agree to within ${(spread * 100).toFixed(2)}% of travel`)
}

// --- 4. Stability across a long stall. ---------------------------------------
//
// A backgrounded tab or a GC pause hands back a delta of seconds. Explicit
// Euler diverges once k·dt² passes its bound, which in practice means a glyph
// launched off screen and never recovered.
{
  const s = { x: 0, v: 0 }
  let acc = 0
  acc = integrate(acc, 4.0, () => stepSpring(s, 1, ENTRANCE_K, C))
  const finite = Number.isFinite(s.x) && Number.isFinite(s.v)
  check(finite && Math.abs(s.x) < 2, `survives a 4s stall (x=${s.x.toFixed(3)})`)
  check(MAX_FRAME <= 0.25, 'a single frame can never owe more than 0.25s of steps')
}

// --- 5. Reversal is smooth, not a snap. --------------------------------------
//
// Scrolling a section back out mid-assembly has to reverse from wherever the
// fragment had got to. That means the velocity has to carry through the
// direction change rather than being reset.
{
  const s = { x: 0, v: 0 }
  // 12 steps = 0.1s. The original 40 put it at x=1.03, i.e. already past the
  // target and into the overshoot, so it was not testing reversal at all.
  for (let i = 0; i < 12; i++) stepSpring(s, 1, ENTRANCE_K, C)
  const midX = s.x
  const midV = s.v
  stepSpring(s, 0, ENTRANCE_K, C)
  check(midX > 0.05 && midX < 0.95, `reversal test starts mid-flight (x=${midX.toFixed(2)})`)
  // THE PROPERTY IS MOMENTUM, NOT A MAGNITUDE. The first version asserted the
  // velocity change was under an arbitrary 0.5, which a stiff spring fails by
  // construction — at k=150 a single step legitimately changes v by more than
  // that. What actually matters is that the fragment does not STOP DEAD when
  // the direction flips: it should still be travelling the old way for at
  // least one step, which is what makes a section scrolled past mid-assembly
  // read as turning around rather than snapping.
  check(
    midV > 0 && s.v > 0 && s.x > midX,
    `momentum carries through the reversal (v ${midV.toFixed(2)} -> ${s.v.toFixed(2)}, still advancing)`
  )
}

// --- 6. The step is small enough for the stiffness. --------------------------
{
  const bound = 2 / Math.sqrt(ENTRANCE_K)
  check(STEP < bound, `timestep ${STEP.toFixed(4)}s is inside the stability bound ${bound.toFixed(4)}s`)
}

console.log('')
if (failures > 0) {
  console.log(`${failures} spring invariant(s) FAILED.\n`)
  process.exit(1)
}
console.log('All spring invariants hold.\n')
