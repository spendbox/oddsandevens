import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellKey, colName, computeGrid, parseRef } from '../formula.ts'

/** Convenience: compute a grid and read back what one cell would display. */
function shown(cells: Record<string, string>, key: string): string {
  return computeGrid(cells)[key]?.text ?? ''
}

test('column names run past Z', () => {
  assert.equal(colName(0), 'A')
  assert.equal(colName(25), 'Z')
  assert.equal(colName(26), 'AA')
  assert.equal(colName(27), 'AB')
  assert.equal(colName(51), 'AZ')
  assert.equal(colName(52), 'BA')
})

test('references round-trip through their own key', () => {
  for (const index of [0, 5, 25, 26, 52, 701]) {
    const key = cellKey(index, 3)
    assert.deepEqual(parseRef(key), { col: index, row: 3 })
  }
  assert.equal(parseRef('not a ref'), null)
  assert.equal(parseRef('A0'), null)
})

test('plain values keep their type', () => {
  const grid = computeGrid({ A1: '42', A2: 'hello', A3: '3.5' })
  assert.equal(grid.A1.numeric, true)
  assert.equal(grid.A2.numeric, false)
  assert.equal(grid.A3.text, '3.5')
})

test('arithmetic and precedence', () => {
  assert.equal(shown({ A1: '=2+3*4' }, 'A1'), '14')
  assert.equal(shown({ A1: '=(2+3)*4' }, 'A1'), '20')
  // Left-to-right, matching Excel and Sheets: (2^3)^2. Maths convention would
  // say 512, but the people using this have spreadsheet habits, not algebra ones.
  assert.equal(shown({ A1: '=2^3^2' }, 'A1'), '64')
  assert.equal(shown({ A1: '=-5+2' }, 'A1'), '-3')
  assert.equal(shown({ A1: '=10/4' }, 'A1'), '2.5')
})

test('floating point noise is rounded away', () => {
  assert.equal(shown({ A1: '=0.1+0.2' }, 'A1'), '0.3')
})

test('cell references and chains', () => {
  const cells = { A1: '10', A2: '5', B1: '=A1+A2', C1: '=B1*2' }
  assert.equal(shown(cells, 'B1'), '15')
  assert.equal(shown(cells, 'C1'), '30')
})

test('ranges feed the aggregate functions', () => {
  const cells = { A1: '1', A2: '2', A3: '3', A4: '4', B1: '=SUM(A1:A4)', B2: '=AVERAGE(A1:A4)', B3: '=MAX(A1:A4)', B4: '=COUNT(A1:A4)' }
  assert.equal(shown(cells, 'B1'), '10')
  assert.equal(shown(cells, 'B2'), '2.5')
  assert.equal(shown(cells, 'B3'), '4')
  assert.equal(shown(cells, 'B4'), '4')
})

test('blank cells are skipped by AVERAGE, not counted as zero', () => {
  const cells = { A1: '10', A2: '', A3: '20', B1: '=AVERAGE(A1:A3)' }
  assert.equal(shown(cells, 'B1'), '15')
})

test('a range mixed with single cells in one call', () => {
  const cells = { A1: '1', A2: '2', C5: '7', B1: '=SUM(A1:A2, C5, 10)' }
  assert.equal(shown(cells, 'B1'), '20')
})

test('text join and comparison', () => {
  assert.equal(shown({ A1: 'foo', B1: '=A1&"bar"' }, 'B1'), 'foobar')
  assert.equal(shown({ A1: '=5>3' }, 'A1'), 'TRUE')
  assert.equal(shown({ A1: '=5<=3' }, 'A1'), 'FALSE')
  assert.equal(shown({ A1: '=2<>3' }, 'A1'), 'TRUE')
})

test('IF picks a branch', () => {
  assert.equal(shown({ A1: '100', B1: '=IF(A1>50, "big", "small")' }, 'B1'), 'big')
  assert.equal(shown({ A1: '10', B1: '=IF(A1>50, "big", "small")' }, 'B1'), 'small')
})

test('text functions', () => {
  assert.equal(shown({ A1: '=UPPER("abc")' }, 'A1'), 'ABC')
  assert.equal(shown({ A1: '=LEN("hello")' }, 'A1'), '5')
  assert.equal(shown({ A1: '=ROUND(3.14159, 2)' }, 'A1'), '3.14')
  assert.equal(shown({ A1: '=CONCAT("a","b","c")' }, 'A1'), 'abc')
})

test('a cell that refers to itself reports a cycle instead of hanging', () => {
  assert.equal(shown({ A1: '=A1+1' }, 'A1'), '#CYCLE')
})

test('a cycle around a loop is caught too', () => {
  const grid = computeGrid({ A1: '=B1', B1: '=C1', C1: '=A1' })
  assert.equal(grid.A1.error, true)
  assert.equal(grid.A1.text, '#CYCLE')
})

test('bad input shows an error rather than throwing', () => {
  assert.equal(shown({ A1: '=1/0' }, 'A1'), '#ERROR')
  assert.equal(shown({ A1: '=NOPE(1)' }, 'A1'), '#ERROR')
  assert.equal(shown({ A1: '=1+' }, 'A1'), '#ERROR')
  assert.equal(shown({ A1: '="a"*2' }, 'A1'), '#ERROR')
})

test('a formula reading an empty cell treats it as zero', () => {
  assert.equal(shown({ A1: '=B9+5' }, 'A1'), '5')
})

test('a shared total is computed once and reused', () => {
  const cells: Record<string, string> = { A1: '5' }
  for (let r = 1; r <= 50; r++) cells[`B${r}`] = '=A1*2'
  const grid = computeGrid(cells)
  assert.equal(grid.B50.text, '10')
})
