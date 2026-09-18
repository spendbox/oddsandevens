import { whenIn } from './tasks.ts'

/**
 * Reading a chat message for the work in it.
 *
 * ## The whole design in one sentence
 *
 * A task has to be a thing somebody actually typed.
 *
 * Everything here is written against one failure: a list of work that
 * contains jobs nobody asked for. That is worse than no list at all, because
 * a list you have to audit is a list you stop reading — and in a team it is
 * worse again, since the invented job has somebody else's name on it.
 *
 * So there are two passes and a guard. The device reads the message with
 * string rules: bullets, numbered lines, "@ada please…", "we need to…". The
 * model then reads the same message, where a key is configured, and is asked
 * only to pick out lines — never to think of any. And then `keepOnlyReal`
 * throws away anything the model returned whose words are not in the message
 * it was given, which is the part that cannot be argued with.
 *
 * ## Why the mentions are resolved here and not by the model
 *
 * Because "@ada" means a particular person in a particular team and the model
 * does not know which. The names come from the member list, the match is
 * exact on the handle, and an @ that matches nobody is left in the text as
 * the writer typed it rather than quietly assigned to whoever is nearest.
 *
 * ## Why there is no DOM, no React and no fetch in this file
 *
 * So that every one of the awkward cases — two mentions in one line, a task
 * with a date in the middle of it, a model returning a sentence that was
 * never said — is a unit test rather than something to reproduce by typing
 * into a chat with other people in it.
 */

/** Somebody who can be given a task. */
export interface Member {
  /** The membership row, which is what a removal or a promotion acts on. */
  id?: string
  /** Null while they are an invitation nobody has signed in against yet. */
  userId: string | null
  name: string
  email: string
  /** Whether they may add people, remove them and rename the team. */
  admin?: boolean
}

export interface DraftTask {
  text: string
  /** Who it is for, if somebody was named with an @. */
  assignee?: string
  assigneeName?: string
  /** A date in the words it was written in, never parsed into a timestamp. */
  due?: string
}

