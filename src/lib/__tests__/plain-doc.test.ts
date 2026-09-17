import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyShape, editableInPlain, hasRichBlocks, reconcile } from '../plain-doc.ts'
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

test('a block the surface cannot type in is carried across untouched', () => {
  const rule = makeBlock('divider')
  const before = [text('above'), rule, text('below')]
  const after = reconcile(before, [
    { id: before[0].id, text: 'above' },
    { id: rule.id, text: 'whatever the browser read out of it' },
    { id: before[2].id, text: 'below' },
  ])
  assert.equal(after[1], rule)
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
  assert.equal(editableInPlain(makeBlock('divider')), false)
  assert.equal(hasRichBlocks([text('x')]), false)
  assert.equal(hasRichBlocks([text('x'), makeBlock('divider')]), true)
})

test('a split inside a bullet makes another bullet', () => {
  const bullet = makeBlock('bullet')
  if (bullet.type === 'bullet') bullet.text = 'milk and eggs'
  const after = reconcile([bullet], [
    { id: bullet.id, text: 'milk' },
    { id: bullet.id, text: 'eggs' },
  ])
  assert.equal(after[1].type, 'bullet')
  assert.notEqual(after[1].id, after[0].id)
})

test('a numbered item carries its numbering across the split', () => {
  const item = makeBlock('bullet')
  if (item.type === 'bullet') {
    item.ordered = true
    item.text = 'one'
  }
  const after = reconcile([item], [{ id: item.id, text: 'one' }, { id: item.id, text: '' }])
  assert.equal((after[1] as { ordered?: boolean }).ordered, true)
})

test('a split inside a heading makes a paragraph, not a second heading', () => {
  const head = heading('Title of it')
  const after = reconcile([head], [{ id: head.id, text: 'Title' }, { id: head.id, text: 'of it' }])
  assert.equal(after[0].type, 'heading')
  assert.equal(after[1].type, 'text')
})

test('a checkbox ticked in the page is ticked on the block', () => {
  const task = makeBlock('todo')
  if (task.type === 'todo') task.text = 'ring the bank'
  const after = reconcile([task], [{ id: task.id, text: 'ring the bank', done: true }])
  assert.equal((after[0] as { done?: boolean }).done, true)
  // And a read-back that says nothing about the tick changes nothing.
  assert.equal(reconcile(after, [{ id: after[0].id, text: 'ring the bank' }]), after)
})

test('a shape is applied without losing the id or the indent', () => {
  const block = text('- milk')
  ;(block as { indent?: number }).indent = 1
  const shaped = applyShape(block, { type: 'bullet', text: 'milk' })
  assert.equal(shaped.id, block.id)
  assert.equal(shaped.type, 'bullet')
  assert.equal((shaped as { text: string }).text, 'milk')
  assert.equal((shaped as { indent?: number }).indent, 1)
})

test('a shape that makes a checkbox carries whether it is ticked', () => {
  const shaped = applyShape(text('[x] paid'), { type: 'todo', text: 'paid', done: true })
  assert.equal((shaped as { done?: boolean }).done, true)
})
