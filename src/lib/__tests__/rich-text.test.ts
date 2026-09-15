import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  blockHtml,
  escapeHtml,
  hasFormatting,
  htmlToMarkdown,
  htmlToPlain,
  sanitizeInline,
} from '../rich-text.ts'

test('the allowed tags survive', () => {
  assert.equal(sanitizeInline('<b>bold</b>'), '<b>bold</b>')
  assert.equal(sanitizeInline('<i>it</i>'), '<i>it</i>')
  assert.equal(sanitizeInline('<code>x</code>'), '<code>x</code>')
  assert.equal(sanitizeInline('<u>u</u> and <s>s</s>'), '<u>u</u> and <s>s</s>')
  assert.equal(sanitizeInline('<strong>a</strong><em>b</em>'), '<strong>a</strong><em>b</em>')
})

test('nesting is preserved', () => {
  assert.equal(sanitizeInline('<b>bold <i>both</i></b>'), '<b>bold <i>both</i></b>')
})

test('a script tag loses its markup AND its contents', () => {
  assert.equal(sanitizeInline('<script>alert(1)</script>'), '')
  assert.equal(sanitizeInline('before<script>alert(1)</script>after'), 'beforeafter')
  assert.equal(sanitizeInline('<SCRIPT>bad()</SCRIPT>'), '')
  assert.equal(sanitizeInline('<style>body{display:none}</style>hi'), 'hi')
  assert.equal(sanitizeInline('<iframe src="evil"></iframe>'), '')
})

test('every attribute is stripped, which kills the whole injection class', () => {
  assert.equal(sanitizeInline('<b onclick="steal()">x</b>'), '<b>x</b>')
  assert.equal(sanitizeInline('<b style="position:fixed;inset:0">x</b>'), '<b>x</b>')
  assert.equal(sanitizeInline('<b onmouseover=alert(1)>x</b>'), '<b>x</b>')
  // A link cannot survive at all, so javascript: URLs have nowhere to live.
  assert.equal(sanitizeInline('<a href="javascript:alert(1)">click</a>'), 'click')
  assert.equal(sanitizeInline('<img src=x onerror=alert(1)>'), '')
})

test('disallowed tags keep their words but lose their markup', () => {
  assert.equal(sanitizeInline('<div>hello</div>'), 'hello')
  assert.equal(sanitizeInline('<p>a</p><p>b</p>'), 'ab')
  assert.equal(sanitizeInline('<span class="x">text</span>'), 'text')
  assert.equal(sanitizeInline('line<br>break'), 'linebreak')
})

test('unbalanced and crossed tags cannot leak into the page', () => {
  assert.equal(sanitizeInline('<b>never closed'), '<b>never closed</b>')
  assert.equal(sanitizeInline('</b>stray close'), 'stray close')
  // Crossed tags unwind to the matching one rather than producing nonsense.
  const crossed = sanitizeInline('<b>one<i>two</b>three</i>')
  assert.equal(crossed.startsWith('<b>one<i>two'), true)
  assert.equal((crossed.match(/<b>/g) ?? []).length, (crossed.match(/<\/b>/g) ?? []).length)
  assert.equal((crossed.match(/<i>/g) ?? []).length, (crossed.match(/<\/i>/g) ?? []).length)
})

test('an unterminated angle bracket is escaped, not left to swallow the rest', () => {
  assert.equal(sanitizeInline('a < b'), 'a &lt; b')
  assert.equal(sanitizeInline('5 < 10 and 10 > 5'), '5 &lt; 10 and 10 > 5')
})

test('sanitising twice changes nothing', () => {
  for (const input of [
    '<b>x</b>',
    '<b>one<i>two</b>three</i>',
    '<script>x</script>',
    'a < b',
    '<div><b>keep</b></div>',
  ]) {
    const once = sanitizeInline(input)
    assert.equal(sanitizeInline(once), once, `not stable for ${input}`)
  }
})

test('escaping plain text', () => {
  assert.equal(escapeHtml('<b>not bold</b>'), '&lt;b&gt;not bold&lt;/b&gt;')
  assert.equal(escapeHtml('a & b'), 'a &amp; b')
  // Escaped text, once sanitised, must still be inert.
  assert.equal(sanitizeInline(escapeHtml('<script>alert(1)</script>')), '&lt;script&gt;alert(1)&lt;/script&gt;')
})

test('reading the plain text back out', () => {
  assert.equal(htmlToPlain('<b>bold</b> and <i>italic</i>'), 'bold and italic')
  assert.equal(htmlToPlain('a&amp;b'), 'a&b')
  assert.equal(htmlToPlain('&lt;tag&gt;'), '<tag>')
  assert.equal(htmlToPlain('one&nbsp;two'), 'one two')
  // Double-encoded input must not decode into a live tag.
  assert.equal(htmlToPlain('&amp;lt;script&amp;gt;'), '&lt;script&gt;')
})

test('a block falls back to its plain text when it has no formatting', () => {
  assert.equal(blockHtml({ text: 'plain' }), 'plain')
  assert.equal(blockHtml({ text: '<b>x</b>' }), '&lt;b&gt;x&lt;/b&gt;')
  assert.equal(blockHtml({ text: 'bold', html: '<b>bold</b>' }), '<b>bold</b>')
  // Stored HTML is re-sanitised, because it may have been to a server and back.
  assert.equal(blockHtml({ text: 'x', html: '<b onclick="x()">x</b>' }), '<b>x</b>')
})

test('formatting is only stored when there is some', () => {
  assert.equal(hasFormatting('plain', 'plain'), false)
  assert.equal(hasFormatting('<b>x</b>', 'x'), true)
  assert.equal(hasFormatting('&lt;b&gt;', '<b>'), false)
})

test('export turns formatting into markdown', () => {
  assert.equal(htmlToMarkdown('<b>bold</b>'), '**bold**')
  assert.equal(htmlToMarkdown('<i>it</i>'), '_it_')
  assert.equal(htmlToMarkdown('<code>x</code>'), '`x`')
  assert.equal(htmlToMarkdown('<s>gone</s>'), '~~gone~~')
  assert.equal(htmlToMarkdown('a <b>b</b> c'), 'a **b** c')
  assert.equal(htmlToMarkdown('<script>bad()</script>safe'), 'safe')
})

test('the sanitiser terminates on hostile input rather than hanging', () => {
  const nasty = '<'.repeat(2000) + 'b'.repeat(2000) + '>'.repeat(2000)
  const started = Date.now()
  sanitizeInline(nasty)
  sanitizeInline('<b>'.repeat(5000))
  assert.ok(Date.now() - started < 2000, 'sanitiser is too slow on pathological input')
})
