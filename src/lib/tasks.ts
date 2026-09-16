import { isTextish, type Block } from './types.ts'

/**
 * Finding the things somebody has agreed to do, in prose they wrote for
 * another purpose.
 *
 * Almost nobody opens a task manager to write down a task. They write "call
 * the landlord about the boiler" in the middle of a meeting note, and that is
 * where it stays until it is too late. So the document is read for actions and
 * the ones it finds are *offered* — one at a time, each with a tick beside it —
 * rather than created.
 *
 * ## Why this is a string scanner and not a model call
 *
 * The same rule the Library follows: the model improves the filing, it is not
 * what makes it exist. This runs on the device, on every keystroke's worth of
 * settling, with no key, no network and no cost, and it is a pure function
 * over blocks so every awkward case below is a unit test rather than something
 * somebody has to reproduce by typing. A wrong suggestion costs one glance; a
 * task manager that only works when a server answers costs the whole feature.
 *
 * ## Why nothing here writes to the document
 *
 * Suggesting and doing are different acts. Everything this returns is shown
 * first and applied only for the items that were ticked — the same bargain as
 * the writing help, and for the same reason: an assistant that quietly
 * restructures your notes is one you stop trusting the first time it is wrong,
 * and by then you cannot tell what it changed.
 */

export interface TaskSuggestion {
  /** The block the line came from, so accepting it converts that block. */
  blockId: string
  /** The task as it should read, with its lead-in and bullet glyph removed. */
  text: string
  /**
   * A date or time phrase found in the line, kept exactly as it was written.
   *
   * Not parsed into a timestamp, deliberately. "Friday" means a different day
   * depending on when it was written and which Friday was meant, and a wrong
   * date on a reminder is worse than no date. It is carried as the writer's
   * own words so it can be shown beside the task now, and handed to a calendar
   * — which has a proper natural-language parser — when that is connected.
   */
  due?: string
  /** Why this line was picked, shown next to it so the guess is inspectable. */
  reason: string
}

/**
 * Headings and lead-ins that turn the lines beneath them into a list of
 * actions. "Next steps" is a promise about the lines that follow it.
 */
const SECTION =
  /^(to[\s-]?dos?|tasks?|action items?|actions|next steps?|follow[\s-]?ups?|to action|homework|my list|things to do|what i need to do|deliverables)\b/i

/** Markers people put in front of a line to mean exactly this. */
const MARKER = /^(todo|to[\s-]do|action|ai|task|next)\s*[:\-–]\s*/i

/**
 * Ways of saying you have taken something on.
 *
 * The capture is the part that survives into the task: "I need to call the
 * landlord" becomes "Call the landlord", because a task list full of "I need
 * to" is a list you read twice as slowly.
 */
