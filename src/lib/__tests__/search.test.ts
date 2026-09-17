import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import {
  buildIndex,
  excerpt,
  looksLikeQuestion,
  queryTerms,
  search,
  searchableText,
  tokenize,
} from '../search.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0

/** A document made of plain paragraphs, which is how most notes are written. */
function note(title: string, ...paragraphs: string[]): Doc {
  const blocks: Block[] = paragraphs.map((text) => {
    const block = makeBlock('text')
    Object.assign(block, { text })
    return block
  })
  counter++
  return { id: `d${counter}`, title, blocks, createdAt: counter, updatedAt: counter }
}

function ids(docs: Doc[], query: string, limit?: number): string[] {
  return search(buildIndex(docs), query, limit).map((hit) => hit.doc.title)
}

test('tokenizing keeps words and drops punctuation', () => {
  assert.deepEqual(tokenize('Lagos meeting, 3pm — budget!'), ['lagos', 'meeting', '3pm', 'budget'])
})

test('tokenizing folds case so search is not case sensitive', () => {
  assert.deepEqual(tokenize('LAGOS Lagos lagos'), ['lagos', 'lagos', 'lagos'])
})

test('words too common to discriminate are dropped', () => {
  assert.deepEqual(tokenize('what did I write about the meeting'), ['write', 'about', 'meeting'])
})

test('single letters are dropped, since they match everything', () => {
  assert.deepEqual(tokenize('a b meeting'), ['meeting'])
})

test('accented and non-Latin text survives tokenizing', () => {
  assert.deepEqual(tokenize('café naïve 日本語'), ['café', 'naïve', '日本語'])
})

test('every kind of line contributes its words to the searchable text', () => {
  const heading = makeBlock('heading')
  Object.assign(heading, { text: 'Design budget' })
  const quote = makeBlock('quote')
  Object.assign(quote, { text: 'forty two thousand' })
  const todo = makeBlock('todo')
  Object.assign(todo, { text: 'call the printer' })

  const text = searchableText({
    id: 'x',
    title: 'Everything',
    blocks: [heading, quote, todo],
    createdAt: 0,
    updatedAt: 0,
  })
  for (const word of ['Design', 'budget', 'thousand', 'printer']) {
    assert.ok(text.includes(word), `${word} is missing from the searchable text`)
  }
})

test('the title counts for more than the body', () => {
  const titled = note('Lagos', 'Nothing much happened.')
  const mentions = note('Weekly notes', 'We talked about Lagos in passing today.')
  assert.deepEqual(ids([mentions, titled], 'lagos'), ['Lagos', 'Weekly notes'])
})

test('a rare word beats a common one', () => {
  const common = Array.from({ length: 8 }, (_, i) =>
    note(`Standup ${i}`, 'budget review notes for the team'),
  )
  const rare = note('Odd one', 'budget review notes mentioning kerosene')
  assert.equal(ids([...common, rare], 'kerosene budget')[0], 'Odd one')
})

test('a short note beats a long one that says the same thing as often', () => {
  const short = note('Short', 'The passport arrived.')
  const long = note('Long', `The passport arrived. ${'Some other unrelated sentence here. '.repeat(40)}`)
  assert.deepEqual(ids([long, short], 'passport'), ['Short', 'Long'])
})

test('a half-typed word finds the whole one', () => {
  const docs = [note('Meeting notes', 'We agreed the plan.')]
  assert.deepEqual(ids(docs, 'meet'), ['Meeting notes'])
})

test('an exact hit outranks a prefix hit', () => {
  const exact = note('Meet', 'Where to meet.')
  const prefix = note('Meetings', 'Notes from meetings and meetings.')
  assert.equal(ids([prefix, exact], 'meet')[0], 'Meet')
})

test('a prefix of one or two letters is not expanded, or everything matches', () => {
  const docs = [note('Meeting notes', 'We agreed the plan.')]
  assert.deepEqual(ids(docs, 'me'), [])
})

test('every word of the query must appear somewhere', () => {
  const both = note('Both', 'The Lagos budget is settled.')
  const one = note('One', 'The Lagos weather was hot.')
  assert.deepEqual(ids([both, one], 'lagos budget'), ['Both'])
})

test('a query of nothing but common words returns nothing rather than everything', () => {
  const docs = [note('A note', 'Something written here.')]
  assert.deepEqual(ids(docs, 'the and of'), [])
})

test('a word nobody wrote returns nothing', () => {
  const docs = [note('A note', 'Something written here.')]
  assert.deepEqual(ids(docs, 'aardvark'), [])
})

test('documents in the trash are not searched', () => {
  const live = note('Live', 'The passport is here.')
  const binned = { ...note('Binned', 'The passport is here.'), deletedAt: 1 }
  assert.deepEqual(ids([binned, live], 'passport'), ['Live'])
})

test('the limit is respected', () => {
  const docs = Array.from({ length: 10 }, (_, i) => note(`Note ${i}`, 'passport renewal'))
  assert.equal(ids(docs, 'passport', 3).length, 3)
})

test('a tie is broken by which document was touched last', () => {
  const older = { ...note('Older', 'passport'), updatedAt: 1 }
  const newer = { ...note('Newer', 'passport'), updatedAt: 2 }
  assert.deepEqual(ids([older, newer], 'passport'), ['Newer', 'Older'])
})

test('a hit says which words matched, so it can explain itself', () => {
  const hits = search(buildIndex([note('Trip', 'The Lagos meeting ran long.')]), 'lagos meet')
  assert.deepEqual(hits[0].matched.sort(), ['lagos', 'meeting'])
})

