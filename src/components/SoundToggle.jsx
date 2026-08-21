import React, { useCallback, useEffect, useState } from 'react'
import { disableAudio, enableAudio, playReassemble } from '../lib/crackAudio'
import { startAmbience, stopAmbience } from '../lib/ambience'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const PREF_KEY = 'safia-os-sound'

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
 * this button's icon landed on top of the mic's "MIC OFF" label. That is a
 * constraint of the LABELLED layout only; once the labels go on mobile the
 * three controls sit in one row without touching.
 *
 * ON A PHONE IT IS NOT A LABEL, IT IS AN ICON. The spatial-label styling works
 * on a wide screen because the reading column leaves a bottom-left gutter for
 * it to live in; at 390px there is no gutter, the column is the whole screen,
 * and the bare label printed straight over the hero's CONNECT WITH ME button —
 * unreadable in both directions, and stealing taps from the CTA underneath it
 * because this sits at z-80. Below `sm` the text drops (the aria-label already
 * carries the meaning), the icon gains a backdrop so it reads against whatever
 * scrolls past, and it moves to the bottom-right corner that WorldHUD leaves
 * empty on mobile — the CTAs are full-width, so the corner is the only place
 * on the screen that is reliably not a control.
 */
const SoundToggle = () => {
  const reducedMotion = usePrefersReducedMotion()
  const [on, setOn] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const toggle = useCallback(async () => {
    if (on) {
      stopAmbience()
      disableAudio()
      setOn(false)
      try { localStorage.setItem(PREF_KEY, 'off') } catch { /* private mode */ }
      return
    }
    const ok = await enableAudio()
    if (!ok) {
      // Never claim it worked when it did not.
      setUnavailable(true)
      return
    }
    setOn(true)
    try { localStorage.setItem(PREF_KEY, 'on') } catch { /* private mode */ }
    // Immediate confirmation that sound is live, using the gentlest cue in the
    // set. A silent toggle leaves the visitor unsure whether it did anything.
    playReassemble(0.8)
    // The continuous bed under the events — see ambience.js.
    startAmbience()
  }, [on])

  /**
   * THE PREFERENCE IS REMEMBERED, BUT IT IS NEVER ACTED ON BY ITSELF.
   *
   * A stored "on" cannot legitimately start audio at load: no gesture has
   * happened yet, so the browser suspends the context and the page ends up
   * holding a silent AudioContext it never asked permission for — the exact
   * state crackAudio's whole design avoids. Instead the preference ARMS the
   * toggle, and the very next real interaction anywhere on the page — a click,
   * a key, a touch — completes it.
   *
   * That is both correct and what a returning visitor actually wants: they
   * asked for sound last time, they get it as soon as they touch anything,
   * and a visitor who only ever reads gets silence.
   */
  useEffect(() => {
    if (reducedMotion) return
    let stored = null
    try { stored = localStorage.getItem(PREF_KEY) } catch { /* private mode */ }
    if (stored !== 'on') return

    let done = false
    const arm = async () => {
      if (done) return
      done = true
      detach()
      const ok = await enableAudio()
      if (!ok) return
      setOn(true)
      startAmbience()
    }
    const detach = () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      window.removeEventListener('touchstart', arm)
    }
    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    window.addEventListener('touchstart', arm, { once: true, passive: true })
    return detach
  }, [reducedMotion])

  useEffect(() => () => { stopAmbience(); disableAudio() }, [])

  if (reducedMotion) return null

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Disable world audio' : 'Enable world audio'}
      className="interactive group fixed bottom-4 right-[6.75rem] left-auto sm:bottom-[4.75rem] sm:left-6 sm:right-auto z-[80] flex items-center gap-2.5 focus-visible:outline-none"
    >
      <span
        className={`flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[#7fd8ff] ${
          on
            ? 'border-[#7fd8ff]/60 bg-[#7fd8ff]/12'
            : 'border-white/12 bg-graphite/80 sm:bg-white/[0.03] group-hover:border-white/25'
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
        className={`hidden sm:inline font-mono text-[9px] tracking-[0.3em] transition-colors duration-200 ${
          on ? 'text-[#9de6ff]' : 'text-silver/60 group-hover:text-silver/85'
        }`}
      >
        {unavailable ? 'NO AUDIO' : on ? 'SOUND ON' : 'SOUND OFF'}
      </span>
    </button>
  )
}

export default SoundToggle
