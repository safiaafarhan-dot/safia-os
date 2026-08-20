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
  /** Seconds since mount, advanced by the driver so every effect shares a clock. */
  time: 0,
}))

export const scrollState = useScrollStore.getState
export const setScrollState = useScrollStore.setState

if (import.meta.env.DEV) {
  window.__scrollStores = window.__scrollStores || []
  window.__scrollStores.push(useScrollStore)
}

/** Inject energy into the world (0..1 added, clamped). */
export const pulseEnergy = (amount = 0.35) => {
  const { energy } = useScrollStore.getState()
  useScrollStore.setState({ energy: Math.min(1, energy + amount) })
}
