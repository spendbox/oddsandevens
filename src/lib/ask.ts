import { docLabel } from './blocks.ts'
import { buildIndex, queryTerms, search, searchableText, type SearchIndex } from './search.ts'
import { blockText, type Doc } from './types.ts'

/**
 * Asking a question of everything you have written.
 *
 * The retrieval half happens here, on the device. The local index picks the
 * handful of notes that bear on the question, this file cuts the passages out
 * of them, and only those passages are sent to the model. Three things follow
 * from that order, and all three matter:
 *
 * - The whole collection never leaves the machine. A question about one
 *   meeting sends the paragraphs about that meeting, not ten years of notes.
 * - It stays affordable and quick at any size, because what is sent does not
 *   grow with what has been written.
 * - Every claim can be traced. The model is given numbered sources and asked
 *   to cite them, so an answer points at the note it came from rather than
 *   asking to be believed.
 */

/** One numbered extract, as the model sees it and as a citation refers to it. */
export interface Source {
  /** 1-based, and what a [1] in the answer refers to. */
  n: number
  docId: string
  title: string
  /** The passages that matched, joined. */
  text: string
  /** When the note was last written to, so "last week" means something. */
  updatedAt: number
}

/** How much text to carry around each match. */
const WINDOW = 300
/** The most any one note may contribute, so one long note cannot crowd out five. */
const PER_DOC_CHARS = 2_000
/** The budget for the whole question. */
const TOTAL_CHARS = 12_000
/** How many notes may be consulted at once. */
const MAX_DOCS = 8

/**
 * The passages of a text that bear on a set of words.
 *
 * Whole-word matches only — searching "on" should not centre a passage on
 * "London" — and overlapping windows are merged, or a paragraph that says a
 * word three times comes back three times over.
 */
export function passages(text: string, terms: string[], budget = PER_DOC_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= budget) return clean
  if (!terms.length) return `${clean.slice(0, budget).trimEnd()}…`

  const lower = clean.toLowerCase()
  const windows: Array<[number, number]> = []
  for (const term of terms) {
    let at = lower.indexOf(term)
    while (at !== -1) {
      const before = at === 0 ? ' ' : lower[at - 1]
      const after = lower[at + term.length] ?? ' '
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
        windows.push([Math.max(0, at - WINDOW / 2), Math.min(clean.length, at + term.length + WINDOW / 2)])
      }
      at = lower.indexOf(term, at + term.length)
    }
  }
  if (!windows.length) return `${clean.slice(0, budget).trimEnd()}…`

  windows.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of windows) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }

  const parts: string[] = []
  let spent = 0
  for (const [from, to] of merged) {
    if (spent >= budget) break
    const end = Math.min(to, from + (budget - spent))
    const piece = clean.slice(from, end).trim()
    if (!piece) continue
    parts.push((from > 0 ? '…' : '') + piece + (end < clean.length ? '…' : ''))
    spent += piece.length
  }
  return parts.join(' ')
}

export interface GatherOptions {
  maxDocs?: number
  totalChars?: number
}

/**
 * The notes a question should be answered from.
 *
 * A question is also a search: the words in it that are not "what did I" are
 * exactly the words worth looking for. When the phrasing is too conversational
 * to match anything, this falls back to the most recently written notes rather
 * than returning nothing — "what did I decide last week" names no subject at
 * all, and the recent notes are the honest answer to where to look.
 */
export function gatherSources(
  docs: Doc[],
  question: string,
  options: GatherOptions = {},
): Source[] {
  const maxDocs = options.maxDocs ?? MAX_DOCS
  const totalChars = options.totalChars ?? TOTAL_CHARS
  const index: SearchIndex = buildIndex(docs)
  const terms = queryTerms(question)
  const hits = search(index, question, maxDocs)

  const chosen: Array<{ doc: Doc; terms: string[] }> = hits.map((hit) => ({
    doc: hit.doc,
    terms: hit.matched,
  }))

  // Nothing matched, or barely anything did: fall back to what was written
  // most recently, which is what somebody asking a vague question means.
  if (chosen.length < Math.min(3, docs.length)) {
    const already = new Set(chosen.map((entry) => entry.doc.id))
    for (const doc of docs) {
      if (chosen.length >= Math.min(maxDocs, 5)) break
      if (already.has(doc.id) || doc.deletedAt) continue
      if (!searchableText(doc).trim()) continue
      chosen.push({ doc, terms })
    }
  }

  const sources: Source[] = []
  let spent = 0
  for (const { doc, terms: hitTerms } of chosen) {
    if (spent >= totalChars) break
    const body = doc.blocks.map(blockText).filter(Boolean).join('\n')
    const budget = Math.min(PER_DOC_CHARS, totalChars - spent)
    const text = passages(body, hitTerms, budget)
    if (!text) continue
    sources.push({
      n: sources.length + 1,
      docId: doc.id,
      title: docLabel(doc),
      text,
      updatedAt: doc.updatedAt,
    })
    spent += text.length
  }
  return sources
}

/**
 * The source numbers an answer cites, in the order they first appear.
 *
 * Used to show only the notes actually leaned on. A model that was given eight
 * and used two should show two — listing all eight underneath an answer is a
 * way of looking thorough while telling the reader nothing.
 */
export function citedSources(answer: string, sources: Source[]): Source[] {
  const seen: number[] = []
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1])
    if (!seen.includes(n)) seen.push(n)
  }
  return seen
    .map((n) => sources.find((source) => source.n === n))
    .filter((source): source is Source => !!source)
}

/** Splits an answer into text and citation markers, for rendering. */
export type AnswerPart =
  | { kind: 'text'; text: string }
  | { kind: 'cite'; n: number }

export function splitCitations(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let at = 0
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const start = match.index
    if (start > at) parts.push({ kind: 'text', text: answer.slice(at, start) })
    parts.push({ kind: 'cite', n: Number(match[1]) })
    at = start + match[0].length
  }
  if (at < answer.length) parts.push({ kind: 'text', text: answer.slice(at) })
  return parts
}
