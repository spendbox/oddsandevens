import { cellKey, colName, computeGrid } from './formula.ts'
import { htmlToMarkdown } from './rich-text.ts'
import type { Block, Doc } from './types'

/**
 * Turning a document into a file.
 *
 * Markdown is the default because it is the format that survives: it opens in
 * every editor, it is readable with no software at all, and it keeps the
 * structure that a screenshot or a PDF flattens. A document someone can only
 * read inside this app is a document they do not really own.
 *
 * A table exports what the reader sees — computed values, not formulas. A
 * spreadsheet pasted into a document is there for its answers; "=SUM(B1:B3)"
 * in a shared file is a worse artefact than "515000".
 */

/** The text of a block, with its formatting expressed as markdown. */
function inline(block: { text: string; html?: string }): string {
  return block.html ? htmlToMarkdown(block.html) : block.text
}

function tableToMarkdown(block: Extract<Block, { type: 'table' }>): string {
  const computed = computeGrid(block.cells)
  const rows: string[][] = []
  for (let r = 0; r < block.rows; r++) {
    const row: string[] = []
    for (let c = 0; c < block.cols; c++) {
      const key = cellKey(c, r)
      // A pipe inside a cell would end the column early.
      row.push((computed[key]?.text ?? block.cells[key] ?? '').replace(/\|/g, '\\|'))
    }
    rows.push(row)
  }
  if (!rows.length) return ''

  // Markdown tables require a header row. A grid does not have one, so the
  // column letters stand in — which also keeps A1-style references meaningful
  // to anyone reading the exported file next to the original.
  const header = Array.from({ length: block.cols }, (_, c) => colName(c))
  const divider = header.map(() => '---')
  return [header, divider, ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')
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
    case 'code': {
      // A fence has to be longer than any run of backticks inside the code,
      // or the block ends early and the rest of the file becomes code.
      const longest = Math.max(0, ...(block.code.match(/`+/g) ?? []).map((run) => run.length))
      const fence = '`'.repeat(Math.max(3, longest + 1))
      return `${fence}${block.lang === 'plain' ? '' : block.lang}\n${block.code}\n${fence}`
    }
    case 'table':
      return tableToMarkdown(block)
    case 'form': {
      const lines = [`**${block.title || 'Form'}**`]
      for (const field of block.fields) {
        lines.push(`- ${field.label || 'Untitled question'}${field.required ? ' *(required)*' : ''}`)
      }
      if (block.responses.length) {
        lines.push('', `_${block.responses.length} response${block.responses.length === 1 ? '' : 's'}_`)
        for (const response of block.responses) {
          const answers = block.fields
            .map((f) => `${f.label || 'Question'}: ${response.values[f.id] || '—'}`)
            .join('; ')
          lines.push(`- ${answers}`)
        }
      }
      return lines.join('\n')
    }
    case 'file':
      return `[${block.name}](${block.name})`
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
      if (block.type === 'code') return block.code
      if (block.type === 'todo') return `${block.done ? '[x]' : '[ ]'} ${block.text}`
      if (block.type === 'divider') return '---'
      if (block.type === 'table' || block.type === 'form' || block.type === 'file') {
        return blockToMarkdown(block)
      }
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
    if (block.type === 'code') {
      parts.push(block.code, '')
      continue
    }
    if (block.type === 'table') {
      const computed = computeGrid(block.cells)
      for (let r = 0; r < block.rows; r++) {
        const row: string[] = []
        for (let c = 0; c < block.cols; c++) {
          const key = cellKey(c, r)
          row.push(computed[key]?.text ?? block.cells[key] ?? '')
        }
        if (row.some((cell) => cell !== '')) parts.push(row.join('\t'))
      }
      parts.push('')
      continue
    }
    if (block.type === 'todo') {
      parts.push(`[${block.done ? 'x' : ' '}] ${block.text}`, '')
      continue
    }
    if (block.type === 'form') {
      parts.push(block.title || 'Form')
      for (const field of block.fields) parts.push(`  ${field.label || 'Untitled question'}`)
      parts.push('')
      continue
    }
    if (block.type === 'file') {
      parts.push(block.name, '')
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
