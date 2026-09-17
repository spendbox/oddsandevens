import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_INDENT,
  colonStartsList,
  looksLikeTitle,
  nextIndent,
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