const OBLIGATION: Array<{ match: RegExp; reason: string }> = [
  { match: /^(?:i|we|you|they|he|she)\s+(?:really\s+)?(?:need|needs|have|has)\s+to\s+(.+)$/i, reason: 'says you need to' },
  { match: /^(?:i|we|you)\s+(?:should|must|ought to|will|'ll|am going to|are going to)\s+(.+)$/i, reason: 'says you will' },
  { match: /^(?:need|needs|have|has)\s+to\s+(.+)$/i, reason: 'says you need to' },
  { match: /^(?:remember|don'?t forget|make sure|be sure|make a note)\s+to\s+(.+)$/i, reason: 'a reminder' },
  { match: /^(?:let'?s|lets)\s+(.+)$/i, reason: 'something to do' },
  { match: /^(?:must|should)\s+(.+)$/i, reason: 'says you should' },
  { match: /^(?:chase|chase up|follow up)\s+(?:on\s+)?(.+)$/i, reason: 'a follow-up' },
]

/**
 * Verbs that start an instruction.
 *
 * Kept to verbs that are almost never anything else at the start of a line.
 * "Book" is here and "run" is not: "Run the numbers" is a task and "Run of
 * bad luck" is not, and there is no way to tell them apart in four words. A
 * list that is short and nearly always right beats a list that is long and
 * makes somebody untick half the suggestions.
 */
const ACTION_VERBS = new Set([
  'add', 'arrange', 'ask', 'book', 'buy', 'call', 'cancel', 'chase', 'check',
  'collect', 'confirm', 'draft', 'email', 'file', 'finish', 'fix', 'follow',
  'forward', 'invite', 'order', 'organise', 'organize', 'pay', 'phone', 'pick',
  'post', 'prepare', 'print', 'read', 'rebook', 'remind', 'renew', 'reply',
  'research', 'reschedule', 'review', 'schedule', 'send', 'set', 'share',
  'sign', 'speak', 'submit', 'text', 'update', 'upload', 'write',
])

/**
 * Date and time wording, kept as the writer typed it.
 *
 * Ordered longest-intent first so "by the end of next week" is not reported as
 * "next week" — the qualifier is the part that matters to whoever reads it.
 */
const WHEN: RegExp[] = [
  /\b(?:by|before|due|on|for|after)\s+(?:the\s+)?end of (?:the\s+|next\s+|this\s+)?(?:day|week|month|quarter|year)\b/i,
  /\b(?:by|before|due|on|for|this|next|every)\s+(?:mon|tues?|wednes|thurs?|fri|satur|sun)day\b/i,
  /\b(?:by|before|due|on|for)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
  /\b(?:by|before|due|on|for)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /\b(?:by|before|due|on|for)\s+\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/i,
  /\b(?:by|before|due)\s+(?:today|tonight|tomorrow|next week|next month|the weekend)\b/i,
  /\b(?:today|tonight|tomorrow|this (?:morning|afternoon|evening|week|month)|next (?:week|month)|this weekend)\b/i,
  /\b(?:mon|tues?|wednes|thurs?|fri|satur|sun)day\b/i,
  /\bEO[DW]\b/,
  /\bASAP\b/i,
]

/** A line's leading bullet glyph, dash or checkbox, which is not its wording. */
const GLYPH = /^\s*(?:[-*•·▪‣o]\s+|\[\s*\]\s*|\d+[.)]\s+)/

/** The longest a line can be and still plausibly be one action. */
const MAX_TASK_CHARS = 180
/** Below this it is a fragment, not an instruction. */
const MIN_TASK_CHARS = 4

function tidy(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '')
  if (!clean) return ''
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

/** The date wording in a line, or nothing. */
export function whenIn(text: string): string | undefined {
  for (const pattern of WHEN) {
    const found = pattern.exec(text)
    if (found) return found[0].trim()
  }
  return undefined
}

/**
 * Whether a line, read on its own, is somebody giving themselves an
 * instruction. `underSection` relaxes it: beneath "Next steps" even a bare
 * noun phrase is a task, because the heading already said so.
 */
function readTask(line: string, underSection: boolean): { text: string; reason: string } | null {
  const body = line.replace(GLYPH, '').trim()
  if (body.length < MIN_TASK_CHARS || body.length > MAX_TASK_CHARS) return null
  // A question is something you are asking, not something you are doing.
  if (body.endsWith('?')) return null

  const marked = MARKER.exec(body)
  if (marked) {
    const rest = body.slice(marked[0].length).trim()
    if (rest.length >= MIN_TASK_CHARS) return { text: tidy(rest), reason: 'marked as a task' }
  }

  for (const rule of OBLIGATION) {
    const found = rule.match.exec(body)
    if (found?.[1] && found[1].trim().length >= MIN_TASK_CHARS) {
      return { text: tidy(found[1]), reason: rule.reason }
    }
  }

  const first = body.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '')
  // A one-word line is a label. An instruction has an object: "Call" is not a
  // task, "Call the landlord" is.
  if (first && ACTION_VERBS.has(first) && /\s/.test(body)) {
    return { text: tidy(body), reason: 'starts with an action' }
  }

  // Under a heading that announced a list of actions, the heading is the
  // evidence and the line does not have to prove itself again.
  if (underSection) return { text: tidy(body), reason: 'under a list of actions' }

  return null
}

/**
 * Every line in a document that reads like something to be done.
 *
 * Blocks that are already tasks are skipped rather than re-offered: a
 * suggestion to make a task out of a task is noise, and worse, it is noise
 * that comes back every time the document is opened.
 */
export function findTasks(blocks: Block[]): TaskSuggestion[] {
  const found: TaskSuggestion[] = []
  const seen = new Set<string>()
  /** True while we are underneath a heading that announced a list of actions. */
  let underSection = false

  for (const block of blocks) {
    // A task is already a task. A heading may open a section of them, but is
    // never one itself.
    if (block.type === 'todo') {
      continue
    }
    if (block.type === 'heading') {
      underSection = SECTION.test(block.text.trim())
      continue
    }
    if (!isTextish(block)) {
      // A table, a form or a file ends the run: whatever the heading promised,
      // it was not this.
      underSection = false
      continue
    }

    const line = block.text.trim()
    if (!line) continue

    // "Things to do:" is a heading written as a paragraph, which is how most
    // people actually write one.
    if (/:$/.test(line) && SECTION.test(line)) {
      underSection = true
      continue
    }

    const task = readTask(line, underSection)
    if (!task) continue

    const key = task.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const due = whenIn(line)
    found.push(due ? { ...task, blockId: block.id, due } : { ...task, blockId: block.id })
  }

  return found
}
