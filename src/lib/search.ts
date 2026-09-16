import { blockText, type Doc } from './types.ts'

/**
 * Search across everything.
 *
 * "I don't want to remember where I put it three months ago" is the whole
 * problem, and substring matching does not solve it: it cannot rank, so the
 * document you wanted is somewhere in a list of forty, and it cannot tell you
 * *why* something matched, so you have to open each one to find out.
 *
 * This is a small BM25 index instead — the ranking function behind most search
 * engines. Terms that are rare across your notes count for more than common
 * ones, a short note mentioning something twice beats a long one mentioning it
 * twice, and every hit comes back with the passage that matched.
 *
 * It runs on the device, against the same IndexedDB copy everything else uses.
 * That means it works offline, it works instantly, and no query leaves the
 * machine — which matters rather a lot for the contents of somebody's notes.
 */

/** Words too common to discriminate between documents. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 's', 'she', 'so', 't', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you', 'your',
])

/** Splits text into searchable terms. */
export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Letters and digits in any script, so accented and non-Latin text works.
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
  )
}

/**
 * The searchable text of a document.
 *
 * The title is repeated because a title match is a much stronger signal than a
 * body match — someone searching "Lagos" wants the note called Lagos before
 * the one that mentions it in passing. Weighting by repetition keeps BM25's
 * maths intact rather than bolting a special case onto the scorer.
 */
const TITLE_WEIGHT = 4

export function searchableText(doc: Doc): string {
  const body = doc.blocks.map(blockText).join(' ')
  const title = doc.title.trim()
  return `${`${title} `.repeat(title ? TITLE_WEIGHT : 0)}${body}`
}

interface Entry {
  id: string
  doc: Doc
  /** Term -> how many times it appears. */
  counts: Map<string, number>
  length: number
  /** The body text as written, for pulling a snippet out of. */
  text: string
}

export interface SearchIndex {
  entries: Entry[]
  /** Term -> how many documents contain it. */
  docFrequency: Map<string, number>
  averageLength: number
}

/**
 * Builds the index.
 *
 * Callers should memoise this against the document list rather than rebuilding
 * it per keystroke; it is linear in the size of everything written.
 */
export function buildIndex(docs: Doc[]): SearchIndex {
  const entries: Entry[] = []
  const docFrequency = new Map<string, number>()
  let total = 0

  for (const doc of docs) {
    if (doc.deletedAt) continue
    const text = searchableText(doc)
    const terms = tokenize(text)
    const counts = new Map<string, number>()
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
    for (const term of counts.keys()) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1)
    }
    entries.push({
      id: doc.id,
      doc,
      counts,
      length: terms.length,
      text: [doc.title, ...doc.blocks.map(blockText)].filter(Boolean).join('  '),
    })
    total += terms.length
  }

  return {
    entries,
    docFrequency,
    averageLength: entries.length ? total / entries.length : 0,
  }
}

export interface SearchHit {
  doc: Doc
  score: number
  /** A readable passage, with the positions of the matched words in it. */
  snippet: string
  highlights: Array<[number, number]>
  /** Which query words actually matched, so a result can explain itself. */
  matched: string[]
}

/** BM25's two knobs, at the values the literature settled on. */
const K1 = 1.2
const B = 0.75

/**
 * Finds every index term a query word should match.
 *
 * Prefix matching is what makes search useful while it is still being typed —
 * "meet" has to find "meeting" before the writer finishes the word. An exact
 * hit always outranks a prefix one, or typing "meet" would rank a note about
 * "meetings" above a note titled "Meet".
 */
function expand(index: SearchIndex, word: string): Array<{ term: string; weight: number }> {
  const out: Array<{ term: string; weight: number }> = []
  if (index.docFrequency.has(word)) out.push({ term: word, weight: 1 })
  if (word.length >= 3) {
    for (const term of index.docFrequency.keys()) {
      if (term !== word && term.startsWith(word)) out.push({ term, weight: 0.6 })
    }
  }
  return out
}

