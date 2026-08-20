/**
 * Voice command grammar.
 *
 * Matching is intentionally forgiving. Speech recognition returns whatever it
 * heard, not what the visitor meant — "show me my projects", "open the
 * projects", and "projects" all have to land on the same intent, and a strict
 * phrase table would reject two of the three.
 *
 * Each command scores against the transcript: a required subject keyword plus
 * optional verbs. The highest scoring command above a floor wins, so unrelated
 * speech in the room does not fire navigation.
 */

/** Verbs that merely frame a command and carry no meaning of their own. */
const VERBS = ['show', 'open', 'go', 'to', 'me', 'my', 'the', 'a', 'please', 'take', 'jump', 'navigate']

export const COMMANDS = [
  { id: 'projects', subjects: ['projects', 'project', 'work', 'portfolio'], action: { type: 'section', target: 'projects' }, say: 'PROJECTS' },
  { id: 'skills', subjects: ['skills', 'skill', 'stack', 'technologies'], action: { type: 'section', target: 'skills' }, say: 'SKILLS' },
  { id: 'about', subjects: ['about', 'identity', 'bio'], action: { type: 'section', target: 'about' }, say: 'ABOUT' },
  { id: 'lab', subjects: ['lab', 'laboratory', 'ailab', 'experiments'], action: { type: 'section', target: 'ailab' }, say: 'AI LAB' },
  { id: 'experience', subjects: ['experience', 'career', 'history'], action: { type: 'section', target: 'experience' }, say: 'EXPERIENCE' },
  { id: 'achievements', subjects: ['achievements', 'achievement', 'awards'], action: { type: 'section', target: 'achievements' }, say: 'ACHIEVEMENTS' },
  { id: 'contact', subjects: ['contact', 'connect', 'email', 'reach'], action: { type: 'section', target: 'contact' }, say: 'CONTACT' },
  { id: 'home', subjects: ['home', 'top', 'hero', 'start', 'beginning'], action: { type: 'section', target: 'hero' }, say: 'HOME' },

  { id: 'back', subjects: ['back', 'previous', 'return'], action: { type: 'back' }, say: 'GO BACK' },
  { id: 'linkedin', subjects: ['linkedin'], action: { type: 'social', target: 'linkedin' }, say: 'LINKEDIN' },
  { id: 'github', subjects: ['github', 'git'], action: { type: 'social', target: 'github' }, say: 'GITHUB' },
  { id: 'instagram', subjects: ['instagram', 'insta', 'gram'], action: { type: 'social', target: 'instagram' }, say: 'INSTAGRAM' },

  { id: 'palette', subjects: ['command', 'commands', 'menu', 'palette', 'search'], action: { type: 'palette' }, say: 'COMMAND CENTER' },
  { id: 'stop', subjects: ['stop', 'sleep', 'quiet', 'cancel', 'disable'], action: { type: 'stop' }, say: 'MIC OFF' },
]

const normalise = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Resolve a spoken phrase to a command.
 * @returns {{ command: object, score: number } | null}
 */
export function matchCommand(transcript) {
  const text = normalise(transcript)
  if (!text) return null

  const words = text.split(' ')
  // Only the tail of a long utterance matters — recognisers accumulate the
  // whole session's speech, and matching against all of it would keep
  // re-firing the first command the visitor ever said.
  const recent = words.slice(-8)

  let best = null

  for (const command of COMMANDS) {
    let score = 0
    let matchedSubject = false

    for (const subject of command.subjects) {
      const idx = recent.lastIndexOf(subject)
      if (idx !== -1) {
        matchedSubject = true
        // Later in the utterance means more likely to be what they just said.
        score += 10 + idx
        break
      }
    }

    if (!matchedSubject) continue

    for (const word of recent) {
      if (VERBS.includes(word)) score += 1
    }

    if (!best || score > best.score) best = { command, score }
  }

  // "back" and "stop" are single common words that show up inside ordinary
  // speech, so they need to be more deliberate than a passing mention.
  if (best && (best.command.id === 'back' || best.command.id === 'stop') && recent.length > 5) {
    return null
  }

  return best && best.score >= 10 ? best : null
}

/** Human-readable command list, for the help panel and the typed fallback. */
export const COMMAND_HINTS = [
  'Show projects',
  'Open skills',
  'Go to about',
  'Open lab',
  'Go to contact',
  'Open LinkedIn',
  'Go back',
]
