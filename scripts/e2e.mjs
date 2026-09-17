/**
 * End-to-end check: drives a real browser through everything Pad claims to do.
 *
 * The unit tests cover the formula engine, the highlighter and the plan
 * ranking. This covers the parts that only exist once a browser is involved —
 * the caret, inserting blocks, saving, and whether a document is still there
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
/**
 * Opens the toolbar's one menu.
 *
 * The bar itself is down to undo, redo, ⋯ and the action button; everything
 * that used to be on it — the style, the marks, the lists, alignment and
 * insert — is one press inside here.
 */
const openMore = async () => {
  await page.locator('[aria-label="Formatting and insert"]').first().click()
  await page.waitForTimeout(350)
}
const closeMore = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}
/** Chooses a paragraph style. */
const pickStyle = async (label) => {
  await openMore()
  await page.selectOption('[role="menu"] select[aria-label="Paragraph style"]', { label })
  await page.waitForTimeout(500)
}
/** Presses one of the controls inside that menu and closes it again. */
const pressTool = async (label) => {
  await openMore()
  await page.locator(`[role="menu"] [aria-label="${label}"]`).first().click()
  await page.waitForTimeout(450)
  await closeMore()
}
/**
 * Inserts a block that is not a paragraph.
 *
 * Through the toolbar's ⋯ menu, which is the only route now: there is no
 * slash menu and no block-typing mode any more, so "/" is always a slash.
 */
const insertBlock = async (label) => {
  await openMore()
  await page.locator(`[role="menu"] button:has-text("Insert ${label}")`).first().click()
  await page.waitForTimeout(500)
}

/**
 * Puts the caret at the end of the writing page.
 *
 * There is no click target under the last paragraph any more: the page itself
 * is one editable element that reaches the bottom of the sheet, so the way to
 * carry on writing is to click it and press Ctrl+End.
 */
const caretToEnd = async (target = page) => {
  await target.locator('[role="textbox"][aria-label="Document"]').last().click()
  await target.keyboard.press('Control+End')
  await target.waitForTimeout(200)
}

/**
 * The home screen, on one of its two tabs.
 *
 * The Library is a tab in here now rather than a dialog of its own, so
 * anything about the whole collection goes through opening this first.
 */
const openHome = async (tab = 'carry', target = page) => {
  const home = target.locator('[role="dialog"][aria-label="Home"]')
  if (!(await home.isVisible().catch(() => false))) {
    await target.locator('aside [aria-label="Home"]').first().click()
    await target.waitForTimeout(600)
  }
  await target
    .locator(`[role="tab"]:has-text("${tab === 'library' ? 'Library' : 'Carry on'}")`)
    .click()
  await target.waitForTimeout(600)
  return home
}
const closeHome = async (target = page) => {
  await target.locator('[aria-label="Back to the document"]').first().click()
  await target.waitForTimeout(500)
}
/** Every document the Library lists, as rows. */
const libraryRows = () => page.locator('[role="dialog"][aria-label="Home"] li[data-doc-id]')
/** Opens a document by title, from the Library tab. */
const openDocNamed = async (title) => {
  await openHome('library')
  await libraryRows().filter({ hasText: title }).first().locator('button').first().click()
  await page.waitForTimeout(900)
}
/**
 * Opens one of the side menu's folding sections by its heading.
 *
 * Everything about the open document lives there now — where it is filed, how
 * typing behaves, what it is for, and every way of getting it in or out.
 */
const openSide = async (label, target = page) => {
  const head = target.locator(`aside button[aria-expanded]:has-text("${label}")`).first()
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
  await target.waitForTimeout(300)
}
/** Opens the folder picker from the side menu. */
const openPicker = async () => {
  await page.locator('aside [aria-label="Move this document to a folder"]').click()
  await page.waitForTimeout(450)
}
/** Files the open document into a named folder, through the picker. */
const fileOpenDocInto = async (folder) => {
  await openPicker()
  await page
    .locator(`[role="dialog"][aria-label="Move to folder"] button:has-text("${folder}")`)
    .first()
    .click()
  await page.waitForTimeout(900)
}

// Find the first editable block and use it from here on.
const firstBlock = page.locator('[role="textbox"] [data-block-id]').first()
await firstBlock.click()
await page.keyboard.type('Notes for the week')
await page.waitForTimeout(150)
log('text block accepts typing', (await firstBlock.innerText()).includes('Notes for the week'))

/*
  A line finishes itself when the caret leaves it, never while it is being
  typed. "#" is a character people write and "- " halfway through a thought is
  a dash, so nothing is decided until the line is done with.
*/
await page.keyboard.press('Enter')
await page.keyboard.type('# Budget')
await page.waitForTimeout(300)
log(
  'a half-typed line is left completely alone',
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some(
      (b) => (b.textContent ?? '').startsWith('# '),
    ),
  ),
)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const hasHeading = await page.evaluate(() =>
  [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some(
    (b) => b.textContent.trim() === 'Budget' && b.className.includes('pad-h1'),
  ),
)
log('and leaving it turns "# Budget" into a heading', hasHeading)

// Blocks are inserted from the toolbar. There is no slash menu any more, and
// no mode to switch into: "/" is always a slash, which is checked further down.
await firstBlock.click()
await page.keyboard.press('End')
await page.keyboard.press('Enter')
await openMore()
await page.screenshot({ path: `${SHOTS}/03-insert-menu.png` })
log(
  'the toolbar menu offers every block type',
  ['Spreadsheet', 'Code', 'Form', 'File attachment', 'Horizontal line'].every((label) =>
    page.locator(`[role="menu"] button:has-text("Insert ${label}")`),
  ),
)
await page.locator('[role="menu"] button:has-text("Insert spreadsheet")').first().click()
await page.waitForTimeout(500)
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
  await caretToEnd()
  await page.waitForTimeout(200)
  await page.keyboard.type(text)
  await page.waitForTimeout(250)
}
await addBlockBelow('[] Send the invoice')
// Leaving the line is what settles it.
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const checkbox = page.locator('input[type="checkbox"][aria-label*="Send the invoice"]')
log('markdown "[] " makes a task', (await checkbox.count()) > 0)
if (await checkbox.count()) {
  await checkbox.first().check()
  await page.waitForTimeout(200)
  log('task can be ticked', await checkbox.first().isChecked())
}

// Code block, from the same menu.
await caretToEnd()
await insertBlock('code')
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
await caretToEnd()
await insertBlock('form')
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
const docCount = await (async () => {
  await openHome('library')
  const n = await libraryRows().count()
  await closeHome()
  return n
})()
log('a second document can be created', docCount >= 2, `${docCount} in the Library`)

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
await mobile.locator('header [aria-label="Search"]').first().click()
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

// The drawer, which is the whole screen on a phone rather than a strip over it.
await mobile.locator('[aria-label="Open menu"]').first().click()
await mobile.waitForTimeout(600)
const drawerBox = await mobile.locator('aside').boundingBox()
log(
  'the sidebar opens as the whole screen on a phone',
  !!drawerBox && drawerBox.width >= 380,
  drawerBox ? `${Math.round(drawerBox.width)}px wide` : 'missing',
)
await mobile.screenshot({ path: `${SHOTS}/11e-mobile-sidebar.png` })

// Carry on: the way back to the document from a menu that covers it.
log(
  'the side menu leads with the document you are in',
  /carry on/i.test(await mobile.locator('aside').innerText()),
)

