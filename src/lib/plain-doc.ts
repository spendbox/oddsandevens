import { makeBlock } from './blocks.ts'
import { hasFormatting } from './rich-text.ts'
import { isTextish, type Block } from './types.ts'

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

    if (found && (isTextish(found) || found.type === 'todo')) {
      used.add(found.id)
      if (found.text === text && found.html === html) {
        out.push(found)
      } else {
        const next = { ...found, text } as Block
        if (html) (next as { html?: string }).html = html
        else delete (next as { html?: string }).html
        out.push(next)
      }
      continue
    }

    const fresh = makeBlock('text')
    if (fresh.type === 'text') {
      fresh.text = text
      if (html) fresh.html = html
    }
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
