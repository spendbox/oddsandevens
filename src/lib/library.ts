import { blockText, type Block } from './types.ts'
import { tokenize } from './search.ts'

/**
 * The Library: drop documents in, get them filed.
 *
 * The problem it solves is the pile. People have a folder of things called
 * `scan_0012.pdf`, `Document (3).docx` and `IMG_20240211.pdf`, and the reason
 * they never read them again is that nothing in the list says what anything
 * is. Filing them by hand is an hour nobody has.
 *
 * So: the contents are read, each document is given a title and a sentence
 * saying what it is, and documents that turn out to be about the same thing
 * are offered as a project. Everything here is a *suggestion* shown before it
 * is applied — the same rule as the writing help, for the same reason.
 *
 * All of it works with no key and no network. The model makes the titles
 * better; it is not what makes them exist.
 */

/** Extensions we can turn into editable text rather than an attachment. */
export const READABLE = ['txt', 'md', 'markdown', 'csv', 'html', 'htm', 'pdf', 'docx'] as const

export function extensionOf(name: string): string {
  const at = name.lastIndexOf('.')
  return at > 0 ? name.slice(at + 1).toLowerCase() : ''
}

/**
 * Names that say nothing about the contents.
 *
 * A camera, a scanner and a browser's download folder all produce these, and
 * they are exactly the files somebody most needs help with. Matching them is
 * what decides whether the filename or the first line becomes the title.
 */
const NOISE = /^(img|image|photo|pic|picture|screenshot|screen shot|scan|scanned|scanned document|doc|document|file|new document|untitled|copy|copy of|final|final final|draft|download|attachment|export|note|notes|page)$/i

export function isUninformativeName(name: string): boolean {
  const cleaned = cleanFileName(name)
  if (!cleaned) return true
  // Nothing but digits, dates and separators: a scanner's counter.
  if (!/[a-z]{3}/i.test(cleaned)) return true
  const words = cleaned.split(' ').filter(Boolean)
  // "scan 0012", "IMG 20240211", "Document (3)" — a noise word and a number.
  const meaningful = words.filter((word) => !/^\d+$/.test(word) && !NOISE.test(word))
  if (!meaningful.length) return true
  /*
    One word mixing a short prefix with digits: DSC00194, IMG20240211,
    P1010023. Every camera and scanner produces these, and they are exactly
    the files that most need a title from their contents. The test is the
    length of the longest run of letters, so Budget2026 survives it.
  */
  if (words.length === 1 && /\d/.test(words[0])) {
    const longest = (words[0].match(/[a-z]+/gi) ?? []).reduce((a, b) => (b.length > a.length ? b : a), '')
    if (longest.length <= 4) return true
    if (words[0].length > 20) return true
  }
  return false
}

/** A filename as a person would write it: no extension, no underscores. */
export function cleanFileName(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]{1,5}$/i, '')
  return withoutExtension
    .replace(/[_+]+/g, ' ')
    // A hyphen between words is a separator; one inside a word may be part of
    // it, so only the padded and repeated ones go.
    .replace(/\s*-\s*/g, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Capitalised like a title, without shouting or forcing Title Case. */
function asTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  // An all-caps line is a heading style, not emphasis, so it is brought down.
  const cased = clean === clean.toUpperCase() && /[A-Z]{4}/.test(clean)
    ? clean.charAt(0) + clean.slice(1).toLowerCase()
    : clean
  return cased.charAt(0).toUpperCase() + cased.slice(1)
}

/** How long a title may be before it stops being a title. */
const TITLE_CHARS = 70

