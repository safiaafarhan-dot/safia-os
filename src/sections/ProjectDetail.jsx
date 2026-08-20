import React, { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getProjectById } from '../data/projects'

const cleanStatus = (status) => status.replace(/[^\w\s/&-]/gu, '').trim()

const Meta = ({ label, children }) => (
  <div>
    <div className="font-mono text-[10px] tracking-[0.3em] text-silver/75 mb-2">{label}</div>
    {children}
  </div>
)

const ProjectDetail = () => {
  const { id } = useParams()
  const project = getProjectById(id)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-off-white px-6">
        <div className="font-mono text-[10px] tracking-[0.35em] text-crimson-text mb-4">
          MODULE NOT FOUND
        </div>
        <p className="text-titanium mb-8 text-sm">No project matches this identifier.</p>
        <Link to="/" className="interactive btn btn-secondary">RETURN TO SAFIA.OS</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-hero-black/72 text-off-white px-6 md:px-10 pt-28 pb-24">
      <article className="max-w-3xl mx-auto">
        <Link
          to="/#projects"
          className="interactive inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-silver/75 hover:text-crimson-text transition-colors duration-300 mb-14"
        >
          <span>←</span> BACK TO PROJECTS
        </Link>

        <div className="flex items-center justify-between mb-6">
          <span className="font-mono text-xs text-silver/75 tracking-[0.2em]">{project.number}</span>
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-crimson animate-pulse-subtle" />
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-silver/75">
              {cleanStatus(project.status)}
            </span>
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl font-display font-bold tracking-tight mb-4 leading-none">
          {project.name}
        </h1>
        <div className="font-mono text-[10px] md:text-xs tracking-[0.25em] uppercase text-crimson-text mb-2">
          {project.category}
        </div>
        <div className="text-titanium text-sm mb-10">{project.tagline}</div>

        <div className="flex items-center gap-0 mb-10">
          <span className="h-px w-16 bg-crimson" />
          <span className="h-px flex-1 bg-metal/30" />
        </div>

        <p className="text-base md:text-lg text-titanium leading-relaxed mb-14">
          {project.description}
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-14">
          <div className="panel rounded-sm p-6">
            <Meta label="PROBLEM">
              <p className="text-titanium text-sm leading-relaxed">{project.problem}</p>
            </Meta>
          </div>
          <div className="panel rounded-sm p-6">
            <Meta label="SOLUTION">
              <p className="text-titanium text-sm leading-relaxed">{project.solution}</p>
            </Meta>
          </div>
        </div>

        <div className="mb-14">
          <Meta label="TECHNOLOGY STACK">
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech) => (
                <span key={tech} className="chip">{tech}</span>
              ))}
            </div>
          </Meta>
        </div>

        <div className="grid md:grid-cols-2 gap-10 mb-14">
          <Meta label="IMPLEMENTED">
            <ul className="space-y-2.5">
              {project.features.implemented.map((f) => (
                <li key={f} className="text-titanium text-sm flex gap-3 leading-relaxed">
                  <span className="text-crimson-text shrink-0">▪</span>
                  {f}
                </li>
              ))}
            </ul>
          </Meta>

          <Meta label="EXPLORING">
            <ul className="space-y-2.5">
              {project.features.exploring.map((f) => (
                <li key={f} className="text-titanium text-sm flex gap-3 leading-relaxed">
                  <span className="text-metal shrink-0">▫</span>
                  {f}
                </li>
              ))}
            </ul>
          </Meta>
        </div>

        {project.caseStudy && (
          <div className="panel hud-corners rounded-sm p-6 md:p-8 mb-14 space-y-7">
            <div className="font-mono text-[10px] tracking-[0.35em] text-silver/75">CASE STUDY</div>
            <Meta label="CHALLENGE">
              <p className="text-titanium text-sm leading-relaxed">{project.caseStudy.challenge}</p>
            </Meta>
            <Meta label="APPROACH">
              <p className="text-titanium text-sm leading-relaxed">{project.caseStudy.solution}</p>
            </Meta>
            <Meta label="RESULTS">
              <p className="text-titanium text-sm leading-relaxed">{project.caseStudy.results}</p>
            </Meta>
            <Meta label="KEY LEARNINGS">
              <ul className="space-y-2">
                {project.caseStudy.keyLearnings.map((k) => (
                  <li key={k} className="text-titanium text-sm flex gap-3">
                    <span className="text-crimson-text shrink-0">—</span>
                    {k}
                  </li>
                ))}
              </ul>
            </Meta>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noreferrer"
              className="interactive btn btn-secondary"
            >
              GITHUB
            </a>
          )}
          {project.liveDemo && (
            <a
              href={project.liveDemo}
              target="_blank"
              rel="noreferrer"
              className="interactive btn btn-primary"
            >
              LIVE DEMO
            </a>
          )}
        </div>
      </article>
    </div>
  )
}

export default ProjectDetail
