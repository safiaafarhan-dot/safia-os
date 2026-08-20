import React from 'react'
import { experiences, education, timeline } from '../data/experience'
import SectionHeader from '../components/ui/SectionHeader'
import { Reveal, RevealGroup, RevealItem } from '../components/ui/Reveal'

const Experience = () => {
  return (
    <section id="experience" className="relative py-24 md:py-36 px-6 md:px-10 station station--dense">
      <div className="max-w-4xl mx-auto">
        <SectionHeader index="03" label="TIMELINE" title="EXPERIENCE" />

        {/* Roles */}
        <RevealGroup className="space-y-5 mb-20" stagger={0.08}>
          {experiences.map((exp) => (
            <RevealItem key={exp.id} as="article" className="panel panel-signal rounded-sm p-6 md:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                <h3 className="text-xl md:text-2xl font-semibold text-off-white tracking-tight">
                  {exp.title}
                </h3>
                <span className="font-mono text-[10px] tracking-[0.2em] text-crimson-text shrink-0">
                  {exp.duration}
                </span>
              </div>

              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-silver/75 mb-5">
                {exp.organization} · {exp.location}
              </div>

              <p className="text-titanium text-sm leading-relaxed mb-6">{exp.description}</p>

              <div className="flex flex-wrap gap-2">
                {exp.technologies.map((tech) => (
                  <span key={tech} className="chip">{tech}</span>
                ))}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Education */}
        <div className="mb-20">
          <Reveal className="flex items-center gap-3 mb-6">
            <span className="h-px w-6 bg-crimson" />
            <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">EDUCATION</span>
          </Reveal>

          <Reveal className="panel hud-corners rounded-sm p-6 md:p-8">
            <h3 className="text-xl font-semibold text-off-white mb-2 tracking-tight">
              {education.degree} — {education.field}
            </h3>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-silver/75 mb-2">
              {education.university} · {education.location}
            </div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-crimson-text mb-6">
              {education.startYear} — {education.endYear} · GPA {education.gpa}
            </div>
            <div className="flex flex-wrap gap-2">
              {education.relevanCoursework.map((course) => (
                <span key={course} className="chip">{course}</span>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Journey timeline */}
        <div>
          <Reveal className="flex items-center gap-3 mb-8">
            <span className="h-px w-6 bg-crimson" />
            <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">JOURNEY</span>
          </Reveal>

          <div className="relative pl-8 md:pl-10">
            <div className="absolute left-0 top-1 bottom-1 w-px bg-gradient-to-b from-crimson/60 via-metal/30 to-transparent" />

            <RevealGroup className="space-y-10" stagger={0.1}>
              {timeline.map((entry) => (
                <RevealItem key={entry.year} className="relative">
                  <span className="absolute -left-8 md:-left-10 top-1.5 w-2 h-2 rounded-full bg-crimson -translate-x-1/2 ml-px" />
                  <div className="font-mono text-sm tracking-[0.2em] text-crimson-text mb-2">
                    {entry.year}
                  </div>
                  <div className="text-off-white font-medium mb-3">{entry.title}</div>
                  <ul className="space-y-1.5">
                    {entry.items.map((item) => (
                      <li key={item} className="text-titanium text-sm flex gap-2.5">
                        <span className="text-metal shrink-0">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Experience
