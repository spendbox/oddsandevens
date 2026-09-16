import { blocksFromLines, blocksFromPasted } from './blocks.ts'
import { extensionOf } from './library.ts'
import { parsePastedHtml, parsePastedText } from './paste.ts'
import type { Block } from './types.ts'

/**
 * Turning a dropped file into blocks.
 *
 * Every reader here is one we already had: the PDF extractor, the Word
 * importer, the clipboard parser. Bringing a folder of documents in is
 * therefore the same code path as pasting them one at a time, which is why
 * a Library does not need an editor, a store or a document shape of its own.
 *
 * The heavy readers stay dynamic imports. pdf.js alone is ~500KB, and the
 * many people who never import a PDF should never download it.
 */

export interface ReadResult {
  blocks: Block[]
  /** False when the bytes are not text — an image, an archive, a binary. */
  readable: boolean
}

/** Text formats the clipboard parser already understands. */
const PLAIN = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'json'])

export async function readFileIntoBlocks(file: File): Promise<ReadResult> {
  const extension = extensionOf(file.name)

  if (extension === 'pdf' || file.type === 'application/pdf') {
    const { extractPdfText } = await import('./pdf.ts')
    const { pages } = await extractPdfText(file)
    // A blank line between pages, so the heading guesser sees the breaks.
    const lines = pages.flatMap((page, i) => (i === 0 ? page : ['', ...page]))
    return { blocks: blocksFromLines(lines), readable: true }
  }

  if (extension === 'docx') {
    const { docxToBlocks } = await import('./docx.ts')
    return { blocks: blocksFromPasted(await docxToBlocks(file)), readable: true }
  }

  if (extension === 'html' || extension === 'htm') {
    return { blocks: blocksFromPasted(parsePastedHtml(await file.text())), readable: true }
  }

  if (PLAIN.has(extension) || file.type.startsWith('text/')) {
    return { blocks: blocksFromPasted(parsePastedText(await file.text())), readable: true }
  }

  return { blocks: [], readable: false }
}
