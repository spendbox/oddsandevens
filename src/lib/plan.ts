import { findTasks } from './tasks.ts'
import type { Block } from './types.ts'

/**
 * Notes in, a plan out.
 *
 * The one thing in this app that reads a document back and says something
 * about it. Somebody types what happened, or what they want; pressing the
 * action button turns that into a short list of what happens next, split by
 * who has to do it.
 *
 * ## Why every step says who
 *
 * Because "book the venue" and "draft the email to the venue" are different
 * kinds of sentence, and only one of them is something software could ever
 * take off your hands. A list that mixes them tells you nothing about where
 * to start. So each step is either `you` — something only the person can do,
 * ring somebody, sign something, decide — or `app`, something Pad could do
 * from what is already written.
 *
 * Nothing marked `app` is done. It is a statement of what the shape of this
 * would be, and the panel says so plainly rather than implying a button that
 * is not wired to anything. Drafting through the API and putting dated steps
 * into a calendar are the two that come next.
 *
 * ## Why there is a version with no model in it
 *
 * The same bargain as the icons, the titles in the Library and the search: it
 * has to work with no key, no network and no account, and the model improves
 * the answer rather than being the reason there is one. `localPlan` is
 * `findTasks` — a pure string scan that has been in this codebase since it
 * offered to make tasks out of lines — relabelled as steps. Every step it
 * finds is a `you`, because a scanner that cannot read cannot judge what
 * software could take on.
 */

/** Who has to do this step. */
export type Doer = 'you' | 'app'

export interface Step {
  who: Doer
  text: string
  /**
   * A date or time phrase found in the wording, kept exactly as written.
   *
   * Never parsed into a timestamp. "Friday" means a different day depending on
   * when it was written, and a wrong date on a reminder is worse than none —
   * so it is carried as the writer's own words, which is also what a
   * calendar's own parser will want when one is connected.
   */
  when?: string
}

/** How many steps are worth showing. Past this it is a document, not a plan. */
export const MAX_STEPS = 8

/** How long a step may be before it stops being a step. */
const MAX_STEP_CHARS = 160

/**
 * The plan this device can work out on its own.
 *
 * Every line that reads like something to do, in the order it was written,
 * with any date phrase kept. No model, no network, no cost.
 */
export function localPlan(blocks: Block[]): Step[] {
  return findTasks(blocks)
    .slice(0, MAX_STEPS)
    .map((task) => ({
      who: 'you' as const,
      text: task.text.slice(0, MAX_STEP_CHARS),
      ...(task.due ? { when: task.due } : {}),
    }))
}

/**
 * Reads the model's reply into steps.
 *
 * The reply is asked for as one step per line, each opening with `you:` or
 * `app:`. It is parsed forgivingly for the same reason the Library's filing
 * reply is: one malformed line must not lose the other five. A line with no
 * prefix at all is a `you`, because that is the safe way to be wrong — it
 * claims nothing about what the software can do.
 */
export function parsePlan(reply: string): Step[] {
  const steps: Step[] = []
  for (const raw of reply.split('\n')) {
    let line = raw.trim()
    if (!line) continue
    // A code fence around the whole answer is not a step.
    if (line.startsWith('```')) continue
    // Leading bullet or number, in any of the forms they come in.
    line = line.replace(/^(?:[-*•–]|\d+[.)])\s+/, '')
    // Markdown emphasis carries no meaning once this is a row in a list.
    line = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    line = line.replace(/^#+\s*/, '').trim()
    if (!line) continue

    const marked = /^(you|app|pad)\s*[:—-]\s*(.+)$/i.exec(line)
    const who: Doer = marked && marked[1].toLowerCase() !== 'you' ? 'app' : 'you'
    const text = (marked ? marked[2] : line).trim()
    if (!text) continue
    // A heading the model wrote over its own list is not a step.
    if (/^(steps?|actions?|next steps?|plan)\s*:?$/i.test(text)) continue

    steps.push({ who, text: text.slice(0, MAX_STEP_CHARS) })
    if (steps.length >= MAX_STEPS) break
  }
  return steps
}

/**
 * Puts the dates back onto a plan that came from the model.
 *
 * The model is asked not to invent dates, and it is not asked to extract them
 * either: the phrase is already in the writer's own words somewhere in the
 * document, and finding it here means one rule about dates rather than two
 * that can disagree. A step keeps a date only when its own wording carries
 * one, so "chase it" does not inherit next Tuesday from the line above.
 */
export function datesFrom(steps: Step[], whenIn: (text: string) => string | undefined): Step[] {
  return steps.map((step) => {
    if (step.when) return step
    const found = whenIn(step.text)
    return found ? { ...step, when: found } : step
  })
}
