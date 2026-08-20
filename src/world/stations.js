/**
 * The timeline for the whole site.
 *
 * SAFIA.OS is one continuous environment: a single field of points at the
 * origin that reorganises as you scroll, and a camera on a slow, unbroken
 * orbit around it. There is no corridor, no set of scenes and no boundary
 * between sections — each station is simply a different SHOT of the same
 * subject at a different moment in its reorganisation.
 *
 * Because camera, lighting, atmosphere, grade, typography and the field all
 * read their values from this one table at the same fractional station index,
 * they cannot drift out of sync. That single-source arrangement is what makes
 * scrolling feel choreographed rather than like several effects that happen to
 * fire near each other.
 *
 * PALETTE DISCIPLINE
 * ------------------
 * Two families only: cold graphite/steel, and crimson as the single signal.
 * The previous direction gave every station its own hue — violet, teal,
 * amber — which is precisely what made it read as generic sci-fi. Stations now
 * differ by EXPOSURE, DENSITY, LENS and DISTANCE. That is how photography
 * creates variety, and it is why restraint reads as expensive.
 */

export const PALETTE = {
  crimson: '#ff2d4d',
  crimsonDeep: '#b3122e',
  steel: '#9db3d4',
  steelDeep: '#38455e',
  ink: '#070a11',
  haze: '#131a26',
}

/**
 * @param cam.az      orbit azimuth in radians — monotonically increasing, so
 *                    the camera never reverses direction across the scroll
 * @param cam.el      orbit elevation in radians
 * @param cam.radius  distance from the field's centre
 * @param cam.look    where the camera aims, offset from the field centre.
 *                    Negative x pushes the FIELD to the right of frame, which
 *                    is what clears the left column for the reading text.
 * @param cam.fov     lens
 * @param cam.roll    camera roll — a couple of degrees, never more
 *
 * @param mood.fogNear/fogFar  atmospheric falloff, in world units
 * @param mood.ambient         base fill
 * @param mood.key             key-light multiplier
 * @param mood.accentPower     how hot the crimson signal runs, 0..1
 * @param mood.density         field opacity multiplier
 * @param mood.dispersion      how loosely points sit on their targets
 * @param mood.pointScale      point size multiplier
 * @param mood.exposure        tone-mapping exposure — the photographic dial
 * @param mood.bloom           grade glow strength
 * @param mood.vignette        grade corner falloff
 * @param mood.scrim           0..1 darkness of the DOM reading veil
 */
const station = (i, id, cfg) => ({ id, index: i, ...cfg })

