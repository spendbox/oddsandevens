import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

// Long document so there is something to scroll.
for (let i = 0; i < 25; i++) { await page.keyboard.type(`Line number ${i} of the document`); await page.keyboard.press('Enter') }
await page.waitForTimeout(600)

const headerBefore = await page.locator('header').boundingBox()
await page.evaluate(() => { const s = document.querySelector('main > div'); if (s) s.scrollTop = 600 })
await page.waitForTimeout(400)
const headerAfter = await page.locator('header').boundingBox()
console.log('header y before/after scroll:', headerBefore?.y, headerAfter?.y, headerBefore?.y === headerAfter?.y ? 'ALREADY STICKY' : 'MOVES')
const scrolled = await page.evaluate(() => document.querySelector('main > div')?.scrollTop)
console.log('scroller scrollTop:', scrolled)

// Slash menu scrolling on touch.
await page.locator('[aria-label="Insert block"]').click()
await page.waitForTimeout(600)
const menu = page.locator('[role="listbox"]')
console.log('menu visible:', await menu.isVisible())
const info = await menu.evaluate(el => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, canScroll: el.scrollHeight > el.clientHeight }))
console.log('menu:', JSON.stringify(info))
// Try a touch drag inside the menu.
const box = await menu.boundingBox()
await page.touchscreen.tap(box.x + box.width/2, box.y + 20)
await page.waitForTimeout(500)
console.log('after a tap on the menu, still open:', await menu.isVisible().catch(()=>false))
await b.close()
