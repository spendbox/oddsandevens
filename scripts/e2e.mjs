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

/**
 * The folder control is a dropdown in the header now rather than a strip of
 * the folder's other documents above the page, so everything about a folder
 * goes through opening it first.
 */
const openFolderMenu = async () => {
  const button = page.locator('header [aria-label^="Folder:"]').first()
  if ((await button.count()) === 0) return false
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  await page.waitForTimeout(350)
  return true
}
const closeFolderMenu = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
/** The open document's folder name, or null when it is in no folder. */
const folderName = async () => {
  if (!(await openFolderMenu())) return null
  const value = await page
    .locator('[role="menu"][aria-label="Folder"] input[aria-label="Folder name"]')
    .inputValue()
    .catch(() => null)
  await closeFolderMenu()
  return value
}
/** Opens the toolbar's More menu, where alignment and text size now live. */
const openMore = async () => {
  await page.locator('[aria-label="More formatting"]').first().click()
  await page.waitForTimeout(300)
}
/** Chooses a paragraph style from the toolbar's style menu. */
const pickStyle = async (label) => {
  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Paragraph style"]').click()
  await page.waitForTimeout(300)
  await page.locator(`[role="menu"] [role="menuitem"]:has-text("${label}")`).first().click()
  await page.waitForTimeout(450)
}

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
    (b) => b.innerText.trim() === 'Budget' && b.querySelector('[contenteditable]')?.className.includes('pad-h1'),
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

// Search on a phone. It reaches the header directly, because the sidebar is
// a drawer there and a search that starts with "open the menu" is one people
// stop using.
await mobile.locator('[aria-label="Search"]').first().click()
await mobile.waitForTimeout(500)
const sheet = await mobile.locator('[role="dialog"][aria-label="Search"]').boundingBox()
log(
  'search fills the screen on a phone, above the keyboard',
  !!sheet && sheet.width >= 380 && sheet.height >= 700,
  sheet ? `${Math.round(sheet.width)}x${Math.round(sheet.height)}` : 'missing',
)
await mobile.locator('input[aria-label="Search everything"]').fill('invoice')
await mobile.waitForTimeout(500)
await mobile.screenshot({ path: `${SHOTS}/11b-mobile-search.png` })
log(
  'a phone search finds the same thing a desktop one does',
  (await mobile.locator('[role="dialog"][aria-label="Search"] button[data-active]').count()) >= 1,
)
const insideViewport = await mobile.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"][aria-label="Search"]')
  return !dialog || dialog.getBoundingClientRect().right <= window.innerWidth + 1
})
log('nothing in the search sheet runs off the side', insideViewport)
await mobile.keyboard.press('Escape')
await mobile.waitForTimeout(300)

// The library, reached through the drawer.
await mobile.locator('[aria-label="Open menu"]').first().click()
await mobile.waitForTimeout(500)
await mobile.locator('button:has-text("Library")').first().click()
await mobile.waitForTimeout(500)
const libraryBox = await mobile.locator('[role="dialog"][aria-label="Library"]').boundingBox()
log(
  'the library opens full screen on a phone',
  !!libraryBox && libraryBox.width >= 380,
  libraryBox ? `${Math.round(libraryBox.width)}x${Math.round(libraryBox.height)}` : 'missing',
)
await mobile.screenshot({ path: `${SHOTS}/11c-mobile-library.png` })
await mobile.keyboard.press('Escape')
await mobile.waitForTimeout(400)

