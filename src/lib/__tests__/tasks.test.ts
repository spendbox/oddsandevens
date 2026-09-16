import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findTasks, whenIn } from '../tasks.ts'
import type { Block } from '../types.ts'

let counter = 0
const text = (value: string): Block => ({ id: `t${counter++}`, type: 'text', text: value })
const bullet = (value: string): Block => ({ id: `b${counter++}`, type: 'bullet', text: value })
const heading = (value: string): Block => ({
  id: `h${counter++}`,
  type: 'heading',
  level: 2,
  text: value,
})

/** Just the wording, which is what ends up on the task. */
const wording = (blocks: Block[]) => findTasks(blocks).map((task) => task.text)

test('an ordinary sentence is not a task', () => {
  assert.deepEqual(
    wording([
      text('The meeting ran long and we went over the numbers again.'),
      text('Everyone seemed happy with where the budget landed.'),
    ]),
    [],
  )
})

test('a line that says you need to do something is a task', () => {
  assert.deepEqual(wording([text('I need to call the landlord about the boiler')]), [
    'Call the landlord about the boiler',
  ])
})

test('the lead-in is removed, so the task reads as an instruction', () => {
  assert.deepEqual(
    wording([
      text('We need to send the invoice'),
      text('Remember to book the room'),
      text("Don't forget to pay the deposit"),
      text('I should review the contract'),
    ]),
    ['Send the invoice', 'Book the room', 'Pay the deposit', 'Review the contract'],
  )
})

test('a line starting with an action verb is a task', () => {
  assert.deepEqual(wording([text('Email Sarah the revised figures')]), [
    'Email Sarah the revised figures',
  ])
})

test('a verb on its own is a label, not an instruction', () => {
  // "Call" is a heading somebody wrote in a hurry. An instruction has an
  // object: it says what to call.
  assert.deepEqual(wording([text('Call')]), [])
})

test('a question is never a task', () => {
  assert.deepEqual(wording([text('Should we review the contract before Friday?')]), [])
  assert.deepEqual(wording([text('Do I need to call the landlord?')]), [])
})

test('everything under a "next steps" heading counts', () => {
  assert.deepEqual(
    wording([
      heading('Next steps'),
      bullet('Contract back from legal'),
      bullet('Deposit cleared'),
    ]),
    ['Contract back from legal', 'Deposit cleared'],
  )
})

test('a heading written as a paragraph still opens the section', () => {
  // Most people type "Things to do:" on a line rather than reaching for a
  // heading, and the colon is them saying what the next lines are.
  assert.deepEqual(
    wording([text('Things to do:'), bullet('Ring the bank'), bullet('New keys cut')]),
    ['Ring the bank', 'New keys cut'],
  )
})

test('the section ends at the next heading', () => {
  assert.deepEqual(
    wording([
      heading('To do'),
      bullet('Ring the bank'),
      heading('Notes from the call'),
      bullet('They were pleased with the draft'),
    ]),
    ['Ring the bank'],
  )
})

test('a bullet glyph is not part of the wording', () => {
  assert.deepEqual(wording([text('- send the invoice'), text('1. book the room')]), [
    'Send the invoice',
    'Book the room',
  ])
})

test('an explicit marker wins whatever the wording is', () => {
  assert.deepEqual(
    wording([text('TODO: the thing with the numbers'), text('Action: Lagos figures')]),
    ['The thing with the numbers', 'Lagos figures'],
  )
})

test('a block that is already a task is never offered again', () => {
  // Offering to make a task out of a task is noise that comes back on every
  // open, which is how a helpful feature becomes one people switch off.
  assert.deepEqual(
    findTasks([
      { id: 'd1', type: 'todo', text: 'Call the landlord', done: false },
      { id: 'd2', type: 'todo', text: 'Send the invoice', done: true },
    ]),
    [],
  )
})

test('the same task written twice is offered once', () => {
  assert.deepEqual(wording([text('I need to send the invoice'), text('Send the invoice')]), [
    'Send the invoice',
  ])
})

test('a wall of prose is not an instruction however it starts', () => {
  const long = `Review ${'the quarterly figures and the notes attached to them '.repeat(6)}`
  assert.deepEqual(wording([text(long)]), [])
})

test('each suggestion says which block it came from', () => {
  const block = text('I need to call the landlord')
  const [found] = findTasks([block])
  assert.equal(found.blockId, block.id)
})

test('the date is carried across as the writer wrote it', () => {
  const [found] = findTasks([text('Send the invoice by Friday')])
  assert.equal(found.due, 'by Friday')
  assert.equal(found.text, 'Send the invoice by Friday')
})

test('a longer date phrase is preferred to the short one inside it', () => {
  // "by the end of next week" reported as "next week" loses the part that
  // decides when it is actually due.
  assert.equal(whenIn('Draft the report by the end of next week'), 'by the end of next week')
})

test('dates are recognised in the shapes people write them', () => {
  assert.equal(whenIn('pay the deposit tomorrow'), 'tomorrow')
  assert.equal(whenIn('submit it by 12/03'), 'by 12/03')
  assert.equal(whenIn('book the room for 3rd April'), 'for 3rd April')
  assert.equal(whenIn('reply by EOD'), 'EOD')
  assert.equal(whenIn('nothing dated here'), undefined)
})

test('a table between two lines closes an open section', () => {
  assert.deepEqual(
    wording([
      heading('To do'),
      { id: 'tbl', type: 'table', rows: 2, cols: 2, cells: {} },
      bullet('Some figures we discussed'),
    ]),
    [],
  )
})
