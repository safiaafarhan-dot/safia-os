import React from 'react'
import { RevealGroup, RevealItem } from './Reveal'
import ScrollText from './ScrollText'

/**
 * Shared section masthead for the SAFIA.OS system UI.
 * Renders a monospaced index label, a display title, and a hairline rule
 * whose leading segment is crimson — the single accent used throughout.
 */
const SectionHeader = ({ index, label, title, description }) => (
  <RevealGroup as="header" className="mb-14 md:mb-20" stagger={0.07}>
    <RevealItem className="flex items-center gap-3 mb-5">
      <span className="w-1.5 h-1.5 rounded-full bg-crimson shrink-0" />
      <span className="font-mono text-[10px] md:text-xs tracking-[0.4em] text-crimson-text">
        {index}
      </span>
      <span className="font-mono text-[10px] md:text-xs tracking-[0.4em] text-silver/75">
        / {label}
      </span>
    </RevealItem>

    <RevealItem
      as="h2"
      y={28}
      className="text-display-sm md:text-display-md lg:text-display-lg font-display font-bold text-off-white"
    >
      {title}
    </RevealItem>

    <RevealItem className="mt-6 flex items-center gap-0 max-w-md">
      <span className="h-px w-16 bg-crimson" />
      <span className="h-px flex-1 bg-metal/40" />
    </RevealItem>

    {/* The description resolves as it is scrolled through, so arriving at a
        section and reading its opening line are the same gesture. */}
    {description && (
      <RevealItem className="mt-6">
        <ScrollText className="text-titanium text-sm md:text-base max-w-2xl leading-relaxed">
          {description}
        </ScrollText>
      </RevealItem>
    )}
  </RevealGroup>
)

export default SectionHeader
