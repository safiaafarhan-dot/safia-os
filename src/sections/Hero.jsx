import React from 'react'
import { personalBrand } from '../data'
import { Magnetic } from '../components/ui/Magnetic'
import { RevealGroup, RevealItem } from '../components/ui/Reveal'
import Wordmark from '../components/ui/Wordmark'

/**
 * The hero no longer owns a canvas.
 *
 * It used to mount its own HeroScene, but the persistent world behind the whole
 * document now renders the core at station 0 — keeping both would mean two
 * WebGL contexts drawing the same object, one of them boxed inside a section
 * while the other travels. The scrims below stay, because the text still needs
 * to hold contrast over a live environment.
 */
const Hero = () => {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden station station--clear"
    >
      {/* LEGIBILITY SCRIM — now NAVY, not near-black.
          The scrim covers the largest single area of the opening frame, so its
          colour is effectively the page's background colour, and at
          rgba(8,8,11,·) that was flat black across most of the width — the one
          thing this direction rules out. Tinting it deep navy costs nothing in
          contrast (the alpha is unchanged) and turns the dead half of the
          frame into atmosphere the 3D layers can sit inside.

          The second layer is the counterpart: a faint cool bloom bottom-left,
          so the darkest corner still has a light source in it rather than
          falling to a single value. */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 hidden md:block bg-[linear-gradient(to_right,rgba(6,12,26,0.93)_0%,rgba(7,14,30,0.80)_38%,rgba(8,16,34,0.10)_66%,transparent_100%)]" />
        <div className="absolute inset-0 md:hidden bg-[linear-gradient(to_bottom,rgba(7,13,28,0.06)_0%,rgba(7,13,28,0.20)_22%,rgba(6,12,26,0.88)_34%,rgba(6,12,26,0.94)_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_12%_88%,rgba(38,120,190,0.16)_0%,rgba(20,60,120,0.05)_38%,transparent_70%)]" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 md:px-10">
        {/* Entrance cascade — the hero is already in view, so this plays on mount
            rather than waiting for a scroll trigger. */}
        <RevealGroup className="max-w-xl text-center md:text-left mt-56 md:mt-0" stagger={0.11} delay={0.15} data-safe>
          <RevealItem className="flex items-center justify-center md:justify-start gap-3 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-crimson" />
            <span className="text-crimson-text text-[10px] md:text-xs font-mono tracking-[0.4em]">
              SYSTEM ONLINE
            </span>
          </RevealItem>

          {/* The wordmark assembles out of scattered, blurred fragments and
              takes a specular pulse once it has settled — see Wordmark.jsx.
              It is deliberately NOT a RevealItem: the rest of the column rises
              together as one cascade, and the core of the dimension should
              arrive by a different mechanism than the copy around it. */}
          <RevealItem y={0} duration={0.01}>
            <Wordmark
              className="text-display-lg md:text-display-xl lg:text-[5.75rem] font-display font-bold mb-8 text-off-white"
              delay={0.25}
            />
          </RevealItem>

          <RevealItem className="mb-8">
            <h2 className="text-xl md:text-2xl font-medium mb-4 text-off-white tracking-wide">
              {personalBrand.name}
            </h2>
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] md:text-xs tracking-[0.3em] text-crimson-text">
                {personalBrand.title}
              </p>
              <p className="font-mono text-[10px] md:text-xs tracking-[0.3em] text-silver/75">
                {personalBrand.secondaryTitle}
              </p>
            </div>
          </RevealItem>

          <RevealItem
            as="p"
            className="text-titanium text-sm md:text-base max-w-md mx-auto md:mx-0 mb-12 leading-relaxed"
          >
            {personalBrand.tagline}
          </RevealItem>

          <RevealItem className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            <Magnetic>
              <a
                href="#projects"
                className="interactive btn btn-primary w-full sm:w-auto"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('projects')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                EXPLORE MY WORK
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href="#contact"
                className="interactive btn btn-secondary w-full sm:w-auto"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                CONNECT WITH ME
              </a>
            </Magnetic>
          </RevealItem>
        </RevealGroup>
      </div>

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-float">
        <div className="text-silver/75 text-[10px] font-mono tracking-[0.3em]">↓ SCROLL</div>
      </div>
    </section>
  )
}

export default Hero
