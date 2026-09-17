import { escapeHtml, htmlToPlain } from './rich-text.ts'
import type { Align, BlockType } from './types.ts'

/**
 * What a line was trying to be.
 *
 * ## The idea
 *
 * People already write structure into plain text. They type "- " before a
 * thing in a list, "1." before a step, "[]" before something to do, "#" before
 * a title and "**this**" when they mean it emphatically — not because an
 * editor told them to, but because that is how notes have been written on
 * paper and in text files for decades. An editor that makes them stop and
 * reach for a menu to say the same thing again is asking them to do the work
 * twice.
 *
 * So nothing here predicts anything. It reads what somebody actually typed and
 * gives it the shape they were plainly aiming at, at the moment they move to
 * the next line — which is the moment the line is finished and the moment a
 * change to it cannot interrupt anything.
 *
 * ## Why there is no model in it
 *
 * Because there does not need to be. Every rule below is a string comparison:
 * it runs in microseconds, it runs offline, it costs nothing, it is the same
 * every time, and it is a unit test rather than something to reproduce by
 * typing at a laptop. A model would be slower, dearer, occasionally wrong in a
 * way nobody could predict, and no better at recognising "- ".
 *
 * ## The line that is held
 *
 * Every change here is reversible with one undo, and none of them rewrites a
 * word. Markers are removed because they were notation, never content;
 * emphasis is painted rather than retyped. Nothing invents, reorders,
 * shortens or corrects what somebody wrote. An editor that cannot be told
 * "no" is one people switch off, and an editor that rewrites your sentences is
 * one they stop trusting the first time it is wrong.
 */

/** What a line should become. */
export interface Shape {
  type: BlockType
  level?: 1 | 2 | 3
  ordered?: boolean
  done?: boolean
  /** The text with any notation taken off. */
  text: string
  /** How it should be painted, when there is emphasis in it. */
  html?: string
  align?: Align
}

/** What the line is now, so a rule can tell a change from a no-op. */
export interface Current {
  type: BlockType
  level?: 1 | 2 | 3
  ordered?: boolean
  done?: boolean
  text: string
  html?: string
}

/**
 * How long a line can be and still be a heading or a lead-in.
 *
 * Both of those rules are guesses about intent rather than readings of
 * notation, so both are kept to the length at which the guess is nearly always
 * right. Sixty-four characters is about eleven words: past that somebody is
 * writing a sentence, whatever its capitals or its punctuation.
 */
const SHORT = 64

/** The notation people write in front of a line, and what it means. */
const MARKERS: Array<{
  match: RegExp
  shape: (m: RegExpExecArray) => Omit<Shape, 'text' | 'html'> & { rest: string }
}> = [
  // A run of three or more dashes, stars or underscores on its own line.
  {
    match: /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/,
    shape: () => ({ type: 'divider', rest: '' }),
  },
  {
    match: /^(#{1,3})\s+(.*)$/,
    shape: (m) => ({ type: 'heading', level: m[1].length as 1 | 2 | 3, rest: m[2] }),
  },
  // "[] ", "[ ] " and "[x] " — the way a checkbox has been typed since email.
  {
    match: /^\[([ xX]?)\]\s*(.*)$/,
    shape: (m) => ({ type: 'todo', done: /[xX]/.test(m[1]), rest: m[2] }),
  },
  // "TODO:", "Action:", "Task:" — the way it is written when there is no
  // checkbox to hand.
  {
    match: /^(?:to[- ]?do|action|task)\s*:\s*(.+)$/i,
    shape: (m) => ({ type: 'todo', done: false, rest: m[1] }),
  },
  {
    match: /^(\d{1,3})[.)]\s+(.*)$/,
    shape: (m) => ({ type: 'bullet', ordered: true, rest: m[2] }),
  },
  // An en dash and a bullet character are in here because that is what a
  // phone's keyboard and a pasted document actually produce.
  {
    match: /^[-*•–]\s+(.*)$/,
    shape: (m) => ({ type: 'bullet', rest: m[1] }),
  },
  {
    match: /^>\s+(.*)$/,
    shape: (m) => ({ type: 'quote', rest: m[1] }),
  },
]

/**
 * Turns the emphasis people type into the emphasis they meant.
 *
 * Escaped first and marked up second, so a line containing "<b>" is a line
 * containing those five characters and never a tag. Doubles are matched before
 * singles, or "**bold**" is read as an italic star.
 *
 * Returns null when there was no notation, which is the common case by a very
 * long way and is what keeps this from rewriting every line it sees.
 */
