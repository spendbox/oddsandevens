import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addGoal, MAX_GOALS, normaliseGoal, parseSuggestions, removeGoal } from '../goals.ts'

test('a goal is trimmed and its whitespace collapsed', () => {
  assert.equal(normaliseGoal('  persuade   the  landlord \n'), 'persuade the landlord')
})

test('an empty goal is not added, and the same array comes back', () => {
  const goals = ['one']
  assert.equal(addGoal(goals, '   '), goals)
})

test('a duplicate is not added, whatever its case', () => {
  const goals = ['Keep it short']
  assert.equal(addGoal(goals, 'keep it short'), goals)
})

test('goals stop at the limit', () => {
  let goals: string[] = []
  for (let i = 0; i < MAX_GOALS + 3; i++) goals = addGoal(goals, `goal ${i}`)
  assert.equal(goals.length, MAX_GOALS)
})

test('removing a goal that is not there returns the same array', () => {
  const goals = ['one']
  assert.equal(removeGoal(goals, 'two'), goals)
})

test('removing a goal keeps the order of the rest', () => {
  assert.deepEqual(removeGoal(['a', 'b', 'c'], 'b'), ['a', 'c'])
})

test('suggestions are read out of a numbered list', () => {
  assert.deepEqual(parseSuggestions('1. Say what the boiler does now\n2. Name a date'), [
    'Say what the boiler does now',
    'Name a date',
  ])
})

test('bullets, emphasis and a code fence are all stripped', () => {
  const reply = '```\n- **Open with the request**\n* Cut the second paragraph\n```'
  assert.deepEqual(parseSuggestions(reply), [
    'Open with the request',
    'Cut the second paragraph',
  ])
})

test('a heading the model added over its own list is not a suggestion', () => {
  assert.deepEqual(parseSuggestions('Suggestions:\n- Add a closing line'), ['Add a closing line'])
})

test('nothing usable gives nothing back rather than a blank row', () => {
  assert.deepEqual(parseSuggestions('\n\n   \n'), [])
})
