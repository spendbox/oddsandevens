import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datesFrom, localPlan, MAX_STEPS, parsePlan, type Step } from '../plan.ts'
import { whenIn } from '../tasks.ts'
import { makeBlock } from '../blocks.ts'
import type { Block } from '../types.ts'

function lines(...texts: string[]): Block[] {
  return texts.map((text) => {
    const block = makeBlock('text')
    if (block.type === 'text') block.text = text
    return block
  })
}

test('the local plan finds the lines that read like something to do', () => {
  const steps = localPlan(lines('Met the agent today.', 'I need to call the landlord'))
  assert.equal(steps.length, 1)
  assert.match(steps[0].text, /call the landlord/i)
})

test('every locally found step is the writer’s to do', () => {
  const steps = localPlan(lines('Send the invoice to Ada'))
  assert.ok(steps.every((step) => step.who === 'you'))
})

test('a date in the line is kept as it was written', () => {
  const steps = localPlan(lines('Call the landlord by Friday'))
  assert.equal(steps[0].when, 'by Friday')
})

test('the local plan is capped', () => {
  const many = lines(...Array.from({ length: 20 }, (_, i) => `Send the report number ${i}`))
  assert.ok(localPlan(many).length <= MAX_STEPS)
})

test('a reply is read into steps, with who marked', () => {
  const steps = parsePlan('you: Ring the plumber\napp: Draft the email to the landlord')
  assert.deepEqual(steps, [
    { who: 'you', text: 'Ring the plumber' },
    { who: 'app', text: 'Draft the email to the landlord' },
  ])
})

test('bullets, numbers and emphasis are stripped', () => {
  const steps = parsePlan('1. you: **Ring the plumber**\n- app: Draft the email')
  assert.deepEqual(steps.map((s) => s.text), ['Ring the plumber', 'Draft the email'])
})

test('a line with no prefix is the writer’s, which is the safe way to be wrong', () => {
  assert.deepEqual(parsePlan('Chase the invoice'), [{ who: 'you', text: 'Chase the invoice' }])
})

test('"pad:" counts as the app, because that is what it calls itself', () => {
  assert.equal(parsePlan('pad: Write the first draft')[0].who, 'app')
})

test('a heading the model wrote over its own list is not a step', () => {
  assert.deepEqual(parsePlan('Next steps:\nyou: Sign the form'), [
    { who: 'you', text: 'Sign the form' },
  ])
})

test('a code fence around the answer is not a step', () => {
  assert.deepEqual(parsePlan('```\nyou: Sign the form\n```'), [
    { who: 'you', text: 'Sign the form' },
  ])
})

test('nothing usable gives nothing back rather than a blank row', () => {
  assert.deepEqual(parsePlan('\n\n   \n'), [])
})

test('a reply is capped at the same length as a local plan', () => {
  const reply = Array.from({ length: 20 }, (_, i) => `you: step ${i}`).join('\n')
  assert.equal(parsePlan(reply).length, MAX_STEPS)
})

test('dates are read off the step’s own wording', () => {
  const steps: Step[] = [
    { who: 'you', text: 'Call the landlord by Friday' },
    { who: 'you', text: 'Chase it' },
  ]
  const dated = datesFrom(steps, whenIn)
  assert.equal(dated[0].when, 'by Friday')
  assert.equal(dated[1].when, undefined)
})

test('a date already found is left alone', () => {
  const dated = datesFrom([{ who: 'you', text: 'Call them', when: 'tomorrow' }], whenIn)
  assert.equal(dated[0].when, 'tomorrow')
})
