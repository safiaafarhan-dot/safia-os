import { useEffect, useState } from 'react'

/**
 * Defers mounting expensive work until the browser is idle.
 *
 * The hero's WebGL scene is above the fold, so an IntersectionObserver gate
 * would fire immediately and Three.js would still be parsed on the critical
 * path — the largest single block of script evaluation during load. Waiting
 * for idle lets first paint and interactivity land first, then brings the
 * scene in. `timeout` guarantees it mounts even on a permanently busy thread.
 */
export const useIdleMount = ({ enabled = true, timeout = 2000 } = {}) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled || ready) return

    let cancelled = false
    const mount = () => { if (!cancelled) setReady(true) }

    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(mount, { timeout })
      return () => {
        cancelled = true
        cancelIdleCallback?.(handle)
      }
    }

    const t = setTimeout(mount, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [enabled, ready, timeout])

  return ready
}

export default useIdleMount
