/**
 * What a document is for, and what the assistant makes of that.
 *
 * A goal is one line the writer sets on one document: "persuade the landlord
 * to fix the boiler", "keep it under 400 words", "no jargon". It is not a
 * setting and not a template — the same reasoning as Brain's rules, which live
 * on the document for exactly the reason a rule that applied everywhere would
 * be wrong somewhere inside a day.
 *
 * ## Why goals are plain strings
 *
 * Because the useful ones are not a shape anybody can enumerate in advance. A
 * dropdown of "Persuasive / Informative / Personal" is a taxonomy exercise
 * that answers a question nobody asked; a line of their own words is
 * something the model can actually work against, and something the writer can
 * read back in a month and still recognise.
 *
 * ## Why this file has no JSX and no fetch
 *
 * Everything here is a string function, so the awkward cases are unit tests
 * rather than something to reproduce by typing into the app. The one thing
 * that costs a model call — turning goals plus a draft into suggestions —
 * happens in the one server route, and only what comes back is parsed here.
 */

/**
 * How many goals one document may carry.
 *
 * Five, because a document with nine goals has none: the point of stating what
 * a piece is for is that it rules things out, and a list long enough to cover
 * every possibility rules nothing out at all.
 */
export const MAX_GOALS = 5

/** How long one goal may be. Past this it is a paragraph, not a goal. */
export const MAX_GOAL_CHARS = 120

/** How many suggestions are worth showing at once. */
export const MAX_SUGGESTIONS = 4

/** Trims, collapses runs of whitespace, and cuts it to length. */
export function normaliseGoal(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_GOAL_CHARS)
}

/**
 * Adds a goal, or returns the identical array when there is nothing to add.
 *
 * The same-array-back property matters for the same reason it does in
 * `applyRules`: the caller can compare by identity to decide whether the
 * document changed, and so a no-op add does not rewrite, save and sync a
 * document.
 *
 * Duplicates are matched case-insensitively: "Keep it short" and "keep it
 * short" are the same instruction, and two of them in a list only makes the
 * list harder to read.
 */
export function addGoal(goals: string[], text: string): string[] {
  const goal = normaliseGoal(text)
  if (!goal) return goals
  if (goals.length >= MAX_GOALS) return goals
  const already = goals.some((existing) => existing.toLowerCase() === goal.toLowerCase())
  if (already) return goals
  return [...goals, goal]
}

/** Removes one goal, or returns the identical array when it was not there. */
export function removeGoal(goals: string[], text: string): string[] {
  const at = goals.findIndex((existing) => existing.toLowerCase() === text.toLowerCase())
  if (at === -1) return goals
  return [...goals.slice(0, at), ...goals.slice(at + 1)]
}

/**
 * Turns whatever the model sent back into a list of suggestions.
 *
 * Parsed forgivingly, for the same reason the Library's filing reply is: one
 * malformed line must not lose the other three. Models return these as "1.",
 * "- ", "* ", "• ", sometimes with a bold lead-in and sometimes wrapped in a
 * code fence, and every one of those is the same list.
 */
export function parseSuggestions(reply: string): string[] {
  const out: string[] = []
  for (const raw of reply.split('\n')) {
    let line = raw.trim()
    if (!line) continue
    // A code fence around the whole answer is not a suggestion.
    if (line.startsWith('```')) continue
    // Leading bullet or number, in any of the forms they come in.
    line = line.replace(/^(?:[-*•–]|\d+[.)])\s+/, '')
    // Markdown emphasis, which carries no meaning once this is in a button.
    line = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    line = line.replace(/^#+\s*/, '').trim()
    if (!line) continue
    // A heading the model added over its own list, e.g. "Suggestions:".
    if (/^suggestions?:?$/i.test(line)) continue
    out.push(line.slice(0, 200))
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}
