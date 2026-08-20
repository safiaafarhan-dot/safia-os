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
 * SIZING, AND WHY IT KEPT GOING WRONG
 * With `sizeAttenuation` off, three interprets sprite scale in NORMALISED
 * SCREEN SPACE, not world units — scale.y of 1 means "as tall as the viewport".
 * Every sizing bug here has come from forgetting that: the project labels were
 * once 160% of the viewport wide and covered each other, and the skill labels
 * 224%.
 *
 * The texture is therefore fitted to the text rather than the text to a fixed
 * texture, and the sprite's aspect is derived from the canvas that was actually
 * produced. That leaves exactly one number to choose per caller — `scale`, the
 * fraction of the VIEWPORT HEIGHT the label should occupy — and makes it
 * impossible for a long name to overflow or a short one to float in dead space.
 *
 * ACCESSIBILITY NOTE
 * This text is decorative duplication. Every project name and its state also
 * exist as real DOM in the Projects section, and every skill name in the
 * technology index below the constellation. Nothing here is the only source of
 * any information — that rule matters more than the bundle saving.
 */

const TITLE_FONT = (px) =>
  `700 ${px}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`
const STATUS_FONT = '500 20px ui-monospace, SFMono-Regular, Menlo, monospace'
const STATUS_TRACKING = 5
const PAD_X = 28

/** Width of the status line once hand-tracked. Canvas has no letter-spacing. */
function statusWidth(ctx, status) {
  ctx.font = STATUS_FONT
  const chars = [...status]
  const widths = chars.map((c) => ctx.measureText(c).width)
  return {
    chars,
    widths,
    total: widths.reduce((a, b) => a + b, 0) + STATUS_TRACKING * (chars.length - 1),
  }
}

/** Draw the label into a canvas sized to its own content. */
function drawLabel(title, status, statusColor) {
  const measure = document.createElement('canvas').getContext('2d')

  // Cap the title so a very long name shrinks rather than producing an absurdly
  // wide sprite. "Distracted Driver Detection" used to be clipped at both ends.
  const MAX_TEXT = 620
  let titleSize = 44
  measure.font = TITLE_FONT(titleSize)
  while (measure.measureText(title).width > MAX_TEXT && titleSize > 20) {
    titleSize -= 2
    measure.font = TITLE_FONT(titleSize)
  }
  const titleW = measure.measureText(title).width

  const st = status ? statusWidth(measure, status) : null
  const W = Math.ceil(Math.max(titleW, st ? st.total : 0)) + PAD_X * 2
  const H = status ? 132 : 68

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = TITLE_FONT(titleSize)
  ctx.fillStyle = '#eef0f4'
  ctx.fillText(title, W / 2, status ? 40 : H / 2)

  if (st) {
    ctx.font = STATUS_FONT
    ctx.fillStyle = statusColor
    let x = W / 2 - st.total / 2
    st.chars.forEach((c, i) => {
      ctx.fillText(c, x + st.widths[i] / 2, 92)
      x += st.widths[i] + STATUS_TRACKING
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  return { texture, aspect: W / H }
}

export default function Label3D({
  position = [0, 0, 0],
  title,
  status,
  statusColor = '#a7aebd',
  /** Fraction of the viewport HEIGHT the label should occupy. */
  scale = 0.09,
}) {
  const spriteRef = useRef()

  const { texture, aspect } = useMemo(
    () => drawLabel(title, status, statusColor),
    [title, status, statusColor]
  )

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite
      ref={spriteRef}
      position={position}
      scale={[aspect * scale, scale, 1]}
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
