import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  docLabel,
  docOpening,
  docPreview,
  makeBlock,
  shortcutFor,
  withBlocksBack,
  withoutBlocks,
} from '../blocks.ts'
import { blockText, isTextish, type Block, type Doc } from '../types.ts'

test('every block type can be made and is well formed', () => {
  const types = ['text', 'heading', 'bullet', 'quote', 'todo', 'divider'] as const
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
  assert.equal(isTextish(makeBlock('divider')), false)
  assert.equal(isTextish(makeBlock('divider')), false)
})

test('the sidebar preview picks the first real text', () => {
  const heading = makeBlock('heading')
  const text = makeBlock('text')
  if (heading.type === 'heading') heading.text = ''
  if (text.type === 'text') text.text = 'the actual content'
  assert.equal(docPreview([heading, text]), 'the actual content')
  assert.equal(docPreview([]), 'Empty')
})

test('a document with a title is called by it', () => {
  const doc = { id: 'a', title: 'Lagos meeting', blocks: [], createdAt: 0, updatedAt: 0 }
  assert.equal(docLabel(doc), 'Lagos meeting')
})

test('a document with no title is called by its first line', () => {
  const block = makeBlock('text')
  Object.assign(block, { text: 'Send the invoice to the printer' })
  const doc = { id: 'a', title: '  ', blocks: [block], createdAt: 0, updatedAt: 0 }
  assert.equal(docLabel(doc), 'Send the invoice to the printer')
})

test('a long first line is cut rather than filling the row', () => {
  const block = makeBlock('text')
  Object.assign(block, { text: 'x'.repeat(200) })
  const doc = { id: 'a', title: '', blocks: [block], createdAt: 0, updatedAt: 0 }
  assert.ok(docLabel(doc).length <= 61, String(docLabel(doc).length))
  assert.ok(docLabel(doc).endsWith('…'))
})

test('an empty document is Untitled rather than blank', () => {
  const doc = { id: 'a', title: '', blocks: [makeBlock('text')], createdAt: 0, updatedAt: 0 }
  assert.equal(docLabel(doc), 'Untitled')
})

test('a document that begins with a heading is called by it', () => {
  const heading = makeBlock('heading', 1)
  Object.assign(heading, { text: 'Budget' })
  const doc = { id: 'a', title: '', blocks: [heading], createdAt: 0, updatedAt: 0 }
  assert.equal(docLabel(doc), 'Budget')
})

test('the opening of a note skips the line its name came from', () => {
  const doc: Doc = {
    id: 'd',
    title: '',
    blocks: [
      { id: '1', type: 'heading', level: 1, text: 'Lease renewal' },
      { id: '2', type: 'text', text: 'The landlord wants an answer by Friday.' },
      { id: '3', type: 'text', text: 'Ask about the boiler.' },
    ],
    createdAt: 0,
    updatedAt: 0,
  }
  const opening = docOpening(doc)
  assert.ok(!opening.startsWith('Lease renewal'))
  assert.match(opening, /landlord/)
  assert.match(opening, /boiler/)
})

test('a long opening is cut, with something to show it was', () => {
  const doc: Doc = {
    id: 'd',
    title: 'Notes',
    blocks: [{ id: '1', type: 'text', text: 'word '.repeat(200) }],
    createdAt: 0,
    updatedAt: 0,
  }
  const opening = docOpening(doc, 60)
  assert.ok(opening.length <= 61, opening)
  assert.ok(opening.endsWith('…'))
})

test('a note whose name was cut out of its first line does not print it twice', () => {
  const line =
    'Meeting with Sam about the lease on Friday at three, and the service charge figures'
  const doc: Doc = {
    id: 'd',
    title: docLabel({ id: 'd', title: '', blocks: [], createdAt: 0, updatedAt: 0 }),
    blocks: [{ id: '1', type: 'text', text: line }, { id: '2', type: 'text', text: 'Check the break clause.' }],
    createdAt: 0,
    updatedAt: 0,
  }
  // The name is the opening line, cut short. The two lines under it in a list
  // must be the *rest* of the note, not the same sentence again.
  const named = { ...doc, title: '' }
  const opening = docOpening(named)
  assert.match(opening, /break clause/)
  assert.ok(!opening.startsWith('Meeting with Sam'), opening)
})

/* ------------------------------------------- lines out of a note, and back */

const line = (id: string, text = id): Block => ({ id, type: 'text', text })

test('taking lines out says where each one was', () => {
  const blocks = [line('a'), line('b'), line('c'), line('d')]
  const { kept, removed } = withoutBlocks(blocks, ['b', 'd'])
  assert.deepEqual(kept.map((block) => block.id), ['a', 'c'])
  assert.deepEqual(
    removed.map((entry) => [entry.index, entry.block.id]),
    [[1, 'b'], [3, 'd']],
  )
})

test('an id that is not there takes nothing out', () => {
  const blocks = [line('a')]
  const { kept, removed } = withoutBlocks(blocks, ['nope'])
  assert.equal(kept.length, 1)
  assert.equal(removed.length, 0)
})

test('putting them back puts them where they came from', () => {
  const blocks = [line('a'), line('b'), line('c'), line('d')]
  const { kept, removed } = withoutBlocks(blocks, ['b', 'd'])
  assert.deepEqual(
    withBlocksBack(kept, removed).map((block) => block.id),
    ['a', 'b', 'c', 'd'],
    'and in the right order, which needs the earlier ones back first',
  )
})

test('three out of the middle come back as three, not as a heap at the end', () => {
  const blocks = ['a', 'b', 'c', 'd', 'e'].map((id) => line(id))
  const { kept, removed } = withoutBlocks(blocks, ['b', 'c', 'd'])
  assert.deepEqual(kept.map((b) => b.id), ['a', 'e'])
  assert.deepEqual(withBlocksBack(kept, removed).map((b) => b.id), ['a', 'b', 'c', 'd', 'e'])
})

test('a note emptied to one blank line is not left with the blank line', () => {
  // Taking the last line out leaves a note with one empty paragraph in it,
  // because a note with no lines at all cannot be typed into. Putting the
  // lines back must not leave that stand-in above them.
  const { removed } = withoutBlocks([line('only', 'the only line')], ['only'])
  const emptied = [makeBlock('text')]
  assert.deepEqual(
    withBlocksBack(emptied, removed).map((block) => blockText(block)),
    ['the only line'],
  )
})

test('undoing twice does not leave the line twice', () => {
  const { kept, removed } = withoutBlocks([line('a'), line('b')], ['b'])
  const once = withBlocksBack(kept, removed)
  assert.deepEqual(withBlocksBack(once, removed).map((b) => b.id), ['a', 'b'])
})

test('a note that changed underneath still takes the line back', () => {
  // The index was recorded against a longer note. Somewhere in range beats
  // refusing to put somebody's line back at all.
  const { removed } = withoutBlocks([line('a'), line('b'), line('c')], ['c'])
  assert.deepEqual(withBlocksBack([line('a')], removed).map((b) => b.id), ['a', 'c'])
})
