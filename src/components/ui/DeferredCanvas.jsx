import React, { useRef, useState, useEffect } from 'react'

/**
 * Holds back an expensive WebGL scene until its container is near the viewport.
 *
 * Without this, every lazy() canvas in the tree mounts on page load, so Three.js
 * downloads, parses and creates a GL context for sections the visitor may never
 * reach — the single largest contributor to blocking time on first paint.
 *
 * `rootMargin` starts the work slightly before the section is reached so the
 * scene is ready by the time it is actually on screen.
 */
const DeferredCanvas = ({ children, fallback = null, rootMargin = '300px', className }) => {
  const ref = useRef(null)
  const [shouldMount, setShouldMount] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || shouldMount) return

    // No IntersectionObserver (very old browsers): mount rather than show nothing.
    if (typeof IntersectionObserver === 'undefined') {
      setShouldMount(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldMount(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, shouldMount])

  return (
    <div ref={ref} className={className}>
      {shouldMount ? children : fallback}
    </div>
  )
}

export default DeferredCanvas