/*
  The parts of the redesign that only a phone can fail.

  A 390-pixel screen is where a toolbar wraps to a second row, where a header
  with four labelled buttons becomes two lines, and where a keyboard shortcut
  is not a way to reach anything at all.
*/
{
  const bar = mobile.locator('[role="toolbar"][aria-label="Formatting"]')
  const barBox = await bar.boundingBox()
  log(
    'the toolbar stays one row on a phone',
    !!barBox && barBox.height < 56,
    barBox ? `${Math.round(barBox.height)}px tall` : 'missing',
  )
  log(
    'the toolbar does not run off the side',
    await mobile.evaluate(() => {
      const el = document.querySelector('[role="toolbar"][aria-label="Formatting"]')
      return !el || el.scrollWidth <= el.clientWidth + 1
    }),
  )

  // The home screen, which covers the document completely on a phone.
  await mobile.locator('header [aria-label="Home"]').first().click()
  await mobile.waitForTimeout(700)
  const home = mobile.locator('[role="dialog"][aria-label="Home"]')
  const homeBox = await home.boundingBox()
  log(
    'the home screen fits a phone',
    !!homeBox && homeBox.width <= 391,
    homeBox ? `${Math.round(homeBox.width)}px wide` : 'missing',
  )
  log(
    'nothing on the home screen runs off the side',
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  )
  const headerRows = await mobile.evaluate(() => {
    const head = document.querySelector('[role="dialog"][aria-label="Home"] header')
    return head ? Math.round(head.getBoundingClientRect().height) : 0
  })
  log('its header is one row, not two', headerRows > 0 && headerRows < 64, `${headerRows}px tall`)
  log(
    'the way back out is a full-sized target',
    await mobile.evaluate(() => {
      const el = document.querySelector('[aria-label="Back to the document"]')
      if (!el) return false
      const box = el.getBoundingClientRect()
      return box.width >= 32 && box.height >= 32
    }),
  )
  await mobile.screenshot({ path: `${SHOTS}/11d-mobile-home.png` })
  await mobile.locator('[aria-label="Back to the document"]').click()
  await mobile.waitForTimeout(500)
}

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

// --- Moving a paragraph, the way a word processor does it ------------------
{
  const texts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].map((e) => e.textContent),
    )
  const before = await texts()
  const blocks = page.locator('[data-block-id] [contenteditable]')
  const count = await blocks.count()
  if (count >= 2 && before.length >= 2) {
    await blocks.nth(count - 1).click()
    await page.waitForTimeout(200)
    await page.keyboard.press('Alt+ArrowUp')
    await page.waitForTimeout(400)
    const after = await texts()
    log(
      'Alt+Up moves a paragraph up, with no drag handle in the margin',
      JSON.stringify(before) !== JSON.stringify(after),
    )
  } else {
    log('Alt+Up moves a paragraph up, with no drag handle in the margin', false, 'not enough blocks')
  }
  log(
    'the Notion-style gutter handles are gone',
    (await page.locator('[aria-label^="Drag to reorder"]').count()) === 0 &&
      (await page.locator('[aria-label="Insert block below"]').count()) === 0,
  )
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
    'a formatting bar appears over a selection',
    await page
      .locator('[role="toolbar"][aria-label="Selection formatting"]')
      .isVisible()
      .catch(() => false),
  )

  await page.keyboard.press('Control+b')
  await page.waitForTimeout(400)
  log('Ctrl+B applies bold', /<(b|strong)>bold<\/(b|strong)>/.test(await target.innerHTML()))

  await selectWord('here')
  await page.waitForTimeout(300)
  await page
    .locator('[role="toolbar"][aria-label="Selection formatting"] [aria-label="Italic"]')
    .click({ force: true })
  await page.waitForTimeout(400)
  log('the toolbar applies italic', /<(i|em)>here<\/(i|em)>/.test(await target.innerHTML()))

  await selectWord('word')
  await page.waitForTimeout(300)
  await page
    .locator('[role="toolbar"][aria-label="Selection formatting"] [aria-label="Inline code"]')
    .click({ force: true })
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
      toolbar: hidden('[role="toolbar"][aria-label="Formatting"]'),
      background: getComputedStyle(document.body).backgroundColor,
    }
  })
  log('printing hides the app and leaves the document', shownInPrint.sidebar && shownInPrint.header && shownInPrint.toolbar)
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

