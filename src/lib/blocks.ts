import { newId } from './id.ts'
import type { PastedBlock } from './paste.ts'
import { isTextish, type Block, type BlockType, type Doc } from './types.ts'

/**
 * Makes an empty block of a given type. One factory, so a block created by
 * the slash menu, by a markdown shortcut and by pressing Enter are always
 * the same shape — a mismatch there shows up much later as a crash while
 * rendering something that came back from storage.
 */
export function makeBlock(type: BlockType, level?: 1 | 2 | 3): Block {
  const id = newId()
  switch (type) {
    case 'table':
      // Three by three is enough to look like a grid and be obviously
      // extendable, without a wall of empty cells on a phone.
      return { id, type: 'table', rows: 3, cols: 3, cells: {} }
    case 'code':
      return { id, type: 'code', code: '', lang: 'javascript' }
    case 'form':
      return {
        id,
        type: 'form',
        title: '',
        // One question, so the block is never an empty box with nothing to do.
        fields: [{ id: newId(), type: 'short', label: '', required: false }],
        responses: [],
      }
    case 'todo':
      return { id, type: 'todo', text: '', done: false }
    case 'file':
      // An empty ref means "nothing attached yet", which is what makes the
      // block render as a drop zone rather than as a broken download.
      return { id, type: 'file', name: '', mime: '', size: 0, ref: '' }
    case 'divider':
      return { id, type: 'divider' }
    case 'heading':
      return { id, type: 'heading', text: '', level: level ?? 1 }
    case 'bullet':
      return { id, type: 'bullet', text: '' }
    case 'quote':
      return { id, type: 'quote', text: '' }
    default:
      return { id, type: 'text', text: '' }
  }
}

/**
 * Markdown prefixes that turn one block into another as you type. These are
 * the shortcuts people already have in their fingers from every other editor,
 * and supporting them means the slash menu is a discovery aid rather than the
 * only way through.
 */
const SHORTCUTS: Array<{ match: RegExp; type: BlockType; level?: 1 | 2 | 3; ordered?: boolean }> = [
  // "1. ", "1) " and any other starting number: a numbered list.
  { match: /^\d+[.)]\s$/, type: 'bullet', ordered: true },
  { match: /^#\s$/, type: 'heading', level: 1 },
  { match: /^##\s$/, type: 'heading', level: 2 },
  { match: /^###\s$/, type: 'heading', level: 3 },
  { match: /^[-*]\s$/, type: 'bullet' },
  { match: /^\[\]\s$/, type: 'todo' },
  { match: /^\[\s\]\s$/, type: 'todo' },
  { match: /^>\s$/, type: 'quote' },
  { match: /^```$/, type: 'code' },
  { match: /^---$/, type: 'divider' },
]

/** Returns the block type a prefix should become, or null for ordinary text. */
export function shortcutFor(
  text: string,
): { type: BlockType; level?: 1 | 2 | 3; ordered?: boolean } | null {
  for (const rule of SHORTCUTS) {
    if (rule.match.test(text)) {
      return { type: rule.type, level: rule.level, ...(rule.ordered ? { ordered: true } : {}) }
    }
  }
  return null
}

/**
 * Turns extracted lines — from a PDF, or any pasted wall of text — into blocks.
 *
 * A short line with no closing punctuation, followed by a blank, is almost
 * always a heading. Guessing that is worth it: the alternative is a hundred
 * identical paragraphs that someone has to re-mark by hand, which is most of
 * the work the import was supposed to save.
 */
export function blocksFromLines(lines: string[]): Block[] {
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const next = (lines[i + 1] ?? '').trim()
    const looksLikeHeading =
      line.length <= 60 && !/[.,;:]$/.test(line) && next === '' && line.split(' ').length <= 10

    // A bullet that survived the PDF's own glyphs.
    const bullet = /^[•·▪–-]\s+(.*)$/.exec(line)
    if (bullet) {
      const block = makeBlock('bullet')
      if (block.type === 'bullet') block.text = bullet[1]
      blocks.push(block)
      continue
    }

    const block = makeBlock(looksLikeHeading ? 'heading' : 'text', 2)
    if (block.type === 'heading' || block.type === 'text') block.text = line
    blocks.push(block)
  }
  return blocks.length ? blocks : [makeBlock('text')]
}

/** A one-line summary of a document, for the sidebar. */
export function docPreview(blocks: Block[]): string {
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'bullet' || block.type === 'quote') {
      if (block.text.trim()) return block.text.trim()
    }
    if (block.type === 'todo' && block.text.trim()) return block.text.trim()
    if (block.type === 'table') return 'Spreadsheet'
    if (block.type === 'code') return 'Code'
    if (block.type === 'form') return block.title.trim() || 'Form'
    if (block.type === 'file') return block.name || 'File'
  }
  return 'Empty'
}

/**
 * What to call a document on screen.
 *
 * Titles are optional here — the app opens with the caret in the body, and
 * plenty of notes never get one. "Untitled" three times in a list of search
 * results tells the reader nothing, so a document without a title is called
 * by its first line instead, which is what they would call it themselves.
 */
export function docLabel(doc: Doc): string {
  const title = doc.title.trim()
  if (title) return title
  // A heading at the top is the document naming itself, and is a far better
  // label than the paragraph under it. docPreview skips headings — it is the
  // line shown *beneath* a name — so this has to look for one itself.
  const heading = doc.blocks.find((block) => block.type === 'heading' && block.text.trim())
  if (heading && heading.type === 'heading') {
    const text = heading.text.trim()
    return text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text
  }
  const preview = docPreview(doc.blocks)
  if (preview === 'Empty') return 'Untitled'
  return preview.length > 60 ? `${preview.slice(0, 60).trimEnd()}…` : preview
}

/**
 * Turns parsed content — a paste, an imported file, a result from the writing
 * assistant — into real blocks.
 *
 * One conversion, used by all three. It lived twice inside the editor, and two
 * copies of "which fields does a todo carry" is how one of them quietly stops
 * carrying indentation.
 */
export function blocksFromPasted(pasted: PastedBlock[]): Block[] {
  return pasted.map((item) => {
    const made = makeBlock(item.type, item.level)
    if (isTextish(made) || made.type === 'todo') {
      made.text = item.text
      made.html = item.html
      made.indent = item.indent
    }
    if (made.type === 'todo' && item.done) made.done = true
    if (made.type === 'code') made.code = item.text
    return made
  })
}
