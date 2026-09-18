import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { claimDevice, deviceOwner, handOverTo, leaveDevice, wipeDevice } from '../handover.ts'
import { allDocsRaw, loadMeta, pendingIds, saveDoc, saveMeta } from '../store.ts'
import type { Doc } from '../types.ts'

/*
  There is no IndexedDB here, and the store is written to fall back to memory
  when there is none — which is the same code path a private window takes, and
  exactly the case where leaving another account's notes behind would be
  worst. So this drives the real functions against that fallback.
*/

let counter = 0
const note = (title: string): Doc => ({
  id: `d${counter++}`,
  title,
  blocks: [{ id: `b${counter++}`, type: 'text', text: title }],
  createdAt: 1,
  updatedAt: 2,
})

beforeEach(async () => {
  await wipeDevice()
})

test('a device with nothing on it belongs to nobody', async () => {
  assert.equal(await deviceOwner(), null)
})

test('the first account to sign in adopts what is already written', async () => {
  await saveDoc(note('written before there was an account'))

  assert.equal(await handOverTo('ada'), 'adopted')
  assert.equal(await deviceOwner(), 'ada')
  assert.equal((await allDocsRaw()).length, 1, 'their own notes are not taken away from them')
})

test('the same account signing in again changes nothing', async () => {
  await claimDevice('ada')
  await saveDoc(note('a note of Ada’s'))

  assert.equal(await handOverTo('ada'), 'same')
  assert.equal((await allDocsRaw()).length, 1)
})

test('a different account arrives to an empty device', async () => {
  await claimDevice('ada')
  await saveDoc(note('a note of Ada’s'))
  await saveMeta('docsCursor', { at: 9_999_999 })

  assert.equal(await handOverTo('ben'), 'fresh')
  assert.equal(await deviceOwner(), 'ben')
  assert.deepEqual(await allDocsRaw(), [], 'nothing of the last account is left to show')
  assert.deepEqual(await pendingIds(), [], 'and nothing of theirs is queued to be uploaded')
})

test('and the sync cursors go with them', async () => {
  /*
    The subtle half of the same bug. A cursor is "the newest row this device
    has accepted"; one left from another account would make the new account's
    first pull ask only for rows newer than it — so every note older than the
    previous person's last edit would silently never arrive.
  */
  await claimDevice('ada')
  await saveMeta('docsCursor', { at: 9_999_999, full: 1 })
  await handOverTo('ben')
  assert.equal(await loadMeta('docsCursor'), null)
})

test('signing out empties the device once everything has reached the server', async () => {
  await claimDevice('ada')
  await saveDoc(note('safely on the server'))

  const { cleared } = await leaveDevice('ada', async () => true)
  assert.equal(cleared, true)
  assert.equal(await deviceOwner(), null)
  assert.deepEqual(await allDocsRaw(), [], 'the next person to open this browser sees nothing')
})

test('and keeps them when it did not', async () => {
  /*
    The order is the entire safety of this. A push that failed means notes
    that exist nowhere else, and clearing those because somebody pressed
    Sign out on a train is the worst thing this app could do — so they stay,
    and the caller says so.
  */
  await claimDevice('ada')
  await saveDoc(note('never reached the server'))

  const { cleared } = await leaveDevice('ada', async () => false)
  assert.equal(cleared, false)
  assert.equal((await allDocsRaw()).length, 1)
  assert.equal(await deviceOwner(), 'ada', 'and the device is still theirs')
})
