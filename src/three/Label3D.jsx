import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * A text label that lives in the 3D scene.
 *
 * Replaces drei's <Html> for the project module labels. Html is excellent, but
 * it pulled the whole drei package into a vendor chunk that measured as 86% of
 * this page's main-thread work, and it was being used for two lines of static
 * text.
 *
 * This draws the text into a canvas once and shows it on a sprite. A sprite is
 * always camera-facing by construction, and with sizeAttenuation off it holds
 * a constant on-screen size as the camera moves — which is exactly the HUD
 * behaviour the drei version had with no distanceFactor.
 *
 * ACCESSIBILITY NOTE
 * This text is decorative duplication. Every project name and its state also
 * exist as real DOM in the Projects section, which is what screen readers and
 * search engines read. Nothing here is the only source of any information —
 * that rule matters more than the bundle saving.
 */

/** Draw the two lines into a canvas at a fixed, generous resolution. */
function drawLabel(title, status, statusColor) {
  const W = 512
  const H = 160
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'

  ctx.font = '700 44px Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillStyle = '#eef0f4'
  ctx.fillText(title, W / 2, 58)

  // Small caps, wide tracking — the same treatment the DOM labels use, drawn
  // by hand because canvas has no letter-spacing property.
  ctx.font = '500 20px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = statusColor
  const tracking = 5
  const chars = [...status]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1)
  let x = W / 2 - total / 2
  chars.forEach((c, i) => {
    ctx.fillText(c, x + widths[i] / 2, 104)
    x += widths[i] + tracking
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  return tex
}

export default function Label3D({ position = [0, 0, 0], title, status, statusColor = '#a7aebd', scale = 1 }) {
  const spriteRef = useRef()

  const texture = useMemo(
    () => drawLabel(title, status, statusColor),
    [title, status, statusColor]
  )

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite
      ref={spriteRef}
      position={position}
      // Matches the canvas aspect (512x160) so the text is never stretched.
      scale={[1.6 * scale, 0.5 * scale, 1]}
      renderOrder={20}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
        sizeAttenuation={false}
        toneMapped={false}
      />
    </sprite>
  )
}
