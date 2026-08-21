import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/**
 * SAFIA.OS — the operating core of the dimension, assembling itself.
 *
 * The brief asks for the wordmark to gather out of particles and light, hold,
 * and take a controlled energy pulse — while staying "extremely readable" and
 * explicitly NOT becoming a giant glowing gaming logo. Those two halves pull
 * in opposite directions, and every decision here is about which one wins.
 *
 * READABILITY WINS, ALWAYS. So:
 *
 *   - The letters assemble by CONVERGING, not by fading. Each starts offset,
 *     rotated a little and blurred, and settles into place. Blur going to zero
 *     is the whole trick: it reads as fragments resolving into a form, and
 *     unlike a fade it ends at a perfectly crisp letter with no residue.
 *
 *   - The offsets are DETERMINISTIC, not random. A wordmark that lands
 *     differently on every reload is an animation showing off; one that lands
 *     identically is a system booting. The hash below is what makes it the
 *     second thing.
 *
 *   - The pulse is a narrow specular sweep clipped to the glyphs, not a glow
 *     around them. Light travelling THROUGH the letterforms adds no bloom to
 *     the silhouette and does not reduce contrast for a millisecond, which is
 *     what keeps this the opposite of a gaming logo. It runs on a long period
 *     so it is an event you catch rather than a loop you notice.
 *
 *   - Under reduced motion this is a plain <h1>. Not a shortened animation —
 *     none. A wordmark is the one element on the page that must be legible
 *     instantly and unconditionally.
 *
 * ACCESSIBILITY. Split text is invisible to assistive tech as anything but a
 * pile of single characters, so the real string lives in aria-label and every
 * glyph is aria-hidden.
 */

/** Deterministic per-index scatter — same layout every load. See note above. */
const scatter = (i, seed) => {
  const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
  return h - Math.floor(h)
}

const EASE = [0.16, 1, 0.3, 1]

const Wordmark = ({ text = 'SAFIA.OS', accentChar = '.', className = '', delay = 0.2 }) => {
  const reducedMotion = usePrefersReducedMotion()

  const chars = useMemo(() => text.split(''), [text])

  if (reducedMotion) {
    return (
      <h1 className={className}>
        {chars.map((c, i) =>
          c === accentChar ? (
            <span key={i} className="text-crimson-text">{c}</span>
          ) : (
            <span key={i}>{c}</span>
          )
        )}
      </h1>
    )
  }

  return (
    <h1 className={`relative ${className}`} aria-label={text}>
      {/* THE GLYPHS. Each converges from its own offset. */}
      <span className="relative inline-block" aria-hidden="true">
        {chars.map((c, i) => {
          const a = scatter(i, 1)
          const b = scatter(i, 2)
          const d = scatter(i, 3)

          return (
            <motion.span
              key={i}
              className={`inline-block ${c === accentChar ? 'text-crimson-text' : ''}`}
              initial={{
                opacity: 0,
                // Converging from a spread rather than rising as a block: a
                // uniform y-offset is a slide, and a slide is what every
                // other heading on the page already does.
                x: (a - 0.5) * 58,
                y: (b - 0.5) * 46,
                rotate: (d - 0.5) * 22,
                scale: 0.82,
                filter: 'blur(14px)',
              }}
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1,
                filter: 'blur(0px)',
              }}
              transition={{
                duration: 1.15,
                ease: EASE,
                // Stagger is scrambled by the same hash, so the letters do not
                // arrive left-to-right. Sequential arrival reads as typing;
                // scattered arrival reads as parts being drawn together.
                delay: delay + a * 0.42,
              }}
            >
              {/* A space collapses to zero width as an inline-block. */}
              {c === ' ' ? ' ' : c}
            </motion.span>
          )
        })}
      </span>

      {/* THE ENERGY PULSE. A copy of the wordmark whose only job is to carry a
          moving specular band, clipped to the glyphs and composited additively
          over them. It is pure highlight — it never darkens a stroke, so
          contrast at the worst moment of the sweep is identical to contrast at
          rest. */}
      <motion.span
        aria-hidden="true"
        className="wordmark-pulse absolute inset-0 pointer-events-none select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        // Held until the letters have actually landed. A pulse through a form
        // that has not finished assembling reads as a glitch.
        transition={{ delay: delay + 1.5, duration: 0.6 }}
      >
        {chars.map((c, i) => (
          <span key={i} className="inline-block">
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </motion.span>
    </h1>
  )
}

export default Wordmark
