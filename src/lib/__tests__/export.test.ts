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

test('a table exports its computed values, not its formulas', () => {
  const table = makeBlock('table')
  if (table.type === 'table') {
    table.rows = 2
    table.cols = 2
    table.cells = { A1: '10', B1: '20', A2: '=A1+B1', B2: 'note' }
  }
  const md = docToMarkdown(doc([table]))
  assert.ok(md.includes('| 30 |'), md)
  assert.ok(!md.includes('=A1+B1'), 'the formula leaked into the export')
  // Markdown tables need a header row; the column letters stand in.
  assert.ok(md.includes('| A | B |'), md)
  assert.ok(md.includes('| --- | --- |'), md)
})

test('a pipe inside a cell cannot break the table', () => {
  const table = makeBlock('table')
  if (table.type === 'table') {
    table.rows = 1
    table.cols = 1
    table.cells = { A1: 'a | b' }
  }
  assert.ok(docToMarkdown(doc([table])).includes('a \\| b'))
})

test('a code block is fenced, and backticks inside cannot end it early', () => {
  const plain = makeBlock('code')
  if (plain.type === 'code') {
    plain.code = 'const x = 1'
    plain.lang = 'javascript'
  }
  const md = docToMarkdown(doc([plain]))
  assert.ok(md.includes('```javascript'), md)

  const tricky = makeBlock('code')
  if (tricky.type === 'code') {
    tricky.code = 'text with ``` inside'
    tricky.lang = 'plain'
  }
  const out = docToMarkdown(doc([tricky]))
  const fence = out.match(/`{4,}/)
  assert.ok(fence, 'the fence was not lengthened past the backticks in the code')
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

test('a table in plain text is tab separated', () => {
  const table = makeBlock('table')
  if (table.type === 'table') {
    table.rows = 1
    table.cols = 2
    table.cells = { A1: 'x', B1: 'y' }
  }
  assert.ok(docToText(doc([table])).includes('x\ty'))
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
  const types = ['text', 'heading', 'bullet', 'quote', 'todo', 'table', 'code', 'form', 'file', 'divider'] as const
  for (const type of types) {
    const block = makeBlock(type)
    assert.equal(typeof docToMarkdown(doc([block])), 'string', `${type} broke markdown export`)
    assert.equal(typeof docToText(doc([block])), 'string', `${type} broke text export`)
  }
})
