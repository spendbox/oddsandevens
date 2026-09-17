import { continues, type Shape } from './beautify.ts'
import { makeBlock } from './blocks.ts'
import { hasFormatting } from './rich-text.ts'
import { isTextish, type Block, type TextishBlock } from './types.ts'

/**
 * The plain writing surface, as a pure function.
 *
 * ## Why there are two surfaces at all
 *
 * The block surface is one `contenteditable` per paragraph, which is what lets
 * a spreadsheet sit between two sentences and what makes every block
 * individually addressable. It also means the browser's own selection stops at
 * the end of a paragraph: Ctrl+A selects a line, dragging past the end of one
 * paragraph selects nothing, and both had to be reimplemented by hand.
 *
 * The plain surface is one `contenteditable` for the whole page. Enter makes a
 * line because the browser makes a line, Ctrl+A takes everything because that
 * is what Ctrl+A does, and a selection runs from the title to the last word
 * without anybody writing a line of code for it. That is the whole point of
 * it: not fewer features, but the browser doing what it already knows how to
 * do, which is what "a typical document" actually means.
 *
 * ## What this file is for
 *
 * The document is still a list of blocks — everything that reads a document,
 * from search to export to sync, depends on that and none of it changes. So
 * the plain surface paints blocks out and reads lines back, and `reconcile` is
 * the reading back: it has no DOM in it, so the awkward cases — a paragraph
 * deleted, a paragraph split, a spreadsheet the caret ran over — are unit
 * tests rather than something to reproduce by typing into a page.
 */

/** One line as it came out of the plain surface. */
export interface Line {
  /**
   * The block it came from, when the browser kept the marker.
   *
   * Absent on a line the browser made itself — pressing Enter clones the
   * paragraph's element and the id goes with it, so a new line arrives either
   * unmarked or wearing its neighbour's id. Both cases become a new block.
   */
  id?: string
  text: string
  html?: string
  /** Whether the checkbox on this line is ticked, when it has one. */
  done?: boolean
}

/**
 * Turns the lines read out of the plain surface back into blocks.
 *
 * Rules, in order:
 *
 * - A line carrying the id of a block that was already there keeps that
 *   block's kind. Typing in a heading leaves it a heading; the plain surface
 *   changes text, never structure.
 * - A block that is not text — a spreadsheet, some code, a form, a file, a
 *   divider — is carried across untouched. The plain surface paints those as
 *   uneditable, so whatever text came back for one of them is the browser
 *   describing it, not somebody editing it.
 * - An id seen twice is the second half of a split, and the second one becomes
 *   a new block. Pressing Enter in the middle of a paragraph clones its
 *   element, id and all.
 * - A block whose id does not come back was deleted, and goes.
 * - Nothing left means one empty paragraph, because a document with nothing to
 *   type into is a document nobody can use.
 *
 * It returns the identical array when nothing changed, so a caller can compare
 * by identity and a no-op read-back does not rewrite, save and sync the
 * document.
 */
export function reconcile(existing: Block[], lines: Line[]): Block[] {
  const byId = new Map(existing.map((block) => [block.id, block]))
  const used = new Set<string>()
  const out: Block[] = []

  for (const line of lines) {
    const found = line.id && !used.has(line.id) ? byId.get(line.id) : undefined

    if (found && !isTextish(found) && found.type !== 'todo') {
      // Not text. Carried across as it is — the plain surface cannot edit it.
      used.add(found.id)
      out.push(found)
      continue
    }

    const text = line.text
    const html = line.html && hasFormatting(line.html, text) ? line.html : undefined
    const done = line.done

    if (found && (isTextish(found) || found.type === 'todo')) {
      used.add(found.id)
      const ticked = found.type === 'todo' && done !== undefined ? done : undefined
      const sameTick = ticked === undefined || (found as { done?: boolean }).done === ticked
      if (found.text === text && found.html === html && sameTick) {
        out.push(found)
      } else {
        const next = { ...found, text } as Block
        if (html) (next as { html?: string }).html = html
        else delete (next as { html?: string }).html
        if (ticked !== undefined) (next as { done?: boolean }).done = ticked
        out.push(next)
      }
      continue
    }

    /*
      A line the browser made. It carries on a list and starts a paragraph
      after anything else — which is what every editor has done since lists
      existed, and is why pressing Enter in a list does not drop you out of it.

      `line.id` is the id it was cloned from, so the kind is read off that
      block even though this is a new one.
    */
    const cloned = line.id ? byId.get(line.id) : undefined
    const carry = cloned ? continues(cloned.type, (cloned as { ordered?: boolean }).ordered) : null
    const fresh = makeBlock(carry?.type ?? 'text')
    if (isTextish(fresh) || fresh.type === 'todo') {
      fresh.text = text
      if (html) fresh.html = html
    }
    if (carry?.ordered && fresh.type === 'bullet') fresh.ordered = true
    if (fresh.type === 'todo') fresh.done = !!done
    out.push(fresh)
  }

  if (!out.length) return [makeBlock('text')]
  return same(existing, out) ? existing : out
}

/** Whether the read-back found nothing to change. */
function same(before: Block[], after: Block[]): boolean {
  if (before.length !== after.length) return false
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) return false
  return true
}

/**
 * Gives a block the shape a line was plainly aiming at. See lib/beautify.ts.
 *
 * The id, the indent and the alignment survive, because none of those is
 * something the notation was about: turning "- milk" into a bullet must not
 * pull the line back to the left margin or make it a different block as far as
 * anything else in the app is concerned.
 */
export function applyShape(block: Block, shape: Shape): Block {
  const next = makeBlock(shape.type, shape.level)
  next.id = block.id
  const before = block as TextishBlock
  const after = next as TextishBlock & { ordered?: boolean; done?: boolean }
  if (before.indent) after.indent = before.indent
  if (shape.align ?? before.align) after.align = shape.align ?? before.align
  if (isTextish(next) || next.type === 'todo') {
    after.text = shape.text
    if (shape.html) after.html = shape.html
  }
  if (shape.ordered) after.ordered = true
  if (next.type === 'todo') after.done = !!shape.done
  return next
}

/**
 * Whether a block can be typed into on the plain surface.
 *
 * Everything else is painted there but not editable, which is the honest
 * shape: a spreadsheet inside one big contenteditable would be a grid the
 * browser thought it could put a caret in the middle of.
 */
export function editableInPlain(block: Block): boolean {
  return isTextish(block) || block.type === 'todo'
}

/** Whether a document has anything the plain surface cannot edit. */
export function hasRichBlocks(blocks: Block[]): boolean {
  return blocks.some((block) => !editableInPlain(block))
}
