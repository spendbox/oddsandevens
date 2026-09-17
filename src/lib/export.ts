import { htmlToMarkdown } from './rich-text.ts'
import type { Block, Doc } from './types'

/**
 * Turning a note into a file.
 *
 * Markdown is the default because it is the format that survives: it opens in
 * every editor, it is readable with no software at all, and it keeps the
 * structure that a screenshot or a PDF flattens. A note someone can only read
 * inside this app is a note they do not really own.
 *
 * There is one shape of thing to export now — lines of writing — so this file
 * is a good deal shorter than it was. Everything a note can hold has a
 * markdown spelling that has been standard since markdown existed.
 */

/** The text of a block, with its formatting expressed as markdown. */
function inline(block: { text: string; html?: string }): string {
  return block.html ? htmlToMarkdown(block.html) : block.text
}

export function blockToMarkdown(block: Block): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat((block.level ?? 1) + 1)} ${inline(block)}`
    case 'bullet':
      return `- ${inline(block)}`
    case 'todo':
      return `- [${block.done ? 'x' : ' '}] ${inline(block)}`
    case 'quote':
      return `> ${inline(block)}`
    case 'divider':
      return '---'
    default:
      return inline(block)
  }
}

/** A run of blocks as markdown, used when copying a multi-block selection. */
export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map(blockToMarkdown)
    .filter((text) => text.trim() !== '')
    .join('\n\n')
}

/** The same run as plain text, for the text/plain half of a copy. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'todo') return `${block.done ? '[x]' : '[ ]'} ${block.text}`
      if (block.type === 'divider') return '---'
      return block.text
    })
    .filter((text) => text.trim() !== '')
    .join('\n\n')
}

export function docToMarkdown(doc: Doc): string {
  const parts = [`# ${doc.title.trim() || 'Untitled'}`, '']
  for (const block of doc.blocks) {
    const text = blockToMarkdown(block)
    // An empty paragraph is a blank line, not a stray one; skipping it keeps
    // the file from filling with them while someone is still drafting.
    if (text.trim() === '') continue
    parts.push(text, '')
  }
  return `${parts.join('\n').trimEnd()}\n`
}

/** Plain text, for somewhere markdown would only be noise. */
export function docToText(doc: Doc): string {
  const parts = [doc.title.trim() || 'Untitled', '']
  for (const block of doc.blocks) {
    if (block.type === 'divider') {
      parts.push('---', '')
      continue
    }
    if (block.type === 'todo') {
      parts.push(`[${block.done ? 'x' : ' '}] ${block.text}`, '')
      continue
    }
    if (block.text.trim()) parts.push(block.text, '')
  }
  return `${parts.join('\n').trimEnd()}\n`
}

/**
 * A filename that every operating system will accept.
 *
 * Windows rejects \ / : * ? " < > |, and a trailing dot or space silently
 * becomes a different name. A download that fails to save is a worse failure
 * than a slightly renamed one.
 */
export function safeFilename(title: string, extension: string): string {
  const cleaned = (title.trim() || 'Untitled')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  return `${cleaned || 'Untitled'}.${extension}`
}
