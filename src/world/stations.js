/**
 * The camera path through SAFIA.OS.
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
    x: 0, y: 0.9, lookX: 0.4, lookY: 0.7,
    mood: { fogNear: 14, fogFar: 90, accent: '#ff2d4d', ambient: 0.62, density: 1.0, light: 1.35, accentPower: 0.95, exposure: 1.16, bloom: 0.74, vignette: 0.92 },
  }),
  station(1, 'about', {
    x: -2.4, y: 1.4, lookX: -0.8, lookY: 1.0,
    mood: { fogNear: 12, fogFar: 74, accent: '#b3122e', ambient: 0.56, density: 1.25, light: 1.1, accentPower: 0.5, exposure: 1.04, bloom: 0.52, vignette: 1.12 },
  }),
  station(2, 'skills', {
    x: 2.2, y: 0.4, lookX: 0.9, lookY: 0.5,
    mood: { fogNear: 16, fogFar: 110, accent: '#ff2d4d', ambient: 0.68, density: 0.8, light: 1.5, accentPower: 0.74, exposure: 1.14, bloom: 0.66, vignette: 0.96 },
  }),
  station(3, 'experience', {
    x: -1.6, y: -0.9, lookX: -0.5, lookY: -0.3,
    mood: { fogNear: 13, fogFar: 80, accent: '#b3122e', ambient: 0.54, density: 1.15, light: 1.15, accentPower: 0.44, exposure: 0.99, bloom: 0.46, vignette: 1.18 },
  }),
  station(4, 'projects', {
    x: 1.2, y: 1.8, lookX: 0.3, lookY: 1.2,
    mood: { fogNear: 18, fogFar: 125, accent: '#ff2d4d', ambient: 0.72, density: 0.7, light: 1.65, accentPower: 0.88, exposure: 1.2, bloom: 0.8, vignette: 0.9 },
  }),
  station(5, 'ailab', {
    x: -2.8, y: 0.2, lookX: -1.1, lookY: 0.4,
    mood: { fogNear: 11, fogFar: 68, accent: '#ff5a3c', ambient: 0.5, density: 1.4, light: 1.0, accentPower: 0.66, exposure: 1.02, bloom: 0.6, vignette: 1.24 },
  }),
  station(6, 'achievements', {
    x: 1.9, y: 1.1, lookX: 0.7, lookY: 0.9,
    mood: { fogNear: 15, fogFar: 100, accent: '#ff5a3c', ambient: 0.7, density: 0.85, light: 1.45, accentPower: 0.6, exposure: 1.15, bloom: 0.7, vignette: 0.96 },
  }),
  station(7, 'contact', {
    x: 0, y: 0.6, lookX: 0, lookY: 0.6,
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
