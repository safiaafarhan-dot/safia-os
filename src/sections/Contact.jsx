import React, { useState } from 'react'
import { contact, socials } from '../data'
import SectionHeader from '../components/ui/SectionHeader'
import { Reveal } from '../components/ui/Reveal'
import { Magnetic } from '../components/ui/Magnetic'
import { sendMessage, composeMailto, isTransmissionConfigured } from '../lib/sendMessage'

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  // idle | sending | sent | handoff | error
  const [status, setStatus] = useState('idle')
  const [errorText, setErrorText] = useState('')

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorText('')

    const result = await sendMessage(form)

    if (result.status === 'sent') {
      setStatus('sent')
      setForm({ name: '', email: '', message: '' })
      return
    }

    if (result.status === 'unconfigured') {
      // No mail backend wired up: hand the composed message to the visitor's
      // own mail client rather than reporting a success that never happened.
      window.location.href = composeMailto(form)
      setStatus('handoff')
      return
    }

    setStatus('error')
    setErrorText(result.error ?? '')
  }

  const buttonLabel = {
    idle: 'INITIALIZE TRANSMISSION',
    sending: 'ENCRYPTING MESSAGE…',
    sent: 'CONNECTION ESTABLISHED',
    handoff: 'HANDED TO MAIL CLIENT',
    error: 'RETRY TRANSMISSION',
  }[status]

  const fieldClass =
    'w-full bg-surface/50 border border-metal/25 rounded-sm px-4 py-3.5 text-sm text-off-white ' +
    'placeholder:text-silver/75 font-mono tracking-[0.1em] outline-none transition-colors duration-300 ' +
    'focus:border-crimson/70 hover:border-metal/50'

  return (
    <section id="contact" className="relative py-24 md:py-36 px-6 md:px-10 station station--dense">
      <div className="max-w-2xl mx-auto">
        <SectionHeader
          index="07"
          label="CONNECT"
          title="ESTABLISH CONNECTION"
          description={contact.availability}
        />

        <Reveal as="form" onSubmit={handleSubmit} className="space-y-4 mb-14">
          <div>
            <label htmlFor="contact-name" className="block font-mono text-[10px] tracking-[0.3em] text-silver/75 mb-2">
              NAME
            </label>
            <input
              id="contact-name"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="contact-email" className="block font-mono text-[10px] tracking-[0.3em] text-silver/75 mb-2">
              EMAIL
            </label>
            <input
              id="contact-email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="contact-message" className="block font-mono text-[10px] tracking-[0.3em] text-silver/75 mb-2">
              MESSAGE
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              value={form.message}
              onChange={handleChange}
              required
              className={`${fieldClass} resize-none`}
            />
          </div>

          <Magnetic strength={0.18}>
            <button
              type="submit"
              disabled={status === 'sending' || status === 'sent'}
              className="interactive btn btn-primary w-full"
            >
              {buttonLabel}
            </button>
          </Magnetic>

          <div aria-live="polite" className="min-h-[1rem]">
            {status === 'sent' && (
              <p className="text-[10px] text-silver/75 font-mono tracking-[0.15em] text-center leading-relaxed pt-1">
                MESSAGE TRANSMITTED — SAFIA WILL REPLY TO {form.email || 'YOUR ADDRESS'}.
              </p>
            )}

            {status === 'handoff' && (
              <p className="text-[10px] text-silver/75 font-mono tracking-[0.15em] text-center leading-relaxed pt-1">
                YOUR MAIL CLIENT SHOULD NOW BE OPEN WITH THIS MESSAGE READY TO SEND.
                <br />
                IF NOTHING OPENED, WRITE TO{' '}
                <a href={`mailto:${contact.email}`} className="interactive text-crimson-text underline">
                  {contact.email}
                </a>
              </p>
            )}

            {status === 'error' && (
              <p className="text-[10px] text-crimson-text font-mono tracking-[0.15em] text-center leading-relaxed pt-1">
                TRANSMISSION FAILED{errorText ? ` — ${errorText.toUpperCase()}` : ''}.
                <br />
                <a href={composeMailto(form)} className="interactive text-crimson-text underline">
                  SEND VIA YOUR MAIL CLIENT INSTEAD
                </a>
              </p>
            )}
          </div>
        </Reveal>

        {/* Network map */}
        <Reveal>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-6 bg-crimson" />
            <span className="font-mono text-[10px] tracking-[0.35em] text-silver/75">NETWORK</span>
          </div>

          <div className="font-mono text-xs">
            <div className="text-off-white tracking-[0.2em] mb-1">SAFIA</div>
            <div className="text-crimson-text mb-1">│</div>
            {socials.map((social, i) => {
              const isLast = i === socials.length - 1
              return (
                <div key={social.name} className="flex items-center gap-3 py-1">
                  <span className="text-crimson-text shrink-0">{isLast ? '└──' : '├──'}</span>
                  <a
                    href={social.icon === 'email' ? `mailto:${social.url}` : social.url}
                    target={social.icon === 'email' ? undefined : '_blank'}
                    rel="noreferrer"
                    className="interactive tracking-[0.25em] uppercase text-titanium hover:text-off-white transition-colors duration-300"
                  >
                    {social.name}
                  </a>
                  <span className="text-silver/75 tracking-[0.1em] hidden sm:inline text-[10px]">
                    {social.description}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[10px] tracking-[0.2em] text-silver/75">
            <span>LOCATION — {contact.location}</span>
            <span>TIMEZONE — {contact.timezone}</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export default Contact
