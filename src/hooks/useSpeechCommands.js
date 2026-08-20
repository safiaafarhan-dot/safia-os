import { useCallback, useEffect, useRef } from 'react'
import { useWorldStore } from '../state/worldStore'
import { pulseEnergy } from '../state/scrollStore'
import { matchCommand } from '../lib/voiceCommands'

/**
 * Explicit, opt-in voice control.
 *
 * The microphone is NEVER opened on load, on hover, or on scroll. It opens only
 * when `start()` is called from a real click, and it closes on an explicit
 * stop, on a "stop listening" command, after a silence timeout, when the tab is
 * hidden, and on unmount. Every one of those paths releases the MediaStream
 * tracks — leaving them live is what keeps a browser's recording indicator lit
 * after the visitor thinks they've turned it off.
 *
 * Two audio consumers run at once and they are independent on purpose:
 *  - SpeechRecognition, which owns transcription.
 *  - A getUserMedia stream feeding an AnalyserNode, purely for the waveform.
 * SpeechRecognition exposes no amplitude data, so a visual "it is hearing you"
 * signal is impossible without the second stream.
 */

const SILENCE_TIMEOUT_MS = 12000

const getRecognition = () => {
  if (typeof window === 'undefined') return null
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export const isSpeechSupported = () =>
  typeof window !== 'undefined' &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition) &&
  !!navigator.mediaDevices?.getUserMedia

export function useSpeechCommands({ onCommand }) {
  const recognitionRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(0)
  const silenceTimer = useRef(null)
  const manualStop = useRef(false)
  const lastFired = useRef({ id: null, at: 0 })

  const setMicState = useWorldStore((s) => s.setMicState)
  const setTranscript = useWorldStore((s) => s.setTranscript)
  const setLastCommand = useWorldStore((s) => s.setLastCommand)
  const setAmplitude = useWorldStore((s) => s.setAmplitude)

  const onCommandRef = useRef(onCommand)
  useEffect(() => {
    onCommandRef.current = onCommand
  }, [onCommand])

  /** Tear down every audio resource. Safe to call repeatedly. */
  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(silenceTimer.current)

    if (recognitionRef.current) {
      const r = recognitionRef.current
      recognitionRef.current = null
      // Detach handlers before aborting: onend would otherwise fire during
      // teardown and restart the session we are trying to close.
      r.onresult = null
      r.onerror = null
      r.onend = null
      try {
        r.abort()
      } catch {
        /* already stopped */
      }
    }

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null

    setAmplitude(0)
  }, [setAmplitude])

  const stop = useCallback(
    (reason = 'off') => {
      manualStop.current = true
      teardown()
      setMicState(reason === 'denied' ? 'denied' : 'off')
      setTranscript('')
    },
    [teardown, setMicState, setTranscript]
  )

  const armSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimer.current)
    silenceTimer.current = setTimeout(() => stop('off'), SILENCE_TIMEOUT_MS)
  }, [stop])

  const start = useCallback(async () => {
    if (!isSpeechSupported()) {
      setMicState('unsupported')
      return
    }
    if (recognitionRef.current) return

    manualStop.current = false
    setMicState('starting')
    setTranscript('')
    setLastCommand(null)

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicState('denied')
      return
    }

    // The visitor may have hit stop while the permission prompt was open.
    if (manualStop.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    streamRef.current = stream

    /* ---- amplitude, for the waveform ---- */
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      let frame = 0
      const sample = () => {
        if (!audioCtxRef.current) return
        frame += 1
        // ~20Hz is plenty for a waveform a human is watching, and it keeps this
        // out of the render path of the 60fps world.
        if (frame % 3 === 0) {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (let i = 0; i < data.length; i++) {
            peak = Math.max(peak, Math.abs(data[i] - 128) / 128)
          }
          setAmplitude(Math.min(1, peak * 1.8))
        }
        rafRef.current = requestAnimationFrame(sample)
      }
      rafRef.current = requestAnimationFrame(sample)
    } catch {
      /* Waveform is a nicety — transcription still works without it. */
    }

    /* ---- transcription ---- */
    const recognition = getRecognition()
    if (!recognition) {
      setMicState('unsupported')
      teardown()
      return
    }

    recognition.lang = navigator.language || 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      armSilenceTimer()

      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) final += result[0].transcript
        else interim += result[0].transcript
      }

      const shown = (final || interim).trim()
      if (shown) setTranscript(shown)

      // Act on finalised speech only. Interim results rewrite themselves
      // mid-phrase, so matching them fires commands the visitor never finished
      // saying — "show projects" would trigger on the word "show".
      if (!final) return

      const hit = matchCommand(final)
      if (!hit) return

      // The recogniser can deliver the same final result twice; don't navigate
      // twice for one utterance.
      const now = Date.now()
      if (hit.command.id === lastFired.current.id && now - lastFired.current.at < 1500) return
      lastFired.current = { id: hit.command.id, at: now }

      setLastCommand(hit.command.say)
      pulseEnergy(0.85)

      if (hit.command.action.type === 'stop') {
        stop('off')
        return
      }
      onCommandRef.current?.(hit.command)
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stop('denied')
      } else if (event.error === 'no-speech') {
        // Benign: onend will restart the session below.
      } else if (event.error === 'audio-capture') {
        stop('denied')
      }
    }

    recognition.onend = () => {
      // Chrome ends the session on its own every so often. Restart only while
      // the visitor still has the mic explicitly on — never spontaneously.
      if (manualStop.current || !recognitionRef.current) return
      try {
        recognition.start()
      } catch {
        stop('off')
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setMicState('listening')
      armSilenceTimer()
    } catch {
      stop('off')
    }
  }, [setMicState, setTranscript, setLastCommand, setAmplitude, teardown, stop, armSilenceTimer])

  // Backgrounding the tab must release the mic — a listening indicator on a tab
  // the visitor has navigated away from is exactly the behaviour to avoid.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && recognitionRef.current) stop('off')
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [stop])

  useEffect(() => teardown, [teardown])

  return { start, stop }
}
