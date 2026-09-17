import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import { docToMarkdown, docToText, safeFilename } from '../export.ts'
import type { Block, Doc } from '../types.ts'

function doc(blocks: Block[], title = 'My doc'): Doc {
  return { id: 'd', title, blocks, createdAt: 0, updatedAt: 0 }
}

function textBlock(type: 'text' | 'heading' | 'bullet' | 'quote', text: string, html?: string) {
  const block = makeBlock(type, 1)
  if (block.type === type) {
    block.text = text
    if (html) block.html = html
  }
  return block
}

test('the title becomes the top heading', () => {
  assert.equal(docToMarkdown(doc([])).startsWith('# My doc'), true)
  assert.equal(docToMarkdown(doc([], '  ')).startsWith('# Untitled'), true)
})

test('block types map to their markdown', () => {
  const md = docToMarkdown(
    doc([
      textBlock('heading', 'Section'),
      textBlock('text', 'A paragraph.'),
      textBlock('bullet', 'A point'),
      textBlock('quote', 'Said so'),
    ]),
  )
  // The document title is h1, so a heading-1 block is h2 beneath it.
  assert.ok(md.includes('## Section'), md)
  assert.ok(md.includes('A paragraph.'))
  assert.ok(md.includes('- A point'))
  assert.ok(md.includes('> Said so'))
})

test('tasks export as markdown checkboxes, ticked or not', () => {
  const done = makeBlock('todo')
  const open = makeBlock('todo')
  if (done.type === 'todo') {
    done.text = 'Finished'
    done.done = true
  }
  if (open.type === 'todo') open.text = 'Outstanding'
  const md = docToMarkdown(doc([done, open]))
  assert.ok(md.includes('- [x] Finished'), md)
  assert.ok(md.includes('- [ ] Outstanding'), md)
})

test('inline formatting survives as markdown', () => {
  const md = docToMarkdown(doc([textBlock('text', 'a bold word', 'a <b>bold</b> word')]))
  assert.ok(md.includes('a **bold** word'), md)
})

test('an empty paragraph does not litter the file with blank lines', () => {
  const md = docToMarkdown(doc([textBlock('text', ''), textBlock('text', 'real'), textBlock('text', '')]))
  assert.ok(!/\n\n\n/.test(md), md)
})

test('plain text export drops the markup', () => {
  const txt = docToText(doc([textBlock('heading', 'Section'), textBlock('text', 'Body')]))
  assert.ok(txt.includes('Section'))
  assert.ok(txt.includes('Body'))
  assert.ok(!txt.includes('##'))
})

test('filenames cannot contain anything an OS will reject', () => {
  assert.equal(safeFilename('Notes', 'md'), 'Notes.md')
  assert.equal(safeFilename('a/b\\c:d*e?f"g<h>i|j', 'md'), 'a-b-c-d-e-f-g-h-i-j.md')
  assert.equal(safeFilename('   ', 'txt'), 'Untitled.txt')
  // Windows silently renames a file ending in a dot or a space.
  assert.equal(safeFilename('trailing dot.', 'md'), 'trailing dot.md')
  assert.equal(safeFilename('trailing space ', 'md'), 'trailing space.md')
  assert.ok(safeFilename('x'.repeat(500), 'md').length < 100)
})

test('every block type exports without throwing', () => {
  const types = ['text', 'heading', 'bullet', 'quote', 'todo', 'divider'] as const
  for (const type of types) {
    const block = makeBlock(type)
    assert.equal(typeof docToMarkdown(doc([block])), 'string', `${type} broke markdown export`)
    assert.equal(typeof docToText(doc([block])), 'string', `${type} broke text export`)
  }
})