function shorten(text: string, max = TITLE_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, '')}…`
}

/**
 * A title worked out from the document itself.
 *
 * In order: a heading at the top, because a document that has one has already
 * said what it is; then the filename, when the filename says anything; then
 * the first line. The order matters — preferring the filename would title a
 * tenancy agreement "Scan 0012", which is the whole complaint.
 */
export function localTitle(name: string, blocks: Block[]): string {
  const heading = blocks.find((block) => block.type === 'heading' && block.text.trim())
  if (heading && heading.type === 'heading') return shorten(asTitle(heading.text))

  if (!isUninformativeName(name)) return shorten(asTitle(cleanFileName(name)))

  for (const block of blocks) {
    const text = blockText(block).trim()
    if (text.length > 2) return shorten(asTitle(text))
  }
  return 'Untitled'
}

/** How long a summary may be. One sentence, or close to it. */
const SUMMARY_CHARS = 180

/**
 * A sentence saying what the document is, taken from its opening.
 *
 * Leading headings are skipped. A heading is usually where the title came
 * from, and a summary that opens by repeating the title tells the reader
 * nothing they cannot already see two lines above it.
 */
export function localSummary(blocks: Block[]): string {
  let from = 0
  while (from < blocks.length && (blocks[from].type === 'heading' || !blockText(blocks[from]).trim())) {
    from++
  }
  const body = from < blocks.length ? blocks.slice(from) : blocks
  const text = body.map(blockText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= SUMMARY_CHARS) return text
  // Prefer a sentence boundary, so the summary does not stop mid-clause.
  const window = text.slice(0, SUMMARY_CHARS + 40)
  const stop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  if (stop > SUMMARY_CHARS * 0.5) return window.slice(0, stop + 1)
  return shorten(text, SUMMARY_CHARS)
}

/** The words that most distinguish a document, for grouping it with others. */
export function topicWords(text: string, count = 4): string[] {
  const counts = new Map<string, number>()
  for (const word of tokenize(text)) {
    if (word.length < 4) continue
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word]) => word)
}

export interface Filed {
  /** Index into the list that was handed in, so an answer cannot be misapplied. */
  n: number
  title: string
  summary: string
  /** One or two words for what it is about, used to group. */
  topic: string
}

/**
 * Reads the model's answer.
 *
 * Deliberately forgiving: the reply is JSON, but it arrives over a network
 * from a generative model, and a whole batch of imports should not be lost
 * because one entry came back malformed. Anything unusable is dropped, and
 * the caller keeps its own title for that document.
 */
export function parseFiling(raw: string, count: number): Filed[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: Filed[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const n = typeof item.n === 'number' ? item.n : Number(item.n)
    if (!Number.isInteger(n) || n < 1 || n > count) continue
    if (out.some((already) => already.n === n)) continue
    const title = typeof item.title === 'string' ? shorten(asTitle(item.title)) : ''
    if (!title) continue
    out.push({
      n,
      title,
      summary: typeof item.summary === 'string' ? shorten(item.summary.trim(), SUMMARY_CHARS) : '',
      topic: typeof item.topic === 'string' ? item.topic.trim().slice(0, 40) : '',
    })
  }
  return out
}

export interface Grouping {
  /** The project's name, or null for documents that belong with nothing else. */
  name: string | null
  /** Indexes into the list handed in. */
  members: number[]
}

/**
 * Which of a batch belong together.
 *
 * A project is only offered when at least two documents share a subject —
 * a project of one is a folder with a single file in it, which is worse than
 * no folder at all. Documents that match nothing stay loose, which is the
 * "organise without forcing organisation" half of the bargain.
 */
export function groupByTopic(topics: string[]): Grouping[] {
  const byTopic = new Map<string, number[]>()
  topics.forEach((topic, i) => {
    const key = topic.trim().toLowerCase()
    if (!key) return
    const members = byTopic.get(key)
    if (members) members.push(i)
    else byTopic.set(key, [i])
  })

  const groups: Grouping[] = []
  const taken = new Set<number>()
  // Largest groups first, so a document that could go in two lands in the
  // bigger one rather than wherever the map happened to be iterated.
  for (const [topic, members] of [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const free = members.filter((i) => !taken.has(i))
    if (free.length < 2) continue
    for (const i of free) taken.add(i)
    groups.push({ name: asTitle(topic), members: free })
  }

  const loose = topics.map((_, i) => i).filter((i) => !taken.has(i))
  if (loose.length) groups.push({ name: null, members: loose })
  return groups
}
