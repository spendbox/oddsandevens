import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  chunkTranscript,
  elapsed,
  joinTranscript,
  looksLikeMeeting,
  paragraphsFrom,
  wordCount,
} from '../dictation.ts'

test('the clock reads the way a recorder does', () => {
  assert.equal(elapsed(0), '0:00')
  assert.equal(elapsed(7_400), '0:07')
  assert.equal(elapsed(83_000), '1:23')
  assert.equal(elapsed(725_000), '12:05')
})

test('a clock that is behind does not produce a negative', () => {
  assert.equal(elapsed(-500), '0:00')
})

test('what is settled and what is still being said join up', () => {
  assert.equal(joinTranscript(['Hello there.', 'This is next.'], 'and this'), 'Hello there. This is next. and this')
})

test('empty parts are dropped rather than leaving double spaces', () => {
  assert.equal(joinTranscript(['one', '  ', 'two'], ''), 'one two')
})

test('a dictated paragraph is not a meeting', () => {
  assert.equal(looksLikeMeeting('Call the landlord about the boiler on Friday.'), false)
})

test('a long recording is', () => {
  assert.equal(looksLikeMeeting(Array.from({ length: 300 }, () => 'word').join(' ')), true)
})

test('words are counted without counting the gaps', () => {
  assert.equal(wordCount('  one   two three '), 3)
  assert.equal(wordCount('   '), 0)
})

test('sentences are grouped into paragraphs', () => {
  const paragraphs = paragraphsFrom(
    'One thing happened. Then another. And a third. A fourth one too. Then a fifth.',
  )
  assert.equal(paragraphs.length, 2)
  assert.equal(paragraphs[0], 'One thing happened. Then another. And a third.')
})

test('an unpunctuated wall is cut on length instead', () => {
  const words = Array.from({ length: 140 }, (_, i) => `word${i}`).join(' ')
  const paragraphs = paragraphsFrom(words)
  assert.ok(paragraphs.length >= 3, `${paragraphs.length} paragraphs`)
})

test('a short unpunctuated line is left as one paragraph', () => {
  assert.deepEqual(paragraphsFrom('just a few words here'), ['just a few words here'])
})

test('not a word is added or lost in the tidying', () => {
  const said = 'One thing happened. Then another. And a third. A fourth one too.'
  assert.equal(paragraphsFrom(said).join(' '), said)
})

test('nothing said gives no paragraphs rather than an empty one', () => {
  assert.deepEqual(paragraphsFrom('   '), [])
})

test('a short transcript is one chunk', () => {
  assert.deepEqual(chunkTranscript('Short enough.', 100), ['Short enough.'])
})

test('a long one is cut on sentence ends', () => {
  const sentence = 'This is a sentence of a reasonable length. '
  const chunks = chunkTranscript(sentence.repeat(20), 200)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length <= 200), chunks.map((c) => c.length).join(','))
  assert.ok(chunks[0].endsWith('.'), chunks[0])
})

test('an unpunctuated wall is cut on a space rather than mid-word', () => {
  const chunks = chunkTranscript(Array.from({ length: 400 }, (_, i) => `word${i}`).join(' '), 200)
  assert.ok(chunks.length > 1)
  // Nothing is lost: the pieces put back together are the whole thing again.
  assert.equal(
    chunks.join(' '),
    Array.from({ length: 400 }, (_, i) => `word${i}`).join(' '),
  )
})

test('chunking loses nothing, however it had to cut', () => {
  const said = 'One. Two. Three. ' + Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ')
  assert.equal(chunkTranscript(said, 150).join(' '), said.replace(/\s+/g, ' ').trim())
})
