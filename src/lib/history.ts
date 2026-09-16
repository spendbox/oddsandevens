import type { Doc } from './types.ts'

/**
 * Undo and redo, over whole documents.
 *
 * ## Why the browser's own undo is not enough
 *
 * Each block is its own contenteditable, so the browser keeps a separate undo
 * stack per paragraph. Ctrl+Z took back the last few characters of whichever
 * line the caret happened to be in, and knew nothing at all about the edits
 * that matter most to get back: a paragraph split, a block deleted, a heading
 * converted, a suggestion accepted, a rewrite from the assistant applied over
 * the whole page. Those are exactly the changes somebody wants to take back,
 * and exactly the ones the browser could not.
 *
 * So the history is a list of snapshots of the document. That sounds expensive
 * and is not: a document is a few kilobytes of plain objects, the snapshots
 * share nothing that has not changed because every edit already replaces the
 * blocks array immutably, and the list is capped.
 *
 * ## Why snapshots rather than a list of operations
 *
 * An operation log is smaller and is the wrong shape for this app. Every edit
 * here already produces a whole new `Doc` — that is how saving, syncing and
 * rendering all work — so a snapshot is a value that already exists, while an
 * operation would have to be invented, kept in step with every action, and
 * inverted correctly. One forgotten inverse is a corrupted document; one
 * forgotten snapshot is a missing undo step.
 *
 * ## Coalescing
 *
 * Every keystroke produces a document. Pushing each one would make Ctrl+Z take
 * back one letter at a time, which nobody wants and which would blow the cap
 * inside a sentence. The caller passes the time, and edits closer together
 * than `COALESCE_MS` replace the top of the stack instead of stacking on it —
 * so undo steps come out roughly a phrase at a time.
 */

export interface History {
  /** Older states, oldest first. The last entry is what undo goes back to. */
  past: Doc[]
  /** States undone but not yet overwritten, newest first. */
  future: Doc[]
  /** When the top of `past` was recorded, for coalescing. */
  at: number
}

/** Edits closer together than this are treated as one. */
export const COALESCE_MS = 600
/**
 * How many steps are kept.
 *
 * Deep enough that undo is never the thing that loses somebody's work, small
 * enough that a long session does not sit on megabytes of old documents.
 */
export const LIMIT = 120

export function emptyHistory(): History {
  return { past: [], future: [], at: 0 }
}

/** True when the two documents differ in any way this app can edit. */
function differs(a: Doc, b: Doc): boolean {
  return a.title !== b.title || a.blocks !== b.blocks
}

/**
 * Whether two states are close enough in shape that they should be one step.
 *
 * Only ordinary typing coalesces. A change in the number of blocks is a split,
 * a merge, a delete or an insertion, and each of those deserves its own step
 * however fast it followed the keystroke before it — otherwise "undo" after an
 * accidental Enter takes back the whole sentence with it.
 */
function isTyping(previous: Doc, next: Doc): boolean {
  return previous.blocks.length === next.blocks.length
}

/**
 * Records a state, given the one that is about to replace it.
 *
 * `before` is the document as it was; the caller passes the new one to `next`
 * only so this can decide whether the two are one continuous edit. Nothing is
 * recorded when nothing changed, so a re-render never costs a step.
 */
export function record(history: History, before: Doc, next: Doc, now = Date.now()): History {
  if (!differs(before, next)) return history

  const top = history.past[history.past.length - 1]
  // A continuation of the same edit: the state already on the stack is the one
  // to come back to, so leave it and only move the clock forward.
  if (top && now - history.at < COALESCE_MS && isTyping(before, next) && isTyping(top, before)) {
    return { past: history.past, future: [], at: now }
  }

  const past = [...history.past, before]
  // The oldest steps go first, which is the only end anybody stops caring about.
  if (past.length > LIMIT) past.splice(0, past.length - LIMIT)
  // Any new edit makes the redo branch unreachable, as it does in every editor.
  return { past, future: [], at: now }
}

export interface Step {
  history: History
  doc: Doc
}

/** Steps back, or null when there is nothing to go back to. */
export function undo(history: History, current: Doc): Step | null {
  const previous = history.past[history.past.length - 1]
  if (!previous) return null
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
      // Zero, so the next edit after an undo always starts a fresh step rather
      // than coalescing into whatever was recorded before it.
      at: 0,
    },
    doc: previous,
  }
}

/** Steps forward again, or null when nothing was undone. */
export function redo(history: History, current: Doc): Step | null {
  const next = history.future[0]
  if (!next) return null
  return {
    history: { past: [...history.past, current], future: history.future.slice(1), at: 0 },
    doc: next,
  }
}

export function canUndo(history: History): boolean {
  return history.past.length > 0
}

export function canRedo(history: History): boolean {
  return history.future.length > 0
}
