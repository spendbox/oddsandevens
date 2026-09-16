import { makeBlock } from './blocks.ts'
import { isTextish, type Align, type Block, type BlockType } from './types.ts'

/**
 * Brain: the rules a document keeps about itself.
 *
 * ## The idea
 *
 * Everybody writes the same shapes over and over, and every one of them is
 * personal. One person starts every action with "AI:", another writes every
 * decision in capitals, a third wants every bullet in a meeting note to be a
 * tickable task. None of that is worth a feature; all of it is worth a rule.
 *
 * So a document can carry a handful: *when a line looks like this, make it
 * that*. They belong to the document rather than to the application, because
 * the shapes in a meeting note are not the shapes in a recipe — and a rule
 * that applied everywhere would be wrong somewhere within a day.
 *
 * ## Why there is no model here
 *
 * The same reason the icons and the task scan have none. A rule is a promise
 * the writer made to themselves, and a promise that is kept only when a
 * network request succeeds is not one. This is a string comparison per line:
 * it runs on every keystroke's worth of settling, costs nothing, works
 * offline, and every case below is a unit test rather than something somebody
 * has to reproduce by typing.
 *
 * ## Why it never runs twice on the same line
 *
 * Applying a rule changes the line into what the rule asked for, and the test
 * is written so the result no longer matches — "every bullet becomes a task"
 * turns bullets into tasks, and a task is not a bullet. `applyRules` is
 * therefore safe to call on every change, and calling it on its own output
 * returns the same blocks. That is what makes it usable as you type rather
 * than as a command somebody has to remember to run.
 */

/** What a line has to look like for a rule to fire. */
export type RuleWhen =
  /** The line begins with this text, ignoring case and any leading spaces. */
  | { kind: 'startsWith'; value: string }
  /** The text appears anywhere in the line, as a whole word. */
  | { kind: 'contains'; value: string }
  /** The line ends with this text. */
  | { kind: 'endsWith'; value: string }
  /** Every line of a kind: every bullet, every quote, every heading. */
  | { kind: 'isType'; value: BlockType }

/** What to do with a line that matched. */
export type RuleThen =
  /** Turn it into another kind of block. */
  | { kind: 'become'; value: BlockType; level?: 1 | 2 | 3 }
  /** Leave the kind alone and set how it sits in the measure. */
  | { kind: 'align'; value: Align }
  /** Leave the kind alone and indent it one step. */
  | { kind: 'indent' }

export interface Rule {
  id: string
  when: RuleWhen
  then: RuleThen
  /**
   * Whether the matched words are taken off the front of the line.
   *
   * "AI: ring the bank" is worth turning into a task; "AI: " is not worth
   * keeping once it has. Only meaningful for `startsWith`.
   */
  strip?: boolean
  /** Rules can be switched off one at a time without being thrown away. */
  off?: boolean
}

/** A line's text with the leading and trailing space taken off. */
function lineOf(block: Block): string | null {
  if (isTextish(block) || block.type === 'todo') return block.text
  return null
}

/** Whole-word containment, so "do" does not match "document". */
function containsWord(haystack: string, needle: string): boolean {
  const words = haystack.toLowerCase().split(/[^a-z0-9]+/i)
  return words.includes(needle.toLowerCase())
}

/** Whether a rule's condition holds for a block. */
export function matches(rule: Rule, block: Block): boolean {
  if (rule.off) return false
  const when = rule.when

  if (when.kind === 'isType') {
    if (block.type !== when.value) return false
    // A rule that turns a kind into the same kind would fire forever.
    return rule.then.kind !== 'become' || rule.then.value !== when.value
  }

  const text = lineOf(block)
  if (text === null) return false
  const trimmed = text.trim()
  const needle = when.value.trim()
  if (!needle || !trimmed) return false

  if (when.kind === 'startsWith') {
    return trimmed.toLowerCase().startsWith(needle.toLowerCase())
  }
  if (when.kind === 'endsWith') {
    return trimmed.toLowerCase().endsWith(needle.toLowerCase())
  }
  return containsWord(trimmed, needle)
}

