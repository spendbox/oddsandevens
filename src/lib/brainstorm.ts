'use client'

import { useSyncExternalStore } from 'react'

/**
 * Brainstorm: one outstanding thing, thought about properly.
 *
 * ## What this is for
 *
 * The Actions tab answers "what is still to be done". It used to have a
 * button that answered "which of these first", which was a reasonable
 * question and a thin one — the answer was a re-ordering of a list already
 * on the screen, and nobody read it twice. The question people actually
 * have about a line in a list is the next one along: *how do I do this*.
 *
 * So Brainstorm takes one item. It reads the notes on the device for what
 * bears on it, asks a few questions only the person knows the answers to,
 * and then produces something: the email drafted, the plan written out, the
 * script, the outline, the list of what to ask. Not advice about the work —
 * the work, as far as it can be done by somebody who has read the notes.
 *
 * ## Why the questions are a separate step
 *
 * Because the notes never contain the half of it. "Chase the landlord" has
 * a history the note does not carry: what was already said, what the
 * deadline really is, whether this is a first ask or a fourth. A model that
 * guesses at those writes a confident letter about the wrong thing. Asking
 * three questions costs a few seconds and is the difference between a draft
 * somebody sends and a draft somebody rewrites.
 *
 * They are skippable, because a question nobody wants to answer must never
 * be a gate: skipping gets a solution written from the notes alone, and it
 * says so.
 *
 * ## Why a refusal is a first-class answer
 *
 * A model asked to solve "sort out the thing" will produce a page of
 * plausible, useless structure rather than say it cannot. That page is
 * worse than nothing: it costs a read to discover it is empty, and after
 * two of them nobody opens this again. So the prompt gives it a way to say
 * no, this file has somewhere to put the no, and the screen prints it as
 * the answer rather than as an error.
 *
 * ## Why the solutions live on the device
 *
 * They are made out of notes that are already here, and they can be made
 * again. A row in a table, synced, would be a second copy of somebody's
 * writing living somewhere they cannot see it, for a thing that is a
 * working note about one line of one note. So it is localStorage, beside
 * the theme, the folds and the suggestions somebody has turned down — and
 * it is forgotten with all of them when the device changes hands, because
 * a solution is made of another person's notes.
 *
 * Which also decides what happens to one in flight when the page is
 * closed: it is lost. That is honest. A request has nowhere to carry on
 * from once the tab is gone, and pretending otherwise would mean a row
 * saying "working on it" for something nothing is working on.
 */

/** One thing the app asked, and what was typed back. Blank means skipped. */
export interface Asked {
  question: string
  answer: string
}

/** What came back about one outstanding thing. */
export interface Solution {
  /** Which line in which note: `docId:blockId`, the same shape as a no. */
  key: string
  /**
   * What the line said at the time.
   *
   * Kept so the screen can notice the line has since been rewritten, and
   * say the solution is about what it used to say rather than silently
   * showing an answer to a different question.
   */
  task: string
  asked: Asked[]
  /** The solution itself, as plain text. Empty when there is none. */
  text: string
  /** Why there is none, in the model's own words. Empty when there is one. */
  refusal: string
  /** The names of the notes it was written from, for the reader to check. */
  notes: string[]
  at: number
}

/** How one line in one note is named here — the same shape as `dismissKey`. */
export function brainstormKey(docId: string, blockId: string): string {
  return `${docId}:${blockId}`
}

/* ------------------------------------------------------- reading a reply */

/** Markdown notation stripped, because this is read as text and not painted. */
function plainLine(line: string): string {
  return line
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)/g, '')
    .trim()
}

/** The most questions worth asking before somebody stops answering them. */
const MAX_QUESTIONS = 4

/**
 * The questions out of a reply, read forgivingly.
 *
 * Lines that end in a question mark, because that is what a question is and
 * it survives every shape a model returns them in — numbered, bulleted,
 * under a heading, or after "Sure, here are three questions". When not one
 * line ends in a question mark the reply is taken as lines anyway rather
 * than as nothing: an answer that could not be parsed must not look like a
 * service that is down.
 */
export function readQuestions(reply: string): string[] {
  const lines = reply.split('\n').map(plainLine).filter(Boolean)
  const asked = lines.filter((line) => line.endsWith('?'))
  const found = asked.length ? asked : lines
  return found
    // A heading, a preamble or "Questions:" is not a question.
    .filter((line) => line.length > 8)
    .slice(0, MAX_QUESTIONS)
}

