/**
 * End-to-end check: drives a real browser through everything Pad claims to do.
 *
 * The unit tests cover the formula engine, the highlighter and the slash
 * ranking. This covers the parts that only exist once a browser is involved —
 * the caret, the slash menu, saving, and whether a document is still there
 * after a reload. Between them, "it builds" and "it works" stop being the
 * same claim.
 *
 * Run it against a server you have already started:
 *
 *     npm run build && npm start &
 *     npm run e2e
 *
 * Environment:
 *   PAD_E2E_URL     where the app is running (default http://localhost:3000)
 *   PAD_E2E_CHROME  path to a Chrome/Chromium binary, if Playwright's own
 *                   download is not present
 *   PAD_E2E_SHOTS   where to write screenshots (default ./e2e-shots)
 */
import { chromium } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestPdf } from './make-test-pdf.mjs'

const SHOTS = process.env.PAD_E2E_SHOTS ?? 'e2e-shots'
const URL = process.env.PAD_E2E_URL ?? 'http://localhost:3000'
const results = []
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

import { mkdirSync } from 'node:fs'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch(
  process.env.PAD_E2E_CHROME ? { executablePath: process.env.PAD_E2E_CHROME } : {},
)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
// Fixtures are generated into a temp directory, never committed as binaries.
const FIXTURES = mkdtempSync(join(tmpdir(), 'pad-e2e-'))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/01-first-open.png` })

// THE core promise: open it and start typing.
await page.keyboard.type('Weekly plan')
await page.waitForTimeout(200)
const typedSomewhere = await page.evaluate(() => document.body.innerText.includes('Weekly plan'))
log('typing works immediately on open, with no click', typedSomewhere)
await page.screenshot({ path: `${SHOTS}/02-typed-immediately.png` })

// Find the first editable block and use it from here on.
const firstBlock = page.locator('[data-block-id] [contenteditable]').first()
await firstBlock.click()
await page.keyboard.type('Notes for the week')
await page.waitForTimeout(150)
log('text block accepts typing', (await firstBlock.innerText()).includes('Notes for the week'))

// Markdown shortcut: heading.
await page.keyboard.press('Enter')
await page.keyboard.type('# Budget')
await page.waitForTimeout(250)
const hasHeading = await page.evaluate(() =>
  [...document.querySelectorAll('[data-block-id]')].some(
    (b) => b.innerText.trim() === 'Budget' && b.querySelector('[contenteditable]')?.className.includes('text-2xl'),
  ),
)
log('markdown "# " makes a heading', hasHeading)

// Slash menu.
await page.keyboard.press('Enter')
await page.keyboard.type('/')
await page.waitForTimeout(300)
const menuVisible = await page.locator('[role="listbox"]').isVisible().catch(() => false)
log('slash menu opens', menuVisible)
await page.screenshot({ path: `${SHOTS}/03-slash-menu.png` })

// Filter it, then insert a spreadsheet.
await page.keyboard.type('sheet')
await page.waitForTimeout(250)
await page.screenshot({ path: `${SHOTS}/04-slash-filtered.png` })
const filteredToTable = await page.locator('[role="option"]').first().innerText().catch(() => '')
log('slash menu filters ("sheet" finds Spreadsheet)', filteredToTable.includes('Spreadsheet'), filteredToTable.replace(/\n/g, ' / '))

await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const tableExists = await page.locator('table').count()
log('spreadsheet block inserted', tableExists > 0)

// Enter numbers and a formula.
await page.locator('[aria-label="Cell A1"]').click()
await page.keyboard.type('120')
await page.keyboard.press('Enter')
await page.keyboard.type('340')
await page.keyboard.press('Enter')
await page.keyboard.type('55')
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
await page.locator('[aria-label="Cell B1"]').click()
await page.keyboard.type('=SUM(A1:A3)')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const sumShown = await page.locator('[aria-label="Cell B1"]').inputValue()
log('formula computes in the grid', sumShown === '515', `B1 shows "${sumShown}" (expected 515)`)
await page.screenshot({ path: `${SHOTS}/05-spreadsheet.png` })

// Formula re-computes when a dependency changes.
await page.locator('[aria-label="Cell A1"]').click()
await page.keyboard.press('Control+a')
await page.keyboard.type('200')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const recomputed = await page.locator('[aria-label="Cell B1"]').inputValue()
log('formula recomputes when a cell changes', recomputed === '595', `B1 now "${recomputed}" (expected 595)`)

// Tasks.
const addBlockBelow = async (text) => {
  await page.locator('[aria-label="Continue writing"]').click()
  await page.waitForTimeout(200)
  await page.keyboard.type(text)
  await page.waitForTimeout(250)
}
await addBlockBelow('[] Send the invoice')
const checkbox = page.locator('input[type="checkbox"][aria-label*="Send the invoice"]')
log('markdown "[] " makes a task', (await checkbox.count()) > 0)
if (await checkbox.count()) {
  await checkbox.first().check()
  await page.waitForTimeout(200)
  log('task can be ticked', await checkbox.first().isChecked())
}

// Code block via slash.
await page.locator('[aria-label="Continue writing"]').click()
await page.waitForTimeout(150)
await page.keyboard.type('/code')
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const codeArea = page.locator('textarea[aria-label="Code"]')
log('code block inserted', (await codeArea.count()) > 0)
if (await codeArea.count()) {
  await codeArea.first().click()
  await page.keyboard.type('const total = 515 // from the sheet')
  await page.waitForTimeout(400)
  const keywordColoured = await page.evaluate(() => {
    const pre = document.querySelector('pre')
    if (!pre) return false
    return [...pre.querySelectorAll('span')].some(
      (s) => s.textContent === 'const' && s.className.includes('accent'),
    )
  })
  log('code is syntax highlighted', keywordColoured)
}
await page.screenshot({ path: `${SHOTS}/06-tasks-and-code.png` })

// Form block.
await page.locator('[aria-label="Continue writing"]').click()
await page.waitForTimeout(150)
await page.keyboard.type('/form')
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
log('form block inserted', (await page.locator('[aria-label="Form title"]').count()) > 0)
await page.locator('[aria-label="Form title"]').first().fill('Signup')
await page.locator('[aria-label="Question 1"]').first().fill('Your name')
await page.waitForTimeout(200)
await page.locator('button:has-text("fill")').first().click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOTS}/07-form.png` })
const fillInput = page.locator('[aria-label="Your name"]')
log('form switches to fill mode with the question', (await fillInput.count()) > 0)
if (await fillInput.count()) {
  await fillInput.first().fill('Ada')
  await page.locator('button:has-text("Submit")').first().click()
  await page.waitForTimeout(400)
  const responded = await page.evaluate(() => document.body.innerText.includes('1 response'))
  log('form records a response', responded)
}