test('an empty index is not a crash', () => {
  assert.deepEqual(search(buildIndex([]), 'anything'), [])
})

test('a document with no words at all is not a crash', () => {
  const empty = note('')
  assert.deepEqual(search(buildIndex([empty]), 'anything'), [])
})

test('the snippet is centred on the match, not the start of the document', () => {
  const opening = 'This document opens with a long and entirely unremarkable preamble that says nothing. '
  const { snippet } = excerpt(`${opening.repeat(3)}The kerosene generator failed.`, ['kerosene'])
  assert.ok(snippet.includes('kerosene'), snippet)
  assert.ok(snippet.startsWith('…'), 'a snippet that skipped text should say so')
})

test('a snippet does not begin in the middle of a word', () => {
  const text = `${'unremarkable preamble '.repeat(20)}kerosene generator`
  const { snippet } = excerpt(text, ['kerosene'])
  const firstWord = snippet.replace(/^…/, '').split(' ')[0]
  assert.ok(
    ['unremarkable', 'preamble', 'kerosene', 'generator'].includes(firstWord),
    `snippet started mid-word: ${firstWord}`,
  )
})

test('a short document is shown whole, with no ellipsis', () => {
  const { snippet } = excerpt('The kerosene generator failed.', ['kerosene'])
  assert.equal(snippet, 'The kerosene generator failed.')
})

test('highlights point at the matched words', () => {
  const { snippet, highlights } = excerpt('The kerosene generator failed.', ['kerosene'])
  assert.equal(highlights.length, 1)
  const [start, end] = highlights[0]
  assert.equal(snippet.slice(start, end), 'kerosene')
})

test('a highlight does not light up inside a longer word', () => {
  const { highlights } = excerpt('I flew to London in the morning.', ['on'])
  assert.deepEqual(highlights, [], 'on lit up inside London or morning')
})

test('every occurrence in the snippet is highlighted', () => {
  const { snippet, highlights } = excerpt('Budget talk, then budget again.', ['budget'])
  assert.equal(highlights.length, 2)
  for (const [start, end] of highlights) {
    assert.equal(snippet.slice(start, end).toLowerCase(), 'budget')
  }
})

test('highlights come back sorted and without overlaps', () => {
  const { highlights } = excerpt('Lagos meeting about Lagos.', ['meeting', 'lagos'])
  assert.deepEqual(highlights, [
    [0, 5],
    [6, 13],
    [20, 25],
  ])
})

test('whitespace is collapsed so a snippet reads as one passage', () => {
  const { snippet } = excerpt('One line.\n\n   Another   line.', ['line'])
  assert.equal(snippet, 'One line. Another line.')
})

test('a snippet with no terms still shows the opening of the document', () => {
  const { snippet, highlights } = excerpt('Something written here.', [])
  assert.equal(snippet, 'Something written here.')
  assert.deepEqual(highlights, [])
})

test('a question is recognised by its shape', () => {
  for (const query of [
    'what did I write about the Lagos meeting',
    'Summarize my meeting',
    'remind me what I said about this project',
    'turn these notes into tasks',
    'is the budget settled?',
  ]) {
    assert.ok(looksLikeQuestion(query), `should read as a question: ${query}`)
  }
})

test('a lookup is not mistaken for a question', () => {
  for (const query of ['lagos', 'passport renewal', 'budget 2026', 'whatsapp export']) {
    assert.ok(!looksLikeQuestion(query), `should read as a lookup: ${query}`)
  }
})

test('anything ending in a question mark is a question', () => {
  assert.ok(looksLikeQuestion('the budget?'))
})

/* ------------------------------------------------- questions as searches */

test('a question finds the note it is about', () => {
  // The headline case. "write" and "about" appear in no note, and requiring
  // them used to mean this question found nothing at all.
  const docs = [
    note('Shopping', 'Bread, milk, tomatoes.'),
    note('Lagos meeting', 'We agreed to move the launch to March.'),
  ]
  assert.equal(ids(docs, 'What did I write about the Lagos meeting?')[0], 'Lagos meeting')
})

test('the asking words are dropped from a question', () => {
  assert.deepEqual(queryTerms('what did I write about the Lagos meeting?'), ['lagos', 'meeting'])
})

test('the same words are kept in an ordinary search', () => {
  assert.deepEqual(queryTerms('write about lagos'), ['write', 'about', 'lagos'])
})

test('a question made only of asking words still searches for something', () => {
  assert.deepEqual(queryTerms('what did I say?'), ['say'])
})

test('when no note has every word, the ones with some come back', () => {
  const docs = [
    note('Budget', 'The printing budget is settled.'),
    note('Unrelated', 'Nothing to do with anything.'),
  ]
  const found = ids(docs, 'what happened with the printing budget and the generator')
  assert.deepEqual(found, ['Budget'])
})

test('a note with all the words still beats one with some', () => {
  const some = note('Some', 'The budget is settled.')
  const all = note('All', 'The printing budget is settled with the generator.')
  assert.equal(ids([some, all], 'what about the printing budget generator')[0], 'All')
})

test('a result counts how many times the word really appears', () => {
  // The title is indexed several times over so a name outranks a mention, and
  // that weighting must never reach the number shown to the reader.
  const index = buildIndex([
    note('Contract research', 'Read the tenancy contract clauses.', 'The contract is signed.'),
  ])
  const [hit] = search(index, 'contract')
  assert.equal(hit.mentions, 3)
})
