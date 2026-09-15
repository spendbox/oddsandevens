/**
 * Inline formatting: bold, italic, underline, strikethrough and code, inside a
 * single block of text.
 *
 * ## Why a block carries two fields
 *
 * A formatted block stores both `text` (plain) and `html` (formatted). `text`
 * stays the source of truth for search, the sidebar preview and export;
 * `html` is only how it is painted. That keeps every one of those features
 * working on plain strings instead of teaching each of them to parse markup,
 * and it means a block saved before formatting existed still renders — there
 * is no migration, because a missing `html` just falls back to the escaped
 * `text`.
 *
 * ## Why the sanitiser does not use the DOM
 *
 * This runs over anything that arrives from the server — another device today,
 * a shared document tomorrow — before it is handed to dangerouslySetInnerHTML.
 * Written as a pure string function it can be unit tested directly, including
 * the attacks it exists to stop; a DOMParser version could only be tested in a
 * browser, which is exactly the sort of thing that ends up untested.
 *
 * The rule it enforces is deliberately blunt: a tiny allowlist of tags, and
 * *no attributes at all*. No attributes means no href, no style, no onclick,
 * no src — the entire category of attribute-borne injection cannot occur.
 */

/** The only tags that survive. Every one is inert: no attributes, no scripts. */
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'code'])

/** Tags whose *contents* are dropped too, not just their markup. */
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template'])

/**
 * Reduces arbitrary HTML to the allowlist above.
 *
 * Anything not on the list loses its markup; the text inside a disallowed tag
 * is kept (so pasting a styled paragraph keeps the words) except for the
 * script-like tags above, where the content is the danger.
 */
export function sanitizeInline(input: string): string {
  if (!input) return ''

  let out = ''
  /** Allowed tags we have opened and must close, innermost last. */
  const open: string[] = []
  /** Nesting depth inside a tag whose content is being discarded. */
  let dropping = 0
  let i = 0

  while (i < input.length) {
    const lt = input.indexOf('<', i)
    if (lt === -1) {
      if (!dropping) out += input.slice(i)
      break
    }

    if (!dropping) out += input.slice(i, lt)

    // A "<" only begins a tag when a name-ish character follows, which is what
    // the HTML parser itself does. Without this rule, "5 < 10 and 10 > 5" is
    // read as a tag spanning to that later ">" and the middle of the sentence
    // silently disappears.
    const next = input[lt + 1] ?? ''
    if (!/[a-zA-Z/!?]/.test(next)) {
      if (!dropping) out += '&lt;'
      i = lt + 1
      continue
    }

    const gt = input.indexOf('>', lt)
    if (gt === -1) {
      // An unterminated "<" is text, not the start of a tag. Escaping it stops
      // it swallowing everything that follows when this is written back out.
      if (!dropping) out += '&lt;'
      i = lt + 1
      continue
    }

    const raw = input.slice(lt + 1, gt).trim()
    const closing = raw.startsWith('/')
    // Only the name matters; everything after it is an attribute and is gone.
    const name = (closing ? raw.slice(1) : raw).split(/[\s/>]/)[0].toLowerCase()

    if (DROP_CONTENT.has(name)) {
      if (closing) dropping = Math.max(0, dropping - 1)
      else dropping++
      i = gt + 1
      continue
    }

    if (!dropping && ALLOWED.has(name)) {
      if (closing) {
        // Ignore a closing tag with nothing open, and unwind to the matching
        // one so crossed tags cannot leave the output unbalanced.
        const at = open.lastIndexOf(name)
        if (at !== -1) {
          for (let d = open.length - 1; d >= at; d--) out += `</${open[d]}>`
          open.splice(at)
        }
      } else if (!raw.endsWith('/')) {
        out += `<${name}>`
        open.push(name)
      }
    }
    // Everything else — <div>, <a href>, <img>, <br> — loses its markup and
    // keeps its text.

    i = gt + 1
  }

  // Close anything still open, or the markup leaks into the rest of the page.
  for (let d = open.length - 1; d >= 0; d--) out += `</${open[d]}>`
  return out
}

/** Escapes plain text so it can be placed into HTML unchanged. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** The visible characters of a fragment of inline HTML. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // & last, or "&amp;lt;" would decode twice and reintroduce a tag.
    .replace(/&amp;/g, '&')
}

/**
 * What to paint for a block: its formatted HTML when it has any, otherwise its
 * plain text escaped. Everything goes through the sanitiser, including our own
 * stored HTML — a value that has been to a server and back is not ours.
 */
export function blockHtml(block: { text: string; html?: string }): string {
  if (block.html) return sanitizeInline(block.html)
  return escapeHtml(block.text)
}

/** True when the HTML carries formatting worth storing. */
export function hasFormatting(html: string, plain: string): boolean {
  return sanitizeInline(html) !== escapeHtml(plain)
}

/** Markdown-ish equivalents, used when exporting a document to a file. */
export function htmlToMarkdown(html: string): string {
  return htmlToPlain(
    sanitizeInline(html)
      .replace(/<(b|strong)>/g, '**')
      .replace(/<\/(b|strong)>/g, '**')
      .replace(/<(i|em)>/g, '_')
      .replace(/<\/(i|em)>/g, '_')
      .replace(/<code>/g, '`')
      .replace(/<\/code>/g, '`')
      .replace(/<s>/g, '~~')
      .replace(/<\/s>/g, '~~')
      .replace(/<\/?u>/g, ''),
  )
}
