'use client'

import { useEffect, useRef } from 'react'
import { blockHtml, hasFormatting, sanitizeInline } from '@/lib/rich-text'
import { applyFormat } from './format-toolbar'

/**
 * A single line of editable plain text.
 *
 * The rule that makes contenteditable behave: React must not own the text
 * while the user is typing. If a keystroke goes to state and comes back as a
 * re-render, the browser rebuilds the text node and the caret jumps to the
 * start — the classic bug where typing runs backwards. So the element is
 * uncontrolled, and the effect below only writes into it when the value
 * changed somewhere else AND this element does not have focus.
 *
 * A block carries both plain text and, when it has formatting, a sanitised
 * fragment of inline HTML. Everything painted into the element goes through
 * the sanitiser first — including our own stored HTML, because a value that
 * has been to a server and back is no longer ours. See lib/rich-text.ts.
 */
export interface EditableProps {
  /** The plain text. */
  value: string
  /** The formatted version, when there is one. */
  html?: string
  /** Receives the plain text, and the HTML only when formatting is present. */
  onChange: (value: string, html?: string) => void
  /**
   * Bumped by the editor whenever it rewrites this block's content itself —
   * splitting it, merging it, converting it. Ordinary typing never changes it.
   *
   * It exists because the "do not repaint while focused" rule, which is what
   * stops the caret jumping to the start on every keystroke, also blocks the
   * one case where a repaint is essential: a split rewrites the focused
   * block's text, and without this the element keeps painting the text from
   * before the split while React holds the truncated version. The visible
   * symptom is pressing Enter in the middle of a line and seeing the whole
   * line still there, duplicated into the block below.
   */
  revision?: number
  placeholder?: string
  className?: string
  /** Focus on mount, and put the caret where the caller asks. */
  autoFocus?: boolean
  caretOnFocus?: 'start' | 'end'
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>, api: CaretApi) => void
  onFocus?: () => void
  ariaLabel?: string
}

export interface CaretApi {
  /** Character offset of the caret within the block. */
  offset: () => number
  /** True when the caret sits before the first character and nothing is selected. */
  atStart: () => boolean
  atEnd: () => boolean
  /** The block's current text, read from the DOM rather than from React state. */
  text: () => string
  setText: (value: string) => void
  focusEnd: () => void
  /**
   * The block's content either side of the caret, each as plain text plus
   * formatting. Pressing Enter in the middle of a bold word has to keep both
   * halves bold, which slicing the plain string cannot do.
   */
  split: () => {
    before: { text: string; html?: string }
    after: { text: string; html?: string }
  }
}

/** Character offset of the caret inside `el`, counting across its text nodes. */
function caretOffset(el: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return 0
  const measure = range.cloneRange()
  measure.selectNodeContents(el)
  measure.setEnd(range.startContainer, range.startOffset)
  return measure.toString().length
}

/**
 * Puts the caret at a character offset, clamped to the text that exists.
 *
 * It walks the text nodes rather than assuming a single one, because a
 * formatted block is a tree: "a <b>bold</b> word" is three text nodes, and
 * offset 5 lands in the second of them.
 */
