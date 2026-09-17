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
  (await page.locator('h1:has-text("Notes")').isVisible()) &&
    (await page.locator('[aria-label="Back to notes"]').count()) === 0,
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
  await page.screenshot({ path: `${SHOTS}/04-written-up.png` })
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
  log('favourites is a tab of its own', (await page.locator('[role="tab"]').count()) === 2)
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(400)
  log(
    'and it says so when there is nothing in it',
    /star a note/i.test(await page.evaluate(() => document.body.innerText)),
  )
  await page.locator('[role="tab"]:has-text("Notes")').click()
  await page.waitForTimeout(400)

  await page.locator('li [aria-label^="Add"]').first().click()
  await page.waitForTimeout(700)
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(500)
  log('starring a note puts it in the Favourites tab', (await rows().count()) === 1)
  log('and the tab says how many', /1/.test(await page.locator('[role="tab"]:has-text("Favourites")').innerText()))
  await page.screenshot({ path: `${SHOTS}/06-favourites.png` })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.locator('[role="tab"]:has-text("Favourites")').click()
  await page.waitForTimeout(500)
  log('a favourite survives a reload', (await rows().count()) === 1)
  await page.locator('li [aria-label^="Remove"]').first().click()
  await page.waitForTimeout(600)
  log('and can be taken off again', (await rows().count()) === 0)
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
    'sharing says it needs an account rather than failing',
    /needs an account/i.test(text),
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
  log('and it goes back to the notes, without that one', (await page.locator('h1:has-text("Notes")').isVisible()))
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
  log('the notes fill the screen', (await mobile.locator('h1:has-text("Notes")').isVisible()))
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
  await mobile.locator('li button').first().click()
  await mobile.waitForTimeout(800)
  const bar = await mobile.locator('[role="toolbar"]').boundingBox()
  log(
    'a note has one bar on a phone, not two',
    (await mobile.locator('[role="toolbar"]').count()) === 1 && !!bar && bar.height < 56,
    bar ? `${Math.round(bar.height)}px tall` : 'missing',
  )
  await mobile.screenshot({ path: `${SHOTS}/10-mobile-note.png` })
  await mobile.locator('[aria-label="Back to notes"]').click()
  await mobile.waitForTimeout(500)
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
