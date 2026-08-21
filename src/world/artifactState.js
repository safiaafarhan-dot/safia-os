/**
 * Shared state for the approach event.
 *
 * The artifact lives in WebGL, but the eclipse it causes has to be felt by the
 * DOM as well — the canvas sits BEHIND the whole document, so an object filling
 * the viewport in 3D still has every heading and paragraph painted on top of
 * it. Without this bridge the "cinematic cut" is a cut that half the screen
 * does not participate in.
 *
 * A plain mutable object rather than a store, for the same reason as
 * cursorFieldState: it is written every frame and no component should re-render
 * on it. The DOM side reads it from its own rAF and writes a style directly.
 */
export const artifactState = {
  /** 0..1 across the whole approach, for anything that wants to follow it. */
  progress: 0,
  /**
   * 0..1 viewport eclipse. Peaks the instant the object is closest, then
   * decays through the fracture. This is what the DOM overlay reads.
   */
  flash: 0,
  /** 0..1 how broken the shell currently is. Drives the audio triggers. */
  fracture: 0,
  /** True for the single frame the shell actually breaks. */
  justCracked: false,
  /**
   * 0..1 how much the artifact owns the frame.
   *
   * Other layers read this and get out of the way. That is ordinary
   * cinematography — a shot has ONE subject — and it is the difference between
   * an object approaching the camera and an object approaching the camera
   * while a neural network sits on top of it. Without this the two most
   * interesting things in the opening compete for the same pixels and neither
   * one lands.
   */
  dominance: 0,
}

/**
 * Diagnostic handle. The event is a function of the station float and lasts a
 * few hundred pixels of scroll, so the only practical way to check a moment in
 * it is to pin the station and read these numbers — see the `?station=` pin in
 * useWorldDriver. DEV only; nothing in the app reads this.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__artifact = artifactState
}
