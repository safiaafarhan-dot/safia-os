import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { sampleCam, sampleLook, sampleMood } from './stations'

/**
 * The shot.
 *
 * The camera is on ONE unbroken orbit around the field — azimuth increases
 * monotonically across the whole scroll, so it never reverses, never cuts and
 * never re-frames abruptly. Every station is a different angle on the same
 * subject, which is what makes eight sections read as one continuous take.
 *
 * Three details do most of the work of making this feel shot rather than
 * animated:
 *
 *  - THE AIM IS OFFSET IN SCREEN SPACE, not world space. The camera looks at a
 *    point displaced along its own right/up vectors, so the field sits on the
 *    opposite side of frame from the reading column at EVERY azimuth. A fixed
 *    world-space offset would swing the subject across the text as the orbit
 *    came round.
 *  - THE LOOK TARGET LAGS. Fast scrolling swings the view like a real rig
 *    catching up rather than snapping rigidly to the new angle.
 *  - HANDHELD. A tiny, slow, aperiodic drift on both position and rotation.
 *    Perfectly still cameras are the tell of a render; nothing real is that
 *    steady.
 */

const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Cheap aperiodic drift — three primes beating against each other. */
const drift = (t, a, b, c) =>
  Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.28 + Math.sin(t * c + 3.9) * 0.12

export default function CameraRig({ reducedMotion = false }) {
  const { camera, size } = useThree()

  const pos = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const up = useRef(new THREE.Vector3())
  const lookOffset = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(0, 0, 0))
  const started = useRef(false)

  const origin = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  useFrame((state, delta) => {
    const s = scrollState()
    const aspect = size.width / Math.max(1, size.height)
    const portrait = aspect < 0.95

    /* ---- orbit ---- */
    const az = sampleCam(s.station, 'az')
    const el = sampleCam(s.station, 'el')
    // Portrait viewports pull back: the content column is full-width there, so
    // the field has to sit BEHIND the text rather than beside it, and a subject
    // framed for a wide shot would be cropped to an unreadable fragment.
    const radius = sampleCam(s.station, 'radius') * (portrait ? 1.28 : 1)

    const ce = Math.cos(el)
    pos.current.set(Math.sin(az) * ce * radius, Math.sin(el) * radius, Math.cos(az) * ce * radius)

    /* ---- screen-space aim offset ---- */
    forward.current.copy(origin).sub(pos.current).normalize()
    right.current.crossVectors(forward.current, WORLD_UP).normalize()
    up.current.crossVectors(right.current, forward.current).normalize()

    sampleLook(s.station, lookOffset.current)
    // In portrait the subject centres behind the content and drops slightly,
    // clearing the band between the nav bar and the headline.
    const offX = portrait ? lookOffset.current.x * 0.22 : lookOffset.current.x
    const offY = portrait ? lookOffset.current.y - 1.1 : lookOffset.current.y

    lookTarget.current
      .copy(origin)
      .addScaledVector(right.current, offX)
      .addScaledVector(up.current, offY)

    /* ---- pointer parallax ---- */
    // The pointer pushes the rig off its rail. This is the difference between
    // "the page has a 3D background" and "I am holding the camera": the view
    // parallaxes against the field even when nothing is scrolling.
    if (!reducedMotion) {
      const px = s.pointerSmoothX * 1.15
      const py = s.pointerSmoothY * 0.7
      pos.current.addScaledVector(right.current, px)
      pos.current.addScaledVector(up.current, py)

      /* ---- handheld ---- */
      const t = s.time
      pos.current.addScaledVector(right.current, drift(t, 0.13, 0.31, 0.71) * 0.11)
      pos.current.addScaledVector(up.current, drift(t + 40, 0.11, 0.27, 0.63) * 0.09)
    }

    camera.position.copy(pos.current)

    /* ---- aim ---- */
    // Snap on the very first frame so the opening shot is correct immediately;
    // ease from then on.
    const ease = reducedMotion || !started.current ? 1 : 1 - Math.exp(-8 * delta)
    started.current = true
    currentLook.current.lerp(lookTarget.current, ease)
    camera.lookAt(currentLook.current)

    /* ---- lens ---- */
    const targetFov =
      sampleCam(s.station, 'fov') +
      (reducedMotion ? 0 : Math.min(Math.abs(s.velocity) * 2.2, 4.5) + s.energy * 1.2)
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * (reducedMotion ? 1 : 1 - Math.exp(-5 * delta))
      camera.updateProjectionMatrix()
    }

    /* ---- roll ---- */
    if (!reducedMotion) {
      // Authored roll, plus a bank into the travel. Both tiny — a couple of
      // degrees at most. Past that it stops reading as a camera and starts
      // reading as an effect.
      const targetRoll =
        sampleCam(s.station, 'roll') +
        THREE.MathUtils.clamp(-s.velocity * 0.045, -0.05, 0.05) +
        drift(s.time + 90, 0.09, 0.23, 0.53) * 0.006
      camera.rotation.z += (targetRoll - camera.rotation.z) * (1 - Math.exp(-5 * delta))
    } else {
      camera.rotation.z = 0
    }
  })

  return null
}

/**
 * Atmospheric falloff, interpolated between stations.
 *
 * Fog here is not a "distance cue" bolted on at the end — it is how the depth
 * of the space is authored. The Laboratory station fogs in at 6 units and out
 * at 34, which is what makes that one moment feel genuinely enclosing; the
 * Archive runs 18 to 92 and feels vast. Same world, different air.
 */
export function WorldMood({ fogRef }) {
  useFrame((state, delta) => {
    if (!fogRef.current) return
    const s = scrollState()
    const ease = 1 - Math.exp(-3 * delta)
    fogRef.current.near += (sampleMood(s.station, 'fogNear') - fogRef.current.near) * ease
    fogRef.current.far += (sampleMood(s.station, 'fogFar') - fogRef.current.far) * ease
  })

  return null
}