/** The longest a solution may be, so one cannot fill the browser's storage. */
export const MAX_SOLUTION_CHARS = 8_000

/**
 * A reply split into the solution and the refusal, exactly one of which is
 * there.
 *
 * The prompt asks for `CANNOT: <reason>` on its own first line when there
 * is nothing honest to say. Read case-insensitively and with a fence
 * tolerated in front of it, for the same reason `lib/compose.ts` reads a
 * title forgivingly: the shape of a reply is the one thing about a model
 * nobody can rely on.
 */
export function readSolution(reply: string): { text: string; refusal: string } {
  const clean = reply
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n\s*```\s*$/i, '')
    .trim()
  const match = /^cannot\s*[:\-—]\s*(.*)$/i.exec(clean.split('\n')[0] ?? '')
  if (match) {
    const reason = [match[1], ...clean.split('\n').slice(1)].join('\n').trim()
    return { text: '', refusal: reason || 'There is not enough here to work from.' }
  }
  return { text: clean.slice(0, MAX_SOLUTION_CHARS), refusal: '' }
}

/* ------------------------------------------------------------- the store */

const KEY = 'pad-brainstorm'
/** How many are kept. Past this the oldest goes: they can all be made again. */
const KEEP = 20

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The raw string, never a parsed object.
 *
 * `useSyncExternalStore` compares snapshots by identity and a freshly
 * parsed object is a new one every time — which is not a stale value, it is
 * an infinite render loop. The rule the theme, the folds, the noes and the
 * unread marks all follow.
 */
function raw(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Blocked site data: nothing is remembered, and everything still works.
    return ''
  }
}

const onServer = () => ''

function one(value: unknown): Solution | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const key = String(row.key ?? '')
  if (!key) return null
  const asked = Array.isArray(row.asked)
    ? row.asked
        .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}))
        .map((entry) => ({ question: String(entry.question ?? ''), answer: String(entry.answer ?? '') }))
        .filter((entry) => entry.question)
    : []
  return {
    key,
    task: String(row.task ?? ''),
    asked,
    text: String(row.text ?? '').slice(0, MAX_SOLUTION_CHARS),
    refusal: String(row.refusal ?? ''),
    notes: Array.isArray(row.notes) ? row.notes.map(String).slice(0, 12) : [],
    at: Number(row.at) || 0,
  }
}

/** Whatever was in storage, as solutions by key. Never throws. */
export function parseSolutions(text: string): Record<string, Solution> {
  if (!text) return {}
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object') return {}
    const out: Record<string, Solution> = {}
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const solution = one(entry)
      if (solution) out[solution.key] = solution
    }
    return out
  } catch {
    return {}
  }
}

/** Only the newest few are kept, because every one of them can be made again. */
export function trim(all: Record<string, Solution>, keep = KEEP): Record<string, Solution> {
  const rows = Object.values(all).sort((a, b) => b.at - a.at)
  const out: Record<string, Solution> = {}
  for (const row of rows.slice(0, keep)) out[row.key] = row
  return out
}

function write(all: Record<string, Solution>) {
  try {
    const kept = trim(all)
    if (Object.keys(kept).length) localStorage.setItem(KEY, JSON.stringify(kept))
    else localStorage.removeItem(KEY)
  } catch {
    // Full, or refused. The solution is on screen; it simply is not kept.
  }
  for (const listener of listeners) listener()
}

/** Keeps one, replacing whatever was there for that line. */
export function saveSolution(solution: Solution): void {
  write({ ...parseSolutions(raw()), [solution.key]: solution })
}

/** Throws one away, which is what "start again" does before it asks. */
export function dropSolution(key: string): void {
  const all = parseSolutions(raw())
  if (!(key in all)) return
  delete all[key]
  write(all)
}

/**
 * Forgets the lot, when the device changes hands.
 *
 * These are written out of somebody's notes and keyed by the ids of those
 * notes, so they mean nothing to the next account and are not a thing to
 * leave lying in a browser either.
 */
export function forgetSolutions(): void {
  write({})
}

/** What has been worked out, for the rows that say so. */
export function useSolutions(): Record<string, Solution> {
  return parseSolutions(useSyncExternalStore(subscribe, raw, onServer))
}
