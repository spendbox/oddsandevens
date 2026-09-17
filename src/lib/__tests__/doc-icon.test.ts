import assert from 'node:assert/strict'
import { test } from 'node:test'
import { iconFor, iconForText } from '../doc-icon.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0
const text = (value: string): Block => ({ id: `t${counter++}`, type: 'text', text: value })
const doc = (title: string, blocks: Block[] = []): Doc => ({
  id: `d${counter++}`,
  title,
  blocks,
  createdAt: 0,
  updatedAt: 0,
})

test('the title decides, when it says anything', () => {
  assert.equal(iconFor(doc('Lagos budget 2026')), 'money')
  assert.equal(iconFor(doc('Tenancy agreement')), 'contract')
  assert.equal(iconFor(doc('Recipe for jollof')), 'food')
  assert.equal(iconFor(doc('Monday standup')), 'calendar')
  assert.equal(iconFor(doc('Flight to Accra')), 'travel')
})

test('a document nobody named is read from its opening instead', () => {
  // The caret starts in the body, so plenty of notes never get a title.
  assert.equal(iconFor(doc('', [text('Invoice for the March brochures')])), 'money')
  assert.equal(iconFor(doc('', [text('Shopping for the weekend')])), 'shopping')
})

test('an unremarkable document is a sheet of paper', () => {
  assert.equal(iconFor(doc('Saturday', [text('It was a quiet afternoon.')])), 'file')
  assert.equal(iconFor(doc('')), 'file')
})

test('a word that is as often a verb is not a signal', () => {
  // Both of these were in the table once. "Notes from the call" is a meeting
  // note, and "Numbers" is a spreadsheet — neither is a phone book.
  assert.equal(iconForText('Notes from the call'), null)
  assert.equal(iconForText('Numbers'), null)
  assert.equal(iconForText('First draft'), null)
  assert.equal(iconForText('Press release'), null)
  assert.equal(iconForText('Book the room'), null)
})

test('only whole words count', () => {
  // The regression this exists for: substring matching made every document
  // mentioning "planning" a plane ticket, and every "billing" a receipt.
  assert.equal(iconForText('Quarterly planning'), null)
  assert.equal(iconForText('Billings Road'), null)
  assert.equal(iconForText('Codependency'), null)
  assert.equal(iconForText('Take the flight'), 'travel')
})

test('punctuation and case do not hide a word', () => {
  assert.equal(iconForText('BUDGET, 2026'), 'money')
  assert.equal(iconForText('re: contract'), 'contract')
  assert.equal(iconForText('Invoice—March'), 'money')
})

test('only the opening of an untitled document is read', () => {
  // A word thirty paragraphs down is what the document mentions, not what it
  // is about — otherwise every long note ends up wearing somebody else's icon.
  const long = doc('', [text('Nothing in particular. '.repeat(40)), text('invoice')])
  assert.equal(iconFor(long), 'file')
})

test('a heading at the top names the document when the title field is empty', () => {
  const headed = doc('', [
    { id: 'k', type: 'heading', level: 1, text: 'Tenancy agreement' },
    text('This agreement is made between…'),
  ])
  assert.equal(iconFor(headed), 'contract')
})
