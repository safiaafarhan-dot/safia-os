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
import VoiceControl from './components/VoiceControl'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'

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

  useEffect(() => {
    document.body.style.overflow = booted ? '' : 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [booted])

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

          {/* Content rides above the world. */}
          <div className="relative z-10">
            <AnimatedRoutes />
          </div>
        </div>
      </Router>
    </HelmetProvider>
  )
}

export default App
