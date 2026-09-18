import { docLabel } from './blocks.ts'
import { findTasks, whenIn } from './tasks.ts'
import type { Doc } from './types.ts'

/**
 * What is still to be done, read out of every note at once.
 *
 * ## Why this is a screen and not a feature inside a note
 *
 * Because nobody writes their tasks in one place. They are written where they
 * happened: a box ticked into a meeting note, "ring the landlord" in the
 * middle of a paragraph about a boiler, "send the figures by Friday" under a
 * heading in a note about something else entirely. Every one of them is
 * findable and none of them is *found*, which is how a fortnight goes by.
 *
 * So this reads the lot and puts them in one list. Nothing is moved, nothing
 * is copied into a task manager, and the note each one came from is one press
 * away — because the note is the context, and a task without its context is a
 * line somebody has to go and re-read anyway.
 *
 * ## Two kinds, and the difference matters
 *
 * A **box** is a box somebody drew: `[] ring the bank`, unticked. There is no
 * guessing in it, and ticking it here ticks it there.
 *
 * A **line** is prose that reads like a commitment — see `tasks.ts` for the
 * rules, which are a string scanner and not a model. It is a *suggestion*, it
 * says why it was picked, and the only thing offered is turning it into a box.
 * Whether "speak to Sam about the lease" is a task or a description of
 * something that already happened is not decidable from the sentence, which is
 * exactly why nothing here acts on its own.
 *
 * ## Why it costs nothing
 *
 * Every rule in here runs on the device: no key, no network, no cost, and the
 * same answer every time. The model can sharpen it — see the Actions tab —
 * and it is pressed, never automatic, and the list is complete without it.
 *
 * ## A note may say no
 *
 * Reading every note for commitments is right for most notes and wrong for
 * some: a diary, a draft, a page of quotes from a book. `ignoreTasks` on the
 * note is that answer, asked when the note is written and changeable
 * afterwards, and a note carrying it is passed over here — by both lists, so
 * a note left out is left out of what is done as well as what is outstanding.
 * Nothing about the note changes; it simply stops being one of the notes this
 * question is asked of.
 */

export interface ActionItem {
  /** Which note it came from, and what that note is called. */
  docId: string
  docTitle: string
  /** The line itself, so ticking it can find it again. */
  blockId: string
  text: string
  /** A date in the writer's own words, never parsed into a timestamp. */
  due?: string
  /** A box somebody drew, or a line that reads like one. */
  kind: 'box' | 'line'
  /** Why a line was picked. Absent for a box, which needs no explaining. */
  reason?: string
  /** When the note was last written in, which is how this list is ordered. */
  updatedAt: number
  /** Only ever true for a box, and only in the list of what is finished. */
  done?: boolean
}

/**
 * Everything one note contributes, under that note's name.
 *
 * ## Why the note is the grouping and not the day, or the kind
 *
 * Because the note is the context. Six lines from a meeting on Tuesday are one
 * piece of work with one set of names and one reason for existing, and reading
 * them under that meeting's name is reading them with all of it attached.
 * The same six lines scattered through a flat list of forty are six separate
 * things to reconstruct.
 *
 * It is also what makes "I am done with this note" a single press: a whole
 * group goes at once, which is how people actually finish with a meeting.
 */
export interface ActionGroup {
  docId: string
  docTitle: string
  updatedAt: number
  items: ActionItem[]
}

/** How many items one note may contribute, so a long note cannot fill the list. */
const PER_NOTE = 6
/** How many there can be in total. Past this it is not a list, it is a wall. */
const LIMIT = 60

/**
 * The notes this question is asked of, newest first.
 *
 * Deleted and destroyed notes are not read, and neither is a note whose owner
 * said not to — see `ignoreTasks` on the note. One place decides, so the
 * outstanding list and the finished list can never disagree about which notes
 * are in scope.
 */
