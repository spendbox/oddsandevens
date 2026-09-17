import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kindForText, kindOf, KIND_LABELS } from '../kind.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0
const text = (value: string): Block => ({ id: `t${counter++}`, type: 'text', text: value })
const todo = (value: string): Block => ({
  id: `t${counter++}`,
  type: 'todo',
  text: value,
  done: false,
})
const doc = (title: string, blocks: Block[] = []): Doc => ({
  id: `d${counter++}`,
  title,
  blocks,
  createdAt: 0,
  updatedAt: 0,
})

test('the title says what kind of note it is', () => {
  assert.equal(kindOf(doc('Monday standup')), 'meeting')
  assert.equal(kindOf(doc('Retro notes')), 'meeting')
  assert.equal(kindOf(doc('Competitor research')), 'research')
  assert.equal(kindOf(doc('Ideas for the launch')), 'idea')
  assert.equal(kindOf(doc('Errands')), 'task')
})

test('a note nobody named is read from its opening instead', () => {
  assert.equal(kindOf(doc('', [text('Agenda for Thursday with the landlord')])), 'meeting')
  assert.equal(kindOf(doc('', [text('Background reading on the lease')])), 'research')
})

test('a page of boxes to tick is a list of things to do, whatever it is called', () => {
  assert.equal(kindOf(doc('Saturday', [todo('Post the forms'), todo('Ring the bank')])), 'task')
  // One box among four paragraphs is not a list of things to do.
  assert.equal(
    kindOf(doc('Saturday', [text('It rained.'), text('Then it stopped.'), todo('Umbrella')])),
    'note',
  )
})

test('a note that says nothing about itself is a note', () => {
  assert.equal(kindOf(doc('Saturday', [text('It was a quiet afternoon.')])), 'note')
  assert.equal(kindOf(doc('')), 'note')
})

test('a word that is as often a verb is not a signal', () => {
  // "Call the plumber" is a thing to do; "Call with Ama" is a meeting. One
  // word cannot be both, so it is in neither list.
  assert.equal(kindForText('Call the plumber'), null)
  assert.equal(kindForText('Review of the year'), null)
})

test('only whole words count', () => {
  // "Ideal" is not "idea", and this is exactly the bug substring matching
  // produced in the icons table.
  assert.equal(kindForText('The ideal week'), null)
  assert.equal(kindForText('Taskmaster'), null)
})

test('every kind has a name to show', () => {
  for (const kind of ['meeting', 'task', 'idea', 'person', 'research', 'note'] as const) {
    assert.equal(typeof KIND_LABELS[kind], 'string')
    assert.ok(KIND_LABELS[kind].length)
  }
})