// Persistence across a reload — the thing that matters most.
await page.waitForTimeout(800)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const afterReload = await page.evaluate(() => document.body.innerText)
log('text survives a reload', afterReload.includes('Notes for the week'))
log('spreadsheet survives a reload', (await page.locator('[aria-label="Cell B1"]').inputValue()) === '595')
log('task survives a reload', afterReload.includes('Send the invoice'))
await page.screenshot({ path: `${SHOTS}/08-after-reload.png`, fullPage: true })

// A second document, and search.
await page.locator('button:has-text("New")').first().click()
await page.waitForTimeout(400)
await page.keyboard.type('Shopping list')
await page.waitForTimeout(300)
const docCount = await page.locator('nav [class*="group/doc"]').count()
log('a second document can be created', docCount >= 2, `${docCount} in sidebar`)

// Search: the panel, not a filter on the list of names.
await page.keyboard.press('Control+k')
await page.waitForTimeout(400)
log('Ctrl+K opens search', await page.locator('input[aria-label="Search everything"]').isVisible())
await page.locator('input[aria-label="Search everything"]').fill('invoice')
await page.waitForTimeout(400)
const searchHits = await page.locator('[role="dialog"][aria-label="Search"] button[data-active]').count()
log('search finds text inside a document body', searchHits === 1, `${searchHits} result(s) for "invoice"`)
const highlighted = await page.locator('[role="dialog"] mark').first().innerText().catch(() => '')
log('a result shows the passage that matched, with the word picked out', /invoice/i.test(highlighted), highlighted)
await page.screenshot({ path: `${SHOTS}/09-search.png` })

// Half a word is enough, which is what makes it usable while typing.
await page.locator('input[aria-label="Search everything"]').fill('invo')
await page.waitForTimeout(400)
log(
  'a half-typed word finds the whole one',
  (await page.locator('[role="dialog"][aria-label="Search"] button[data-active]').count()) === 1,
)

// Enter opens the highlighted result.
await page.keyboard.press('Enter')
await page.waitForTimeout(700)
log(
  'pressing Enter opens the top result',
  (await page.evaluate(() => document.body.innerText)).includes('Send the invoice'),
)
log(
  'opening a result closes the panel',
  !(await page.locator('input[aria-label="Search everything"]').isVisible().catch(() => false)),
)

// Nothing found says so rather than showing everything.
await page.keyboard.press('Control+k')
await page.waitForTimeout(300)
await page.locator('input[aria-label="Search everything"]').fill('zzzznothinghere')
await page.waitForTimeout(400)
log(
  'a search with no matches says so',
  (await page.evaluate(() => document.body.innerText)).includes('Nothing matches'),
)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
log('Escape closes search', !(await page.locator('input[aria-label="Search everything"]').isVisible().catch(() => false)))

