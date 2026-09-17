import assert from 'node:assert/strict'
import { test } from 'node:test'
import { citedSources, gatherSources, passages, splitCitations, type Source } from '../ask.ts'
import { makeBlock } from '../blocks.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0

function note(title: string, ...paragraphs: string[]): Doc {
  const blocks: Block[] = paragraphs.map((text) => {
    const block = makeBlock('text')
    Object.assign(block, { text })
    return block
  })
  counter++
  return { id: `d${counter}`, title, blocks, createdAt: counter, updatedAt: counter }
}

const filler = 'Some entirely unremarkable sentence about nothing in particular. '

/* --------------------------------------------------------------- passages */

test('a short text is carried whole', () => {
  assert.equal(passages('The budget is settled.', ['budget']), 'The budget is settled.')
})

test('a long text is cut down to the passages that matched', () => {
  const text = `${filler.repeat(40)}The kerosene generator failed.${filler.repeat(40)}`
  const out = passages(text, ['kerosene'], 600)
  assert.ok(out.includes('kerosene generator failed'), out)
  assert.ok(out.length <= 700, `budget overrun: ${out.length}`)
})

test('a passage that was cut out of a longer text says so', () => {
  const text = `${filler.repeat(40)}The kerosene generator failed.`
  assert.ok(passages(text, ['kerosene'], 400).startsWith('…'))
})

test('two mentions far apart come back as two passages', () => {
  const text = `Kerosene first.${filler.repeat(30)}Kerosene again at the end.`
  const out = passages(text, ['kerosene'], 1200)
  assert.ok(out.includes('Kerosene first'), out)
  assert.ok(out.includes('Kerosene again'), out)
  assert.ok(out.includes('…'), 'the gap between them should be marked')
})

test('overlapping mentions are merged rather than repeated', () => {
  const text = `${filler.repeat(20)}budget budget budget${filler.repeat(20)}`
  const out = passages(text, ['budget'], 900)
  assert.equal(out.split('…').filter((p) => p.trim()).length, 1)
})

test('a match inside a longer word does not pull the passage to it', () => {
  const text = `${filler.repeat(30)}I flew to London.${filler.repeat(30)}Meeting on Tuesday.`
  const out = passages(text, ['on'], 400)
  assert.ok(out.includes('on Tuesday'), out)
})

test('with no matching words at all, the opening is carried', () => {
  const text = `Opening line of the note. ${filler.repeat(40)}`
  const out = passages(text, ['aardvark'], 300)
  assert.ok(out.startsWith('Opening line'), out)
  assert.ok(out.endsWith('…'))
})

test('empty text produces nothing rather than an empty citation', () => {
  assert.equal(passages('   ', ['budget']), '')
})

/* ----------------------------------------------------------- gatherSources */

test('the notes that bear on the question are the ones chosen', () => {
  const docs = [
    note('Lagos meeting', 'We agreed to move the Lagos launch to March.'),
    note('Shopping', 'Bread, milk, tomatoes.'),
    note('Lagos budget', 'The Lagos budget is forty thousand.'),
  ]
  const sources = gatherSources(docs, 'what did I decide about the Lagos launch')
  const titles = sources.map((s) => s.title)
  assert.ok(titles.includes('Lagos meeting'), JSON.stringify(titles))
  assert.equal(titles[0], 'Lagos meeting')
})

test('sources are numbered from one, in order', () => {
  const docs = [
    note('One', 'The budget is settled.'),
    note('Two', 'The budget was discussed.'),
    note('Three', 'The budget again.'),
  ]
  assert.deepEqual(
    gatherSources(docs, 'budget').map((s) => s.n),
    [1, 2, 3],
  )
})

test('a question that names nothing falls back to recent notes', () => {
  const docs = [
    note('Monday', 'We settled the printing contract.'),
    note('Tuesday', 'We reviewed the drawings.'),
  ]
  const sources = gatherSources(docs, 'what did I decide last week')
  assert.ok(sources.length > 0, 'a vague question should still have something to work from')
})

test('the total sent is capped, however much has been written', () => {
  const docs = Array.from({ length: 30 }, (_, i) =>
    note(`Note ${i}`, `budget talk. ${filler.repeat(60)}`),
  )
  const sources = gatherSources(docs, 'budget', { totalChars: 4_000 })
  const sent = sources.reduce((total, s) => total + s.text.length, 0)
  assert.ok(sent <= 4_000, `sent ${sent} characters`)
})

test('no one note may use the whole budget', () => {
  const docs = [
    note('Long', `budget. ${filler.repeat(200)}`),
    note('Short', 'The budget is settled.'),
  ]
  const sources = gatherSources(docs, 'budget')
  assert.ok(sources.length >= 2, 'the short note should still get in')
})

test('the number of notes consulted is capped', () => {
  const docs = Array.from({ length: 40 }, (_, i) => note(`Note ${i}`, 'budget talk'))
  assert.ok(gatherSources(docs, 'budget').length <= 8)
})

test('deleted notes are never a source', () => {
  const docs = [
    { ...note('Binned', 'The budget is forty thousand.'), deletedAt: 1 },
    note('Live', 'The budget is forty thousand.'),
  ]
  assert.deepEqual(
    gatherSources(docs, 'budget').map((s) => s.title),
    ['Live'],
  )
})

test('an empty collection produces no sources rather than throwing', () => {
  assert.deepEqual(gatherSources([], 'anything'), [])
})

test('a source carries when it was written, so dates can be reasoned about', () => {
  const docs = [{ ...note('Monday', 'The budget is settled.'), updatedAt: 1_700_000_000_000 }]
  assert.equal(gatherSources(docs, 'budget')[0].updatedAt, 1_700_000_000_000)
})

/* -------------------------------------------------------------- citations */

const sources: Source[] = [
  { n: 1, docId: 'a', title: 'One', text: '', updatedAt: 0 },
  { n: 2, docId: 'b', title: 'Two', text: '', updatedAt: 0 },
  { n: 3, docId: 'c', title: 'Three', text: '', updatedAt: 0 },
]

test('only the sources actually cited are listed', () => {
  assert.deepEqual(
    citedSources('You moved it to March [3], against the budget [1].', sources).map((s) => s.title),
    ['Three', 'One'],
  )
})

test('a source cited twice is listed once', () => {
  assert.deepEqual(citedSources('Yes [2], and again [2].', sources).map((s) => s.n), [2])
})

test('a citation of a source that does not exist is dropped, not rendered', () => {
  assert.deepEqual(citedSources('Something [9].', sources), [])
})

test('an answer citing nothing lists nothing', () => {
  assert.deepEqual(citedSources('Your notes do not say.', sources), [])
})

test('an answer splits into text and citation markers', () => {
  assert.deepEqual(splitCitations('Moved to March [3]. Budget held [1].'), [
    { kind: 'text', text: 'Moved to March ' },
    { kind: 'cite', n: 3 },
    { kind: 'text', text: '. Budget held ' },
    { kind: 'cite', n: 1 },
    { kind: 'text', text: '.' },
  ])
})

test('an answer with no citations is one piece of text', () => {
  assert.deepEqual(splitCitations('Your notes do not say.'), [
    { kind: 'text', text: 'Your notes do not say.' },
  ])
})
