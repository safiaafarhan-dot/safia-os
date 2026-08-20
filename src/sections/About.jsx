import React from 'react'
import { personalBrand } from '../data'
import SectionHeader from '../components/ui/SectionHeader'
import { Reveal, RevealGroup, RevealItem } from '../components/ui/Reveal'
import { Tilt } from '../components/ui/Magnetic'

const identityRows = [
  { field: 'NAME', value: personalBrand.name },
  { field: 'ROLE', value: personalBrand.title },
  { field: 'SECONDARY', value: personalBrand.secondaryTitle },
]

const About = () => {
  return (
    <section id="about" className="relative py-24 md:py-36 px-6 md:px-10 station station--dense">
      <div className="max-w-5xl mx-auto">
        <SectionHeader index="01" label="IDENTITY" title="ABOUT" />

        {/* Identity readout — a system record rather than a bio block */}
        <Reveal className="mb-14">
          <Tilt className="panel hud-corners rounded-sm p-6 md:p-8" max={4}>
            <div className="flex items-center gap-3 mb-6">
              <span className="w-1 h-1 rounded-full bg-crimson animate-pulse-subtle" />
              <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">
                IDENTITY SCAN — COMPLETE
              </span>
            </div>

            <dl className="divide-y divide-metal/15">
              {identityRows.map((row) => (
                <div
                  key={row.field}
                  className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-6 py-4 first:pt-0 last:pb-0"
                >
                  <dt className="font-mono text-[10px] tracking-[0.3em] text-silver/75 pt-1">
                    {row.field}
                  </dt>
                  <dd className="text-off-white text-base md:text-lg">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Tilt>
        </Reveal>

        <Reveal as="p" className="text-titanium text-base md:text-lg leading-relaxed max-w-3xl mb-16">
          {personalBrand.description} {personalBrand.tagline}.
        </Reveal>

        {/* NOTE: these RevealGroups must stay top-level. Framer Motion propagates
            variant labels from a motion parent to its children, so nesting a
            RevealGroup inside a Reveal leaves the items stuck in `hidden`. */}
        <div className="grid md:grid-cols-2 gap-12 md:gap-16">
          <RevealGroup stagger={0.04}>
            <RevealItem className="flex items-center gap-3 mb-6">
              <span className="h-px w-6 bg-crimson" />
              <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">FOCUS</span>
            </RevealItem>
            <div className="flex flex-wrap gap-2">
              {personalBrand.expertise.map((item) => (
                <RevealItem key={item} as="span" y={10} className="chip">
                  {item}
                </RevealItem>
              ))}
            </div>
          </RevealGroup>

          <RevealGroup stagger={0.06} delay={0.08}>
            <RevealItem className="flex items-center gap-3 mb-6">
              <span className="h-px w-6 bg-crimson" />
              <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">APPROACH</span>
            </RevealItem>
            <ul className="space-y-3">
              {personalBrand.personality.map((item) => (
                <RevealItem
                  key={item}
                  as="li"
                  y={12}
                  className="text-titanium text-sm flex gap-3 leading-relaxed"
                >
                  <span className="text-crimson-text font-mono shrink-0">—</span>
                  {item}
                </RevealItem>
              ))}
            </ul>
          </RevealGroup>
        </div>
      </div>
    </section>
  )
}

export default About
