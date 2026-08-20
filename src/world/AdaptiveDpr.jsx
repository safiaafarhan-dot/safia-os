import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Drop resolution before frame rate.
 *
 * Replaces drei's <PerformanceMonitor>. That component is well built, but it
 * was one of four drei imports keeping the entire package in a vendor chunk
 * that measured as 86% of this page's main-thread work — a steep price for an
 * FPS average.
 *
 * The policy is the same one the drei version was configured with: watch a
 * rolling average, and only act after the reading has been consistently bad
 * (or consistently good) for several samples. `flipflops` guards against the
 * pathological case where a machine sits exactly on the boundary and the DPR
 * oscillates forever — after enough reversals it stops adjusting and stays low.
 */
export default function AdaptiveDpr({
  onDecline,
  onIncline,
  declineBelow = 45,
  inclineAbove = 55,
  sampleSize = 40,
  flipflops = 3,
}) {
  const frames = useRef(0)
  const elapsed = useRef(0)
  const declined = useRef(false)
  const flips = useRef(0)
  const locked = useRef(false)

  // Ignore the first stretch entirely: shader compilation and asset decode
  // make the opening second look like a performance problem when it is just
  // start-up. Reacting to it would drop quality on machines that are fine.
  const warmup = useRef(0)

  useEffect(() => {
    frames.current = 0
    elapsed.current = 0
  }, [])

  useFrame((_, delta) => {
    if (locked.current) return

    warmup.current += delta
    if (warmup.current < 2.5) return

    frames.current += 1
    elapsed.current += delta
    if (frames.current < sampleSize) return

    const fps = frames.current / Math.max(elapsed.current, 0.0001)
    frames.current = 0
    elapsed.current = 0

    if (!declined.current && fps < declineBelow) {
      declined.current = true
      flips.current += 1
      onDecline?.()
    } else if (declined.current && fps > inclineAbove) {
      declined.current = false
      flips.current += 1
      onIncline?.()
    }

    // Settled into a loop: stop adjusting and leave it at the safe setting.
    if (flips.current >= flipflops * 2) {
      locked.current = true
      if (!declined.current) {
        declined.current = true
        onDecline?.()
      }
    }
  })

  return null
}