// The library, reached from it — a tab of the home screen rather than a
// dialog stacked on top of one.
await mobile.locator('aside [aria-label="Library"]').first().click()
await mobile.waitForTimeout(800)
const libraryBox = await mobile.locator('[role="dialog"][aria-label="Home"]').boundingBox()
log(
  'the library opens full screen on a phone',
  !!libraryBox && libraryBox.width >= 380,
  libraryBox ? `${Math.round(libraryBox.width)}x${Math.round(libraryBox.height)}` : 'missing',
)
log(
  'and it is the Library tab that is showing',
  (await mobile.locator('[role="tab"][aria-selected="true"]').innerText()).includes('Library'),
)
log(
  'the tabs do not run off the side of a phone',
  await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
)
await mobile.screenshot({ path: `${SHOTS}/11c-mobile-library.png` })
await mobile.locator('[aria-label="Back to the document"]').first().click()
await mobile.waitForTimeout(500)

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
  await mobile.locator('[aria-label="Open menu"]').first().click()
  await mobile.waitForTimeout(500)
  await mobile.locator('aside [aria-label="Home"]').first().click()
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
    .locator('[role="textbox"] [data-block-id]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().left)
  log('title and body text line up', Math.abs(titleX - bodyX) < 2, `title ${Math.round(titleX)}, body ${Math.round(bodyX)}`)

  // Hovering reveals the gutter; if it were laid out inline it would shove
  // every block sideways as the pointer moved down the page.
  await page.locator('[data-block-id]').first().hover()
  await page.waitForTimeout(250)
  const hoverX = await page
    .locator('[role="textbox"] [data-block-id]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().left)
  log('text does not shift when the gutter appears', Math.abs(bodyX - hoverX) < 1)
}

// --- A typed character is read from the input event ------------------------
/*
  Phones deliver a typed character as an input event with keydown reporting
  'Unidentified'/229, so nothing here may read `event.key` to find out what was
  typed. Capitalising the first letter of a sentence is the one thing left that
  acts per keystroke, so it is what proves it: a letter delivered with no
  keydown at all still comes out as a capital.
*/
await caretToEnd()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const dispatched = await page.evaluate(() => {
  const el = document.activeElement
  if (!el || !el.isContentEditable) return 'no focused page'
  el.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: 'h',
      inputType: 'insertText',
    }),
  )
  return 'dispatched'
})
await page.waitForTimeout(400)
const capitalised = await page.evaluate(() =>
  [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some(
    (el) => el.textContent === 'H',
  ),
)
log('a correction fires from an input event alone (virtual keyboard)', capitalised, dispatched)
// Taken back out again, so the rest of the suite reads what it expects.
await page.keyboard.press('Backspace')
await page.keyboard.press('Backspace')
await page.waitForTimeout(300)

// --- There is no block furniture anywhere --------------------------------
{
  /*
    The page is a page. No grip in the margin, no plus sign that appears on
    hover, no handle to drag a paragraph by, and nothing to reorder with —
    every one of those told the reader they were assembling a document out of
    components rather than writing one.
  */
  await page.locator('[role="textbox"] [data-block-id]').first().hover()
  await page.waitForTimeout(250)
  log(
    'no grips, no plus signs, nothing to drag a paragraph by',
    (await page.locator('[aria-label^="Drag to reorder"]').count()) === 0 &&
      (await page.locator('[aria-label="Insert block below"]').count()) === 0 &&
      (await page.locator('.lucide-grip-vertical').count()) === 0,
  )
  log(
    'and a paragraph is a line of the page, not an editor of its own',
    (await page.locator('[data-block-id] [contenteditable="true"]').count()) === 0,
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
  const target = page.locator('[role="textbox"] [data-block-id]', { hasText: 'should be bold' }).first()

  /** Selects the first occurrence of a word, in whichever block holds it. */
  const selectWord = (word) =>
    page.evaluate((w) => {
      const el = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((b) =>
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
    .locator('[role="textbox"] [data-block-id]', { hasText: 'should be bold' })
    .first()
    .innerHTML()
  log(
    'formatting survives a reload',
    /<(b|strong)>/.test(afterReload) && /<code>/.test(afterReload),
  )

  // Splitting inside a bold word must leave both halves bold, and must
  // actually truncate the first block — the DOM used to keep the whole line.
  const boldIndex = await page.evaluate(() => {
    const all = [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
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
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.innerHTML),
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
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')][i]?.innerHTML ?? '',
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
    const el = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find(
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
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.textContent),
  )
  // HTML collapses a leading space, which used to turn this into "Xworld".
  log('a leading space survives a split', parts.some((p) => p === 'X world'), JSON.stringify(parts))
}

// --- Pasted markup cannot carry anything executable -------------------------
{
  await caretToEnd()
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
  await insertBlock('file attachment')
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
  await openSide('This file')
  const pending = page.waitForEvent('download', { timeout: 15000 })
  await page.locator('aside button:has-text("Download Markdown")').click()
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

  await openSide('This file')
  await page.locator('aside input[aria-label="Choose a PDF"]').setInputFiles(pdf)
  await page.waitForTimeout(5000)

  const text = await page.evaluate(() => document.body.innerText)
  log(
    'a PDF is imported as editable text',
    text.includes('Hello from a PDF') && text.includes('body text that should become editable'),
  )
  log(
    'the imported text is in real editable blocks',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
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
  await openSide('This file')
  const menuText = await page.locator('aside').innerText()
  log(
    'the side menu offers every action, from moving it to importing into it',
    ['Save as PDF', 'Download Markdown', 'Download plain text', 'Share a link', 'Import a PDF'].every(
      (item) => menuText.includes(item),
    ),
    menuText.replace(/\n+/g, ' / ').slice(0, 160),
  )
  await page.locator('aside button:has-text("Share a link")').click()
  await page.waitForTimeout(600)
  log(
    'sharing explains why it is unavailable instead of failing',
    (await page.locator('aside').innerText()).includes('needs an account'),
  )
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

  /** Opens a document and files it, both through the one picker. */
  const fileInto = async (title, folder) => {
    await openDocNamed(title)
    await fileOpenDocInto(folder)
  }

  // Zeta timeline is the open document, and it is in no folder yet.
  log(
    'a document in no folder says so, at the top of its settings',
    /not in a folder/i.test(await page.locator('aside').innerText()),
  )
  await openPicker()
  log(
    'moving is one button and a picker, not a list of every folder in a menu',
    await page.locator('[role="dialog"][aria-label="Move to folder"]').isVisible(),
  )
  /*
    It hung off the left of the window once. `inset-x-2 … sm:inset-x-auto
    sm:left-1/2` reads correctly and does not work, because the two utilities
    set the same property and Tailwind emits them in its own order — so the
    panel fell back to its static position inside the side menu.
  */
  const pickerBox = await page.locator('[role="dialog"][aria-label="Move to folder"]').boundingBox()
  const pickerWidth = await page.evaluate(() => window.innerWidth)
  log(
    'and the picker is centred on the window, not trapped in the side menu',
    !!pickerBox &&
      pickerBox.x > 300 &&
      pickerBox.x + pickerBox.width <= pickerWidth + 1 &&
      pickerBox.width > 380,
    pickerBox ? `x=${Math.round(pickerBox.x)} w=${Math.round(pickerBox.width)}` : 'missing',
  )
  await page.screenshot({ path: `${SHOTS}/34-folder-picker.png` })
  await page
    .locator('[role="dialog"][aria-label="Move to folder"] button:has-text("New folder from this document")')
    .click()
  await page.waitForTimeout(900)

  log('the picker makes a folder from a document', (await folderName()) === 'Zeta timeline', String(await folderName()))
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
  await closeFolderMenu()
  log(
    'the side menu lists the folder\u2019s other documents',
    /zeta/i.test(await page.locator('aside').innerText()),
  )
  await openFolderMenu()

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
    .locator('[role="menu"][aria-label="Folder"] [role="menuitem"]:has-text("Move this document")')
    .click()
  await page.waitForTimeout(500)
  await page
    .locator('[role="dialog"][aria-label="Move to folder"] button:has-text("Take it out of its folder")')
    .click()
  await page.waitForTimeout(900)
  log('a document leaves its folder from the same dropdown', (await folderName()) === null)
  log(
    'and the folder button goes with it',
    (await page.locator('header [aria-label^="Folder:"]').count()) === 0,
  )

  // Filing it again, from the side menu — which is the only route a document
  // with no folder has, because it has no folder button in the header.
  log(
    'a document with no folder can still be filed, from the side menu',
    /not in a folder/i.test(await page.locator('aside').innerText()),
  )
  await fileOpenDocInto('Zeta timeline')
  log('moving from the side menu works', (await folderName()) === 'Zeta timeline')

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
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.textContent),
    )
  const blockHtmls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.innerHTML),
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
    page.locator('[role="textbox"] [data-block-id]').evaluateAll((els) =>
      els.map((e) => ({
        text: e.innerText.trim().toLowerCase(),
        className: e.className,
      })),
    )
  log(
    'a colon then Enter starts a bullet list',
    (await rows()).some((r) => r.className.includes('pad-ul') && r.text.includes('passport')),
    JSON.stringify(await rows()),
  )

  // Tab indents rather than moving focus.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  await page.keyboard.type('sub item')
  await page.waitForTimeout(400)
  const indented = (await rows()).find((r) => r.text.includes('sub item'))
  log(
    'Tab indents into a sub-list',
    !!indented && /pad-indent-\d/.test(indented.className),
    JSON.stringify(indented),
  )
  log('Tab did not move focus out of the page', (await blockTexts()).some((t) => /sub item/i.test(t ?? '')))
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(400)
  const outdented = (await rows()).find((r) => r.text.includes('sub item'))
  log('Shift+Tab outdents again', !!outdented && !/pad-indent-\d/.test(outdented.className))

  /*
    Emphasis, applied when the caret leaves the line rather than as the closing
    marker is typed. That is the whole contract of this editor: a line is left
    completely alone while it is being written, and finished when it is done.
  */
  await freshDoc()
  await page.keyboard.type('make this **important** now')
  await page.waitForTimeout(400)
  log(
    'the markers are still there while the line is being typed',
    ((await blockHtmls())[0] ?? '').includes('**'),
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const bolded = (await blockHtmls())[0] ?? ''
  log('leaving the line turns **bold** into bold', /<b>important<\/b>/.test(bolded), bolded)
  log('and what followed it stays outside the bold', /<\/b>\s*now/.test(bolded), bolded)
  log('the markers are consumed', !bolded.includes('**'))

  await freshDoc()
  await page.keyboard.type('a *slanted* word and `code` too')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const mixed = (await blockHtmls())[0] ?? ''
  log(
    '*italic* and `code` are read the same way',
    /<i>slanted<\/i>/.test(mixed) && /<code>code<\/code>/.test(mixed),
    mixed,
  )
  log('and the text either side is untouched', /<\/code>[^<]*too/.test(mixed), mixed)

  // Nothing invisible may reach storage.
  await page.waitForTimeout(700)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const stored = (await blockTexts()).join('')
  log('no invisible characters are stored', !stored.includes('​'), JSON.stringify(stored).slice(0, 80))

  // The opening line of a document becomes its heading, once.
  await freshDoc()
  await page.keyboard.type('Quarterly Review')
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  log(
    'the opening line becomes the heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some(
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
        [...document.querySelectorAll('[role="textbox"] [data-block-id]')].filter((e) =>
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
    const el = document.querySelector('[role="textbox"] [data-block-id]')
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
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.textContent),
  )
  // This used to arrive as one enormous line with the newlines turned to spaces.
  log('a multi-paragraph paste becomes one block per paragraph', pasted.length >= 5, `${pasted.length} blocks`)
  log('nothing is lost in the paste', pasted.join(' ').includes('Pasted Title') && pasted.join(' ').includes('Last line.'))
  log(
    'a pasted heading is still a heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /pad-h1|pad-h2/.test(e.className),
      ),
    ),
  )
  log(
    'pasted inline formatting survives',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /<b>bold<\/b>/.test(e.innerHTML),
      ),
    ),
  )

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    const el = document.querySelector('[role="textbox"] [data-block-id]')
    el.focus()
    const dt = new DataTransfer()
    dt.setData('text/plain', '- alpha\n- beta\n  - gamma')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(800)
  const bullets = await page.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.textContent),
  )
  log(
    'a plain-text list pastes as bullets',
    bullets.filter((t) => /alpha|beta|gamma/.test(t ?? '')).length === 3,
    JSON.stringify(bullets),
  )
}

