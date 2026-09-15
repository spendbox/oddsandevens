import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-oddsandevens/fcd08355-0759-5150-ba49-b30e00a77998/scratchpad/v11'
mkdirSync(OUT, { recursive: true })
const R = []
const log = (n, ok, d='') => { R.push({n,ok}); console.log(`${ok?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`) }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1100, height: 820 }, permissions: ['clipboard-read','clipboard-write'] })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)

for (const line of ['First paragraph here', 'Second paragraph here', 'Third paragraph here', 'Fourth paragraph here']) {
  await page.keyboard.type(line); await page.keyboard.press('Enter'); await page.waitForTimeout(150)
}
await page.waitForTimeout(500)
const count0 = await page.locator('[data-block-id]').count()

// Drag from block 1 into block 3.
const b1 = await page.locator('[data-block-id]').nth(0).boundingBox()
const b3 = await page.locator('[data-block-id]').nth(2).boundingBox()
await page.mouse.move(b1.x + 60, b1.y + b1.height/2)
await page.mouse.down()
await page.mouse.move(b1.x + 120, b1.y + b1.height/2 + 6, { steps: 4 })
await page.mouse.move(b3.x + 140, b3.y + b3.height/2, { steps: 12 })
await page.waitForTimeout(400)
const highlighted = await page.locator('[data-block-id]').evaluateAll(els =>
  els.filter(e => e.className.includes('accent-soft')).length)
log('dragging past the end of a line selects whole blocks', highlighted >= 3, `${highlighted} highlighted`)
await page.screenshot({ path: `${OUT}/01-selected.png` })
await page.mouse.up()
await page.waitForTimeout(300)
log('the selection survives the mouse being released',
  (await page.locator('[data-block-id]').evaluateAll(els => els.filter(e => e.className.includes('accent-soft')).length)) >= 3)

// Copy it.
await page.keyboard.press('Control+c')
await page.waitForTimeout(400)
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))
log('copying a multi-block selection gets every block',
  clip.includes('First paragraph') && clip.includes('Third paragraph'), JSON.stringify(clip).slice(0, 90))

// Delete it.
await page.keyboard.press('Backspace')
await page.waitForTimeout(600)
const after = await page.locator('[data-block-id]').count()
log('deleting removes the whole run', after === count0 - 3, `${count0} -> ${after}`)
const remaining = await page.evaluate(() => document.body.innerText)
log('the blocks outside the selection survive', remaining.includes('Fourth paragraph'))

// Typing over a selection replaces it.
const c1 = await page.locator('[data-block-id]').nth(0).boundingBox()
const c2 = await page.locator('[data-block-id]').nth(1).boundingBox()
await page.mouse.move(c1.x + 60, c1.y + c1.height/2)
await page.mouse.down()
await page.mouse.move(c2.x + 120, c2.y + c2.height/2, { steps: 10 })
await page.waitForTimeout(300)
await page.mouse.up()
await page.keyboard.type('replaced')
await page.waitForTimeout(600)
const txt = await page.evaluate(() => document.body.innerText)
log('typing over a block selection replaces it', /Replaced/i.test(txt), JSON.stringify(txt.slice(0,80)))

// Escape clears.
const d1 = await page.locator('[data-block-id]').nth(0).boundingBox()
await page.mouse.move(d1.x + 60, d1.y + 5)
await page.mouse.down()
await page.mouse.move(d1.x + 200, d1.y + 60, { steps: 8 })
await page.mouse.up()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
log('Escape clears a block selection',
  (await page.locator('[data-block-id]').evaluateAll(els => els.filter(e => e.className.includes('accent-soft')).length)) === 0)

// A selection within one block must still be a normal text selection.
await page.locator('[data-block-id] [contenteditable]').first().click()
await page.keyboard.press('Home')
await page.keyboard.down('Shift')
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
await page.keyboard.up('Shift')
await page.waitForTimeout(400)
const native = await page.evaluate(() => window.getSelection()?.toString() ?? '')
log('selecting inside one block is still ordinary text selection', native.length === 4, JSON.stringify(native))

await b.close()
const f = R.filter(r=>!r.ok)
console.log(`\n${R.length-f.length}/${R.length} passed`)