/*
  Asking a question of every note.

  The model itself is stubbed — this run has no API key, and a test that
  depends on one is a test that does not run. What is checked here is
  everything around it, which is where the bugs live: that retrieval happens
  on the device and sends only passages, that the answer's citations resolve
  to real documents, and that a note nobody asked about is not shipped off.
*/
let askPayload = null
await page.route('**/api/ai', async (route) => {
  const request = route.request()
  if (request.method() === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
  }
  askPayload = request.postDataJSON()
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: 'You said you would send the invoice on Friday [1].' }),
  })
})
// A fresh load, because whether a key is configured is asked once per visit.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)

await page.keyboard.press('Control+k')
await page.waitForTimeout(400)
await page.locator('input[aria-label="Search everything"]').fill('what did I say about the invoice')
await page.waitForTimeout(500)
log('a question offers to answer itself', await page.locator('[data-ask-row]').isVisible())
await page.screenshot({ path: `${SHOTS}/09b-ask.png` })

await page.keyboard.press('Enter')
await page.waitForTimeout(900)
log(
  'the answer is shown',
  (await page.locator('[role="region"][aria-label="Answer"]').innerText()).includes('send the invoice'),
)
log('retrieval happens on the device: passages are sent, not documents', !!askPayload?.sources?.length)
log(
  'each source is numbered and named',
  askPayload?.sources?.every((s, i) => s.n === i + 1 && typeof s.title === 'string' && s.text.length > 0),
)
log(
  'the question is sent as asked',
  askPayload?.question === 'what did I say about the invoice',
)
log(
  'the note the answer came from is listed under it',
  (await page.locator('[role="region"][aria-label="Answer"] button').count()) >= 2,
)
await page.screenshot({ path: `${SHOTS}/09c-answer.png` })

// The citation is a way back to the note, not decoration.
await page.locator('[role="region"][aria-label="Answer"] button').last().click()
await page.waitForTimeout(800)
log(
  'clicking a citation opens that note',
  (await page.evaluate(() => document.body.innerText)).includes('Send the invoice'),
)

