import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { navigation, socials } from '../data'
import { projects } from '../data/projects'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const CommandCenter = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const inputRef = useRef(null)
  const listRef = useRef(null)
  const restoreFocusRef = useRef(null)

  const navigate = useNavigate()
  const location = useLocation()
  const reducedMotion = usePrefersReducedMotion()

  /**
   * Scroll to a section, returning to the home route first if needed.
   * Coming from a sub-route the target does not exist yet, and the home route
   * can take well over a frame to mount — so poll for the element rather than
   * guessing a fixed delay.
   */
  const goToSection = useCallback((href) => {
    const behavior = reducedMotion ? 'auto' : 'smooth'

    const scrollWhenReady = (attemptsLeft) => {
      const el = document.getElementById(href)
      if (el) {
        el.scrollIntoView({ behavior })
        return
      }
      if (attemptsLeft > 0) {
        requestAnimationFrame(() => scrollWhenReady(attemptsLeft - 1))
      }
    }

    if (location.pathname !== '/') {
      navigate('/')
      scrollWhenReady(90) // ~1.5s worth of frames
    } else {
      scrollWhenReady(5)
    }
  }, [location.pathname, navigate, reducedMotion])

  const commands = useMemo(() => {
    const sections = navigation.map((item) => ({
      id: `section-${item.href}`,
      group: 'NAVIGATE',
      label: item.label,
      hint: `Section ${item.id}`,
      keywords: `${item.label} ${item.href} section`,
      run: () => goToSection(item.href),
    }))

    const projectCommands = projects.map((project) => ({
      id: `project-${project.id}`,
      group: 'PROJECTS',
      label: project.name,
      hint: project.category,
      keywords: `${project.name} ${project.category} ${project.technologies.join(' ')}`,
      run: () => navigate(`/project/${project.id}`),
    }))

    const links = socials.map((social) => ({
      id: `link-${social.name}`,
      group: 'EXTERNAL',
      label: social.name,
      hint: social.icon === 'email' ? social.url : 'Opens in a new tab',
      keywords: `${social.name} ${social.description} link`,
      external: true,
      run: () => {
        if (social.icon === 'email') window.location.href = `mailto:${social.url}`
        else window.open(social.url, '_blank', 'noopener,noreferrer')
      },
    }))

    return [
      ...sections,
      ...projectCommands,
      ...links,
      {
        id: 'top',
        group: 'SYSTEM',
        label: 'Return to top',
        hint: 'Reboot the view',
        keywords: 'top home hero start reboot',
        run: () => goToSection('hero'),
      },
    ]
  }, [goToSection, navigate])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q))
  }, [commands, query])

  // Group while preserving order so the rendered list matches keyboard indexing.
  const grouped = useMemo(() => {
    const out = []
    results.forEach((cmd, index) => {
      const last = out[out.length - 1]
      if (last && last.group === cmd.group) last.items.push({ ...cmd, index })
      else out.push({ group: cmd.group, items: [{ ...cmd, index }] })
    })
    return out
  }, [results])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
    restoreFocusRef.current?.focus?.()
  }, [])

  const execute = useCallback((cmd) => {
    if (!cmd) return
    close()
    // Let the overlay unmount before moving the viewport.
    requestAnimationFrame(() => cmd.run())
  }, [close])

  // Global shortcuts. Escape is handled here rather than on the input so it
  // closes the palette no matter where focus currently sits inside the dialog.
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key?.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault()
        setOpen((wasOpen) => {
          if (!wasOpen) restoreFocusRef.current = document.activeElement
          return !wasOpen
        })
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Let other UI open the palette (e.g. the nav trigger).
  useEffect(() => {
    const onOpen = () => {
      restoreFocusRef.current = document.activeElement
      setOpen(true)
    }
    window.addEventListener('safia:command-center', onOpen)
    return () => window.removeEventListener('safia:command-center', onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => {
      document.body.style.overflow = ''
      clearTimeout(t)
    }
  }, [open])

  // Cursor resets in the change handler rather than an effect, so filtering
  // never renders a frame with a stale highlight.
  const handleQueryChange = (e) => {
    setQuery(e.target.value)
    setCursor(0)
  }

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  const onInputKeyDown = (e) => {
    // Escape is owned by the window-level handler above.
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(results[cursor])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCursor(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setCursor(Math.max(0, results.length - 1))
    }
  }

  const activeId = results[cursor]?.id

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <div
            className="absolute inset-0 bg-hero-black/85 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="SAFIA.OS command center"
            className="relative w-full max-w-xl bg-graphite border border-metal/35 rounded-sm shadow-ui overflow-hidden"
            initial={reducedMotion ? false : { y: -8, scale: 0.985 }}
            animate={{ y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { y: -8, scale: 0.985 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="h-px bg-gradient-to-r from-transparent via-crimson to-transparent" />

            {/* Focus is signalled by this row rather than a ring around the input,
                which would read as a stray box inside the modal. */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-metal/25 focus-within:border-crimson/45 transition-colors">
              <span className="font-mono text-crimson-text text-sm shrink-0">&gt;</span>
              <input
                ref={inputRef}
                value={query}
                onChange={handleQueryChange}
                onKeyDown={onInputKeyDown}
                placeholder="Type a command…"
                aria-label="Search commands"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-center-list"
                aria-activedescendant={activeId}
                autoComplete="off"
                spellCheck="false"
                className="no-focus-ring flex-1 bg-transparent border-0 outline-none text-off-white font-mono text-sm tracking-[0.08em] placeholder:text-silver/75"
              />
              <kbd className="font-mono text-[9px] tracking-[0.2em] text-silver/75 border border-metal/40 rounded-sm px-2 py-1 shrink-0">
                ESC
              </kbd>
            </div>

            <div
              ref={listRef}
              id="command-center-list"
              role="listbox"
              aria-label="Commands"
              className="max-h-[46vh] overflow-y-auto py-2"
            >
              {grouped.length === 0 && (
                <p className="px-5 py-8 text-center font-mono text-[10px] tracking-[0.25em] text-silver/75">
                  NO MATCHING COMMAND
                </p>
              )}

              {grouped.map(({ group, items }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <div className="px-5 pt-3 pb-2 font-mono text-[9px] tracking-[0.3em] text-silver/75">
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const selected = cmd.index === cursor
                    return (
                      <div
                        key={cmd.id}
                        id={cmd.id}
                        data-index={cmd.index}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setCursor(cmd.index)}
                        onClick={() => execute(cmd)}
                        className={`interactive flex items-center justify-between gap-4 px-5 py-2.5 cursor-pointer transition-colors ${
                          selected ? 'bg-crimson/12' : ''
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-1 h-1 rounded-full shrink-0 ${
                              selected ? 'bg-crimson' : 'bg-metal'
                            }`}
                          />
                          <span
                            className={`text-sm truncate ${
                              selected ? 'text-off-white' : 'text-titanium'
                            }`}
                          >
                            {cmd.label}
                          </span>
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.15em] text-silver/75 shrink-0 truncate max-w-[45%]">
                          {cmd.external ? '↗ ' : ''}{cmd.hint}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-5 px-5 py-3 border-t border-metal/25 font-mono text-[9px] tracking-[0.2em] text-silver/75">
              <span>↑↓ NAVIGATE</span>
              <span>↵ SELECT</span>
              <span className="ml-auto">SAFIA.OS</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { isMac }
export default CommandCenter
