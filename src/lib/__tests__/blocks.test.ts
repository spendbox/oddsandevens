import assert from 'node:assert/strict'
import { test } from 'node:test'
import { docPreview, makeBlock, shortcutFor } from '../blocks.ts'
import { blockText, isTextish } from '../types.ts'

test('every block type can be made and is well formed', () => {
  const types = ['text', 'heading', 'bullet', 'quote', 'todo', 'table', 'code', 'form', 'divider'] as const
  for (const type of types) {
    const block = makeBlock(type)
    assert.equal(block.type, type)
    assert.ok(block.id, `${type} has no id`)
    // Nothing should throw reading text out of a fresh block.
    assert.equal(typeof blockText(block), 'string')
  }
})

test('two blocks never share an id', () => {
  const ids = new Set(Array.from({ length: 200 }, () => makeBlock('text').id))
  assert.equal(ids.size, 200)
})

test('a fresh table is a usable grid', () => {
  const block = makeBlock('table')
  assert.equal(block.type === 'table' && block.rows >= 2, true)
  assert.equal(block.type === 'table' && block.cols >= 2, true)
})

test('a fresh form starts with one question', () => {
  const block = makeBlock('form')
  assert.equal(block.type === 'form' && block.fields.length, 1)
})

test('heading level is carried through, and defaults', () => {
  assert.equal(makeBlock('heading', 2).type === 'heading' && (makeBlock('heading', 2) as { level: number }).level, 2)
  const plain = makeBlock('heading')
  assert.equal(plain.type === 'heading' && (plain as { level: number }).level, 1)
})

test('markdown shortcuts map to the right block', () => {
  assert.deepEqual(shortcutFor('# '), { type: 'heading', level: 1 })
  assert.deepEqual(shortcutFor('## '), { type: 'heading', level: 2 })
  assert.deepEqual(shortcutFor('### '), { type: 'heading', level: 3 })
  assert.equal(shortcutFor('- ')?.type, 'bullet')
  assert.equal(shortcutFor('* ')?.type, 'bullet')
  assert.equal(shortcutFor('[] ')?.type, 'todo')
  assert.equal(shortcutFor('[ ] ')?.type, 'todo')
  assert.equal(shortcutFor('> ')?.type, 'quote')
  assert.equal(shortcutFor('```')?.type, 'code')
  assert.equal(shortcutFor('---')?.type, 'divider')
})

test('a leading number starts a numbered list', () => {
  assert.deepEqual(shortcutFor('1. '), { type: 'bullet', level: undefined, ordered: true })
  assert.equal(shortcutFor('2) ')?.ordered, true)
  assert.equal(shortcutFor('10. ')?.ordered, true)
})

test('ordinary text is never mistaken for a shortcut', () => {
  for (const text of ['hello', '#hashtag', 'a - b', '', '#', '--', '-> arrow', '># ']) {
    assert.equal(shortcutFor(text), null, `"${text}" was treated as a shortcut`)
  }
})

test('isTextish agrees with what blockText can read', () => {
  assert.equal(isTextish(makeBlock('text')), true)
  assert.equal(isTextish(makeBlock('heading')), true)
  assert.equal(isTextish(makeBlock('table')), false)
  assert.equal(isTextish(makeBlock('divider')), false)
})

test('the sidebar preview picks the first real text', () => {
  const heading = makeBlock('heading')
  const text = makeBlock('text')
  if (heading.type === 'heading') heading.text = ''
  if (text.type === 'text') text.text = 'the actual content'
  assert.equal(docPreview([heading, text]), 'the actual content')
  assert.equal(docPreview([]), 'Empty')
  assert.equal(docPreview([makeBlock('table')]), 'Spreadsheet')
})
