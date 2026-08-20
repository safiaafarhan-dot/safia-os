import React, { useEffect, useRef } from 'react'

const CustomCursor = () => {
  const cursorRef = useRef(null)

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = e.clientX + 'px'
        cursorRef.current.style.top = e.clientY + 'px'
      }
    }

    const handleMouseEnter = (e) => {
      const target = e.target
      // Capture-phase mouseenter also fires with `document` and text nodes as
      // the target, neither of which has classList — reading it threw on every
      // pointer entry, filling the console with uncaught TypeErrors.
      if (!target || target.nodeType !== 1) return
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.classList.contains('interactive') ||
        target.classList.contains('btn')
      ) {
        if (cursorRef.current) {
          cursorRef.current.classList.add('hover')
        }
      }
    }

    const handleMouseLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.classList.remove('hover')
      }
    }

    // Only enable custom cursor on non-touch devices
    if (!window.matchMedia('(hover: hover)').matches) {
      return
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseenter', handleMouseEnter, true)
    document.addEventListener('mouseleave', handleMouseLeave, true)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseenter', handleMouseEnter, true)
      document.removeEventListener('mouseleave', handleMouseLeave, true)
    }
  }, [])

  return <div ref={cursorRef} className="cursor" />
}

export default CustomCursor