function readable(docs: Doc[]): Doc[] {
  return docs
    .filter((doc) => !doc.deletedAt && !doc.purgedAt && !doc.ignoreTasks)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Everything still to do, newest note first, boxes before suggestions.
 *
 * Boxes first because they are certain: somebody drew them. A suggestion is
 * this app reading prose, and however good the rules are it belongs under the
 * things nobody has to agree with.
 */
export function gatherActions(docs: Doc[], limit = LIMIT): ActionItem[] {
  const boxes: ActionItem[] = []
  const lines: ActionItem[] = []

  const live = readable(docs)

  for (const doc of live) {
    const docTitle = docLabel(doc)
    let taken = 0

    for (const block of doc.blocks) {
      if (taken >= PER_NOTE) break
      if (block.type !== 'todo' || block.done) continue
      const text = block.text.trim()
      if (!text) continue
      const due = whenIn(text)
      boxes.push({
        docId: doc.id,
        docTitle,
        blockId: block.id,
        text,
        ...(due ? { due } : {}),
        kind: 'box',
        updatedAt: doc.updatedAt,
      })
      taken++
    }

    for (const found of findTasks(doc.blocks)) {
      if (taken >= PER_NOTE) break
      lines.push({
        docId: doc.id,
        docTitle,
        blockId: found.blockId,
        text: found.text,
        ...(found.due ? { due: found.due } : {}),
        kind: 'line',
        reason: found.reason,
        updatedAt: doc.updatedAt,
      })
      taken++
    }
  }

  /*
    The same thing written in two notes is one thing to do. Compared on the
    words alone: somebody who wrote "ring the landlord" on Monday and again on
    Thursday does not want to be told twice, and the newer note is the one kept
    because that is the one they will open.
  */
  const seen = new Set<string>()
  const out: ActionItem[] = []
  for (const item of [...boxes, ...lines]) {
    const key = item.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

/**
 * The boxes that have been ticked, newest note first.
 *
 * Kept out of the list proper and put behind a fold. What is done is not what
 * is to be done, and a list that keeps everything ever finished at the bottom
 * of it gets longer forever — but throwing it away silently is worse, because
 * "did I actually do that" is a real question and the tick is the only record
 * of the answer. So it is one line that says how many, and it opens.
 */
export function gatherDone(docs: Doc[], limit = LIMIT): ActionItem[] {
  const out: ActionItem[] = []
  const live = readable(docs)

  for (const doc of live) {
    const docTitle = docLabel(doc)
    let taken = 0
    for (const block of doc.blocks) {
      if (taken >= PER_NOTE) break
      if (block.type !== 'todo' || !block.done) continue
      const text = block.text.trim()
      if (!text) continue
      out.push({
        docId: doc.id,
        docTitle,
        blockId: block.id,
        text,
        kind: 'box',
        done: true,
        updatedAt: doc.updatedAt,
      })
      taken++
      if (out.length >= limit) return out
    }
  }
  return out
}

/**
 * The same items, gathered under the note each one came from.
 *
 * Order is preserved rather than recomputed: whatever came in first stays
 * first, so a group's boxes sit above its suggestions exactly as they do in
 * the flat list, and the notes come out in the order their first item did —
 * which, from `gatherActions`, is newest note first.
 */
export function byNote(items: ActionItem[]): ActionGroup[] {
  const groups = new Map<string, ActionGroup>()
  for (const item of items) {
    const found = groups.get(item.docId)
    if (found) found.items.push(item)
    else {
      groups.set(item.docId, {
        docId: item.docId,
        docTitle: item.docTitle,
        updatedAt: item.updatedAt,
        items: [item],
      })
    }
  }
  return [...groups.values()]
}

/**
 * The list as the model is given it.
 *
 * Only the lines and the names of the notes they came from — never the notes
 * themselves. The collection does not leave the machine to be asked what to do
 * next, for the same reason it does not leave it to be searched.
 */
export function digest(items: ActionItem[]): string {
  return items
    .map((item, i) => {
      const due = item.due ? ` (${item.due})` : ''
      return `${i + 1}. ${item.text}${due} — from "${item.docTitle}"`
    })
    .join('\n')
}
