import { newId } from './id.ts'
import type { PastedBlock } from './paste.ts'
import {
  blockText,
  isTextish,
  type Block,
  type BlockType,
  type Doc,
  type RemovedBlock,
} from './types.ts'

/**
 * Makes an empty block of a given type. One factory, so a block made by a
 * markdown shortcut, by the beautifier and by pressing Return are always the
 * same shape — a mismatch there shows up much later as a crash while
 * rendering something that came back from storage.
 */
export function makeBlock(type: BlockType, level?: 1 | 2 | 3): Block {
  const id = newId()
  switch (type) {
    case 'todo':
      return { id, type: 'todo', text: '', done: false }
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
 * Markdown prefixes that turn one line into another kind of line. These are
 * what people already have in their fingers from every other editor, and they
 * are the only way a line changes shape now that there is no toolbar.
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

/** A one-line summary of a note, for the list. */
export function docPreview(blocks: Block[]): string {
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'bullet' || block.type === 'quote') {
      if (block.text.trim()) return block.text.trim()
    }
    if (block.type === 'todo' && block.text.trim()) return block.text.trim()
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
 * The opening of a note, as one run of words, for the two lines under its name
 * in a list.
 *
 * Longer than `docPreview` and for a different job: that one is a single line
 * standing in for the note, this is the start of the note itself. Whatever is
 * already being shown as the name is skipped, because a row that says the same
 * sentence twice — once in bold and once under it — has told the reader one
 * thing and spent two lines doing it.
 */
export function docOpening(doc: Doc, chars = 200): string {
  const label = docLabel(doc).replace(/…$/, '').trim()
  const parts: string[] = []
  for (const block of doc.blocks) {
    let text = blockText(block).trim()
    if (!text) continue
    /*
      Whatever is already being shown as the name is taken off the front,
      rather than the whole line being dropped: a name is often the *start* of
      the first line, cut short, and dropping the line would throw away the
      rest of the sentence it was cut out of.
    */
    if (!parts.length && label && text.startsWith(label)) {
      text = text.slice(label.length).replace(/^[\s—–-]+/, '').trim()
      if (!text) continue
    }
    parts.push(text)
    if (parts.join(' ').length >= chars) break
  }
  const all = parts.join(' ')
  if (all.length <= chars) return all
  return `${all.slice(0, chars).trimEnd()}…`
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
    if (made.type === 'bullet' && item.ordered) made.ordered = true
    if (made.type === 'todo' && item.done) made.done = true
    return made
  })
}

/**
 * Lines taken out of a note, and where each one was.
 *
 * Kept here with no DOM and no React so that "what happens to the rest of the
 * note when three lines come out of the middle of it" is a unit test rather
 * than something to reproduce by swiping. The removed blocks come back with
 * their index, which is the whole of what an undo needs.
 */
export function withoutBlocks(
  blocks: Block[],
  ids: string[],
): { kept: Block[]; removed: RemovedBlock[] } {
  const doomed = new Set(ids)
  const kept: Block[] = []
  const removed: RemovedBlock[] = []
  blocks.forEach((block, index) => {
    if (doomed.has(block.id)) removed.push({ index, block })
    else kept.push(block)
  })
  return { kept, removed }
}

/**
 * The same lines, put back where they came from.
 *
 * Ascending by index, because each insertion shifts everything after it: an
 * index recorded against the note as it was is only right once every earlier
 * one is already back in place. A block that is somehow there already is
 * skipped rather than duplicated — two undos, or a second device having put
 * it back first, must not leave the line twice.
 *
 * A note emptied to a single blank line by the removal is replaced outright,
 * or putting three lines back would leave a stray empty paragraph above them.
 */
export function withBlocksBack(blocks: Block[], removed: RemovedBlock[]): Block[] {
  const blank =
    blocks.length === 1 && blocks[0].type === 'text' && !blocks[0].text.trim() && !blocks[0].html
  const out = blank ? [] : [...blocks]
  const here = new Set(out.map((block) => block.id))
  for (const { index, block } of [...removed].sort((a, b) => a.index - b.index)) {
    if (here.has(block.id)) continue
    out.splice(Math.min(Math.max(index, 0), out.length), 0, block)
    here.add(block.id)
  }
  return out
}
