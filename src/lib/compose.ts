/**
 * Turning what somebody typed into the box into a note.
 *
 * ## Why the reply is parsed forgivingly
 *
 * Because the alternative is losing a note. The model is asked for a title
 * line and then the note, and nine times out of ten that is exactly what comes
 * back — but a reply that opens with "Sure, here you go", or forgets the
 * TITLE: prefix, or wraps the whole thing in a code fence, must still end up
 * as the note the person wrote. Every one of those is a line of code here and
 * a test below it, which is a far better trade than a rejected reply.
 *
 * ## Why there is a local answer at all
 *
 * The same bargain the rest of this app makes: no key, no network, a refusal
 * or a timeout costs the *quality* of the note and never the note. What was
 * typed is kept either way, and a title is worked out from its first line.
 * Nobody loses what they wrote because a server was busy.
 *
 * No DOM and no fetch in here, so every awkward reply is a unit test rather
 * than something to reproduce by typing.
 */

import { blockText, type Block } from './types.ts'

/** A note, split into what it is called and what is in it. */
export interface Composed {
  title: string
  body: string
}

/** How long a made-up title may be before it is cut. */
const TITLE_MAX = 60

/**
 * Reads the model's reply into a title and a note.
 *
 * Never throws, and never returns an empty body for a non-empty reply: if
 * nothing can be recognised, the whole reply is the note.
 */
export function splitComposed(reply: string): Composed {
  let text = reply.trim()
  if (!text) return { title: '', body: '' }

  // A whole answer wrapped in a code fence. It happens when the note itself
  // contained one, and unwrapping it is better than a note made of backticks.
  const fenced = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(text)
  if (fenced) text = fenced[1].trim()

  const lines = text.split('\n')
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    const found = /^\s*(?:#+\s*)?title\s*[:—-]\s*(.+)$/i.exec(lines[i])
    if (!found) continue
    const title = cleanTitle(found[1])
    const body = lines.slice(i + 1).join('\n').trim()
    // A reply that was *only* a title line is a note of one line, not a note
    // with nothing in it.
    return { title, body: body || title }
  }

  // No title line. A leading markdown heading is the next best thing somebody
  // meant as a name.
  const heading = /^#{1,3}\s+(.+)$/.exec(lines[0] ?? '')
  if (heading) {
    return { title: cleanTitle(heading[1]), body: lines.slice(1).join('\n').trim() }
  }

  return { title: titleFrom(text), body: text }
}

/**
 * A name for a note, from the note itself.
 *
 * Used when there is no key, when the reply carried no title, and whenever a
 * note has been written without one. Nobody is ever asked to name a note: the
 * first line almost always says what it is, and a box that has to be filled in
 * before you can write is the thing that stops people writing.
 */
export function titleFrom(text: string): string {
  for (const raw of text.split('\n')) {
    const line = cleanTitle(raw)
    if (!line) continue
    if (line.length <= TITLE_MAX) return line
    // A long opening line is cut at a word, and the sentence it came from is
    // still the first line of the note itself.
    const cut = line.slice(0, TITLE_MAX)
    const at = cut.lastIndexOf(' ')
    return `${(at > 20 ? cut.slice(0, at) : cut).trimEnd()}…`
  }
  return ''
}

/** One line, with the notation and the trailing punctuation taken off. */
function cleanTitle(line: string): string {
  return line
    .trim()
    // Markdown a title has no use for: heading hashes, list markers, quotes,
    // and emphasis around the whole of it.
    .replace(/^[#>\s]*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\[[ xX]?\]\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/[.,;:]+$/, '')
    .trim()
}

/**
 * Takes the line a note's name was made from out of the note.
 *
 * Only where the name *was* made from it — a name the model wrote, or one
 * somebody typed, leaves the writing alone. Without this, a note dashed off in
 * one line is shown twice on its own page: once in the title field, once as
 * the only line under it. A one-line note ends up as a name and a blank page
 * with the caret in it, which is exactly what it is.
 */
export function withoutTitleLine(blocks: Block[], title: string): Block[] {
  const name = title.replace(/…$/, '').trim()
  if (!name) return blocks
  const out: Block[] = []
  let taken = false
  for (const block of blocks) {
    if (!taken) {
      const text = blockText(block).trim()
      if (!text) continue
      taken = true
      if (text.startsWith(name)) {
        const rest = text.slice(name.length).replace(/^[\s—–-]+/, '').trim()
        if (!rest) continue
        out.push({ ...block, text: rest, html: undefined } as Block)
        continue
      }
    }
    out.push(block)
  }
  return out
}

/**
 * What pressing Return in the box should put at the start of the next line.
 *
 * A box you write a list in has to carry the list on, or every item after the
 * first is typed by hand — which is exactly the complaint, and exactly what
 * every note app does for you. Returns null when the line is not a list item,
 * and an empty string when it is an item with nothing in it, which is the
 * signal to end the list rather than add another empty bullet to it.
 */
export function nextListPrefix(line: string): string | null {
  const found = /^(\s*)([-*]|\d{1,3}[.)]|\[[ xX]?\])(\s+)(.*)$/.exec(line)
  if (!found) return null
  const [, lead, marker, gap, rest] = found
  // An item with nothing in it ends the list, the way Return does on the page.
  if (!rest.trim()) return ''
  if (/^\d/.test(marker)) {
    const n = Number.parseInt(marker, 10)
    const punctuation = marker.slice(-1)
    return `${lead}${Number.isFinite(n) ? n + 1 : 1}${punctuation}${gap}`
  }
  // A box carries on as an empty box, never as a ticked one.
  if (marker.startsWith('[')) return `${lead}[ ]${gap}`
  return `${lead}${marker}${gap}`
}
