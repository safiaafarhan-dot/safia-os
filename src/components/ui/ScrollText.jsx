import React, { useEffect, useMemo, useRef } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/**
 * TEXT THAT RESOLVES AS YOU SCROLL THROUGH IT.
 *
 * Characters run from barely-there to fully lit, left to right, driven by the
 * paragraph's own progress through the viewport rather than by a timer. Reading
 * it and revealing it become the same gesture — which is the difference between
 * a paragraph that animates at you and one you feel yourself developing.
 *
 * READABILITY WINS, ALWAYS. The floor is 0.28, not 0. Text that starts at zero
 * is text that is missing, and a visitor who lands mid-paragraph or scrolls
 * fast is entitled to read it immediately. What changes is emphasis, not
 * presence.
 *
 * ONE LISTENER, ONE LOOP, DIRECT STYLE WRITES.
 *
 * The obvious implementation gives every character its own scroll-linked
 * animated value. For a 240-character paragraph that is 240 subscriptions and
 * 240 interpolations a frame, per paragraph — exactly the "hundreds of
 * independent DOM animations" this project refuses elsewhere, and it is
 * measurably worse for an effect the eye reads as one gradient sweeping across
 * a line. Instead: one passive scroll listener for the whole paragraph, one rAF
 * that writes `opacity` (a compositor property — no layout, no paint) straight
 * onto the spans, and it parks itself the moment the paragraph is fully
 * resolved or fully off-screen.
 *
 * Words are kept whole. Splitting a paragraph into loose characters lets the
 * browser wrap mid-word, so the text reflows into nonsense at narrow widths —
 * each word is its own inline-block, and only the characters inside it are
 * individually lit.
 *
 * The full string stays on the container as its accessible name and every
 * fragment is hidden from assistive tech, so this is one paragraph to a screen
 * reader rather than 240 announcements.
 */

/** Progress of an element through the viewport, matching 'start 0.8'..'end 0.2'. */
const progressOf = (rect, vh) => {
  const start = vh * 0.8
  const end = vh * 0.2
  const travelled = start - rect.top
  const total = start - end + rect.height
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, travelled / total))
}

const FLOOR = 0.28

const ScrollText = ({ children, className = '', as: Tag = 'p', ...rest }) => {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()
  const text = typeof children === 'string' ? children : String(children ?? '')

  // Split once. Words hold their characters so wrapping stays sane.
  const words = useMemo(() => text.split(' '), [text])

  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion) return
    if (typeof window === 'undefined') return

    const chars = Array.from(root.querySelectorAll('[data-sc]'))
    if (chars.length === 0) return

    let raf = 0
    let last = -1

    const paint = () => {
      raf = 0
      const rect = root.getBoundingClientRect()
      const vh = window.innerHeight || 1
      // Off-screen in either direction: settle to an end state and stop.
      const p = progressOf(rect, vh)
      if (p === last) return
      last = p

      // The lit edge runs a little past the end so the final characters do
      // reach full strength before the paragraph leaves the window.
      const head = p * (chars.length + chars.length * 0.35)
      for (let i = 0; i < chars.length; i++) {
        const local = head - i
        const lit = local <= 0 ? 0 : local >= 1 ? 1 : local
        chars[i].style.opacity = String(FLOOR + (1 - FLOOR) * lit)
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reducedMotion, text])

  if (reducedMotion) {
    return <Tag className={className} {...rest}>{text}</Tag>
  }

  return (
    <Tag ref={ref} className={className} aria-label={text} {...rest}>
      {words.map((word, w) => (
        <span key={`w${w}-${word}`} aria-hidden="true" className="inline-block whitespace-pre">
          {Array.from(word).map((ch, c) => (
            <span key={`c${w}-${c}`} data-sc style={{ opacity: FLOOR, willChange: 'opacity' }}>
              {ch}
            </span>
          ))}
          {w < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}

export default ScrollText
