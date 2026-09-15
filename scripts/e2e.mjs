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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
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
await page.locator('[aria-label="Search documents"]').fill('invoice')
await page.waitForTimeout(400)
const searchHits = await page.locator('nav [class*="group/doc"]').count()
log('search finds text inside a document body', searchHits === 1, `${searchHits} result(s) for "invoice"`)
await page.screenshot({ path: `${SHOTS}/09-search.png` })
await page.locator('[aria-label="Search documents"]').fill('')
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
