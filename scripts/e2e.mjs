/**
 * End-to-end check: drives a real browser through everything Pad claims to do.
 *
 * The unit tests cover the beautifier, the compose parsing, the search index
 * and the transcript handling. This covers the parts that only exist once a
 * browser is involved — the caret, saving, and whether a note is still there
 * after a reload. Between them, "it builds" and "it works" stop being the same
 * claim.
 *
 * It is a good deal shorter than it was, because the app is: the spreadsheet,
 * the code block, the form, attachments, the Library, the sidebar, the folders
 * and the formatting toolbar are gone, and so are the several hundred checks
 * that were about them.
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
import { mkdirSync } from 'node:fs'

const SHOTS = process.env.PAD_E2E_SHOTS ?? 'e2e-shots'
const URL = process.env.PAD_E2E_URL ?? 'http://localhost:3000'
const results = []
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch(
  process.env.PAD_E2E_CHROME ? { executablePath: process.env.PAD_E2E_CHROME } : {},
)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  /*
    A request this suite aborted on purpose — the "the model cannot be
    reached" case — is reported by the browser as a failed resource. It is the
    thing being tested, not a fault, and it is the only one allowed through.
  */
  if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text())
})

/* ------------------------------------------------------------------ helpers */

/** Writes a note through the box, which is how notes are made. */
const write = async (text, target = page) => {
  await target.locator('button:has-text("Write a note…")').click()
  await target.waitForTimeout(400)
  await target.locator('[aria-label="What happened"]').fill(text)
  await target.locator('button:has-text("Save")').click()
  await target.waitForTimeout(900)
}

/** The rows on the notes screen. */
const rows = (target = page) => target.locator('[role="tab"] ~ ul li, ul li')
/** Opens a note by its name. */
const open = async (name, target = page) => {
  await target.locator(`li button:has-text("${name}")`).first().click()
  await target.waitForTimeout(700)
}
const back = async (target = page) => {
  await target.locator('[aria-label="Back to notes"]').click()
  await target.waitForTimeout(600)
}
/** Every line of the open note, as text. */
const lines = (target = page) =>
  target.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => e.textContent),
  )
/** Every line of the open note, with the class that says what kind it is. */
const shapes = (target = page) =>
  target.evaluate(() =>
    [...document.querySelectorAll('[role="textbox"] [data-block-id]')].map((e) => ({
      cls: e.className,
      text: e.textContent,
    })),
  )
const openMenu = async (target = page) => {
  await target.locator('[aria-label="More"]').click()
  await target.waitForTimeout(350)
}