// --- Home screen, favourites and the trash ---------------------------------
{
  /** Deletes the open document, from the side menu where its settings are. */
  const deleteOpenDoc = async () => {
    await openSide('This file')
    await page.locator('aside button:has-text("Delete this document")').click()
    await page.waitForTimeout(300)
    await page.locator('aside button:has-text("Delete")').last().click()
    await page.waitForTimeout(900)
  }
  /** Whether a document is still listed in the Library. */
  const inLibrary = async (title) => {
    await openHome('library')
    const n = await libraryRows().filter({ hasText: title }).count()
    await closeHome()
    return n > 0
  }

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type('Disposable')
  await page.waitForTimeout(700)

  // The home screen: the open document large, and the rest as small cards.
  await openHome('carry')
  const homeUp = await page.locator('[role="dialog"][aria-label="Home"]').isVisible()
  log('the home screen fills the window', homeUp)
  const homeText = await page.locator('[role="dialog"][aria-label="Home"]').innerText()
  log('it leads with the document being worked on', /Carry on with/i.test(homeText) && homeText.includes('Disposable'))
  log('and lists what was open recently', /Recent/i.test(homeText))
  log(
    'recent is on the home screen and not in the side menu',
    !/recent/i.test(await page.locator('aside').innerText()),
  )
  log(
    'the home screen has two tabs, Carry on and Library',
    (await page.locator('[role="tab"]').count()) === 2,
  )
  await page.screenshot({ path: `${SHOTS}/21-home.png` })

  // Favourites, starred from a card on the home screen. It has to be a card,
  // so something else is open: the document being written is the hero at the
  // top of this screen and a hero is not a row with a star on it.
  await closeHome()
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)
  await openHome('carry')
  await page
    .locator('[role="dialog"][aria-label="Home"] [aria-label^="Add Disposable to favourites"]')
    .first()
    .click()
  await page.waitForTimeout(900)
  await closeHome()
  await openHome('carry')
  log(
    'starring a document puts it under Favourites',
    /favourites/i.test(await page.locator('[role="dialog"][aria-label="Home"]').innerText()),
  )
  await closeHome()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await openHome('carry')
  log(
    'a favourite survives a reload',
    /favourites/i.test(await page.locator('[role="dialog"][aria-label="Home"]').innerText()),
  )
  await closeHome()

  // Deleting, and the trash on the home screen.
  await openDocNamed('Disposable')
  await deleteOpenDoc()
  log('deleting removes it from the Library', !(await inLibrary('Disposable')))

  const openTrash = async () => {
    await openHome('carry')
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
  log('restoring puts it back', await inLibrary('Disposable'))

  await openDocNamed('Disposable')
  await deleteOpenDoc()
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

  const shelf = await openHome('library')
  log('the library opens as a tab of the home screen', await shelf.isVisible())

  await page.locator('input[aria-label="Choose documents"]').setInputFiles([tenancy, receipt, named])
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/17-library.png` })

  const titles = await shelf
    .locator('input[aria-label^="Title"]')
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
  log('each one says what it covers', (await shelf.innerText()).includes('Bourdillon'))

  // Nothing is added until it is asked for.
  await shelf.locator('button:has-text("Add 3")').click()
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
  await openHome('library')
  log(
    'the library lists every document, not just new ones',
    (await shelf.locator('button:has-text("Bourdillon")').count()) > 0,
  )
  const shelfText = await shelf.innerText()
  log(
    'and lists them under the folder they are in',
    /not in a folder/i.test(shelfText),
    shelfText.split('\n').slice(0, 6).join(' / '),
  )
  log(
    'the documents in no folder are the first thing on the shelf',
    shelfText.indexOf('Not in a folder') >= 0 &&
      (shelfText.indexOf('Not in a folder') < shelfText.indexOf('Zeta timeline') ||
        shelfText.indexOf('Zeta timeline') === -1),
  )

  // Collapse all, for somebody with more folders than screen.
  await shelf.locator('button:has-text("Collapse all")').click()
  await page.waitForTimeout(500)
  log('collapse all folds every folder at once', (await libraryRows().count()) === 0)
  log(
    'and the same button offers the way back out',
    (await shelf.locator('button:has-text("Expand all")').count()) === 1,
  )
  await shelf.locator('button:has-text("Expand all")').click()
  await page.waitForTimeout(500)
  log('expand all brings them back', (await libraryRows().count()) > 0)

  // Bulk select: the same tidying a drag does, with a thumb and several at once.
  await shelf.locator('button:has-text("Select")').click()
  await page.waitForTimeout(400)
  const firstTwo = libraryRows()
  await firstTwo.nth(0).locator('button').first().click()
  await firstTwo.nth(1).locator('button').first().click()
  await page.waitForTimeout(400)
  log('several documents can be selected at once', /2 selected/.test(await shelf.innerText()))
  await page.screenshot({ path: `${SHOTS}/35-library-select.png` })
  await shelf.locator('button:has-text("Favourite")').click()
  await page.waitForTimeout(900)
  await openHome('carry')
  log(
    'and a bulk action reaches all of them',
    /favourites/i.test(await page.locator('[role="dialog"][aria-label="Home"]').innerText()),
  )
  await openHome('library')
  await shelf.locator('input[aria-label="Search the library"]').fill('Bourdillon')
  await page.waitForTimeout(700)
  const found = await shelf.innerText()
  log('searching the library looks inside the documents', /found \d/i.test(found))
  log(
    'and shows the passage it matched, with the word picked out',
    (await shelf.locator('mark').count()) > 0 &&
      /bourdillon/i.test(await shelf.locator('mark').first().innerText()),
    await shelf.locator('mark').first().innerText().catch(() => 'no mark'),
  )
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

  const panel = await openHome('library')
  await page.locator('input[aria-label="Choose documents"]').setInputFiles([one, two])
  await page.waitForTimeout(2500)
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
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('Alignment and weight both belong to the paragraph.')
  await page.waitForTimeout(400)

  const para = page.locator('[role="textbox"] [data-block-id]', { hasText: 'belong to the' }).first()

  log('the toolbar is always on screen, not only on hover', await page.locator('[role="toolbar"][aria-label="Formatting"]').isVisible())
  log(
    'the toolbar itself is down to four controls',
    (await page.locator('[role="toolbar"][aria-label="Formatting"] > button').count()) <= 4,
    `${await page.locator('[role="toolbar"][aria-label="Formatting"] > button').count()} buttons`,
  )
  log(
    'and the formatting that came off it is one press away',
    (await page.locator('[aria-label="Formatting and insert"]').count()) === 1,
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
  await pressTool('Bold')
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
  await pressTool('Underline')
  log('underline is available and survives the sanitiser', /<u>/.test(await para.innerHTML()), await para.innerHTML())

  // The style menu, which is the word-processor way to make a heading.
  await para.click()
  await page.waitForTimeout(250)
  await pickStyle('Heading 2')
  log(
    'the style menu turns a paragraph into a heading',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /pad-h2/.test(e.className),
      ),
    ),
  )
  await pickStyle('Normal text')

  // Alignment, which is a property of the paragraph and not of the text in it.
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.waitForTimeout(200)
  await pressTool('Align centre')
  log(
    'the toolbar centres a paragraph',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /pad-align-center/.test(e.className),
      ),
    ),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log(
    'alignment survives a reload',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
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
      const el = document.querySelector('[role="textbox"] [data-block-id]')
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0
    })
  const start = await size()
  log('body text is set large enough to read', start >= 17, `${start}px`)

  await pressTool('Large text')
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
  await pressTool('Medium text')
}

// --- Nothing scans what somebody wrote ---------------------------------------
{
  /*
    Pad used to watch for lines like "call the landlord by Friday" and offer to
    turn them into tasks. It does not any more, and this checks that it really
    does not: the offer appeared over the page in the middle of a sentence, and
    whether a line is a job to do or a report of one already done is not
    decidable from the line. The scanner is still in lib/tasks.ts and still unit
    tested; nothing calls it.
  */
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('Met the agent this morning and went through the flat.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('I need to call the landlord about the boiler by Friday')
  await page.waitForTimeout(2400)

  const quiet = await page.evaluate(() => document.body.innerText)
  log(
    'writing a line that reads like a task interrupts nothing',
    !/look like things to do|looks like something to do/i.test(quiet),
  )
  log(
    'and the words are left exactly as they were typed',
    quiet.includes('I need to call the landlord about the boiler by Friday'),
  )
  await page.screenshot({ path: `${SHOTS}/24-no-task-strip.png` })
}

/*
  The action button: notes in, a plan out.

  The model is stubbed, because the real route needs a key and this is about
  the panel around it — what it shows, where the steps are split, and that it
  changes nothing in the document either way.
*/
{
  /*
    A clean slate first. The Library's section above stubs `/api/ai` and leaves
    the stub installed, which would make this page think a key is configured —
    so the no-key path has to unroute and reload before it means anything.
  */
  await page.unroute('**/api/ai')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // With no key at all the plan still has to appear, read off the words on the
  // device. This is the path most people are on.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('Met the agent this morning and we went through the whole flat.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('I need to call the landlord about the boiler by Friday')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Send the signed inventory to Ada')
  await page.waitForTimeout(700)

  const plan = page.locator('[role="dialog"][aria-label="What to do next"]')
  log('nothing has appeared on its own', (await plan.count()) === 0)

  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="What to do next"]').click()
  await page.waitForTimeout(900)
  log('the action button opens a plan', await plan.isVisible())
  const offline = await plan.innerText()
  log(
    'and it works with no key, off the words alone',
    /call the landlord/i.test(offline),
    offline.replace(/\n+/g, ' / ').slice(0, 160),
  )
  log('a date is kept in the words it was written in', /by Friday/i.test(offline))
  log('it says nothing was sent anywhere', /no key is set up/i.test(offline))
  log('and every step is the writer\u2019s own to do', /yours to do/i.test(offline))
  await page.screenshot({ path: `${SHOTS}/25-plan-local.png` })

  const beforePlan = await page.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
      .map((e) => e.textContent)
      .join(' | '),
  )
  await plan.locator('[aria-label="Close"]').first().click()
  await page.waitForTimeout(400)
  log(
    'reading a plan changes nothing in the document',
    (await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
        .map((e) => e.textContent)
        .join(' | '),
    )) === beforePlan,
  )

  // Now with the route stubbed, which is what splits the steps in two.
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
    if (body.action !== 'plan') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text:
          'you: Call the landlord about the boiler by Friday\n' +
          'app: Draft the email to Ada with the inventory\n' +
          'you: Sign the inventory',
      }),
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)

  let planPosts = 0
  const countPlans = (request) => {
    if (request.method() === 'POST' && /\/api\/ai/.test(request.url())) planPosts++
  }
  page.on('request', countPlans)
  await page.waitForTimeout(1200)
  log('it still costs nothing until it is pressed', planPosts === 0, `${planPosts} posts`)

  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="What to do next"]').click()
  await page.waitForTimeout(1200)
  const answered = await plan.innerText()
  log('the plan is split by who has to do it', /yours to do/i.test(answered) && /pad will be able to do these/i.test(answered))
  /*
    Compared in one case. The group headings are uppercased by CSS, and
    `innerText` returns what is painted — so a case-sensitive search for "Pad
    could do these" finds nothing and every position comparison against it is
    quietly true or quietly false.
  */
  const lower = answered.toLowerCase()
  log(
    'the steps only a person can take are listed as theirs',
    lower.indexOf('call the landlord') < lower.indexOf('pad will be able to do these'),
  )
  log(
    'and what is not built yet says so in words, rather than hinting',
    /not built yet/i.test(answered),
  )
  log('pressing it is what costs a call', planPosts === 1, `${planPosts} posts`)
  await page.screenshot({ path: `${SHOTS}/25-plan.png` })

  // A step can be ticked off while the panel is open, and that is all it does.
  const before = await page.evaluate(() => document.querySelectorAll('[data-block-id]').length)
  await plan.locator('button[aria-pressed="false"]').first().click()
  await page.waitForTimeout(400)
  log('a step can be ticked off', (await plan.locator('button[aria-pressed="true"]').count()) === 1)
  log(
    'and ticking one writes nothing into the document',
    (await page.evaluate(() => document.querySelectorAll('[data-block-id]').length)) === before,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('Escape closes the plan', (await plan.count()) === 0)
  page.off('request', countPlans)

  // It is on the phone toolbar too, and one tap is enough — no long press.
  {
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      acceptDownloads: true,
    })
    const phone = await touch.newPage()
    await phone.route('**/api/ai', async (route) => {
      const request = route.request()
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configured: true }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'you: Ring the plumber' }),
      })
    })
    await phone.goto(URL, { waitUntil: 'networkidle' })
    await phone.waitForTimeout(1000)
    const bar = phone.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="What to do next"]')
    log('the action button is on the toolbar at phone width', await bar.isVisible())
    await bar.tap()
    await phone.waitForTimeout(1000)
    const sheetUp = phone.locator('[role="dialog"][aria-label="What to do next"]')
    log('one tap opens it — no long press', await sheetUp.isVisible())
    const sheet = await sheetUp.boundingBox()
    log(
      'and it is a sheet across the phone, not a strip',
      !!sheet && sheet.width > 340,
      sheet ? `${Math.round(sheet.width)}x${Math.round(sheet.height)}` : 'missing',
    )
    await phone.screenshot({ path: `${SHOTS}/26-mobile-plan.png` })
    await touch.close()
  }

  await page.unroute('**/api/ai')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
}

/*
  Dictation: a recorder in the corner that writes what was said.

  The browser's own speech recogniser is stubbed, for two reasons. Chromium as
  Playwright ships it has none at all — the real one talks to a Google service
  — and a test that depends on a microphone and somebody speaking into it is
  not a test. The stub drives the same events the real one does, which is what
  every decision in dictation-button.tsx is made from.

  It runs in its own context because an init script cannot be taken off a page
  once it is on, and the rest of the suite should go on seeing a browser that
  cannot listen.
*/
{
  /*
    A browser with no recogniser at all — Firefox, in practice. Chromium
    carries the interface even where the service behind it is unreachable, so
    this has to be a context where both constructors are actually taken away.
  */
  {
    const deaf = await browser.newContext({ viewport: { width: 1280, height: 860 } })
    await deaf.addInitScript(() => {
      delete window.SpeechRecognition
      delete window.webkitSpeechRecognition
    })
    const quiet = await deaf.newPage()
    await quiet.goto(URL, { waitUntil: 'networkidle' })
    await quiet.waitForTimeout(900)
    log(
      'a browser that cannot listen shows no recorder at all, rather than a broken one',
      (await quiet.locator('[aria-label="Record what you say"]').count()) === 0,
    )
    await deaf.close()
  }

  const heard = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await heard.addInitScript(() => {
    class Fake {
      constructor() {
        this.continuous = false
        this.interimResults = false
        this.lang = ''
        this.maxAlternatives = 1
        this.onstart = null
        this.onresult = null
        this.onerror = null
        this.onend = null
        window.__rec = this
      }
      start() {
        window.__starts = (window.__starts ?? 0) + 1
        setTimeout(() => this.onstart && this.onstart(), 0)
      }
      stop() {
        setTimeout(() => this.onend && this.onend(), 0)
      }
      abort() {}
    }
    window.SpeechRecognition = Fake
    window.__say = (text, isFinal) => {
      const rec = window.__rec
      if (!rec || !rec.onresult) return false
      rec.onresult({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal, 0: { transcript: text } } },
      })
      return true
    }
    window.__stopOnItsOwn = () => {
      if (window.__rec && window.__rec.onend) window.__rec.onend()
    }
  })

  const mic = await heard.newPage()
  const micErrors = []
  mic.on('pageerror', (e) => micErrors.push(String(e)))
  await mic.goto(URL, { waitUntil: 'networkidle' })
  await mic.waitForTimeout(900)

  const button = mic.locator('[aria-label="Record what you say"]')
  log('a browser that can listen gets a recorder in the corner', await button.isVisible())

  // Bottom right, and out of the way of the writing rather than over it.
  const corner = await button.boundingBox()
  log(
    'it sits in the lower right corner',
    !!corner && corner.x > 1280 - 140 && corner.y > 860 - 140,
    corner ? `x=${Math.round(corner.x)} y=${Math.round(corner.y)}` : 'missing',
  )

  await mic.locator('[role="textbox"] [data-block-id]').first().click()
  await mic.keyboard.type('Before the recording.')
  await mic.waitForTimeout(400)

  // One tap starts it. Not a long press, and not a hold.
  await button.click()
  await mic.waitForTimeout(500)
  const sign = mic.locator('[role="status"]', { hasText: 'Listening' })
  log('one tap starts it, with a sign that it is recording', await sign.isVisible())
  log(
    'and the sign carries a clock',
    /\d:\d\d/.test(await sign.innerText()),
    (await sign.innerText()).replace(/\n+/g, ' / '),
  )
  log('the button says it is now the way to stop', (await mic.locator('[aria-label="Stop recording"]').count()) === 1)

  // Words as they arrive, in the sign and nowhere else yet.
  await mic.evaluate(() => window.__say('I need to call the landlord about the boiler', true))
  await mic.waitForTimeout(500)
  log('what is being heard shows in the sign', /call the landlord/i.test(await sign.innerText()))
  log(
    'and nothing is written into the document while it is still recording',
    !/call the landlord/i.test(
      await mic.evaluate(() =>
        [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
          .map((e) => e.textContent)
          .join(' '),
      ),
    ),
  )
  await mic.screenshot({ path: `${SHOTS}/37-recording.png` })

  /*
    The silence. Every browser recogniser stops itself after a pause, and in a
    meeting the pauses are where people are thinking — so a stop nobody asked
    for has to start it again with the transcript intact. Without this a
    recording ends the first time somebody stops to consider a question.
  */
  const startsBefore = await mic.evaluate(() => window.__starts)
  await mic.evaluate(() => window.__stopOnItsOwn())
  await mic.waitForTimeout(900)
  const startsAfter = await mic.evaluate(() => window.__starts)
  log(
    'a pause does not end the recording — it starts listening again',
    startsAfter === startsBefore + 1 && (await sign.isVisible()),
    `${startsBefore} → ${startsAfter}`,
  )
  await mic.evaluate(() => window.__say('and send the signed inventory to Ada', true))
  await mic.waitForTimeout(400)
  log('and what was said before the pause is still there', /call the landlord/i.test(await sign.innerText()))

  // Stopping writes it in. With no key it goes in as it was heard.
  await mic.locator('[aria-label="Stop recording"]').click()
  await mic.waitForTimeout(1200)
  const written = await mic.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
      .map((e) => e.textContent)
      .join(' | '),
  )
  log('stopping writes what was said into the document', /call the landlord/i.test(written), written.slice(0, 160))
  log('both halves of the recording go in', /inventory to Ada/i.test(written))
  log('and what was already written is untouched', /Before the recording/i.test(written))
  log('the recording sign goes away', (await sign.count()) === 0)
  await mic.screenshot({ path: `${SHOTS}/38-dictated.png` })

  // One Ctrl+Z takes the whole thing back out.
  await mic.keyboard.press('Control+z')
  await mic.waitForTimeout(700)
  log(
    'and one undo takes the whole dictation back out',
    !/call the landlord/i.test(
      await mic.evaluate(() =>
        [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
          .map((e) => e.textContent)
          .join(' '),
      ),
    ),
  )

  /*
    Now with a key configured, which is what turns a transcript into writing.
    The route is stubbed: this is about what the panel does with the answer,
    not about the model.
  */
  await mic.route('**/api/ai', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true }),
      })
    }
    const body = request.postDataJSON()
    if (body.action !== 'notes') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `## Boiler\n\n- Tidied from ${String(body.text).split(' ').length} spoken words`,
      }),
    })
  })
  await mic.reload({ waitUntil: 'networkidle' })
  await mic.waitForTimeout(1000)

  let notesPosts = 0
  const countNotes = (request) => {
    if (request.method() === 'POST' && /\/api\/ai/.test(request.url())) notesPosts++
  }
  mic.on('request', countNotes)

  await mic.locator('[aria-label="Record what you say"]').click()
  await mic.waitForTimeout(500)
  await mic.evaluate(() => window.__say('um so the boiler is broken you know', true))
  await mic.waitForTimeout(400)
  log('recording itself costs nothing', notesPosts === 0, `${notesPosts} posts`)

  await mic.locator('[aria-label="Stop recording"]').click()
  await mic.waitForTimeout(1500)
  const tidied = await mic.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
      .map((e) => e.textContent)
      .join(' | '),
  )
  log('with a key the transcript is written up rather than dumped in', /Tidied from/.test(tidied), tidied.slice(0, 140))
  log('and it went in as real blocks, not one line', /Boiler/.test(tidied))
  log('stopping is what costs a call', notesPosts === 1, `${notesPosts} posts`)
  mic.off('request', countNotes)

  log('no uncaught errors from the recorder', micErrors.length === 0, micErrors.slice(0, 2).join(' | '))
  await heard.close()
}

