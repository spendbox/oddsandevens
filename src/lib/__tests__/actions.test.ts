import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byNote, digest, gatherActions, gatherDone } from '../actions.ts'
import type { Block, Doc } from '../types.ts'

let counter = 0
const text = (value: string): Block => ({ id: `t${counter++}`, type: 'text', text: value })
const todo = (value: string, done = false): Block => ({
  id: `k${counter++}`,
  type: 'todo',
  text: value,
  done,
})
const note = (title: string, blocks: Block[], updatedAt = counter++): Doc => ({
  id: `d${counter++}`,
  title,
  blocks,
  createdAt: 0,
  updatedAt,
})

test('an unticked box is something to do, and a ticked one is not', () => {
  const found = gatherActions([note('Friday', [todo('Ring the bank'), todo('Posted', true)])])
  assert.deepEqual(found.map((f) => f.text), ['Ring the bank'])
  assert.equal(found[0].kind, 'box')
  assert.equal(found[0].docTitle, 'Friday')
})

test('a line that reads like a commitment is offered, and says why', () => {
  const found = gatherActions([note('Meeting', [text('I need to call the landlord')])])
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'line')
  assert.match(found[0].text, /call the landlord/i)
  assert.ok(found[0].reason, 'a suggestion has to be able to explain itself')
})

test('boxes come before suggestions, however new the note', () => {
  const items = gatherActions([
    note('Old note', [todo('A box from last week')], 1),
    note('New note', [text('I need to do the other thing')], 99),
  ])
  assert.equal(items[0].kind, 'box')
  assert.equal(items[1].kind, 'line')
})

test('the newest note comes first within a kind', () => {
  const items = gatherActions([
    note('Older', [todo('Older task')], 1),
    note('Newer', [todo('Newer task')], 99),
  ])
  assert.deepEqual(items.map((i) => i.text), ['Newer task', 'Older task'])
})

test('a date is kept in the words it was written in', () => {
  const [item] = gatherActions([note('Friday', [todo('Send the figures by Friday')])])
  assert.equal(item.due, 'by Friday')
})

test('the same thing written twice is one thing to do', () => {
  const items = gatherActions([
    note('Monday', [todo('Ring the landlord')], 2),
    note('Thursday', [todo('ring the landlord')], 9),
  ])
  assert.equal(items.length, 1)
  assert.equal(items[0].docTitle, 'Thursday', 'the newer note is the one to open')
})

test('a note in the trash contributes nothing', () => {
  const binned = { ...note('Gone', [todo('Do not show me')]), deletedAt: 1 }
  assert.deepEqual(gatherActions([binned]), [])
})

test('one note cannot fill the whole list', () => {
  const many = Array.from({ length: 20 }, (_, i) => todo(`Task number ${i}`))
  const items = gatherActions([note('Long', many)])
  assert.ok(items.length <= 6, `${items.length} from one note`)
})

test('the list as a whole is capped', () => {
  const notes = Array.from({ length: 30 }, (_, i) =>
    note(`Note ${i}`, [todo(`Task in note ${i}`)], i),
  )
  assert.equal(gatherActions(notes, 10).length, 10)
})

test('what is sent is the lines and the names, and nothing else', () => {
  const items = gatherActions([note('Lease', [todo('Send the figures by Friday')])])
  const sent = digest(items)
  assert.match(sent, /Send the figures/)
  assert.match(sent, /Friday/)
  assert.match(sent, /"Lease"/)
})

test('what is done is kept, separately from what is to be done', () => {
  const docs = [note('Friday', [todo('Ring the bank'), todo('Posted the forms', true)])]
  assert.deepEqual(gatherActions(docs).map((f) => f.text), ['Ring the bank'])
  const finished = gatherDone(docs)
  assert.deepEqual(finished.map((f) => f.text), ['Posted the forms'])
  assert.equal(finished[0].done, true)
  assert.equal(finished[0].kind, 'box')
})

test('a note with nothing ticked contributes nothing to the done list', () => {
  assert.deepEqual(gatherDone([note('Friday', [todo('Ring the bank')])]), [])
})

test('the done list is newest note first, like everything else', () => {
  const finished = gatherDone([
    note('Old', [todo('An old one', true)], 1),
    note('New', [todo('A new one', true)], 99),
  ])
  assert.deepEqual(finished.map((f) => f.docTitle), ['New', 'Old'])
})

test('grouping puts every line under the note it came from', () => {
  const groups = byNote(
    gatherActions([
      note('Lease', [todo('Ring the agent'), text('I need to check the break clause')], 99),
      note('Boiler', [todo('Ring the landlord')], 1),
    ]),
  )
  assert.deepEqual(groups.map((g) => g.docTitle), ['Lease', 'Boiler'])
  assert.equal(groups[0].items.length, 2)
  assert.deepEqual(groups[1].items.map((i) => i.text), ['Ring the landlord'])
})

test('a group keeps its boxes above its suggestions', () => {
  const [group] = byNote(
    gatherActions([note('Lease', [text('I need to check the clause'), todo('Ring the agent')])]),
  )
  assert.deepEqual(group.items.map((i) => i.kind), ['box', 'line'])
})

test('grouping an empty list is an empty list, not a group with nothing in it', () => {
  assert.deepEqual(byNote([]), [])
})