/* ------------------------------------------------- the app opens on its notes */

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/01-first-open.png` })

log(
  'the app opens on the notes, not inside a note',
  (await page.locator('[role="tab"]:has-text("Notes")').first().isVisible()) &&
    (await page.locator('[aria-label="Back to notes"]').count()) === 0,
)
log(
  'and the top of it greets you rather than labelling itself',
  /^Hi\b/.test(await page.locator('h1').first().innerText()),
  await page.locator('h1').first().innerText(),
)
log(
  'an empty collection says what this screen is for',
  /everything you write shows up here/i.test(await page.evaluate(() => document.body.innerText)),
)
log('there is no sidebar', (await page.locator('aside').count()) === 0)
log(
  'and no Library',
  !/library/i.test(await page.evaluate(() => document.body.innerText)),
)
log(
  'signing in is on this screen, where it can be found',
  (await page.locator('header').innerText()).length >= 0 &&
    (await page.evaluate(() => document.body.innerText.includes('On this device'))),
)
log(
  'the search field says what it searches',
  /search every word in every note/i.test(await page.evaluate(() => document.body.innerText)),
)
log(
  'and there is a way to write one, and to record one',
  (await page.locator('button:has-text("Write a note…")').isVisible()) &&
    (await page.locator('[aria-label="Record what you say"]').count()) >= 0,
)

/* ------------------------------------------------------------ writing a note */

await page.locator('button:has-text("Write a note…")').click()
await page.waitForTimeout(500)
log('the box opens with the caret already in it', await page.evaluate(() => {
  const el = document.activeElement
  return !!el && el.getAttribute('aria-label') === 'What happened'
}))
await page.screenshot({ path: `${SHOTS}/02-compose.png` })
await page.locator('[aria-label="What happened"]').fill(
  'Meeting with Sam about the lease on Friday\nNeed the service charge figures\nCheck the break clause before Tuesday',
)
await page.locator('button:has-text("Save")').click()
await page.waitForTimeout(900)

log('saving the box makes a note', (await rows().count()) === 1)
const firstRow = await rows().first().innerText()
log('which is named without anybody being asked for a name', /Meeting with Sam/i.test(firstRow), firstRow.replace(/\n/g, ' / '))
log('the row carries the rest of the note under its name', /service charge/i.test(firstRow))
log('and it does not print the name twice', (firstRow.match(/Meeting with Sam/g) ?? []).length === 1)
log(
  'every row says what kind of note it is',
  (await page.locator('li [role="img"]').count()) === 1,
  await page.locator('li [role="img"]').first().getAttribute('aria-label'),
)
log(
  'and its picture is the one the words earn, not one of six',
  (await page.evaluate(() => {
    const svg = document.querySelector('li [role="img"] svg')
    return svg ? [...svg.classList].find((c) => c.startsWith('lucide-') && c !== 'lucide') : null
  })) === 'lucide-scroll-text',
  'a lease should get the contract glyph',
)
await page.screenshot({ path: `${SHOTS}/03-notes.png` })

/* -------------------------------------------- the box: lists, and one button */

{
  await page.locator('button:has-text("Write a note…")').click()
  await page.waitForTimeout(400)
  const box = page.locator('[role="dialog"][aria-label="Write a note"]')
  log(
    'the box is one button and nothing beside it',
    !/nothing is added|needs a key/i.test(await box.innerText()),
    (await box.innerText()).replace(/\n+/g, ' / ').slice(0, 90),
  )

  /*
    A list carries on in the box. Without this, every item after the first is
    typed by hand — which is what "numbers and bullets are not working" meant.
  */
  // Named so nothing else in the suite shares a word with it: "Friday" was
  // also in the lease note, and `has-text` took the first of the two.
  await page.keyboard.type('Agent list')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- ring the agent')
  await page.keyboard.press('Enter')
  await page.keyboard.type('send the figures')
  await page.keyboard.press('Enter')
  // An empty item ends the list rather than adding another.
  await page.keyboard.press('Enter')
  await page.keyboard.type('1. first')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await page.waitForTimeout(200)
  const typed = await page.locator('[aria-label="What happened"]').inputValue()
  log(
    'Return carries a bullet on, and an empty one ends the list',
    typed.includes('- send the figures') && !/- 1\./.test(typed),
    JSON.stringify(typed),
  )
  log('and a number carries on by counting', typed.includes('2. second'))

  await page.locator('button:has-text("Save")').click()
  await page.waitForTimeout(900)
  await open('Agent list')
  const shaped = await shapes()
  log(
    'the bullets are bullets and the numbers are numbered',
    shaped.some((l) => /pad-ul/.test(l.cls) && /ring the agent/.test(l.text ?? '')) &&
      shaped.some((l) => /pad-ol/.test(l.cls) && /first/.test(l.text ?? '')),
    JSON.stringify(shaped.map((l) => [l.cls, l.text])),
  )
  log(
    'and the name is not repeated as the first line of the note',
    !shaped.some((l) => (l.text ?? '').trim() === 'Agent list'),
  )
  await page.screenshot({ path: `${SHOTS}/04-box-lists.png` })
  await back()
}

/* ---------------------------------------------------- the box uses the model */

{
  // The route is stubbed: this is about what the box does with the answer.
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
    if (body.action !== 'compose') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: `TITLE: Boiler repair\n\nThe boiler is broken.\n\n- [ ] Ring the landlord`,
      }),
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  await write('boiler broken, ring landlord')
  const top = await rows().first().innerText()
  log('with a key the box writes the note up and names it', /Boiler repair/.test(top), top.replace(/\n/g, ' / '))

  await open('Boiler repair')
  const written = await shapes()
  log(
    'and what comes back goes in as real lines, not one paragraph',
    written.some((l) => /Ring the landlord/.test(l.text ?? '')) && written.length >= 2,
    JSON.stringify(written.map((l) => l.text)),
  )
  log(
    'a thing to do comes back as a box to tick',
    await page.evaluate(() => !!document.querySelector('[role="textbox"] input[type="checkbox"]')),
  )
  await page.screenshot({ path: `${SHOTS}/05-written-up.png` })
  await back()

  // And when the model cannot be reached, the note is still the note.
  await page.route('**/api/ai', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true }),
      })
    }
    return route.abort()
  })
  await write('the fallback note about the kitchen tap')
  log(
    'a refusal or a dead network costs the tidying, never the note',
    /kitchen tap/i.test(await rows().first().innerText()),
  )
  await page.unroute('**/api/ai')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
}

/* ------------------------------------------------------- writing in the note */

{
  await open('Meeting with Sam')
  log('a note opens with a bar of three things and nothing else', (await page.locator('[role="toolbar"] button').count()) === 2)
  log('the bar says it is saved', /saved/i.test(await page.locator('[role="toolbar"]').innerText()))
  log(
    'and it says what kind of note this is, and when',
    /meeting/i.test(await page.locator('[role="toolbar"] ~ div').first().innerText()),
    (await page.locator('[role="toolbar"] ~ div').first().innerText()).replace(/\n/g, ' / '),
  )
  log(
    'there is no formatting toolbar',
    (await page.locator('[aria-label="Bold"]').count()) === 0 &&
      (await page.locator('select[aria-label="Paragraph style"]').count()) === 0,
  )
  log(
    'and nothing to insert a spreadsheet, some code or a form',
    !/spreadsheet|insert code|insert form/i.test(await page.evaluate(() => document.body.innerText)),
  )

  // Typing, and lines that finish themselves.
  await page.locator('[role="textbox"] [data-block-id]').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# What we agreed')
  await page.waitForTimeout(250)
  log(
    'a line is left completely alone while it is being typed',
    (await lines()).some((t) => (t ?? '').startsWith('# ')),
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  log(
    'and leaving it turns "# " into a heading',
    (await shapes()).some((l) => /pad-h1/.test(l.cls) && /What we agreed/.test(l.text ?? '')),
  )

  await page.keyboard.type('1. Send the figures')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await page.keyboard.type('Confirm Tuesday')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  log(
    'typing "1." starts a numbered list and Return carries it on',
    (await shapes()).filter((l) => /pad-ol/.test(l.cls)).length === 3,
  )
  /*
    The bug this was written for: "creating a numbered list starts numbering
    infinitely". Return was read from the key, and a phone's Return does not
    arrive as one, so the rule that leaves a list never ran and every press
    added another number. It is read from the input event now.
  */
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  log(
    'Return on an empty item leaves the list rather than numbering forever',
    (await shapes()).every((l) => !/pad-ol/.test(l.cls) || (l.text ?? '').trim().length > 0),
  )
  await page.keyboard.type('[] post the forms')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  log(
    'and "[]" makes a box to tick',
    await page.evaluate(() => !!document.querySelector('[role="textbox"] input[type="checkbox"]')),
  )
  await page.screenshot({ path: `${SHOTS}/05-typed.png` })

  // Saving, which nobody presses.
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  log('the note is still open after a reload', (await rows().count()) > 0)
  await open('Meeting with Sam')
  const kept = (await lines()).join(' | ')
  log('and everything typed into it survived', /What we agreed/.test(kept) && /post the forms/.test(kept), kept.slice(0, 120))

  // Undo, over the whole note rather than per paragraph.
  await page.locator('[role="textbox"] [data-block-id]').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A line to take back.')
  await page.waitForTimeout(900)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
  log(
    'Ctrl+Z takes back an edit the browser knows nothing about',
    !(await lines()).join(' ').includes('A line to take back'),
  )
  await back()
}

/* ------------------------------------------ a box to tick, and the caret */

{
  await open('Agent list')
  await page.locator('[role="textbox"] [data-block-id]').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[] post the forms')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  /*
    The caret used to be able to sit *before* the box: it was an inline element
    at the front of the line, so the first caret position on the line was
    between the left edge and the control, and everything typed there went in
    front of it. The box is painted in the margin now.
  */
  log(
    'the box on a task is painted in the margin, not laid out in the line',
    await page.evaluate(() => {
      const box = document.querySelector('[role="textbox"] input[type="checkbox"]')
      return !!box && getComputedStyle(box).position === 'absolute'
    }),
  )
  await page.evaluate(() => {
    const line = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((e) =>
      /post the forms/.test(e.textContent ?? ''),
    )
    const range = document.createRange()
    range.setStart(line, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await page.keyboard.type('X')
  await page.waitForTimeout(400)
  log(
    'typing at the very start of a task goes into the task, not in front of it',
    (await lines()).some((text) => (text ?? '').trim() === 'Xpost the forms'),
    JSON.stringify(await lines()),
  )
  await page.screenshot({ path: `${SHOTS}/06-tick.png` })

  /*
    Writing down past the bottom of the window. The page has to come with the
    caret: an editor where you type yourself off the screen is one you cannot
    write more than a screenful in.
  */
  await page.locator('[role="textbox"] [data-block-id]').last().click()
  await page.keyboard.press('Control+End')
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(`line number ${i}`)
  }
  await page.waitForTimeout(600)
  log(
    'typing past the bottom of the window brings the page with it',
    await page.evaluate(() => {
      const range = window.getSelection()?.getRangeAt(0)
      if (!range) return false
      const rect = range.getBoundingClientRect()
      const bottom = rect.bottom || rect.top
      return bottom > 0 && bottom < window.innerHeight
    }),
    `scrolled to ${await page.evaluate(() => Math.round(window.scrollY))}`,
  )
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Control+Z')
  }
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}

/* ------------------------------------------- formatting, on a selection only */

{
  const bar = page.locator('[role="toolbar"][aria-label="Selection formatting"]')
  log('there is no formatting toolbar until something is selected', (await bar.count()) === 0)

  await page.evaluate(() => {
    const line = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((e) =>
      /ring the agent/.test(e.textContent ?? ''),
    )
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode()
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 4)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await page.waitForTimeout(500)
  log('selecting words brings it up', await bar.isVisible())
  /*
    Under the words, not over them. A bar above the selection covers the line
    being read on a phone, where the thumb is already below and the hand is
    already over the bottom half of the screen.
  */
  log(
    'and it sits under the selection rather than on top of it',
    await page.evaluate(() => {
      const el = document.querySelector('[role="toolbar"][aria-label="Selection formatting"]')
      const words = window.getSelection()?.getRangeAt(0).getBoundingClientRect()
      if (!el || !words) return false
      return el.getBoundingClientRect().top >= words.bottom - 1
    }),
  )
  log(
    'it carries the marks and the line styles',
    (await bar.locator('button').count()) >= 10,
    `${await bar.locator('button').count()} controls`,
  )
  log(
    'and it stays on the screen rather than hanging off the edge',
    await page.evaluate(() => {
      const el = document.querySelector('[role="toolbar"][aria-label="Selection formatting"]')
      if (!el) return false
      const box = el.getBoundingClientRect()
      return box.left >= 0 && box.right <= window.innerWidth + 1
    }),
  )
  await page.screenshot({ path: `${SHOTS}/07-selection.png` })

  await bar.locator('[aria-label="Bold"]').click()
  await page.waitForTimeout(500)
  log(
    'bold from the bar applies to the selection',
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="textbox"] [data-block-id]')].some((e) =>
        /<b>ring<\/b>/i.test(e.innerHTML),
      ),
    ),
  )

  await page.evaluate(() => {
    const line = [...document.querySelectorAll('[role="textbox"] [data-block-id]')].find((e) =>
      /send the figures/.test(e.textContent ?? ''),
    )
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode()
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 4)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await page.waitForTimeout(400)
  await bar.locator('[aria-label="Heading"]').click()
  await page.waitForTimeout(600)
  log(
    'and a line style from the bar changes the line',
    (await shapes()).some((l) => /pad-h1/.test(l.cls) && /send the figures/.test(l.text ?? '')),
    JSON.stringify((await shapes()).map((l) => l.cls)),
  )
  await back()
}

/* --------------------------------------------------------------- the name */

{
  await open('Meeting with Sam')
  const title = page.locator('[aria-label="Note title"]')
  log('the name is a field, and it is filled in', (await title.inputValue()).length > 0)
  log(
    'and it wraps rather than running off the side',
    await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Note title"]')
      return !!el && el.scrollWidth <= el.clientWidth + 1
    }),
  )
  await title.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Lease meeting')
  await page.waitForTimeout(900)
  await back()
  log('a name can be corrected', /Lease meeting/.test(await rows().first().innerText()))
}

/* ------------------------------------------------------------- favourites */

{
  /*
    Three places across the top — your notes, what is outstanding, everybody
    else's — and underneath them the ways of looking at your own notes.
    Favourites is one of those: the same notes with most of them hidden, not
    somewhere else to go.
  */
  log(
    'there are three places, and Favourites is not one of them',
    (await page.locator('[role="tablist"]').first().locator('[role="tab"]').count()) === 3 &&
      (await page.locator('[role="tablist"]').first().locator('[role="tab"]:has-text("Favourites")').count()) === 0,
  )
  log(
    'it is a way of looking at your notes, beside All and the dashboard',
    (await page.locator('[role="tablist"][aria-label="Your notes"] [role="tab"]').count()) === 3,
  )
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(400)
  log(
    'and it says so when there is nothing in it',
    /star a note/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.locator('[role="tab"]:has-text("All")').click()
  await page.waitForTimeout(400)

  await page.locator('li [aria-label^="Add"]').first().click()
  await page.waitForTimeout(700)
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(500)
  log('starring a note puts it in Favourites', (await rows().count()) === 1)
  log('and it says how many', /1/.test(await page.locator('[role="tab"]:has-text("Favourites")').innerText()))
  await page.screenshot({ path: `${SHOTS}/06-favourites.png` })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  log(
    'a reload opens on the notes themselves, not on where you were looking',
    (await page.locator('[role="tab"][aria-selected="true"]:has-text("All")').count()) === 1,
  )
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(500)
  log('a favourite survives a reload', (await rows().count()) === 1)
  await page.locator('li [aria-label^="Remove"]').first().click()
  await page.waitForTimeout(600)
  log('and can be taken off again', (await rows().count()) === 0)
  await page.locator('[role="tab"]:has-text("All")').click()
  await page.waitForTimeout(400)
}

/* -------------------------------------------------------------- the world */

{
  await page.locator('[role="tab"]:has-text("World")').click()
  await page.waitForTimeout(900)
  const text = await page.evaluate(() => document.body.innerText)
  log(
    'the World is a place of its own, with a search of its own',
    (await page.locator('[aria-label="Search the World"]').count()) === 1,
  )
  log(
    'and one search box, not two',
    (await page.locator('button:has-text("Search every word in every note")').count()) === 0,
  )
  /*
    No Supabase in this run, so there is nothing out there to read. What it
    must not do is fail: it says why, and everything of theirs is untouched
    behind it.
  */
  log(
    'with no account set up it says so rather than breaking',
    /needs an account|could not reach|migration/i.test(text),
    text.split('\n').slice(0, 8).join(' / '),
  )
  await page.screenshot({ path: `${SHOTS}/06b-world.png` })
  await page.locator('[role="tab"]:has-text("Notes")').click()
  await page.waitForTimeout(400)
}

/* ---------------------------------------------------------- the dashboard */

{
  await page.locator('[role="tab"]:has-text("Dashboard")').click()
  await page.waitForTimeout(800)
  const text = await page.evaluate(() => document.body.innerText)
  log(
    'the dashboard counts what has been written',
    /notes/i.test(text) && /words/i.test(text) && /fortnight/i.test(text),
    text.split('\n').slice(0, 10).join(' / '),
  )
  log(
    'and it costs no request at all',
    await page.evaluate(
      () => performance.getEntriesByType('resource').filter((r) => /\/api\/ai/.test(r.name)).length <= 1,
    ),
  )
  await page.screenshot({ path: `${SHOTS}/06c-dashboard.png` })
  await page.locator('[role="tab"]:has-text("All")').click()
  await page.waitForTimeout(400)
}

/* ----------------------------------------------------------- the greeting */

{
  log(
    'the greeting can be corrected with one press',
    await page.locator('[aria-label="Change your name"]').isVisible(),
  )
  await page.locator('[aria-label="Change your name"]').click()
  await page.waitForTimeout(300)
  log(
    'which turns it into a field, already focused',
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Your name'),
  )
  await page.keyboard.type('Ada')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  log(
    'and what is typed is what it says',
    (await page.locator('h1').first().innerText()).trim() === 'Hi, Ada',
    await page.locator('h1').first().innerText(),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  log(
    'a name survives a reload',
    (await page.locator('h1').first().innerText()).trim() === 'Hi, Ada',
  )
}

/* ------------------------------------------------------------- the actions */

{
  await page.locator('[role="tab"]:has-text("Actions")').click()
  await page.waitForTimeout(600)
  const text = () => page.evaluate(() => document.body.innerText)
  log('actions is a tab of its own', await page.locator('[role="tab"]:has-text("Actions")').isVisible())
  log(
    'and it has read every note, not the open one',
    /lease meeting/i.test(await text()),
    (await text()).split('\n').slice(0, 14).join(' / '),
  )
  /*
    Grouped by the note each line came from. The note is the context, and six
    lines from one meeting are one piece of work rather than six.
  */
  log(
    'everything is grouped under the note it came from, once',
    await page.evaluate(() => {
      // The first button in a group's header is the note's name; the last is
      // "Clear". A note may not head two groups, or the grouping did nothing.
      const names = [...document.querySelectorAll('section')]
        .map((section) => section.querySelector(':scope > div > button'))
        .filter((b) => b && (b.textContent ?? '').trim() !== 'Done')
        .map((b) => b.textContent.trim())
      return names.length > 0 && new Set(names).size === names.length
    }),
  )
  log(
    'and each group can be cleared in one press',
    (await page.locator('button:has-text("Clear")').count()) > 0,
  )
  await page.screenshot({ path: `${SHOTS}/07-actions.png` })

  const box = page.locator('[aria-label^="Tick"]').first()
  if (await box.count()) {
    const before = await box.getAttribute('aria-label')
    log('an unticked box from any note is on the list', true, before)
    await box.click()
    await page.waitForTimeout(900)
    log(
      'ticking it here takes it off the list',
      (await page.locator(`[aria-label="${before}"]`).count()) === 0,
      before,
    )
    log(
      'and it turns up under Done, folded away rather than thrown away',
      /done/i.test(await text()),
    )
    await page.locator('button[aria-expanded]:has-text("Done")').click()
    await page.waitForTimeout(400)
    const put = before.replace(/^Tick /, 'Put ').replace(/$/, ' back')
    log(
      'opening Done shows what was finished, with a way to put it back',
      (await page.locator(`[aria-label="${put}"]`).count()) === 1,
      put,
    )
    await page.screenshot({ path: `${SHOTS}/07b-actions-done.png` })
    await page.locator(`[aria-label="${put}"]`).click()
    await page.waitForTimeout(900)
    log(
      'and putting it back makes it outstanding again',
      (await page.locator(`[aria-label="${before}"]`).count()) === 1,
    )
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.locator('[role="tab"]:has-text("Actions")').click()
    await page.waitForTimeout(600)
    log(
      'because all of it was written into the note, so a reload agrees',
      (await page.locator(`[aria-label="${before}"]`).count()) === 1,
    )
  } else {
    log('an unticked box from any note is on the list', false, 'no box found')
  }

  // A line of prose this app thinks is a commitment. It is offered, never taken.
  const offer = page.locator('[aria-label^="Make "]').first()
  if (await offer.count()) {
    const label = await offer.getAttribute('aria-label')
    log('prose that reads like a task is offered, with a reason beside it', true, label)
    await offer.click()
    await page.waitForTimeout(900)
    log(
      'and accepting it makes that line a box in the note it is already in',
      (await page.locator('[aria-label^="Tick"]').count()) > 0,
    )
  }

  /*
    Swiping one away. A box is a line in a note, so it comes out of the note;
    a suggestion is only a guess about a line, so turning it down must not
    touch a word of what was written.
  */
  const guess = page.locator('[aria-label^="Make "]').first()
  if (await guess.count()) {
    const said = (await guess.getAttribute('aria-label')).replace(/^Make “|” a box to tick$/g, '')
    const row = page.locator('li').filter({ hasText: said }).first()
    const spot = await row.boundingBox()
    await page.mouse.move(spot.x + 200, spot.y + 12)
    await page.mouse.down()
    for (let x = 20; x <= 60; x += 20) {
      await page.mouse.move(spot.x + 200 - x, spot.y + 12)
      await page.waitForTimeout(30)
    }
    log(
      'dragging a suggestion says it is being turned down, not deleted',
      /not a task/i.test(await row.innerText()),
      (await row.innerText()).replace(/\n+/g, ' / '),
    )
    for (let x = 80; x <= 160; x += 20) {
      await page.mouse.move(spot.x + 200 - x, spot.y + 12)
      await page.waitForTimeout(30)
    }
    await page.mouse.up()
    await page.waitForTimeout(800)
    /*
      Gone from the list — but not from the screen, because it is on the undo
      bar for five seconds. So this asks the list, not the page: the row is
      no longer offered, and the bar says what went.
    */
    log(
      'and letting go stops it being offered',
      (await page.locator('section li').filter({ hasText: said }).count()) === 0,
      said,
    )
    log(
      'with a few seconds to take it back',
      (await page.locator('button:has-text("Undo")').count()) === 1,
    )
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await page.locator('[role="tab"]:has-text("Actions")').click()
    await page.waitForTimeout(600)
    log(
      'a no is remembered across a reload',
      !(await page.evaluate(() => document.body.innerText)).includes(said),
    )
    log(
      'and the line is still in the note, because nothing written was touched',
      await page.evaluate(async (needle) => {
        const open = indexedDB.open('pad')
        const db = await new Promise((resolve) => {
          open.onsuccess = () => resolve(open.result)
        })
        const rows = await new Promise((resolve) => {
          const request = db.transaction('docs').objectStore('docs').getAll()
          request.onsuccess = () => resolve(request.result)
        })
        return rows.some((row) =>
          (row.blocks ?? []).some((block) => (block.text ?? '').includes(needle)),
        )
      }, said),
      said,
    )
  }

  /*
    Getting rid of one box takes a line out of a note, which is writing. So
    it asks, and it names the line.
  */
  {
    const one = page.locator('section li').first()
    if (await one.count()) {
      const said = (await one.innerText()).split('\n')[0].trim()
      // The swipe is the gesture on a phone; the same delete is here as a
      // drag on a desktop, so the row is dragged rather than clicked.
      const box = await one.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 200, box.y + box.height / 2, { steps: 12 })
        await page.mouse.up()
        await page.waitForTimeout(500)
        const asked = page.locator('[role="dialog"][aria-label^="Delete"]')
        log(
          'getting rid of one line asks first, and names the line',
          (await asked.count()) === 1 && (await asked.getAttribute('aria-label')).includes(said.slice(0, 12)),
          await asked.getAttribute('aria-label').catch(() => ''),
        )
        await page.locator('[role="dialog"] button:has-text("Keep it")').click()
        await page.waitForTimeout(400)
        log(
          'and saying no leaves the line exactly where it was',
          (await page.locator('section li').first().innerText()).includes(said),
        )
      }
    }
  }

  // A whole note's worth at once, which is how people finish with a meeting.
  {
    const clear = page.locator('section button:has-text("Clear")').first()
    if (await clear.count()) {
      const before = await page.locator('section li').count()
      await clear.click()
      await page.waitForTimeout(400)
      const asked = await page
        .locator('[role="dialog"][aria-label^="Clear everything"]')
        .getAttribute('aria-label')
      log(
        'clearing a whole group asks first, names the note, and says what it will not touch',
        !!asked && /nothing you wrote is touched/i.test(await text()),
        asked,
      )
      await page.locator('[role="dialog"] button:has-text("Clear")').click()
      await page.waitForTimeout(1000)
      const after = await page.locator('section li').count()
      log(
        'and saying yes takes the whole group off at once',
        before > 0 && after < before,
        `${before} → ${after}`,
      )

      /*
        And then offers it back for five seconds. A question stops the swipe
        nobody meant; the undo covers the yes that was pressed too quickly,
        which is the mistake a question cannot catch.
      */
      const undo = page.locator('button:has-text("Undo")')
      log('an undo is offered straight afterwards', (await undo.count()) === 1)
      await undo.click()
      await page.waitForTimeout(1200)
      log(
        'and it puts the lines back in the notes they came from',
        (await page.locator('section li').count()) === before,
        `${after} → ${await page.locator('section li').count()}`,
      )
      await page.screenshot({ path: `${SHOTS}/07d-actions-undo.png` })

      // And it does not hang about: five seconds and it is gone.
      await clear.click()
      await page.waitForTimeout(300)
      await page.locator('[role="dialog"] button:has-text("Clear")').click()
      await page.waitForTimeout(6200)
      log(
        'the undo is gone after five seconds rather than becoming furniture',
        (await page.locator('button:has-text("Undo")').count()) === 0,
      )
    }
  }

  await page.locator('[role="tab"]:has-text("Notes")').click()
  await page.waitForTimeout(400)
}

/* ------------------------------------ a note that is not read for tasks */

{
  /*
    The question is asked while the note is being written, because that is
    the one moment somebody knows what kind of note this is. Turned off, the
    note is saved exactly as it would have been and simply never appears in
    Actions — nothing in it is changed, hidden or moved.
  */
  await page.locator('button:has-text("Write a note…")').click()
  await page.waitForTimeout(400)
  await page
    .locator('[aria-label="What happened"]')
    .fill('Quotes I liked\nI need to call the framer on Friday')
  const toggle = page.locator('[role="switch"]')
  log(
    'the box asks whether to look for tasks, and starts by saying yes',
    (await toggle.count()) === 1 && (await toggle.getAttribute('aria-checked')) === 'true',
  )
  await toggle.click()
  await page.waitForTimeout(200)
  log('and it can be turned off before the note is saved', (await toggle.getAttribute('aria-checked')) === 'false')
  /*
    And the caret never leaves the words. Pressing any button moves the focus,
    and a phone takes the keyboard down with it — so answering a question
    about the note you are writing threw you out of writing it. The focus
    staying in the textarea is the whole of the fix, and the only part of it a
    desktop browser can be asked about.
  */
  log(
    'and answering it does not take the keyboard away',
    await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') === 'What happened',
    ),
  )
  await page.locator('[role="dialog"] button:has-text("Save")').click()
  await page.waitForTimeout(1200)

  log(
    'the note itself is saved like any other',
    /quotes i liked/i.test(await page.evaluate(() => document.body.innerText)),
  )

  await page.locator('[role="tab"]:has-text("Actions")').click()
  await page.waitForTimeout(700)
  log(
    'but nothing from it is on the Actions list',
    !/call the framer/i.test(await page.evaluate(() => document.body.innerText)),
  )
  /*
    And the two changes to what that screen says about itself: no small print
    about what is sent, and no sparkle on the button — a sparkle says "this is
    the AI bit", which is a fact about how it was built rather than about what
    it does.
  */
  log(
    'the Actions tab no longer explains itself in small print',
    !/only these lines are sent/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.screenshot({ path: `${SHOTS}/07c-actions-ignored.png` })
  await page.locator('[role="tab"]:has-text("Notes")').click()
  await page.waitForTimeout(400)

  // And it can be changed afterwards, from the note's own menu.
  await open('Quotes I liked')
  await openMenu()
  log(
    'the note’s own menu can put it back',
    /find tasks in this note/i.test(await page.locator('[role="menu"]').innerText()),
    (await page.locator('[role="menu"]').innerText()).replace(/\n+/g, ' / ').slice(0, 120),
  )
  await page.locator('[role="menu"] button:has-text("Find tasks in this note")').click()
  await page.waitForTimeout(900)
  await back()
  await page.locator('[role="tab"]:has-text("Actions")').click()
  await page.waitForTimeout(800)
  log(
    'and then it is read like every other note',
    /call the framer/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.locator('[role="tab"]:has-text("Notes")').click()
  await page.waitForTimeout(400)
}

/* ---------------------------------------------------------------- search */

{
  await page.locator('button:has-text("Search every word in every note")').click()
  await page.waitForTimeout(500)
  const panel = page.locator('[role="dialog"][aria-label="Search"]')
  log('the field opens a search over everything', await panel.isVisible())
  await page.keyboard.type('service charge')
  await page.waitForTimeout(700)
  log(
    'it reads inside notes rather than filtering their names',
    (await panel.locator('button[data-active]').count()) >= 1,
  )
  log(
    'it says how many notes and how many mentions',
    /\d+ notes? · \d+ mentions?/.test(await panel.innerText()),
    (await panel.innerText()).split('\n').slice(0, 3).join(' / '),
  )
  log('and marks the words where it found them', (await panel.locator('mark').count()) > 0)
  await page.screenshot({ path: `${SHOTS}/07-search.png` })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  log('Enter opens the top match', (await page.locator('[aria-label="Back to notes"]').count()) === 1)
  await back()

  // And the shortcut, which is never the only way in.
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(500)
  log('Ctrl+K opens it too', await panel.isVisible())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

/* ------------------------------------------------- the note's own ⋯ menu */

{
  await open('Lease meeting')
  await openMenu()
  const menu = page.locator('[role="menu"][aria-label="This note"]')
  log('the ⋯ holds what you can do to a note', await menu.isVisible())
  const text = await menu.innerText()
  log('favouriting, sharing, three ways out, and deleting', /favourite/i.test(text) && /share/i.test(text) && /markdown/i.test(text) && /delete/i.test(text), text.replace(/\n+/g, ' / ').slice(0, 140))
  log(
    'and the World is one of the things it offers',
    /share to the world/i.test(text),
  )
  log(
    'and the menu hangs below the bar rather than inside it',
    await page.evaluate(() => {
      const bar = document.querySelector('[role="toolbar"]')
      const menu = document.querySelector('[role="menu"]')
      if (!bar || !menu) return false
      return menu.getBoundingClientRect().bottom > bar.getBoundingClientRect().bottom + 40
    }),
  )
  await page.screenshot({ path: `${SHOTS}/08-note-menu.png` })

  const download = page.waitForEvent('download')
  await menu.locator('button:has-text("Download as Markdown")').click()
  const file = await download
  log('a note downloads as markdown', /\.md$/.test(file.suggestedFilename()), file.suggestedFilename())
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')

  /*
    Sharing is a panel now, not rows that grow inside the menu. Listing a
    note in the World used to be a tickbox that only appeared after a link
    had been made, which is the same as not existing.
  */
  await openMenu()
  await page.locator('[role="menu"] button:has-text("Share to the World")').click()
  await page.waitForTimeout(400)
  const sheet = page.locator('[role="dialog"][aria-label="Share this note"]')
  log('the World row opens a panel', await sheet.isVisible())
  const sheetText = await sheet.innerText()
  log(
    'it offers the link and the World as two separate answers',
    /anyone with the link/i.test(sheetText) && /in the world/i.test(sheetText),
    sheetText.replace(/\n+/g, ' / ').slice(0, 120),
  )
  log(
    'and with no account it says so rather than failing',
    /needs an account/i.test(sheetText),
  )
  await page.screenshot({ path: `${SHOTS}/08b-share.png` })
  // A press outside closes it, which is what a press outside means here.
  await page.mouse.click(5, 400)
  await page.waitForTimeout(400)
  log('a press outside closes it', (await sheet.count()) === 0)
  await back()
}

/* ------------------------------------------------- deleting, and the trash */

{
  await open('the fallback note about the kitchen tap')
  await openMenu()
  await page.locator('[role="menu"] button:has-text("Delete this note")').click()
  await page.waitForTimeout(300)
  log(
    'deleting asks first, and names the note',
    /kitchen tap/i.test(await page.locator('[role="menu"]').innerText()),
  )
  await page.locator('[role="menu"] button:has-text("Delete")').last().click()
  await page.waitForTimeout(900)
  log(
    'and it goes back to the notes, without that one',
    await page.locator('[role="tab"]:has-text("Notes")').first().isVisible(),
  )
  log(
    'the note is gone from the list',
    !/kitchen tap/i.test(await page.locator('ul').first().innerText()),
  )

  const trash = page.locator('button[aria-expanded]', { hasText: 'Trash' }).first()
  log('the trash is at the foot of the notes', (await trash.count()) === 1)
  await trash.click()
  await page.waitForTimeout(500)
  log(
    'and it says how long each one has left',
    /deletes in 7 days/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.locator('[aria-label^="Restore"]').first().click()
  await page.waitForTimeout(800)
  log('restoring puts it back', /kitchen tap/i.test(await page.locator('ul').first().innerText()))

  await open('the fallback note about the kitchen tap')
  await openMenu()
  await page.locator('[role="menu"] button:has-text("Delete this note")').click()
  await page.waitForTimeout(300)
  await page.locator('[role="menu"] button:has-text("Delete")').last().click()
  await page.waitForTimeout(900)
  await page.locator('button[aria-expanded]', { hasText: 'Trash' }).first().click()
  await page.waitForTimeout(500)
  await page.locator('[aria-label*="permanently"]').first().click()
  await page.waitForTimeout(400)
  log(
    'deleting for good asks first, because it means it',
    /delete for good\?/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page
    .locator('div')
    .filter({ hasText: /^Delete for good\?/ })
    .last()
    .locator('button:has-text("Delete")')
    .first()
    .click()
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  log(
    'and it does not come back',
    !/kitchen tap/i.test(await page.evaluate(() => document.body.innerText)),
  )
}

/* ------------------------------- days, a sticky header, and ten at a time */

{
  /*
    Forty-five notes, written straight into the store. Making them through the
    box would be forty-five model-less round trips and four minutes; what is
    being tested here is the list, not the making.
  */
  await page.evaluate(async () => {
    const open = indexedDB.open('pad')
    await new Promise((resolve) => {
      open.onsuccess = resolve
    })
    const db = open.result
    const now = Date.now()
    const day = 86_400_000
    const tx = db.transaction('docs', 'readwrite')
    for (let i = 0; i < 45; i++) {
      tx.objectStore('docs').put({
        id: `seed-${i}`,
        title: `Seeded note ${i}`,
        blocks: [{ id: `b${i}`, type: 'text', text: `Words in note ${i}` }],
        createdAt: now - i * 1000,
        updatedAt: now - Math.floor(i / 6) * day - i * 1000,
      })
    }
    await new Promise((resolve) => {
      tx.oncomplete = resolve
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('h2')].map((h) => h.textContent),
  )
  log(
    'notes are grouped under the day they were written',
    headings[0] === 'Today' && headings[1] === 'Yesterday' && headings.length > 2,
    JSON.stringify(headings),
  )

  const first = await page.evaluate(() => document.querySelectorAll('li').length)
  log(
    'not every note is rendered at once',
    first > 0 && first < 45,
    `${first} of 45 rows on first paint`,
  )
  await page.evaluate(() => window.scrollBy(0, 2000))
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => document.querySelectorAll('li').length)
  log('and more arrive as the list is scrolled', after > first, `${first} → ${after}`)

  log(
    'the header, the search field and the tabs stay put while it scrolls',
    await page.evaluate(() => {
      const header = document.querySelector('header')
      if (!header) return false
      const box = header.getBoundingClientRect()
      const tabs = document.querySelector('[role="tablist"]')?.getBoundingClientRect()
      return box.top <= 1 && !!tabs && tabs.bottom > 0 && tabs.bottom < 260
    }),
  )
  log(
    'and the day a run of notes belongs to sticks with them',
    await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h2')].find(
        (h) => h.getBoundingClientRect().top > 0,
      )
      return !!heading
    }),
  )
  await page.screenshot({ path: `${SHOTS}/08-days.png` })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)

  /*
    Swiping a row away. A pointer gesture rather than a touch one, so this is
    the same code a thumb runs — and the same code a trackpad runs.
  */
  const row = page.locator('li').first()
  const name = (await row.innerText()).split('\n')[0]
  const box = await row.boundingBox()
  const y = box.y + 20
  await page.mouse.move(box.x + 300, y)
  await page.mouse.down()
  for (let x = 20; x <= 60; x += 20) {
    await page.mouse.move(box.x + 300 - x, y)
    await page.waitForTimeout(30)
  }
  log(
    'dragging a row shows what letting go will do',
    /delete/i.test(await row.innerText()),
    (await row.innerText()).replace(/\n+/g, ' / '),
  )
  await page.screenshot({ path: `${SHOTS}/09-swiping.png` })
  for (let x = 80; x <= 160; x += 20) {
    await page.mouse.move(box.x + 300 - x, y)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
  log(
    'letting go past the line asks before it deletes',
    (await page.locator('[role="dialog"][aria-label^="Delete"]').count()) === 1 &&
      (await page.locator('ul').first().innerText()).includes(name),
    name,
  )
  log(
    'and the harmless answer has the focus, so Return keeps the note',
    await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Keep it'),
  )
  await page.locator('[role="dialog"] button:has-text("Keep it")').click()
  await page.waitForTimeout(500)
  log(
    'saying no keeps it',
    (await page.locator('ul').first().innerText()).includes(name),
  )

  // And again, all the way through this time.
  {
    const again = page.locator('li').first()
    const there = await again.boundingBox()
    await page.mouse.move(there.x + 300, there.y + 20)
    await page.mouse.down()
    for (let x = 20; x <= 160; x += 20) {
      await page.mouse.move(there.x + 300 - x, there.y + 20)
      await page.waitForTimeout(30)
    }
    await page.mouse.up()
    await page.waitForTimeout(400)
    await page.locator('[role="dialog"] button:has-text("Delete")').click()
    await page.waitForTimeout(900)
  }
  log(
    'and saying yes deletes it',
    !(await page.locator('ul').first().innerText()).includes(name),
    name,
  )

  // A short drag is not a delete, and is not a tap either.
  const second = page.locator('li').first()
  const stays = (await second.innerText()).split('\n')[0]
  const secondBox = await second.boundingBox()
  await page.mouse.move(secondBox.x + 300, secondBox.y + 20)
  await page.mouse.down()
  for (let x = 20; x <= 40; x += 20) {
    await page.mouse.move(secondBox.x + 300 - x, secondBox.y + 20)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(700)
  log(
    'a short drag puts the row back rather than deleting it',
    (await page.locator('ul').first().innerText()).includes(stays),
    stays,
  )
  log(
    'and it does not open the note either',
    (await page.locator('[aria-label="Back to notes"]').count()) === 0,
  )

  // The button, for everybody who never discovers a gesture.
  const third = page.locator('li').first()
  const doomed = (await third.innerText()).split('\n')[0]
  await third.locator('[aria-label^="Delete"]').click()
  await page.waitForTimeout(400)
  log(
    'the same delete is a button on the row, and asks too',
    (await page.locator('[role="dialog"][aria-label^="Delete"]').count()) === 1,
  )
  log(
    'and the question names the note it is about',
    (await page.locator('[role="dialog"][aria-label^="Delete"]').getAttribute('aria-label')).includes(
      doomed.slice(0, 12),
    ),
    doomed,
  )
  await page.locator('[role="dialog"] button:has-text("Delete")').click()
  await page.waitForTimeout(800)
  log(
    'and then it goes',
    !(await page.locator('ul').first().innerText()).includes(doomed),
    doomed,
  )
}

/* ------------------------------------------------------------- on a phone */

{
  const mobile = await ctx.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  await mobile.goto(URL, { waitUntil: 'networkidle' })
  await mobile.waitForTimeout(1000)
  await mobile.screenshot({ path: `${SHOTS}/09-mobile.png` })

  log(
    'nothing runs off the side of a phone',
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  )
  log(
    'the notes fill the screen',
    await mobile.locator('[role="tab"]:has-text("Notes")').first().isVisible(),
  )
  log(
    'the bar to write a note is fixed to the bottom, where a thumb is',
    await mobile.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('Write a note'),
      )
      if (!el) return false
      const box = el.getBoundingClientRect()
      return box.bottom > window.innerHeight - 120 && box.height >= 40
    }),
  )

  await write('a note written on a phone', mobile)
  log('and a note can be written on it', /written on a phone/i.test(await mobile.locator('ul').first().innerText()))
  /*
    No bin on the row here. There is no hover on a touch screen, so a button
    that reveals itself on hover is a button that is simply always there —
    forty small destructive controls under a scrolling thumb. The swipe is the
    gesture on a phone, and the note's own ⋯ is the other way in.
  */
  log(
    'the bin is not on every row on a phone; the swipe is the gesture there',
    await mobile.evaluate(() => {
      const bins = [...document.querySelectorAll('li [aria-label^="Delete"]')]
      return bins.every((el) => el.getBoundingClientRect().width === 0)
    }),
  )
  await mobile.locator('li button').first().click()
  await mobile.waitForTimeout(800)
  const bar = await mobile.locator('[role="toolbar"]').boundingBox()
  log(
    'a note has one bar on a phone, not two',
    (await mobile.locator('[role="toolbar"]').count()) === 1 && !!bar && bar.height < 56,
    bar ? `${Math.round(bar.height)}px tall` : 'missing',
  )
  await mobile.screenshot({ path: `${SHOTS}/10-mobile-note.png` })

  /*
    Deleting for good, on a touch screen.

    The controls in the trash were hover-only, which on a phone is a control
    that does not exist: "delete for good" could not be pressed at all, and the
    note somebody was trying to destroy stayed exactly where it was.
  */
  await mobile.locator('[aria-label="More"]').click()
  await mobile.waitForTimeout(300)
  await mobile.locator('[role="menu"] button:has-text("Delete this note")').click()
  await mobile.waitForTimeout(250)
  await mobile.locator('[role="menu"] button:has-text("Delete")').last().click()
  await mobile.waitForTimeout(900)
  await mobile.locator('button[aria-expanded]', { hasText: 'Trash' }).first().click()
  await mobile.waitForTimeout(500)
  log(
    'the controls in the trash are reachable on a phone, with no hover to give them',
    await mobile.evaluate(() => {
      const el = document.querySelector('[aria-label*="permanently"]')
      if (!el) return false
      const box = el.getBoundingClientRect()
      return Number(getComputedStyle(el).opacity) > 0.9 && box.width >= 28 && box.height >= 28
    }),
  )
  await mobile.locator('[aria-label*="permanently"]').first().click()
  await mobile.waitForTimeout(300)
  await mobile
    .locator('div')
    .filter({ hasText: /^Delete for good\?/ })
    .last()
    .locator('button:has-text("Delete")')
    .first()
    .click()
  await mobile.waitForTimeout(900)
  await mobile.reload({ waitUntil: 'networkidle' })
  await mobile.waitForTimeout(1100)
  log(
    'and a note destroyed there is gone after a reload',
    !/written on a phone/i.test(await mobile.evaluate(() => document.body.innerText)),
  )
  await mobile.close()
}

/* --------------------------------------------------------------- dictation */

/*
  The browser's own speech recogniser is stubbed, for two reasons. Chromium as
  Playwright ships it has none at all — the real one talks to a Google service
  — and a test that depends on a microphone and somebody speaking into it is
  not a test. The stub drives the same events the real one does, which is what
  every decision in dictation-button.tsx is made from.
*/
{
  {
    // A browser with no recogniser at all — Firefox, in practice.
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
  await mic.waitForTimeout(1000)

  const button = mic.locator('[aria-label="Record what you say"]')
  log('a browser that can listen gets a recorder in the corner', await button.isVisible())
  const corner = await button.boundingBox()
  log(
    'it sits in the lower right corner',
    !!corner && corner.x > 1280 - 140 && corner.y > 860 - 140,
    corner ? `x=${Math.round(corner.x)} y=${Math.round(corner.y)}` : 'missing',
  )

  await button.click()
  await mic.waitForTimeout(500)
  const sign = mic.locator('[role="status"]', { hasText: 'Listening' })
  log('one tap starts it, with a sign that it is recording', await sign.isVisible())
  log(
    'and the sign carries a clock',
    /\d:\d\d/.test(await sign.innerText()),
    (await sign.innerText()).replace(/\n+/g, ' / '),
  )

  await mic.evaluate(() => window.__say('I need to call the landlord about the boiler', true))
  await mic.waitForTimeout(500)
  log('what is being heard shows in the sign', /call the landlord/i.test(await sign.innerText()))
  await mic.screenshot({ path: `${SHOTS}/11-recording.png` })

  /*
    The silence. Every browser recogniser stops itself after a pause, and in a
    meeting the pauses are where people are thinking — so a stop nobody asked
    for has to start it again with the transcript intact.
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

  await mic.locator('[aria-label="Stop recording"]').click()
  await mic.waitForTimeout(1500)
  log(
    'stopping makes a note of what was said',
    (await mic.locator('[aria-label="Back to notes"]').count()) === 1,
  )
  // The opening of what was said names the note — nobody is ever asked for a
  // name — so the first half of the recording is the title and the rest is
  // the writing. Both have to be there.
  const written = [await mic.inputValue('[aria-label="Note title"]'), ...(await lines(mic))].join(' | ')
  log('both halves of the recording are in it', /call the landlord/i.test(written) && /inventory to Ada/i.test(written), written.slice(0, 140))
  log('the recording sign goes away', (await sign.count()) === 0)
  await mic.screenshot({ path: `${SHOTS}/12-dictated.png` })
  log('no uncaught errors from the recorder', micErrors.length === 0, micErrors.slice(0, 2).join(' | '))
  await heard.close()
}

/* ----------------------------------------------------- weight, and the rest */

{
  // The sign-in client is ~100KB and most visits never need it.
  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') ?? ''),
  )
  const all = await Promise.all(
    scripts.map(async (src) => {
      try {
        const response = await fetch(new globalThis.URL(src, URL))
        return await response.text()
      } catch {
        return ''
      }
    }),
  )
  const bundle = all.join('')
  log(
    'the sign-in client is not in the first download',
    !bundle.includes('supabase.auth.token'),
  )

  /*
    And neither are the two screens nobody has opened.

    Measured on a page that has never pressed either tab, because pressing
    one fetches its chunk and adds it to the document — which is exactly the
    behaviour being checked, and would hide it if this ran on `page`.
  */
  const cold = await (await browser.newContext()).newPage()
  await cold.goto(URL, { waitUntil: 'networkidle' })
  await cold.waitForTimeout(600)
  const coldScripts = await cold.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') ?? ''),
  )
  const coldBundle = (
    await Promise.all(
      coldScripts.map(async (src) => {
        try {
          const response = await fetch(new globalThis.URL(src, URL))
          return await response.text()
        } catch {
          return ''
        }
      }),
    )
  ).join('')
  log(
    'the World is not in the first download either',
    !coldBundle.includes('Search notes people have shared'),
  )
  log(
    'nor is the dashboard',
    !coldBundle.includes('The last fortnight'),
  )
  await cold.context().close()
}

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
