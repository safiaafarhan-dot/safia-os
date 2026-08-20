import emailjs from '@emailjs/browser'
import { contact } from '../data'

/**
 * Contact transmission.
 *
 * Two paths, chosen by whether EmailJS credentials are present at build time:
 *
 *  1. Configured   -> the message is sent through EmailJS and we report a real
 *                     success or a real failure.
 *  2. Unconfigured -> we do NOT fake a success. The caller falls back to opening
 *                     the visitor's mail client with the message pre-filled, so
 *                     the form still does something truthful and useful.
 *
 * Only EmailJS's *public* key is referenced here. It is designed to be exposed
 * in browser code and is domain-restricted in the EmailJS dashboard. Never put
 * a private/secret key in a VITE_ variable — anything VITE_-prefixed is inlined
 * into the client bundle. For stricter control, proxy through a serverless
 * function instead and drop these three variables.
 */
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export const isTransmissionConfigured = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY)

/** Opens the visitor's mail client with the message pre-filled. */
export const composeMailto = ({ name, email, message }) => {
  const subject = `SAFIA.OS — message from ${name}`
  const body = `${message}\n\n—\nFrom: ${name}\nReply to: ${email}`
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * @returns {Promise<{ status: 'sent' | 'unconfigured' | 'error', error?: string }>}
 */
export const sendMessage = async ({ name, email, message }) => {
  if (!isTransmissionConfigured) {
    return { status: 'unconfigured' }
  }

  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        from_name: name,
        reply_to: email,
        message,
        to_email: contact.email,
      },
      { publicKey: PUBLIC_KEY }
    )
    return { status: 'sent' }
  } catch (err) {
    return {
      status: 'error',
      error: err?.text || err?.message || 'Transmission failed.',
    }
  }
}
