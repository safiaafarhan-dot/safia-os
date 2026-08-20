/**
 * Flight-path tracer.
 *
 * Replicates CameraRig's maths exactly — the same Catmull-Rom curve through
 * the station positions, the same tangent-derived heading, the same aim bias
 * in camera space — and reports where any world point falls in frame across
 * the whole journey.
 *
 * This exists because the black hole was previously positioned by eye against
 * a straight corridor. The path is now a real 3D curve with steering and
 * banking, so "somewhere ahead and a bit to the right" is no longer a
 * meaningful description of anything. Guessing costs a browser round trip per
 * attempt; solving costs one run.
 *
 *   node scripts/trace-flight.mjs [x y z]
 */
import * as THREE from 'three'
import { STATIONS, STATION_SPACING } from '../src/world/stations.js'
import { BH_POSITION, BH_HORIZON_R, bhAttention, bhPresence } from '../src/world/blackHoleState.js'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const FOV = 42
const ASPECT = 16 / 9

const pathCurve = new THREE.CatmullRomCurve3(
  STATIONS.map((s) => new THREE.Vector3(...s.position)),
  false,
  'catmullrom',
  0.5
)

/** Same bias derivation as CameraRig.sampleStationBias. */
const bias = (stationFloat, axis) => {
  const c = Math.max(0, Math.min(STATIONS.length - 1, stationFloat))
  const i = Math.floor(c)
  const j = Math.min(STATIONS.length - 1, i + 1)
  const f = c - i
  const a = STATIONS[i].lookAt[axis] - STATIONS[i].position[axis]
  const b = STATIONS[j].lookAt[axis] - STATIONS[j].position[axis]
  return a * (1 - f) + b * f
}

const span = STATIONS.length - 1

/** Camera state at a fractional station index, exactly as the rig builds it. */
export function cameraAt(station, bhPos = BH_POSITION, attScale = 1) {
  const t = Math.max(0, Math.min(1, station / span))
  const pos = pathCurve.getPoint(t, new THREE.Vector3())
  const ahead = pathCurve.getPoint(Math.min(1, t + 0.045), new THREE.Vector3())

  const tangent = ahead.clone().sub(pos)
  if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, -1)
  tangent.normalize()

  const right = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize()
  const up = new THREE.Vector3().crossVectors(right, tangent).normalize()

  const look = pos
    .clone()
    .addScaledVector(tangent, 18)
    .addScaledVector(right, bias(station, 0) * 6)
    .addScaledVector(up, bias(station, 1) * 6)

  // Same attention blend as the rig: the camera turns to watch the hole.
  const attention = bhAttention(station) * attScale
  if (attention > 0.001) {
    const bhDist = pos.distanceTo(bhPos)
    const aim = bhPos.clone().addScaledVector(right, bhDist * 0.33).addScaledVector(up, bhDist * -0.07)
    look.lerp(aim, attention)
  }

  const cam = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, 2000)
  cam.position.copy(pos)
  cam.lookAt(look)
  cam.updateMatrixWorld(true)

  return { pos, tangent, right, up, cam }
}

/** Where `target` sits in frame at this station. */
export function frameOf(station, target, attScale = 1) {
  const { pos, tangent, cam } = cameraAt(station, target, attScale)
  const ndc = target.clone().project(cam)
  const toTarget = target.clone().sub(pos)
  const dist = toTarget.length()
  const forward = toTarget.clone().normalize().dot(tangent)
  // Angular radius of a body of radius r at this distance, as a fraction of
  // half the vertical frame — the number that actually says "how big".
  const halfH = Math.tan((FOV * Math.PI) / 360) * dist
  return { ndc, dist, forward, halfH }
}


/**
 * SOLVE: where must a body sit to land at a given spot in frame?
 *
 * The inverse of the report above, and the reason this file exists. Composing
 * by nudging a world position and re-checking in a browser costs a round trip
 * per attempt and never converges; unprojecting the desired screen position
 * back into the world answers it exactly, in one step.
 */
export function solvePosition(station, ndcX, ndcY, dist) {
  const { pos, cam } = cameraAt(station)
  const ray = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(pos).normalize()
  return pos.clone().addScaledVector(ray, dist)
}

/** Apparent radius of a body, as a fraction of half the frame height. */
export function apparentRadius(station, target, radius) {
  const { dist } = frameOf(station, target)
  return radius / (Math.tan((FOV * Math.PI) / 360) * dist)
}

const HORIZON_R = BH_HORIZON_R

function report(target, label, radius = HORIZON_R, attScale = 1) {
  console.log(`\n=== ${label}  target (${target.x}, ${target.y}, ${target.z}) ===`)
  console.log(' st |  cam position        | dist | infront |   ndc.x   ndc.y | horizon/halfH | in frame')
  for (let st = 0; st <= span; st += 0.5) {
    const { ndc, dist, forward, halfH } = frameOf(st, target, attScale)
    const { pos } = cameraAt(st, target, attScale)
    const rel = radius / halfH
    const inFrame = forward > 0 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1
    const pres = bhPresence(st)
    console.log(
      ` ${st.toFixed(1).padStart(3)} |` +
        ` ${pos.toArray().map((n) => n.toFixed(1).padStart(6)).join(',')} |` +
        ` ${dist.toFixed(0).padStart(4)} |` +
        ` ${forward > 0 ? ' yes' : ' NO '}    |` +
        ` ${ndc.x.toFixed(2).padStart(6)} ${ndc.y.toFixed(2).padStart(6)} |` +
        ` ${rel.toFixed(3).padStart(13)} |` +
        ` ${inFrame ? 'YES' : '-'}` +
        ` | pres ${pres.toFixed(2)} att ${bhAttention(st).toFixed(2)}`
    )
  }
}

console.log('STATION_SPACING', STATION_SPACING)
console.log('station positions:')
STATIONS.forEach((s) =>
  console.log(' ', s.index, s.id.padEnd(13), s.position.map((n) => n.toFixed(1).padStart(7)).join(','))
)

const argv = process.argv.slice(2)
if (argv[0] === 'solve') {
  // solve <station> <ndcX> <ndcY> <dist> <radius>
  const [, st, nx, ny, d, r] = argv.map((v, i) => (i === 0 ? v : +v))
  const attScale = argv[6] === undefined ? 1 : +argv[6]
  const p = solvePosition(st, nx, ny, d)
  console.log('SOLVED position:', p.toArray().map((n) => +n.toFixed(1)))
  console.log('apparent radius at that station:', apparentRadius(st, p, r).toFixed(3))
  report(p, `SOLVED st${st} ndc(${nx},${ny}) dist ${d} radius ${r} attScale ${attScale}`, r, attScale)
} else if (argv.length === 3) {
  report(new THREE.Vector3(+argv[0], +argv[1], +argv[2]), 'CANDIDATE')
} else {
  report(BH_POSITION, 'BLACK HOLE (shared constant)')
}
