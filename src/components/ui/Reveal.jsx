import React from 'react'
import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/**
 * Scroll-reveal primitives.
 *
 * Replaces the previous global GSAP query, which ran once at mount and so
 * silently skipped anything rendered later. These are per-element and
 * self-triggering, so conditional content animates too.
 *
 * EASE mirrors --ease-out-expo in index.css so CSS and JS motion match.
 */
const EASE = [0.16, 1, 0.3, 1]

/**
 * Diagnostic: ?revealed=1 renders every reveal in its FINAL state.
 *
 * These are driven by IntersectionObserver, which never fires in a tab that is
 * hidden — and the tab is always hidden under browser automation. The result is
 * a page whose entire text layer sits at opacity 0, so every screenshot of any
 * section shows an empty frame and reads as a catastrophic bug in whatever was
 * actually being tested. Clearing the inline styles by hand does not hold,
 * because the next render re-applies them.
 *
 * This is the same class of switch as ?awake=1 and ?station= in the world
 * driver, and exists for the same reason: the thing being QA'd must be
 * reachable without the harness lying about it. DEV only — it is read through
 * import.meta.env.DEV so it cannot be turned on in production.
 */
const forceRevealed =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('revealed')

const containerVariants = (stagger, delay) => ({
  hidden: {},
  shown: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
})

const itemVariants = (y, duration) => ({
  hidden: { opacity: 0, y },
  shown: { opacity: 1, y: 0, transition: { duration, ease: EASE } },
})

/** A single element that fades and rises once it scrolls into view. */
export const Reveal = ({
  children,
  className,
  delay = 0,
  y = 24,
  duration = 0.7,
  once = true,
  as = 'div',
  ...rest
}) => {
  const reducedMotion = usePrefersReducedMotion()
  const Tag = motion[as] ?? motion.div

  if (reducedMotion || forceRevealed) {
    const Plain = as
    return <Plain className={className} {...rest}>{children}</Plain>
  }

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '0px 0px -12% 0px' }}
      transition={{ duration, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Wraps a set of children so they cascade in rather than appearing together. */
export const RevealGroup = ({
  children,
  className,
  stagger = 0.08,
  delay = 0,
  once = true,
  as = 'div',
  ...rest
}) => {
  const reducedMotion = usePrefersReducedMotion()
  const Tag = motion[as] ?? motion.div

  if (reducedMotion || forceRevealed) {
    const Plain = as
    return <Plain className={className} {...rest}>{children}</Plain>
  }

  return (
    <Tag
      className={className}
      variants={containerVariants(stagger, delay)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once, margin: '0px 0px -10% 0px' }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** A child of RevealGroup. Timing is owned by the parent's stagger. */
export const RevealItem = ({
  children,
  className,
  y = 22,
  duration = 0.6,
  as = 'div',
  ...rest
}) => {
  const reducedMotion = usePrefersReducedMotion()
  const Tag = motion[as] ?? motion.div

  if (reducedMotion || forceRevealed) {
    const Plain = as
    return <Plain className={className} {...rest}>{children}</Plain>
  }

  return (
    <Tag className={className} variants={itemVariants(y, duration)} {...rest}>
      {children}
    </Tag>
  )
}

export default Reveal