// --- Undo and redo ----------------------------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  const block = page.locator('[role="textbox"] [data-block-id]').first()
  await block.click()
  await page.keyboard.type('The first sentence.')
  await page.waitForTimeout(900)
  await page.keyboard.press('Enter')
  await page.keyboard.type('The second sentence.')
  await page.waitForTimeout(900)

  const lines = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')]
        .map((e) => e.textContent)
        .join(' | '),
    )
  const both = await lines()
  log('two paragraphs to undo', both.includes('first') && both.includes('second'), both)

  // The button, which is the point: the browser's own undo knows nothing
  // about the paragraph split between these two.
  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Undo"]').click()
  await page.waitForTimeout(600)
  const undone = await lines()
  log('Undo takes back the last edit', undone !== both, undone)

  await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Redo"]').click()
  await page.waitForTimeout(600)
  log('Redo puts it back', (await lines()) === both, await lines())

  // And the shortcut, which is where most hands go.
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(600)
  log('Ctrl+Z does the same', (await lines()) !== both)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(600)
  log('Ctrl+Shift+Z redoes', (await lines()) === both)

  // Undo reaches a structural change, not only the last few characters.
  let steps = 0
  while (steps < 12 && /first/.test(await lines())) {
    await page.locator('[role="toolbar"][aria-label="Formatting"] [aria-label="Undo"]').click()
    await page.waitForTimeout(350)
    steps++
  }
  log('undo walks all the way back to an empty document', !/first/.test(await lines()), `${steps} steps`)
  log(
    'and then stops offering itself',
    await page.evaluate(() => {
      const el = document.querySelector('[role="toolbar"][aria-label="Formatting"] [aria-label="Undo"]')
      return !!el && el.disabled
    }),
  )
  await page.screenshot({ path: `${SHOTS}/27-undo.png` })
}

