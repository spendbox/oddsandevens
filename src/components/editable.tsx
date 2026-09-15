'use client'

import { useEffect, useRef } from 'react'

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
 * Text is stored as plain text, not HTML. That keeps the caret arithmetic
 * honest (an offset is an offset), keeps sync payloads small, and means
 * nothing arriving from the server can carry markup into the page.
 */
export interface EditableProps {
  value: string
  onChange: (value: string) => void
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

/** Puts the caret at a character offset, clamped to the text that exists. */
export function placeCaret(el: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  const text = el.firstChild
  const length = el.textContent?.length ?? 0
  const at = Math.max(0, Math.min(offset, length))
  if (text && text.nodeType === Node.TEXT_NODE) {
    range.setStart(text, at)
  } else {
    // An empty block has no text node to point into.
    range.selectNodeContents(el)
    range.collapse(true)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function Editable({
  value,
  onChange,
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
    if (el.textContent !== value) el.textContent = value
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
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.textContent !== value) el.textContent = value
  }, [value])

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
      onInput={() => onChange(ref.current?.textContent ?? '')}
      onFocus={onFocus}
      onKeyDown={(event) => onKeyDown?.(event, api)}
      onPaste={(event) => {
        // Pasting from a web page or a word processor otherwise drops styled
        // HTML into the block, which then travels into storage and sync.
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '))
      }}
    />
  )
}
