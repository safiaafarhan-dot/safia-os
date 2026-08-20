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
export default function CameraRig({ reducedMotion = false }) {
  const { camera } = useThree()
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(0, 0.7, -14))
  const tmp = useRef(new THREE.Vector3())

  const { pathCurve, lookCurve } = useMemo(() => {
    const pathCurve = new THREE.CatmullRomCurve3(
      STATIONS.map((s) => new THREE.Vector3(...s.position)),
      false,
      'catmullrom',
      0.5
    )
    const lookCurve = new THREE.CatmullRomCurve3(
      STATIONS.map((s) => new THREE.Vector3(...s.lookAt)),
      false,
      'catmullrom',
      0.5
    )
    return { pathCurve, lookCurve }
  }, [])

  useFrame((state, delta) => {
    const s = scrollState()
    const span = STATIONS.length - 1
    const t = Math.max(0, Math.min(1, s.station / span))

    pathCurve.getPoint(t, tmp.current)

    // Pointer pushes the camera off the rail. This is the difference between
    // "the page has a 3D background" and "I am holding the camera": the view
    // parallaxes against the environment even when the page is not scrolling.
    const drift = reducedMotion ? 0 : 1
    const px = s.pointerSmoothX * 0.85 * drift
    const py = s.pointerSmoothY * 0.5 * drift

    camera.position.set(tmp.current.x + px, tmp.current.y + py, tmp.current.z)

    lookCurve.getPoint(t, lookTarget.current)
    // The look target lags the camera slightly, so fast scrolling swings the
    // view like a real rig catching up rather than snapping rigidly forward.
    const ease = reducedMotion ? 1 : 1 - Math.exp(-9 * delta)
    currentLook.current.lerp(lookTarget.current, ease)
    camera.lookAt(currentLook.current)

    if (!reducedMotion) {
      // Bank into the travel. Tiny — a couple of degrees at full speed — but it
      // is most of what makes fast scrolling feel like momentum.
      const targetRoll = THREE.MathUtils.clamp(-s.velocity * 0.05, -0.06, 0.06)
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
