import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorldStore } from '../state/worldStore'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useSpeechCommands, isSpeechSupported } from '../hooks/useSpeechCommands'
import { matchCommand, COMMAND_HINTS } from '../lib/voiceCommands'
import { socials } from '../data'

const BAR_COUNT = 13

/**
 * Live input level.
 *
 * Isolated into its own component so the ~20Hz amplitude updates re-render
 * thirteen bars and nothing else — subscribing the whole panel to amplitude
 * would re-render the transcript and command list twenty times a second.
 */
const Waveform = ({ active }) => {
  const amplitude = useWorldStore((s) => s.amplitude)

  // Fixed per-bar weighting gives the meter a natural centre-weighted shape
  // rather than a flat block that grows and shrinks as one.
  const weights = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => 0.35 + Math.sin((i / (BAR_COUNT - 1)) * Math.PI) * 0.65),
    []
  )

  return (
    <div className="flex items-center gap-[3px] h-6" aria-hidden="true">
      {weights.map((w, i) => {
        const h = active ? Math.max(2, amplitude * 22 * w + (i % 3) * 1.5) : 2
        return (
          <span
            key={i}
            className={`w-[2px] rounded-full transition-[height,background-color] duration-75 ${
              active ? 'bg-crimson-text' : 'bg-metal'
            }`}
            style={{ height: `${h}px` }}
          />
        )
      })}
    </div>
  )
}

const STATUS_COPY = {
  off: 'MIC OFF',
  starting: 'REQUESTING MIC…',
  listening: 'LISTENING…',
  denied: 'MIC BLOCKED',
  unsupported: 'VOICE UNAVAILABLE',
}

