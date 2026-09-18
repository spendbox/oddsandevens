import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSeen, unreadIn } from '../team-unread.ts'
import type { Pulse } from '../teams.ts'

const pulse = (teamId: string, lastAt: number): Pulse => ({
  teamId,
  name: teamId,
  lastAt,
  lastAuthor: 'Ada',
  messages: 1,
})

test('a team nobody has opened, with something in it, is unread', () => {
  assert.deepEqual(
    unreadIn([pulse('a', 100)], {}).map((p) => p.teamId),
    ['a'],
  )
})

test('a team with nothing said in it is never unread', () => {
  // A team somebody made an hour ago and has not spoken in must not sit
  // there with a dot on it forever.
  assert.deepEqual(unreadIn([pulse('a', 0)], {}), [])
})

test('read up to the last message is read', () => {
  assert.deepEqual(unreadIn([pulse('a', 100)], { a: 100 }), [])
  assert.deepEqual(unreadIn([pulse('a', 100)], { a: 101 }), [], 'and so is read past it')
})

test('something said since is unread again', () => {
  assert.deepEqual(
    unreadIn([pulse('a', 200)], { a: 100 }).map((p) => p.teamId),
    ['a'],
  )
})

test('several teams, only the ones with something new', () => {
  const seen = { a: 100, b: 100 }
  assert.deepEqual(
    unreadIn([pulse('a', 100), pulse('b', 300), pulse('c', 50)], seen).map((p) => p.teamId),
    ['b', 'c'],
  )
})

test('what was remembered is read back, and rubbish is not', () => {
  assert.deepEqual(parseSeen('{"a":100}'), { a: 100 })
  assert.deepEqual(parseSeen(''), {}, 'nothing remembered is nothing read')
  assert.deepEqual(parseSeen('not json'), {}, 'and neither is nonsense')
  assert.deepEqual(parseSeen('{"a":"soon"}'), {}, 'a time has to be a number')
})
