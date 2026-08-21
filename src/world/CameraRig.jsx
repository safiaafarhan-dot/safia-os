import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { STATIONS, sampleMood } from './stations'
import { BH_POSITION, bhAttention } from './blackHoleState'
import { beginKeepOut } from './safeZone'

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
  const bhAim = useRef(new THREE.Vector3())

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

      // THE RIG IS NEVER PARKED.
      //
      // Stop scrolling and, until now, the camera stopped dead: position is a
      // pure function of station, so a visitor who paused to read was looking
      // at a still frame with some particles moving in it. That is the single
      // clearest way a "living world" gives itself away as a scroll-scrubbed
      // animation — the world only existed while you were driving it.
      //
      // So the rig keeps breathing, and it breathes HARDEST when nothing is
      // happening. `stillness` (see scrollStore) rises the longer the page is
      // left alone, so the drift is masked while travelling and comes forward
      // the moment you stop. Three mutually prime periods, so the composite
      // never returns to the same offset and it cannot read as a loop.
      //
      // Amplitude is deliberately under a unit. At this focal length that is a
      // few pixels of parallax against the near layers and essentially nothing
      // against the far ones — felt as the frame being ALIVE rather than seen
      // as the camera moving, and far too small to walk the composition or
      // push anything into the reading column.
      const idle = s.stillness
      const bt = s.time
      tmp.current.addScaledVector(
        right.current,
        (Math.sin(bt * 0.089) * 0.42 + Math.sin(bt * 0.037 + 1.7) * 0.24) * idle
      )
      tmp.current.addScaledVector(
        up.current,
        (Math.cos(bt * 0.063) * 0.34 + Math.sin(bt * 0.021 + 0.6) * 0.18) * idle
      )
      // A shallow forward/back swell as well, so the depth axis is alive too
      // and the drift does not read as a flat pan across a backdrop.
      tmp.current.addScaledVector(tangent.current, Math.sin(bt * 0.047 + 2.3) * 0.55 * idle)
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

    // THE CAMERA NOTICES THE BLACK HOLE AND TURNS TO WATCH IT.
    //
    // On a curved path no fixed point stays in frame - the heading follows the
    // tangent and swings away from anything stationary. Rather than shuffling
    // the object until it happens to line up, the rig turns its head, which is
    // both what an operator would do and what makes the approach read as
    // discovery.
    //
    // The aim goes to a point BESIDE the hole, not at it: offset along the
    // camera's right by the amount that lands the hole about a quarter of the
    // way left of centre. That keeps the frame's right side clear for the
    // guardian, which is what stops the climax from swallowing the
    // protagonist. The offset is computed from distance so the composition
    // holds as the hole grows.
    const attention = bhAttention(s.station)
    if (attention > 0.001) {
      const bhDist = tmp.current.distanceTo(BH_POSITION)
      // Offsets are fractions of the distance, so the composition holds as the
      // hole grows. Right pushes it LEFT in frame, clear of the reading
      // column; negative up lifts it, clear of the body copy. The headline
      // still crosses the shadow, which is deliberate - white type against the
      // one genuinely black thing in the frame is the best contrast available,
      // and the overlap is what makes the hole read as being BEHIND the text
      // rather than beside it.
      bhAim.current
        .copy(BH_POSITION)
        .addScaledVector(right.current, bhDist * 0.33)
        .addScaledVector(up.current, bhDist * -0.07)
      lookTarget.current.lerp(bhAim.current, attention)
    }

    // THE RIG LEANS INTO THE TRAVEL, AND THE LEAN IS SIGNED.
    //
    // `flow` is the damped, direction-aware scroll rate. Aiming a little ahead
    // of the travel when moving forward and a little behind it when reversing
    // is what makes scrolling back up feel like reversing rather than like the
    // same shot played backwards — the camera looks where it is going, both
    // ways.
    if (!reducedMotion) {
      lookTarget.current.addScaledVector(tangent.current, s.flow * 9)
      lookTarget.current.addScaledVector(up.current, -s.flow * 1.6)
    }

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

    // The camera is final for this frame, so cache its matrices for the
    // keep-out tests. This has to happen HERE, after every move, roll and fov
    // change: running it earlier would evaluate the safe zone against last
    // frame's view and objects would clear the text one frame late, which
    // shows up as a visible twitch at the column edge while scrolling.
    beginKeepOut(camera)
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
