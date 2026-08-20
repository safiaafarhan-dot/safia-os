import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Diagnostic override: ?reduce=1 forces reduced motion on, ?reduce=0 forces it
 * off.
 *
 * This site is motion-heavy enough that the reduced-motion path is a genuine
 * second experience rather than a minor variation, so it has to be testable —
 * and the media query can only otherwise be flipped through an OS accessibility
 * setting, which makes it easy to leave untested and easy to get wrong. A URL
 * flag means anyone can check it in one navigation.
 *
 * The flag is read once. Toggling reduced motion mid-session is not something
 * the OS setting does either, and the world tears down and rebuilds on the
 * change, so a live toggle would be a worse test than a reload.
 */
const override = () => {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('reduce')
  if (v === null) return null
  return v !== '0' && v !== 'false'
}

export const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(() => {
    const forced = override()
    if (forced !== null) return forced
    return typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    // An explicit override wins over the system setting for the whole session.
    if (override() !== null) return
    const mq = window.matchMedia(QUERY)
    const handler = (e) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}