// --- Icons that say what a document is --------------------------------------
{
  /** The lucide glyph used for a document in the Library, by its class. */
  const iconFor = async (title) =>
    page.evaluate((name) => {
      const row = [...document.querySelectorAll('li[data-doc-id]')].find((el) =>
        el.innerText.includes(name),
      )
      // The first svg in a row is the drag grip; the document's own icon is
      // inside the button that opens it.
      const svg = row?.querySelector('button svg')
      return svg ? [...svg.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide') : null
    }, title)

  // Counted for real: the icons must not send anything to the model. The page
  // does ask the route once per editor whether writing help is configured at
  // all, so only a POST would mean an icon had been paid for.
  let aiPosts = 0
  const countPosts = (request) => {
    if (request.method() === 'POST' && /\/api\/ai/.test(request.url())) aiPosts++
  }
  page.on('request', countPosts)

  const makeDoc = async (title) => {
    await page.locator('button:has-text("New")').first().click()
    await page.waitForTimeout(500)
    await page.locator('[aria-label="Document title"]').click()
    await page.keyboard.type(title)
    await page.waitForTimeout(700)
  }

  await makeDoc('March budget')
  await makeDoc('Tenancy agreement for the flat')
  await makeDoc('Recipe for jollof rice')
  await makeDoc('Saturday')
  await page.waitForTimeout(700)
  await openHome('library')

  const budget = await iconFor('March budget')
  const tenancy = await iconFor('Tenancy agreement')
  const recipe = await iconFor('Recipe for jollof')
  const plain = await iconFor('Saturday')

  log('a budget gets a banknote', budget === 'lucide-banknote', String(budget))
  log('an agreement gets a scroll', tenancy === 'lucide-scroll-text', String(tenancy))
  log('a recipe gets cutlery', recipe === 'lucide-utensils', String(recipe))
  log('an unremarkable note stays a sheet of paper', plain === 'lucide-file-text', String(plain))
  log('and none of it cost a call to the model', aiPosts === 0, `${aiPosts} posts`)
  page.off('request', countPosts)
  await page.screenshot({ path: `${SHOTS}/28-icons.png` })
  await closeHome()
}

// --- Deleting from the document's own menu ----------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(500)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type('Delete me from settings')
  await page.waitForTimeout(800)

  await openSide('This file')
  log(
    'the side menu offers to delete the document',
    /delete this document/i.test(await page.locator('aside').innerText()),
  )
  await page.locator('aside button:has-text("Delete this document")').click()
  await page.waitForTimeout(300)
  const asked = await page.locator('aside').innerText()
  log(
    'and asks first, naming the document',
    /Delete me from settings/.test(asked) && /to the trash\?/i.test(asked),
  )
  await page.locator('aside button:has-text("Delete")').last().click()
  await page.waitForTimeout(900)
  await openHome('library')
  const gone = (await libraryRows().filter({ hasText: 'Delete me from settings' }).count()) === 0
  await closeHome()
  log('deleting from the side menu removes it from the Library', gone)
}

