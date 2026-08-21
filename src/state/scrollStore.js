import { create } from 'zustand'

/**
 * Global scroll state — the single timeline the whole world is driven from.
 *
 * Read this inside useFrame via `useScrollStore.getState()`, never with the
 * hook selector. The world updates 60x/second; subscribing React components to
 * it would re-render the tree every frame. Nothing here triggers a render.
 *
 * Anything that DOES need to re-render React (HUD labels, voice state) lives in
 * worldStore.js instead — keep that split, it is what keeps the world cheap.
 */
export const useScrollStore = create(() => ({
  /** 0..1 across the whole document. */
  progress: 0,
  /** Smoothed progress — what the camera actually follows. */
  smooth: 0,
  /** Signed, decaying scroll speed. Drives motion-reactive effects. */
  velocity: 0,
  /** Normalised pointer, -1..1 on both axes. */
  pointerX: 0,
  pointerY: 0,
  /** Smoothed pointer — environment lighting follows this, not the raw value. */
  pointerSmoothX: 0,
  pointerSmoothY: 0,
  /** Fractional station index, e.g. 2.4 = 40% between stations 2 and 3. */
  station: 0,
  /**
   * 0..1 interaction energy. Rises on click/scroll/voice, decays continuously.
   * The environment brightens and the particulate stirs as this climbs, which
   * is what makes input feel like it lands in the world rather than on the UI.
   */
  energy: 0,
  /**
   * SIGNED, NORMALISED SCROLL FLOW, -1..1.
   *
   * `velocity` is the raw signed rate and swings hard; `flow` is the damped,
   * bounded version the world is meant to be driven from. The distinction
   * matters because almost everything downstream wants "which way, and how
   * hard" as a stable number it can multiply by — a raw rate used directly
   * makes every layer jump on the first frame of a flick.
   *
   * It is SIGNED on purpose. Reversing the scroll has to reverse the world,
   * not merely stir it: particles stream back the way they came, the camera's
   * lag swings the other way, trails point the other way. Feeding everything
   * from `Math.abs(velocity)` is what makes a scroll-driven scene feel like an
   * animation being scrubbed rather than a place being moved through.
   */
  flow: 0,
  /**
   * 0..1 how still the page has been. 0 the instant the visitor scrolls, and
   * back to 1 over about a second and a half of no input.
   *
   * This is the counterpart to `energy`: energy says how hard the world was
   * just pushed, stillness says how long it has been left alone. Idle systems
   * read this so the environment can come alive PRECISELY when nothing is
   * happening, rather than only ever being a response to input.
   */
  stillness: 1,
  /** Seconds since mount, advanced by the driver so every effect shares a clock. */
  time: 0,
  /**
   * 0..1 ignition ramp, filled once over the first few seconds of the session.
   *
   * This is what makes the world ASSEMBLE rather than appear. Layers read it
   * through `ignitionAt()` with their own start/end window, so the environment
   * arrives in depth order — sky, then structures, then the computational core
   * — instead of every system switching on in the same frame.
   *
   * Deliberately one-way and one-shot. It is an arrival, not a loop, and
   * re-running it on every scroll to top would turn a first impression into a
   * recurring animation.
   */
  ignition: 0,
}))

export const scrollState = useScrollStore.getState
export const setScrollState = useScrollStore.setState

if (import.meta.env.DEV) {
  window.__scrollStores = window.__scrollStores || []
  window.__scrollStores.push(useScrollStore)
}

/**
 * A layer's own slice of the ignition ramp, eased.
 *
 * `start`/`end` are positions within the global 0..1 ramp, so a layer that
 * wants to arrive late passes something like (0.45, 0.95). The ease is a
 * smoothstep so layers fade up rather than wiping in.
 */
export const ignitionAt = (start, end) => {
  const v = useScrollStore.getState().ignition
  const t = Math.max(0, Math.min(1, (v - start) / Math.max(0.0001, end - start)))
  return t * t * (3 - 2 * t)
}

/** Inject energy into the world (0..1 added, clamped). */
export const pulseEnergy = (amount = 0.35) => {
  const { energy } = useScrollStore.getState()
  useScrollStore.setState({ energy: Math.min(1, energy + amount) })
}
