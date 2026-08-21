import React, { useCallback, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AnimatePresence, motion } from 'framer-motion'

// Components
import BootSequence from './components/BootSequence'
import CommandCenter from './components/CommandCenter'
import Navigation from './components/Navigation'
import CustomCursor from './components/CustomCursor'
import Hero from './sections/Hero'
import About from './sections/About'
import Skills from './sections/Skills'
import Experience from './sections/Experience'
import Projects from './sections/Projects'
import ProjectDetail from './sections/ProjectDetail'
import AILab from './sections/AILab'
import Achievements from './sections/Achievements'
import Contact from './sections/Contact'
import Footer from './components/Footer'
import ScrollProgress from './components/ScrollProgress'
import WorldLayer from './world/WorldLayer'
import WorldHUD from './components/WorldHUD'
import EclipseFlash from './components/EclipseFlash'
import SoundToggle from './components/SoundToggle'
import VoiceControl from './components/VoiceControl'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useWorldStore } from './state/worldStore'

import './App.css'
import './index.css'

const SECTION_IDS = [
  'hero', 'about', 'skills', 'experience',
  'projects', 'ailab', 'achievements', 'contact',
]

/** Route-level transition so navigation reads as one continuous system. */
const Page = ({ children }) => {
  const reducedMotion = usePrefersReducedMotion()
  if (reducedMotion) return <>{children}</>

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

const AnimatedRoutes = () => {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <Page>
              <main>
                <Hero />
                <About />
                <Skills />
                <Experience />
                <Projects />
                <AILab />
                <Achievements />
                <Contact />
                <Footer />
              </main>
            </Page>
          }
        />
        <Route
          path="/project/:id"
          element={
            <Page>
              <ProjectDetail />
            </Page>
          }
        />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  const [activeSection, setActiveSection] = useState('hero')
  const [booted, setBooted] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem('safia-os-booted') === 'true'
  )

  const setBootComplete = useWorldStore((s) => s.setBootComplete)

  useEffect(() => {
    document.body.style.overflow = booted ? '' : 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [booted])

  /**
   * Hand the arrival over to the world.
   *
   * The boot overlay is a point of light in the dark; the world's awakening
   * opens on a point of light in the dark, at depth. They are the same beat,
   * and the only thing keeping them from reading as one continuous event was
   * that the world's half started under the overlay and was half over by the
   * time anyone could see it. The ignition ramp is held at zero until this
   * fires — see worldStore's `bootComplete`.
   *
   * THE TRIGGER IS THE BOOT STATE ITSELF, NOT A TIMER.
   *
   * There is an authoritative answer to "has the overlay finished" — `booted`,
   * which BootSequence sets through its own completion callback and which
   * returning visitors start the session already holding. Waiting out the
   * overlay's exit fade on a setTimeout on top of that would be a second,
   * weaker source of truth for something already known, and it would drift
   * the moment the fade duration changed.
   *
   * The overlap with that fade is not a problem to be waited out anyway — it
   * is the handover. The overlay leaves over 0.5s while the beacon's core
   * comes up between ~0.15s and ~1.3s, so the overlay's point of light
   * cross-dissolves into the world's point of light at depth. One light, two
   * renderings of it, and no frame where neither is on screen.
   *
   * `setBootComplete` is idempotent, so this cannot re-fire the arrival on a
   * re-render or a route change.
   */
  useEffect(() => {
    if (booted) setBootComplete()
  }, [booted, setBootComplete])

  // Stable identity so BootSequence's phase timer is never reset by a re-render.
  const handleBootComplete = useCallback(() => {
    sessionStorage.setItem('safia-os-booted', 'true')
    setBooted(true)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120

      for (const section of SECTION_IDS) {
        const element = document.getElementById(section)
        if (element) {
          const { offsetTop, offsetHeight } = element
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section)
            break
          }
        }
      }
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <HelmetProvider>
      <Router>
        <div className="min-h-screen text-off-white overflow-x-hidden">
          {/* The world sits behind everything and persists across routes, so
              navigating never tears down and rebuilds the environment. */}
          <WorldLayer />

          <AnimatePresence>
            {!booted && <BootSequence onComplete={handleBootComplete} />}
          </AnimatePresence>

          <CustomCursor />
          <Navigation activeSection={activeSection} />
          <ScrollProgress />
          <CommandCenter />
          <WorldHUD />
          <VoiceControl />
          <SoundToggle />

          {/* Content rides above the world. */}
          <div className="relative z-10">
            <AnimatedRoutes />
          </div>

          {/* Above the content, not behind it. The canvas is behind the whole
              document, so without this the artifact can fill the viewport in 3D
              while every heading stays painted on top — which reads as a video
              playing behind a webpage rather than as a cut. */}
          <EclipseFlash />
        </div>
      </Router>
    </HelmetProvider>
  )
}

export default App