/** How a member is written in a message: their name with the spaces taken out. */
export function handleFor(member: Member): string {
  return member.name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

/**
 * The members whose handle begins with what has been typed after an "@".
 *
 * Empty query means all of them, which is what the picker shows the moment
 * the "@" is typed and before anything follows it.
 */
export function matchMembers(members: Member[], query: string): Member[] {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return members
  return members.filter(
    (member) =>
      handleFor(member).startsWith(wanted) ||
      member.name.toLowerCase().startsWith(wanted) ||
      member.email.toLowerCase().startsWith(wanted),
  )
}

/**
 * The "@…" being typed right now, if the caret is in one.
 *
 * Returns where it starts, so accepting a name can replace exactly those
 * characters and nothing either side of them. Null when the caret is not in
 * a mention — including immediately after a finished one, because a space
 * ends it.
 */
export function mentionAt(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  // An "@" in the middle of a word is an email address, not a mention.
  if (at > 0 && !/[\s(]/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/\s/.test(query)) return null
  return { at, query }
}

/** Every member named in a message, in the order they were named. */
export function mentionedIn(text: string, members: Member[]): Member[] {
  const found: Member[] = []
  for (const raw of text.match(/@[\w.'-]+/g) ?? []) {
    const handle = raw.slice(1).toLowerCase()
    const member = members.find(
      (m) => handleFor(m) === handle || m.name.toLowerCase().replace(/\s+/g, '') === handle,
    )
    if (member && !found.includes(member)) found.push(member)
  }
  return found
}

/** A line that is plainly one item: a bullet, a dash, "1.", a tick box. */
const ITEM = /^\s*(?:[-*•]|\d+[.)]|\[\s?\])\s+/
/** Words that make a sentence a commitment rather than a remark. */
const COMMITS =
  /\b(?:need(?:s)? to|needs|must|should|please|can you|could you|will|i'?ll|we'?ll|let'?s|make sure|don'?t forget|remember to|chase|send|write|call|ring|book|draft|review|fix|check|prepare|update|follow up|sort out|confirm|email)\b/i
/** Openings that are talk about the work rather than the work. */
const NOT_A_TASK =
  /^\s*(?:thanks|thank you|ok(?:ay)?\b|got it|sure\b|nice\b|great\b|morning\b|hi\b|hello\b|hey\b|yes\b|no\b|done\b|agreed\b|sounds good|will do)\s*[.!]?\s*$/i

/** The "@name" taken back off the front of a line once it has been read. */
function withoutLeadingMention(text: string): string {
  return text.replace(/^\s*@[\w.'-]+[\s,:]+/, '').trim()
}

/**
 * What this device can see in a message, with no model and no network.
 *
 * Deliberately narrow. It takes lines that are plainly items in a list, and
 * sentences carrying a word that makes them a commitment — and nothing else,
 * because the cost of missing one is that somebody adds it by hand and the
 * cost of inventing one is that the whole list stops being believed.
 */
export function readTasks(
  message: string,
  members: Member[] = [],
  /**
   * Who a task belongs to when nobody is named in the line.
   *
   * This is what a reply is for. "Yes, by Thursday" written under Ada's
   * question is Ada's job, and nobody is going to type her name again to
   * say so — so the person being answered is the assignee unless the line
   * names somebody else, which always wins.
   */
  answering?: Member,
): DraftTask[] {
  const lines = message.split('\n')
  const out: DraftTask[] = []
  /* A mention on its own line applies to the lines under it: "@ada:" and
     then three bullets is one of the commonest shapes a chat takes. */
  let standing: Member | undefined

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const named = mentionedIn(line, members)
    const bare = line.replace(/^\s*@[\w.'-]+\s*[:,-]?\s*$/, '')
    if (!bare.trim() && named.length) {
      standing = named[0]
      continue
    }

    const item = ITEM.test(line)
    const text = withoutLeadingMention(line.replace(ITEM, '')).trim()
    if (!text) continue
    if (NOT_A_TASK.test(text)) continue
    // A line has to be either written as an item or read as a commitment.
    // A sentence that is neither is somebody talking.
    if (!item && !COMMITS.test(text)) continue
    // One word is not a task, however it was punctuated.
    if (text.split(/\s+/).length < 2) continue

    const who = named[0] ?? standing ?? answering
    const due = whenIn(text)
    out.push({
      text,
      ...(who?.userId ? { assignee: who.userId } : {}),
      ...(who ? { assigneeName: who.name } : {}),
      ...(due ? { due } : {}),
    })
  }
  return out
}

/** Words as they compare: lower case, no punctuation, single spaces. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The guard: nothing survives that was not in the message.
 *
 * A model asked to pull tasks out of a chat will, sooner or later, add the
 * obvious next one — the follow-up nobody mentioned, the reminder that
 * usually goes with this kind of work. In somebody's own notes that is
 * annoying. In a team's list of work it is a job with another person's name
 * on it that nobody agreed to, and it is the failure this whole file is
 * written against.
 *
 * So every task that comes back has to be made of words that are in the
 * message. Most have to be there, not all: the model is allowed to drop a
 * "please" or turn "can you send the figures" into "send the figures", which
 * is reading rather than inventing. A task with new nouns in it is not.
 */
export function keepOnlyReal(tasks: DraftTask[], message: string): DraftTask[] {
  const said = new Set(plain(message).split(' '))
  return tasks.filter((task) => {
    const words = plain(task.text).split(' ').filter(Boolean)
    if (!words.length) return false
    const known = words.filter((word) => said.has(word)).length
    // Four fifths, so a dropped filler word is fine and a new subject is not.
    return known / words.length >= 0.8
  })
}

/**
 * The same task twice is one task.
 *
 * The device's rules and the model's reading of the same message will often
 * both find the same line, and two identical rows with one tick box each is
 * exactly the kind of thing that makes people stop ticking.
 */
export function mergeTasks(...lists: DraftTask[][]): DraftTask[] {
  const seen = new Map<string, DraftTask>()
  for (const list of lists) {
    for (const task of list) {
      const key = plain(task.text)
      if (!key) continue
      const already = seen.get(key)
      if (!already) {
        seen.set(key, task)
        continue
      }
      // Whichever copy knows more wins, field by field: one pass may have
      // found the assignee and the other the date.
      seen.set(key, {
        text: already.text,
        assignee: already.assignee ?? task.assignee,
        assigneeName: already.assigneeName ?? task.assigneeName,
        due: already.due ?? task.due,
      })
    }
  }
  return [...seen.values()].map((task) => ({
    text: task.text,
    ...(task.assignee ? { assignee: task.assignee } : {}),
    ...(task.assigneeName ? { assigneeName: task.assigneeName } : {}),
    ...(task.due ? { due: task.due } : {}),
  }))
}
