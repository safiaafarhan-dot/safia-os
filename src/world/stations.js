/**
 * The camera path through SAFIA.OS.
 *
 * THE PATH IS A REAL 3D CURVE, and that matters more than anything else in
 * this file. It used to deviate by +/-2.8 units across 308 units of depth -
 * under one percent, which is a straight line - and a straight path with
 * anything either side of it is a tunnel by definition. No amount of set
 * dressing fixes that. Stations now swing +/-13 laterally and +/-8 vertically,
 * so the rig genuinely arcs through the space and the view keeps opening onto
 * something new.
 *
 * lookX/lookY are no longer a separate parallel curve - see CameraRig. They
 * are now a small aim BIAS applied in the camera's own frame, on top of a
 * heading taken from the curve's tangent. That is what lets the camera turn.
 *
 * The whole site is ONE continuous 3D space. Scrolling does not fade between
 * sections — it flies the camera down a corridor of the laboratory, and each
 * section's HTML is simply what you read while parked at that depth.
 *
 * Stations run along -Z with deliberate lateral and vertical offsets. A dead
 * straight tunnel reads as a 2D zoom; the sway is what makes it feel spatial.
 *
 * `mood` drives the environment, not just the look: fog distance controls how
 * much of the corridor is visible ahead, so tight sections feel enclosed and
 * open ones feel vast.
 */

export const STATION_SPACING = 44

const station = (i, id, { x = 0, y = 0, lookX = 0, lookY = 0, mood }) => ({
  id,
  index: i,
  position: [x, y, -i * STATION_SPACING],
  // Look slightly ahead down the corridor so the camera always leads the travel.
  lookAt: [lookX, lookY, -i * STATION_SPACING - 14],
  mood,
})

/**
 * PALETTE DISCIPLINE
 * ------------------
 * Every station used to carry its own hue — violet, teal, amber, steel blue.
 * Eight accent colours across one scroll is what made the environment read as
 * generic sci-fi: nothing owned the frame, and the composite of all those
 * veils was a muddy magenta. The accent is now CRIMSON everywhere, with cold
 * steel as its only counter. Stations differ by EXPOSURE, DENSITY, LENS and
 * FOG instead of by hue — which is how photography creates variety, and why
 * restraint reads as expensive.
 *
 * fogNear/fogFar  world units from the camera
 * accent          the emissive signal colour for that depth band
 * ambient/light   fill and key multipliers
 * density         local particulate — higher reads as thicker atmosphere
 * accentPower     how hot the crimson signal runs at this depth, 0..1
 * exposure        tone-mapping exposure — the photographic dial
 * bloom           post-grade glow strength
 * vignette        post-grade corner falloff
 */
export const STATIONS = [
  station(0, 'hero', {
    x: 0, y: 1.0, lookX: 0.0, lookY: 0.6,
    mood: { fogNear: 14, fogFar: 118, accent: '#ff2d4d', ambient: 0.74, density: 0.82, light: 1.28, accentPower: 0.32, exposure: 1.16, bloom: 0.62, vignette: 0.78 },
  }),
  station(1, 'about', {
    x: -7, y: 4.5, lookX: -0.5, lookY: 0.9,
    mood: { fogNear: 14, fogFar: 108, accent: '#b3122e', ambient: 0.72, density: 0.9, light: 1.22, accentPower: 0.34, exposure: 1.1, bloom: 0.58, vignette: 0.84 },
  }),
  station(2, 'skills', {
    x: 5, y: -4.0, lookX: 0.4, lookY: -0.4,
    mood: { fogNear: 16, fogFar: 110, accent: '#ff2d4d', ambient: 0.68, density: 0.8, light: 1.5, accentPower: 0.74, exposure: 1.14, bloom: 0.66, vignette: 0.96 },
  }),
  station(3, 'experience', {
    x: 13, y: 2.0, lookX: 0.7, lookY: 0.3,
    mood: { fogNear: 15, fogFar: 118, accent: '#b3122e', ambient: 0.62, density: 1.05, light: 1.22, accentPower: 0.4, exposure: 0.99, bloom: 0.52, vignette: 1.06 },
  }),
  station(4, 'projects', {
    x: 2, y: 8.0, lookX: 0.2, lookY: 0.8,
    mood: { fogNear: 18, fogFar: 125, accent: '#ff2d4d', ambient: 0.72, density: 0.7, light: 1.65, accentPower: 0.88, exposure: 1.2, bloom: 0.8, vignette: 0.9 },
  }),
  station(5, 'ailab', {
    x: -11, y: 1.5, lookX: -0.6, lookY: 0.2,
    mood: { fogNear: 13, fogFar: 104, accent: '#ff5a3c', ambient: 0.6, density: 1.25, light: 1.12, accentPower: 0.46, exposure: 1.02, bloom: 0.64, vignette: 1.1 },
  }),
  station(6, 'achievements', {
    x: -4, y: -6.0, lookX: -0.3, lookY: -0.5,
    mood: { fogNear: 15, fogFar: 100, accent: '#ff5a3c', ambient: 0.7, density: 0.85, light: 1.45, accentPower: 0.6, exposure: 1.15, bloom: 0.7, vignette: 0.96 },
  }),
  station(7, 'contact', {
    x: 6, y: 0.5, lookX: 0.3, lookY: 0.1,
    mood: { fogNear: 17, fogFar: 130, accent: '#ff2d4d', ambient: 0.64, density: 0.6, light: 1.4, accentPower: 1.0, exposure: 1.2, bloom: 0.9, vignette: 0.88 },
  }),
]

export const STATION_IDS = STATIONS.map((s) => s.id)

/** Total travelled depth, used to size the environment so it never runs out. */
export const WORLD_DEPTH = (STATIONS.length - 1) * STATION_SPACING

/**
 * Interpolate any per-station scalar at a fractional station index.
 * `station` is e.g. 2.4 — 40% of the way from Skills to Experience.
 */
export const sampleMood = (stationFloat, key) => {
  const clamped = Math.max(0, Math.min(STATIONS.length - 1, stationFloat))
  const i = Math.floor(clamped)
  const j = Math.min(STATIONS.length - 1, i + 1)
  const t = clamped - i
  return STATIONS[i].mood[key] * (1 - t) + STATIONS[j].mood[key] * t
}
