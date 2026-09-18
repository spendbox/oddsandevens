'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The suggestions somebody has already said no to.
 *
 * ## Why this is a list of noes and not a change to the note
 *
 * A box in the Actions tab is a box somebody drew, and getting rid of it means
 * taking that line out of their note. A *suggestion* is this app reading their
 * prose and guessing — "speak to Sam about the lease" might be a task or might
 * be a description of something that already happened. Deleting it must not
 * touch a word of what they wrote, or a swipe on a screen of guesses would be
 * a way to lose writing.
 *
 * So no becomes a note kept here: that line, in that note, is not a task. It
 * stops being offered and nothing else changes.
 *
 * ## Why it stays on the device
 *
 * It is an opinion about what this app's guessing got wrong, not a fact about
 * the notes — so it goes beside the theme and the reader's name rather than
 * into a note or onto a server. The worst a second device can do is offer a
 * suggestion again, which is the same thing it would do for a line written
 * today.
 *
 * `useSyncExternalStore`, with the raw string as the snapshot: a freshly
 * parsed Set is a new object every time, and returning one from `getSnapshot`
 * is an infinite render loop. The same rule the theme and the folds follow.
 */

const KEY = 'pad-dismissed'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function raw(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Private mode, or storage refused. Every suggestion is simply offered.
    return ''
  }
}

const none = () => ''

/** How one line in one note is named here. */
export function dismissKey(docId: string, blockId: string): string {
  return `${docId}:${blockId}`
}

function parse(text: string): Set<string> {
  if (!text) return new Set()
  try {
    const value: unknown = JSON.parse(text)
    return new Set(Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function write(keys: Set<string>) {
  try {
    if (keys.size) localStorage.setItem(KEY, JSON.stringify([...keys]))
    else localStorage.removeItem(KEY)
  } catch {
    // Nothing to do: the suggestion comes back on the next load.
  }
  for (const listener of listeners) listener()
}

/**
 * Forgets every no, and tells everything reading them.
 *
 * Used when the device changes hands: the keys are note ids belonging to
 * somebody else's notes, so they mean nothing to the account arriving — and
 * a list of another person's note ids is not a thing to leave lying in a
 * browser either.
 */
export function forgetDismissed(): void {
  write(new Set())
}

export function useDismissed(): {
  /** Whether this line has already been turned down. */
  has: (docId: string, blockId: string) => boolean
  /** Turns down one line, or a whole note's worth in one go. */
  add: (keys: string[]) => void
  /** Takes the no back, which is what an undo does with a swiped suggestion. */
  remove: (keys: string[]) => void
} {
  const text = useSyncExternalStore(subscribe, raw, none)
  const has = useCallback(
    (docId: string, blockId: string) => parse(text).has(dismissKey(docId, blockId)),
    [text],
  )
  const add = useCallback((keys: string[]) => {
    const next = parse(raw())
    for (const key of keys) next.add(key)
    write(next)
  }, [])
  const remove = useCallback((keys: string[]) => {
    const next = parse(raw())
    for (const key of keys) next.delete(key)
    write(next)
  }, [])
  return { has, add, remove }
}
