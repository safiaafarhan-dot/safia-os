import React, { useEffect, useRef, useState } from 'react'
import { useWorldStore } from '../state/worldStore'
import { isSpeechSupported } from '../hooks/useSpeechCommands'
import { COMMAND_HINTS } from '../lib/voiceCommands'

/**
 * Live speech, shown inside the section rather than only in the corner dock.
 *
 * The voice subsystem already produced interim results, a matched command and
 * an amplitude reading, but all of it surfaced in a small floating control most
 * visitors never opened. This puts the same signal into the reading flow of
 * About and Skills, where there is room to actually read it.
 *
 * It owns no audio. VoiceControl is the single microphone owner on the page;
 * this asks for the mic through the store and otherwise only renders state.
 * Two SpeechRecognition instances would compete for the device and both would
 * start dropping results, so that separation is load-bearing, not stylistic.
 *
 * Nothing here fabricates activity: with the mic off it says so and shows what
 * you could say. It never displays an invented transcript.
 */

const STATUS = {
  off: { label: 'STANDBY', tone: 'text-silver/70' },
  starting: { label: 'OPENING MIC', tone: 'text-crimson-text' },
  listening: { label: 'LISTENING', tone: 'text-crimson-text' },
  denied: { label: 'MIC BLOCKED', tone: 'text-silver/70' },
  unsupported: { label: 'UNAVAILABLE', tone: 'text-silver/70' },
}

/**
 * A running amplitude trace.
 *
 * Bars shift left over time instead of all reacting to the current level at
 * once, so the visitor sees the shape of what they just said rather than a row
 * of equaliser bars twitching in unison.
 */
function Waveform({ amplitude, active }) {
  const BARS = 44
  const [bars, setBars] = useState(() => new Array(BARS).fill(0))
  const amplitudeRef = useRef(0)
  amplitudeRef.current = amplitude

  useEffect(() => {
    if (!active) {
      setBars(new Array(BARS).fill(0))
      return undefined
    }
    // 20fps matches the rate the analyser is sampled at; running faster would
    // just duplicate samples and repaint for nothing.
    const id = setInterval(() => {
      setBars((prev) => [...prev.slice(1), amplitudeRef.current])
    }, 50)
    return () => clearInterval(id)
  }, [active])

  return (
    <div className="flex items-end gap-[2px] h-10" aria-hidden="true">
      {bars.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full transition-[height] duration-75 ${
            active ? 'bg-crimson-text/80' : 'bg-metal/40'
          }`}
          style={{ height: `${Math.max(2, v * 38)}px` }}
        />
      ))}
    </div>
  )
}

const LiveTranscription = ({ className = '', hint }) => {
  const micState = useWorldStore((s) => s.micState)
  const transcript = useWorldStore((s) => s.transcript)
  const lastCommand = useWorldStore((s) => s.lastCommand)
  const amplitude = useWorldStore((s) => s.amplitude)
  const requestMic = useWorldStore((s) => s.requestMic)

  const [supported] = useState(() => isSpeechSupported())
  const state = supported ? micState : 'unsupported'
  const active = state === 'listening' || state === 'starting'
  const status = STATUS[state] ?? STATUS.off

  return (
    <div className={`panel hud-corners rounded-sm p-6 md:p-7 ${className}`}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              active ? 'bg-crimson animate-pulse-subtle' : 'bg-metal'
            }`}
          />
          <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">
            LIVE TRANSCRIPTION
          </span>
        </div>
        <span className={`font-mono text-[10px] tracking-[0.3em] ${status.tone}`}>
          {status.label}
        </span>
      </div>

      <Waveform amplitude={amplitude} active={active} />

      {/* The transcript line holds its height whether or not there is text, so
          enabling the mic does not shove the rest of the section down. */}
      <div className="mt-5 min-h-[3.5rem] flex items-center">
        {transcript ? (
          <p className="text-off-white text-lg md:text-xl leading-snug">
            {transcript}
            <span className="inline-block w-[2px] h-5 ml-1 align-middle bg-crimson-text animate-pulse-subtle" />
          </p>
        ) : (
          <p className="text-titanium/60 text-sm">
            {active
              ? 'Listening — speak a command.'
              : hint || 'Enable the microphone to see speech transcribed here in real time.'}
          </p>
        )}
      </div>

      <div className="mt-5 pt-5 border-t border-metal/15 flex flex-wrap items-center gap-3">
        {state === 'unsupported' ? (
          <span className="font-mono text-[10px] tracking-[0.25em] text-silver/60">
            THIS BROWSER HAS NO SPEECH RECOGNITION — USE CTRL&nbsp;K
          </span>
        ) : (
          <button
            type="button"
            onClick={requestMic}
            disabled={active}
            className="chip min-h-11 sm:min-h-0 disabled:opacity-45 disabled:cursor-default"
          >
            {active ? 'MIC LIVE' : 'ENABLE MIC'}
          </button>
        )}

        {lastCommand && (
          <span className="font-mono text-[10px] tracking-[0.3em] text-crimson-text">
            ↳ {lastCommand}
          </span>
        )}

        <div className="flex flex-wrap gap-2 ml-auto">
          {COMMAND_HINTS.slice(0, 3).map((h) => (
            <span
              key={h}
              className="font-mono text-[10px] tracking-[0.2em] text-silver/55"
            >
              “{h}”
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LiveTranscription
