'use client'

import { useSyncExternalStore } from 'react'

/**
 * What was being written when the box was closed.
 *
 * ## Why this exists
 *
 * The box that makes a note is a pop-up, and a pop-up can be closed by
 * every accident a phone has: the back gesture, a press that landed a
 * little outside, the browser being switched away from. Losing three lines
 * that way is the single worst thing this app can do, and "do not do that
 * then" is not a design.
 *
 * So closing the box keeps what was in it, the bar at the bottom says there
 * is a draft, and pressing it opens the box again with the words still
 * there. It is cleared the moment the note is actually saved — a draft that
 * outlives the thing it became is a second copy nobody asked for.
 *
 * ## Why localStorage and not IndexedDB
 *
 * IndexedDB is the store for notes, and this is not a note yet. It is a few
 * hundred characters that must survive a reload and must never be listed,
 * searched, synced or counted. localStorage is exactly that shape, and it
 * is synchronous, which matters here: the box is closing.
 */

const KEY = 'pad-draft'

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

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Blocked site data. A draft is a kindness, not a promise made twice.
    return ''
  }
}

const onServer = () => ''

/** Keeps what is in the box. An empty draft is no draft. */
export function keepDraft(text: string): void {
  const trimmed = text.trim()
  try {
    if (trimmed) localStorage.setItem(KEY, text)
    else localStorage.removeItem(KEY)
  } catch {
    // It costs the draft, not the note: the note is saved by saving it.
  }
  for (const listener of listeners) listener()
}

/** Thrown away once it has become a note, or when somebody says so. */
export function dropDraft(): void {
  keepDraft('')
}

/** What is waiting, for the bar that offers to carry on with it. */
export function useDraft(): string {
  return useSyncExternalStore(subscribe, read, onServer)
}

/** Read once, without subscribing — what the box opens with. */
export function currentDraft(): string {
  return read()
}

/**
 * The first few words of a draft, for the bar.
 *
 * One line, because the bar is one line: a draft four paragraphs long
 * shown in full would push the writing button off the screen it is meant
 * to be reachable from.
 */
export function draftLabel(text: string, chars = 48): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > chars ? `${one.slice(0, chars).trimEnd()}…` : one
}