export function inlineMarkup(text: string): string | null {
  const escaped = escapeHtml(text)
  let html = escaped
  html = html.replace(/(?<![*\w])\*\*([^*\n]+?)\*\*(?!\*)/g, '<b>$1</b>')
  html = html.replace(/(?<![_\w])__([^_\n]+?)__(?!_)/g, '<b>$1</b>')
  html = html.replace(/(?<![*\w])\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>')
  html = html.replace(/(?<![_\w])_([^_\n]+?)_(?!_)/g, '<i>$1</i>')
  html = html.replace(/(?<!~)~~([^~\n]+?)~~(?!~)/g, '<s>$1</s>')
  html = html.replace(/(?<!`)`([^`\n]+?)`(?!`)/g, '<code>$1</code>')
  return html === escaped ? null : html
}

/** Whether a line is shouted: capitals, no full stop, and short. */
function shouted(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4) return false
  if (text.length > SHORT) return false
  if (/[a-z]/.test(text)) return false
  // A sentence that happens to be in capitals is still a sentence.
  if (/[.!?]$/.test(text.trim())) return false
  return text.trim().split(/\s+/).length <= 8
}

/** Whether a line is a lead-in: short, ends in a colon, has words in it. */
function leadIn(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.endsWith(':')) return false
  if (trimmed.length > SHORT) return false
  return /[A-Za-z]/.test(trimmed)
}

/**
 * Reads a line and says what it should become, or null to leave it alone.
 *
 * Notation wins over guesswork: a line that starts with "- " is a bullet
 * whatever else is true of it. Only when there is no notation at all do the
 * two guessing rules get a look, and both are narrow on purpose.
 */
export function beautify(current: Current): Shape | null {
  const text = current.text

  for (const marker of MARKERS) {
    const found = marker.match.exec(text)
    if (!found) continue
    const { rest, ...shape } = marker.shape(found)
    // Notation already honoured. Retyping "- " inside a bullet means a dash.
    if (current.type === shape.type && rest === text) return null
    const inner = shaped(rest, undefined)
    return { ...shape, text: inner.text, html: inner.html }
  }

  // Emphasis, and the two guesses. None of them applies to a line that is
  // already something other than a paragraph or a list item: turning the text
  // of a heading bold, or a quote into a second heading, is noise.
  const plainish =
    current.type === 'text' || current.type === 'bullet' || current.type === 'todo'
  if (!plainish) {
    const marked = emphasisOnly(current)
    return marked
  }

  if (current.type === 'text' && shouted(text)) {
    return { type: 'heading', level: 2, text }
  }

  if (current.type === 'text' && leadIn(text) && !hasPainted(current)) {
    return { type: 'text', text, html: `<b>${escapeHtml(text)}</b>` }
  }

  return emphasisOnly(current)
}

/** Applies the inline notation and nothing else. */
function emphasisOnly(current: Current): Shape | null {
  // A line somebody has already formatted by hand is left alone: applying
  // notation to its plain text would throw that formatting away.
  if (hasPainted(current)) return null
  const html = inlineMarkup(current.text)
  if (!html) return null
  return {
    type: current.type,
    level: current.level,
    ordered: current.ordered,
    done: current.done,
    text: htmlToPlain(html),
    html,
  }
}

/** Whether this line already carries formatting somebody applied by hand. */
function hasPainted(current: Current): boolean {
  return !!current.html && current.html !== escapeHtml(current.text)
}

/** The text and painting for a line with its notation removed. */
function shaped(text: string, html?: string): { text: string; html?: string } {
  if (html) return { text, html }
  const marked = inlineMarkup(text)
  return marked ? { text: htmlToPlain(marked), html: marked } : { text }
}

/**
 * What pressing Enter at the end of this line should make next.
 *
 * A list carries on, because that is what every editor and every word
 * processor has done since lists existed — and a heading does not, because
 * nobody wants two titles in a row. Everything else becomes a paragraph.
 */
export function continues(type: BlockType, ordered?: boolean): { type: BlockType; ordered?: boolean } {
  if (type === 'bullet') return ordered ? { type: 'bullet', ordered: true } : { type: 'bullet' }
  if (type === 'todo') return { type: 'todo' }
  return { type: 'text' }
}
