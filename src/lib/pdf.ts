'use client'

/**
 * Pulling the text out of a PDF.
 *
 * pdf.js is about 500KB gzipped — as much as the whole rest of Pad. That is
 * the entire reason this module exists as a dynamic import behind a function
 * call: nobody downloads a PDF reader to write a shopping list. It arrives the
 * first time someone actually imports a PDF, and never otherwise.
 *
 * What it cannot do is worth being honest about on screen: a PDF that is a
 * photograph of a page has no text layer to extract, and reading one would
 * need OCR, which is a different and much larger dependency again.
 */

export interface ExtractedPdf {
  /** One entry per page, each already split into paragraph-ish lines. */
  pages: string[][]
  pageCount: number
}

let loader: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (loader) return loader
  loader = import('pdfjs-dist').then((pdfjs) => {
    // The worker keeps parsing off the main thread, so a 200-page document
    // does not freeze the page it is being imported into. Resolved through
    // import.meta.url so the bundler emits it as an asset and it still works
    // offline — a CDN worker would break the installed app the moment the
    // network went away.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    return pdfjs
  })
  return loader
}

/**
 * Groups a page's text fragments into lines.
 *
 * A PDF has no notion of a line or a paragraph: it has glyphs at coordinates.
 * Fragments that share a baseline are one line, and a vertical gap noticeably
 * bigger than the line spacing is a paragraph break. Without this, extracted
 * text arrives as one unbroken wall.
 */
interface TextFragment {
  str: string
  transform: number[]
}

function groupIntoLines(items: TextFragment[]): string[] {
  const rows: Array<{ y: number; parts: string[] }> = []

  for (const item of items) {
    if (!item.str) continue
    const y = Math.round(item.transform[5])
    // Within a couple of points counts as the same baseline; PDFs routinely
    // nudge fragments a fraction to fake kerning.
    const row = rows.find((r) => Math.abs(r.y - y) <= 2)
    if (row) row.parts.push(item.str)
    else rows.push({ y, parts: [item.str] })
  }

  rows.sort((a, b) => b.y - a.y) // top of the page downwards

  const lines: string[] = []
  let previousY: number | null = null
  for (const row of rows) {
    const text = row.parts.join('').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (previousY !== null && previousY - row.y > 18) lines.push('')
    lines.push(text)
    previousY = row.y
  }
  return lines
}

/** Reads every page's text. Throws with a readable message if it cannot. */
export async function extractPdfText(data: Blob): Promise<ExtractedPdf> {
  const pdfjs = await loadPdfjs()
  const buffer = await data.arrayBuffer()
  // The loading task, not the document, is what owns the worker — and so it is
  // the thing that has to be destroyed, or the worker outlives the import.
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await task.promise
  const pageCount = doc.numPages

  const pages: string[][] = []
  try {
    for (let n = 1; n <= pageCount; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      // getTextContent returns text runs interleaved with marked-content
      // markers. Only the runs have `str` and `transform`; the markers carry
      // no text at all, so they are narrowed out here rather than guarded
      // against everywhere downstream.
      const fragments: TextFragment[] = []
      for (const item of content.items) {
        if ('str' in item && 'transform' in item) {
          fragments.push({ str: item.str, transform: item.transform })
        }
      }
      pages.push(groupIntoLines(fragments))
      // Each page holds on to its rendering resources until told otherwise,
      // which on a long document is tens of megabytes of retained memory.
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }

  return { pages, pageCount }
}
