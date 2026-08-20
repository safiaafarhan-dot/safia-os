import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS, sampleMood } from './stations'

/**
 * Flies the camera down the corridor.
 *
 * The camera follows a Catmull-Rom curve threaded through the station
 * positions rather than lerping station-to-station. Straight-line interpolation
 * produces a visible direction change at every station — the camera "hinges",
 * which instantly reads as a slideshow. A spline arcs through them continuously,
 * which is what makes the travel feel like one unbroken flight.
 */
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/**
 * The station's authored aim bias, interpolated. Index 0 is lateral, 1 is
 * vertical. Small numbers: this nudges the composition, it does not steer.
 */
const sampleStationBias = (stationFloat, axis) => {
  const c = Math.max(0, Math.min(STATIONS.length - 1, stationFloat))
  const i = Math.floor(c)
  const j = Math.min(STATIONS.length - 1, i + 1)
  const t = c - i
  const key = axis === 0 ? 0 : 1
  const a = STATIONS[i].lookAt[key] - STATIONS[i].position[key]
  const b = STATIONS[j].lookAt[key] - STATIONS[j].position[key]
  return a * (1 - t) + b * t
}

export default function CameraRig({ reducedMotion = false }) {
  const { camera } = useThree()
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(0, 0.7, -14))
  const tmp = useRef(new THREE.Vector3())
  const ahead = useRef(new THREE.Vector3())
  const tangent = useRef(new THREE.Vector3(0, 0, -1))
  const nextTangent = useRef(new THREE.Vector3(0, 0, -1))
  const right = useRef(new THREE.Vector3(1, 0, 0))
  const up = useRef(new THREE.Vector3(0, 1, 0))

  const { pathCurve } = useMemo(() => {
    const pathCurve = new THREE.CatmullRomCurve3(
      STATIONS.map((s) => new THREE.Vector3(...s.position)),
      false,
      'catmullrom',
      0.5
    )
    return { pathCurve }
  }, [])

  useFrame((state, delta) => {
    const s = scrollState()
    const span = STATIONS.length - 1
    const t = Math.max(0, Math.min(1, s.station / span))

    pathCurve.getPoint(t, tmp.current)

    // HEADING COMES FROM THE CURVE, NOT FROM A SECOND HAND-AUTHORED CURVE.
    //
    // The look target used to be its own spline, authored as "14 units further
    // down -Z" at every station. That meant the camera faced the same
    // direction no matter where the path went, so it never turned - it slid.
    // Taking the heading from the path's own tangent is what makes the rig
    // bank into its travel and makes the view keep opening onto something new.
    const lead = Math.min(1, t + 0.045)
    pathCurve.getPoint(lead, ahead.current)
    tangent.current.copy(ahead.current).sub(tmp.current)
    if (tangent.current.lengthSq() < 1e-6) tangent.current.set(0, 0, -1)
    tangent.current.normalize()

    // Camera-local axes, so the aim bias is a COMPOSITION offset rather than a
    // world-space nudge that would swing the subject across frame as the path
    // turns.
    right.current.crossVectors(tangent.current, WORLD_UP).normalize()
    up.current.crossVectors(right.current, tangent.current).normalize()

    // Pointer pushes the camera off the rail. This is the difference between
    // "the page has a 3D background" and "I am holding the camera": the view
    // parallaxes against the environment even when nothing is scrolling.
    if (!reducedMotion) {
      tmp.current.addScaledVector(right.current, s.pointerSmoothX * 0.9)
      tmp.current.addScaledVector(up.current, s.pointerSmoothY * 0.55)
    }
    camera.position.copy(tmp.current)

    // Aim: down the tangent, plus the station's authored bias in camera space.
    const biasX = sampleStationBias(s.station, 0)
    const biasY = sampleStationBias(s.station, 1)
    lookTarget.current
      .copy(tmp.current)
      .addScaledVector(tangent.current, 18)
      .addScaledVector(right.current, biasX * 6)
      .addScaledVector(up.current, biasY * 6)

    // The look target lags, so fast scrolling swings the view like a real rig
    // catching up rather than snapping rigidly to the new heading.
    const ease = reducedMotion ? 1 : 1 - Math.exp(-6 * delta)
    currentLook.current.lerp(lookTarget.current, ease)
    camera.lookAt(currentLook.current)

    if (!reducedMotion) {
      // BANK INTO THE TURN. Sample the heading a little further along and roll
      // toward whichever way it is swinging, on top of the velocity bank. A
      // camera that changes direction without banking reads as a sliding
      // window; one that banks reads as a body moving through space.
      pathCurve.getPoint(Math.min(1, t + 0.09), ahead.current)
      nextTangent.current.copy(ahead.current).sub(tmp.current).normalize()
      const turn = nextTangent.current.dot(right.current)
      const targetRoll = THREE.MathUtils.clamp(
        -turn * 1.5 - s.velocity * 0.04,
        -0.16,
        0.16
      )
      camera.rotation.z += (targetRoll - camera.rotation.z) * (1 - Math.exp(-6 * delta))

      // Speed widens the lens. Reads as acceleration without moving faster.
      const targetFov = 42 + Math.min(Math.abs(s.velocity) * 2.4, 5) + s.energy * 1.5
      if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * delta))
        camera.updateProjectionMatrix()
      }
    }
  })

  return null
}

/**
 * Interpolates fog between station moods, so scrolling changes how enclosed or
 * vast the space feels. Lighting lives in LightRig, which has to follow the
 * camera down the corridor and therefore owns its own frame loop.
 */
export function WorldMood({ fogRef }) {
  useFrame((state, delta) => {
    if (!fogRef.current) return
    const s = scrollState()
    const ease = 1 - Math.exp(-3 * delta)
    const near = sampleMood(s.station, 'fogNear')
    const far = sampleMood(s.station, 'fogFar')
    fogRef.current.near += (near - fogRef.current.near) * ease
    fogRef.current.far += (far - fogRef.current.far) * ease
  })

  return null
}
