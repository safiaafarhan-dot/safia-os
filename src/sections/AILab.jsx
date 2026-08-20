import React from 'react'
import { aiLabExperiments } from '../data/ailab'
import SectionHeader from '../components/ui/SectionHeader'
import { RevealGroup, RevealItem } from '../components/ui/Reveal'

// Implemented work reads as a live signal; everything else stays neutral.
const statusTone = (status) =>
  status === 'Implemented'
    ? 'text-crimson-text'
    : status === 'In Development'
      ? 'text-silver/75'
      : 'text-silver/75'

const AILab = () => {
  return (
    <section id="ailab" className="relative py-24 md:py-36 px-6 md:px-10 station">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          index="05"
          label="EXPERIMENTAL"
          title="SAFIA LAB"
          description="Ongoing AI/ML experiments, prototypes and directions currently being explored."
        />

        <RevealGroup className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" stagger={0.06}>
          {aiLabExperiments.map((exp) => (
            <RevealItem
              key={exp.id}
              as="article"
              className="panel panel-signal rounded-sm p-5 md:p-6 flex flex-col"
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-silver/75">
                  {exp.category}
                </span>
                <span
                  className={`font-mono text-[9px] tracking-[0.2em] uppercase shrink-0 ${statusTone(exp.status)}`}
                >
                  {exp.status}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-off-white mb-2.5 tracking-tight">
                {exp.name}
              </h3>
              <p className="text-titanium text-sm leading-relaxed mb-5 flex-1">
                {exp.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {exp.tags.map((tag) => (
                  <span key={tag} className="chip">{tag}</span>
                ))}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}

export default AILab
