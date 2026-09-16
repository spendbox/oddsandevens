import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRules, describe, matches, type Rule } from '../rules.ts'
import type { Block } from '../types.ts'

let counter = 0
const line = (type: 'text' | 'bullet' | 'quote', value: string): Block =>
  ({ id: `b${counter++}`, type, text: value }) as Block
const task = (value: string, done = false): Block => ({
  id: `d${counter++}`,
  type: 'todo',
  text: value,
  done,
})

const rule = (partial: Partial<Rule>): Rule => ({
  id: `r${counter++}`,
  when: { kind: 'startsWith', value: 'AI:' },
  then: { kind: 'become', value: 'todo' },
  ...partial,
})

/** The kind of each block, which is what most of these rules change. */
const kinds = (blocks: Block[]) => blocks.map((b) => b.type)
const texts = (blocks: Block[]) =>
  blocks.map((b) => ('text' in b ? (b as { text: string }).text : ''))

test('no rules changes nothing, and returns the very same array', () => {
  const blocks = [line('text', 'Hello')]
  assert.equal(applyRules(blocks, []), blocks)
})

test('every bullet becomes a task', () => {
  const blocks = [line('text', 'Notes'), line('bullet', 'Ring the bank')]
  const out = applyRules(blocks, [
    rule({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'todo' } }),
  ])
  assert.deepEqual(kinds(out), ['text', 'todo'])
  assert.deepEqual(texts(out), ['Notes', 'Ring the bank'])
})

test('a line starting with a marker becomes what the rule says', () => {
  const out = applyRules([line('text', 'AI: ring the bank')], [rule({})])
  assert.deepEqual(kinds(out), ['todo'])
  assert.deepEqual(texts(out), ['AI: ring the bank'])
})

test('the marker can be taken off as it converts', () => {
  const out = applyRules([line('text', 'AI: ring the bank')], [rule({ strip: true })])
  assert.deepEqual(texts(out), ['ring the bank'])
})

test('stripping takes the separator with it', () => {
  // "AI: ring the bank" must not become ": ring the bank".
  const out = applyRules(
    [line('text', 'TODO — pay the deposit')],
    [rule({ when: { kind: 'startsWith', value: 'TODO' }, strip: true })],
  )
  assert.deepEqual(texts(out), ['pay the deposit'])
})

test('matching ignores case and leading space', () => {
  const out = applyRules([line('text', '   ai: ring the bank')], [rule({})])
  assert.deepEqual(kinds(out), ['todo'])
})

test('running the rules again changes nothing', () => {
  // This is what makes it safe to run on every settled keystroke.
  const rules = [
    rule({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'todo' } }),
  ]
  const once = applyRules([line('bullet', 'Ring the bank')], rules)
  const twice = applyRules(once, rules)
  assert.equal(twice, once, 'the second pass returns the identical array')
})

test('a rule that would turn a kind into itself never fires', () => {
  const blocks = [line('bullet', 'one')]
  const out = applyRules(blocks, [
    rule({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'bullet' } }),
  ])
  assert.equal(out, blocks)
})

test('containing matches whole words only', () => {
  // "do" must not fire on "document", which is the regression that makes a
  // contains rule unusable.
  const contains = rule({
    when: { kind: 'contains', value: 'urgent' },
    then: { kind: 'become', value: 'todo' },
  })
  assert.equal(matches(contains, line('text', 'This is urgent')), true)
  assert.equal(matches(contains, line('text', 'Urgently, no')), false)
  assert.equal(matches(contains, line('text', 'urgent!')), true)
})

test('a line ending with something can be matched too', () => {
  const out = applyRules(
    [line('text', 'Should we ship it?')],
    [rule({ when: { kind: 'endsWith', value: '?' }, then: { kind: 'become', value: 'quote' } })],
  )
  assert.deepEqual(kinds(out), ['quote'])
})

test('the first matching rule wins', () => {
  // Order decides, and it is the order on screen. Running every rule would
  // mean the result depended on something nobody can see.
  const out = applyRules(
    [line('text', 'AI: ring the bank')],
    [
      rule({ then: { kind: 'become', value: 'quote' } }),
      rule({ then: { kind: 'become', value: 'todo' } }),
    ],
  )
  assert.deepEqual(kinds(out), ['quote'])
})

test('a rule that is switched off does nothing', () => {
  const blocks = [line('text', 'AI: ring the bank')]
  assert.equal(applyRules(blocks, [rule({ off: true })]), blocks)
})

test('a block keeps its id, so the caret does not jump', () => {
  const block = line('text', 'AI: ring the bank')
  const [out] = applyRules([block], [rule({})])
  assert.equal(out.id, block.id)
})

test('indentation and alignment survive the conversion', () => {
  const block = { ...line('text', 'AI: ring the bank'), indent: 2, align: 'center' } as Block
  const [out] = applyRules([block], [rule({})])
  assert.equal((out as { indent?: number }).indent, 2)
  assert.equal((out as { align?: string }).align, 'center')
})

test('a rule can align rather than convert', () => {
  const out = applyRules(
    [line('text', 'Chapter one')],
    [
      rule({
        when: { kind: 'startsWith', value: 'Chapter' },
        then: { kind: 'align', value: 'center' },
      }),
    ],
  )
  assert.deepEqual(kinds(out), ['text'], 'the kind is left alone')
  assert.equal((out[0] as { align?: string }).align, 'center')
})

test('a task is not matched by a bullet rule once it has become one', () => {
  const blocks = [task('Ring the bank')]
  assert.equal(
    applyRules(blocks, [
      rule({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'todo' } }),
    ]),
    blocks,
  )
})

test('a spreadsheet is never dragged into a text rule', () => {
  const blocks: Block[] = [{ id: 'g', type: 'table', rows: 2, cols: 2, cells: {} }]
  assert.equal(applyRules(blocks, [rule({})]), blocks)
})

test('an empty rule value never fires', () => {
  // A half-typed rule must not convert the whole document while it is being
  // written.
  const blocks = [line('text', 'Anything at all')]
  assert.equal(applyRules(blocks, [rule({ when: { kind: 'startsWith', value: '  ' } })]), blocks)
})

test('each rule reads as a sentence', () => {
  assert.equal(
    describe(rule({ strip: true })),
    'Every line starting with “AI:” becomes a task, without the marker',
  )
  assert.equal(
    describe(
      rule({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'todo' } }),
    ),
    'Every bullet becomes a task',
  )
  assert.equal(
    describe(
      rule({
        when: { kind: 'contains', value: 'urgent' },
        then: { kind: 'become', value: 'heading', level: 2 },
      }),
    ),
    'Every line containing “urgent” becomes a heading 2',
  )
})
