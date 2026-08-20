import React, { Suspense, lazy, useState, useMemo } from 'react'
import { skillCategories } from '../data/skills'
import { skillNodes, skillEdges, neighboursOf, projectsUsing } from '../data/skillGraph'
import SectionHeader from '../components/ui/SectionHeader'
import LiveTranscription from '../components/LiveTranscription'
import { Reveal, RevealGroup, RevealItem } from '../components/ui/Reveal'
import DeferredCanvas from '../components/ui/DeferredCanvas'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const SkillsConstellation = lazy(() => import('../three/SkillsConstellation'))

const isWebGLAvailable = () => {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

const Skills = () => {
  const reducedMotion = usePrefersReducedMotion()
  const [webglOK] = useState(() => typeof window !== 'undefined' && isWebGLAvailable())
  const [activeId, setActiveId] = useState(null)

  const active = useMemo(() => skillNodes.find((n) => n.id === activeId) ?? null, [activeId])
  const activeNeighbours = activeId ? neighboursOf[activeId] ?? [] : []
  const activeProjects = activeId ? projectsUsing[activeId] ?? [] : []

  return (
    <section id="skills" className="relative py-24 md:py-36 px-6 md:px-10 station">
      <div className="max-w-6xl mx-auto" data-safe>
        <SectionHeader
          index="02"
          label="TECHNOLOGY"
          title="SKILLS"
          description="A technology constellation. Every connection is drawn from a real project where those technologies were used together — not an arbitrary rating."
        />

        <LiveTranscription
          className="mb-6 lg:mb-8"
          hint="Say a technology name or “show projects” — the constellation and the page respond to the same commands."
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 lg:gap-8">
          {/* Constellation */}
          <div className="relative rounded-sm border border-metal/20 bg-graphite overflow-hidden h-[380px] md:h-[520px]">
            {webglOK ? (
              <DeferredCanvas
                className="w-full h-full"
                fallback={<div className="w-full h-full grid place-items-center font-mono text-[10px] tracking-[0.3em] text-silver/75">CONSTELLATION STANDBY</div>}
              >
                <Suspense fallback={<div className="w-full h-full grid place-items-center font-mono text-[10px] tracking-[0.3em] text-silver/75">INITIALIZING CONSTELLATION…</div>}>
                  <SkillsConstellation
                    activeId={activeId}
                    onActivate={setActiveId}
                    reducedMotion={reducedMotion}
                  />
                </Suspense>
              </DeferredCanvas>
            ) : (
              <div className="w-full h-full grid place-items-center px-6 text-center">
                <p className="font-mono text-[10px] tracking-[0.25em] text-silver/75 leading-relaxed">
                  3D UNAVAILABLE — FULL TECHNOLOGY INDEX BELOW
                </p>
              </div>
            )}

            <div className="absolute top-4 left-4 flex items-center gap-2.5 pointer-events-none">
              <span className="w-1 h-1 rounded-full bg-crimson animate-pulse-subtle" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-silver/75">
                {skillNodes.length} NODES · {skillEdges.length} LINKS
              </span>
            </div>
          </div>

          {/* Readout HUD */}
          <aside className="panel hud-corners rounded-sm p-6 flex flex-col min-h-[220px]">
            {active ? (
              <>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active.color }} />
                  <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-silver/75">
                    {active.category}
                  </span>
                </div>

                <h3 className="text-xl font-semibold text-off-white tracking-tight mb-2">
                  {active.name}
                </h3>
                <p className="text-titanium text-sm leading-relaxed mb-6">{active.description}</p>

                {activeProjects.length > 0 && (
                  <div className="mb-5">
                    <div className="font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-2">
                      USED IN
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeProjects.map((p) => (
                        <span key={p} className="chip">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-2">
                    LINKED ({activeNeighbours.length})
                  </div>
                  {activeNeighbours.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeNeighbours.map((n) => (
                        <button
                          key={n}
                          onClick={() => setActiveId(n)}
                          className="interactive chip hover:text-off-white"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-titanium text-xs leading-relaxed">
                      No shared-project links yet — used independently of the listed projects.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col justify-center">
                <div className="font-mono text-[9px] tracking-[0.3em] text-crimson-text mb-3">
                  AWAITING SELECTION
                </div>
                <p className="text-titanium text-sm leading-relaxed">
                  Choose a technology from the index below — or hover a node in the constellation —
                  to trace what it connects to and where it has actually been used.
                </p>
              </div>
            )}
          </aside>
        </div>

        {/* Full index — keyboard accessible, and the fallback when 3D is unavailable */}
        <div className="mt-14">
          <Reveal className="flex items-center gap-3 mb-8">
            <span className="h-px w-6 bg-crimson" />
            <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">
              TECHNOLOGY INDEX
            </span>
          </Reveal>

          <RevealGroup className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10" stagger={0.07}>
            {Object.entries(skillCategories).map(([category, { color, skills }]) => (
              <RevealItem key={category}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-silver/75">
                    {category}
                  </span>
                </div>

                <ul className="space-y-px">
                  {skills.map((skill) => {
                    const isActive = activeId === skill.name
                    return (
                      <li key={skill.name}>
                        <button
                          onClick={() => setActiveId(isActive ? null : skill.name)}
                          onFocus={() => setActiveId(skill.name)}
                          onMouseEnter={() => setActiveId(skill.name)}
                          aria-pressed={isActive}
                          className={`interactive w-full text-left py-2 px-2 -mx-2 rounded-sm transition-colors duration-200 ${
                            isActive ? 'bg-crimson/10 text-off-white' : 'text-titanium hover:text-off-white'
                          }`}
                        >
                          <span className="text-sm">{skill.name}</span>
                          <span className="block text-titanium text-xs mt-0.5">
                            {skill.description}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  )
}

export default Skills
