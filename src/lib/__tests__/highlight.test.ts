import assert from 'node:assert/strict'
import { test } from 'node:test'
import { highlight, normaliseLang } from '../highlight.ts'

/** Highlighting must never lose or add a character; it only labels runs. */
function assertLossless(code: string, lang: string) {
  assert.equal(
    highlight(code, lang)
      .map((t) => t.text)
      .join(''),
    code,
    `round-trip failed for ${lang}`,
  )
}

function kindsOf(code: string, lang: string, kind: string): string[] {
  return highlight(code, lang)
    .filter((t) => t.kind === kind)
    .map((t) => t.text)
}

test('aliases resolve', () => {
  assert.equal(normaliseLang('js'), 'javascript')
  assert.equal(normaliseLang('TS'), 'typescript')
  assert.equal(normaliseLang('py'), 'python')
  assert.equal(normaliseLang('unknown-thing'), 'unknown-thing')
})

test('nothing is lost across every language', () => {
  const samples: Array<[string, string]> = [
    ['const x = 1 // note\nreturn x', 'javascript'],
    ['def f():\n  # hi\n  return "s"', 'python'],
    ['SELECT * FROM t -- all', 'sql'],
    ['<div class="a">hi</div>', 'html'],
    ['body { color: red; /* c */ }', 'css'],
    ['{"a": 1, "b": true}', 'json'],
    ['fn main() { let x = 0; }', 'rust'],
    ['', 'javascript'],
    ['no language at all', 'plain'],
  ]
  for (const [code, lang] of samples) assertLossless(code, lang)
})

test('keywords, strings, numbers and comments are picked out', () => {
  const code = 'const total = 42 // add it up'
  assert.deepEqual(kindsOf(code, 'javascript', 'keyword'), ['const'])
  assert.deepEqual(kindsOf(code, 'javascript', 'number'), ['42'])
  assert.deepEqual(kindsOf(code, 'javascript', 'comment'), ['// add it up'])
  assert.deepEqual(kindsOf('x = "hi"', 'javascript', 'string'), ['"hi"'])
})

test('an escaped quote does not end the string early', () => {
  assert.deepEqual(kindsOf('a = "he said \\"no\\" loudly"', 'javascript', 'string'), [
    '"he said \\"no\\" loudly"',
  ])
})

test('an unterminated string runs to the end instead of hanging', () => {
  assertLossless('const s = "never closed', 'javascript')
  assert.deepEqual(kindsOf('const s = "never closed', 'javascript', 'string'), ['"never closed'])
})

test('an unterminated block comment runs to the end', () => {
  assertLossless('/* open forever', 'javascript')
})

test('a keyword inside a longer word is not highlighted', () => {
  assert.deepEqual(kindsOf('constant = 1', 'javascript', 'keyword'), [])
  assert.deepEqual(kindsOf('returnValue', 'javascript', 'keyword'), [])
})

test('a number inside an identifier is not a number token', () => {
  assert.deepEqual(kindsOf('item2 = 5', 'javascript', 'number'), ['5'])
})

test('python uses hash comments, not slashes', () => {
  assert.deepEqual(kindsOf('x = 1 # note', 'python', 'comment'), ['# note'])
  assert.deepEqual(kindsOf('x = 1 // not a comment here', 'python', 'comment'), [])
})
