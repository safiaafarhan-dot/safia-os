import { create } from 'zustand'

/**
 * Reactive counterpart to scrollStore.
 *
 * Everything here is allowed to re-render React, so only put things that change
 * at human speed — never per frame. Station index is written by the driver but
 * only when the integer actually changes, so the HUD re-renders ~8 times across
 * the whole page rather than 60 times a second.
 */
export const useWorldStore = create((set) => ({
  /** Integer index of the station the camera is closest to. */
  activeStation: 0,
  setActiveStation: (activeStation) =>
    set((s) => (s.activeStation === activeStation ? s : { activeStation })),

  /** Has the WebGL world finished mounting? Drives the CSS backdrop handoff. */
  worldReady: false,
  setWorldReady: (worldReady) => set({ worldReady }),

  /** id of the 3D object under the cursor, or null. */
  hovered: null,
  setHovered: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),

  /** Voice subsystem: 'off' | 'starting' | 'listening' | 'denied' | 'unsupported'. */
  micState: 'off',
  setMicState: (micState) => set({ micState }),
  /** Live (interim) transcript shown while the visitor is still speaking. */
  transcript: '',
  setTranscript: (transcript) => set({ transcript }),
  /** Last command the parser actually matched, for the recognition readout. */
  lastCommand: null,
  setLastCommand: (lastCommand) => set({ lastCommand }),
  /** 0..1 microphone amplitude, sampled at ~20fps for the waveform. */
  amplitude: 0,
  setAmplitude: (amplitude) => set({ amplitude }),
}))
