import { hasFormatting, htmlToPlain, sanitizeInline } from './rich-text.ts'
import { MAX_INDENT } from './smart-typing.ts'

/**
 * Turning pasted content into blocks.
 *
 * Paste used to flatten everything to a single line — three pages from a web
 * page arrived as one enormous paragraph with the newlines replaced by spaces.
 * That is the single most destructive thing an editor can do to content
 * somebody did not write, because rebuilding the structure by hand is most of
 * the work of writing it again.
 *
 * So: headings stay headings, lists stay lists, paragraphs stay separate, and
 * nesting depth survives. Inline formatting comes through the same sanitiser
 * as everything else, which is what stops a copied page carrying scripts,
 * links or styling into storage.
 *
 * Written as a string scanner rather than with DOMParser so the awkward cases
 * — Word's nested divs, Google Docs' wrappers, a list inside a list — are unit
 * tested instead of hoped for.
 */

export interface PastedBlock {
  type: 'text' | 'heading' | 'bullet' | 'quote' | 'code' | 'todo'
  text: string
  /** Inline formatting, when the content had any worth keeping. */
  html?: string
  level?: 1 | 2 | 3
  indent?: number
  done?: boolean
}

/** Block-level tags worth reacting to, plus the list wrappers for depth. */
const BLOCK_TAG = /<(\/?)(h[1-6]|p|li|ul|ol|ol|div|blockquote|pre|br|tr)\b[^>]*>/gi

function finish(
  out: PastedBlock[],
  buffer: string,
  type: PastedBlock['type'],
  level: 1 | 2 | 3 | undefined,
  indent: number,
): void {
  const clean = sanitizeInline(buffer)
  const text = htmlToPlain(clean).replace(/\s+/g, ' ').trim()
  if (!text) return
  out.push({
    type,
    text,
    ...(hasFormatting(clean, text) ? { html: clean } : {}),
    ...(level ? { level } : {}),
    ...(indent > 0 ? { indent } : {}),
  })
}

export function parsePastedHtml(html: string): PastedBlock[] {
  const out: PastedBlock[] = []
  let buffer = ''
  let type: PastedBlock['type'] = 'text'
  let level: 1 | 2 | 3 | undefined
  let listDepth = 0
  let last = 0

  const flush = () => {
    finish(out, buffer, type, level, Math.max(0, Math.min(MAX_INDENT, listDepth - 1)))
    buffer = ''
    type = 'text'
    level = undefined
  }

  BLOCK_TAG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BLOCK_TAG.exec(html)) !== null) {
    buffer += html.slice(last, match.index)
    last = match.index + match[0].length

    const closing = match[1] === '/'
    const tag = match[2].toLowerCase()

    if (tag === 'ul' || tag === 'ol') {
      // A list wrapper changes depth but is not itself a block of content.
      flush()
      listDepth = closing ? Math.max(0, listDepth - 1) : listDepth + 1
      continue
    }

    flush()
    if (closing) continue

    if (/^h[1-6]$/.test(tag)) {
      type = 'heading'
      // Six heading levels collapse into the three this editor has.
      const n = Number(tag[1])
      level = n <= 1 ? 1 : n === 2 ? 2 : 3
    } else if (tag === 'li') {
      type = 'bullet'
    } else if (tag === 'blockquote') {
      type = 'quote'
    } else if (tag === 'pre') {
      type = 'code'
    }
  }

  buffer += html.slice(last)
  flush()
  return out
}

/** Leading whitespace converted to a nesting depth: two spaces or one tab. */
function indentOf(line: string): number {
  const lead = /^[\t ]*/.exec(line)?.[0] ?? ''
  const tabs = (lead.match(/\t/g) ?? []).length
  const spaces = lead.replace(/\t/g, '').length
  return Math.min(MAX_INDENT, tabs + Math.floor(spaces / 2))
}

export function parsePastedText(text: string): PastedBlock[] {
  const out: PastedBlock[] = []
  // Paragraphs are separated by a blank line. Within one, wrapped lines are
  // rejoined — a hard-wrapped email should not become twelve paragraphs.
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)

  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n').filter((l) => l.trim())
    if (!lines.length) continue

    /** Lines that carry their own marker each become their own block. */
    const structured = lines.some((line) =>
      // Each alternative matches the marker only; the \s+ after the group is
      // what requires the space. Including it inside "#{1,6}\s" made the
      // trailing \s+ demand a second space, so "# Title" was not recognised.
      /^\s*([-*•‣▪]|\d+[.)]|#{1,6}|\[[ xX]?\])\s+/.test(line),
    )

    if (!structured) {
      const joined = lines.map((l) => l.trim()).join(' ')
      if (joined) out.push({ type: 'text', text: joined })
      continue
    }

    for (const line of lines) {
      const indent = indentOf(line)
      const body = line.trim()

      const todo = /^\[([ xX]?)\]\s+(.*)$/.exec(body)
      if (todo) {
        out.push({ type: 'todo', text: todo[2], done: todo[1].toLowerCase() === 'x', ...(indent ? { indent } : {}) })
        continue
      }
      const heading = /^(#{1,6})\s+(.*)$/.exec(body)
      if (heading) {
        const n = heading[1].length
        out.push({ type: 'heading', level: n <= 1 ? 1 : n === 2 ? 2 : 3, text: heading[2] })
        continue
      }
      const bullet = /^([-*•‣▪]|\d+[.)])\s+(.*)$/.exec(body)
      if (bullet) {
        out.push({ type: 'bullet', text: bullet[2], ...(indent ? { indent } : {}) })
        continue
      }
      out.push({ type: 'text', text: body, ...(indent ? { indent } : {}) })
    }
  }

  return out
}

/**
 * The best reading of what is on the clipboard.
 *
 * HTML is preferred when it carries structure worth having; otherwise the
 * plain text is parsed, which is where markdown-ish lists and headings are
 * recognised. A single paragraph returns a single block, so pasting a few
 * words into the middle of a sentence stays an inline insertion.
 */
export function parseClipboard(html: string, text: string): PastedBlock[] {
  if (html.trim()) {
    const blocks = parsePastedHtml(html)
    if (blocks.length) return blocks
  }
  return parsePastedText(text)
}
