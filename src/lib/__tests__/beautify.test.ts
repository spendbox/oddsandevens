import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beautify, continues, inlineMarkup, type Current } from '../beautify.ts'

function line(text: string, extra: Partial<Current> = {}): Current {
  return { type: 'text', text, ...extra }
}

/* ------------------------------------------------------------- the markers */

test('a dash makes a bullet, and the dash goes', () => {
  const shape = beautify(line('- milk'))
  assert.equal(shape?.type, 'bullet')
  assert.equal(shape?.text, 'milk')
})

test('a star, a bullet character and an en dash all make a bullet', () => {
  for (const marker of ['* milk', '• milk', '– milk']) {
    assert.equal(beautify(line(marker))?.type, 'bullet', marker)
  }
})

test('a number makes a numbered item', () => {
  const shape = beautify(line('1. Book the venue'))
  assert.equal(shape?.type, 'bullet')
  assert.equal(shape?.ordered, true)
  assert.equal(shape?.text, 'Book the venue')
})

test('a bracket makes a checkbox', () => {
  const shape = beautify(line('[] ring the bank'))
  assert.equal(shape?.type, 'todo')
  assert.equal(shape?.done, false)
  assert.equal(shape?.text, 'ring the bank')
})

test('a ticked bracket makes a checkbox that is already done', () => {
  assert.equal(beautify(line('[x] paid the deposit'))?.done, true)
  assert.equal(beautify(line('[ ] not yet'))?.done, false)
})

test('writing TODO: makes a checkbox too', () => {
  const shape = beautify(line('TODO: chase the invoice'))
  assert.equal(shape?.type, 'todo')
  assert.equal(shape?.text, 'chase the invoice')
  assert.equal(beautify(line('Action: sign it'))?.type, 'todo')
  assert.equal(beautify(line('to-do: sign it'))?.type, 'todo')
})

test('hashes make headings, one per level', () => {
  assert.equal(beautify(line('# Title'))?.level, 1)
  assert.equal(beautify(line('## Section'))?.level, 2)
  assert.equal(beautify(line('### Smaller'))?.level, 3)
  assert.equal(beautify(line('# Title'))?.text, 'Title')
})

test('a chevron makes a quote', () => {
  assert.equal(beautify(line('> as they put it'))?.type, 'quote')
})

test('three dashes make a line across the page', () => {
  assert.equal(beautify(line('---'))?.type, 'divider')
  assert.equal(beautify(line('***'))?.type, 'divider')
})

test('a dash with no space after it is a dash', () => {
  assert.equal(beautify(line('-5 degrees')), null)
})

test('a date is not a numbered list', () => {
  assert.equal(beautify(line('2024 was the year')), null)
})

test('typing a dash inside a bullet is a dash, not another bullet', () => {
  assert.equal(beautify(line('- milk', { type: 'bullet' }))?.text, 'milk')
  assert.equal(beautify(line('milk', { type: 'bullet' })), null)
})

/* ------------------------------------------------------------- the emphasis */

test('double stars make it bold', () => {
  const shape = beautify(line('the **whole** point'))
  assert.equal(shape?.html, 'the <b>whole</b> point')
  assert.equal(shape?.text, 'the whole point')
})

test('single stars and underscores make it italic', () => {
  assert.equal(inlineMarkup('a *slanted* word'), 'a <i>slanted</i> word')
  assert.equal(inlineMarkup('a _slanted_ word'), 'a <i>slanted</i> word')
})

test('backticks make it code, and tildes strike it out', () => {
  assert.equal(inlineMarkup('run `npm test` now'), 'run <code>npm test</code> now')
  assert.equal(inlineMarkup('~~gone~~'), '<s>gone</s>')
})

test('double stars are read before single ones', () => {
  assert.equal(inlineMarkup('**bold**'), '<b>bold</b>')
})

test('an underscore inside a word is part of the word', () => {
  assert.equal(inlineMarkup('file_name_here'), null)
})

test('a line with no notation is left exactly alone', () => {
  assert.equal(inlineMarkup('nothing to do here'), null)
  assert.equal(beautify(line('nothing to do here')), null)
})

test('markup in the text cannot become a tag', () => {
  assert.equal(inlineMarkup('**<script>**'), '<b>&lt;script&gt;</b>')
})

test('a line somebody formatted by hand is not re-read', () => {
  assert.equal(beautify(line('a *starred* word', { html: 'a <b>starred</b> word' })), null)
})

/* --------------------------------------------------------------- the guesses */

test('a shouted short line becomes a heading', () => {
  const shape = beautify(line('NEXT STEPS'))
  assert.equal(shape?.type, 'heading')
  assert.equal(shape?.level, 2)
  assert.equal(shape?.text, 'NEXT STEPS')
})

test('a shouted sentence is still a sentence', () => {
  assert.equal(beautify(line('THIS IS FINE.')), null)
})

test('a long line in capitals is not a heading', () => {
  assert.equal(beautify(line('A'.repeat(70))), null)
})

test('two letters shouted are not a heading', () => {
  assert.equal(beautify(line('OK')), null)
})

test('a short line ending in a colon is a lead-in, so it is bolded', () => {
  const shape = beautify(line('Next steps:'))
  assert.equal(shape?.type, 'text')
  assert.equal(shape?.html, '<b>Next steps:</b>')
  assert.equal(shape?.text, 'Next steps:')
})

test('a long line ending in a colon is a sentence, so it is left alone', () => {
  assert.equal(beautify(line(`${'word '.repeat(20)}:`)), null)
})

test('the guesses never touch a heading or a quote', () => {
  assert.equal(beautify(line('SHOUTING', { type: 'heading', level: 1 })), null)
  assert.equal(beautify(line('Next steps:', { type: 'quote' })), null)
})

test('the guesses never touch a bullet', () => {
  assert.equal(beautify(line('Next steps:', { type: 'bullet' })), null)
})

/* ------------------------------------------------------------ what comes next */

test('a list carries on, and a heading does not', () => {
  assert.deepEqual(continues('bullet'), { type: 'bullet' })
  assert.deepEqual(continues('bullet', true), { type: 'bullet', ordered: true })
  assert.deepEqual(continues('todo'), { type: 'todo' })
  assert.deepEqual(continues('heading'), { type: 'text' })
  assert.deepEqual(continues('quote'), { type: 'text' })
  assert.deepEqual(continues('text'), { type: 'text' })
})

test('markdown’s own task list is a box to tick, not a bullet with brackets', () => {
  const shaped = beautify({ type: 'text', text: '- [ ] Ring the landlord' })
  assert.equal(shaped?.type, 'todo')
  assert.equal(shaped?.text, 'Ring the landlord')
  assert.equal(shaped?.done, false)
  assert.equal(beautify({ type: 'text', text: '1. [x] Posted' })?.done, true)
})
