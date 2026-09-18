import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  handleFor,
  keepOnlyReal,
  matchMembers,
  mentionAt,
  mentionedIn,
  mergeTasks,
  readTasks,
  type Member,
} from '../team-chat.ts'

const ada: Member = { userId: 'u-ada', name: 'Ada Nwosu', email: 'ada@example.com' }
const ben: Member = { userId: 'u-ben', name: 'Ben', email: 'ben@example.com' }
/** Invited but has never signed in: named in the chat, no account yet. */
const cleo: Member = { userId: null, name: 'cleo', email: 'cleo@example.com' }
const team = [ada, ben, cleo]

/* ------------------------------------------------------------- mentioning */

test('somebody is written as their first name, in lower case', () => {
  assert.equal(handleFor(ada), 'ada')
  assert.equal(handleFor(ben), 'ben')
})

test('the picker opens on the @ and narrows as you type', () => {
  assert.deepEqual(matchMembers(team, ''), team, 'the bare @ offers everybody')
  assert.deepEqual(matchMembers(team, 'a').map((m) => m.name), ['Ada Nwosu'])
  assert.deepEqual(matchMembers(team, 'zz'), [])
  // By address too, because that is what you know about somebody you have
  // just added and not yet met.
  assert.deepEqual(matchMembers(team, 'ben@').map((m) => m.name), ['Ben'])
})

test('the caret is in a mention, or it is not', () => {
  assert.deepEqual(mentionAt('hello @ad', 9), { at: 6, query: 'ad' })
  assert.deepEqual(mentionAt('@', 1), { at: 0, query: '' }, 'the @ on its own opens it')
  assert.equal(mentionAt('hello @ada and', 14), null, 'a space ends it')
  assert.equal(mentionAt('write to ada@example.com', 24), null, 'an address is not a mention')
  assert.equal(mentionAt('nothing here', 5), null)
})

test('a message says who it named, once each and in order', () => {
  assert.deepEqual(
    mentionedIn('@ben and @ada, and @ben again', team).map((m) => m.name),
    ['Ben', 'Ada Nwosu'],
  )
  assert.deepEqual(mentionedIn('@nobody here', team), [])
})

/* ------------------------------------------------- reading a message */

test('a plain remark is not a task', () => {
  assert.deepEqual(readTasks('thanks, that looks good', team), [])
  assert.deepEqual(readTasks('the lease is with the solicitor', team), [])
  assert.deepEqual(readTasks('ok', team), [])
})

test('a commitment is, and it keeps the day in the words it was written in', () => {
  const found = readTasks('@ada can you send the service charge figures by Friday', team)
  assert.equal(found.length, 1)
  assert.match(found[0].text, /send the service charge figures/i)
  assert.equal(found[0].assignee, 'u-ada')
  assert.equal(found[0].assigneeName, 'Ada Nwosu')
  assert.match(found[0].due ?? '', /friday/i)
})

test('a list is a list, and a name above it applies to all of it', () => {
  const found = readTasks('@ben:\n- book the room\n- chase the quote\n- print the packs', team)
  assert.equal(found.length, 3)
  assert.ok(found.every((task) => task.assigneeName === 'Ben'))
  assert.deepEqual(found.map((t) => t.text), [
    'book the room',
    'chase the quote',
    'print the packs',
  ])
})

test('somebody with no account yet can still be given something', () => {
  const found = readTasks('@cleo please draft the letter', team)
  assert.equal(found.length, 1)
  assert.equal(found[0].assigneeName, 'cleo')
  assert.equal(found[0].assignee, undefined, 'it waits for them to sign in')
})

test('discussion mixed in with work gives only the work', () => {
  const found = readTasks(
    'morning all\nthe survey came back fine\n@ada we need to confirm the completion date',
    team,
  )
  assert.equal(found.length, 1)
  assert.match(found[0].text, /confirm the completion date/i)
})

/* ---------------------------------------------- the guard against invention */

test('a task made of words nobody said is thrown away', () => {
  const said = '@ada send the service charge figures by Friday'
  const back = [
    { text: 'send the service charge figures' },
    // The plausible next step. Nobody asked for it, and this is the whole
    // reason the guard exists.
    { text: 'book a follow-up meeting with the surveyor' },
  ]
  assert.deepEqual(
    keepOnlyReal(back, said).map((task) => task.text),
    ['send the service charge figures'],
  )
})

test('but tidying is allowed: dropped politeness and a question made an instruction', () => {
  const said = '@ben can you please chase the quote from the roofer'
  assert.deepEqual(
    keepOnlyReal([{ text: 'chase the quote from the roofer' }], said).map((t) => t.text),
    ['chase the quote from the roofer'],
  )
})

test('an empty task is not a task', () => {
  assert.deepEqual(keepOnlyReal([{ text: '   ' }], 'anything'), [])
})

/* ------------------------------------------------------------- merging */

test('the same line found twice is one task, keeping whatever each knew', () => {
  const merged = mergeTasks(
    [{ text: 'Send the figures', assigneeName: 'Ada Nwosu', assignee: 'u-ada' }],
    [{ text: 'send the figures.', due: 'Friday' }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].assignee, 'u-ada')
  assert.equal(merged[0].due, 'Friday')
})

test('two different tasks stay two', () => {
  assert.equal(
    mergeTasks([{ text: 'book the room' }], [{ text: 'print the packs' }]).length,
    2,
  )
})

/* --------------------------------------------- answering somebody's message */

test('a task written as an answer belongs to whoever was answered', () => {
  // "Yes, by Thursday" under Ada's question is Ada's job, and nobody is
  // going to type her name again to say so.
  const found = readTasks('yes, I will send them by Thursday', team, ada)
  assert.equal(found.length, 1)
  assert.equal(found[0].assigneeName, 'Ada Nwosu')
  assert.equal(found[0].assignee, 'u-ada')
  assert.match(found[0].due ?? '', /thursday/i)
})

test('but a name in the line always beats who was answered', () => {
  const found = readTasks('@ben can you do it instead', team, ada)
  assert.equal(found.length, 1)
  assert.equal(found[0].assigneeName, 'Ben', 'what somebody wrote beats what was worked out')
})

test('answering nobody in particular leaves a task unassigned', () => {
  const found = readTasks('we need to book the room', team)
  assert.equal(found.length, 1)
  assert.equal(found[0].assigneeName, undefined)
})
