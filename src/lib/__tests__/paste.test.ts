import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseClipboard, parsePastedHtml, parsePastedText } from '../paste.ts'

const shape = (blocks: ReturnType<typeof parsePastedText>) =>
  blocks.map((b) => [b.type, b.text, b.level ?? b.indent ?? ''].filter(Boolean).join('|'))

test('paragraphs stay separate instead of collapsing into one line', () => {
  const blocks = parsePastedHtml('<p>First para.</p><p>Second para.</p><p>Third.</p>')
  assert.equal(blocks.length, 3)
  assert.deepEqual(blocks.map((b) => b.text), ['First para.', 'Second para.', 'Third.'])
  assert.ok(blocks.every((b) => b.type === 'text'))
})

test('headings survive, collapsed into the three levels this editor has', () => {
  const blocks = parsePastedHtml('<h1>Big</h1><h2>Middle</h2><h4>Small</h4>')
  assert.deepEqual(blocks.map((b) => [b.type, b.level]), [
    ['heading', 1],
    ['heading', 2],
    ['heading', 3],
  ])
})

test('list items become bullets', () => {
  const blocks = parsePastedHtml('<ul><li>one</li><li>two</li></ul>')
  assert.deepEqual(shape(blocks), ['bullet|one', 'bullet|two'])
})

test('a nested list keeps its depth', () => {
  const blocks = parsePastedHtml('<ul><li>top</li><ul><li>under</li></ul></ul>')
  const nested = blocks.find((b) => b.text === 'under')
  assert.equal(nested?.indent, 1, 'the inner item should be one level in')
  assert.equal(blocks.find((b) => b.text === 'top')?.indent, undefined)
})

test('a quote is recognised, and a code block keeps its words', () => {
  assert.equal(parsePastedHtml('<blockquote>said so</blockquote>')[0].type, 'quote')
  // There is no code block to paste into any more, so a <pre> becomes a
  // paragraph. Losing the monospace is a small thing; losing the words would
  // be the most destructive thing this parser could do.
  const pre = parsePastedHtml('<pre>const x = 1</pre>')[0]
  assert.equal(pre.type, 'text')
  assert.equal(pre.text, 'const x = 1')
})

test('inline formatting comes through, sanitised', () => {
  const [block] = parsePastedHtml('<p>a <b>bold</b> word</p>')
  assert.equal(block.text, 'a bold word')
  assert.match(block.html ?? '', /<b>bold<\/b>/)

  const [unsafe] = parsePastedHtml('<p onclick="x()">a <a href="javascript:x">link</a> <script>bad()<\/script></p>')
  assert.ok(!/script|href|onclick/i.test(unsafe.html ?? unsafe.text), unsafe.html ?? unsafe.text)
  assert.equal(unsafe.text, 'a link')
})

test('a wrapper div does not create empty blocks', () => {
  const blocks = parsePastedHtml('<div><div><p>only this</p></div></div>')
  assert.deepEqual(blocks.map((b) => b.text), ['only this'])
})

test('whitespace-only content produces nothing', () => {
  assert.deepEqual(parsePastedHtml('<p> </p><p></p><div>\n</div>'), [])
  assert.deepEqual(parsePastedText('   \n\n  \n'), [])
  assert.deepEqual(parsePastedText(''), [])
})

test('plain text: blank lines separate paragraphs', () => {
  const blocks = parsePastedText('One para.\n\nTwo para.')
  assert.deepEqual(blocks.map((b) => b.text), ['One para.', 'Two para.'])
})

test('plain text: a hard-wrapped paragraph is rejoined, not split', () => {
  // An email wrapped at 72 columns should not become five paragraphs.
  const blocks = parsePastedText('this is a long\nsentence that was\nwrapped by a mailer')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].text, 'this is a long sentence that was wrapped by a mailer')
})

test('plain text: list markers each become their own bullet', () => {
  assert.deepEqual(shape(parsePastedText('- one\n- two\n- three')), [
    'bullet|one',
    'bullet|two',
    'bullet|three',
  ])
  assert.deepEqual(shape(parsePastedText('1. first\n2. second')), ['bullet|first', 'bullet|second'])
  assert.deepEqual(shape(parsePastedText('• dotted\n• points')), ['bullet|dotted', 'bullet|points'])
})

test('plain text: indentation becomes nesting', () => {
  const blocks = parsePastedText('- top\n  - under\n    - deeper')
  assert.deepEqual(blocks.map((b) => b.indent ?? 0), [0, 1, 2])
})

test('plain text: markdown headings and checkboxes', () => {
  assert.deepEqual(shape(parsePastedText('# Title\n## Sub')), ['heading|Title|1', 'heading|Sub|2'])
  const todos = parsePastedText('[x] done\n[ ] not done')
  assert.deepEqual(todos.map((b) => [b.type, b.done]), [
    ['todo', true],
    ['todo', false],
  ])
})

test('the clipboard prefers HTML but falls back to text', () => {
  assert.equal(parseClipboard('<h1>From html</h1>', 'from text')[0].type, 'heading')
  assert.equal(parseClipboard('', '- from text')[0].type, 'bullet')
  assert.equal(parseClipboard('   ', 'plain')[0].text, 'plain')
  // HTML that yields nothing must not swallow usable plain text.
  assert.equal(parseClipboard('<p>  </p>', 'real content')[0].text, 'real content')
})

test('pasting a few words stays one block, so it can be an inline insertion', () => {
  assert.equal(parseClipboard('', 'just some words').length, 1)
  assert.equal(parseClipboard('<p>just some words</p>', 'just some words').length, 1)
})

test('a realistic web page paste keeps its shape', () => {
  const html = `
    <div class="article">
      <h1>The Title</h1>
      <p>An opening <em>paragraph</em> with emphasis.</p>
      <h2>A section</h2>
      <ul><li>first point</li><li>second point</li></ul>
      <blockquote>Someone said this.</blockquote>
      <p>A closing line.</p>
    </div>`
  const blocks = parsePastedHtml(html)
  assert.deepEqual(blocks.map((b) => b.type), [
    'heading',
    'text',
    'heading',
    'bullet',
    'bullet',
    'quote',
    'text',
  ])
  assert.match(blocks[1].html ?? '', /<em>paragraph<\/em>/)
})

test('a markdown task list pastes as boxes to tick', () => {
  const blocks = parsePastedText('- [ ] ring the landlord\n- [x] posted the forms')
  assert.deepEqual(blocks.map((b) => b.type), ['todo', 'todo'])
  assert.equal(blocks[0].text, 'ring the landlord')
  assert.equal(blocks[1].done, true)
})

test('a numbered list stays numbered, from markdown and from HTML', () => {
  const typed = parsePastedText('1. first\n2. second')
  assert.deepEqual(typed.map((b) => b.ordered), [true, true])
  const bulleted = parsePastedText('- first\n- second')
  assert.deepEqual(bulleted.map((b) => b.ordered), [undefined, undefined])
  const html = parsePastedHtml('<ol><li>one</li><li>two</li></ol>')
  assert.deepEqual(html.map((b) => b.ordered), [true, true])
  assert.deepEqual(parsePastedHtml('<ul><li>one</li></ul>').map((b) => b.ordered), [undefined])
})
