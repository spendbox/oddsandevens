import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import {
  cleanFileName,
  extensionOf,
  groupByTopic,
  isUninformativeName,
  localSummary,
  localTitle,
  parseFiling,
  topicWords,
} from '../library.ts'
import type { Block } from '../types.ts'

function block(type: 'text' | 'heading', text: string): Block {
  const made = makeBlock(type, 1)
  Object.assign(made, { text })
  return made
}

/* ------------------------------------------------------------- file names */

test('an extension is read off the end', () => {
  assert.equal(extensionOf('Tenancy.PDF'), 'pdf')
  assert.equal(extensionOf('notes'), '')
  assert.equal(extensionOf('.gitignore'), '')
})

test('a filename is cleaned up into something readable', () => {
  assert.equal(cleanFileName('lagos_budget_2026.xlsx'), 'lagos budget 2026')
  assert.equal(cleanFileName('Tenancy-Agreement-final.docx'), 'Tenancy Agreement final')
  assert.equal(cleanFileName('Report (3).pdf'), 'Report')
})

test('the names a camera or a scanner produces say nothing', () => {
  for (const name of [
    'IMG_20240211.jpg',
    'scan_0012.pdf',
    'Document (3).docx',
    'Untitled.txt',
    'DSC00194.png',
    '20240211.pdf',
    'copy.docx',
  ]) {
    assert.ok(isUninformativeName(name), `should be treated as meaningless: ${name}`)
  }
})

test('a name somebody chose is kept', () => {
  for (const name of [
    'Lagos budget 2026.xlsx',
    'Tenancy agreement.pdf',
    'meeting-notes-march.md',
    'Q3 review.docx',
  ]) {
    assert.ok(!isUninformativeName(name), `should be treated as meaningful: ${name}`)
  }
})

/* ----------------------------------------------------------------- titles */

test('a document that begins with a heading is titled by it', () => {
  const blocks = [block('heading', 'Tenancy agreement'), block('text', 'This agreement is made…')]
  assert.equal(localTitle('scan_0012.pdf', blocks), 'Tenancy agreement')
})

test('a heading beats even a good filename, because the document already said', () => {
  const blocks = [block('heading', 'Deed of assignment')]
  assert.equal(localTitle('Lagos property.pdf', blocks), 'Deed of assignment')
})

test('a meaningful filename is used when the contents have no heading', () => {
  assert.equal(localTitle('Lagos budget 2026.pdf', [block('text', 'Some figures.')]), 'Lagos budget 2026')
})

test('a meaningless filename is passed over for the first line', () => {
  const blocks = [block('text', 'Invoice for printing services rendered in March.')]
  assert.equal(localTitle('scan_0012.pdf', blocks), 'Invoice for printing services rendered in March.')
})

test('a shouted heading is brought back down to a sentence', () => {
  assert.equal(localTitle('scan.pdf', [block('heading', 'TENANCY AGREEMENT')]), 'Tenancy agreement')
})

test('a long first line is cut to a title, not left as a paragraph', () => {
  const long = 'This agreement is made on the fourteenth day of March between the landlord and the tenant and covers'
  const title = localTitle('scan.pdf', [block('text', long)])
  assert.ok(title.length <= 71, title)
  assert.ok(title.endsWith('…'))
})

test('an empty document is Untitled rather than blank', () => {
  assert.equal(localTitle('scan_0012.pdf', []), 'Untitled')
})

/* -------------------------------------------------------------- summaries */

test('a short document is its own summary', () => {
  assert.equal(localSummary([block('text', 'Invoice for printing.')]), 'Invoice for printing.')
})

test('a long document is summarised by its opening, ending at a sentence', () => {
  const text = `${'This is the first sentence and it goes on for a while. '.repeat(6)}`
  const summary = localSummary([block('text', text)])
  assert.ok(summary.length <= 220, String(summary.length))
  assert.ok(summary.trimEnd().endsWith('.'), summary)
})

test('an empty document has no summary rather than an empty sentence', () => {
  assert.equal(localSummary([]), '')
})

/* ----------------------------------------------------------------- topics */

test('the words that come up most are the topic', () => {
  const words = topicWords('Tenancy tenancy tenancy agreement agreement landlord bread', 2)
  assert.deepEqual(words, ['tenancy', 'agreement'])
})

test('short and common words are not topics', () => {
  assert.deepEqual(topicWords('the and but cat dog the and', 3), [])
})

/* ---------------------------------------------------------------- filing */

test('the model’s answer is read into filings', () => {
  const filed = parseFiling(
    '[{"n":1,"title":"Tenancy agreement","summary":"A lease for the Lagos flat.","topic":"property"}]',
    1,
  )
  assert.deepEqual(filed, [
    { n: 1, title: 'Tenancy agreement', summary: 'A lease for the Lagos flat.', topic: 'property' },
  ])
})

test('an answer wrapped in chat or a code fence is still read', () => {
  const filed = parseFiling('Here you go:\n```json\n[{"n":1,"title":"Invoice"}]\n```\nHope that helps.', 1)
  assert.equal(filed.length, 1)
  assert.equal(filed[0].title, 'Invoice')
})

test('an entry for a document that was not sent is dropped', () => {
  assert.deepEqual(parseFiling('[{"n":7,"title":"Something"}]', 2), [])
})

test('an entry with no title is dropped rather than titling a document ""', () => {
  assert.deepEqual(parseFiling('[{"n":1,"summary":"no title here"}]', 1), [])
})

test('one bad entry does not lose the whole batch', () => {
  const filed = parseFiling('[{"n":1,"title":"Good"},{"nonsense":true},{"n":2,"title":"Also good"}]', 2)
  assert.deepEqual(filed.map((f) => f.title), ['Good', 'Also good'])
})

test('the same document filed twice is taken once', () => {
  assert.equal(parseFiling('[{"n":1,"title":"First"},{"n":1,"title":"Second"}]', 1).length, 1)
})

test('an answer that is not JSON at all loses nothing but itself', () => {
  assert.deepEqual(parseFiling('I could not do that.', 3), [])
})

/* --------------------------------------------------------------- grouping */

test('documents about the same thing are offered as a project', () => {
  const groups = groupByTopic(['property', 'property', 'invoices'])
  assert.deepEqual(groups[0], { name: 'Property', members: [0, 1] })
})

test('a document that matches nothing else stays loose', () => {
  const groups = groupByTopic(['property', 'property', 'invoices'])
  assert.deepEqual(groups[groups.length - 1], { name: null, members: [2] })
})

test('a project is never made for a single document', () => {
  const groups = groupByTopic(['a', 'b', 'c'])
  assert.deepEqual(groups, [{ name: null, members: [0, 1, 2] }])
})

test('topics differing only in case or spacing are the same topic', () => {
  assert.deepEqual(groupByTopic(['Property', ' property '])[0].members, [0, 1])
})

test('a document with no topic is not grouped by its emptiness', () => {
  const groups = groupByTopic(['', '', 'tax', 'tax'])
  assert.deepEqual(groups[0], { name: 'Tax', members: [2, 3] })
  assert.deepEqual(groups[1], { name: null, members: [0, 1] })
})

test('nothing in, nothing out', () => {
  assert.deepEqual(groupByTopic([]), [])
})

test('a summary does not open by repeating the title', () => {
  const blocks = [block('heading', 'Tenancy agreement'), block('text', 'This agreement is made between…')]
  assert.equal(localSummary(blocks), 'This agreement is made between…')
})

test('a document that is nothing but a heading still summarises to something', () => {
  assert.equal(localSummary([block('heading', 'Tenancy agreement')]), 'Tenancy agreement')
})
