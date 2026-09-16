import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COALESCE_MS,
  LIMIT,
  canRedo,
  canUndo,
  emptyHistory,
  record,
  redo,
  undo,
} from '../history.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0
const line = (value: string): Block => ({ id: `b${counter++}`, type: 'text', text: value })

/** A document with one paragraph, so typing is a new blocks array each time. */
const typed = (value: string, id = 'only'): Doc => ({
  id: 'doc',
  title: '',
  blocks: [{ id, type: 'text', text: value }],
  createdAt: 0,
  updatedAt: 0,
})

test('nothing is recorded when nothing changed', () => {
  const doc = typed('hello')
  const history = record(emptyHistory(), doc, doc, 1000)
  assert.equal(canUndo(history), false)
})

test('undo goes back to the state before the edit', () => {
  const first = typed('hello')
  const second = typed('hello world')
  const history = record(emptyHistory(), first, second, 1000)
  const step = undo(history, second)
  assert.ok(step)
  assert.equal(step.doc.blocks[0].type === 'text' && step.doc.blocks[0].text, 'hello')
})

test('there is nothing to undo at the start', () => {
  assert.equal(undo(emptyHistory(), typed('hello')), null)
  assert.equal(canUndo(emptyHistory()), false)
})

test('redo puts it back', () => {
  const first = typed('hello')
  const second = typed('hello world')
  let history = record(emptyHistory(), first, second, 1000)
  const back = undo(history, second)
  assert.ok(back)
  history = back.history
  assert.equal(canRedo(history), true)

  const forward = redo(history, back.doc)
  assert.ok(forward)
  assert.equal(forward.doc.blocks[0].type === 'text' && forward.doc.blocks[0].text, 'hello world')
})

test('typing quickly is one step, not one step per letter', () => {
  // Ctrl+Z taking back a single character is nobody's idea of undo, and would
  // fill the whole history inside one sentence.
  let history = emptyHistory()
  let doc = typed('h')
  for (const value of ['he', 'hel', 'hell', 'hello']) {
    const next = typed(value)
    history = record(history, doc, next, 1000)
    doc = next
  }
  assert.equal(history.past.length, 1)
  const step = undo(history, doc)
  assert.ok(step)
  assert.equal(step.doc.blocks[0].type === 'text' && step.doc.blocks[0].text, 'h')
})

test('a pause starts a new step', () => {
  let history = emptyHistory()
  const a = typed('one')
  const b = typed('one two')
  const c = typed('one two three')
  history = record(history, a, b, 1000)
  history = record(history, b, c, 1000 + COALESCE_MS + 1)
  assert.equal(history.past.length, 2)
})

test('a structural change is always its own step', () => {
  // An accidental Enter has to be undoable on its own. If it coalesced with
  // the keystroke before it, undo would take back the sentence as well.
  const before: Doc = { id: 'doc', title: '', blocks: [line('one')], createdAt: 0, updatedAt: 0 }
  const split: Doc = {
    ...before,
    blocks: [line('one'), line('')],
  }
  const more: Doc = { ...split, blocks: [...split.blocks, line('')] }

  let history = record(emptyHistory(), before, split, 1000)
  history = record(history, split, more, 1010)
  assert.equal(history.past.length, 2)
})

test('editing after an undo throws the redo branch away', () => {
  let history = record(emptyHistory(), typed('a'), typed('ab'), 1000)
  const back = undo(history, typed('ab'))
  assert.ok(back)
  history = back.history
  assert.equal(canRedo(history), true)

  history = record(history, back.doc, typed('ac'), 5000)
  assert.equal(canRedo(history), false, 'a new edit makes the old future unreachable')
})

test('a title change is recorded like any other', () => {
  const before: Doc = { id: 'doc', title: '', blocks: [], createdAt: 0, updatedAt: 0 }
  const after: Doc = { ...before, title: 'Named' }
  const history = record(emptyHistory(), before, after, 1000)
  const step = undo(history, after)
  assert.ok(step)
  assert.equal(step.doc.title, '')
})

test('the history is capped, oldest first', () => {
  let history = emptyHistory()
  let doc = typed('0')
  for (let i = 1; i <= LIMIT + 20; i++) {
    const next = typed(String(i))
    // Spaced out, so every one of these is its own step.
    history = record(history, doc, next, i * (COALESCE_MS + 10))
    doc = next
  }
  assert.equal(history.past.length, LIMIT)
  const oldest = history.past[0]
  assert.equal(
    oldest.blocks[0].type === 'text' && oldest.blocks[0].text,
    String(20),
    'the earliest steps are the ones dropped',
  )
})

test('undo can be walked all the way back and forward again', () => {
  let history = emptyHistory()
  const states = [typed('one'), typed('two'), typed('three'), typed('four')]
  for (let i = 1; i < states.length; i++) {
    history = record(history, states[i - 1], states[i], i * 10_000)
  }

  let doc = states[states.length - 1]
  for (let i = states.length - 2; i >= 0; i--) {
    const step = undo(history, doc)
    assert.ok(step, 'expected a step back')
    history = step.history
    doc = step.doc
    assert.deepEqual(doc, states[i])
  }
  assert.equal(canUndo(history), false)

  for (let i = 1; i < states.length; i++) {
    const step = redo(history, doc)
    assert.ok(step, 'expected a step forward')
    history = step.history
    doc = step.doc
    assert.deepEqual(doc, states[i])
  }
  assert.equal(canRedo(history), false)
})