// --- Folders: grouping documents, navigating and searching within one ------
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
  await page.waitForTimeout(900)

  /**
   * Opens a sidebar row's own menu.
   *
   * Grouping used to be a drag from one row onto another, which needed the
   * whole project tree in the sidebar to drag between. The tree has gone, so
   * every folder action lives in this menu — which also means it works with a
   * thumb, where a drag never did.
   */
  const rowMenu = async (title) => {
    const row = page.locator(`nav [data-doc-id]:has-text("${title}")`).first()
    await row.scrollIntoViewIfNeeded()
    await row.hover()
    await page.waitForTimeout(200)
    await row.locator('[aria-label^="Actions for"]').first().click()
    await page.waitForTimeout(350)
  }
  /** Moves a document into a named folder from its sidebar row. */
  const fileInto = async (title, folder) => {
    await rowMenu(title)
    await page.locator(`[role="menu"] [role="menuitem"]:has-text("${folder}")`).first().click()
    await page.waitForTimeout(900)
  }

  await rowMenu('Zeta timeline')
  await page.locator('[role="menu"] [role="menuitem"]:has-text("New folder")').first().click()
  await page.waitForTimeout(900)

  log('a row menu makes a folder from a document', (await folderName()) === 'Zeta timeline', String(await folderName()))
  log(
    'the folder is a dropdown in the header, not a strip of files above the page',
    (await page.locator('header [aria-label^="Folder:"]').count()) === 1 &&
      (await page.locator('[data-chip]').count()) === 0,
  )

  await fileInto('Zeta budget', 'Zeta timeline')

  await openFolderMenu()
  const chips = await page.locator('[data-chip]').allInnerTexts()
  log('the dropdown lists the documents in the folder', chips.length === 2, JSON.stringify(chips))
  log(
    'and offers to move this document somewhere else',
    /move this document/i.test(await page.locator('[role="menu"][aria-label="Folder"]').innerText()),
  )

  // Opening a sibling from the dropdown.
  await page.locator('[data-chip]:has-text("Zeta budget")').first().click()
  await page.waitForTimeout(800)
  log(
    'a row in the dropdown opens that document',
    (await page.locator('[aria-label="Document title"]').inputValue()) === 'Zeta budget',
  )

  // Search inside the folder.
  await openFolderMenu()
  await page.locator('[aria-label="Search within this project"]').first().click()
  await page.waitForTimeout(300)
  await page.keyboard.type('timeline')
  await page.waitForTimeout(500)
  log(
    'searching within a folder narrows it to the match',
    (await page.locator('[role="menu"][aria-label="Folder"] [data-chip]').count()) === 1,
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  log(
    'Enter opens the top match',
    (await page.locator('[aria-label="Document title"]').inputValue()) === 'Zeta timeline',
  )

  // The search must not reach documents outside the folder.
  await openFolderMenu()
  await page.locator('[aria-label="Search within this project"]').first().click()
  await page.waitForTimeout(300)
  await page.keyboard.type('Zeta overview')
  await page.waitForTimeout(500)
  log(
    'folder search is scoped to the folder',
    (await page.evaluate(() => document.body.innerText)).includes('Nothing in this project matches'),
  )
  await closeFolderMenu()

  // A third document, so taking one out does not dissolve the folder.
  await fileInto('Zeta overview', 'Zeta timeline')
  await openFolderMenu()
  log('a folder takes as many documents as you put in it', (await page.locator('[data-chip]').count()) === 3)

  // Moving the open document out, from the same menu it navigates with.
  await page
    .locator('[role="menu"][aria-label="Folder"] [role="menuitem"]:has-text("Take out of this folder")')
    .click()
  await page.waitForTimeout(900)
  log('a document leaves its folder from the same dropdown', (await folderName()) === null)
  log(
    'and the folder button goes with it',
    (await page.locator('header [aria-label^="Folder:"]').count()) === 0,
  )

  // Filing it again, this time from the document's own menu — which is the
  // only route a document with no folder has.
  await page.locator('[aria-label="Document actions"]').click()
  await page.waitForTimeout(400)
  log(
    'a document with no folder can still be filed from its own menu',
    /move to folder/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.locator('[role="menuitem"]:has-text("Zeta timeline")').first().click()
  await page.waitForTimeout(900)
  log('moving from the document menu works', (await folderName()) === 'Zeta timeline')

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  log('folders survive a reload', (await folderName()) === 'Zeta timeline')

  // An ungrouped document must not show the folder button at all.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)
  log(
    'an ungrouped document shows no folder button',
    (await page.locator('header [aria-label^="Folder:"]').count()) === 0,
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
        (e) => e.textContent === 'Quarterly Review' && /pad-h1/.test(e.className),
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
          /pad-h1/.test(e.className),
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
        /pad-h1|pad-h2/.test(e.className),
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

// --- Home screen, favourites and the trash ---------------------------------
{
  const openHome = async () => {
    await page.locator('header [aria-label="Home"]').first().click()
    await page.waitForTimeout(600)
  }
  const closeHome = async () => {
    await page
      .locator('[role="dialog"][aria-label="Home"] [aria-label="Back to the document"]')
      .click()
    await page.waitForTimeout(500)
  }
  /** Deletes a document from its row menu, which is where every action is now. */
  const deleteRow = async (title) => {
    const row = page.locator(`nav [data-doc-id]:has-text("${title}")`).first()
    await row.hover()
    await page.waitForTimeout(200)
    await row.locator('[aria-label^="Actions for"]').first().click()
    await page.waitForTimeout(350)
    await page.locator('[role="menu"] button:has-text("Delete")').first().click()
    await page.waitForTimeout(800)
  }

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type('Disposable')
  await page.waitForTimeout(700)

  // The home screen: the open document large, and the rest as small cards.
  await openHome()
  const homeUp = await page.locator('[role="dialog"][aria-label="Home"]').isVisible()
  log('the home screen fills the window', homeUp)
  const homeText = await page.locator('[role="dialog"][aria-label="Home"]').innerText()
  log('it leads with the document being worked on', /Carry on with/i.test(homeText) && homeText.includes('Disposable'))
  log('and lists what was open recently', /Recent/i.test(homeText))
  await page.screenshot({ path: `${SHOTS}/21-home.png` })
  await closeHome()

  // Favourites.
  const star = page
    .locator('nav [data-doc-id]:has-text("Disposable") [aria-label^="Add Disposable to favourites"]')
    .first()
  await page.locator('nav [data-doc-id]:has-text("Disposable")').first().hover()
  await page.waitForTimeout(250)
  await star.click()
  await page.waitForTimeout(700)
  log(
    'starring a document puts it under Favourites',
    (await page.locator('nav').innerText()).includes('FAVOURITES') ||
      (await page.locator('nav').innerText()).toLowerCase().includes('favourites'),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  log(
    'a favourite survives a reload',
    (await page.locator('nav').innerText()).toLowerCase().includes('favourites'),
  )

  // Deleting, and the trash on the home screen.
  await deleteRow('Disposable')
  log(
    'deleting removes it from the sidebar',
    (await page.locator('nav [data-doc-id]:has-text("Disposable")').count()) === 0,
  )

  const openTrash = async () => {
    await openHome()
    const toggle = page
      .locator('[role="dialog"][aria-label="Home"] button[aria-expanded]')
      .filter({ hasText: 'Trash' })
      .first()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await page.waitForTimeout(500)
  }

  await openTrash()
  log('the trash lives on the home screen', (await page.locator('[role="dialog"][aria-label="Home"] button:has-text("Trash")').count()) > 0)
  log(
    'the trash says when it will go',
    /Deletes in 7 days/.test(await page.evaluate(() => document.body.innerText)),
  )

  await page.locator('[aria-label^="Restore Disposable"]').first().click()
  await page.waitForTimeout(800)
  await closeHome()
  log(
    'restoring puts it back',
    (await page.locator('nav [data-doc-id]:has-text("Disposable")').count()) > 0,
  )

  await deleteRow('Disposable')
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
  await page.waitForTimeout(1100)
  log(
    'a permanently deleted document does not come back',
    !(await page.evaluate(() => document.body.innerText)).includes('Disposable'),
  )
}

/*
  The Library: a pile of badly named files in, titled documents out.

  The first run has no key configured, which is the path most people are on
  and the one that has to work on its own: titles come from the contents.
*/
{
  const tenancy = join(FIXTURES, 'scan_0012.txt')
  writeFileSync(
    tenancy,
    'TENANCY AGREEMENT\n\nThis agreement is made between the landlord and the tenant for the flat at 14 Bourdillon Road, and runs for twelve months from March.\n',
  )
  const receipt = join(FIXTURES, 'IMG_20240211.txt')
  writeFileSync(
    receipt,
    'Receipt for printing\n\nPaid forty thousand naira to the printer for the March run of brochures.\n',
  )
  const named = join(FIXTURES, 'Lagos budget 2026.txt')
  writeFileSync(named, 'Figures for the year, by quarter. Nothing is agreed yet.\n')

  await page.locator('button:has-text("Library")').first().click()
  await page.waitForTimeout(500)
  log('the library opens from the sidebar', await page.locator('[role="dialog"][aria-label="Library"]').isVisible())

  await page.locator('input[aria-label="Choose documents"]').setInputFiles([tenancy, receipt, named])
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/17-library.png` })

  const titles = await page
    .locator('[role="dialog"][aria-label="Library"] input[aria-label^="Title"]')
    .evaluateAll((els) => els.map((el) => el.value))
  log('every dropped file is listed for review', titles.length === 3, JSON.stringify(titles))
  log(
    'a file called scan_0012 is titled from what is inside it',
    /tenancy/i.test(titles[0] ?? ''),
    titles[0],
  )
  log(
    'a file somebody named keeps its name',
    /lagos budget/i.test(titles[2] ?? ''),
    titles[2],
  )
  log(
    'each one says what it covers',
    (await page.locator('[role="dialog"][aria-label="Library"]').innerText()).includes('Bourdillon'),
  )

  // Nothing is added until it is asked for.
  await page.locator('[role="dialog"][aria-label="Library"] button:has-text("Add 3")').click()
  await page.waitForTimeout(1200)
  log(
    'adding the batch opens the first of them as an ordinary document',
    /tenancy/i.test(await page.locator('[aria-label="Document title"]').inputValue()),
    await page.locator('[aria-label="Document title"]').inputValue(),
  )
  log(
    'the contents came through, not just the title',
    (await page.evaluate(() => document.body.innerText)).includes('Bourdillon Road'),
  )
  await page.screenshot({ path: `${SHOTS}/18-library-added.png` })

  // The Library is no longer a one-way door: everything already in the
  // collection is listed in it, and searchable there.
  await page.locator('button:has-text("Library")').first().click()
  await page.waitForTimeout(600)
  const shelf = page.locator('[role="dialog"][aria-label="Library"]')
  log(
    'the library lists every document, not just new ones',
    (await shelf.locator('button:has-text("Bourdillon")').count()) > 0,
  )
  log(
    'and lists them under the folder they are in',
    /no folder/i.test(await shelf.innerText()),
    (await shelf.innerText()).split('\n').slice(0, 6).join(' / '),
  )
  await shelf.locator('input[aria-label="Search the library"]').fill('Bourdillon')
  await page.waitForTimeout(700)
  const found = await shelf.innerText()
  log('searching the library looks inside the documents', /found \d/i.test(found))
  await shelf.locator('input[aria-label="Search the library"]').fill('')
  await page.waitForTimeout(400)
  await shelf.locator('button:has-text("Bourdillon")').first().click()
  await page.waitForTimeout(900)
  log(
    'a document in the library opens from it',
    (await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id]')].map((e) => e.innerText).join(' '),
    )).includes('Bourdillon'),
  )
  await page.screenshot({ path: `${SHOTS}/22-library-shelf.png` })

  // And they are searchable like anything else, which is the whole point of
  // not giving the library a store of its own.
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  await page.locator('input[aria-label="Search everything"]').fill('Bourdillon')
  await page.waitForTimeout(500)
  log(
    'an imported document is searchable like the rest',
    (await page.locator('[role="dialog"][aria-label="Search"] button[data-active]').count()) >= 1,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/*
  The second run stubs the filing model, to check the two things only it can
  do: better titles than a first line, and putting documents that share a
  subject into a project.
*/
{
  await page.route('**/api/ai', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true }) })
    }
    const body = request.postDataJSON()
    if (body.action !== 'file') return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: JSON.stringify([
          { n: 1, title: 'Tenancy agreement, Bourdillon Road', summary: 'A twelve month lease.', topic: 'property' },
          { n: 2, title: 'Deed of assignment', summary: 'Transfer of the same flat.', topic: 'property' },
        ]),
      }),
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const one = join(FIXTURES, 'scan_0044.txt')
  writeFileSync(one, 'Some agreement about a flat, poorly scanned.\n')
  const two = join(FIXTURES, 'scan_0045.txt')
  writeFileSync(two, 'Another document about the same flat.\n')

  await page.locator('button:has-text("Library")').first().click()
  await page.waitForTimeout(500)
  await page.locator('input[aria-label="Choose documents"]').setInputFiles([one, two])
  await page.waitForTimeout(2500)
  const panel = page.locator('[role="dialog"][aria-label="Library"]')
  // Titles are inputs, so they are read as values — innerText cannot see them.
  const filedTitles = await panel
    .locator('input[aria-label^="Title"]')
    .evaluateAll((els) => els.map((el) => el.value))
  log(
    'a better title replaces the one worked out on the device',
    filedTitles.includes('Deed of assignment'),
    JSON.stringify(filedTitles),
  )
  log(
    'documents about the same thing are offered as a project',
    (await panel.innerText()).includes('Property'),
  )
  await page.screenshot({ path: `${SHOTS}/19-library-filed.png` })

  await panel.locator('button:has-text("Add 2")').click()
  await page.waitForTimeout(1400)
  // The folder now shows as the bar above the document that was opened, and
  // as a named section in the sidebar — the sidebar tree it used to be read
  // from has gone.
  await page.waitForTimeout(600)
  const filedInto = await folderName()
  log('the folder is made', (filedInto ?? '').toLowerCase().includes('propert'), String(filedInto))
  await openFolderMenu()
  const inFolder = await page.locator('[data-chip]').count()
  await closeFolderMenu()
  log('and both documents are in it', inFolder === 2, `${inFolder} in the folder`)
  await page.screenshot({ path: `${SHOTS}/20-library-folder.png` })
}

// --- The toolbar above the page --------------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.keyboard.type('Alignment and weight both belong to the paragraph.')
  await page.waitForTimeout(400)

  const para = page.locator('[data-block-id] [contenteditable]', { hasText: 'belong to the' }).first()

  log('the toolbar is always on screen, not only on hover', await page.locator('[role="toolbar"][aria-label="Formatting"]').isVisible())
  log(
    'the style control is not an operating-system dropdown',
    (await page.locator('[role="toolbar"][aria-label="Formatting"] select').count()) === 0,
  )
  log(
    'the toolbar is one row, not two',
    await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"][aria-label="Formatting"]')
      return !!bar && bar.getBoundingClientRect().height < 56
    }),
  )

  // Bold from the toolbar, over a selected word.
  await para.evaluate((el) => {
    const node = el.firstChild
    const at = (el.textContent ?? '').indexOf('weight')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 6)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.waitForTimeout(250)
  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Bold"]').first().click()
  await page.waitForTimeout(400)
  log('the toolbar applies bold', /<(b|strong)>weight<\/(b|strong)>/.test(await para.innerHTML()))

  // Underline, which a word processor has and a block editor usually does not.
  await para.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode()
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 9)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.waitForTimeout(250)
  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Underline"]').first().click()
  await page.waitForTimeout(400)
  log('underline is available and survives the sanitiser', /<u>/.test(await para.innerHTML()), await para.innerHTML())

  // The style menu, which is the word-processor way to make a heading.
  await para.click()
  await page.waitForTimeout(250)
  await pickStyle('Heading 2')
  log(
    'the style menu turns a paragraph into a heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        /pad-h2/.test(e.className),
      ),
    ),
  )
  await pickStyle('Normal text')

  // Alignment, which is a property of the paragraph and not of the text in it.
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.waitForTimeout(200)
  await openMore()
  await page.locator('[aria-label="Align centre"]').first().click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  log(
    'the toolbar centres a paragraph',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        /pad-align-center/.test(e.className),
      ),
    ),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log(
    'alignment survives a reload',
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')].some((e) =>
        /pad-align-center/.test(e.className),
      ),
    ),
  )
  await page.screenshot({ path: `${SHOTS}/23-toolbar.png` })
}

// --- The size of the type ---------------------------------------------------
{
  const size = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-block-id] [contenteditable]')
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0
    })
  const start = await size()
  log('body text is set large enough to read', start >= 17, `${start}px`)

  await openMore()
  await page.locator('[aria-label="Large text"]').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const bigger = await size()
  log('the toolbar makes the type bigger', bigger > start, `${start}px → ${bigger}px`)

  const headingScaled = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return root.getPropertyValue('--doc-text').trim().length > 0
  })
  log('the whole typographic scale moves together, not just paragraphs', headingScaled)

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log('the chosen size survives a reload', (await size()) === bigger)
  await openMore()
  await page.locator('[aria-label="Medium text"]').first().click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

// --- Tasks found in what somebody wrote -------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.keyboard.type('Met the agent this morning and went through the flat.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('I need to call the landlord about the boiler by Friday')
  // The scan waits for a pause, so it does not appear halfway through a word.
  await page.waitForTimeout(2200)

  const strip = await page.evaluate(() => document.body.innerText)
  log('lines that read like tasks are noticed', /look like things to do|looks like something to do/i.test(strip))

  await page.locator('button:has-text("Have a look")').first().click()
  await page.waitForTimeout(500)
  const review = await page.evaluate(() => document.body.innerText)
  log('the suggestion drops the lead-in', review.includes('Call the landlord about the boiler'))
  log('a date in the line is carried across for a calendar', /by Friday/.test(review))
  log('it says where the task will live', /calendar is not connected|stay in this document/i.test(review))
  await page.screenshot({ path: `${SHOTS}/24-tasks-found.png` })

  const before = await page.locator('[data-block-id] input[type="checkbox"]').count()
  await page.locator('button:has-text("Make 1 task")').first().click()
  await page.waitForTimeout(900)
  log(
    'confirming turns the line into a real task',
    (await page.locator('[data-block-id] input[type="checkbox"]').count()) > before,
    `${before} → ${await page.locator('[data-block-id] input[type="checkbox"]').count()}`,
  )
  log(
    'and it says the calendar is still to come',
    /calendar/i.test(await page.evaluate(() => document.body.innerText)),
  )

  // Nothing is offered for a document with no actions in it.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.keyboard.type('The weather was pleasant and the coffee was good.')
  await page.waitForTimeout(2200)
  log(
    'ordinary prose is left alone',
    !/look like things to do/i.test(await page.evaluate(() => document.body.innerText)),
  )
}

// --- Writing help, at the caret ---------------------------------------------
{
  // Stubbed, because the real route needs a key and this is about the
  // interface around it: where it opens, what it says, and that it changes
  // nothing until it is told to.
  await page.route('**/api/ai', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true }),
      })
    }
    const body = request.postDataJSON()
    if (body.action === 'file') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: `Expanded: ${String(body.text).slice(0, 40)}` }),
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.keyboard.type('The boiler is old and the landlord keeps putting it off.')
  await page.waitForTimeout(400)

  log(
    'the floating sparkle button is gone',
    (await page.locator('button[aria-label="Writing help"].fixed').count()) === 0,
  )

  await page.keyboard.press('Control+j')
  await page.waitForTimeout(600)
  const popup = page.locator('[role="dialog"][aria-label="Writing help"]')
  log('Ctrl+J opens writing help at the caret', await popup.isVisible())

  const box = await popup.boundingBox()
  const caretBlock = await page
    .locator('[data-block-id] [contenteditable]', { hasText: 'boiler is old' })
    .first()
    .boundingBox()
  log(
    'it opens next to the line being written, not in a corner',
    !!box && !!caretBlock && Math.abs(box.y - caretBlock.y) < 400,
  )
  log('it says what it will act on', /paragraph|Selection/i.test(await popup.innerText()))
  log('expanding is the first thing it offers', (await popup.locator('button:has-text("Expand")').count()) > 0)
  await page.screenshot({ path: `${SHOTS}/25-writing-help.png` })

  await popup.locator('button:has-text("Expand")').first().click()
  await page.waitForTimeout(900)
  log('a result is shown before anything changes', /Nothing has changed yet/.test(await popup.innerText()))
  const blocksNow = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')]
        .map((e) => e.textContent)
        .join(' '),
    )
  log('and the document is untouched until it is applied', !(await blocksNow()).includes('Expanded:'))

  await popup.locator('button:has-text("Insert below")').click()
  await page.waitForTimeout(900)
  log(
    'inserting puts it in the document',
    (await page.evaluate(() =>
      [...document.querySelectorAll('[data-block-id] [contenteditable]')]
        .map((e) => e.textContent)
        .join(' '),
    )).includes('Expanded:'),
  )

  // On a phone there is no Ctrl+J, so it has to be a button — on the toolbar,
  // and on the bar that appears over a selection.
  {
    const touch = await ctx.newPage()
    // Routes are per page, so the stub has to be installed on this one too.
    await touch.route('**/api/ai', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: true }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Expanded on a phone.' }),
      })
    })
    await touch.setViewportSize({ width: 390, height: 844 })
    await touch.goto(URL, { waitUntil: 'networkidle' })
    await touch.waitForTimeout(1000)
    log(
      'Ask is on the toolbar at phone width',
      await touch.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Writing help"]').isVisible(),
    )
    await touch.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Writing help"]').click()
    await touch.waitForTimeout(700)
    log(
      'and opens writing help without a keyboard',
      await touch.locator('[role="dialog"][aria-label="Writing help"]').isVisible(),
    )
    const sheet = await touch.locator('[role="dialog"][aria-label="Writing help"]').boundingBox()
    log(
      'which sits as a sheet along the bottom, above the keyboard',
      !!sheet && sheet.width >= 370 && sheet.y > 100,
      sheet ? `${Math.round(sheet.width)}x${Math.round(sheet.height)} at y=${Math.round(sheet.y)}` : 'missing',
    )
    await touch.screenshot({ path: `${SHOTS}/26-mobile-ask.png` })
    await touch.close()
  }

  // "++" is the same door, for people who never learn a shortcut.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[data-block-id] [contenteditable]').first().click()
  await page.keyboard.type('A short note++')
  await page.waitForTimeout(700)
  log('typing ++ opens it too', await popup.isVisible())
  const leftBehind = await page.evaluate(() =>
    [...document.querySelectorAll('[data-block-id] [contenteditable]')]
      .map((e) => e.textContent)
      .join(' '),
  )
  log('and the ++ is consumed rather than left in the text', !leftBehind.includes('++'), leftBehind)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.unroute('**/api/ai')
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