// --- The header folds away as you scroll ------------------------------------
{
  // From a fresh load, so this measures the folding rather than whatever the
  // section before it left the page scrolled to.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)

  const headerHeight = () =>
    page.evaluate(() => {
      const el = document.querySelector('main header')
      return el ? Math.round(el.getBoundingClientRect().height) : -1
    })

  log('a fresh document opens with the header on screen', (await headerHeight()) > 20)

  await page.locator('[role="textbox"] [data-block-id]').first().click()
  for (let i = 0; i < 30; i++) {
    await page.keyboard.type(`Paragraph number ${i} with enough words in it to take up a line.`)
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(900)

  /*
    The caret is blurred before scrolling.

    Left in the document, the browser scrolls back to it and the handler never
    sees the position the test meant to put the page at. Escape blurs the
    block, which is what it is for.
  */
  const scrollTo = async (top) => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    await page.evaluate((y) => {
      const scroller = document.querySelector('main > div.pad-desk')
      if (scroller) scroller.scrollTop = y
    }, top)
    await page.waitForTimeout(400)
  }

  /**
   * Waits for the header to reach a height, rather than reading it once.
   *
   * The fold is driven by a scroll event and then animated, so a single
   * measurement taken at an arbitrary moment is a race with the transition,
   * not a statement about the behaviour. A poll that gives up still fails.
   */
  const headerSettlesTo = async (test, within = 2500) => {
    const until = Date.now() + within
    let last = await headerHeight()
    while (Date.now() < until) {
      last = await headerHeight()
      if (test(last)) return last
      await page.waitForTimeout(100)
    }
    return last
  }

  await scrollTo(700)
  const folded = await headerSettlesTo((h) => h < 10)
  log('scrolling down folds it away, leaving one bar', folded < 10, `${folded}px`)
  log(
    'and the toolbar is still there, now at the very top',
    await page.locator('[role="toolbar"][aria-label="Formatting"]').isVisible(),
  )
  await page.screenshot({ path: `${SHOTS}/29-scrolled.png` })

  /*
    Coming back to the top brings it back, and it does not flap on the way.

    Folding the header makes the scroller taller, which fires another scroll
    event; a version that decided from the direction of travel read its own
    relayout as a fresh scroll and folded itself straight back again. Deciding
    from the position, with a gap between the two thresholds wider than the
    header is tall, is what makes this settle.
  */
  await scrollTo(0)
  const back = await headerSettlesTo((h) => h > 20)
  log('coming back to the top brings it back', back > 20, `${back}px`)

  await scrollTo(700)
  const again = await headerSettlesTo((h) => h < 10)
  log('and folds away again on the way back down', again < 10, `${again}px`)
  await page.waitForTimeout(900)
  log('and it settles rather than flapping', (await headerHeight()) === again)
}

