/**
 * Renders ads.html to PNGs, one per advertisement.
 *
 *   node marketing/render.mjs
 *
 * Square 1080s, which is the shape that survives a feed, a WhatsApp status and
 * a chat thread without anybody cropping it. Pass --story to get 1080x1920
 * instead, for full-screen status posts.
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'ads')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? undefined,
})
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })
await page.goto('file://' + join(here, 'ads.html'))
await page.waitForTimeout(500)

const ads = await page.$$eval('.ad', (nodes) => nodes.map((n) => n.id))

for (const id of ads) {
  const ad = await page.$(`#${id}`)
  await ad.screenshot({ path: join(out, `${id}.png`) })
  console.log(`${id}.png`)
}

console.log(`\n${ads.length} advertisements in ${out}`)
await browser.close()
