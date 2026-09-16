import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceCursor, FULL_EVERY_MS, OVERLAP_MS, pullSince, type Cursor } from '../sync.ts'

const NOW = 1_700_000_000_000

/* ------------------------------------------------------------ what to ask */

test('a device that has never synced asks for everything', () => {
  assert.equal(pullSince(null, NOW), null)
})

test('a cursor that has seen nothing yet asks for everything', () => {
  assert.equal(pullSince({ at: 0, fullAt: NOW }, NOW), null)
})

test('an established cursor asks only for what is newer', () => {
  const cursor: Cursor = { at: NOW - 5_000, fullAt: NOW - 1_000 }
  assert.equal(pullSince(cursor, NOW), NOW - 5_000 - OVERLAP_MS)
})

test('the ask reaches back past itself, because two clocks disagree', () => {
  const since = pullSince({ at: NOW, fullAt: NOW }, NOW)
  assert.ok(since !== null && NOW - since === OVERLAP_MS)
})

test('the overlap cannot reach before the beginning of time', () => {
  assert.equal(pullSince({ at: 10, fullAt: NOW }, NOW), 0)
})

test('everything is reconciled again once the interval has passed', () => {
  const cursor: Cursor = { at: NOW - 5_000, fullAt: NOW - FULL_EVERY_MS }
  assert.equal(pullSince(cursor, NOW), null)
})

test('a reconcile is not due a moment before it is due', () => {
  const cursor: Cursor = { at: NOW - 5_000, fullAt: NOW - FULL_EVERY_MS + 1 }
  assert.notEqual(pullSince(cursor, NOW), null)
})

/* ------------------------------------------------------- where it lands */

test('the cursor moves to the newest row it was given', () => {
  const next = advanceCursor(null, [5, 9, 7], NOW, true)
  assert.equal(next.at, 9)
})

test('the cursor never moves backwards', () => {
  const next = advanceCursor({ at: 100, fullAt: NOW }, [5, 9], NOW, false)
  assert.equal(next.at, 100)
})

test('a pull that returned nothing leaves the cursor where it was', () => {
  const next = advanceCursor({ at: 100, fullAt: 50 }, [], NOW, false)
  assert.deepEqual(next, { at: 100, fullAt: 50 })
})

test('the cursor never moves to the current time, only to something seen', () => {
  // A row written a second ago by a device whose clock is behind would be
  // older than "now" and would never be fetched again.
  const next = advanceCursor({ at: 100, fullAt: 50 }, [110], NOW, false)
  assert.equal(next.at, 110)
})

test('a full reconcile resets the clock on the next one', () => {
  assert.equal(advanceCursor({ at: 100, fullAt: 50 }, [110], NOW, true).fullAt, NOW)
})

test('an incremental pull does not postpone the next reconcile', () => {
  assert.equal(advanceCursor({ at: 100, fullAt: 50 }, [110], NOW, false).fullAt, 50)
})

test('the first pull of all sets the reconcile clock', () => {
  assert.equal(advanceCursor(null, [110], NOW, true).fullAt, NOW)
})

/* --------------------------------------------------------- the two together */

test('a row written while the cursor sat still is still fetched', () => {
  // The case this whole mechanism exists to get right: device B writes at a
  // timestamp slightly behind device A's cursor, because its clock is behind.
  let cursor = advanceCursor(null, [NOW], NOW, true)
  const writtenByAnotherDevice = NOW - 30_000
  const since = pullSince(cursor, NOW + 1_000)
  assert.ok(since !== null && writtenByAnotherDevice > since, 'the row is inside the overlap')

  cursor = advanceCursor(cursor, [writtenByAnotherDevice], NOW + 1_000, false)
  assert.equal(cursor.at, NOW, 'and an older row does not drag the cursor back')
})