export function search(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  const words = tokenize(query)
  if (!words.length) return []

  const total = index.entries.length || 1
  const hits: SearchHit[] = []

  for (const entry of index.entries) {
    let score = 0
    const matched: string[] = []

    for (const word of words) {
      let best = 0
      for (const { term, weight } of expand(index, word)) {
        const frequency = entry.counts.get(term)
        if (!frequency) continue
        const containing = index.docFrequency.get(term) ?? 0
        // Rare words say more about a document than common ones.
        const idf = Math.log(1 + (total - containing + 0.5) / (containing + 0.5))
        const normalised =
          frequency * (K1 + 1) /
          (frequency + K1 * (1 - B + (B * entry.length) / (index.averageLength || 1)))
        best = Math.max(best, idf * normalised * weight)
        if (!matched.includes(term)) matched.push(term)
      }
      score += best
    }

    // Every word must appear somewhere, or searching two words returns
    // everything containing either — which is how a search stops being useful
    // the moment a collection gets big.
    const everyWordFound = words.every((word) =>
      expand(index, word).some(({ term }) => entry.counts.has(term)),
    )
    if (score > 0 && everyWordFound) {
      const { snippet, highlights } = excerpt(entry.text, matched)
      hits.push({ doc: entry.doc, score, snippet, highlights, matched })
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt)
    .slice(0, limit)
}

/** How much text to show around a match. */
const SNIPPET_CHARS = 180

/**
 * The most useful passage of a document for a given set of matched words.
 *
 * Centred on the first match rather than the start of the document, because
 * the opening line of a note is rarely the reason it came back.
 */
export function excerpt(
  text: string,
  terms: string[],
): { snippet: string; highlights: Array<[number, number]> } {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!terms.length || !clean) {
    return { snippet: clean.slice(0, SNIPPET_CHARS), highlights: [] }
  }

  const lower = clean.toLowerCase()
  let first = -1
  for (const term of terms) {
    const at = lower.indexOf(term)
    if (at !== -1 && (first === -1 || at < first)) first = at
  }
  if (first === -1) return { snippet: clean.slice(0, SNIPPET_CHARS), highlights: [] }

  // Start a little before the match so it does not sit against the left edge,
  // and step back to a word boundary so the snippet does not begin mid-word.
  let start = Math.max(0, first - 60)
  if (start > 0) {
    const space = clean.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  const snippet =
    (start > 0 ? '…' : '') +
    clean.slice(start, start + SNIPPET_CHARS) +
    (start + SNIPPET_CHARS < clean.length ? '…' : '')

  const highlights: Array<[number, number]> = []
  const snippetLower = snippet.toLowerCase()
  for (const term of terms) {
    let at = snippetLower.indexOf(term)
    while (at !== -1) {
      // Whole words only, or "on" would light up inside "London".
      const before = at === 0 ? ' ' : snippetLower[at - 1]
      const after = snippetLower[at + term.length] ?? ' '
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
        highlights.push([at, at + term.length])
      }
      at = snippetLower.indexOf(term, at + term.length)
    }
  }

  // Merged and sorted, so the renderer can walk them in one pass.
  highlights.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of highlights) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }

  return { snippet, highlights: merged }
}

/**
 * Whether a query reads like a question rather than a lookup.
 *
 * A question is a different intent: "what did I decide about the budget" wants
 * an answer assembled from several notes, not a list of files. Getting this
 * wrong in either direction is cheap — both routes stay one tap apart — so the
 * test is deliberately simple.
 */
export function looksLikeQuestion(query: string): boolean {
  const text = query.trim().toLowerCase()
  if (text.length < 8) return false
  if (text.endsWith('?')) return true
  return /^(what|when|where|who|why|how|which|did|do|does|is|are|was|were|can|should|summari[sz]e|list|tell me|remind me|find everything|turn (these|this|my))\b/.test(
    text,
  )
}