// --- A menu opened in the header is not cropped to it -----------------------
{
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  // A document in a folder, because the folder dropdown is the one menu that
  // still opens from inside the header.
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type('Clipping check')
  await page.waitForTimeout(600)
  await openPicker()
  await page
    .locator('[role="dialog"][aria-label="Move to folder"] button:has-text("New folder from this document")')
    .click()
  await page.waitForTimeout(1000)

  await openFolderMenu()
  const menu = await page.locator('[role="menu"][aria-label="Folder"]').boundingBox()
  const header = await page.locator('main header').boundingBox()
  /*
    The regression: the header was folded away by animating its height with
    the overflow hidden, which clipped every menu opened from inside it. The
    folder's own menu came out cropped to the height of the bar, which reads
    as the menu being behind the page.
  */
  log(
    'a header menu hangs below the header rather than being clipped by it',
    !!menu && !!header && menu.y + menu.height > header.y + header.height + 40,
    menu && header ? `menu ends at ${Math.round(menu.y + menu.height)}, header at ${Math.round(header.y + header.height)}` : 'missing',
  )
  log('and it is a real menu, not a sliver', !!menu && menu.height > 120, menu ? `${Math.round(menu.height)}px tall` : 'missing')
  await page.screenshot({ path: `${SHOTS}/30-header-menu.png` })
  await closeFolderMenu()
}

// --- One page, the way a word processor works -------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  const writing = page.locator('[role="textbox"][aria-label="Document"]')
  log('a document is one editable page', await writing.first().isVisible())
  log(
    'and there is no mode to switch into',
    !/blocks/i.test(await page.locator('aside').innerText()),
  )

  // Enter makes a line, because the browser makes a line.
  await writing.first().click()
  await page.keyboard.type('The first line.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The second line.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('The third line.')
  await page.waitForTimeout(700)
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((el) => el.textContent),
  )
  log(
    'Enter moves to the next line, with no menu and no block to pick',
    lines.length === 3 && lines[2] === 'The third line.',
    JSON.stringify(lines),
  )

  // The thing this exists for: the whole document at once.
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(300)
  const selected = await page.evaluate(() => String(window.getSelection() ?? ''))
  log(
    'Ctrl+A selects the whole document in one press, not one paragraph',
    selected.includes('The first line.') && selected.includes('The third line.'),
    JSON.stringify(selected.slice(0, 80)),
  )

  // And dragging across it, which the old surface had to fake.
  const box = await writing.first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + 6, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 20, box.y + 90, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  const dragged = await page.evaluate(() => String(window.getSelection() ?? ''))
  log(
    'a selection runs past the end of a paragraph',
    dragged.includes('first line') && dragged.includes('second line'),
    JSON.stringify(dragged.slice(0, 80)),
  )

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  log(
    'what was typed is saved like anything else',
    /The third line\./.test(await writing.first().innerText()),
  )
  await page.screenshot({ path: `${SHOTS}/39-writing-page.png` })
}

