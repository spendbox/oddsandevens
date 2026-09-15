import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import {
  TRASH_DAYS,
  TRASH_MS,
  attachmentRefs,
  daysLeft,
  expiryLabel,
  isInTrash,
  purge,
  restore,
  shouldPurge,
  trashedDocs,
} from '../trash.ts'
import type { Doc } from '../types.ts'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

function doc(extra: Partial<Doc> = {}): Doc {
  return { id: 'a', title: 'Notes', blocks: [], createdAt: 0, updatedAt: 0, ...extra }
}

test('a live document is not in the trash', () => {
  assert.equal(isInTrash(doc()), false)
})

test('a deleted document is in the trash until it is purged', () => {
  assert.equal(isInTrash(doc({ deletedAt: NOW })), true)
  assert.equal(isInTrash(doc({ deletedAt: NOW, purgedAt: NOW })), false)
})

test('the retention is seven days', () => {
  assert.equal(TRASH_DAYS, 7)
  assert.equal(TRASH_MS, 7 * DAY)
})

test('days left counts down', () => {
  assert.equal(daysLeft(doc({ deletedAt: NOW }), NOW), 7)
  assert.equal(daysLeft(doc({ deletedAt: NOW - 3 * DAY }), NOW), 4)
  assert.equal(daysLeft(doc({ deletedAt: NOW - 6.5 * DAY }), NOW), 1)
  assert.equal(daysLeft(doc({ deletedAt: NOW - 7 * DAY }), NOW), 0)
  // Never negative, however long it has sat there.
  assert.equal(daysLeft(doc({ deletedAt: NOW - 90 * DAY }), NOW), 0)
})

test('the label reads like a sentence at every stage', () => {
  assert.equal(expiryLabel(doc({ deletedAt: NOW }), NOW), 'Deletes in 7 days')
  assert.equal(expiryLabel(doc({ deletedAt: NOW - 6 * DAY }), NOW), 'Deletes tomorrow')
  assert.equal(expiryLabel(doc({ deletedAt: NOW - 7 * DAY }), NOW), 'Deleting today')
})

test('the sweep only takes documents past the retention', () => {
  assert.equal(shouldPurge(doc({ deletedAt: NOW - 6 * DAY }), NOW), false)
  assert.equal(shouldPurge(doc({ deletedAt: NOW - 7 * DAY }), NOW), true)
  assert.equal(shouldPurge(doc({ deletedAt: NOW - 8 * DAY }), NOW), true)
  // A living document is never swept, whatever its age.
  assert.equal(shouldPurge(doc({ createdAt: 0 }), NOW), false)
  // Nor is one already purged, or it would be rewritten every sweep.
  assert.equal(shouldPurge(doc({ deletedAt: NOW - 9 * DAY, purgedAt: NOW }), NOW), false)
})

test('purging empties the document but keeps the row', () => {
  const full = doc({ deletedAt: NOW - 8 * DAY, title: 'Secrets', projectId: 'p1' })
  full.blocks = [makeBlock('text'), makeBlock('table')]
  const gone = purge(full, NOW)
  assert.equal(gone.id, full.id, 'the id must survive, or sync resurrects it')
  assert.equal(gone.title, '')
  assert.deepEqual(gone.blocks, [])
  assert.equal(gone.projectId, undefined)
  assert.equal(gone.purgedAt, NOW)
  assert.equal(isInTrash(gone), false)
})

test('restoring brings a document back to life', () => {
  const back = restore(doc({ deletedAt: NOW, updatedAt: 1 }), NOW)
  assert.equal(back.deletedAt, undefined)
  assert.equal(back.purgedAt, undefined)
  assert.equal(back.updatedAt, NOW, 'the restore must win the last-write-wins merge')
  assert.equal(isInTrash(back), false)
})

test('the trash lists the most recently deleted first, and nothing else', () => {
  const docs = [
    { ...doc({ deletedAt: NOW - 2 * DAY }), id: 'old' },
    { ...doc(), id: 'live' },
    { ...doc({ deletedAt: NOW }), id: 'new' },
    { ...doc({ deletedAt: NOW - DAY, purgedAt: NOW }), id: 'purged' },
  ]
  assert.deepEqual(trashedDocs(docs).map((d) => d.id), ['new', 'old'])
})

test('attachment references are collected so a purge can free the bytes', () => {
  const withFiles = doc()
  const a = makeBlock('file')
  const b = makeBlock('file')
  const empty = makeBlock('file')
  if (a.type === 'file') a.ref = 'ref-a'
  if (b.type === 'file') b.ref = 'ref-b'
  withFiles.blocks = [makeBlock('text'), a, b, empty]
  // The never-filled block has an empty ref and must not be collected.
  assert.deepEqual(attachmentRefs(withFiles), ['ref-a', 'ref-b'])
  assert.deepEqual(attachmentRefs(doc()), [])
})