const VoiceControl = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const reducedMotion = usePrefersReducedMotion()

  const micState = useWorldStore((s) => s.micState)
  const transcript = useWorldStore((s) => s.transcript)
  const lastCommand = useWorldStore((s) => s.lastCommand)
  const setLastCommand = useWorldStore((s) => s.setLastCommand)

  const [expanded, setExpanded] = useState(false)
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState('')
  const [supported] = useState(() => isSpeechSupported())
  const panelRef = useRef(null)

  const listening = micState === 'listening' || micState === 'starting'

  /** Scroll to a section, returning to the home route first if needed. */
  const goToSection = useCallback(
    (id) => {
      const behavior = reducedMotion ? 'auto' : 'smooth'
      const scrollWhenReady = (attemptsLeft) => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior })
          return
        }
        if (attemptsLeft > 0) requestAnimationFrame(() => scrollWhenReady(attemptsLeft - 1))
      }

      if (location.pathname !== '/') {
        navigate('/')
        scrollWhenReady(90)
      } else {
        scrollWhenReady(5)
      }
    },
    [location.pathname, navigate, reducedMotion]
  )

  const runCommand = useCallback(
    (command) => {
      const { action } = command
      switch (action.type) {
        case 'section':
          goToSection(action.target)
          break
        case 'back':
          navigate(-1)
          break
        case 'social': {
          const social = socials.find((s) => s.icon === action.target)
          if (social) window.open(social.url, '_blank', 'noopener,noreferrer')
          break
        }
        case 'palette':
          window.dispatchEvent(new Event('safia:command-center'))
          break
        default:
          break
      }
    },
    [goToSection, navigate]
  )

  const { start, stop } = useSpeechCommands({ onCommand: runCommand })

  const toggleMic = () => {
    if (listening) stop()
    else {
      setExpanded(true)
      start()
    }
  }

  // Honour a request from elsewhere in the page (the About and Skills
  // transcription panels). Keeping the mic owned in one place is what stops
  // two recognisers fighting over the device.
  const micRequest = useWorldStore((s) => s.micRequest)
  useEffect(() => {
    if (micRequest === 0) return
    setExpanded(true)
    start()
    // `start` is stable and intentionally excluded: re-running this on every
    // identity change would re-open the microphone without the visitor asking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micRequest])

  // Clear the recognition readout a moment after it lands, so the panel does
  // not keep displaying a command from a minute ago as if it were current.
  useEffect(() => {
    if (!lastCommand) return
    const t = setTimeout(() => setLastCommand(null), 2600)
    return () => clearTimeout(t)
  }, [lastCommand, setLastCommand])

  const submitTyped = (e) => {
    e.preventDefault()
    const hit = matchCommand(typed)
    if (!hit) {
      setTypedError('NO MATCHING COMMAND')
      return
    }
    setTypedError('')
    setLastCommand(hit.command.say)
    setTyped('')
    if (hit.command.action.type === 'stop') {
      stop()
      return
    }
    runCommand(hit.command)
  }

  // Voice is a genuine convenience for some visitors and a privacy concern for
  // others, so the surface stays a single small control until it is opened.
  return (
    /* Bottom-left on a wide screen, where the reading column leaves a gutter.
       At phone width the column IS the screen, so this cluster moves to the
       bottom-right corner WorldHUD vacates on mobile and loses its text — the
       status label printed over whatever section was scrolling past, and the
       cluster sat on top of the hero's full-width CTAs. */
    <div className="fixed bottom-4 right-4 left-auto sm:bottom-6 sm:left-6 sm:right-auto z-[80] flex flex-col items-end sm:items-start gap-3">
      <AnimatePresence>
        {expanded && (
          <motion.div
            ref={panelRef}
            initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-[min(88vw,20rem)] bg-graphite/95 border border-metal/40 rounded-sm shadow-ui overflow-hidden backdrop-blur-sm"
          >
            <div className="h-px bg-gradient-to-r from-transparent via-crimson to-transparent" />

            <div className="px-4 py-3 border-b border-metal/25 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] tracking-[0.3em] text-silver/75">
                VOICE CONTROL
              </span>
              <button
                onClick={() => {
                  if (listening) stop()
                  setExpanded(false)
                }}
                className="interactive font-mono text-[9px] tracking-[0.2em] text-silver/75 hover:text-crimson-text transition-colors"
              >
                CLOSE
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Status + live level */}
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`font-mono text-[10px] tracking-[0.25em] ${
                    micState === 'listening'
                      ? 'text-crimson-text'
                      : micState === 'denied' || micState === 'unsupported'
                        ? 'text-titanium'
                        : 'text-silver'
                  }`}
                >
                  {STATUS_COPY[micState]}
                </span>
                <Waveform active={micState === 'listening'} />
              </div>

              {/* Live transcription. aria-live so it is announced, not just seen. */}
              <div
                className="min-h-[3.25rem] bg-hero-black/60 border border-metal/25 rounded-sm px-3 py-2"
                aria-live="polite"
                aria-atomic="false"
              >
                {transcript ? (
                  <p className="text-sm text-off-white leading-snug">
                    <span className="font-mono text-[9px] tracking-[0.2em] text-crimson-text mr-2">
                      USER:
                    </span>
                    {transcript}
                  </p>
                ) : (
                  <p className="font-mono text-[10px] tracking-[0.2em] text-silver/60">
                    {micState === 'listening' ? 'AWAITING SPEECH…' : 'NO INPUT'}
                  </p>
                )}
              </div>

              <AnimatePresence>
                {lastCommand && (
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-crimson-text"
                  >
                    <span className="w-1 h-1 rounded-full bg-crimson" />
                    RECOGNISED · {lastCommand}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Typed control. Always available — it is the fallback when the
                  browser has no speech API or the mic was blocked, and it is
                  also simply the quieter way to drive the system. */}
              <form onSubmit={submitTyped} className="pt-1">
                <label
                  htmlFor="voice-typed-command"
                  className="block font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-1.5"
                >
                  {supported ? 'OR TYPE A COMMAND' : 'TYPE A COMMAND'}
                </label>
                <div className="flex items-center gap-2 bg-hero-black/60 border border-metal/30 focus-within:border-crimson/45 rounded-sm px-3 py-2 transition-colors">
                  <span className="font-mono text-crimson-text text-xs shrink-0">&gt;</span>
                  <input
                    id="voice-typed-command"
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value)
                      setTypedError('')
                    }}
                    placeholder="show projects"
                    autoComplete="off"
                    spellCheck="false"
                    className="no-focus-ring flex-1 min-w-0 bg-transparent border-0 outline-none text-off-white font-mono text-xs tracking-[0.06em] placeholder:text-silver/50"
                  />
                </div>
                {typedError && (
                  <p className="mt-1.5 font-mono text-[9px] tracking-[0.2em] text-titanium">
                    {typedError}
                  </p>
                )}
              </form>

              <div className="pt-1">
                <p className="font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-1.5">
                  TRY
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {COMMAND_HINTS.map((hint) => (
                    <li key={hint}>
                      <button
                        type="button"
                        onClick={() => {
                          const hit = matchCommand(hint)
                          if (hit) {
                            setLastCommand(hit.command.say)
                            runCommand(hit.command)
                          }
                        }}
                        className="interactive font-mono text-[9px] tracking-[0.12em] text-titanium hover:text-off-white border border-metal/30 hover:border-crimson/45 rounded-sm px-2 py-1 transition-colors"
                      >
                        {hint}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {micState === 'denied' && (
                <p className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-titanium">
                  MICROPHONE ACCESS WAS BLOCKED. ALLOW IT IN YOUR BROWSER'S SITE
                  SETTINGS, OR USE THE TYPED COMMAND ABOVE.
                </p>
              )}
              {micState === 'unsupported' && (
                <p className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-titanium">
                  THIS BROWSER HAS NO SPEECH RECOGNITION API. TYPED COMMANDS WORK
                  EVERYWHERE.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleMic}
          disabled={!supported && micState !== 'listening'}
          aria-pressed={micState === 'listening'}
          aria-label={
            supported
              ? micState === 'listening'
                ? 'Stop voice control and release the microphone'
                : 'Activate voice control microphone'
              : 'Voice control unavailable in this browser'
          }
          className={`interactive relative grid place-items-center w-11 h-11 rounded-full border transition-colors ${
            micState === 'listening'
              ? 'border-crimson bg-crimson/15'
              : 'border-metal/45 bg-graphite/80 hover:border-crimson/50'
          } ${!supported ? 'opacity-45 cursor-not-allowed' : ''}`}
        >
          {/* Pulsing ring is shown ONLY while the mic is genuinely open, so the
              indicator can always be trusted. */}
          {micState === 'listening' && !reducedMotion && (
            <span className="absolute inset-0 rounded-full border border-crimson animate-ping opacity-40" />
          )}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="9" y="2" width="6" height="12" rx="3"
              stroke={micState === 'listening' ? '#e6455e' : '#a8a8ad'}
              strokeWidth="1.6"
            />
            <path
              d="M5 11a7 7 0 0 0 14 0M12 18v4"
              stroke={micState === 'listening' ? '#e6455e' : '#a8a8ad'}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {!supported && <path d="M4 4l16 16" stroke="#8a8a90" strokeWidth="1.6" strokeLinecap="round" />}
          </svg>
        </button>

        {/* The panel has to stay reachable on a phone, so the status text
            becomes a real 44px icon target below `sm` rather than simply
            disappearing with the rest of the labels. */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="interactive grid sm:block place-items-center w-11 h-11 sm:w-auto sm:h-auto rounded-full sm:rounded-none border sm:border-0 border-metal/45 bg-graphite/80 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none font-mono text-[9px] tracking-[0.25em] text-silver/75 hover:text-crimson-text transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide voice control panel' : 'Show voice control panel'}
        >
          <span className="hidden sm:inline">{expanded ? 'HIDE' : STATUS_COPY[micState]}</span>
          <svg
            className="sm:hidden"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d={expanded ? 'M3.5 8.5L7 5l3.5 3.5' : 'M3.5 5.5L7 9l3.5-3.5'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default VoiceControl