export const STATIONS = [
  station(0, 'hero', {
    label: 'ATTRACTOR',
    cam: { az: 0.5, el: 0.16, radius: 21, look: [-6.6, 0.6, 0], fov: 42, roll: 0 },
    mood: {
      fogNear: 12, fogFar: 62, ambient: 0.5, key: 1.25, accentPower: 0.95,
      density: 1.0, dispersion: 0.5, pointScale: 1.0,
      exposure: 1.18, bloom: 0.78, vignette: 0.92, scrim: 0.0,
    },
    type: { text: 'SAFIA.OS', size: 5.4, offset: [0.4, -5.6, -13], opacity: 0.075 },
  }),
  station(1, 'about', {
    label: 'FIGURE',
    // Close and level: the one shot where you meet the character eye to eye.
    cam: { az: 2.1, el: 0.05, radius: 14, look: [-4.6, 0.5, 0], fov: 40, roll: 0.02 },
    mood: {
      fogNear: 9, fogFar: 46, ambient: 0.42, key: 1.05, accentPower: 0.6,
      density: 1.15, dispersion: 0.18, pointScale: 0.9,
      exposure: 1.04, bloom: 0.56, vignette: 1.12, scrim: 0.86,
    },
    type: { text: 'IDENTITY', size: 3.4, offset: [-1.2, 5.2, -10], opacity: 0.06 },
  }),
  station(2, 'skills', {
    label: 'MANIFOLD',
    // High and wide: you look down onto the sheet, which is the only angle a
    // manifold reads from.
    cam: { az: 3.55, el: 0.44, radius: 23, look: [-6.4, 0.2, 0], fov: 38, roll: -0.035 },
    mood: {
      fogNear: 16, fogFar: 78, ambient: 0.56, key: 1.45, accentPower: 0.72,
      density: 0.92, dispersion: 0.3, pointScale: 0.95,
      exposure: 1.14, bloom: 0.66, vignette: 0.96, scrim: 0.8,
    },
    type: { text: 'CAPABILITY', size: 3.0, offset: [1.0, 5.6, -12], opacity: 0.06 },
  }),
  station(3, 'experience', {
    label: 'RIBBON',
    // Low angle, looking up the helix — time receding above you.
    cam: { az: 5.0, el: -0.24, radius: 18, look: [-5.4, 0.5, 0], fov: 45, roll: 0.05 },
    mood: {
      fogNear: 8, fogFar: 44, ambient: 0.38, key: 0.98, accentPower: 0.44,
      density: 1.05, dispersion: 0.42, pointScale: 0.88,
      exposure: 0.98, bloom: 0.46, vignette: 1.2, scrim: 0.9,
    },
    type: { text: 'RECORD', size: 3.2, offset: [-1.4, -5.4, -11], opacity: 0.05 },
  }),
  station(4, 'projects', {
    label: 'CLUSTERS',
    cam: { az: 6.6, el: 0.3, radius: 27, look: [-7.4, 0.2, 0], fov: 36, roll: -0.025 },
    mood: {
      fogNear: 18, fogFar: 92, ambient: 0.6, key: 1.6, accentPower: 0.88,
      density: 0.85, dispersion: 0.26, pointScale: 1.05,
      exposure: 1.2, bloom: 0.8, vignette: 0.9, scrim: 0.82,
    },
    type: { text: 'ARCHIVE', size: 3.6, offset: [1.2, -5.8, -13], opacity: 0.055 },
  }),
  station(5, 'ailab', {
    label: 'TURBULENCE',
    // Inside the churn. The tightest fog and the shortest throw on the site,
    // so this is the one moment the world feels genuinely enclosing.
    cam: { az: 8.0, el: 0.02, radius: 12, look: [-4.2, 0.4, 0], fov: 48, roll: 0.055 },
    mood: {
      fogNear: 6, fogFar: 34, ambient: 0.36, key: 0.92, accentPower: 0.78,
      density: 1.3, dispersion: 0.75, pointScale: 0.85,
      exposure: 1.02, bloom: 0.62, vignette: 1.26, scrim: 0.86,
    },
    type: { text: 'LABORATORY', size: 2.6, offset: [-0.8, 4.8, -9], opacity: 0.055 },
  }),
  station(6, 'achievements', {
    label: 'LATTICE',
    cam: { az: 9.4, el: 0.36, radius: 22, look: [-6.2, 0.3, 0], fov: 39, roll: -0.045 },
    mood: {
      fogNear: 15, fogFar: 84, ambient: 0.58, key: 1.42, accentPower: 0.6,
      density: 0.88, dispersion: 0.12, pointScale: 1.0,
      exposure: 1.15, bloom: 0.7, vignette: 0.96, scrim: 0.8,
    },
    type: { text: 'HONOURS', size: 3.2, offset: [1.1, 5.4, -12], opacity: 0.05 },
  }),
  station(7, 'contact', {
    label: 'CONVERGENCE',
    // Centred for the first time since the hero: the closing shot faces you.
    cam: { az: 10.8, el: 0.1, radius: 17, look: [-1.2, 0.4, 0], fov: 41, roll: 0 },
    mood: {
      fogNear: 14, fogFar: 96, ambient: 0.54, key: 1.35, accentPower: 1.0,
      density: 0.95, dispersion: 0.2, pointScale: 1.15,
      exposure: 1.2, bloom: 0.92, vignette: 0.88, scrim: 0.84,
    },
    type: { text: 'UPLINK', size: 3.8, offset: [0, -5.2, -11], opacity: 0.065 },
  }),
]

export const STATION_IDS = STATIONS.map((s) => s.id)
export const STATION_COUNT = STATIONS.length

const clampStation = (v) => Math.max(0, Math.min(STATION_COUNT - 1, v))

/** The two stations either side of a fractional index, and the blend between. */
export const stationSpan = (stationFloat) => {
  const c = clampStation(stationFloat)
  const i = Math.floor(c)
  const j = Math.min(STATION_COUNT - 1, i + 1)
  return { i, j, t: c - i }
}

/** Interpolate a per-station mood scalar at a fractional station index. */
export const sampleMood = (stationFloat, key) => {
  const { i, j, t } = stationSpan(stationFloat)
  return STATIONS[i].mood[key] * (1 - t) + STATIONS[j].mood[key] * t
}

/** Interpolate a camera scalar (az, el, radius, fov, roll). */
export const sampleCam = (stationFloat, key) => {
  const { i, j, t } = stationSpan(stationFloat)
  return STATIONS[i].cam[key] * (1 - t) + STATIONS[j].cam[key] * t
}

/** Interpolate the camera's aim offset into `out` (a THREE.Vector3-like). */
export const sampleLook = (stationFloat, out) => {
  const { i, j, t } = stationSpan(stationFloat)
  const a = STATIONS[i].cam.look
  const b = STATIONS[j].cam.look
  out.set(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  )
  return out
}

/**
 * How strongly the figure formation should bleed into whatever the field is
 * currently doing.
 *
 * The character is not a model parked next to the text — it IS the field. But
 * it only fully resolves at About. Between stations a trace of it persists, so
 * the visitor keeps catching a silhouette in the substance rather than meeting
 * a figure once and never again.
 */
export const figurePresence = (stationFloat) => {
  const d = Math.abs(stationFloat - 1)
  if (d < 1) return 1 - d * 0.55 // 1.0 at About, 0.45 a station away
  // A faint, permanent trace everywhere else, rising again at the closing shot.
  const closing = Math.max(0, 1 - Math.abs(stationFloat - 7)) * 0.22
  return Math.max(0.12, 0.45 - (d - 1) * 0.12) + closing
}
