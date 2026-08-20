import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pulseEnergy, scrollState } from '../state/scrollStore'
import { useWorldStore } from '../state/worldStore'
import { addSpin, dragState, interactiveEntries } from './interaction'

/** DOM elements that own their clicks — never let a click fall through to the world. */
const DOM_INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], .interactive'

/**
 * Hover, click and drag against the 3D world.
 *
 * The canvas itself is pointer-events:none, because it spans the entire
 * document behind the content — enabling events on it would swallow every link
 * and button on the page. So instead of R3F's built-in event system, this
 * raycasts from window-level pointer events against the interaction registry,
 * and defers to the DOM whenever the pointer is over real page furniture.
 */
export default function WorldPointer() {
  const { camera } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const frameCount = useRef(0)
  const hoveredRef = useRef(null)
  const pointerDownOnWorld = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  /**
   * Whether the visitor has actually moved a pointing device yet.
   *
   * pointerX/Y start at 0,0 — which in normalised device coordinates is the
   * dead centre of the screen, not "nowhere". Raycasting from that default
   * makes the world report a hover the visitor never performed, so the
   * identification HUD appears over the middle of the page on load. Touch and
   * keyboard visitors would see it permanently.
   */
  const pointerLive = useRef(false)

  const setHovered = useWorldStore((s) => s.setHovered)

  /** Nearest registered object under the pointer, or null. */
  const pick = () => {
    const entries = interactiveEntries()
    if (entries.size === 0) return null

    const s = scrollState()
    ndc.set(s.pointerX, s.pointerY)
    raycaster.setFromCamera(ndc, camera)

    let best = null
    let bestDist = Infinity
    entries.forEach((entry) => {
      const obj = entry.object?.current
      if (!obj || !obj.visible) return
      const hits = raycaster.intersectObject(obj, true)
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance
        best = entry
      }
    })
    return best
  }

  useEffect(() => {
    /** True when the pointer is over page content that owns its own input. */
    const overDomUI = (e) => !!e.target?.closest?.(DOM_INTERACTIVE)

    const onDown = (e) => {
      if (e.button !== 0 || overDomUI(e)) return
      const hit = hoveredRef.current
      if (!hit) return
      pointerDownOnWorld.current = true
      lastPointer.current = { x: e.clientX, y: e.clientY }
      if (hit.draggable) {
        dragState.activeId = hit.id
        // Suppress text selection while dragging an object.
        document.body.style.userSelect = 'none'
      }
    }

    const onMove = (e) => {
      // A mouse move counts as live; a touch drag does not, since there is no
      // hover state to report on a touchscreen.
      if (e.pointerType !== 'touch') pointerLive.current = true
      if (!dragState.activeId) return
      const dx = e.clientX - lastPointer.current.x
      const dy = e.clientY - lastPointer.current.y
      lastPointer.current = { x: e.clientX, y: e.clientY }
      // Vertical drag pitches, horizontal drag yaws — the mapping people
      // expect from grabbing an object rather than orbiting a camera.
      addSpin(dragState.activeId, dy * 0.012, dx * 0.012)
      pulseEnergy(0.02)
    }

    const onUp = (e) => {
      const wasDragging = dragState.activeId
      dragState.activeId = null
      document.body.style.userSelect = ''

      if (!pointerDownOnWorld.current) return
      pointerDownOnWorld.current = false

      // A click is a press that didn't travel. Anything further was a drag,
      // and dragging an object should not also activate it.
      const moved =
        Math.abs(e.clientX - lastPointer.current.x) + Math.abs(e.clientY - lastPointer.current.y)
      if (wasDragging && moved > 4) return

      const hit = hoveredRef.current
      if (hit && !overDomUI(e)) {
        hit.onActivate?.()
        pulseEnergy(0.55)
      }
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
  }, [])

  useFrame(() => {
    // Raycasting every frame is pure waste for a hover state a human reads at
    // reading speed; a third of the frames is still imperceptibly responsive.
    frameCount.current += 1
    if (!pointerLive.current || dragState.activeId || frameCount.current % 3 !== 0) return

    const hit = pick()
    const nextId = hit?.id ?? null
    if (nextId !== (hoveredRef.current?.id ?? null)) {
      hoveredRef.current = hit
      setHovered(nextId ? { id: nextId, label: hit.label } : null)
      if (nextId) pulseEnergy(0.18)
    }
  })

  return null
}
