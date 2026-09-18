'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The one thing this app stores about the person rather than about their
 * notes: what they would like to be called.
 *
 * It lives in localStorage beside the theme, not in a note and not on the
 * server. It is a preference about this browser's chrome — the same kind of
 * thing as light or dark — and sending it anywhere would mean this app held a
 * name it never needed to hold.
 *
 * `useSyncExternalStore` for the same reason the theme uses it: a value that
 * lives outside React, that the server cannot know, and that must not make the
 * first client render disagree with the server's HTML. The server snapshot is
 * the empty string, which renders as "Hi there".
 */

const KEY = 'pad-name'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab of the same app is another copy of this store.
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
    // Private mode, or storage refused. A name is a nicety; nothing fails.
    return ''
  }
}

const none = () => ''

/**
 * Forgets the name, and tells everything reading it.
 *
 * Removing the key on its own is not enough: this store's snapshot is read
 * through `useSyncExternalStore`, the `storage` event does not fire in the
 * tab that made the change, and a greeting nobody was told about goes on
 * saying "Hi, Ada" to the person who has just signed in instead.
 */
export function forgetName(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
  for (const listener of listeners) listener()
}

export function useName(): { name: string; set: (name: string) => void } {
  const name = useSyncExternalStore(subscribe, read, none)
  const set = useCallback((next: string) => {
    try {
      const trimmed = next.trim()
      if (trimmed) localStorage.setItem(KEY, trimmed)
      else localStorage.removeItem(KEY)
    } catch {
      // Nothing to do: the name simply will not survive a reload here.
    }
    for (const listener of listeners) listener()
  }, [])
  return { name, set }
}
