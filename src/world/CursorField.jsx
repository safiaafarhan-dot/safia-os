import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../state/scrollStore'
import { cursorField } from './cursorFieldState'

/**
 * Drives the cursor field.
 *
 * Each frame this projects the pointer into world space, integrates velocity,
 * and charges or discharges the dwell value. Everything else in the world
 * reads that state through influenceAt() / chargedInfluenceAt() and responds
 * locally — fragments lift and swing where the cursor rests, and settle again
 * when it leaves.
 *
 * IT RENDERS NOTHING. There used to be a cloud of motes drawn at the cursor to
 * make the cause of that drift visible, but orbiting points trailing the
 * pointer read as a coil of wire dragged across the interface, and being
 * anchored to the pointer they were the one part of the world guaranteed to
 * sit on top of whatever control the visitor was reaching for. The field's
 * effect on the world is legible enough on its own; the decoration was not
 * worth what it cost in cleanliness.
 */
export default function CursorField({ reducedMotion = false }) {
  const { camera } = useThree()

  const ndc = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3(0, 0, -20))
  const previous = useRef(new THREE.Vector3(0, 0, -20))
  const lastPointer = useRef({ x: 0, y: 0 })

  // Reused so the per-frame path allocates nothing.
  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const s = scrollState()
    const dt = Math.min(0.05, delta)

    // Reduced motion switches the whole field off rather than slowing it: a
    // pointer-driven force is exactly the kind of continuous motion the
    // preference exists to remove.
    cursorField.gain = reducedMotion ? 0 : 1
    if (reducedMotion) {
      cursorField.dwell = 0
      return
    }

    // A pointer that has never moved sits at NDC 0,0 — dead centre, not
    // "nowhere". Reacting to that would charge the field over the middle of
    // the page for touch and keyboard visitors who never moved anything.
    if (Math.abs(s.pointerX) > 0.0001 || Math.abs(s.pointerY) > 0.0001) {
      cursorField.live = true
    }
    if (!cursorField.live) return

    /* ---- project the pointer onto a plane facing the camera ---- */
    // Placed at a fixed distance ahead rather than on geometry: raycasting the
    // scene every frame to find a surface is expensive, and there is often no
    // surface under the pointer at all out here.
    ndc.current.set(s.pointerSmoothX, s.pointerSmoothY, 0.5).unproject(camera)
    scratch.copy(ndc.current).sub(camera.position).normalize()
    target.current.copy(camera.position).addScaledVector(scratch, 26)

    // Spring toward the target rather than snapping: the field has mass, so it
    // trails the pointer slightly and overshoots on a fast flick.
    const ease = 1 - Math.exp(-7 * dt)
    previous.current.copy(cursorField.position)
    cursorField.position.lerp(target.current, ease)

    /* ---- velocity and stillness, measured in SCREEN space ---- */
    // This has to come from the pointer, not from the field's world position.
    // The camera is always moving along its curved path, so the projected
    // world point chases it every frame even when the mouse is perfectly
    // still — measured that way, a motionless cursor reported a constant speed
    // of 0.7 and dwell could never charge at all. Stillness is a fact about
    // the user's hand, which is a screen-space quantity.
    const dxs = s.pointerX - lastPointer.current.x
    const dys = s.pointerY - lastPointer.current.y
    lastPointer.current.x = s.pointerX
    lastPointer.current.y = s.pointerY
    const screenSpeed = Math.hypot(dxs, dys) / Math.max(dt, 0.0001)

    cursorField.velocity.copy(cursorField.position).sub(previous.current).divideScalar(Math.max(dt, 0.0001))
    cursorField.speed += (Math.min(1, screenSpeed / 1.6) - cursorField.speed) * (1 - Math.exp(-7 * dt))

    // Charge while still, discharge while moving. Charging is faster than
    // discharging on purpose: energy should build in a couple of seconds and
    // bleed away over four, so leaving an area looks like settling rather than
    // like an animation being cancelled.
    if (cursorField.speed < 0.06) {
      cursorField.dwell = Math.min(1, cursorField.dwell + dt / 2.0)
    } else {
      cursorField.dwell = Math.max(0, cursorField.dwell - dt / 4.0)
    }
  })

  return null
}
