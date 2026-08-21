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
 * veils was a muddy magenta. The palette was cut to CRIMSON with cold steel as
 * its only counter, and stations differ by EXPOSURE, DENSITY, LENS and FOG
 * rather than by hue — which is how photography creates variety, and why
 * restraint reads as expensive.
 *
 * THE OPENING IS NOW THE EXCEPTION, AND IT IS A DELIBERATE ONE.
 * ------------------------------------------------------------
 * Stations 0-1 run ELECTRIC BLUE / CYAN dominant over deep navy; crimson is
 * demoted to a controlled secondary that survives only in the wordmark's full
 * stop, the status dot and a low rim light. From station 2 the accent warms
 * back through violet into the crimson the rest of the journey is built on.
 *
 * That is not a second palette — it is the SAME restraint applied to a
 * different argument. The home page has to read as an abstract digital
 * dimension that computes, and computation reads cold: cyan is the colour of
 * something powered and thinking, crimson is the colour of something warned
 * or wounded. Crimson dominance in the opening was fighting the one thing the
 * hero most needs to say. Keeping a trace of it is what stops the handover to
 * station 2 looking like two different websites bolted together.
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
  // THE OPENING. Cyan accent, and the LOWEST exposure, ambient and bloom in
  // the journey — deliberately, and this is the correction that matters most
  // in this file.
  //
  // These four numbers were the other half of the flat-blue hero. Ambient at
  // 0.98 puts an even fill on every surface in frame, which is the definition
  // of a frame with no shadow side; exposure 1.14 and bloom 0.58 then lifted
  // what was left. The opening is now graded DOWN, so the one tight sky lobe,
  // the beacon and the rim lights are the only things carrying light — and a
  // frame where you can point at the source is a frame with depth in it.
  //
  // The vignette goes UP rather than down for the same reason: brightness in
  // the centre only becomes depth if it falls off at the corners.
  station(0, 'hero', {
    x: 0, y: 1.0, lookX: 0.0, lookY: 0.6,
    mood: { coolPower: 1.12, fogNear: 15, fogFar: 122, accent: '#3ad4ff', ambient: 0.42, density: 0.62, light: 1.16, accentPower: 0.64, exposure: 1.0, bloom: 0.40, vignette: 1.02 },
  }),
  station(1, 'about', {
    x: -7, y: 4.5, lookX: -0.5, lookY: 0.9,
    mood: { coolPower: 1.20, fogNear: 16, fogFar: 130, accent: '#4bb8f5', ambient: 0.56, density: 0.70, light: 1.22, accentPower: 0.56, exposure: 1.04, bloom: 0.46, vignette: 0.94 },
  }),
  // The handover. Violet is the hinge between the opening's cyan and the
  // crimson the rest of the journey runs on — going straight from one to the
  // other across a single station boundary reads as a theme switch rather
  // than as travel.
  station(2, 'skills', {
    x: 5, y: -4.0, lookX: 0.4, lookY: -0.4,
    mood: { coolPower: 1.3, fogNear: 17, fogFar: 134, accent: '#9d6bf0', ambient: 0.86, density: 0.75, light: 1.52, accentPower: 0.7, exposure: 1.16, bloom: 0.68, vignette: 0.76 },
  }),
  station(3, 'experience', {
    x: 13, y: 2.0, lookX: 0.7, lookY: 0.3,
    mood: { coolPower: 0.6, fogNear: 15, fogFar: 118, accent: '#b3122e', ambient: 0.62, density: 1.05, light: 1.22, accentPower: 0.72, exposure: 0.99, bloom: 0.52, vignette: 1.06 },
  }),
  station(4, 'projects', {
    x: 2, y: 8.0, lookX: 0.2, lookY: 0.8,
    mood: { coolPower: 0.72, fogNear: 18, fogFar: 125, accent: '#ff2d4d', ambient: 0.72, density: 0.7, light: 1.65, accentPower: 0.96, exposure: 1.2, bloom: 0.8, vignette: 0.9 },
  }),
  station(5, 'ailab', {
    x: -11, y: 1.5, lookX: -0.6, lookY: 0.2,
    mood: { coolPower: 0.5, fogNear: 13, fogFar: 104, accent: '#ff5a3c', ambient: 0.6, density: 1.25, light: 1.12, accentPower: 0.46, exposure: 1.02, bloom: 0.64, vignette: 1.1 },
  }),
  station(6, 'achievements', {
    x: -4, y: -6.0, lookX: -0.3, lookY: -0.5,
    mood: { coolPower: 0.66, fogNear: 15, fogFar: 100, accent: '#ff5a3c', ambient: 0.7, density: 0.85, light: 1.45, accentPower: 0.6, exposure: 1.15, bloom: 0.7, vignette: 0.96 },
  }),
  // THE DESTINATION, AND IT IS THE QUIETEST GRADE IN THE JOURNEY.
  //
  // This station ran the highest bloom (0.9), the highest exposure (1.2) and
  // the highest accent power (1.0) of all eight — over the one section that is
  // a dense FORM. Bloom is added after everything else in the composite, so it
  // sat on top of field labels, placeholder text and hairline borders and took
  // the detail out of exactly the content that most needs to be read. It was
  // also wrong for the story: the end of the journey is supposed to be the
  // universe going quiet, and it was being photographed like the loudest
  // moment in it.
  //
  // Graded down across the board, and the vignette goes UP so the falloff
  // closes in around the form rather than opening out.
  station(7, 'contact', {
    x: 6, y: 0.5, lookX: 0.3, lookY: 0.1,
    mood: { coolPower: 0.88, fogNear: 17, fogFar: 130, accent: '#ff2d4d', ambient: 0.5, density: 0.5, light: 1.12, accentPower: 0.6, exposure: 0.98, bloom: 0.38, vignette: 1.08 },
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
