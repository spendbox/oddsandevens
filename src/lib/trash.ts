import type { Doc } from './types.ts'

/**
 * The trash.
 *
 * A delete that cannot be undone is a bad delete, and the moment someone
 * notices they wanted the thing back is rarely the same moment they removed
 * it. So a deleted document sits here, recoverable, for a week.
 *
 * What it is NOT is a second storage system: a trashed document is an ordinary
 * document with a `deletedAt` on it, in the same store as every other. Only
 * the queries differ.
 */

/** How long a deleted document can be recovered. */
export const TRASH_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
export const TRASH_MS = TRASH_DAYS * DAY_MS

/** In the trash: deleted, but not yet destroyed. */
export function isInTrash(doc: Doc): boolean {
  return !!doc.deletedAt && !doc.purgedAt
}

/** Whole days left before the sweep takes it. Zero means it goes next sweep. */
export function daysLeft(doc: Doc, now = Date.now()): number {
  if (!doc.deletedAt) return TRASH_DAYS
  const remaining = doc.deletedAt + TRASH_MS - now
  return Math.max(0, Math.ceil(remaining / DAY_MS))
}

/** Human wording for the sidebar, which is where someone decides to act. */
export function expiryLabel(doc: Doc, now = Date.now()): string {
  const left = daysLeft(doc, now)
  if (left <= 0) return 'Deleting today'
  if (left === 1) return 'Deletes tomorrow'
  return `Deletes in ${left} days`
}

/** True once a document has been in the trash longer than the retention. */
export function shouldPurge(doc: Doc, now = Date.now()): boolean {
  if (!doc.deletedAt || doc.purgedAt) return false
  return now - doc.deletedAt >= TRASH_MS
}

/**
 * Empties a document without removing its row.
 *
 * Keeping the id and the timestamps is what stops another device pushing its
 * own copy back on the next sync. Everything that costs space — the title, the
 * blocks — goes.
 */
export function purge(doc: Doc, now = Date.now()): Doc {
  return {
    ...doc,
    title: '',
    blocks: [],
    projectId: undefined,
    favoritedAt: undefined,
    // Everything the document said about itself goes with its contents. What
    // is left is a tombstone: an id and the fact that it is gone.
    rules: undefined,
    ignoreRules: undefined,
    goals: undefined,
    purgedAt: now,
    updatedAt: now,
  }
}

/** Puts a document back where it was, minus any project that has since gone. */
export function restore(doc: Doc, now = Date.now()): Doc {
  const next: Doc = { ...doc, updatedAt: now }
  delete next.deletedAt
  delete next.purgedAt
  return next
}

/** The trash contents, most recently deleted first. */
export function trashedDocs(docs: Doc[]): Doc[] {
  return docs.filter(isInTrash).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

/** Every attachment reference a document holds, so a purge can free the bytes. */
export function attachmentRefs(doc: Doc): string[] {
  return doc.blocks
    .filter((block): block is Extract<typeof block, { type: 'file' }> => block.type === 'file')
    .map((block) => block.ref)
    .filter(Boolean)
}
