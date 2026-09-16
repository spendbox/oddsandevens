import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_INDENT,
  bulletFor,
  colonStartsList,
  inlineFormatAt,
  looksLikeTitle,
  nextIndent,
  orderedNumber,
  shouldCapitalise,
} from '../smart-typing.ts'

test('the first letter of a block is capitalised', () => {
  assert.equal(shouldCapitalise('', 'h'), true)
  assert.equal(shouldCapitalise('   ', 'h'), true)
})

test('the first letter after a finished sentence is capitalised', () => {
  assert.equal(shouldCapitalise('Done. ', 'n'), true)
  assert.equal(shouldCapitalise('Really? ', 'y'), true)
  assert.equal(shouldCapitalise('Stop! ', 'w'), true)
  assert.equal(shouldCapitalise('He said "go." ', 't'), true)
})

test('mid-sentence letters are left alone', () => {
  assert.equal(shouldCapitalise('the quick ', 'b'), false)
  assert.equal(shouldCapitalise('hello ', 'w'), false)
  // No space yet means the writer is still inside the sentence.
  assert.equal(shouldCapitalise('Done.', 'n'), false)
})

test('a decimal point does not end a sentence', () => {
  assert.equal(shouldCapitalise('it costs 3.', '5'), false)
  assert.equal(shouldCapitalise('version 2. ', 'x'), false)
})

test('common abbreviations do not end a sentence', () => {
  for (const abbr of ['e.g. ', 'i.e. ', 'Mr. ', 'Dr. ', 'etc. ', 'vs. ', 'approx. ']) {
    assert.equal(shouldCapitalise(`see ${abbr}`, 't'), false, `"${abbr}" should not capitalise`)
  }
})

test('an initial does not end a sentence', () => {
  assert.equal(shouldCapitalise('J. ', 's'), false)
})

test('only lowercase letters are touched', () => {
  assert.equal(shouldCapitalise('', 'H'), false, 'already capital')
  assert.equal(shouldCapitalise('', '5'), false, 'a digit')
  assert.equal(shouldCapitalise('', ' '), false, 'a space')
  assert.equal(shouldCapitalise('', '"'), false, 'punctuation')
  assert.equal(shouldCapitalise('', 'ab'), false, 'a paste, not a keystroke')
})

test('a line ending in a colon announces a list', () => {
  assert.equal(colonStartsList('Bring the following:'), true)
  assert.equal(colonStartsList('Bring the following:   '), true)
  assert.equal(colonStartsList('Shopping:'), true)
})

test('a colon that is not an announcement is ignored', () => {
  assert.equal(colonStartsList('no colon here'), false)
  assert.equal(colonStartsList(':'), false, 'a lone colon')
  assert.equal(colonStartsList('   :'), false)
  assert.equal(colonStartsList('the time is 10:30'), false, 'mid-line colon')
  assert.equal(colonStartsList('meet at 10:'), false, 'a time')
  assert.equal(colonStartsList('https:'), false, 'a URL scheme')
})

test('bold, italic and code autoformat when the span closes', () => {
  assert.deepEqual(inlineFormatAt('make this **bold**'), { length: 8, text: 'bold', tag: 'b' })
  assert.deepEqual(inlineFormatAt('make this *slanted*'), { length: 9, text: 'slanted', tag: 'i' })
  assert.deepEqual(inlineFormatAt('run `npm test`'), { length: 10, text: 'npm test', tag: 'code' })
})

test('bold wins over italic, so "**x**" does not leave stray asterisks', () => {
  assert.equal(inlineFormatAt('**x**')?.tag, 'b')
})

test('an unclosed or empty span is left as typed', () => {
  assert.equal(inlineFormatAt('half open *'), null)
  assert.equal(inlineFormatAt('nothing here'), null)
  assert.equal(inlineFormatAt('a ** b'), null)
  assert.equal(inlineFormatAt('****'), null, 'no content between the markers')
  assert.equal(inlineFormatAt('* '), null, 'a list marker, not italics')
  assert.equal(inlineFormatAt('2 * 3 * 4'), null, 'multiplication')
})

test('a title is short, unpunctuated and few words', () => {
  assert.equal(looksLikeTitle('Quarterly review'), true)
  assert.equal(looksLikeTitle('Lagos trip'), true)
})

test('a sentence is not mistaken for a title', () => {
  assert.equal(looksLikeTitle('This is a sentence, and it ends with a full stop.'), false)
  assert.equal(looksLikeTitle('We should probably think carefully about how we approach the whole thing'), false)
  assert.equal(looksLikeTitle('Bring the following:'), false)
  assert.equal(looksLikeTitle('- a list item'), false)
  assert.equal(looksLikeTitle('# already a heading'), false)
  assert.equal(looksLikeTitle(''), false)
  assert.equal(looksLikeTitle('a'), false, 'one character is not a title')
})

test('indent is clamped at both ends', () => {
  assert.equal(nextIndent(undefined, 1), 1)
  assert.equal(nextIndent(0, -1), 0, 'cannot go below zero')
  assert.equal(nextIndent(MAX_INDENT, 1), MAX_INDENT, 'cannot nest forever')
  assert.equal(nextIndent(2, -1), 1)
})

test('bullet glyphs cycle with depth, the way a word processor does', () => {
  assert.equal(bulletFor(0), 'disc')
  assert.equal(bulletFor(1), 'circle')
  assert.equal(bulletFor(2), 'square')
  assert.equal(bulletFor(3), 'disc')
  assert.equal(bulletFor(undefined), 'disc')
})

test('ordered list numbers are counted from the run above', () => {
  const list = [
    { type: 'bullet', ordered: true },
    { type: 'bullet', ordered: true },
    { type: 'bullet', ordered: true },
  ]
  assert.deepEqual(list.map((_, i) => orderedNumber(list, i)), [1, 2, 3])
})

test('a paragraph between lists restarts the numbering', () => {
  const list = [
    { type: 'bullet', ordered: true },
    { type: 'text' },
    { type: 'bullet', ordered: true },
  ]
  assert.deepEqual(list.map((_, i) => orderedNumber(list, i)), [1, 1, 1])
})

test('a nested sub-list does not break the run', () => {
  // 1. first / (a nested item) / 2. second — the sub-list belongs to item 1.
  const list = [
    { type: 'bullet', ordered: true, indent: 0 },
    { type: 'bullet', ordered: true, indent: 1 },
    { type: 'bullet', ordered: true, indent: 0 },
  ]
  assert.equal(orderedNumber(list, 2), 2)
  assert.equal(orderedNumber(list, 1), 1, 'the nested item starts its own sequence')
})

test('unordered bullets are not numbered', () => {
  const list = [{ type: 'bullet' }, { type: 'bullet', ordered: true }]
  assert.equal(orderedNumber(list, 0), 1)
  assert.equal(orderedNumber(list, 1), 1, 'a plain bullet above does not contribute')
})
