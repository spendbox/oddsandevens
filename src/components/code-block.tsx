'use client'

import { Check, Copy } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { LANGUAGES, highlight, normaliseLang } from '@/lib/highlight'
import type { CodeBlock as CodeBlockData } from '@/lib/types'

/**
 * A code editor made of two stacked layers: a <pre> that paints the coloured
 * text, and a transparent <textarea> on top that owns the caret, selection,
 * undo stack and mobile keyboard.
 *
 * The layers must agree on every property that affects where a glyph lands —
 * font, size, line height, padding, letter spacing, wrapping, tab size — or
 * the caret drifts further from the text on every line. They share the CSS
 * class below for exactly that reason; change it in one place only.
 */
const SHARED_TEXT = 'font-mono text-[13px] leading-[1.6] p-3 whitespace-pre-wrap break-words'

const COLOURS: Record<string, string> = {
  comment: 'text-[var(--color-faint)] italic',
  string: 'text-[var(--color-good)]',
  number: 'text-[var(--color-accent)]',
  keyword: 'text-[var(--color-accent)] font-medium',
  tag: 'text-[var(--color-accent)]',
  punct: '',
  plain: '',
}

export default function CodeBlock({
  block,
  onChange,
  readOnly,
}: {
  block: CodeBlockData
  onChange: (next: CodeBlockData) => void
  readOnly?: boolean
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)

  // The textarea does not grow on its own, and a scrollbar inside a block in
  // the middle of a document is miserable to use. Measure and match instead.
  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [block.code])

  const tokens = highlight(block.code, block.lang)

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-2 py-1">
        <select
          aria-label="Language"
          value={normaliseLang(block.lang)}
          disabled={readOnly}
          onChange={(e) => onChange({ ...block, lang: e.target.value })}
          className="cursor-pointer rounded bg-transparent py-0.5 pr-1 text-[11px] text-[var(--color-muted)] outline-none hover:text-[var(--color-ink)]"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(block.code).then(
              () => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              },
              () => {
                // Clipboard access can be refused outright. Saying nothing is
                // better than an error the user cannot do anything about.
              },
            )
          }}
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] opacity-0 transition-opacity group-hover/code:opacity-100 focus:opacity-100 hover:bg-[var(--color-paper)]"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="relative">
        <pre aria-hidden className={`${SHARED_TEXT} m-0 min-h-[3rem] overflow-hidden`}>
          {tokens.map((token, i) => (
            <span key={i} className={COLOURS[token.kind] ?? ''}>
              {token.text}
            </span>
          ))}
          {/* Without this, the last line of a file ending in \n has no height
              and the textarea sits one line taller than the painted text. */}
          {'\n'}
        </pre>

        <textarea
          ref={textarea}
          value={block.code}
          readOnly={readOnly}
          spellCheck={false}
          aria-label="Code"
          placeholder="Write or paste code"
          onChange={(e) => onChange({ ...block, code: e.target.value })}
          onKeyDown={(e) => {
            // Tab indents instead of leaving the block. Shift+Tab still moves
            // focus onward, so the block is never a keyboard trap.
            if (e.key === 'Tab' && !e.shiftKey) {
              e.preventDefault()
              const el = e.currentTarget
              const { selectionStart: start, selectionEnd: end } = el
              const next = `${block.code.slice(0, start)}  ${block.code.slice(end)}`
              onChange({ ...block, code: next })
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
            }
          }}
          className={`${SHARED_TEXT} absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent text-transparent caret-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]`}
        />
      </div>
    </div>
  )
}