/** The wording a matched line keeps, once its marker has been taken off. */
function wording(rule: Rule, text: string): string {
  if (!rule.strip || rule.when.kind !== 'startsWith') return text
  const trimmed = text.trimStart()
  const cut = trimmed.slice(rule.when.value.trim().length)
  // Take the separator with it: "AI: ring the bank" should not become
  // ": ring the bank".
  return cut.replace(/^[\s:–—-]+/, '')
}

/**
 * Applies a document's rules to its blocks.
 *
 * Returns the same array when nothing changed, so a caller can compare by
 * identity and do nothing at all in the overwhelmingly common case — which is
 * what lets this run on every settled keystroke without the document being
 * rewritten, saved and synced for no reason.
 */
export function applyRules(blocks: Block[], rules: Rule[]): Block[] {
  const live = rules.filter((rule) => !rule.off)
  if (!live.length) return blocks

  let changed = false
  const next = blocks.map((block) => {
    // The first rule that matches wins. Running them all would mean the order
    // of two rules that both match decides the result in a way nobody can see.
    const rule = live.find((candidate) => matches(candidate, block))
    if (!rule) return block

    if (rule.then.kind === 'align') {
      if (!(isTextish(block) || block.type === 'todo')) return block
      if (block.align === rule.then.value) return block
      changed = true
      const copy = { ...block } as Block & { align?: Align }
      if (rule.then.value === 'left') delete copy.align
      else copy.align = rule.then.value
      return copy
    }

    if (rule.then.kind === 'indent') {
      if (!(isTextish(block) || block.type === 'todo')) return block
      if ((block.indent ?? 0) >= 1) return block
      changed = true
      return { ...block, indent: 1 } as Block
    }

    const text = lineOf(block)
    if (text === null) return block
    const target = rule.then.value
    const level = rule.then.level
    // Already the thing the rule asks for, at the right size.
    const sameSize =
      target !== 'heading' || (block.type === 'heading' && block.level === (level ?? 1))
    if (block.type === target && sameSize) return block

    const made = makeBlock(target, level)
    if (isTextish(made) || made.type === 'todo') {
      made.text = wording(rule, text)
      // The formatting is dropped when the wording changed, because the marks
      // were positioned against words that are no longer there.
      if (made.text === text) made.html = (block as { html?: string }).html
      made.indent = (block as { indent?: number }).indent
      made.align = (block as { align?: Align }).align
    }
    // The id is kept, so the caret does not jump to another block and so an
    // undo snapshot can still be lined up against this one.
    made.id = block.id
    changed = true
    return made
  })

  return changed ? next : blocks
}

/** How a rule reads on screen, so the list of them is a list of sentences. */
export function describe(rule: Rule): string {
  const when =
    rule.when.kind === 'isType'
      ? `Every ${typeName(rule.when.value)}`
      : rule.when.kind === 'startsWith'
        ? `Every line starting with “${rule.when.value}”`
        : rule.when.kind === 'endsWith'
          ? `Every line ending with “${rule.when.value}”`
          : `Every line containing “${rule.when.value}”`

  const then =
    rule.then.kind === 'align'
      ? `is ${rule.then.value === 'left' ? 'aligned left' : rule.then.value === 'center' ? 'centred' : rule.then.value === 'right' ? 'aligned right' : 'justified'}`
      : rule.then.kind === 'indent'
        ? 'is indented'
        : `becomes a ${typeName(rule.then.value, rule.then.level)}`

  return `${when} ${then}${rule.strip && rule.when.kind === 'startsWith' ? ', without the marker' : ''}`
}

function typeName(type: BlockType, level?: 1 | 2 | 3): string {
  if (type === 'heading') return `heading ${level ?? 1}`
  if (type === 'todo') return 'task'
  if (type === 'bullet') return 'bullet'
  if (type === 'quote') return 'quote'
  if (type === 'code') return 'code block'
  if (type === 'table') return 'spreadsheet'
  if (type === 'divider') return 'divider'
  if (type === 'form') return 'form'
  if (type === 'file') return 'file'
  return 'paragraph'
}
