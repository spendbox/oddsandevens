'use client'

import { useSyncExternalStore } from 'react'

/**
 * How much of the window the on-screen keyboard is covering.
 *
 * ## Why this is not a CSS problem
 *
 * On a phone, opening the keyboard does not make the page shorter. The layout
 * viewport stays the size it was and the keyboard is drawn over the bottom of
 * it, so anything pinned to `bottom: 0` — the box you write a note in, most of
 * all — is underneath the keys, invisible, at exactly the moment somebody is
 * typing into it. `100dvh` does not help: it is the same viewport.
 *
 * The visual viewport is the part that is actually visible, and it does shrink.
 * The difference between the two is the number this returns, and lifting a
 * sheet by that many pixels puts it back above the keys.
 *
 * ## Why `useSyncExternalStore`
 *
 * Because this is a value that lives outside React and changes without React
 * being told: it is the pattern this codebase uses for the theme and the folds,
 * and it is what keeps the server render (nothing, always zero) from
 * disagreeing with the first client render.
 */

function subscribe(onChange: () => void): () => void {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport
  if (!viewport) return () => {}
  viewport.addEventListener('resize', onChange)
  viewport.addEventListener('scroll', onChange)
  return () => {
    viewport.removeEventListener('resize', onChange)
    viewport.removeEventListener('scroll', onChange)
  }
}

function read(): number {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport
  if (!viewport) return 0
  /*
    Rounded, and never negative.

    The two viewports differ by a fraction of a pixel constantly — a rubber-band
    scroll, a pinch, the address bar sliding — and an unrounded value would be a
    new number on every frame, which through useSyncExternalStore is a render on
    every frame. Below a few pixels there is no keyboard, only arithmetic.
  */
  const covered = window.innerHeight - viewport.height - viewport.offsetTop
  return covered > 24 ? Math.round(covered) : 0
}

/** Zero on a desktop, and on the server. */
const none = () => 0

export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, read, none)
}
