import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitComposed, titleFrom, withoutTitleLine } from '../compose.ts'
import { blockText } from '../types.ts'

test('a reply in the shape it was asked for', () => {
  const { title, body } = splitComposed('TITLE: Lease renewal\n\nThe landlord wants an answer.')
  assert.equal(title, 'Lease renewal')
  assert.equal(body, 'The landlord wants an answer.')
})

test('a reply that opens with something it was told not to say', () => {
  const { title, body } = splitComposed(
    'Sure — here is your note:\n\nTITLE: Lease renewal\n\n- [ ] Ring the landlord',
  )
  assert.equal(title, 'Lease renewal')
  assert.equal(body, '- [ ] Ring the landlord')
})

test('a reply that forgot the title line still becomes a note', () => {
  const { title, body } = splitComposed('# Lease renewal\n\nThe landlord wants an answer.')
  assert.equal(title, 'Lease renewal')
  assert.match(body, /landlord/)
})

test('a reply with no title at all keeps every word of it', () => {
  const { title, body } = splitComposed('Ring the landlord about the boiler')
  assert.equal(title, 'Ring the landlord about the boiler')
  assert.equal(body, 'Ring the landlord about the boiler')
})

test('a reply wrapped in a code fence is unwrapped', () => {
  const { title, body } = splitComposed('```markdown\nTITLE: Standup\n\n- Ama is on the lease\n```')
  assert.equal(title, 'Standup')
  assert.equal(body, '- Ama is on the lease')
})

test('a reply that is only a title is a note of one line', () => {
  const { title, body } = splitComposed('TITLE: Buy milk')
  assert.equal(title, 'Buy milk')
  assert.equal(body, 'Buy milk')
})

test('nothing in, nothing out', () => {
  assert.deepEqual(splitComposed('   '), { title: '', body: '' })
})

test('a title made from the note itself', () => {
  assert.equal(titleFrom('Ring the landlord.'), 'Ring the landlord')
  assert.equal(titleFrom('- [ ] Post the forms'), 'Post the forms')
  assert.equal(titleFrom('## Monday standup\nAma spoke.'), 'Monday standup')
  assert.equal(titleFrom('\n\n  Lease  '), 'Lease')
  assert.equal(titleFrom(''), '')
})

test('a long opening line is cut at a word', () => {
  const title = titleFrom(
    'The landlord came round on Tuesday afternoon to talk about the service charge again',
  )
  assert.ok(title.length <= 61, title)
  assert.ok(title.endsWith('…'))
  assert.ok(!title.includes('  '))
})

test('the line a name was made from is not left in the note as well', () => {
  const blocks = [
    { id: '1', type: 'text' as const, text: 'Ring the landlord about the boiler' },
    { id: '2', type: 'text' as const, text: 'He wants an answer by Friday.' },
  ]
  const left = withoutTitleLine(blocks, 'Ring the landlord about the boiler')
  assert.equal(left.length, 1)
  assert.equal(blockText(left[0]), 'He wants an answer by Friday.')
})

test('a name cut out of a longer line leaves the rest of that line', () => {
  const blocks = [{ id: '1', type: 'text' as const, text: 'Ring the landlord about the boiler' }]
  const left = withoutTitleLine(blocks, 'Ring the landlord…')
  assert.equal(blockText(left[0]), 'about the boiler')
})

test('a name nobody took from the writing leaves the writing alone', () => {
  const blocks = [{ id: '1', type: 'text' as const, text: 'Ring the landlord' }]
  assert.deepEqual(withoutTitleLine(blocks, 'Boiler'), blocks)
  assert.deepEqual(withoutTitleLine(blocks, ''), blocks)
})
