import React from 'react'
import { achievements } from '../data/achievements'
import SectionHeader from '../components/ui/SectionHeader'
import { RevealGroup, RevealItem } from '../components/ui/Reveal'

const sorted = [...achievements].sort((a, b) => (a.date < b.date ? 1 : -1))

const Achievements = () => {
  return (
    <section id="achievements" className="relative py-24 md:py-36 px-6 md:px-10 station">
      <div className="max-w-4xl mx-auto" data-safe>
        <SectionHeader index="06" label="MISSION LOG" title="ACHIEVEMENTS" />

        <div className="relative pl-8 md:pl-10">
          <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-crimson/50 via-metal/25 to-transparent" />

          <RevealGroup className="space-y-4" stagger={0.05}>
            {sorted.map((a) => (
              <RevealItem
                key={a.id}
                as="article"
                className="relative panel panel-signal rounded-sm p-5 md:p-6"
              >
                <span className="absolute -left-8 md:-left-10 top-7 w-2 h-2 rounded-full bg-crimson -translate-x-1/2 ml-px" />

                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="text-off-white font-semibold text-base md:text-lg tracking-tight">
                    {a.title}
                  </h3>
                  <span className="font-mono text-[10px] tracking-[0.15em] text-crimson-text shrink-0 mt-1">
                    {a.date}
                  </span>
                </div>

                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-silver/75 mb-3">
                  {a.issuer}
                </div>

                <p className="text-titanium text-sm leading-relaxed">{a.description}</p>

                {a.verificationLink && (
                  <a
                    href={a.verificationLink}
                    target="_blank"
                    rel="noreferrer"
                    className="interactive inline-flex items-center gap-2 mt-4 font-mono text-[10px] tracking-[0.25em] text-silver/75 hover:text-crimson-text transition-colors duration-300"
                  >
                    VERIFY
                    <span>→</span>
                  </a>
                )}
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  )
}

export default Achievements
