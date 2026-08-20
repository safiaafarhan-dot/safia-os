import React, { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWorldStore } from '../state/worldStore'
import { useScrollStore } from '../state/scrollStore'
import { STATIONS } from '../world/stations'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const LABELS = {
  hero: 'CORE',
  about: 'IDENTITY',
  skills: 'CAPABILITY',
  experience: 'RECORD',
  projects: 'ARCHIVE',
  ailab: 'LABORATORY',
  achievements: 'HONOURS',
  contact: 'UPLINK',
}

/**
 * Depth readout.
 *
 * Written straight to the DOM from a rAF loop rather than through React state:
 * this number changes every frame, and putting it through a re-render would
 * make a decorative counter the most expensive component on the page.
 */
const DepthMeter = () => {
  const ref = useRef(null)

  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const el = ref.current
      if (el) {
        const { station } = useScrollStore.getState()
        const text = `${(station * 44).toFixed(1).padStart(6, '0')}m`
        // Only touch the DOM when the rendered text actually changes.
        if (text !== last) {
          el.textContent = text
          last = text
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <span ref={ref} className="tabular-nums">000.0m</span>
}

const WorldHUD = () => {
  const activeStation = useWorldStore((s) => s.activeStation)
  const hovered = useWorldStore((s) => s.hovered)
  const worldReady = useWorldStore((s) => s.worldReady)
  const reducedMotion = usePrefersReducedMotion()

  const station = STATIONS[activeStation] ?? STATIONS[0]

  return (
    <>
      {/* Position in the world. Sits opposite the voice control. */}
      <div className="fixed bottom-6 right-6 z-[70] pointer-events-none hidden md:flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.28em] text-silver/70">
          <span
            className={`w-1 h-1 rounded-full ${worldReady ? 'bg-crimson' : 'bg-metal'}`}
          />
          <span>{worldReady ? 'WORLD ONLINE' : 'WORLD STANDBY'}</span>
        </div>
        <div className="flex items-center gap-2.5 font-mono text-[9px] tracking-[0.22em] text-titanium">
          <span className="text-off-white/80">
            {String(activeStation + 1).padStart(2, '0')}/{String(STATIONS.length).padStart(2, '0')}
          </span>
          <span className="w-px h-3 bg-metal/50" />
          <span>{LABELS[station.id] ?? station.id.toUpperCase()}</span>
          <span className="w-px h-3 bg-metal/50" />
          <DepthMeter />
        </div>
      </div>

      {/* Object identification. Only appears when the cursor is genuinely over
          something in the world, so it reads as the system detecting a target. */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key={hovered.id}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] pointer-events-none hidden md:block"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="w-16 h-px bg-gradient-to-r from-transparent via-crimson to-transparent" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-crimson-text">
                {hovered.label}
              </span>
              <span className="font-mono text-[8px] tracking-[0.25em] text-silver/60">
                DRAG TO ROTATE · CLICK TO CHARGE
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default WorldHUD
