import assert from 'node:assert/strict'
import { test } from 'node:test'
import { when } from '../when.ts'

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
