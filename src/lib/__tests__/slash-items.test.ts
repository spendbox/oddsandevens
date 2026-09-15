import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SLASH_ITEMS, rankItems } from '../slash-items.ts'

/** What pressing Enter would insert for a given query. */
const top = (query: string) => rankItems(query)[0]?.label

test('an empty query offers everything', () => {
  assert.equal(rankItems('').length, SLASH_ITEMS.length)
  assert.equal(rankItems('   ').length, SLASH_ITEMS.length)
})

test('typing a block name puts that block first', () => {
  assert.equal(top('text'), 'Text')
  assert.equal(top('task'), 'Task')
  assert.equal(top('code'), 'Code')
  assert.equal(top('quote'), 'Quote')
  assert.equal(top('divider'), 'Divider')
  assert.equal(top('bullet'), 'Bullet')
})

test('"form" finds the Form, not the Spreadsheet', () => {
  // The regression this ranking exists for: "formula" is a Spreadsheet
  // keyword and used to win on a plain substring match.
  assert.equal(top('form'), 'Form')
  assert.equal(top('f'), 'Form')
  assert.equal(top('fo'), 'Form')
  assert.equal(top('forms'), undefined, 'no item should claim a query it does not match')
})

test('a partial name still ranks its own block first', () => {
  assert.equal(top('sp'), 'Spreadsheet')
  assert.equal(top('co'), 'Code')
  assert.equal(top('ta'), 'Task')
  assert.equal(top('he'), 'Heading 1')
})

test('keyword synonyms work for the words people actually type', () => {
  assert.equal(top('sheet'), 'Spreadsheet')
  assert.equal(top('grid'), 'Spreadsheet')
  assert.equal(top('excel'), 'Spreadsheet')
  assert.equal(top('budget'), 'Spreadsheet')
  assert.equal(top('todo'), 'Task')
  assert.equal(top('survey'), 'Form')
  assert.equal(top('snippet'), 'Code')
  assert.equal(top('line'), 'Divider')
})

test('case does not matter', () => {
  assert.equal(top('FORM'), 'Form')
  assert.equal(top('SpReAd'), 'Spreadsheet')
})

test('a query that matches nothing returns nothing', () => {
  assert.deepEqual(rankItems('zzzz'), [])
  assert.deepEqual(rankItems('qqq'), [])
})

test('a label match always beats a keyword match', () => {
  // "list" is a Bullet keyword; "Task" no longer claims it.
  const ranked = rankItems('list')
  assert.equal(ranked[0].label, 'Bullet')
})

test('every item is reachable by typing its own label', () => {
  for (const item of SLASH_ITEMS) {
    const ranked = rankItems(item.label)
    assert.equal(ranked[0]?.label, item.label, `${item.label} is not reachable by name`)
  }
})

test('no two items share a label, or Enter would be ambiguous', () => {
  const labels = SLASH_ITEMS.map((i) => i.label)
  assert.equal(new Set(labels).size, labels.length)
})
