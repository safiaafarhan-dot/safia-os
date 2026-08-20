import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const PHASES = ['point', 'scan', 'initializing', 'core-online', 'wordmark', 'reveal', 'done']

const BootSequence = ({ onComplete }) => {
  const reducedMotion = usePrefersReducedMotion()
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [skipped, setSkipped] = useState(false)

  const phase = PHASES[phaseIndex]

  const timings = useMemo(
    () => (reducedMotion ? [0, 0, 300, 300, 300, 600, 400] : [200, 500, 700, 700, 800, 1000, 700]),
    [reducedMotion]
  )

  // onComplete is recreated by the parent on every render. Holding it in a ref
  // keeps it out of the timer effect's dependencies — otherwise any parent
  // re-render restarts the current phase's timeout, and if renders arrive
  // faster than the phase duration the sequence never advances and the
  // full-screen overlay is left covering the page permanently.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (skipped) return
    if (phase === 'done') {
      onCompleteRef.current()
      return
    }
    const timer = setTimeout(() => {
      setPhaseIndex((i) => Math.min(i + 1, PHASES.length - 1))
    }, timings[phaseIndex])
    return () => clearTimeout(timer)
  }, [phase, phaseIndex, timings, skipped])

  // Failsafe. This overlay sits at z-100 across the whole viewport, so any bug
  // that stalls the sequence hides the entire site. Whatever else happens, it
  // is gone by this deadline.
  useEffect(() => {
    const total = timings.reduce((a, b) => a + b, 0) + 1500
    const bail = setTimeout(() => onCompleteRef.current(), total)
    return () => clearTimeout(bail)
  }, [timings])

  const handleSkip = () => {
    setSkipped(true)
    onComplete()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (skipped) return null

  const showText = phase === 'initializing' || phase === 'core-online' || phase === 'wordmark'
  const text = phase === 'initializing' ? 'SYSTEM INITIALIZING' : phase === 'core-online' ? 'CORE ONLINE' : 'SAFIA.OS'

  return (
    <motion.div
      role="dialog"
      aria-label="SAFIA.OS system boot sequence"
      className="fixed inset-0 z-[100] bg-hero-black flex flex-col items-center justify-center overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {/* scan line */}
      {!reducedMotion && (phase === 'scan' || phase === 'initializing') && (
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-crimson to-transparent"
          initial={{ top: '0%', opacity: 0 }}
          animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        />
      )}

      {/* thin assembling frame lines */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 border border-graphite"
          style={{ width: 1, height: 1, marginLeft: -0.5, marginTop: -0.5 }}
          animate={
            phase === 'wordmark' || phase === 'reveal'
              ? { width: 340, height: 200, marginLeft: -170, marginTop: -100, opacity: [0, 1] }
              : {}
          }
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        {['top-8 left-8', 'top-8 right-8', 'bottom-8 left-8', 'bottom-8 right-8'].map((pos, i) => (
          <motion.div
            key={pos}
            className={`absolute ${pos} w-6 h-6 border-t border-l border-crimson/40`}
            style={{
              borderTopWidth: pos.includes('bottom') ? 0 : 1,
              borderBottomWidth: pos.includes('bottom') ? 1 : 0,
              borderLeftWidth: pos.includes('right') ? 0 : 1,
              borderRightWidth: pos.includes('right') ? 1 : 0,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phaseIndex >= 1 ? 1 : 0 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          />
        ))}
      </div>

      {/* central point / core */}
      <div className="relative flex items-center justify-center" style={{ width: 12, height: 12 }}>
        <motion.div
          className="absolute rounded-full bg-crimson"
          style={{ width: 6, height: 6 }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        {!reducedMotion && (
          <motion.div
            className="absolute rounded-full bg-crimson/30"
            style={{ width: 40, height: 40 }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        {showText && (
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="absolute mt-24"
          >
            {phase === 'wordmark' ? (
              <span className="font-display text-3xl md:text-5xl tracking-[0.2em] text-off-white">
                {text}
              </span>
            ) : (
              <span className="font-mono text-xs md:text-sm tracking-[0.4em] text-silver">
                {text}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute mt-24 text-center px-4"
          >
            <div className="text-2xl md:text-4xl font-display tracking-wide text-off-white mb-3">
              SAFIA FARHAN
            </div>
            <div className="font-mono text-[10px] md:text-xs tracking-[0.35em] text-crimson-text">
              AI/ML FULL-STACK ENGINEER
            </div>
            <div className="font-mono text-[10px] md:text-xs tracking-[0.35em] text-silver/75 mt-1">
              DATA ANALYST
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleSkip}
        className="absolute bottom-8 right-8 font-mono text-[10px] tracking-[0.3em] text-silver/75 hover:text-crimson-text transition-colors interactive"
      >
        SKIP →
      </button>
    </motion.div>
  )
}

export default BootSequence
