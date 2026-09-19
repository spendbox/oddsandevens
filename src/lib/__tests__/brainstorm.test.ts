import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_SOLUTION_CHARS,
  brainstormKey,
  parseSolutions,
  readQuestions,
  readSolution,
  trim,
  type Solution,
} from '../brainstorm.ts'

const made = (key: string, at: number): Solution => ({
  key,
  task: 'something',
  asked: [],
  text: 'a solution',
  refusal: '',
  notes: [],
  at,
})

test('a line is named the same way a turned-down suggestion is', () => {
  assert.equal(brainstormKey('doc1', 'block2'), 'doc1:block2')
})

/* ------------------------------------------------------------- questions */

test('questions are read out of whatever shape they come back in', () => {
  assert.deepEqual(
    readQuestions('What have you already said to them?\nWhen does this actually need to be done?'),
    ['What have you already said to them?', 'When does this actually need to be done?'],
  )
  // Numbered, bulleted, and with a preamble that is not a question.
  assert.deepEqual(
    readQuestions(
      'Here are some questions:\n1. What has already been tried here?\n- Who is this really for?',
    ),
    ['What has already been tried here?', 'Who is this really for?'],
  )
})

test('emphasis is notation, not painting', () => {
  assert.deepEqual(readQuestions('**What is the actual deadline?**'), [
    'What is the actual deadline?',
  ])
})

test('no more than four, because nobody answers a fifth', () => {
  const reply = Array.from({ length: 9 }, (_, i) => `Question number ${i} about it?`).join('\n')
  assert.equal(readQuestions(reply).length, 4)
})

test('a reply with no question marks is still read as lines', () => {
  // Losing the whole step to a model that forgot its punctuation would be
  // worse than showing a statement with a box under it.
  assert.deepEqual(readQuestions('What has already been tried.'), ['What has already been tried.'])
})

test('nothing at all comes back as nothing, not as one empty question', () => {
  assert.deepEqual(readQuestions(''), [])
  assert.deepEqual(readQuestions('\n\n   \n'), [])
  // A heading or a stub is not a question.
  assert.deepEqual(readQuestions('Questions:\nWhen?'), [])
})

/* -------------------------------------------------------------- the reply */

test('an ordinary reply is the solution', () => {
  const { text, refusal } = readSolution('## The email\n\nDear Sam,\n\nAbout the boiler…')
  assert.match(text, /Dear Sam/)
  assert.equal(refusal, '')
})

test('a fence around the whole thing is taken off', () => {
  const { text } = readSolution('```markdown\n## Plan\n\nRing them.\n```')
  assert.equal(text, '## Plan\n\nRing them.')
})

test('a refusal is an answer, not an error', () => {
  const { text, refusal } = readSolution(
    'CANNOT: the note says only "sort out the thing" and nothing about what it is.',
  )
  assert.equal(text, '')
  assert.match(refusal, /sort out the thing/)
})

test('a refusal is recognised however it is punctuated or cased', () => {
  assert.equal(readSolution('cannot - there is nothing here to work from').text, '')
  assert.equal(readSolution('Cannot: nothing to go on').text, '')
  // And a refusal with its reason on the lines below still keeps the reason.
  assert.match(readSolution('CANNOT:\nThere is no deadline anywhere.').refusal, /deadline/)
})

test('a refusal with no reason still says something', () => {
  assert.ok(readSolution('CANNOT:').refusal.length > 0)
})

test('the word "cannot" in the middle of a solution is not a refusal', () => {
  const { text, refusal } = readSolution('## What to do\n\nYou cannot send this before Friday.')
  assert.equal(refusal, '')
  assert.match(text, /cannot send/)
})

test('a very long reply is cut rather than left to fill the browser', () => {
  const { text } = readSolution('x'.repeat(MAX_SOLUTION_CHARS + 500))
  assert.equal(text.length, MAX_SOLUTION_CHARS)
})

/* --------------------------------------------------------------- storage */

test('rubbish in storage is nothing, never a crash', () => {
  assert.deepEqual(parseSolutions(''), {})
  assert.deepEqual(parseSolutions('not json'), {})
  assert.deepEqual(parseSolutions('[1,2,3]'), {})
  assert.deepEqual(parseSolutions('{"a":{"no":"key"}}'), {})
})

test('a solution written by an older version is read with what it has', () => {
  const all = parseSolutions('{"d:b":{"key":"d:b","text":"go on then"}}')
  assert.equal(all['d:b'].text, 'go on then')
  assert.deepEqual(all['d:b'].asked, [])
  assert.deepEqual(all['d:b'].notes, [])
  assert.equal(all['d:b'].at, 0)
})

test('only the newest few are kept, because every one can be made again', () => {
  const all: Record<string, Solution> = {}
  for (let i = 0; i < 30; i++) all[`k${i}`] = made(`k${i}`, i)
  const kept = trim(all, 5)
  assert.deepEqual(Object.keys(kept).sort(), ['k25', 'k26', 'k27', 'k28', 'k29'])
})
