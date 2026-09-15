import { newId } from './id.ts'
import type { Block, BlockType } from './types'

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
const SHORTCUTS: Array<{ match: RegExp; type: BlockType; level?: 1 | 2 | 3 }> = [
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
export function shortcutFor(text: string): { type: BlockType; level?: 1 | 2 | 3 } | null {
  for (const rule of SHORTCUTS) {
    if (rule.match.test(text)) return { type: rule.type, level: rule.level }
  }
  return null
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
  }
  return 'Empty'
}
