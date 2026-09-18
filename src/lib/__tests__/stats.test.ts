import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countLabel, summarise, wordsIn } from '../stats.ts'
import type { Block, Doc } from '../types.ts'

/*
  A fixed moment, so midnight, the edge of the week and the length of a streak
  are arithmetic rather than something to reproduce by waiting. Midday, so that
  "yesterday" is unambiguous whatever the machine's timezone does to it.
*/
const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime()
const DAY = 86_400_000

let counter = 0
const text = (value: string): Block => ({ id: `t${counter++}`, type: 'text', text: value })
const todo = (value: string, done = false): Block => ({
  id: `k${counter++}`,
  type: 'todo',
  text: value,
  done,
})
const note = (over: Partial<Doc> = {}): Doc => ({
  id: `d${counter++}`,
  title: '',
  blocks: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

test('nothing written is every number at nothing, and no bars to draw', () => {
  const summary = summarise([], NOW)
  assert.equal(summary.notes, 0)
  assert.equal(summary.words, 0)
  assert.equal(summary.streak, 0)
  assert.equal(summary.busiest, 0)
  assert.equal(summary.days.length, 14, 'the strip is always a fortnight long')
})

test('words are counted as a person would count them, title included', () => {
  assert.equal(
    wordsIn(note({ title: 'Two words', blocks: [text('three little words')] })),
    5,
  )
  // Not a tokeniser: punctuation does not split a word and does not add one.
  assert.equal(wordsIn(note({ blocks: [text("don't — £40")] })), 3)
  assert.equal(wordsIn(note({ blocks: [text('   '), text('')] })), 0, 'blank lines are not words')
})

test('the trash is not counted, in any of it', () => {
  const summary = summarise(
    [
      note({ blocks: [text('kept'), todo('a box')] }),
      note({ blocks: [text('binned'), todo('another box')], deletedAt: NOW }),
      note({ blocks: [], deletedAt: NOW, purgedAt: NOW }),
    ],
    NOW,
  )
  assert.equal(summary.notes, 1)
  // "kept" plus the three words of the box it keeps: a box is a line of the
  // note, so its words are the note's words.
  assert.equal(summary.words, 3)
  assert.equal(summary.open, 1)
})

test('boxes are counted both ways, and favourites and exclusions with them', () => {
  const summary = summarise(
    [
      note({ blocks: [todo('ring the bank'), todo('posted', true), todo('also done', true)] }),
      note({ favoritedAt: NOW }),
      note({ ignoreTasks: true, blocks: [todo('still a box')] }),
    ],
    NOW,
  )
  assert.equal(summary.open, 2, 'a box in an excluded note is still a box in a note')
  assert.equal(summary.done, 2)
  assert.equal(summary.favourites, 1)
  assert.equal(summary.ignored, 1)
})

test('this week is the last seven days, counted from when it was started', () => {
  const summary = summarise(
    [
      note({ createdAt: NOW - 2 * DAY }),
      note({ createdAt: NOW - 6 * DAY }),
      // Written a month ago and edited this morning: an edit is not writing
      // something, so this is not one of this week's.
      note({ createdAt: NOW - 30 * DAY, updatedAt: NOW }),
    ],
    NOW,
  )
  assert.equal(summary.thisWeek, 2)
})

test('the fortnight strip lands each note on its own day', () => {
  const summary = summarise(
    [note({ createdAt: NOW }), note({ createdAt: NOW }), note({ createdAt: NOW - 3 * DAY })],
    NOW,
  )
  const today = summary.days[summary.days.length - 1]
  assert.equal(today.count, 2)
  assert.equal(summary.days[summary.days.length - 4].count, 1)
  assert.equal(summary.busiest, 2, 'the bars are drawn against the busiest day')
  assert.equal(
    summary.days.reduce((total, day) => total + day.count, 0),
    3,
  )
})

test('a streak is days in a row, and today being empty does not break it yet', () => {
  const run = [1, 2, 3].map((back) => note({ createdAt: NOW - back * DAY }))
  assert.equal(summarise(run, NOW).streak, 3, 'counted back from yesterday while today is young')

  assert.equal(
    summarise([...run, note({ createdAt: NOW })], NOW).streak,
    4,
    'and today joins the end of it',
  )

  assert.equal(
    summarise([note({ createdAt: NOW - 2 * DAY }), note({ createdAt: NOW - 3 * DAY })], NOW).streak,
    0,
    'nothing today and nothing yesterday is no streak, however long the run before',
  )

  assert.equal(
    summarise([note({ createdAt: NOW }), note({ createdAt: NOW - 2 * DAY })], NOW).streak,
    1,
    'and a gap stops the count where it is',
  )
})

test('kinds come back commonest first, and only the ones there are', () => {
  const summary = summarise(
    [
      note({ title: 'Meeting with Ada' }),
      note({ title: 'Standup' }),
      note({ title: 'Idea: a smaller app' }),
    ],
    NOW,
  )
  assert.equal(summary.kinds[0].label, 'Meeting')
  assert.equal(summary.kinds[0].count, 2)
  assert.ok(
    summary.kinds.every((kind) => kind.count > 0),
    'a kind nobody has written is not a row of zero',
  )
})

test('a number is printed the way it is read', () => {
  assert.equal(countLabel(0), '0')
  assert.equal(countLabel(1204), '1,204')
  assert.equal(countLabel(12_400), '12.4k')
  assert.equal(countLabel(124_000), '124k')
  assert.equal(countLabel(2_400_000), '2.4m')
})
