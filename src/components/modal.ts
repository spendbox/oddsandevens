'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * What it means for something to be a modal in this app.
 *
 * Three things, and every one of them was a bug before this file existed.
 *
 * ## The page behind it does not scroll
 *
 * A sheet is `fixed`, so the document behind it is still scrollable — and on
 * a phone, focusing a field inside one makes the browser scroll *something*
 * to reveal it. What it scrolls is the page underneath, which slides about
 * behind a box that does not move, and the two together look like a
 * rendering fault. Locking the body while a modal is up is the whole fix,
 * and the scroll position is put back afterwards because `overflow: hidden`
 * on the body loses it on some browsers.
 *
 * ## Nothing behind it can be pressed
 *
 * An overlay covers the page, which is enough for everything drawn inside
 * the app — but not for the recorder, which is a portal on `document.body`
 * and therefore painted after it. It used to sit on top of every sheet in
 * the app: a black button over a dialog, doing something other than what it
 * looked like. Anything pinned to a corner asks `useModalIsOpen` and gets
 * out of the way.
 *
 * ## A press outside closes it, and does nothing else
 *
 * This is the one that kept catching people out. `useDismiss` closes on
 * **pointerdown**, which is right for a dropdown — the trigger has to be
 * able to toggle it — and wrong for a modal: the panel is gone before the
 * finger lifts, so the `click` that follows lands on whatever is now under
 * it. Tapping the dark area to dismiss a sheet was pressing a note row, or
 * putting a caret in the page behind. A modal's overlay is a real element
 * covering the whole screen, so its own `onClick` is all the dismissal it
 * needs — and a click fires after the finger lifts, on the overlay, and
 * goes nowhere else.
 *
 * So: modals use this. Menus and popovers, which have no overlay and a
 * trigger that must toggle, go on using `useDismiss`.
 */

let open = 0
const listeners = new Set<() => void>()

function changed() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const isOpen = () => open > 0
const onServer = () => false

/** Whether anything modal is on screen, for the things pinned to a corner. */
export function useModalIsOpen(): boolean {
  return useSyncExternalStore(subscribe, isOpen, onServer)
}

/**
 * Registers a modal for as long as it is mounted.
 *
 * Counted rather than a flag, because a sheet can open a confirmation over
 * itself and the first one closing must not unlock the page under the
 * second.
 */
export function useModal(
  onClose: () => void,
  /**
   * Whether it is actually on screen.
   *
   * Brainstorm stays mounted while it is put down — that is what keeps the
   * request and everything typed into it alive — and draws nothing. A
   * component that is mounted and invisible must not be holding the page
   * locked or hiding the recorder, so it says so rather than being split
   * in two to satisfy the rule that hooks are not conditional.
   */
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    open += 1
    changed()
    const body = document.body
    const was = { overflow: body.style.overflow, top: body.style.top, position: body.style.position }
    const scrolled = window.scrollY
    if (open === 1) {
      body.style.overflow = 'hidden'
    }
    return () => {
      open -= 1
      changed()
      if (open === 0) {
        body.style.overflow = was.overflow
        body.style.top = was.top
        body.style.position = was.position
        // Some browsers drop the scroll position when the body stops
        // scrolling. Putting it back is cheaper than noticing later.
        window.scrollTo(0, scrolled)
      }
    }
    // The callback is a separate effect so that a caller passing a fresh
    // function every render does not relock the page underneath.
  }, [active])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, active])
}