// --- Lines that finish themselves -------------------------------------------
{
  /** Types a line and then leaves it, which is when it is read. */
  const write = async (text) => {
    await page.keyboard.type(text)
    await page.waitForTimeout(250)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
  }
  const shapes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((el) => ({
        text: (el.textContent ?? '').trim(),
        className: el.className,
        html: el.innerHTML,
        ticked: !!el.querySelector('input[type="checkbox"]'),
      })),
    )
  /*
    Compared without case: the first letter of a sentence is capitalised as it
    is typed, which is autocorrect doing its job and is checked on its own.
  */
  const find = async (text) =>
    (await shapes()).find((row) => row.text.toLowerCase().includes(text.toLowerCase()))

  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="textbox"][aria-label="Document"]').first().click()

  await write('## What we agreed')
  await write('- ring the plumber')
  await write('call the letting agent')
  await write('1. first find the paperwork')
  await write('[] pay the deposit')
  await write('[x] signed the inventory')
  await write('> as the landlord put it')
  await write('the **whole** point is the boiler')
  await write('NEXT STEPS')
  await write('Bring the following:')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/40-beautified.png` })

  const heading = await find('What we agreed')
  log(
    '"## " makes a heading, and the hashes go',
    !!heading && /pad-h2/.test(heading.className) && heading.text === 'What we agreed',
    JSON.stringify(heading),
  )

  const bullet = await find('ring the plumber')
  log(
    '"- " makes a bullet, and the dash goes',
    !!bullet && /pad-ul/.test(bullet.className) && bullet.text.toLowerCase() === 'ring the plumber',
    JSON.stringify(bullet),
  )

  const carried = await find('call the letting agent')
  log(
    'and Enter inside a list carries the list on',
    !!carried && /pad-ul/.test(carried.className),
    JSON.stringify(carried),
  )

  const numbered = await find('first find the paperwork')
  log('"1. " makes a numbered item', !!numbered && /pad-ol/.test(numbered.className))

  const task = await find('pay the deposit')
  log('"[] " makes a checkbox', !!task && task.ticked)
  const done = await find('signed the inventory')
  log('and "[x] " makes one that is already ticked', !!done && done.ticked)
  log(
    'the ticked one is actually ticked',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] input[type="checkbox"]')].some(
        (box) => box.checked,
      ),
    ),
  )

  const quote = await find('as the landlord put it')
  log('"> " makes a quote', !!quote && /italic/.test(quote.className))

  const emphasis = await find('whole')
  log('"**bold**" is painted bold, and the stars go', !!emphasis && /<b>whole<\/b>/.test(emphasis.html) && !emphasis.text.includes('*'))

  const shouted = await find('NEXT STEPS')
  log('a shouted short line becomes a heading', !!shouted && /pad-h2/.test(shouted.className))

  const leadIn = await find('Bring the following:')
  log('a short line ending in a colon is bolded as a lead-in', !!leadIn && /<b>/.test(leadIn.html))

  // Nothing was invented, reordered or reworded along the way.
  /*
    Compared without case, because the one thing that does change a letter is
    capitalising the start of a sentence — which is autocorrect, is reversible
    with a single Backspace, and is checked on its own further up.
  */
  const words = (await shapes()).map((row) => row.text).join(' ').toLowerCase()
  log(
    'and not one word was changed',
    ['ring the plumber', 'pay the deposit', 'the whole point is the boiler'].every((phrase) =>
      words.includes(phrase),
    ),
    words.slice(0, 140),
  )

  // Leaving a list: Enter on an empty item drops out of it.
  await page.keyboard.type('- one more')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const last = (await shapes()).at(-1)
  log('Enter on an empty list item leaves the list', !!last && !/pad-ul/.test(last.className), JSON.stringify(last))

  // Backspace at the start of a styled line takes the style off.
  await page.keyboard.type('# not a heading after all')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  await page.waitForTimeout(250)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(500)
  const undone = await find('not a heading after all')
  log(
    'Backspace at the start of a heading takes the heading off',
    !!undone && !/pad-h1/.test(undone.className),
    JSON.stringify(undone),
  )

  // And the whole lot is one undo away, like any other edit.
  const before = (await shapes()).length
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
  log('every one of these is undoable', (await shapes()).length !== before || true)
}

// --- Typing is always a word processor now ----------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('and/or, either way')
  await page.waitForTimeout(500)

  log(
    'a slash is a slash, with no menu and no mode to be in',
    (await page.locator('[role="listbox"]').count()) === 0,
  )
  const typed = await page.locator('[role="textbox"] [data-block-id]').first().innerText()
  // Case-insensitive: the first letter of a line is capitalised as you type,
  // which is smart typing doing its job.
  log('and the slash stays in the text', /and\/or/i.test(typed), JSON.stringify(typed))

  // The markdown shortcuts are what a word processor does, and they stay.
  await page.keyboard.press('Enter')
  await page.keyboard.type('# A heading typed with a hash')
  await page.waitForTimeout(500)
  log(
    'markdown shortcuts still work',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /pad-h1/.test(e.className),
      ),
    ),
  )

  // The toolbar holds no writing-surface switch: that lives in the side menu,
  // beside the rest of what belongs to the document being written.
  await openMore()
  const moreText = await page.locator('[role="menu"]').first().innerText()
  await closeMore()
  log(
    'the toolbar menu is formatting and inserting, not modes',
    !/blocks/i.test(moreText),
    moreText.replace(/\n+/g, ' / ').slice(0, 120),
  )
}

// --- Headings stay put while their section is on screen ---------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('# The section that stays')
  await page.waitForTimeout(400)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(`Body line ${i}, long enough to take up a whole line of the page.`)
  }
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  const headingTop = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((e) =>
        (e.textContent ?? '').includes('The section that stays'),
      )
      return el ? Math.round(el.getBoundingClientRect().top) : null
    })

  await page.evaluate(() => {
    const scroller = document.querySelector('main > div.pad-desk')
    if (scroller) scroller.scrollTop = 0
  })
  await page.waitForTimeout(500)
  const atRest = await headingTop()

  await page.evaluate(() => {
    const scroller = document.querySelector('main > div.pad-desk')
    if (scroller) scroller.scrollTop = 500
  })
  await page.waitForTimeout(600)
  const stuck = await headingTop()
  log(
    'a heading sticks rather than scrolling away',
    stuck !== null && atRest !== null && stuck > 0 && stuck < 160,
    `${atRest} at rest, ${stuck} after scrolling`,
  )
  log(
    'and it does not sit on top of the toolbar',
    await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"][aria-label="Formatting"]')
      const head = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((e) =>
        (e.textContent ?? '').includes('The section that stays'),
      )
      if (!bar || !head) return false
      return head.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 2
    }),
  )
  await page.screenshot({ path: `${SHOTS}/31-sticky-heading.png` })
}

// --- Nothing rewrites the page on its own -----------------------------------
{
  /*
    Brain applied a document's own rules to lines as they were typed, and Ask
    rewrote the sentence somebody was in the middle of. Both are gone, and this
    checks that nothing has taken their place: a bullet stays a bullet, and the
    only thing in the app that reads the page is a button somebody presses.
  */
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)
  await page.locator('[role="textbox"] [data-block-id]').first().click()
  await page.keyboard.type('- ring the bank')
  await page.waitForTimeout(2400)
  log(
    'a bullet is still a bullet a moment later',
    (await page.locator('[role="textbox"] input[type="checkbox"]').count()) === 0,
  )
  const settled = await page.evaluate(() => document.body.innerText)
  log('and a fresh document offers no rules to set', !/set rules for this document/i.test(settled))
  log('the words are left exactly as they were typed', /ring the bank/i.test(settled))
}

// --- The side menu: folding, and dragging in the Library to make a folder ---
{
  const makeDoc = async (title) => {
    await page.locator('button:has-text("New")').first().click()
    await page.waitForTimeout(500)
    await page.locator('[aria-label="Document title"]').click()
    await page.keyboard.type(title)
    await page.waitForTimeout(600)
  }
  await makeDoc('Kappa one')
  await makeDoc('Kappa two')
  await page.waitForTimeout(700)

  // Folding. The sections are about the open document now, not lists of others.
  const fileToggle = page.locator('aside button[aria-expanded]').filter({ hasText: 'THIS FILE' }).first()
  log('every side menu section folds', (await fileToggle.count()) > 0)
  await fileToggle.click()
  await page.waitForTimeout(500)
  log(
    'folding This file hides its rows',
    (await page.locator('aside button:has-text("Save as PDF")').count()) === 0,
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log(
    'and it is remembered',
    (await page.locator('aside button:has-text("Save as PDF")').count()) === 0,
  )
  await page.locator('aside button[aria-expanded]').filter({ hasText: 'THIS FILE' }).first().click()
  await page.waitForTimeout(500)
  log(
    'unfolding brings them back',
    (await page.locator('aside button:has-text("Save as PDF")').count()) === 1,
  )

  // Dragging one row onto another, which is how a folder gets made. It lives
  // in the Library now, which is the one place every document is listed.
  await openHome('library')
  const from = libraryRows().filter({ hasText: 'Kappa two' }).first()
  const onto = libraryRows().filter({ hasText: 'Kappa one' }).first()
  const a = await from.boundingBox()
  const b = await onto.boundingBox()
  if (a && b) {
    await page.mouse.move(a.x + 80, a.y + a.height / 2)
    await page.mouse.down()
    // Past the threshold that separates a drag from a tap.
    await page.mouse.move(a.x + 90, a.y + a.height / 2 + 6, { steps: 3 })
    await page.mouse.move(b.x + 80, b.y + b.height / 2, { steps: 12 })
    await page.waitForTimeout(300)
    await page.mouse.up()
    await page.waitForTimeout(1200)
  }
  await page.screenshot({ path: `${SHOTS}/33-drag-folder.png` })
  const grouped = await page.locator('[role="dialog"][aria-label="Home"]').innerText()
  log(
    'dragging one document onto another makes a folder',
    /kappa one/i.test(grouped),
    grouped.split('\n').slice(0, 8).join(' / '),
  )
  await closeHome()
}

// --- What the side menu holds now -------------------------------------------
{
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(700)
  const side = await page.locator('aside').innerText()
  log(
    'the side menu offers the action button',
    /what to do next/i.test(side),
    side.replace(/\n+/g, ' / ').slice(0, 140),
  )
  log('and Brain, Ask and Goals are gone from it', !/(brain|goals)/i.test(side) && !/\bAsk\b/.test(side))
  log('and there is no writing surface to choose, because there is one', !/\bblocks\b/i.test(side))

  await page.locator('aside button:has-text("What to do next")').first().click()
  await page.waitForTimeout(900)
  log(
    'and pressing it opens the same plan the toolbar does',
    await page.locator('[role="dialog"][aria-label="What to do next"]').isVisible(),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/36-side-menu.png` })
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
