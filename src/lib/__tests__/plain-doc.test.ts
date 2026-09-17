import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editableInPlain, hasRichBlocks, reconcile } from '../plain-doc.ts'
import { makeBlock } from '../blocks.ts'
import type { Block } from '../types.ts'

function text(value: string): Block {
  const block = makeBlock('text')
  if (block.type === 'text') block.text = value
  return block
}

function heading(value: string): Block {
  const block = makeBlock('heading', 1)
  if (block.type === 'heading') block.text = value
  return block
}

test('typing into a line changes that block and nothing else', () => {
  const before = [text('one'), text('two')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'one changed' },
    { id: before[1].id, text: 'two' },
  ])
  assert.equal(after.length, 2)
  assert.equal((after[0] as { text: string }).text, 'one changed')
  // Untouched blocks keep their identity, so nothing else is rewritten.
  assert.equal(after[1], before[1])
})

test('a read-back that changed nothing returns the identical array', () => {
  const before = [text('one'), text('two')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'one' },
    { id: before[1].id, text: 'two' },
  ])
  assert.equal(after, before)
})

test('typing in a heading leaves it a heading', () => {
  const before = [heading('Title')]
  const after = reconcile(before, [{ id: before[0].id, text: 'Title now longer' }])
  assert.equal(after[0].type, 'heading')
  assert.equal((after[0] as { level?: number }).level, 1)
})

test('a line the browser made is a new paragraph', () => {
  const before = [text('one')]
  const after = reconcile(before, [{ id: before[0].id, text: 'one' }, { text: 'two' }])
  assert.equal(after.length, 2)
  assert.equal(after[1].type, 'text')
  assert.equal((after[1] as { text: string }).text, 'two')
  assert.notEqual(after[1].id, before[0].id)
})

test('a split clones the id, and the second half becomes its own block', () => {
  const before = [heading('One two')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'One' },
    { id: before[0].id, text: 'two' },
  ])
  assert.equal(after.length, 2)
  assert.equal(after[0].type, 'heading')
  // The clone is a plain paragraph, not a second heading wearing the same id.
  assert.equal(after[1].type, 'text')
  assert.notEqual(after[1].id, after[0].id)
})

test('a line that did not come back was deleted', () => {
  const before = [text('one'), text('two'), text('three')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'one' },
    { id: before[2].id, text: 'three' },
  ])
  assert.deepEqual(after.map((b) => (b as { text: string }).text), ['one', 'three'])
})

test('deleting everything still leaves somewhere to type', () => {
  const after = reconcile([text('one')], [])
  assert.equal(after.length, 1)
  assert.equal(after[0].type, 'text')
  assert.equal((after[0] as { text: string }).text, '')
})

test('a spreadsheet is carried across untouched, whatever came back for it', () => {
  const table = makeBlock('table')
  const before = [text('above'), table, text('below')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'above' },
    { id: table.id, text: 'whatever the browser read out of a grid' },
    { id: before[2].id, text: 'below' },
  ])
  assert.equal(after[1], table)
})

test('formatting is kept, and dropped when it stops being formatting', () => {
  const before = [text('plain')]
  const bold = reconcile(before, [{ id: before[0].id, text: 'plain', html: '<b>plain</b>' }])
  assert.equal((bold[0] as { html?: string }).html, '<b>plain</b>')
  const back = reconcile(bold, [{ id: bold[0].id, text: 'plain', html: 'plain' }])
  assert.equal((back[0] as { html?: string }).html, undefined)
})

test('what the plain surface can and cannot type into', () => {
  assert.equal(editableInPlain(text('x')), true)
  assert.equal(editableInPlain(makeBlock('todo')), true)
  assert.equal(editableInPlain(makeBlock('table')), false)
  assert.equal(hasRichBlocks([text('x')]), false)
  assert.equal(hasRichBlocks([text('x'), makeBlock('code')]), true)
})