export function placeCaret(el: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let target: Text | null = null
  let within = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (remaining <= node.data.length) {
      target = node
      within = remaining
      break
    }
    remaining -= node.data.length
  }

  const range = document.createRange()
  if (target) {
    range.setStart(target, within)
  } else {
    // An empty block, or an offset past the end.
    range.selectNodeContents(el)
    range.collapse(false)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function Editable({
  value,
  html,
  onChange,
  revision = 0,
  placeholder,
  className,
  autoFocus,
  caretOnFocus = 'end',
  onKeyDown,
  onFocus,
  ariaLabel,
}: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Mount: seed the DOM once, then leave it alone.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const painted = blockHtml({ text: value, html })
    if (el.innerHTML !== painted) el.innerHTML = painted
    if (autoFocus) {
      el.focus()
      placeCaret(el, caretOnFocus === 'start' ? 0 : value.length)
    }
    // Intentionally mount-only: re-running this on every value change is the
    // bug it exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A change from elsewhere — an undo, a document switch, a pull from the
  // server. Never applied while the user is inside this element.
  const lastRevision = useRef(revision)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // A structural edit must land even on the focused element; anything else
    // must not, or typing fights the re-render.
    const forced = revision !== lastRevision.current
    lastRevision.current = revision
    if (!forced && document.activeElement === el) return

    const painted = blockHtml({ text: value, html })
    if (el.innerHTML === painted) return
    el.innerHTML = painted
    // A forced repaint on the focused element destroys the caret along with
    // the old nodes. The editor places it deliberately straight afterwards
    // (its focus effect runs after this one), but leaving it at the end is the
    // safe resting place if nothing does.
    if (forced && document.activeElement === el) placeCaret(el, value.length)
  }, [value, html, revision])

  const api: CaretApi = {
    offset: () => (ref.current ? caretOffset(ref.current) : 0),
    atStart: () => {
      const el = ref.current
      if (!el) return false
      const selection = window.getSelection()
      if (!selection || !selection.isCollapsed) return false
      return caretOffset(el) === 0
    },
    atEnd: () => {
      const el = ref.current
      if (!el) return false
      const selection = window.getSelection()
      if (!selection || !selection.isCollapsed) return false
      return caretOffset(el) === (el.textContent?.length ?? 0)
    },
    text: () => ref.current?.textContent ?? '',
    setText: (next) => {
      const el = ref.current
      if (!el) return
      el.textContent = next
      onChange(next)
    },
    focusEnd: () => {
      const el = ref.current
      if (!el) return
      el.focus()
      placeCaret(el, el.textContent?.length ?? 0)
    },
    split: () => {
      const el = ref.current
      const empty = { text: '', html: undefined }
      if (!el) return { before: empty, after: empty }

      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        const text = el.textContent ?? ''
        return { before: { text, html: undefined }, after: empty }
      }

      const caret = selection.getRangeAt(0)
      const part = (setter: (range: Range) => void) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        setter(range)
        const holder = document.createElement('div')
        holder.appendChild(range.cloneContents())
        const text = holder.textContent ?? ''
        const clean = sanitizeInline(holder.innerHTML)
        return { text, html: hasFormatting(clean, text) ? clean : undefined }
      }

      return {
        before: part((r) => r.setEnd(caret.startContainer, caret.startOffset)),
        after: part((r) => r.setStart(caret.startContainer, caret.startOffset)),
      }
    },
  }

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="false"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      className={className}
      onInput={() => {
        const el = ref.current
        if (!el) return
        const plain = el.textContent ?? ''
        const clean = sanitizeInline(el.innerHTML)
        // Only carry HTML when it says something the plain text does not, so
        // an unformatted block stays a plain string all the way to storage.
        onChange(plain, hasFormatting(clean, plain) ? clean : undefined)
      }}
      onFocus={onFocus}
      onKeyDown={(event) => {
        // The shortcuts people already have in their fingers. Handled before
        // the editor's own key handling so a block cannot swallow them.
        if (event.metaKey || event.ctrlKey) {
          const key = event.key.toLowerCase()
          const command =
            key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'e' ? 'code' : null
          if (command) {
            event.preventDefault()
            applyFormat(command)
            return
          }
        }
        onKeyDown?.(event, api)
      }}
      onPaste={(event) => {
        // Pasted HTML goes through the sanitiser rather than into the block
        // as-is; a copied web page otherwise drops scripts, links and styling
        // into storage and then into sync.
        event.preventDefault()
        const html = event.clipboardData.getData('text/html')
        const text = event.clipboardData.getData('text/plain')
        if (html) {
          const clean = sanitizeInline(html).replace(/\r?\n/g, ' ')
          if (clean) {
            document.execCommand('insertHTML', false, clean)
            return
          }
        }
        document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '))
      }}
    />
  )
}
