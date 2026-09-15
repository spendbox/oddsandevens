/**
 * The things a word processor does without being asked.
 *
 * Every rule here is deliberately conservative, because the failure mode of
 * "helpful" typing is not a missing feature — it is an editor that fights the
 * person using it. Each one is therefore: predictable, visible the instant it
 * happens, and undone by a single Backspace.
 *
 * Pure functions with no DOM, so the edge cases that make these infuriating
 * (an abbreviation, a decimal point, an asterisk used as a footnote) are
 * tested rather than discovered in use.
 */

/** Abbreviations after which a full stop does not end a sentence. */
const ABBREVIATIONS = [
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'e.g', 'i.e', 'etc', 'vs', 'approx', 'no', 'fig', 'al',
]

/**
 * Whether a character typed at the end of `before` should be capitalised.
 *
 * True at the very start of a block, and after a sentence has clearly ended.
 * "Clearly" is doing the work: a full stop is not enough on its own, because
 * "3.5", "e.g." and "etc." all contain one.
 */
export function shouldCapitalise(before: string, typed: string): boolean {
  // Only letters, and only ones that have a capital form to move to.
  if (typed.length !== 1 || !/\p{Ll}/u.test(typed)) return false

  const trimmed = before.trimEnd()
  if (trimmed === '') return true

  // A sentence ends with . ! or ? followed by whitespace. Without the trailing
  // space the writer is still inside the sentence.
  if (!/[.!?]["')\]]?\s+$/.test(before)) return false

  // "3.5" and "no. 4" are not sentence ends.
  const lastWord = trimmed.replace(/["')\]]$/, '').split(/\s+/).pop() ?? ''
  if (/\d[.!?]$/.test(lastWord)) return false

  const bare = lastWord.replace(/[.!?]+$/, '').toLowerCase()
  if (ABBREVIATIONS.includes(bare)) return false
  // A single initial, as in "J. Smith".
  if (/^\p{Lu}$/u.test(lastWord.replace(/[.!?]+$/, ''))) return false

  return true
}

/**
 * Whether pressing Enter at the end of this line should start a bullet list.
 *
 * A line ending in a colon is announcing a list almost every time it is
 * written. Trailing whitespace is ignored; a colon in the middle is not a
 * signal, and neither is a lone colon with nothing in front of it.
 */
export function colonStartsList(text: string): boolean {
  const trimmed = text.trimEnd()
  if (!trimmed.endsWith(':')) return false
  const before = trimmed.slice(0, -1).trim()
  if (!before) return false
  // A time or a ratio is not an announcement.
  if (/\d$/.test(before)) return false
  // A URL scheme, which is never a heading for a list.
  if (/\b(https?|mailto|tel|ftp)$/i.test(before)) return false
  return true
}

export interface InlineFormat {
  /** How many characters before the caret the match began. */
  length: number
  /** The text that should remain, without the markers. */
  text: string
  /** The tag to wrap it in. */
  tag: 'b' | 'i' | 'code'
}

/**
 * Detects a completed markdown-style inline span just before the caret.
 *
 * Called when the closing character is typed, with `before` being everything
 * up to and including it. Returns null unless the whole span is present, so a
 * lone asterisk or a footnote marker is left alone.
 */
export function inlineFormatAt(before: string): InlineFormat | null {
  // Bold first: "**x**" also ends with a single "*", so the single-asterisk
  // rule would claim it and leave a stray pair behind.
  const patterns: Array<{ re: RegExp; tag: InlineFormat['tag'] }> = [
    { re: /\*\*([^*\s][^*]*?)\*\*$/, tag: 'b' },
    { re: /(?<![*\w])\*([^*\s][^*]*?)\*$/, tag: 'i' },
    { re: /(?<!`)`([^`\s][^`]*?)`$/, tag: 'code' },
  ]

  for (const { re, tag } of patterns) {
    const match = re.exec(before)
    if (match && match.index !== undefined) {
      const whole = match[0]
      const inner = match[1]
      // A span has to contain something other than markers.
      if (!inner.trim()) continue
      return { length: whole.length, text: inner, tag }
    }
  }
  return null
}

/**
 * Whether a document's opening line reads like its title.
 *
 * Applied once, to the first block of a document that has no heading yet, at
 * the moment Enter is pressed. Short, no terminal punctuation, not a list
 * item: the shape of a title rather than of a sentence someone has started.
 */
export function looksLikeTitle(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 60) return false
  if (/[.!?,;:]$/.test(trimmed)) return false
  // More than about nine words is a sentence, not a heading.
  if (trimmed.split(/\s+/).length > 9) return false
  // Markdown shortcuts and list markers handle themselves.
  if (/^[-*#>[\]]/.test(trimmed)) return false
  return true
}

/** Indent levels a block can reach. Deeper than this is unreadable. */
export const MAX_INDENT = 5

export function nextIndent(current: number | undefined, direction: 1 | -1): number {
  const at = current ?? 0
  return Math.max(0, Math.min(MAX_INDENT, at + direction))
}

/** The bullet glyph for a nesting depth, cycling the way word processors do. */
export function bulletFor(indent: number | undefined): 'disc' | 'circle' | 'square' {
  const level = (indent ?? 0) % 3
  return level === 0 ? 'disc' : level === 1 ? 'circle' : 'square'
}