// Back to the real route for everything that follows.
await page.unroute('**/api/ai')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.keyboard.press('Control+k')
await page.waitForTimeout(400)
await page.locator('input[aria-label="Search everything"]').fill('what did I say about the invoice')
await page.waitForTimeout(500)
log(
  'with no key configured, asking is not offered at all',
  (await page.locator('[data-ask-row]').count()) === 0,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Dark mode.
await page.locator('button:has-text("Dark")').first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/10-dark.png` })
const isDark = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
log('dark mode toggles', isDark === 'dark')

// Sign-in control with no Supabase configured.
const localOnly = await page.evaluate(() => document.body.innerText.includes('On this device'))
log('unconfigured sync degrades to a plain indicator (no broken login)', localOnly)

// Mobile.
const mobile = await ctx.newPage()
await mobile.setViewportSize({ width: 390, height: 844 })
await mobile.goto(URL, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(900)
await mobile.screenshot({ path: `${SHOTS}/11-mobile.png` })
const noHorizontalScroll = await mobile.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 1,
)
log('no horizontal scroll on a phone', noHorizontalScroll)

// --- Layout: collapsing sidebar, alignment, reordering ----------------------
await page.locator('[aria-label="Collapse sidebar"]').click()
await page.waitForTimeout(400)
log('sidebar collapses', !(await page.locator('aside').isVisible()))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
log('sidebar stays collapsed after a reload', !(await page.locator('aside').isVisible()))
await page.locator('[aria-label="Show sidebar"]').click()
await page.waitForTimeout(400)
log('sidebar can be reopened', await page.locator('aside').isVisible())

{
  const titleX = await page
    .locator('[aria-label="Document title"]')
    .evaluate((el) => el.getBoundingClientRect().left)
  const bodyX = await page
    .locator('[data-block-id] [contenteditable]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().left)
  log('title and body text line up', Math.abs(titleX - bodyX) < 2, `title ${Math.round(titleX)}, body ${Math.round(bodyX)}`)

  // Hovering reveals the gutter; if it were laid out inline it would shove
  // every block sideways as the pointer moved down the page.
  await page.locator('[data-block-id]').first().hover()
  await page.waitForTimeout(250)
  const hoverX = await page
    .locator('[data-block-id] [contenteditable]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().left)
  log('text does not shift when the gutter appears', Math.abs(bodyX - hoverX) < 1)
}

// --- The virtual-keyboard regression ---------------------------------------
// Phones deliver a typed character as an input event with keydown reporting
// 'Unidentified'/229. This reproduces that exactly: no keydown at all, just
// the text change a virtual keyboard produces. The old keydown-based slash
// detection failed here, which is why "/" did nothing on mobile.
await page.locator('[aria-label="Continue writing"]').click()
await page.waitForTimeout(250)
const opened = await page.evaluate(() => {
  const el = document.activeElement
  if (!el || !el.isContentEditable) return 'no focused block'
  el.textContent = '/'
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '/', inputType: 'insertText' }))
  return 'dispatched'
})
await page.waitForTimeout(400)
log(
  'slash menu opens from an input event alone (virtual keyboard)',
  await page.locator('[role="listbox"]').isVisible().catch(() => false),
  opened,
)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// --- Drag to reorder --------------------------------------------------------
{
  const texts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
    )
  const before = await texts()
  const rows = page.locator('[data-block-id]')
  const count = await rows.count()
  if (count >= 2 && before.length >= 2) {
    const last = rows.nth(count - 1)
    await last.hover()
    await page.waitForTimeout(200)
    const grip = last.locator('[aria-label^="Drag to reorder"]')
    const gb = await grip.boundingBox()
    const topBox = await rows.first().boundingBox()
    if (gb && topBox) {
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
      await page.mouse.down()
      await page.mouse.move(topBox.x + 150, topBox.y + 2, { steps: 12 })
      await page.waitForTimeout(200)
      await page.mouse.up()
      await page.waitForTimeout(400)
    }
    const after = await texts()
    log('a block can be dragged to a new position', JSON.stringify(before) !== JSON.stringify(after))
  } else {
    log('a block can be dragged to a new position', false, 'not enough blocks to test')
  }
}

// --- Inline formatting ------------------------------------------------------
{
  // A document of its own, so these do not depend on what ran before.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.type('Formatting')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The word bold should be bold here.')
  await page.waitForTimeout(300)

  // The block holding the sentence, which is not necessarily the first one.
  const target = page.locator('[data-block-id] [contenteditable]', { hasText: 'should be bold' }).first()

  /** Selects the first occurrence of a word, in whichever block holds it. */
  const selectWord = (word) =>
    page.evaluate((w) => {
      const el = [...document.querySelectorAll('[data-block-id] [contenteditable]')].find((b) =>
        (b.textContent ?? '').includes(w),
      )
      if (!el) return false
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        const i = node.data.indexOf(w)
        if (i >= 0) {
          const r = document.createRange()
          r.setStart(node, i)
          r.setEnd(node, i + w.length)
          const s = window.getSelection()
          s.removeAllRanges()
          s.addRange(r)
          return true
        }
      }
      return false
    }, word)

  await selectWord('bold')
  await page.waitForTimeout(350)
  log(
    'formatting toolbar appears on a selection',
    await page.locator('[role="toolbar"]').isVisible().catch(() => false),
  )

  await page.keyboard.press('Control+b')
  await page.waitForTimeout(400)
  log('Ctrl+B applies bold', /<(b|strong)>bold<\/(b|strong)>/.test(await target.innerHTML()))

  await selectWord('here')
  await page.waitForTimeout(300)
  await page.locator('[aria-label="Italic"]').click({ force: true })
  await page.waitForTimeout(400)
  log('the toolbar applies italic', /<(i|em)>here<\/(i|em)>/.test(await target.innerHTML()))

  await selectWord('word')
  await page.waitForTimeout(300)
  await page.locator('[aria-label="Code"]').click({ force: true })
  await page.waitForTimeout(400)
  log('inline code can be applied', /<code>word<\/code>/.test(await target.innerHTML()))

  await page.waitForTimeout(700)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const afterReload = await page
    .locator('[data-block-id] [contenteditable]', { hasText: 'should be bold' })
    .first()
    .innerHTML()
  log(
    'formatting survives a reload',
    /<(b|strong)>/.test(afterReload) && /<code>/.test(afterReload),
  )

  // Splitting inside a bold word must leave both halves bold, and must
  // actually truncate the first block — the DOM used to keep the whole line.
  const boldIndex = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-block-id] [contenteditable]')]
    const el = all.find((b) => b.querySelector('b, strong'))
    if (!el) return -1
    el.focus()
    const b = el.querySelector('b, strong')
    const r = document.createRange()
    r.setStart(b.firstChild, 2)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    return all.indexOf(el)
  })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const halves = await page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.innerHTML),
  )
  const head = halves[boldIndex] ?? ''
  const tail = halves[boldIndex + 1] ?? ''
  log(
    'splitting inside bold keeps both halves bold',
    /<(b|strong)>/.test(head) && /<(b|strong)>/.test(tail),
    JSON.stringify([head, tail]).slice(0, 110),
  )
  log(
    'the first half is actually truncated by the split',
    /bo<\/(b|strong)>\s*$/.test(head),
    JSON.stringify(head).slice(0, 80),
  )

  await page.keyboard.press('Backspace')
  await page.waitForTimeout(500)
  const remerged = await page.evaluate(
    (i) =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')][i]?.innerHTML ?? '',
    boldIndex,
  )
  log('merging the halves back keeps the formatting', /<(b|strong)>/.test(remerged))
}

// --- Whitespace is not silently eaten --------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.type('hello world')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    // Typing capitalises the first letter now, so this matches loosely.
    const el = [...document.querySelectorAll('[data-block-id] [contenteditable]')].find(
      (b) => (b.textContent ?? '').toLowerCase() === 'hello world',
    )
    if (!el) throw new Error('could not find the "hello world" block')
    el.focus()
    const r = document.createRange()
    r.setStart(el.firstChild, 5)
    r.collapse(true)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
  })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('X')
  await page.waitForTimeout(400)
  const parts = await page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
  )
  // HTML collapses a leading space, which used to turn this into "Xworld".
  log('a leading space survives a split', parts.some((p) => p === 'X world'), JSON.stringify(parts))
}

// --- Pasted markup cannot carry anything executable -------------------------
{
  await page.locator('[aria-label="Continue writing"]').click()
  await page.waitForTimeout(250)
  await page.evaluate(() => {
    const el = document.activeElement
    const dt = new DataTransfer()
    dt.setData(
      'text/html',
      '<div onclick="steal()"><script>alert(1)<\/script><b>ok</b> <a href="javascript:x">link</a></div>',
    )
    dt.setData('text/plain', 'ok link')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(500)
  const pasted = await page.evaluate(() => document.activeElement?.innerHTML ?? '')
  log(
    'pasted HTML is stripped of scripts, links and handlers',
    !/script|onclick|href|<a/i.test(pasted),
    JSON.stringify(pasted).slice(0, 90),
  )
}

// --- Files in and out -------------------------------------------------------
{
  const notes = join(FIXTURES, 'notes.txt')
  const contents = 'the quick brown fox\njumped over the lazy dog\n'
  writeFileSync(notes, contents)

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.type('Attachments')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/file')
  await page.waitForTimeout(400)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  log('file block inserted', (await page.locator('input[aria-label="Choose a file"]').count()) > 0)

  await page.locator('input[aria-label="Choose a file"]').setInputFiles(notes)
  await page.waitForTimeout(900)
  const shown = await page.evaluate(() => document.body.innerText)
  log('attached file shows its name and size', shown.includes('notes.txt') && /\d+\s*(B|KB)/.test(shown))

  await page.waitForTimeout(700)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  log(
    'the attachment survives a reload',
    (await page.evaluate(() => document.body.innerText)).includes('notes.txt'),
  )

  const pending = page.waitForEvent('download', { timeout: 15000 })
  await page.locator('[aria-label="Save"]').first().click()
  const file = await pending
  const saved = join(FIXTURES, 'roundtrip.txt')
  await file.saveAs(saved)
  log('the file downloads with its own name', file.suggestedFilename() === 'notes.txt')
  log('the bytes round-trip unchanged', readFileSync(saved, 'utf8') === contents)
}

// --- Exporting the document -------------------------------------------------
{
  const pending = page.waitForEvent('download', { timeout: 15000 })
  await page.locator('[aria-label="Document actions"]').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("Download Markdown")').click()
  const file = await pending
  const saved = join(FIXTURES, 'export.md')
  await file.saveAs(saved)
  const markdown = readFileSync(saved, 'utf8')
  log('markdown export downloads', file.suggestedFilename().endsWith('.md'))
  log('markdown export carries the content', markdown.includes('Attachments'), markdown.split('\n')[0])
}

// --- Importing a PDF --------------------------------------------------------
{
  const pdf = join(FIXTURES, 'fixture.pdf')
  writeFileSync(pdf, makeTestPdf())

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(400)

  // pdf.js is ~500KB. It must not be in the first load — only fetched here.
  const beforeImport = await page.evaluate(
    () => performance.getEntriesByType('resource').filter((r) => /pdf/i.test(r.name)).length,
  )

  await page.locator('[aria-label="Document actions"]').click()
  await page.waitForTimeout(300)
  await page.locator('input[aria-label="Choose a PDF"]').setInputFiles(pdf)
  await page.waitForTimeout(5000)

  const text = await page.evaluate(() => document.body.innerText)
  log(
    'a PDF is imported as editable text',
    text.includes('Hello from a PDF') && text.includes('body text that should become editable'),
  )
  log(
    'the imported text is in real editable blocks',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        (e.textContent ?? '').includes('Hello from a PDF'),
      ),
    ),
  )
  const afterImport = await page.evaluate(
    () => performance.getEntriesByType('resource').filter((r) => /pdf/i.test(r.name)).length,
  )
  log('the PDF reader is only downloaded when it is used', beforeImport === 0 && afterImport > 0)
}

// --- Printing, which is how a document becomes a PDF ------------------------
{
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  const shownInPrint = await page.evaluate(() => {
    const hidden = (sel) => {
      const el = document.querySelector(sel)
      return !el || getComputedStyle(el).display === 'none'
    }
    return {
      sidebar: hidden('aside'),
      header: hidden('header'),
      fab: hidden('[aria-label="Insert block"]'),
      background: getComputedStyle(document.body).backgroundColor,
    }
  })
  log('printing hides the app and leaves the document', shownInPrint.sidebar && shownInPrint.header && shownInPrint.fab)
  log('printing is black on white whatever the theme', shownInPrint.background === 'rgb(255, 255, 255)', shownInPrint.background)
  log(
    'the document itself still prints',
    (await page.evaluate(() => document.body.innerText)).includes('Hello from a PDF'),
  )
  await page.emulateMedia({ media: 'screen' })
  await page.waitForTimeout(200)
}

// --- Sharing ----------------------------------------------------------------
{
  // Sharing needs a configured backend. With none, every path must explain
  // itself rather than break — including the public page for a link that
  // cannot resolve.
  const missing = await page.goto(`${URL}/s/8f14e45f-ceea-467a-9a3f-1b4e0a2c9d77`, {
    waitUntil: 'networkidle',
  })
  const missingBody = await page.evaluate(() => document.body.innerText)
  log('a share link that leads nowhere renders a real page', missing.status() === 200)
  log('and says so, with a way out', missingBody.includes('does not lead anywhere') && missingBody.includes('Open Pad'))

  const malformed = await page.goto(`${URL}/s/not-a-uuid`, { waitUntil: 'networkidle' })
  log('a malformed share link does not error', malformed.status() === 200)

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.locator('[aria-label="Document actions"]').click()
  await page.waitForTimeout(400)
  const menuText = await page.evaluate(() => document.body.innerText)
  log(
    'the document menu offers every action',
    ['Save as PDF', 'Download Markdown', 'Download plain text', 'Share a link', 'Import a PDF'].every(
      (item) => menuText.includes(item),
    ),
  )
  await page.locator('button:has-text("Share a link")').click()
  await page.waitForTimeout(600)
  const explained = await page.evaluate(() => document.body.innerText)
  log('sharing explains why it is unavailable instead of failing', explained.includes('needs an account'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

// --- Projects: merging documents, navigating and searching within one -------
{
  // Its own documents, so this does not depend on anything above it.
  const makeDoc = async (title, body) => {
    await page.locator('button:has-text("New")').first().click()
    await page.waitForTimeout(400)
    await page.locator('[aria-label="Document title"]').click()
    await page.keyboard.type(title)
    await page.waitForTimeout(150)
    await page.keyboard.press('Enter')
    await page.keyboard.type(body)
    await page.waitForTimeout(350)
  }
  await makeDoc('Zeta overview', 'the shape of the launch')
  await makeDoc('Zeta budget', 'numbers for the launch')
  await makeDoc('Zeta timeline', 'dates and milestones')
  await page.waitForTimeout(700)

  /** Drags one sidebar row onto another and drops it. */
  const dragRowOnto = async (fromTitle, toSelector) => {
    const from = page.locator(`nav [data-doc-id]:has-text("${fromTitle}")`).first()
    const to = page.locator(toSelector).first()
    const fb = await from.boundingBox()
    const tb = await to.boundingBox()
    if (!fb || !tb) return false
    await page.mouse.move(fb.x + 60, fb.y + fb.height / 2)
    await page.mouse.down()
    // Past the threshold that separates a drag from a tap.
    await page.mouse.move(fb.x + 70, fb.y + fb.height / 2 + 5, { steps: 3 })
    await page.mouse.move(tb.x + 60, tb.y + tb.height / 2, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(700)
    return true
  }

  await dragRowOnto('Zeta timeline', 'nav [data-doc-id]:has-text("Zeta budget")')
  const projectInput = page.locator('nav [data-project-id] input[aria-label="Project name"]').first()
  const projectName = await projectInput.inputValue().catch(() => null)
  log('dropping one document onto another creates a project', projectName !== null, String(projectName))
  log(
    'the new project is named after the document dropped onto',
    projectName === 'Zeta budget',
    String(projectName),
  )
  log(
    'the project shows how many documents are inside',
    (await page.locator('nav [data-project-id]').first().innerText()).includes('2'),
  )

  // The bar above the open document.
  const barName = await page.locator('main input[aria-label="Project name"]').inputValue().catch(() => null)
  log('a project bar appears above a document in a project', barName !== null, String(barName))
  const chips = await page.locator('main [data-chip]').allInnerTexts().catch(() => [])
  log('the bar lists the documents in the project', chips.length === 2, JSON.stringify(chips))

  const sibling = chips.find((c) => c !== 'Zeta timeline') ?? chips[0]
  await page.locator(`main [data-chip]:has-text("${sibling}")`).first().click()
  await page.waitForTimeout(700)
  log(
    'a chip opens that document',
    (await page.locator('[aria-label="Document title"]').inputValue()) === sibling,
  )

  // Search inside the project.
  await page.locator('[aria-label="Search within this project"]').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.type('timeline')
  await page.waitForTimeout(500)
  log('searching within a project finds a sibling', (await page.locator('main button:has-text("Zeta timeline")').count()) > 0)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  log(
    'Enter opens the top match',
    (await page.locator('[aria-label="Document title"]').inputValue()) === 'Zeta timeline',
  )

  // The search must not reach documents outside the project.
  await page.locator('[aria-label="Search within this project"]').first().click()
  await page.waitForTimeout(350)
  await page.keyboard.type('Zeta overview')
  await page.waitForTimeout(500)
  log(
    'project search is scoped to the project',
    (await page.evaluate(() => document.body.innerText)).includes('Nothing in this project matches'),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Dropping onto the project header adds a document.
  await dragRowOnto('Zeta overview', 'nav [data-project-id]')
  log(
    'dropping onto the project header adds a document to it',
    (await page.locator('nav [data-project-id]').first().innerText()).includes('3'),
  )

  await page.waitForTimeout(600)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log(
    'projects survive a reload',
    (await page
      .locator('nav [data-project-id] input[aria-label="Project name"]')
      .first()
      .inputValue()
      .catch(() => null)) === 'Zeta budget',
  )

  // An ungrouped document must not show the bar at all.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  log(
    'an ungrouped document shows no project bar',
    (await page.locator('main input[aria-label="Project name"]').count()) === 0,
  )
}

// --- Word-style typing ------------------------------------------------------
{
  const blockTexts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
    )
  const blockHtmls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.innerHTML),
    )
  const freshDoc = async () => {
    await page.locator('button:has-text("New")').first().click()
    await page.waitForTimeout(500)
  }

  await freshDoc()
  await page.keyboard.type('hello there. this is next. e.g. not this. 3.5 no')
  await page.waitForTimeout(500)
  const sentence = (await blockTexts())[0] ?? ''
  log('the first letter of a line is capitalised', sentence.startsWith('Hello'), sentence)
  log('the first letter after a full stop is capitalised', sentence.includes('. This is next'))
  log('an abbreviation does not start a new sentence', sentence.includes('. not this'), sentence)
  log('a decimal point is not a sentence end', /3\.5 no$/.test(sentence), sentence)

  await freshDoc()
  await page.keyboard.type('h')
  await page.waitForTimeout(300)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
  log('Backspace undoes an unwanted capital', (await blockTexts())[0] === 'h')

  // A line ending in a colon starts a list.
  await freshDoc()
  await page.keyboard.type('Bring the following:')
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.type('passport')
  await page.waitForTimeout(400)
  const rows = () =>
    page.locator('[data-block-id]').evaluateAll((els) =>
      els.map((e) => ({
        text: e.innerText.trim().toLowerCase(),
        pad: e.style.paddingLeft || '0rem',
        bullet: !!e.querySelector('span[aria-hidden]'),
      })),
    )
  log(
    'a colon then Enter starts a bullet list',
    (await rows()).some((r) => r.bullet && r.text.includes('passport')),
  )

  // Tab indents rather than moving focus.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  await page.keyboard.type('sub item')
  await page.waitForTimeout(400)
  const indented = (await rows()).find((r) => r.text.includes('sub item'))
  log('Tab indents into a sub-list', !!indented && indented.pad !== '0rem', JSON.stringify(indented))
  log('Tab did not move focus out of the editor', (await blockTexts()).some((t) => /sub item/i.test(t ?? '')))
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(400)
  const outdented = (await rows()).find((r) => r.text.includes('sub item'))
  log('Shift+Tab outdents again', !!outdented && outdented.pad === '0rem')

  // Inline autoformat.
  await freshDoc()
  await page.keyboard.type('make this **important** now')
  await page.waitForTimeout(500)
  const bolded = (await blockHtmls())[0] ?? ''
  log('**bold** formats as you type', /<b>important<\/b>/.test(bolded), bolded)
  log('typing continues outside the bold', /<\/b>\s*now/.test(bolded), bolded)
  log('the markers are consumed', !bolded.includes('**'))

  await freshDoc()
  await page.keyboard.type('a *slanted* word and `code` too')
  await page.waitForTimeout(500)
  const mixed = (await blockHtmls())[0] ?? ''
  log('*italic* and `code` format as you type', /<i>slanted<\/i>/.test(mixed) && /<code>code<\/code>/.test(mixed), mixed)
  log('typing continues outside the code span', /<\/code>[^<]*too/.test(mixed), mixed)

  // The caret perch used by `code` must never reach storage.
  await page.waitForTimeout(700)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const stored = (await blockTexts()).join('')
  log('the invisible caret marker is never stored', !stored.includes('​'), JSON.stringify(stored).slice(0, 80))

  // The opening line of a document becomes its heading, once.
  await freshDoc()
  await page.keyboard.type('Quarterly Review')
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  log(
    'the opening line becomes the heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some(
        (e) => e.textContent === 'Quarterly Review' && /text-2xl/.test(e.className),
      ),
    ),
  )
  await page.keyboard.type('And this sentence should stay a paragraph.')
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  log(
    'it happens only once per document',
    (await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-block-id] [contenteditable]')].filter((e) =>
          /text-2xl/.test(e.className),
        ).length,
    )) === 1,
  )
}

// --- Paste keeps its structure ----------------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const el = document.querySelector('[data-block-id] [contenteditable]')
    el.focus()
    const dt = new DataTransfer()
    dt.setData(
      'text/html',
      '<h1>Pasted Title</h1><p>First para with <b>bold</b>.</p><ul><li>one</li><li>two</li></ul><p>Last line.</p>',
    )
    dt.setData('text/plain', 'Pasted Title\nFirst para with bold.\none\ntwo\nLast line.')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(900)

  const pasted = await page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
  )
  // This used to arrive as one enormous line with the newlines turned to spaces.
  log('a multi-paragraph paste becomes one block per paragraph', pasted.length >= 5, `${pasted.length} blocks`)
  log('nothing is lost in the paste', pasted.join(' ').includes('Pasted Title') && pasted.join(' ').includes('Last line.'))
  log(
    'a pasted heading is still a heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        /text-2xl|text-xl/.test(e.className),
      ),
    ),
  )
  log(
    'pasted inline formatting survives',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        /<b>bold<\/b>/.test(e.innerHTML),
      ),
    ),
  )

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const el = document.querySelector('[data-block-id] [contenteditable]')
    el.focus()
    const dt = new DataTransfer()
    dt.setData('text/plain', '- alpha\n- beta\n  - gamma')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(800)
  const bullets = await page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
  )
  log(
    'a plain-text list pastes as bullets',
    bullets.filter((t) => /alpha|beta|gamma/.test(t ?? '')).length === 3,
    JSON.stringify(bullets),
  )
}

// --- Trash ------------------------------------------------------------------
{
  const openTrash = async () => {
    const toggle = page.locator('aside button[aria-expanded]').filter({ hasText: 'Trash' }).first()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await page.waitForTimeout(500)
  }

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(400)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type('Disposable')
  await page.waitForTimeout(600)

  await page.locator('nav [data-doc-id]:has-text("Disposable")').first().hover()
  await page.waitForTimeout(250)
  await page.locator('nav [data-doc-id]:has-text("Disposable") [aria-label^="Delete"]').first().click()
  await page.waitForTimeout(800)
  log('deleting removes it from the list', (await page.locator('nav [data-doc-id]:has-text("Disposable")').count()) === 0)
  log('and the trash appears', (await page.locator('button:has-text("Trash")').count()) > 0)

  await openTrash()
  log(
    'the trash says when it will go',
    /Deletes in 7 days/.test(await page.evaluate(() => document.body.innerText)),
  )

  await page.locator('[aria-label^="Restore Disposable"]').first().click()
  await page.waitForTimeout(800)
  log('restoring puts it back', (await page.locator('nav [data-doc-id]:has-text("Disposable")').count()) > 0)

  await page.locator('nav [data-doc-id]:has-text("Disposable")').first().hover()
  await page.waitForTimeout(250)
  await page.locator('nav [data-doc-id]:has-text("Disposable") [aria-label^="Delete"]').first().click()
  await page.waitForTimeout(700)
  await openTrash()
  await page.locator('[aria-label*="permanently"]').first().click()
  await page.waitForTimeout(400)
  log(
    'permanent deletion asks first',
    (await page.evaluate(() => document.body.innerText)).includes('Delete for good?'),
  )
  await page.locator('button:has-text("Delete")').last().click()
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  log(
    'a permanently deleted document does not come back',
    !(await page.evaluate(() => document.body.innerText)).includes('Disposable'),
  )
}

// Manifest + service worker, the installable part.
const manifest = await page.evaluate(async () => {
  const r = await fetch('/manifest.webmanifest')
  return r.ok ? await r.json() : null
})
log('web manifest serves', !!manifest && manifest.name?.includes('Pad'))
const swRegistered = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations()
  return regs.length > 0
})
log('service worker registers', swRegistered)

log('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`)
  process.exit(1)
}
