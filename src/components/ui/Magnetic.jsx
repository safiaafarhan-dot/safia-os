import React, { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const SPRING = { stiffness: 220, damping: 18, mass: 0.5 }

/**
 * Magnetic hover: the element drifts toward the cursor and springs back.
 * Deliberately restrained — `strength` caps the pull at a few pixels so it
 * reads as weight, not as the element chasing the pointer.
 *
 * Pointer-coarse devices and reduced-motion users get a plain wrapper.
 */
export const Magnetic = ({ children, strength = 0.28, className, ...rest }) => {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, SPRING)
  const springY = useSpring(y, SPRING)

  const canHover =
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

  if (reducedMotion || !canHover) {
    return <div className={className} {...rest}>{children}</div>
  }

  const handleMove = (e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength)
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength)
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Subtle 3D tilt toward the pointer. Used on panels that should feel like
 * physical objects rather than flat cards.
 */
export const Tilt = ({ children, className, max = 6, ...rest }) => {
  const ref = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, SPRING)
  const sy = useSpring(py, SPRING)

  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max])
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max])

  const canHover =
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

  if (reducedMotion || !canHover) {
    return <div className={className} {...rest}>{children}</div>
  }

  const handleMove = (e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width - 0.5)
    py.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  const reset = () => {
    px.set(0)
    py.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export default Magnetic
