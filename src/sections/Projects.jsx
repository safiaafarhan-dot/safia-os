import React, { Suspense, lazy, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { projects } from '../data/projects'
import SectionHeader from '../components/ui/SectionHeader'
import { Reveal, RevealGroup, RevealItem } from '../components/ui/Reveal'
import DeferredCanvas from '../components/ui/DeferredCanvas'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const ProjectUniverse = lazy(() => import('../three/ProjectUniverse'))

// Status strings in the data carry emoji; strip them so the UI stays typographic.
const cleanStatus = (status) => status.replace(/[^\w\s/&-]/gu, '').trim()

const isWebGLAvailable = () => {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

const Projects = () => {
  const reducedMotion = usePrefersReducedMotion()
  const [webglOK] = useState(() => typeof window !== 'undefined' && isWebGLAvailable())
  const [activeId, setActiveId] = useState(null)
  const [hoverId, setHoverId] = useState(null)

  const active = useMemo(() => projects.find((p) => p.id === activeId) ?? null, [activeId])

  return (
    <section id="projects" className="relative py-24 md:py-36 px-6 md:px-10 station">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          index="04"
          label="WORK"
          title="PROJECTS"
          description="Three systems, each with its own environment. Select a module to bring it online."
        />

        {/* Universe */}
        {webglOK && (
          <div className="relative rounded-sm border border-metal/20 bg-graphite overflow-hidden h-[340px] md:h-[460px] mb-6">
            <DeferredCanvas
              className="w-full h-full"
              fallback={
                <div className="w-full h-full grid place-items-center font-mono text-[10px] tracking-[0.3em] text-silver/75">
                  MODULES STANDBY
                </div>
              }
            >
              <Suspense
                fallback={
                  <div className="w-full h-full grid place-items-center font-mono text-[10px] tracking-[0.3em] text-silver/75">
                    MOUNTING PROJECT MODULES…
                  </div>
                }
              >
                <ProjectUniverse
                  projects={projects}
                  activeId={activeId}
                  hoverId={hoverId}
                  onHover={setHoverId}
                  onSelect={(id) => setActiveId((cur) => (cur === id ? null : id))}
                  reducedMotion={reducedMotion}
                />
              </Suspense>
            </DeferredCanvas>

            <div className="absolute top-4 left-4 flex items-center gap-2.5 pointer-events-none">
              <span
                className={`w-1 h-1 rounded-full ${active ? 'bg-crimson animate-pulse-subtle' : 'bg-silver/40'}`}
              />
              <span className="font-mono text-[9px] tracking-[0.3em] text-silver/75">
                {active ? `MODULE ACTIVE — ${active.name.toUpperCase()}` : 'ALL MODULES STANDBY'}
              </span>
            </div>

            {active && (
              <button
                onClick={() => setActiveId(null)}
                className="interactive absolute top-3 right-3 font-mono text-[9px] tracking-[0.25em] text-silver/75 hover:text-crimson-text transition-colors px-3 py-2"
              >
                DISENGAGE ✕
              </button>
            )}
          </div>
        )}

        {/* Activated module readout */}
        {active && (
          <div className="panel hud-corners rounded-sm p-6 md:p-8 mb-12">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-crimson-text mb-2">
                  {active.number} · {active.category}
                </div>
                <h3 className="text-2xl md:text-3xl font-display font-bold text-off-white tracking-tight">
                  {active.name}
                </h3>
              </div>
              <span className="flex items-center gap-2 shrink-0 mt-1">
                <span className="w-1 h-1 rounded-full bg-crimson animate-pulse-subtle" />
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-silver/75">
                  {cleanStatus(active.status)}
                </span>
              </span>
            </div>

            <p className="text-titanium text-sm md:text-base leading-relaxed mb-6 max-w-3xl">
              {active.description}
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-7">
              <div>
                <div className="font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-2">PROBLEM</div>
                <p className="text-titanium text-sm leading-relaxed">{active.problem}</p>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.25em] text-silver/75 mb-2">SOLUTION</div>
                <p className="text-titanium text-sm leading-relaxed">{active.solution}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-8">
              {active.technologies.map((tech) => (
                <span key={tech} className="chip">{tech}</span>
              ))}
            </div>

            <div className="flex flex-wrap gap-4">
              <Link to={`/project/${active.id}`} className="interactive btn btn-primary">
                FULL CASE STUDY
              </Link>
              {active.github && (
                <a
                  href={active.github}
                  target="_blank"
                  rel="noreferrer"
                  className="interactive btn btn-secondary"
                >
                  GITHUB
                </a>
              )}
            </div>
          </div>
        )}

        {/* Module index — keyboard path and the fallback when 3D is unavailable */}
        <Reveal className="flex items-center gap-3 mb-8">
          <span className="h-px w-6 bg-crimson" />
          <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">MODULE INDEX</span>
        </Reveal>

        <RevealGroup className="grid md:grid-cols-3 gap-5" stagger={0.08}>
          {projects.map((project) => {
            const isActive = project.id === activeId
            return (
              <RevealItem
                key={project.id}
                as="article"
                className={`panel panel-signal hud-corners rounded-sm p-6 flex flex-col transition-colors ${
                  isActive ? 'border-crimson/50' : ''
                }`}
                onMouseEnter={() => setHoverId(project.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="font-mono text-xs text-silver/75 tracking-[0.2em]">
                    {project.number}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-crimson' : 'bg-silver/30'}`} />
                    <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-silver/75">
                      {cleanStatus(project.status)}
                    </span>
                  </span>
                </div>

                <h3 className="text-xl md:text-2xl font-display font-bold text-off-white mb-2 tracking-tight">
                  {project.name}
                </h3>
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-crimson-text mb-4">
                  {project.category}
                </div>

                <p className="text-titanium text-sm leading-relaxed mb-5 flex-1">
                  {project.shortDescription}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {project.technologies.slice(0, 4).map((tech) => (
                    <span key={tech} className="chip">{tech}</span>
                  ))}
                  {project.technologies.length > 4 && (
                    <span className="chip">+{project.technologies.length - 4}</span>
                  )}
                </div>

                <div className="flex items-center gap-5 mt-auto">
                  {webglOK && (
                    <button
                      onClick={() => setActiveId(isActive ? null : project.id)}
                      aria-pressed={isActive}
                      className="interactive font-mono text-[10px] tracking-[0.25em] text-silver/75 hover:text-crimson-text transition-colors duration-300"
                    >
                      {isActive ? 'DISENGAGE' : 'ACTIVATE →'}
                    </button>
                  )}
                  <Link
                    to={`/project/${project.id}`}
                    className="interactive font-mono text-[10px] tracking-[0.25em] text-silver/75 hover:text-crimson-text transition-colors duration-300"
                  >
                    CASE STUDY →
                  </Link>
                </div>
              </RevealItem>
            )
          })}
        </RevealGroup>
      </div>
    </section>
  )
}

export default Projects
