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
 * fogNear/fogFar are in world units from the camera.
 * accent is the emissive signal colour for that depth band.
 * density scales the local particulate — higher reads as thicker atmosphere.
 */
/**
 * Ambient/light values are roughly 2x the original pass. The first set was
 * tuned by reading the numbers rather than the screen, and produced an
 * environment that was technically lit and visually black. Fog ranges are also
 * pushed out, because fogging in at 6-9 units buried the structures before
 * they were ever legible.
 */
export const STATIONS = [
  station(0, 'hero', {
    x: 0, y: 0.9, lookX: 0.4, lookY: 0.7,
    mood: { fogNear: 14, fogFar: 90, accent: '#ff2d4d', ambient: 0.62, density: 1.0, light: 1.35 },
  }),
  station(1, 'about', {
    x: -2.4, y: 1.4, lookX: -0.8, lookY: 1.0,
    mood: { fogNear: 12, fogFar: 74, accent: '#8fa6c4', ambient: 0.56, density: 1.25, light: 1.1 },
  }),
  station(2, 'skills', {
    x: 2.2, y: 0.4, lookX: 0.9, lookY: 0.5,
    mood: { fogNear: 16, fogFar: 110, accent: '#5cb0d4', ambient: 0.68, density: 0.8, light: 1.5 },
  }),
  station(3, 'experience', {
    x: -1.6, y: -0.9, lookX: -0.5, lookY: -0.3,
    mood: { fogNear: 13, fogFar: 80, accent: '#d4a05c', ambient: 0.54, density: 1.15, light: 1.15 },
  }),
  station(4, 'projects', {
    x: 1.2, y: 1.8, lookX: 0.3, lookY: 1.2,
    mood: { fogNear: 18, fogFar: 125, accent: '#ff2d4d', ambient: 0.72, density: 0.7, light: 1.65 },
  }),
  station(5, 'ailab', {
    x: -2.8, y: 0.2, lookX: -1.1, lookY: 0.4,
    mood: { fogNear: 11, fogFar: 68, accent: '#9d7ae0', ambient: 0.5, density: 1.4, light: 1.0 },
  }),
  station(6, 'achievements', {
    x: 1.9, y: 1.1, lookX: 0.7, lookY: 0.9,
    mood: { fogNear: 15, fogFar: 100, accent: '#e8c05c', ambient: 0.7, density: 0.85, light: 1.45 },
  }),
  station(7, 'contact', {
    x: 0, y: 0.6, lookX: 0, lookY: 0.6,
    mood: { fogNear: 17, fogFar: 130, accent: '#ff2d4d', ambient: 0.64, density: 0.6, light: 1.4 },
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
