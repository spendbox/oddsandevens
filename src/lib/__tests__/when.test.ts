import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byDay, dayLabel, longStamp, stamp, when } from '../when.ts'

const NOW = Date.UTC(2026, 1, 14, 12, 0, 0)
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

test('seconds ago is just now', () => {
  assert.equal(when(NOW - 20_000, NOW), 'just now')
})

test('one minute is singular', () => {
  assert.equal(when(NOW - minute, NOW), '1 minute ago')
})

test('minutes, then hours', () => {
  assert.equal(when(NOW - 25 * minute, NOW), '25 minutes ago')
  assert.equal(when(NOW - 3 * hour, NOW), '3 hours ago')
})

test('a day ago is yesterday, not 1 day ago', () => {
  assert.equal(when(NOW - day, NOW), 'yesterday')
})

test('within the week is counted in days', () => {
  assert.equal(when(NOW - 3 * day, NOW), '3 days ago')
})

test('past a week it becomes a date rather than a countdown', () => {
  const answer = when(NOW - 40 * day, NOW)
  assert.ok(!answer.includes('ago'), answer)
})

test('a clock that is behind does not produce a negative', () => {
  assert.equal(when(NOW + 5 * minute, NOW), 'just now')
})

test('a stamp in a list is a time today, a word yesterday and a date before that', () => {
  const now = new Date('2026-09-17T16:32:00').getTime()
  assert.match(stamp(new Date('2026-09-17T09:05:00').getTime(), now), /9[:.]05/)
  assert.equal(stamp(new Date('2026-09-16T22:10:00').getTime(), now), 'Yesterday')
  assert.match(stamp(new Date('2026-09-02T10:00:00').getTime(), now), /Sep/)
  // An older year says which one, or "17 Sep" is ambiguous by twelve months.
  assert.match(stamp(new Date('2024-09-17T10:00:00').getTime(), now), /2024/)
})

test('a stamp from a device whose clock is ahead is still today', () => {
  // Two devices a minute apart produce this constantly, and "in 40 seconds"
  // is not a thing a list should ever say.
  const now = new Date('2026-09-17T16:32:00').getTime()
  assert.match(stamp(now + 40_000, now), /[:.]/)
})

test('the line under a title says the day as well as the time', () => {
  const now = new Date('2026-09-17T16:32:00').getTime()
  assert.match(longStamp(new Date('2026-09-17T09:05:00').getTime(), now), /^Today, /)
  assert.match(longStamp(new Date('2026-09-16T09:05:00').getTime(), now), /^Yesterday, /)
})

test('a day is called what somebody would call it', () => {
  const now = new Date('2026-09-18T16:32:00').getTime()
  assert.equal(dayLabel(new Date('2026-09-18T09:05:00').getTime(), now), 'Today')
  assert.equal(dayLabel(new Date('2026-09-17T23:59:00').getTime(), now), 'Yesterday')
  // Inside the week, the weekday is what people remember.
  assert.equal(dayLabel(new Date('2026-09-15T10:00:00').getTime(), now), 'Tuesday')
  assert.match(dayLabel(new Date('2026-09-01T10:00:00').getTime(), now), /September/)
  assert.match(dayLabel(new Date('2025-09-01T10:00:00').getTime(), now), /2025/)
})

test('a stamp from a device whose clock is ahead belongs to today', () => {
  const now = new Date('2026-09-18T16:32:00').getTime()
  assert.equal(dayLabel(now + 60_000, now), 'Today')
})

test('notes are grouped into days without being reordered', () => {
  const now = new Date('2026-09-18T16:32:00').getTime()
  const at = (iso: string) => ({ updatedAt: new Date(iso).getTime() })
  const groups = byDay(
    [
      at('2026-09-18T15:00:00'),
      at('2026-09-18T09:00:00'),
      at('2026-09-17T20:00:00'),
      at('2026-09-15T08:00:00'),
    ],
    now,
  )
  assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', 'Tuesday'])
  assert.deepEqual(groups.map((g) => g.items.length), [2, 1, 1])
  assert.equal(groups[0].items[0].updatedAt > groups[0].items[1].updatedAt, true)
})

test('nothing in, nothing out', () => {
  assert.deepEqual(byDay([]), [])
})
