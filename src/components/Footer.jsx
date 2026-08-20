import React from 'react'
import { socials } from '../data'

const Footer = () => {
  return (
    <footer className="relative border-t border-metal/20 bg-hero-black/70 overflow-hidden">
      {/* environment fades to black, ending on a single crimson signal */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-crimson/40 to-transparent" />

      <div className="relative max-w-4xl mx-auto px-6 py-24 md:py-32 text-center">
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className="w-1.5 h-1.5 rounded-full bg-crimson animate-pulse-subtle" />
          <span className="font-mono text-[10px] tracking-[0.4em] text-silver/75">
            SAFIA.OS — SYSTEM ONLINE
          </span>
        </div>

        <h2 className="text-2xl md:text-4xl font-display font-bold text-off-white leading-tight tracking-tight mb-14">
          BUILDING THE FUTURE,
          <br />
          ONE SYSTEM AT A TIME<span className="text-crimson-text">.</span>
        </h2>

        <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 mb-16">
          {socials.map((social) => (
            <a
              key={social.name}
              href={social.icon === 'email' ? `mailto:${social.url}` : social.url}
              target={social.icon === 'email' ? undefined : '_blank'}
              rel="noreferrer"
              className="interactive group font-mono text-[10px] tracking-[0.3em] uppercase text-titanium hover:text-off-white transition-colors duration-300"
            >
              <span className="text-crimson-text group-hover:text-crimson-text transition-colors mr-2">
                ├
              </span>
              {social.name}
            </a>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 mb-8">
          <span className="h-px w-12 bg-metal/40" />
          <span className="w-1 h-1 rounded-full bg-crimson" />
          <span className="h-px w-12 bg-metal/40" />
        </div>

        <div className="text-silver/75 text-[10px] font-mono tracking-[0.2em]">
          © {new Date().getFullYear()} SAFIA FARHAN
        </div>
      </div>
    </footer>
  )
}

export default Footer
