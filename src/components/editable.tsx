'use client'

import { useEffect, useRef } from 'react'
import { parseClipboard, type PastedBlock } from '@/lib/paste'
import { blockHtml, hasFormatting, sanitizeInline, stripInvisible } from '@/lib/rich-text'
import { inlineFormatAt, shouldCapitalise } from '@/lib/smart-typing'
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
  /**
   * Called when a paste contains more than one block's worth of content, so
   * the editor can create the blocks. Returning true means it was handled.
   */
  onPasteBlocks?: (blocks: PastedBlock[]) => boolean
  /** Off inside a spreadsheet cell or anywhere else that is not prose. */
  smart?: boolean
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
 * The text node and offset that a character position lands on.
 *
 * A formatted block is a tree — "a <b>bold</b> word" is three text nodes — so
 * a character offset has to be walked for, not indexed.
 */
function pointAt(el: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let last: Text | null = null

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (remaining <= node.data.length) return { node, offset: remaining }
    remaining -= node.data.length
    last = node
  }
  return last ? { node: last, offset: last.data.length } : { node: el, offset: 0 }
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

  const point = pointAt(el, offset)
  const range = document.createRange()
  if (point.node === el) {
    // An empty block has no text node to point into.
    range.selectNodeContents(el)
    range.collapse(false)
  } else {
    range.setStart(point.node, point.offset)
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
  onPasteBlocks,
  smart = true,
}: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  /**
   * The last thing typing did on the writer's behalf, so one Backspace can
   * take it back. Without this, an unwanted capital costs a selection and a
   * retype — and an editor that cannot be told "no" is one people switch off.
   */
  const autocorrected = useRef<{ at: number; from: string; to: string } | null>(null)

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

  /** Everything in this block before the caret. */
  const textBeforeCaret = (el: HTMLElement): string => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return ''
    const range = selection.getRangeAt(0)
    if (!el.contains(range.startContainer)) return ''
    const measure = range.cloneRange()
    measure.selectNodeContents(el)
    measure.setEnd(range.startContainer, range.startOffset)
    return measure.toString()
  }

  /**
   * Smart typing is attached as a native `beforeinput` listener, not through
   * React's `onBeforeInput`.
   *
   * React's synthetic version is a polyfill layered over older events, and it
   * does not reliably carry `inputType` or `data` — which are exactly the two
   * fields these rules need to tell a typed character from a paste or a
   * composition. Bound natively, they are always there.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const report = onChange
    const onBeforeInput = (event: InputEvent) => {
      if (!smart) return
      if (event.inputType !== 'insertText' || !event.data) return

      const typed = event.data
      const before = textBeforeCaret(el)

      // Capitalising the first letter of a sentence. Done by replacing the
      // keystroke rather than rewriting the text afterwards, so the browser's
      // own undo history stays intact.
      if (shouldCapitalise(before, typed)) {
        event.preventDefault()
        const upper = typed.toUpperCase()
        document.execCommand('insertText', false, upper)
        autocorrected.current = { at: before.length, from: typed, to: upper }
        report(stripInvisible(el.textContent ?? ''), undefined)
        return
      }

      // "**bold**" and friends, applied when the closing marker is typed.
      const match = inlineFormatAt(before + typed)
      if (match) {
        event.preventDefault()
        // Select the markers already on the page — everything the match covers
        // except the character being typed, which never arrived — and let
        // insertHTML replace the lot. Explicit range maths rather than
        // Selection.modify(), whose repeated calls mutate the range you hold.
        const selection = window.getSelection()
        const end = before.length
        const from = pointAt(el, end - (match.length - 1))
        const to = pointAt(el, end)
        if (selection && from.node !== el) {
          const range = document.createRange()
          range.setStart(from.node, from.offset)
          range.setEnd(to.node, to.offset)
          selection.removeAllRanges()
          selection.addRange(range)
          document.execCommand(
            'insertHTML',
            false,
            `<${match.tag}>${match.text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}</${match.tag}>`,
          )

          // Step out of what was just inserted, in two senses.
          //
          // insertHTML leaves the caret inside the new element AND leaves the
          // browser's "typing style" set to it, so the next word joins the
          // bold instead of following it: "**important** now" became
          // "<b>important now</b>". Position alone is not enough — the style
          // has to be turned off too, which is what the toggle below does at a
          // collapsed caret without touching the document.
          const anchor = selection.anchorNode
          const host =
            anchor?.nodeType === Node.TEXT_NODE
              ? anchor.parentElement
              : (anchor as Element | null)
          const wrapper = host?.closest(match.tag)
          if (wrapper?.parentNode) {
            const parent = wrapper.parentNode
            const index = Array.prototype.indexOf.call(parent.childNodes, wrapper)
            selection.collapse(parent, index + 1)
          }
          if (match.tag === 'b' || match.tag === 'i') {
            const command = match.tag === 'b' ? 'bold' : 'italic'
            if (document.queryCommandState(command)) document.execCommand(command)
          } else if (wrapper?.parentNode) {
            // `code` has no typing-style command to switch off, so the caret
            // needs a real character to sit after or the next word is typed
            // inside the element. The perch is stripped from everything that
            // is stored, searched or exported.
            const perch = document.createTextNode('\u200B')
            wrapper.parentNode.insertBefore(perch, wrapper.nextSibling)
            const after = document.createRange()
            after.setStart(perch, 1)
            after.collapse(true)
            selection.removeAllRanges()
            selection.addRange(after)
          }
        }
        const plain = stripInvisible(el.textContent ?? '')
        const clean = sanitizeInline(el.innerHTML)
        report(plain, hasFormatting(clean, plain) ? clean : undefined)
        return
      }

      autocorrected.current = null
    }

    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  }, [onChange, smart])

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
        const text = stripInvisible(el.textContent ?? '')
        return { before: { text, html: undefined }, after: empty }
      }

      const caret = selection.getRangeAt(0)
      const part = (setter: (range: Range) => void) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        setter(range)
        const holder = document.createElement('div')
        holder.appendChild(range.cloneContents())
        const text = stripInvisible(holder.textContent ?? '')
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
        const plain = stripInvisible(el.textContent ?? '')
        const clean = sanitizeInline(el.innerHTML)
        // Only carry HTML when it says something the plain text does not, so
        // an unformatted block stays a plain string all the way to storage.
        onChange(plain, hasFormatting(clean, plain) ? clean : undefined)
      }}
      onFocus={onFocus}
      onKeyDown={(event) => {
        // Backspace immediately after an automatic capital puts the original
        // letter back instead of deleting, which is how a word processor lets
        // you say "no, I meant that".
        const correction = autocorrected.current
        if (event.key === 'Backspace' && correction && ref.current) {
          const before = textBeforeCaret(ref.current)
          if (before.length === correction.at + correction.to.length) {
            event.preventDefault()
            autocorrected.current = null
            document.execCommand('delete')
            document.execCommand('insertText', false, correction.from)
            onChange(stripInvisible(ref.current.textContent ?? ''), undefined)
            return
          }
        }
        if (event.key !== 'Backspace') autocorrected.current = null

        // The shortcuts people already have in their fingers. Handled before
        // the editor's own key handling so a block cannot swallow them.
        if (event.metaKey || event.ctrlKey) {
          const key = event.key.toLowerCase()
          const command =
            key === 'b'
              ? 'bold'
              : key === 'i'
                ? 'italic'
                : key === 'u'
                  ? 'underline'
                  : key === 'e'
                    ? 'code'
                    : null
          if (command) {
            event.preventDefault()
            applyFormat(command)
            return
          }
        }
        onKeyDown?.(event, api)
      }}
      onPaste={(event) => {
        // Everything pasted goes through the sanitiser; a copied web page
        // otherwise drops scripts, links and styling into storage and sync.
        //
        // Ctrl+Shift+V arrives here with no text/html at all — that is how
        // browsers implement "paste as plain text" — so it needs no special
        // case: the plain branch below simply takes over.
        event.preventDefault()
        const html = event.clipboardData.getData('text/html')
        const text = event.clipboardData.getData('text/plain')
        const blocks = parseClipboard(html, text)

        if (blocks.length === 0) return

        // One block's worth is an insertion into this line, not a new block.
        if (blocks.length === 1) {
          const only = blocks[0]
          if (only.html) document.execCommand('insertHTML', false, only.html)
          else document.execCommand('insertText', false, only.text)
          const el = ref.current
          if (el) {
            const plain = stripInvisible(el.textContent ?? '')
            const clean = sanitizeInline(el.innerHTML)
            onChange(plain, hasFormatting(clean, plain) ? clean : undefined)
          }
          return
        }

        // More than that is structure, and belongs in blocks of its own.
        if (onPasteBlocks?.(blocks)) return
        document.execCommand('insertText', false, blocks.map((b) => b.text).join('\n'))
      }}
    />
  )
}
