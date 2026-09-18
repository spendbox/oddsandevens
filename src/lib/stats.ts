import { kindOf, KIND_LABELS, type NoteKind } from './kind.ts'
import { blockText, type Doc } from './types.ts'

/**
 * What somebody has actually written, counted.
 *
 * ## Why a dashboard at all, in an app that has taken everything out
 *
 * Because the one thing a list of notes cannot show is the shape of the
 * habit. Forty rows say what you wrote; they do not say that you have written
 * something every weekday this month, or that half of it is meetings, or that
 * there are nineteen boxes nobody has ticked. Those are one screen, read
 * occasionally, and the moment it becomes more than one screen it is a second
 * app.
 *
 * ## Why every number here is worked out on the device
 *
 * The same bargain as the icons, the kinds and the Actions list: instant,
 * offline, free, identical every time, and a unit test rather than something
 * to check by eye. Nothing here is asked of a server and nothing is asked of
 * a model — a dashboard that costs a request every time somebody glances at
 * it is a dashboard they stop opening, and one that needs a network is a
 * screen this app is not allowed to have.
 *
 * ## Why the numbers are the honest ones
 *
 * Every count here is one the reader could arrive at themselves by opening
 * their notes and counting. The boxes are every box in every live note, not
 * the Actions tab's list — that one is capped per note and filtered by what
 * somebody has turned down, which is right for a list to read and wrong for a
 * number to print.
 */

/** One day of the strip: when it was, what to call it, how much was written. */
export interface DayCount {
  /** Midnight at the start of that day, local time. */
  at: number
  /** One letter for the weekday, which is all a fourteen-day strip has room for. */
  label: string
  count: number
}

export interface KindCount {
  kind: NoteKind
  label: string
  count: number
}

export interface Summary {
  /** Live notes: nothing in the trash, nothing destroyed. */
  notes: number
  /** Words across all of them, titles included. */
  words: number
  /** Notes started in the last seven days. */
  thisWeek: number
  favourites: number
  /** Boxes nobody has ticked, and boxes somebody has. */
  open: number
  done: number
  /** Notes left out of the Actions tab on purpose. */
  ignored: number
  /** What kinds they are, commonest first, with the empty kinds left out. */
  kinds: KindCount[]
  /** The last fourteen days, oldest first. */
  days: DayCount[]
  /** The busiest of those days, which is what the bars are drawn against. */
  busiest: number
  /** Days in a row ending today — or yesterday, if today is still young. */
  streak: number
}

/** How many days the strip shows. Two weeks fits a phone and says enough. */
const STRIP = 14

const DAY_MS = 86_400_000

/** Midnight at the start of the day a moment falls in, local time. */
function startOfDay(at: number): number {
  const d = new Date(at)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Words, counted the way a person would: runs of non-space.
 *
 * Not a tokeniser — `lib/search.ts` has one of those and it is a different
 * job, because it drops punctuation and folds case to make an index. This is
 * a number somebody could check by looking, so "don't" is one word and so is
 * "£40".
 */
export function wordsIn(doc: Doc): number {
  let total = 0
  const count = (text: string) => {
    const trimmed = text.trim()
    if (trimmed) total += trimmed.split(/\s+/).length
  }
  count(doc.title)
  for (const block of doc.blocks) count(blockText(block))
  return total
}

/**
 * Days written on in a row, counting back from today.
 *
 * It counts back from yesterday when nothing has been written today, because
 * a streak reported as broken at nine in the morning is a streak nobody
 * believes — the day is not over. Ties to the *day a note was started*, not
 * the day it was last touched: editing an old note is not writing something.
 */
function streakOf(starts: Set<number>, now: number): number {
  const today = startOfDay(now)
  let day = starts.has(today) ? today : today - DAY_MS
  // Nothing today and nothing yesterday is a streak of none, however long
  // the run before it was.
  if (!starts.has(day)) return 0
  let run = 0
  while (starts.has(day)) {
    run++
    day -= DAY_MS
  }
  return run
}

/**
 * Everything the dashboard shows, from the notes already in memory.
 *
 * One pass over the blocks, because this is called with every note somebody
 * has and a phone should not feel it. `now` is a parameter so midnights, the
 * turn of a week and an empty collection are unit tests rather than something
 * to reproduce by waiting.
 */
export function summarise(docs: Doc[], now = Date.now()): Summary {
  const live = docs.filter((doc) => !doc.deletedAt && !doc.purgedAt)

  let words = 0
  let open = 0
  let done = 0
  let favourites = 0
  let ignored = 0
  let thisWeek = 0

  const counts = new Map<NoteKind, number>()
  const perDay = new Map<number, number>()
  const starts = new Set<number>()
  const weekAgo = now - 7 * DAY_MS

  for (const doc of live) {
    words += wordsIn(doc)
    if (doc.favoritedAt) favourites++
    if (doc.ignoreTasks) ignored++
    if (doc.createdAt >= weekAgo) thisWeek++

    for (const block of doc.blocks) {
      if (block.type !== 'todo') continue
      if (block.done) done++
      else open++
    }

    const kind = kindOf(doc)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)

    const day = startOfDay(doc.createdAt)
    starts.add(day)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
  }

  const kinds: KindCount[] = [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: KIND_LABELS[kind], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const today = startOfDay(now)
  const days: DayCount[] = []
  for (let i = STRIP - 1; i >= 0; i--) {
    const at = today - i * DAY_MS
    days.push({
      at,
      // One letter, because fourteen of them share the width of a phone.
      label: new Date(at).toLocaleDateString(undefined, { weekday: 'narrow' }),
      count: perDay.get(at) ?? 0,
    })
  }

  return {
    notes: live.length,
    words,
    thisWeek,
    favourites,
    open,
    done,
    ignored,
    kinds,
    days,
    busiest: days.reduce((most, day) => Math.max(most, day.count), 0),
    streak: streakOf(starts, now),
  }
}

/**
 * A number as a person reads it: 1,204 rather than 1204, and 12.4k past ten
 * thousand, where the exact figure has stopped being the point.
 */
export function countLabel(n: number): string {
  if (n < 10_000) return n.toLocaleString()
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}m`
}
