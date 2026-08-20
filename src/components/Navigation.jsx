import React, { useEffect, useState } from 'react'
import { navigation } from '../data'

const openCommandCenter = () => window.dispatchEvent(new Event('safia:command-center'))

const Navigation = ({ activeSection }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isMac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavigate = (href) => {
    document.getElementById(href)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 border-b ${
        scrolled
          ? 'bg-hero-black/85 backdrop-blur-xl border-metal/25'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <a
          href="#hero"
          onClick={(e) => { e.preventDefault(); handleNavigate('hero') }}
          className="interactive flex items-center gap-2.5 group"
          aria-label="SAFIA.OS — back to top"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-crimson shrink-0" />
          <span className="font-mono text-xs tracking-[0.25em] text-off-white">
            SAFIA<span className="text-crimson-text">.</span>OS
          </span>
        </a>

        <div className="hidden md:flex items-center gap-7">
          {navigation.map((item) => {
            const isActive = activeSection === item.href
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.href)}
                aria-current={isActive ? 'true' : undefined}
                className={`interactive relative font-mono text-[10px] tracking-[0.25em] uppercase transition-colors duration-300 py-1 ${
                  isActive ? 'text-off-white' : 'text-titanium hover:text-off-white'
                }`}
              >
                <span className={isActive ? 'text-crimson-text mr-1.5' : 'text-silver/75 mr-1.5'}>
                  {item.id}
                </span>
                {item.label}
                <span
                  className={`absolute -bottom-0.5 left-0 h-px bg-crimson transition-all duration-500 ${
                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0'
                  }`}
                />
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          {/* Discoverable entry point — the shortcut alone would be invisible. */}
          <button
            onClick={openCommandCenter}
            aria-label={`${isMac ? '⌘' : 'Ctrl'} K — open command center`}
            aria-keyshortcuts="Control+K Meta+K"
            className="interactive hidden sm:flex items-center gap-2 border border-metal/35 hover:border-crimson/60 rounded-sm px-2.5 py-1.5 transition-colors duration-300 group"
          >
            <span className="font-mono text-[9px] tracking-[0.2em] text-silver/75 group-hover:text-crimson-text transition-colors">
              {isMac ? '⌘' : 'CTRL'} K
            </span>
          </button>

          <button
            className="md:hidden interactive text-off-white w-9 h-9 flex items-center justify-center border border-metal/40 rounded-sm"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <span className="font-mono text-xs">{menuOpen ? '✕' : '≡'}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-hero-black/95 backdrop-blur-xl border-t border-metal/20 px-6 py-3">
          {navigation.map((item) => {
            const isActive = activeSection === item.href
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.href)}
                className={`interactive w-full text-left py-3 font-mono text-[11px] tracking-[0.25em] uppercase border-b border-metal/10 last:border-0 ${
                  isActive ? 'text-off-white' : 'text-titanium'
                }`}
              >
                <span className={isActive ? 'text-crimson-text mr-3' : 'text-silver/75 mr-3'}>
                  {item.id}
                </span>
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}

export default Navigation
