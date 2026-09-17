'use client'

import { stripInvisible } from '@/lib/rich-text'
import { shouldCapitalise } from '@/lib/smart-typing'

/**
 * Caret arithmetic, and the one correction that has to happen per keystroke.
 *
 * Everything else the writing page does to a line happens when the caret
 * leaves it — see lib/beautify.ts, and the reason there. Capitalising the
 * first letter of a sentence is the exception, because a capital that arrives
 * a paragraph later is not a capital anybody wanted.
 */

/** The text of a line before the caret, counted across its text nodes. */
export function textBeforeCaret(line: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return ''
  const range = selection.getRangeAt(0)
  if (!line.contains(range.startContainer)) return ''
  const measure = range.cloneRange()
  measure.selectNodeContents(line)
  measure.setEnd(range.startContainer, range.startOffset)
  return measure.toString()
}

/**
 * Binds the one per-keystroke correction to an editable element.
 *
 * As a native `beforeinput` listener, never through React's `onBeforeInput`:
 * React's synthetic version is a polyfill over older events and does not
 * reliably carry `inputType` or `data`, which are the two fields this needs to
 * tell a typed character from a paste or a composition.
 *
 * The correction replaces the keystroke rather than rewriting the text after
 * it, which is what keeps the browser's own undo intact — and it is what makes
 * a single Backspace put the small letter back, because as far as the browser
 * is concerned the capital is simply the character that was typed. An editor
 * that cannot be told "no" is one people switch off.
 */
export function bindSmartTyping(
  host: HTMLElement,
  lineFor: () => HTMLElement | null,
  report: () => void,
): () => void {
  /** The last capital this put in, so one Backspace can take it back out. */
  let corrected: { at: number; from: string; to: string } | null = null

  const onBeforeInput = (event: InputEvent) => {
    if (event.inputType !== 'insertText' || !event.data) {
      if (event.inputType !== 'deleteContentBackward') corrected = null
      return
    }
    const typed = event.data
    if (typed.length !== 1 || !/[a-z]/.test(typed)) {
      corrected = null
      return
    }
    const line = lineFor()
    if (!line) return
    const before = stripInvisible(textBeforeCaret(line))
    if (!shouldCapitalise(before, typed)) {
      corrected = null
      return
    }
    event.preventDefault()
    const upper = typed.toUpperCase()
    document.execCommand('insertText', false, upper)
    corrected = { at: before.length, from: typed, to: upper }
    report()
  }

  /*
    Backspace straight after an automatic capital puts the small letter back
    instead of deleting the character.

    This is the promise the whole idea rests on: an editor that changes what
    you typed has to be tellable "no, I meant that", in one keystroke, without
    anybody having to work out what it did. Anything else and people switch it
    off.
  */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Backspace') {
      corrected = null
      return
    }
    const correction = corrected
    if (!correction) return
    const line = lineFor()
    if (!line) return
    const before = stripInvisible(textBeforeCaret(line))
    if (before.length !== correction.at + correction.to.length) {
      corrected = null
      return
    }
    event.preventDefault()
    corrected = null
    document.execCommand('delete')
    document.execCommand('insertText', false, correction.from)
    report()
  }

  host.addEventListener('beforeinput', onBeforeInput)
  host.addEventListener('keydown', onKeyDown)
  return () => {
    host.removeEventListener('beforeinput', onBeforeInput)
    host.removeEventListener('keydown', onKeyDown)
  }
}
