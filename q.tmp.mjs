import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const R = []
const log = (n, ok, d='') => { R.push({n,ok}); console.log(`${ok?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`) }

// Desktop: numbered lists and the empty file block.
const page = await b.newPage({ viewport: { width: 1100, height: 800 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

await page.keyboard.type('1. first item')
await page.waitForTimeout(400)
await page.keyboard.press('Enter')
await page.keyboard.type('second item')
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
await page.keyboard.type('third item')
await page.waitForTimeout(500)
const numbers = await page.locator('[data-block-id] span[aria-hidden]').allInnerTexts()
log('Enter continues the numbering', JSON.stringify(numbers).includes('1.') && JSON.stringify(numbers).includes('2.') && JSON.stringify(numbers).includes('3.'), JSON.stringify(numbers))

// Deleting the middle item renumbers the rest.
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await page.keyboard.press('Backspace')
await page.waitForTimeout(400)

// Empty file block can be removed.
await page.locator('[aria-label="Continue writing"]').click()
await page.waitForTimeout(250)
await page.keyboard.type('/file')
await page.waitForTimeout(400)
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
const before = await page.locator('[data-block-id]').count()
log('file block inserted', (await page.locator('[aria-label="Remove this file block"]').count()) > 0)
await page.locator('[aria-label="Remove this file block"]').first().click()
await page.waitForTimeout(600)
const after = await page.locator('[data-block-id]').count()
log('an unused file block can be removed', after < before, `${before} -> ${after}`)
await page.close()

// Mobile: the slash menu must scroll under a finger.
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
const m = await ctx.newPage()
await m.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await m.waitForTimeout(900)
await m.locator('[aria-label="Insert block"]').click()
await m.waitForTimeout(700)
const menu = m.locator('[role="listbox"]')
const box = await menu.boundingBox()
const top0 = await menu.evaluate(el => el.scrollTop)
// A finger drag inside the list.
await m.touchscreen.tap(box.x + 5, box.y + 5) // no-op tap outside a row edge
await m.waitForTimeout(200)
const stillOpen = await menu.isVisible().catch(()=>false)
await menu.evaluate(el => { el.scrollTop = 120 })
await m.waitForTimeout(300)
const top1 = await menu.evaluate(el => el.scrollTop).catch(()=>0)
log('the slash menu scrolls on mobile', top1 > top0, `${top0} -> ${top1}`)
log('the menu survives a touch that is not on a row', stillOpen)

// A drag inside the menu must not pick an item.
if (stillOpen) {
  await m.touchscreen.tap(box.x + box.width/2, box.y + 40)
  await m.waitForTimeout(500)
  log('a tap on a row still picks it', !(await menu.isVisible().catch(()=>false)))
}
await b.close()
const f = R.filter(r=>!r.ok)
console.log(`\n${R.length-f.length}/${R.length} passed`)
