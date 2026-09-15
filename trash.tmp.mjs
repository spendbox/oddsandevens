import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-oddsandevens/fcd08355-0759-5150-ba49-b30e00a77998/scratchpad/v7'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 820 } })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

/** Opens the trash if it is not already open. */
const openTrash = async () => {
  const toggle = page.locator('aside button[aria-expanded]').filter({ hasText: 'Trash' }).first()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.waitForTimeout(500)
}

const makeDoc = async (t) => {
  await page.locator('button:has-text("New")').first().click()
  await page.waitForTimeout(350)
  await page.locator('[aria-label="Document title"]').click()
  await page.keyboard.type(t)
  await page.waitForTimeout(500)
}
await makeDoc('Keeper'); await makeDoc('Doomed')
await page.waitForTimeout(600)

console.log('trash hidden when empty:', (await page.locator('button:has-text("Trash")').count()) === 0)

await page.locator('nav [data-doc-id]:has-text("Doomed")').first().hover()
await page.waitForTimeout(200)
await page.locator('nav [data-doc-id]:has-text("Doomed") [aria-label^="Delete"]').first().click()
await page.waitForTimeout(800)
console.log('gone from the main list:', (await page.locator('nav [data-doc-id]:has-text("Doomed")').count()) === 0)
console.log('trash appears:', (await page.locator('button:has-text("Trash")').count()) > 0)

await openTrash()
const body = await page.evaluate(() => document.body.innerText)
console.log('trash lists it with an expiry:', body.includes('Doomed') && /Deletes in 7 days/.test(body))
await page.screenshot({ path: `${OUT}/01-trash.png` })

// Restore.
await page.locator('[aria-label^="Restore Doomed"]').first().click()
await page.waitForTimeout(800)
console.log('restored to the main list:', (await page.locator('nav [data-doc-id]:has-text("Doomed")').count()) > 0)
console.log('trash empty again:', (await page.locator('button:has-text("Trash")').count()) === 0)

// Delete again, then permanently delete.
await page.locator('nav [data-doc-id]:has-text("Doomed")').first().hover()
await page.waitForTimeout(200)
await page.locator('nav [data-doc-id]:has-text("Doomed") [aria-label^="Delete"]').first().click()
await page.waitForTimeout(700)
await openTrash()
await page.locator('[aria-label*="permanently"]').first().click()
await page.waitForTimeout(400)
console.log('permanent delete asks first:', (await page.evaluate(() => document.body.innerText)).includes('Delete for good?'))
await page.screenshot({ path: `${OUT}/02-confirm.png` })
await page.locator('button:has-text("Delete")').last().click()
await page.waitForTimeout(800)
console.log('gone from trash:', (await page.locator('button:has-text("Trash")').count()) === 0)

// And it must not come back after a reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const after = await page.evaluate(() => document.body.innerText)
console.log('still gone after reload:', !after.includes('Doomed'))
console.log('the other document survived:', after.includes('Keeper'))
await page.screenshot({ path: `${OUT}/03-after.png` })
await browser.close()
