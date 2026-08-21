import React, { useCallback, useEffect, useState } from 'react'
import { disableAudio, enableAudio, playReassemble } from '../lib/crackAudio'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

/**
 * Opt-in control for the world's audio layer.
 *
 * MUTED IS THE DEFAULT AND THE ONLY HONEST ONE. Nothing here constructs an
 * AudioContext until this button is pressed — see crackAudio — so a visitor who
 * never touches it has a page that has made no sound and holds no audio
 * resources. Enabling happens inside the click handler because that is the user
 * gesture the browser's autoplay policy requires; doing it any other way gets a
 * suspended context and silent failures.
 *
 * Hidden entirely under reduced motion. Sharp transients are a startle problem
 * as much as a motion one, and a visitor asking for calm should not be offered
 * a glass shatter.
 *
 * Deliberately styled as a spatial label rather than a chrome button, to match
 * the mic control, and STACKED ABOVE it rather than beside it — side by side,
 * this button's icon landed on top of the mic's "MIC OFF" label.
 */
const SoundToggle = () => {
  const reducedMotion = usePrefersReducedMotion()
  const [on, setOn] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const toggle = useCallback(async () => {
    if (on) {
      disableAudio()
      setOn(false)
      return
    }
    const ok = await enableAudio()
    if (!ok) {
      // Never claim it worked when it did not.
      setUnavailable(true)
      return
    }
    setOn(true)
    // Immediate confirmation that sound is live, using the gentlest cue in the
    // set. A silent toggle leaves the visitor unsure whether it did anything.
    playReassemble(0.8)
  }, [on])

  useEffect(() => () => disableAudio(), [])

  if (reducedMotion) return null

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Disable world audio' : 'Enable world audio'}
      className="interactive group fixed bottom-[4.75rem] left-6 z-[80] flex items-center gap-2.5 focus-visible:outline-none"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[#7fd8ff] ${
          on
            ? 'border-[#7fd8ff]/60 bg-[#7fd8ff]/12'
            : 'border-white/12 bg-white/[0.03] group-hover:border-white/25'
        }`}
      >
        {/* Three bars that stand up when sound is on. An icon that changes
            SHAPE rather than only colour stays legible to anyone who cannot
            rely on the colour difference. */}
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none">
          <path
            d={on ? 'M2 5v4M7 2.5v9M12 4v6' : 'M2 6.5v1M7 6.5v1M12 6.5v1'}
            stroke={on ? '#9de6ff' : '#8f96a6'}
            strokeWidth="1.6"
            strokeLinecap="round"
            style={{ transition: 'd 220ms cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
      </span>
      <span
        className={`font-mono text-[9px] tracking-[0.3em] transition-colors duration-200 ${
          on ? 'text-[#9de6ff]' : 'text-silver/60 group-hover:text-silver/85'
        }`}
      >
        {unavailable ? 'NO AUDIO' : on ? 'SOUND ON' : 'SOUND OFF'}
      </span>
    </button>
  )
}

export default SoundToggle
