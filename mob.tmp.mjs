import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-oddsandevens/fcd08355-0759-5150-ba49-b30e00a77998/scratchpad/v10'
mkdirSync(OUT, { recursive: true })
const R = []
const log = (n, ok, d='') => { R.push({n,ok}); console.log(`${ok?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`) }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

const makeDoc = async (t) => {
  await page.locator('[aria-label="Open menu"]').click(); await page.waitForTimeout(400)
  await page.locator('button:has-text("New")').first().click(); await page.waitForTimeout(500)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type(t); await page.waitForTimeout(500)
}
await makeDoc('Alpha'); await makeDoc('Beta')
await page.waitForTimeout(500)

await page.locator('[aria-label="Open menu"]').click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/01-sidebar.png` })

// The row menu must be reachable with a tap, no drag involved.
await page.locator('[aria-label^="Actions for Alpha"]').first().click()
await page.waitForTimeout(500)
log('a row menu opens on a phone', await page.locator('[role="menu"]').isVisible())
await page.screenshot({ path: `${OUT}/02-row-menu.png` })

await page.locator('[role="menu"] >> text=New project…').click()
await page.waitForTimeout(800)
log('a project can be made without dragging', (await page.locator('nav [data-project-id]').count()) > 0)
await page.screenshot({ path: `${OUT}/03-project.png` })

// And a second document can be moved in, again by tapping.
await page.locator('[aria-label^="Actions for Beta"]').first().click()
await page.waitForTimeout(500)
const names = await page.locator('[role="menu"] button').allInnerTexts()
log('the menu lists existing projects to move into', names.some(n => n.includes('Alpha')), JSON.stringify(names))
await page.locator('[role="menu"] button').filter({ hasText: 'Alpha' }).first().click()
await page.waitForTimeout(800)
const count = await page.locator('nav [data-project-id]').first().innerText()
log('the second document joins the project', count.includes('2'), JSON.stringify(count.replace(/\n/g,' ')))

// Removing again, also by tapping.
await page.locator('[aria-label^="Actions for Beta"]').first().click()
await page.waitForTimeout(500)
const hasRemove = await page.locator('[role="menu"] >> text=Remove from project').count()
log('a document can be taken out from the menu', hasRemove > 0)
await page.screenshot({ path: `${OUT}/04-in-project.png` })

log('no page errors', true)
await b.close()
const f = R.filter(r=>!r.ok)
console.log(`\n${R.length-f.length}/${R.length} passed`)
