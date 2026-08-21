import React from 'react'
import { personalBrand } from '../data'
import ScrollText from '../components/ui/ScrollText'
import { Magnetic } from '../components/ui/Magnetic'
import { RevealGroup, RevealItem } from '../components/ui/Reveal'
import Wordmark from '../components/ui/Wordmark'

/**
 * The hero no longer owns a canvas.
 *
 * It used to mount its own HeroScene, but the persistent world behind the whole
 * document now renders the core at station 0 — keeping both would mean two
 * WebGL contexts drawing the same object, one of them boxed inside a section
 * while the other travels.
 *
 * The scrim below stays but is now a SAFETY NET rather than the mechanism.
 * Contrast under the type is primarily held by the world itself: the sky
 * shader reads the measured reading column and dims itself inside it, so the
 * environment cannot light the words no matter where its source drifts. See
 * the content-aware block in Atmosphere.jsx.
 */
const Hero = () => {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden station station--clear"
    >
      {/* LEGIBILITY SCRIM — now much lighter, because it is no longer the
          thing doing the work.

          It used to be a near-opaque navy panel (0.86 alpha) across the left
          of the frame, sized for the worst case of a very bright world behind
          it. That world is gone: the sky is graded near-black in the opening
          and, more to the point, it now DIMS ITSELF inside the measured
          reading column — see the content-aware block in Atmosphere.jsx's sky
          shader. Two systems solving the same problem meant the left half of
          the hero was a flat grey rectangle with a 3D scene visible only on
          the right, which is most of what made the composition read as a
          template: text panel, decoration panel.

          What remains is a genuine safety net rather than the primary
          mechanism — enough to hold contrast if the world fails to mount, is
          mid-ignition, or is running on the CSS tier, and light enough that
          the environment reads as continuous behind the type. */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 hidden md:block bg-[linear-gradient(to_right,rgba(3,6,14,0.62)_0%,rgba(4,9,20,0.38)_34%,rgba(5,11,24,0.05)_62%,transparent_100%)]" />
        <div className="absolute inset-0 md:hidden bg-[linear-gradient(to_bottom,rgba(3,6,14,0.06)_0%,rgba(3,6,14,0.14)_22%,rgba(3,6,14,0.66)_34%,rgba(3,6,14,0.78)_55%)]" />
        {/* One cool bounce under the copy, so the shadow side of the frame has
            colour in it rather than being a dead value. Halved from the two
            pools that were here: over a near-black world they were adding a
            visible haze to the exact area the type sits in. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_94%,rgba(46,140,215,0.10)_0%,rgba(24,72,140,0.03)_42%,transparent_74%)]" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 md:px-10">
        {/* IDENTITY EMERGES FROM THE ENVIRONMENT, NOT BEFORE IT.

            The cascade used to start at 0.15s, which put the name on screen
            while the world behind it was still black — so the copy was not
            emerging from anything, it was a page loading in front of a canvas
            that had not started yet. It now lands as the sky's source comes
            up (around ignition 0.20), which is the beat the brief asks for:
            darkness, a point of light, the light strengthening, and the
            identity resolving in the space that light just revealed.

            It is deliberately NOT held until the awakening finishes. The
            environment goes on assembling for another four seconds after
            this, and making someone wait that long to read a name would be
            spectacle bought with usability. Arriving mid-sequence is also the
            better shot: the copy resolves while the world is still resolving
            around it, so the two feel like one event rather than a curtain
            raise followed by a headline. */}
        <RevealGroup className="max-w-xl text-center md:text-left mt-56 md:mt-0" stagger={0.13} delay={1.45} data-safe>
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
              delay={1.6}
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

          {/* The one line of prose in the hero, resolving character by character
              as the visitor scrolls into it rather than arriving finished. */}
          <RevealItem className="mb-12">
            <ScrollText
              className="text-titanium text-sm md:text-base max-w-md mx-auto md:mx-0 leading-relaxed"
              floor={0.58}
            >
              {personalBrand.tagline}
            </ScrollText>
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
